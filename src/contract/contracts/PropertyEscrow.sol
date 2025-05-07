// SPDX-License-Identifier: MIT
// Use a version compatible with OpenZeppelin dependencies
pragma solidity ^0.8.20; // <--- UPDATED VERSION

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol"; // Optional: if you want an owner for emergency functions

/**
 * @title PropertyEscrow
 * @dev A smart contract to manage escrow for property transactions with a review and dispute period.
 */
contract PropertyEscrow is ReentrancyGuard {
    address public seller;
    address public buyer;
    uint256 public escrowAmount;

    uint256 public constant FINAL_APPROVAL_PERIOD = 48 hours; // 48 hours
    uint256 public constant DISPUTE_RESOLUTION_PERIOD = 7 days; // 7 days

    enum State {
        AWAITING_CONDITION_SETUP, // Initial: buyer needs to set conditions
        AWAITING_DEPOSIT,         // Conditions set, awaiting buyer funds
        AWAITING_FULFILLMENT,     // Funds deposited, conditions set, awaiting buyer to confirm fulfillment of each
        READY_FOR_FINAL_APPROVAL, // All conditions met by buyer, funds deposited, ready to start 48hr review
        IN_FINAL_APPROVAL,        // 48hr review period active
        IN_DISPUTE,               // Buyer raised a dispute during final approval
        COMPLETED,                // Funds released to seller
        CANCELLED                 // Escrow cancelled
    }
    State public currentState;

    mapping(bytes32 => bool) public conditionsFulfilled;
    bytes32[] public requiredConditionIds;
    bool public fundsDeposited;

    uint256 public finalApprovalDeadline; // Timestamp when the 48-hour approval period ends
    uint256 public disputeResolutionDeadline; // Timestamp when the 7-day dispute resolution period ends

    mapping(address => bool) public hasApprovedFinalRelease; // Tracks if buyer/seller explicitly approved during final approval

    event EscrowCreated(address indexed seller, address indexed buyer, uint256 amount);
    event ConditionsSetByBuyer(bytes32[] conditionIds);
    event FundsDeposited(address indexed depositor, uint256 amount);
    event ConditionFulfilled(address indexed fulfiller, bytes32 indexed conditionId);
    event ConditionFulfilledReversed(address indexed buyer, bytes32 indexed conditionId);
    event FinalApprovalPeriodStarted(uint256 deadline);
    event DisputeRaised(address indexed buyer, bytes32[] currentlyUnfulfilledConditions, uint256 resolutionDeadline);
    event ReleaseConfirmed(address indexed confirmer);
    event FundsReleasedToSeller(address indexed seller, uint256 amount);
    event EscrowCancelled(address indexed canceller, address indexed refundee, uint256 refundAmount);


    modifier onlyBuyer() {
        require(msg.sender == buyer, "PropertyEscrow: Caller is not the buyer");
        _;
    }

    modifier onlySeller() {
        require(msg.sender == seller, "PropertyEscrow: Caller is not the seller");
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

    constructor(address _seller, address _buyer, uint256 _escrowAmount) {
        require(_seller != address(0), "Seller address cannot be zero");
        require(_buyer != address(0), "Buyer address cannot be zero");
        require(_escrowAmount > 0, "Escrow amount must be positive");
        require(_seller != _buyer, "Seller and buyer cannot be the same");

        seller = _seller;
        buyer = _buyer;
        escrowAmount = _escrowAmount;
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
            conditionsFulfilled[_conditionIds[i]] = false;
        }
        currentState = State.AWAITING_DEPOSIT;
        emit ConditionsSetByBuyer(_conditionIds);
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

    function fulfillCondition(bytes32 _conditionId)
        external
        onlyBuyer
        inState(State.AWAITING_FULFILLMENT)
    {
        require(isConditionRequired(_conditionId), "Condition ID not part of this escrow.");
        require(!conditionsFulfilled[_conditionId], "Condition already fulfilled.");

        conditionsFulfilled[_conditionId] = true;
        emit ConditionFulfilled(msg.sender, _conditionId);

        if (areAllBuyerConditionsMet()) {
            currentState = State.READY_FOR_FINAL_APPROVAL;
        }
    }

    function startFinalApprovalPeriod()
        external
        buyerOrSeller
        inState(State.READY_FOR_FINAL_APPROVAL)
    {
        require(fundsDeposited, "Funds not deposited.");
        require(areAllBuyerConditionsMet(), "Not all conditions met.");

        currentState = State.IN_FINAL_APPROVAL;
        finalApprovalDeadline = block.timestamp + FINAL_APPROVAL_PERIOD;
        // Reset previous final approvals for this new period
        hasApprovedFinalRelease[buyer] = false;
        hasApprovedFinalRelease[seller] = false;
        emit FinalApprovalPeriodStarted(finalApprovalDeadline);
    }

    function buyerWithdrawConditionApproval(bytes32 _conditionId)
        external
        onlyBuyer
        inState(State.IN_FINAL_APPROVAL) // Can only withdraw if in final approval
    {
        require(isConditionRequired(_conditionId), "Condition ID not part of this escrow.");
        require(conditionsFulfilled[_conditionId], "Condition not currently marked as fulfilled.");

        conditionsFulfilled[_conditionId] = false; // Revert fulfillment
        currentState = State.IN_DISPUTE;
        disputeResolutionDeadline = block.timestamp + DISPUTE_RESOLUTION_PERIOD;
        // Reset final approvals as the deal is now disputed
        hasApprovedFinalRelease[buyer] = false;
        hasApprovedFinalRelease[seller] = false;

        emit ConditionFulfilledReversed(msg.sender, _conditionId);
        emit DisputeRaised(msg.sender, getUnfulfilledConditionIds(), disputeResolutionDeadline);
    }

    // Buyer can re-fulfill a condition if they previously withdrew approval
    function buyerReFulfillCondition(bytes32 _conditionId)
        external
        onlyBuyer
        inState(State.IN_DISPUTE)
    {
        require(isConditionRequired(_conditionId), "Condition ID not part of this escrow.");
        require(!conditionsFulfilled[_conditionId], "Condition already fulfilled or not disputed.");

        conditionsFulfilled[_conditionId] = true;
        emit ConditionFulfilled(msg.sender, _conditionId);

        if (areAllBuyerConditionsMet()) {
            // Dispute resolved by buyer re-fulfilling all conditions
            // Go back to final approval period, potentially with a reset timer or straight to release if both parties had already approved.
            // For simplicity here, we go back to READY_FOR_FINAL_APPROVAL to restart that phase.
            currentState = State.READY_FOR_FINAL_APPROVAL;
            // Consider if finalApprovalDeadline should be reset or if previous explicit approvals are still valid.
            // Resetting explicit approvals for safety.
            hasApprovedFinalRelease[buyer] = false;
            hasApprovedFinalRelease[seller] = false;
        }
    }


    function confirmAndReleaseFunds()
        external
        buyerOrSeller
        nonReentrant
    {
        require(currentState == State.IN_FINAL_APPROVAL || currentState == State.IN_DISPUTE, "Not in a state for final release confirmation.");
        require(fundsDeposited, "Funds not deposited.");
        require(areAllBuyerConditionsMet(), "Not all conditions are met.");

        bool canRelease = false;

        if (currentState == State.IN_FINAL_APPROVAL) {
            if (msg.sender == buyer) hasApprovedFinalRelease[buyer] = true;
            if (msg.sender == seller) hasApprovedFinalRelease[seller] = true;
            emit ReleaseConfirmed(msg.sender);

            // Release if both parties explicitly approved OR if the deadline has passed and no dispute.
            if (hasApprovedFinalRelease[buyer] && hasApprovedFinalRelease[seller]) {
                canRelease = true;
            } else if (block.timestamp >= finalApprovalDeadline) {
                canRelease = true; // Deadline passed, no dispute raised (implicit from state)
            }
        } else { // currentState == State.IN_DISPUTE
            // If in dispute, only an explicit agreement from both can release now, or seller re-fulfilling
            // This function handles explicit agreement. Re-fulfillment moves state out of IN_DISPUTE.
            if (msg.sender == buyer) hasApprovedFinalRelease[buyer] = true;
            if (msg.sender == seller) hasApprovedFinalRelease[seller] = true;
            emit ReleaseConfirmed(msg.sender);
            if (hasApprovedFinalRelease[buyer] && hasApprovedFinalRelease[seller]) {
                canRelease = true;
            }
        }

        if (canRelease) {
            _releaseFundsToSeller();
        }
    }

    function _releaseFundsToSeller() internal {
        currentState = State.COMPLETED;
        uint256 balance = address(this).balance;
        require(balance >= escrowAmount, "Insufficient balance for release"); // Sanity check
        payable(seller).transfer(escrowAmount); // Transfer only the escrowAmount
        emit FundsReleasedToSeller(seller, escrowAmount);

        // Handle any remaining dust if balance > escrowAmount (should ideally not happen with precise deposits)
        if (address(this).balance > 0) {
            payable(buyer).transfer(address(this).balance); // Return any overpayment or dust to buyer
        }
    }

    function cancelEscrow() external nonReentrant {
        require(msg.sender == buyer || msg.sender == seller, "Only buyer or seller can cancel.");
        require(currentState != State.COMPLETED && currentState != State.CANCELLED, "Escrow already finalized.");

        uint256 refundAmount = 0;

        // Specific cancellation logic for IN_DISPUTE after deadline
        if (currentState == State.IN_DISPUTE && msg.sender == buyer && block.timestamp >= disputeResolutionDeadline) {
            // Dispute period ended, buyer claims refund
        } else if (currentState == State.AWAITING_CONDITION_SETUP ||
                   currentState == State.AWAITING_DEPOSIT ||
                   currentState == State.AWAITING_FULFILLMENT ||
                   (currentState == State.IN_FINAL_APPROVAL && block.timestamp < finalApprovalDeadline) || // Can cancel before approval deadline if not disputed
                   (currentState == State.IN_DISPUTE && block.timestamp < disputeResolutionDeadline) // Can cancel during dispute if both agree (implicitly via off-chain, then one calls)
        ) {
            // Allow cancellation in these states
        }
         else {
            revert("Cannot cancel in current state or conditions not met for cancellation.");
        }

        currentState = State.CANCELLED;
        if (fundsDeposited) {
            refundAmount = address(this).balance;
            if (refundAmount > 0) {
                payable(buyer).transfer(refundAmount);
            }
        }
        emit EscrowCancelled(msg.sender, buyer, refundAmount);
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

    function areAllBuyerConditionsMet() public view returns (bool) {
        if (requiredConditionIds.length == 0 && currentState != State.AWAITING_CONDITION_SETUP) {
             // This case should ideally not be hit if setConditions requires >0 conditions.
            return true;
        }
        for (uint i = 0; i < requiredConditionIds.length; i++) {
            if (!conditionsFulfilled[requiredConditionIds[i]]) {
                return false;
            }
        }
        return true;
    }

    function getUnfulfilledConditionIds() public view returns (bytes32[] memory) {
        uint unfulfilledCount = 0;
        for (uint i = 0; i < requiredConditionIds.length; i++) {
            if (!conditionsFulfilled[requiredConditionIds[i]]) {
                unfulfilledCount++;
            }
        }
        bytes32[] memory unfulfilled = new bytes32[](unfulfilledCount);
        uint currentIndex = 0;
        for (uint i = 0; i < requiredConditionIds.length; i++) {
            if (!conditionsFulfilled[requiredConditionIds[i]]) {
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
}
