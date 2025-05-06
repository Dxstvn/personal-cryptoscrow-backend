// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol"; // Optional: if you want an owner for emergency functions

/**
 * @title PropertyEscrow
 * @dev A smart contract to manage escrow for property transactions.
 * The buyer deposits funds, and specifies conditions. Once all buyer-specified
 * conditions are met (confirmed by the buyer) and funds are deposited,
 * the funds can be released to the seller.
 * This contract is designed for a single escrow deal.
 */
contract PropertyEscrow is ReentrancyGuard {
    address public seller;
    address public buyer;
    uint256 public escrowAmount;

    enum State {
        AWAITING_CONDITION_SETUP, // Initial state, seller has deployed, buyer needs to set conditions and deposit
        AWAITING_DEPOSIT,         // Buyer has set conditions, awaiting funds
        AWAITING_FULFILLMENT,     // Funds deposited, conditions set, awaiting buyer to confirm fulfillment
        READY_FOR_RELEASE,        // All conditions met, funds deposited, ready for seller to claim or buyer to trigger release
        COMPLETED,                // Funds released to seller
        CANCELLED                 // Escrow cancelled, funds returned to buyer (if deposited)
    }
    State public currentState;

    // Mapping from a condition ID (bytes32) to its status (true if fulfilled)
    mapping(bytes32 => bool) public conditionsFulfilled;
    // Array to store the IDs of conditions required by the buyer
    bytes32[] public requiredConditionIds;

    bool public fundsDeposited;

    event EscrowCreated(address indexed seller, address indexed buyer, uint256 amount);
    event ConditionsSetByBuyer(bytes32[] conditionIds);
    event FundsDeposited(address indexed depositor, uint256 amount);
    event ConditionFulfilled(address indexed fulfiller, bytes32 indexed conditionId);
    event FundsReleased(address indexed seller, uint256 amount);
    event EscrowCancelled(address indexed canceller, address indexed refundee, uint256 refundAmount);

    modifier onlyBuyer() {
        require(msg.sender == buyer, "PropertyEscrow: Caller is not the buyer");
        _;
    }

    modifier onlySeller() {
        require(msg.sender == seller, "PropertyEscrow: Caller is not the seller");
        _;
    }

    modifier inState(State _state) {
        require(currentState == _state, "PropertyEscrow: Invalid state for this action");
        _;
    }

    /**
     * @dev Constructor to initialize the escrow.
     * @param _seller The address of the seller.
     * @param _buyer The address of the buyer.
     * @param _escrowAmount The total amount to be held in escrow.
     */
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

    /**
     * @dev Allows the buyer to define the conditions required for the transaction.
     * This can only be called once.
     * @param _conditionIds An array of unique identifiers for each condition.
     * These IDs are managed off-chain and their meaning is
     * understood by buyer and seller.
     */
    function setConditions(bytes32[] memory _conditionIds)
        external
        onlyBuyer
        inState(State.AWAITING_CONDITION_SETUP)
    {
        require(_conditionIds.length > 0, "At least one condition must be set by buyer, or use no-condition flow.");
        // For simplicity, we allow this to be called once.
        // More complex logic could allow additions if state is appropriate.
        require(requiredConditionIds.length == 0, "Conditions already set.");

        for (uint i = 0; i < _conditionIds.length; i++) {
            require(_conditionIds[i] != bytes32(0), "Condition ID cannot be zero");
            requiredConditionIds.push(_conditionIds[i]);
            conditionsFulfilled[_conditionIds[i]] = false; // Initialize all as not fulfilled
        }
        currentState = State.AWAITING_DEPOSIT;
        emit ConditionsSetByBuyer(_conditionIds);
    }

    /**
     * @dev Allows the buyer to deposit funds into the escrow.
     * This function is payable.
     */
    function depositFunds()
        external
        payable
        onlyBuyer
        inState(State.AWAITING_DEPOSIT)
        nonReentrant
    {
        require(msg.value == escrowAmount, "PropertyEscrow: Incorrect deposit amount");
        fundsDeposited = true;
        currentState = State.AWAITING_FULFILLMENT;
        emit FundsDeposited(msg.sender, msg.value);
    }

    /**
     * @dev Allows the buyer to mark a specific condition as fulfilled.
     * @param _conditionId The ID of the condition to mark as fulfilled.
     */
    function fulfillCondition(bytes32 _conditionId)
        external
        onlyBuyer
        inState(State.AWAITING_FULFILLMENT)
    {
        bool found = false;
        for (uint i = 0; i < requiredConditionIds.length; i++) {
            if (requiredConditionIds[i] == _conditionId) {
                found = true;
                break;
            }
        }
        require(found, "PropertyEscrow: Condition ID not part of this escrow's required conditions.");
        require(!conditionsFulfilled[_conditionId], "PropertyEscrow: Condition already fulfilled.");

        conditionsFulfilled[_conditionId] = true;
        emit ConditionFulfilled(msg.sender, _conditionId);

        if (areAllBuyerConditionsMet()) {
            currentState = State.READY_FOR_RELEASE;
        }
    }

    /**
     * @dev Allows the seller to release funds if all conditions are met and funds are deposited.
     * Alternatively, the buyer could also call this to push the funds to the seller.
     */
    function releaseFundsToSeller()
        external
        (currentState == State.READY_FOR_RELEASE ? onlySeller : onlyBuyer) // Seller claims, or buyer can push
        inState(State.READY_FOR_RELEASE)
        nonReentrant
    {
        // Redundant check as state READY_FOR_RELEASE implies these, but good for clarity
        require(fundsDeposited, "PropertyEscrow: Funds not deposited yet.");
        require(areAllBuyerConditionsMet(), "PropertyEscrow: Not all buyer conditions are met.");

        currentState = State.COMPLETED;
        payable(seller).transfer(escrowAmount);
        emit FundsReleased(seller, escrowAmount);
    }

    /**
     * @dev Allows either party to cancel the escrow based on the current state.
     * If funds are deposited, they are returned to the buyer.
     */
    function cancelEscrow() external nonReentrant {
        require(
            msg.sender == buyer || msg.sender == seller,
            "PropertyEscrow: Only buyer or seller can cancel."
        );
        require(
            currentState != State.COMPLETED && currentState != State.CANCELLED,
            "PropertyEscrow: Escrow is already finalized or cancelled."
        );

        State oldState = currentState;
        currentState = State.CANCELLED;
        uint256 refundAmount = 0;

        if (fundsDeposited) {
            refundAmount = address(this).balance; // Refund whatever is in the contract
            if (refundAmount > 0) {
                 payable(buyer).transfer(refundAmount);
            }
        }
        emit EscrowCancelled(msg.sender, buyer, refundAmount);
    }

    // --- View Functions ---

    /**
     * @dev Checks if all buyer-specified conditions are met.
     * @return True if all conditions are met, false otherwise.
     */
    function areAllBuyerConditionsMet() public view returns (bool) {
        if (requiredConditionIds.length == 0 && currentState != State.AWAITING_CONDITION_SETUP) {
            // If no conditions were set by buyer (after setup phase), consider them met.
            // This path is for deals where buyer might not opt for any specific on-chain tracked conditions.
            // The primary condition becomes fund deposit.
            return true;
        }
        for (uint i = 0; i < requiredConditionIds.length; i++) {
            if (!conditionsFulfilled[requiredConditionIds[i]]) {
                return false;
            }
        }
        return true;
    }

    /**
     * @dev Returns the list of condition IDs that the buyer requires to be fulfilled.
     */
    function getRequiredConditionIds() external view returns (bytes32[] memory) {
        return requiredConditionIds;
    }

    /**
     * @dev Gets the current balance of the escrow contract.
     */
    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }
}
