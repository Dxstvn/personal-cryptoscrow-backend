// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title PropertyEscrowV3
 * @dev Manages escrow for property deals with buyer-defined conditions,
 * a final approval period, and deadline-driven dispute resolution.
 * Includes a 2% service fee that goes to the service wallet.
 */
contract PropertyEscrow is ReentrancyGuard {
    address public immutable seller;
    address public immutable buyer;
    address public immutable serviceWallet;
    uint256 public immutable escrowAmount;

    uint256 public constant FINAL_APPROVAL_PERIOD = 48 hours;
    uint256 public constant DISPUTE_RESOLUTION_PERIOD = 7 days;
    uint256 public constant SERVICE_FEE_PERCENTAGE = 200; // 2% = 200 basis points out of 10000
    uint256 private constant MIN_BLOCK_TIME = 1_000_000_000; // Minimum reasonable timestamp (Sept 2001)
    uint256 private constant MAX_FUTURE_TIME = 365 days; // Maximum reasonable future time

    enum State {
        AWAITING_CONDITION_SETUP,   // Initial: buyer needs to set conditions
        AWAITING_DEPOSIT,           // Conditions set, awaiting buyer funds
        AWAITING_FULFILLMENT,       // Funds deposited, buyer to confirm fulfillment of each condition
        READY_FOR_FINAL_APPROVAL,   // All conditions met by buyer, funds deposited, ready for 48hr review
        IN_FINAL_APPROVAL,          // 48hr review period active; buyer can raise dispute
        IN_DISPUTE,                 // Buyer raised a dispute; 7-day resolution window
        COMPLETED,                  // Funds released to seller
        CANCELLED                   // Escrow cancelled, funds (if any) returned to buyer
    }
    State public currentState;

    mapping(bytes32 => bool) public conditionsFulfilledByBuyer; // Tracks if buyer has marked a condition as fulfilled
    bytes32[] public requiredConditionIds;
    bool public fundsDeposited;

    uint256 public finalApprovalDeadline;       // Timestamp when the 48-hour approval period ends
    uint256 public disputeResolutionDeadline;   // Timestamp when the 7-day dispute resolution period ends

    // Events
    event EscrowCreated(address indexed seller, address indexed buyer, uint256 amount);
    event ConditionsSet(bytes32[] conditionIds);
    event FundsDeposited(address indexed depositor, uint256 amount);
    event ConditionMarkedFulfilled(address indexed buyer, bytes32 indexed conditionId);
    event DisputeRaised(address indexed buyer, bytes32 indexed conditionId, uint256 resolutionDeadline); // When buyer withdraws a condition's fulfillment
    event DisputeConditionReFulfilled(address indexed buyer, bytes32 indexed conditionId);
    event FinalApprovalPeriodStarted(uint256 deadline);
    event FundsReleasedToSeller(address indexed seller, uint256 amount);
    event ServiceFeeTransferred(address indexed serviceWallet, uint256 amount);
    event EscrowCancelledBySystem(string reason, address indexed refundee, uint256 refundAmount); // For deadline-based cancellations
    event EscrowCancelledByUser(address indexed canceller, address indexed refundee, uint256 refundAmount); // For mutual agreement cancellations


    modifier onlyBuyer() {
        require(msg.sender == buyer, "PropertyEscrow: Caller is not the buyer");
        _;
    }

    modifier buyerOrSeller() {
        require(msg.sender == buyer || msg.sender == seller, "PropertyEscrow: Caller is not buyer or seller");
        _;
    }

    modifier inState(State _state) {
        require(currentState == _state, "PropertyEscrow: Invalid state for this action");
        _;
    }

    constructor(address _seller, address _buyer, uint256 _escrowAmount, address _serviceWallet) {
        require(_seller != address(0), "Seller address cannot be zero");
        require(_buyer != address(0), "Buyer address cannot be zero");
        require(_escrowAmount > 0, "Escrow amount must be positive");
        require(_seller != _buyer, "Seller and buyer cannot be the same");
        require(_serviceWallet != address(0), "Service wallet address cannot be zero");

        seller = _seller;
        buyer = _buyer;
        escrowAmount = _escrowAmount;
        serviceWallet = _serviceWallet;
        currentState = State.AWAITING_CONDITION_SETUP;

        emit EscrowCreated(_seller, _buyer, _escrowAmount);
    }

    function setConditions(bytes32[] memory conditionIds)
        external
        onlyBuyer
        inState(State.AWAITING_CONDITION_SETUP)
    {
        require(conditionIds.length > 0, "At least one condition must be set.");
        require(requiredConditionIds.length == 0, "Conditions already set.");

        uint256 length = conditionIds.length;
        for (uint256 i = 0; i < length; i++) {
            require(conditionIds[i] != bytes32(0), "Condition ID cannot be zero");
            requiredConditionIds.push(conditionIds[i]);
            conditionsFulfilledByBuyer[conditionIds[i]] = false;
        }
        currentState = State.AWAITING_DEPOSIT;
        emit ConditionsSet(conditionIds);
    }

    function depositFunds()
        external
        payable
        onlyBuyer
        inState(State.AWAITING_DEPOSIT)
        nonReentrant
    {
        require(msg.value == escrowAmount, "Incorrect deposit amount");
        fundsDeposited = true;
        currentState = State.AWAITING_FULFILLMENT;
        emit FundsDeposited(msg.sender, msg.value);
    }

    function buyerMarksConditionFulfilled(bytes32 conditionId)
        external
        onlyBuyer
        inState(State.AWAITING_FULFILLMENT)
    {
        require(isConditionRequired(conditionId), "Condition ID not part of this escrow.");
        require(!conditionsFulfilledByBuyer[conditionId], "Condition already marked as fulfilled.");

        conditionsFulfilledByBuyer[conditionId] = true;
        emit ConditionMarkedFulfilled(msg.sender, conditionId);

        if (areAllConditionsMet()) {
            currentState = State.READY_FOR_FINAL_APPROVAL;
        }
    }

    function startFinalApprovalPeriod()
        external
        buyerOrSeller // Either party can trigger this once ready
        inState(State.READY_FOR_FINAL_APPROVAL)
    {
        require(fundsDeposited, "Funds not deposited.");
        require(areAllConditionsMet(), "Not all conditions met.");
        require(block.timestamp >= MIN_BLOCK_TIME, "Invalid block timestamp");
        require(block.timestamp + FINAL_APPROVAL_PERIOD <= block.timestamp + MAX_FUTURE_TIME, "Deadline too far in future");

        currentState = State.IN_FINAL_APPROVAL;
        finalApprovalDeadline = block.timestamp + FINAL_APPROVAL_PERIOD;
        emit FinalApprovalPeriodStarted(finalApprovalDeadline);
    }

    /**
     * @dev Buyer raises a dispute by indicating a previously fulfilled condition is no longer met.
     * This can only be done during the IN_FINAL_APPROVAL state.
     */
    function raiseDisputeByUnfulfillingCondition(bytes32 conditionId)
        external
        onlyBuyer
        inState(State.IN_FINAL_APPROVAL)
    {
        require(isConditionRequired(conditionId), "Condition ID not part of this escrow.");
        require(conditionsFulfilledByBuyer[conditionId], "Condition was not marked fulfilled to unfulfill.");
        require(block.timestamp >= MIN_BLOCK_TIME, "Invalid block timestamp");
        require(block.timestamp < finalApprovalDeadline, "Final approval period has ended.");

        conditionsFulfilledByBuyer[conditionId] = false; // Mark as unfulfilled
        currentState = State.IN_DISPUTE;
        disputeResolutionDeadline = block.timestamp + DISPUTE_RESOLUTION_PERIOD;
        emit DisputeRaised(msg.sender, conditionId, disputeResolutionDeadline);
    }

    /**
     * @dev During a dispute, the buyer can re-mark a condition as fulfilled.
     * If all conditions become met again, the dispute is resolved, and the process
     * moves back to READY_FOR_FINAL_APPROVAL to restart the final approval period.
     */
    function buyerReMarksConditionFulfilledInDispute(bytes32 conditionId)
        external
        onlyBuyer
        inState(State.IN_DISPUTE)
    {
        require(isConditionRequired(conditionId), "Condition ID not part of this escrow.");
        require(!conditionsFulfilledByBuyer[conditionId], "Condition already marked as fulfilled.");
        require(block.timestamp >= MIN_BLOCK_TIME, "Invalid block timestamp");
        require(block.timestamp < disputeResolutionDeadline, "Dispute resolution period has ended.");


        conditionsFulfilledByBuyer[conditionId] = true;
        emit DisputeConditionReFulfilled(msg.sender, conditionId);

        if (areAllConditionsMet()) {
            currentState = State.READY_FOR_FINAL_APPROVAL; // Dispute resolved by buyer action
            // Final approval period will restart when startFinalApprovalPeriod() is called.
        }
    }

    /**
     * @dev Releases funds to the seller if the final approval period has passed
     * without any disputes being raised. Can be called by anyone to trigger the check.
     */
    function releaseFundsAfterApprovalPeriod()
        external
        nonReentrant
        inState(State.IN_FINAL_APPROVAL)
    {
        require(block.timestamp >= MIN_BLOCK_TIME, "Invalid block timestamp");
        require(block.timestamp >= finalApprovalDeadline, "Final approval period has not ended yet.");
        // Implicitly, if we are in IN_FINAL_APPROVAL and deadline passed, no dispute was raised.
        require(fundsDeposited, "Funds not deposited.");
        require(areAllConditionsMet(), "Not all conditions are met."); // Should be true if in this state path

        _releaseFundsToSeller();
    }

    function _releaseFundsToSeller() internal {
        // Validate recipients are non-zero and as expected (immutable values)
        require(seller != address(0), "Invalid seller address");
        require(serviceWallet != address(0), "Invalid service wallet address");
        require(buyer != address(0), "Invalid buyer address");
        
        currentState = State.COMPLETED;
        uint256 balance = address(this).balance;
        require(balance >= escrowAmount, "Insufficient balance for release");
        
        uint256 serviceFee = (escrowAmount * SERVICE_FEE_PERCENTAGE) / 10000;
        uint256 remainingAmount = escrowAmount - serviceFee;
        
        // Emit events BEFORE external calls (CEI pattern)
        emit FundsReleasedToSeller(seller, remainingAmount);
        emit ServiceFeeTransferred(serviceWallet, serviceFee);
        
        // External calls after state changes and events
        (bool success1, ) = payable(seller).call{value: remainingAmount}("");
        require(success1, "Transfer to seller failed");
        
        (bool success2, ) = payable(serviceWallet).call{value: serviceFee}("");
        require(success2, "Transfer to service wallet failed");

        // Return any excess to buyer
        uint256 remainingBalance = address(this).balance;
        if (remainingBalance > 0) {
            (bool success3, ) = payable(buyer).call{value: remainingBalance}("");
            require(success3, "Transfer of excess to buyer failed");
        }
    }

    /**
     * @dev Cancels the escrow and refunds the buyer.
     * Can be called by buyer/seller for mutual cancellation in early/mid stages.
     * Can be called by anyone after the dispute resolution deadline if the dispute was not resolved.
     */
    function cancelEscrowAndRefundBuyer() external nonReentrant {
        bool canCancel = false;

        if (currentState == State.IN_DISPUTE && block.timestamp >= disputeResolutionDeadline) {
            // Dispute period ended, and dispute not resolved by buyer re-fulfilling conditions.
            // Funds are returned to buyer automatically.
            require(buyer != address(0), "Invalid buyer address");
            canCancel = true;
            currentState = State.CANCELLED; // Set state before transfer
            if (fundsDeposited) {
                uint256 refundAmount = address(this).balance;
                // Emit event BEFORE external call (CEI pattern)
                emit EscrowCancelledBySystem("Dispute resolution deadline passed", buyer, refundAmount);
                if (refundAmount > 0) {
                    (bool success, ) = payable(buyer).call{value: refundAmount}("");
                    require(success, "Refund to buyer failed");
                }
            } else {
                emit EscrowCancelledBySystem("Dispute resolution deadline passed, no funds to refund", buyer, 0);
            }
        } else if (msg.sender == buyer || msg.sender == seller) {
            // Mutual cancellation conditions
            if (currentState == State.AWAITING_CONDITION_SETUP ||
                currentState == State.AWAITING_DEPOSIT ||
                currentState == State.AWAITING_FULFILLMENT ||
                (currentState == State.IN_FINAL_APPROVAL && block.timestamp < finalApprovalDeadline) || // Can cancel before approval deadline
                (currentState == State.IN_DISPUTE && block.timestamp < disputeResolutionDeadline) // Can cancel during dispute resolution period
            ) {
                require(buyer != address(0), "Invalid buyer address");
                canCancel = true;
                currentState = State.CANCELLED; // Set state before transfer
                uint256 refundAmount = 0;
                if (fundsDeposited) {
                    refundAmount = address(this).balance;
                }
                // Emit event BEFORE external call (CEI pattern)
                emit EscrowCancelledByUser(msg.sender, buyer, refundAmount);
                if (fundsDeposited && refundAmount > 0) {
                    (bool success, ) = payable(buyer).call{value: refundAmount}("");
                    require(success, "Refund to buyer failed");
                }
            }
        }
        
        require(canCancel, "Escrow: Conditions for cancellation not met.");
        require(currentState == State.CANCELLED, "Escrow: Failed to set state to CANCELLED."); // Sanity check
    }

    // --- View Functions ---

    function isConditionRequired(bytes32 conditionId) internal view returns (bool) {
        uint256 length = requiredConditionIds.length;
        for (uint256 i = 0; i < length; i++) {
            if (requiredConditionIds[i] == conditionId) {
                return true;
            }
        }
        return false;
    }

    function areAllConditionsMet() public view returns (bool) {
        if (currentState == State.AWAITING_CONDITION_SETUP || requiredConditionIds.length == 0) {
            return false; 
        }
        uint256 length = requiredConditionIds.length;
        for (uint256 i = 0; i < length; i++) {
            if (!conditionsFulfilledByBuyer[requiredConditionIds[i]]) {
                return false;
            }
        }
        return true;
    }

    function getUnfulfilledConditionIdsByBuyer() public view returns (bytes32[] memory) {
        uint256 length = requiredConditionIds.length;
        uint256 unfulfilledCount = 0;
        for (uint256 i = 0; i < length; i++) {
            if (!conditionsFulfilledByBuyer[requiredConditionIds[i]]) {
                unfulfilledCount++;
            }
        }
        bytes32[] memory unfulfilled = new bytes32[](unfulfilledCount);
        uint256 currentIndex = 0;
        for (uint256 i = 0; i < length; i++) {
            if (!conditionsFulfilledByBuyer[requiredConditionIds[i]]) {
                unfulfilled[currentIndex] = requiredConditionIds[i];
                currentIndex++;
            }
        }
        return unfulfilled;
    }

    function getRequiredConditionIds() external view returns (bytes32[] memory) {
        return requiredConditionIds;
    }

    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }

    function getContractState() external view returns (State) {
        return currentState;
    }

    function getServiceWallet() external view returns (address) {
        return serviceWallet;
    }

    function getServiceFeePercentage() external pure returns (uint256) {
        return SERVICE_FEE_PERCENTAGE;
    }
}
