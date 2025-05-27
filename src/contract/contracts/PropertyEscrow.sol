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
    address public seller;
    address public buyer;
    address public serviceWallet;
    uint256 public escrowAmount;

    uint256 public constant FINAL_APPROVAL_PERIOD = 48 hours;
    uint256 public constant DISPUTE_RESOLUTION_PERIOD = 7 days;
    uint256 public constant SERVICE_FEE_PERCENTAGE = 200; // 2% = 200 basis points out of 10000

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

    function setConditions(bytes32[] memory _conditionIds)
        external
        onlyBuyer
        inState(State.AWAITING_CONDITION_SETUP)
    {
        require(_conditionIds.length > 0, "At least one condition must be set.");
        require(requiredConditionIds.length == 0, "Conditions already set.");

        for (uint i = 0; i < _conditionIds.length; i++) {
            require(_conditionIds[i] != bytes32(0), "Condition ID cannot be zero");
            requiredConditionIds.push(_conditionIds[i]);
            conditionsFulfilledByBuyer[_conditionIds[i]] = false;
        }
        currentState = State.AWAITING_DEPOSIT;
        emit ConditionsSet(_conditionIds);
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

    function buyerMarksConditionFulfilled(bytes32 _conditionId)
        external
        onlyBuyer
        inState(State.AWAITING_FULFILLMENT)
    {
        require(isConditionRequired(_conditionId), "Condition ID not part of this escrow.");
        require(!conditionsFulfilledByBuyer[_conditionId], "Condition already marked as fulfilled.");

        conditionsFulfilledByBuyer[_conditionId] = true;
        emit ConditionMarkedFulfilled(msg.sender, _conditionId);

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

        currentState = State.IN_FINAL_APPROVAL;
        finalApprovalDeadline = block.timestamp + FINAL_APPROVAL_PERIOD;
        emit FinalApprovalPeriodStarted(finalApprovalDeadline);
    }

    /**
     * @dev Buyer raises a dispute by indicating a previously fulfilled condition is no longer met.
     * This can only be done during the IN_FINAL_APPROVAL state.
     */
    function raiseDisputeByUnfulfillingCondition(bytes32 _conditionId)
        external
        onlyBuyer
        inState(State.IN_FINAL_APPROVAL)
    {
        require(isConditionRequired(_conditionId), "Condition ID not part of this escrow.");
        require(conditionsFulfilledByBuyer[_conditionId], "Condition was not marked fulfilled to unfulfill.");
        require(block.timestamp < finalApprovalDeadline, "Final approval period has ended.");

        conditionsFulfilledByBuyer[_conditionId] = false; // Mark as unfulfilled
        currentState = State.IN_DISPUTE;
        disputeResolutionDeadline = block.timestamp + DISPUTE_RESOLUTION_PERIOD;
        emit DisputeRaised(msg.sender, _conditionId, disputeResolutionDeadline);
    }

    /**
     * @dev During a dispute, the buyer can re-mark a condition as fulfilled.
     * If all conditions become met again, the dispute is resolved, and the process
     * moves back to READY_FOR_FINAL_APPROVAL to restart the final approval period.
     */
    function buyerReMarksConditionFulfilledInDispute(bytes32 _conditionId)
        external
        onlyBuyer
        inState(State.IN_DISPUTE)
    {
        require(isConditionRequired(_conditionId), "Condition ID not part of this escrow.");
        require(!conditionsFulfilledByBuyer[_conditionId], "Condition already marked as fulfilled.");
        require(block.timestamp < disputeResolutionDeadline, "Dispute resolution period has ended.");


        conditionsFulfilledByBuyer[_conditionId] = true;
        emit DisputeConditionReFulfilled(msg.sender, _conditionId);

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
        require(block.timestamp >= finalApprovalDeadline, "Final approval period has not ended yet.");
        // Implicitly, if we are in IN_FINAL_APPROVAL and deadline passed, no dispute was raised.
        require(fundsDeposited, "Funds not deposited.");
        require(areAllConditionsMet(), "Not all conditions are met."); // Should be true if in this state path

        _releaseFundsToSeller();
    }

    function _releaseFundsToSeller() internal {
        currentState = State.COMPLETED;
        uint256 balance = address(this).balance;
        require(balance >= escrowAmount, "Insufficient balance for release");
        
        uint256 serviceFee = (escrowAmount * SERVICE_FEE_PERCENTAGE) / 10000;
        uint256 remainingAmount = escrowAmount - serviceFee;
        
        payable(seller).transfer(remainingAmount);
        payable(serviceWallet).transfer(serviceFee);
        emit FundsReleasedToSeller(seller, remainingAmount);
        emit ServiceFeeTransferred(serviceWallet, serviceFee);

        if (address(this).balance > 0) {
            payable(buyer).transfer(address(this).balance); // Return any excess
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
            canCancel = true;
            currentState = State.CANCELLED; // Set state before transfer
            if (fundsDeposited) {
                uint256 refundAmount = address(this).balance;
                if (refundAmount > 0) {
                    payable(buyer).transfer(refundAmount);
                }
                emit EscrowCancelledBySystem("Dispute resolution deadline passed", buyer, refundAmount);
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
                canCancel = true;
                currentState = State.CANCELLED; // Set state before transfer
                uint256 refundAmount = 0;
                if (fundsDeposited) {
                    refundAmount = address(this).balance;
                    if (refundAmount > 0) {
                        payable(buyer).transfer(refundAmount);
                    }
                }
                emit EscrowCancelledByUser(msg.sender, buyer, refundAmount);
            }
        }
        
        require(canCancel, "Escrow: Conditions for cancellation not met.");
        require(currentState == State.CANCELLED, "Escrow: Failed to set state to CANCELLED."); // Sanity check
    }

    // --- View Functions ---

    function isConditionRequired(bytes32 _conditionId) internal view returns (bool) {
        for (uint i = 0; i < requiredConditionIds.length; i++) {
            if (requiredConditionIds[i] == _conditionId) {
                return true;
            }
        }
        return false;
    }

    function areAllConditionsMet() public view returns (bool) {
        if (currentState == State.AWAITING_CONDITION_SETUP || requiredConditionIds.length == 0) {
            return false; 
        }
        for (uint i = 0; i < requiredConditionIds.length; i++) {
            if (!conditionsFulfilledByBuyer[requiredConditionIds[i]]) {
                return false;
            }
        }
        return true;
    }

    function getUnfulfilledConditionIdsByBuyer() public view returns (bytes32[] memory) {
        uint unfulfilledCount = 0;
        for (uint i = 0; i < requiredConditionIds.length; i++) {
            if (!conditionsFulfilledByBuyer[requiredConditionIds[i]]) {
                unfulfilledCount++;
            }
        }
        bytes32[] memory unfulfilled = new bytes32[](unfulfilledCount);
        uint currentIndex = 0;
        for (uint i = 0; i < requiredConditionIds.length; i++) {
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
