// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title UniversalPropertyEscrow
 * @dev Unified property escrow contract that handles both same-chain and cross-chain transactions
 * leveraging LiFi's universal transaction orchestration for optimal routing and execution.
 * Supports native tokens, ERC20 tokens, DEX swaps, and cross-chain bridges seamlessly.
 */
contract UniversalPropertyEscrow is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // Core escrow participants
    address public immutable seller;
    address public immutable buyer;
    address public immutable serviceWallet;
    uint256 public immutable escrowAmount;

    // Time constants
    uint256 public constant FINAL_APPROVAL_PERIOD = 48 hours;
    uint256 public constant DISPUTE_RESOLUTION_PERIOD = 7 days;
    uint256 public constant SERVICE_FEE_PERCENTAGE = 200; // 2% = 200 basis points out of 10000
    uint256 private constant MIN_BLOCK_TIME = 1_000_000_000;
    uint256 private constant MAX_FUTURE_TIME = 365 days;

    // Universal transaction metadata
    struct TransactionMetadata {
        string buyerNetwork;        // Network where buyer initiates from
        string sellerNetwork;       // Network where seller receives
        address tokenAddress;       // Token contract address (address(0) for native)
        bool isUniversalDeal;      // True if involves any form of routing/bridging
        bytes32 lifiRouteId;       // LiFi route identifier for transaction orchestration
        string transactionType;    // "same_chain", "cross_chain", "swap", "bridge"
    }
    
    TransactionMetadata public txMetadata;

    enum State {
        AWAITING_CONDITION_SETUP,     // Initial: buyer needs to set conditions
        AWAITING_DEPOSIT,             // Conditions set, awaiting buyer deposit
        AWAITING_UNIVERSAL_DEPOSIT,   // Waiting for LiFi-orchestrated deposit completion
        AWAITING_FULFILLMENT,         // Funds received, conditions need fulfillment
        READY_FOR_FINAL_APPROVAL,     // All conditions met, ready for final review
        IN_FINAL_APPROVAL,            // 48hr review period active
        IN_DISPUTE,                   // Buyer raised a dispute
        READY_FOR_UNIVERSAL_RELEASE,  // Ready to release via LiFi orchestration
        AWAITING_UNIVERSAL_RELEASE,   // LiFi release in progress
        COMPLETED,                    // Funds successfully released to seller
        CANCELLED                     // Escrow cancelled, funds returned
    }
    State public currentState;

    // Condition management
    mapping(bytes32 => bool) public conditionsFulfilledByBuyer;
    bytes32[] public requiredConditionIds;
    
    // Deposit tracking
    bool public fundsDeposited;
    bool public fundsReceivedFromUniversalRoute;
    
    // Universal transaction tracking
    struct UniversalDeposit {
        bytes32 lifiExecutionId;     // LiFi execution ID for tracking
        string sourceNetwork;        // Original source network
        uint256 expectedAmount;      // Expected amount to receive
        uint256 receivedAmount;      // Actual amount received
        address originalSender;      // Original transaction sender
        uint256 timestamp;           // When deposit was initiated
        bool completed;              // Whether deposit completed successfully
    }
    
    struct UniversalRelease {
        bytes32 lifiExecutionId;     // LiFi execution ID for release
        string targetNetwork;        // Target network for release
        address targetAddress;       // Target address for release
        uint256 amount;              // Amount being released
        uint256 timestamp;           // When release was initiated
        bool completed;              // Whether release completed successfully
    }
    
    UniversalDeposit public universalDepositInfo;
    UniversalRelease public universalReleaseInfo;

    // Deadlines
    uint256 public finalApprovalDeadline;
    uint256 public disputeResolutionDeadline;

    // Events
    event EscrowCreated(
        address indexed seller, 
        address indexed buyer, 
        uint256 amount, 
        string buyerNetwork, 
        string sellerNetwork,
        string transactionType
    );
    
    event ConditionsSet(bytes32[] conditionIds);
    
    event FundsDeposited(address indexed depositor, uint256 amount);
    
    event UniversalDepositInitiated(
        bytes32 indexed lifiExecutionId,
        string sourceNetwork,
        address indexed originalSender,
        uint256 expectedAmount,
        string transactionType
    );
    
    event UniversalDepositCompleted(
        bytes32 indexed lifiExecutionId,
        uint256 receivedAmount,
        address tokenAddress
    );
    
    event ConditionMarkedFulfilled(address indexed buyer, bytes32 indexed conditionId);
    
    event DisputeRaised(address indexed buyer, bytes32 indexed conditionId, uint256 resolutionDeadline);
    
    event DisputeConditionReFulfilled(address indexed buyer, bytes32 indexed conditionId);
    
    event FinalApprovalPeriodStarted(uint256 deadline);
    
    event UniversalReleaseInitiated(
        bytes32 indexed lifiExecutionId,
        string targetNetwork,
        address indexed targetAddress,
        uint256 amount,
        string transactionType
    );
    
    event UniversalReleaseCompleted(
        bytes32 indexed lifiExecutionId,
        uint256 amount
    );
    
    event FundsReleasedToSeller(address indexed seller, uint256 amount);
    
    event ServiceFeeTransferred(address indexed serviceWallet, uint256 amount);
    
    event EscrowCancelledBySystem(string reason, address indexed refundee, uint256 refundAmount);
    
    event EscrowCancelledByUser(address indexed canceller, address indexed refundee, uint256 refundAmount);

    // Modifiers
    modifier onlyBuyer() {
        require(msg.sender == buyer, "UniversalEscrow: Caller is not the buyer");
        _;
    }

    modifier buyerOrSeller() {
        require(msg.sender == buyer || msg.sender == seller, "UniversalEscrow: Caller is not buyer or seller");
        _;
    }

    modifier onlyLiFiOracle() {
        // In production, this would verify LiFi oracle signatures or authorized callers
        // For now, allow service wallet to act as oracle for simplicity
        require(msg.sender == serviceWallet, "UniversalEscrow: Caller is not authorized oracle");
        _;
    }

    modifier inState(State _state) {
        require(currentState == _state, "UniversalEscrow: Invalid state for this action");
        _;
    }

    constructor(
        address _seller,
        address _buyer,
        uint256 _escrowAmount,
        address _serviceWallet,
        string memory _buyerNetwork,
        string memory _sellerNetwork,
        address _tokenAddress,
        bytes32 _lifiRouteId,
        string memory _transactionType
    ) {
        require(_seller != address(0), "Seller address cannot be zero");
        require(_buyer != address(0), "Buyer address cannot be zero");
        require(_escrowAmount > 0, "Escrow amount must be positive");
        require(_seller != _buyer, "Seller and buyer cannot be the same");
        require(_serviceWallet != address(0), "Service wallet address cannot be zero");

        seller = _seller;
        buyer = _buyer;
        escrowAmount = _escrowAmount;
        serviceWallet = _serviceWallet;
        
        // Set transaction metadata
        txMetadata = TransactionMetadata({
            buyerNetwork: _buyerNetwork,
            sellerNetwork: _sellerNetwork,
            tokenAddress: _tokenAddress,
            isUniversalDeal: !_areStringsEqual(_buyerNetwork, _sellerNetwork) || _tokenAddress != address(0),
            lifiRouteId: _lifiRouteId,
            transactionType: _transactionType
        });
        
        currentState = State.AWAITING_CONDITION_SETUP;

        emit EscrowCreated(_seller, _buyer, _escrowAmount, _buyerNetwork, _sellerNetwork, _transactionType);
    }

    /**
     * @dev Set conditions for the escrow deal
     */
    function setConditions(bytes32[] memory conditionIds)
        external
        onlyBuyer
        inState(State.AWAITING_CONDITION_SETUP)
    {
        require(conditionIds.length > 0, "At least one condition must be set");
        require(requiredConditionIds.length == 0, "Conditions already set");

        uint256 length = conditionIds.length;
        for (uint256 i = 0; i < length; i++) {
            require(conditionIds[i] != bytes32(0), "Condition ID cannot be zero");
            requiredConditionIds.push(conditionIds[i]);
            conditionsFulfilledByBuyer[conditionIds[i]] = false;
        }
        
        // Determine next state based on transaction type
        if (txMetadata.isUniversalDeal) {
            currentState = State.AWAITING_UNIVERSAL_DEPOSIT;
        } else {
            currentState = State.AWAITING_DEPOSIT;
        }
        
        emit ConditionsSet(conditionIds);
    }

    /**
     * @dev Direct deposit for same-chain same-token transactions
     */
    function depositFunds()
        external
        payable
        onlyBuyer
        inState(State.AWAITING_DEPOSIT)
        nonReentrant
    {
        require(!txMetadata.isUniversalDeal, "Use universal deposit for this transaction type");
        require(txMetadata.tokenAddress == address(0), "Use depositTokens for ERC20");
        require(msg.value == escrowAmount, "Incorrect deposit amount");
        
        fundsDeposited = true;
        currentState = State.AWAITING_FULFILLMENT;
        
        emit FundsDeposited(msg.sender, msg.value);
    }

    /**
     * @dev Direct token deposit for same-chain ERC20 transactions
     */
    function depositTokens(uint256 amount)
        external
        onlyBuyer
        inState(State.AWAITING_DEPOSIT)
        nonReentrant
    {
        require(!txMetadata.isUniversalDeal, "Use universal deposit for this transaction type");
        require(txMetadata.tokenAddress != address(0), "Use depositFunds for native token");
        require(amount == escrowAmount, "Incorrect deposit amount");
        
        IERC20(txMetadata.tokenAddress).safeTransferFrom(msg.sender, address(this), amount);
        
        fundsDeposited = true;
        currentState = State.AWAITING_FULFILLMENT;
        
        emit FundsDeposited(msg.sender, amount);
    }

    /**
     * @dev Initiate universal deposit via LiFi orchestration
     * This handles swaps, bridges, or any complex routing needed
     */
    function initiateUniversalDeposit(
        bytes32 lifiExecutionId,
        uint256 expectedAmount
    )
        external
        onlyBuyer
        inState(State.AWAITING_UNIVERSAL_DEPOSIT)
    {
        require(lifiExecutionId != bytes32(0), "Invalid LiFi execution ID");
        require(expectedAmount > 0, "Expected amount must be positive");
        
        universalDepositInfo = UniversalDeposit({
            lifiExecutionId: lifiExecutionId,
            sourceNetwork: txMetadata.buyerNetwork,
            expectedAmount: expectedAmount,
            receivedAmount: 0,
            originalSender: msg.sender,
            timestamp: block.timestamp,
            completed: false
        });
        
        emit UniversalDepositInitiated(
            lifiExecutionId,
            txMetadata.buyerNetwork,
            msg.sender,
            expectedAmount,
            txMetadata.transactionType
        );
    }

    /**
     * @dev Complete universal deposit - called by LiFi oracle when funds arrive
     */
    function completeUniversalDeposit(
        bytes32 lifiExecutionId,
        uint256 receivedAmount
    )
        external
        onlyLiFiOracle
        inState(State.AWAITING_UNIVERSAL_DEPOSIT)
        nonReentrant
    {
        require(lifiExecutionId == universalDepositInfo.lifiExecutionId, "Execution ID mismatch");
        require(!universalDepositInfo.completed, "Deposit already completed");
        require(receivedAmount >= escrowAmount, "Insufficient amount received");
        
        universalDepositInfo.receivedAmount = receivedAmount;
        universalDepositInfo.completed = true;
        fundsDeposited = true;
        fundsReceivedFromUniversalRoute = true;
        currentState = State.AWAITING_FULFILLMENT;
        
        emit UniversalDepositCompleted(lifiExecutionId, receivedAmount, txMetadata.tokenAddress);
    }

    /**
     * @dev Buyer marks a condition as fulfilled
     */
    function buyerMarksConditionFulfilled(bytes32 conditionId)
        external
        onlyBuyer
        inState(State.AWAITING_FULFILLMENT)
    {
        require(_isConditionRequired(conditionId), "Condition ID not part of this escrow");
        require(!conditionsFulfilledByBuyer[conditionId], "Condition already marked as fulfilled");

        conditionsFulfilledByBuyer[conditionId] = true;
        emit ConditionMarkedFulfilled(msg.sender, conditionId);

        if (_areAllConditionsMet()) {
            currentState = State.READY_FOR_FINAL_APPROVAL;
        }
    }

    /**
     * @dev Start the final approval period
     */
    function startFinalApprovalPeriod()
        external
        buyerOrSeller
        inState(State.READY_FOR_FINAL_APPROVAL)
    {
        require(fundsDeposited, "Funds not deposited");
        require(_areAllConditionsMet(), "Not all conditions met");
        require(block.timestamp >= MIN_BLOCK_TIME, "Invalid block timestamp");

        currentState = State.IN_FINAL_APPROVAL;
        finalApprovalDeadline = block.timestamp + FINAL_APPROVAL_PERIOD;
        
        emit FinalApprovalPeriodStarted(finalApprovalDeadline);
    }

    /**
     * @dev Buyer raises a dispute by unfulfilling a condition
     */
    function raiseDisputeByUnfulfillingCondition(bytes32 conditionId)
        external
        onlyBuyer
        inState(State.IN_FINAL_APPROVAL)
    {
        require(_isConditionRequired(conditionId), "Condition ID not part of this escrow");
        require(conditionsFulfilledByBuyer[conditionId], "Condition was not marked fulfilled");
        require(block.timestamp < finalApprovalDeadline, "Final approval period has ended");

        conditionsFulfilledByBuyer[conditionId] = false;
        currentState = State.IN_DISPUTE;
        disputeResolutionDeadline = block.timestamp + DISPUTE_RESOLUTION_PERIOD;
        
        emit DisputeRaised(msg.sender, conditionId, disputeResolutionDeadline);
    }

    /**
     * @dev Buyer re-marks condition as fulfilled during dispute
     */
    function buyerReMarksConditionFulfilledInDispute(bytes32 conditionId)
        external
        onlyBuyer
        inState(State.IN_DISPUTE)
    {
        require(_isConditionRequired(conditionId), "Condition ID not part of this escrow");
        require(!conditionsFulfilledByBuyer[conditionId], "Condition already marked as fulfilled");
        require(block.timestamp < disputeResolutionDeadline, "Dispute resolution period has ended");

        conditionsFulfilledByBuyer[conditionId] = true;
        emit DisputeConditionReFulfilled(msg.sender, conditionId);

        if (_areAllConditionsMet()) {
            currentState = State.READY_FOR_FINAL_APPROVAL;
        }
    }

    /**
     * @dev Release funds after approval period (automatic for same-chain)
     */
    function releaseFundsAfterApprovalPeriod()
        external
        inState(State.IN_FINAL_APPROVAL)
        nonReentrant
    {
        require(block.timestamp >= finalApprovalDeadline, "Final approval period not ended");
        require(fundsDeposited, "Funds not deposited");
        require(_areAllConditionsMet(), "Not all conditions met");

        if (txMetadata.isUniversalDeal) {
            // For universal deals, prepare for LiFi-orchestrated release
            currentState = State.READY_FOR_UNIVERSAL_RELEASE;
        } else {
            // For simple same-chain deals, release directly
            _executeDirectRelease();
        }
    }

    /**
     * @dev Initiate universal release via LiFi orchestration
     */
    function initiateUniversalRelease(
        bytes32 lifiExecutionId,
        address targetAddress,
        uint256 releaseAmount
    )
        external
        buyerOrSeller
        inState(State.READY_FOR_UNIVERSAL_RELEASE)
    {
        require(lifiExecutionId != bytes32(0), "Invalid LiFi execution ID");
        require(targetAddress != address(0), "Invalid target address");
        require(releaseAmount > 0, "Release amount must be positive");
        
        uint256 serviceFee = (releaseAmount * SERVICE_FEE_PERCENTAGE) / 10000;
        uint256 sellerAmount = releaseAmount - serviceFee;
        
        universalReleaseInfo = UniversalRelease({
            lifiExecutionId: lifiExecutionId,
            targetNetwork: txMetadata.sellerNetwork,
            targetAddress: targetAddress,
            amount: sellerAmount,
            timestamp: block.timestamp,
            completed: false
        });
        
        currentState = State.AWAITING_UNIVERSAL_RELEASE;
        
        // Transfer service fee immediately
        if (txMetadata.tokenAddress == address(0)) {
            payable(serviceWallet).transfer(serviceFee);
        } else {
            IERC20(txMetadata.tokenAddress).safeTransfer(serviceWallet, serviceFee);
        }
        
        emit ServiceFeeTransferred(serviceWallet, serviceFee);
        emit UniversalReleaseInitiated(
            lifiExecutionId,
            txMetadata.sellerNetwork,
            targetAddress,
            sellerAmount,
            txMetadata.transactionType
        );
    }

    /**
     * @dev Complete universal release - called by LiFi oracle when release finishes
     */
    function completeUniversalRelease(bytes32 lifiExecutionId)
        external
        onlyLiFiOracle
        inState(State.AWAITING_UNIVERSAL_RELEASE)
    {
        require(lifiExecutionId == universalReleaseInfo.lifiExecutionId, "Execution ID mismatch");
        require(!universalReleaseInfo.completed, "Release already completed");
        
        universalReleaseInfo.completed = true;
        currentState = State.COMPLETED;
        
        emit UniversalReleaseCompleted(lifiExecutionId, universalReleaseInfo.amount);
        emit FundsReleasedToSeller(seller, universalReleaseInfo.amount);
    }

    /**
     * @dev Cancel escrow due to deadline expiry (system-triggered)
     */
    function cancelEscrowByDeadline()
        external
        nonReentrant
    {
        require(
            (currentState == State.IN_DISPUTE && block.timestamp >= disputeResolutionDeadline),
            "Not eligible for deadline cancellation"
        );
        
        _executeRefund("Deadline expiry");
    }

    /**
     * @dev Cancel escrow by mutual agreement
     */
    function cancelEscrowByMutualAgreement()
        external
        buyerOrSeller
        nonReentrant
    {
        require(
            currentState == State.AWAITING_FULFILLMENT || 
            currentState == State.READY_FOR_FINAL_APPROVAL ||
            currentState == State.IN_DISPUTE,
            "Cannot cancel in current state"
        );
        
        _executeRefund("Mutual agreement");
    }

    // Internal functions
    function _executeDirectRelease() internal {
        uint256 balance = _getContractBalance();
        require(balance >= escrowAmount, "Insufficient balance");
        
        uint256 serviceFee = (balance * SERVICE_FEE_PERCENTAGE) / 10000;
        uint256 sellerAmount = balance - serviceFee;
        
        currentState = State.COMPLETED;
        
        // Transfer service fee
        if (txMetadata.tokenAddress == address(0)) {
            payable(serviceWallet).transfer(serviceFee);
            payable(seller).transfer(sellerAmount);
        } else {
            IERC20(txMetadata.tokenAddress).safeTransfer(serviceWallet, serviceFee);
            IERC20(txMetadata.tokenAddress).safeTransfer(seller, sellerAmount);
        }
        
        emit ServiceFeeTransferred(serviceWallet, serviceFee);
        emit FundsReleasedToSeller(seller, sellerAmount);
    }

    function _executeRefund(string memory reason) internal {
        uint256 balance = _getContractBalance();
        
        if (balance > 0) {
            if (txMetadata.tokenAddress == address(0)) {
                payable(buyer).transfer(balance);
            } else {
                IERC20(txMetadata.tokenAddress).safeTransfer(buyer, balance);
            }
        }
        
        currentState = State.CANCELLED;
        emit EscrowCancelledBySystem(reason, buyer, balance);
    }

    function _getContractBalance() internal view returns (uint256) {
        if (txMetadata.tokenAddress == address(0)) {
            return address(this).balance;
        } else {
            return IERC20(txMetadata.tokenAddress).balanceOf(address(this));
        }
    }

    function _isConditionRequired(bytes32 conditionId) internal view returns (bool) {
        uint256 length = requiredConditionIds.length;
        for (uint256 i = 0; i < length; i++) {
            if (requiredConditionIds[i] == conditionId) {
                return true;
            }
        }
        return false;
    }

    function _areAllConditionsMet() internal view returns (bool) {
        uint256 length = requiredConditionIds.length;
        for (uint256 i = 0; i < length; i++) {
            if (!conditionsFulfilledByBuyer[requiredConditionIds[i]]) {
                return false;
            }
        }
        return true;
    }

    function _areStringsEqual(string memory a, string memory b) internal pure returns (bool) {
        return keccak256(abi.encodePacked(a)) == keccak256(abi.encodePacked(b));
    }

    // View functions
    function getTransactionMetadata() external view returns (TransactionMetadata memory) {
        return txMetadata;
    }

    function getUniversalDepositInfo() external view returns (UniversalDeposit memory) {
        return universalDepositInfo;
    }

    function getUniversalReleaseInfo() external view returns (UniversalRelease memory) {
        return universalReleaseInfo;
    }

    function getRequiredConditions() external view returns (bytes32[] memory) {
        return requiredConditionIds;
    }

    function isConditionFulfilled(bytes32 conditionId) external view returns (bool) {
        return conditionsFulfilledByBuyer[conditionId];
    }

    function areAllConditionsMet() external view returns (bool) {
        return _areAllConditionsMet();
    }

    function getContractBalance() external view returns (uint256) {
        return _getContractBalance();
    }

    // Emergency functions (for upgrades or critical fixes)
    function emergencyPause() external {
        require(msg.sender == serviceWallet, "Only service wallet can pause");
        // Implementation would depend on specific pause requirements
    }

    // Receive function for native token deposits
    receive() external payable {
        // Only accept direct payments if not a universal deal
        require(!txMetadata.isUniversalDeal, "Use designated deposit functions");
    }
} 