// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title CrossChainPropertyEscrow
 * @dev Enhanced PropertyEscrow with cross-chain bridging capabilities
 * Supports receiving bridged funds and bridging funds to sellers on different networks
 */
contract CrossChainPropertyEscrow is ReentrancyGuard {
    using SafeERC20 for IERC20;

    address public immutable seller;
    address public immutable buyer;
    address public immutable serviceWallet;
    uint256 public immutable escrowAmount;

    uint256 public constant FINAL_APPROVAL_PERIOD = 48 hours;
    uint256 public constant DISPUTE_RESOLUTION_PERIOD = 7 days;
    uint256 public constant SERVICE_FEE_PERCENTAGE = 200; // 2% = 200 basis points out of 10000
    uint256 private constant MIN_BLOCK_TIME = 1_000_000_000;
    uint256 private constant MAX_FUTURE_TIME = 365 days;

    // Cross-chain specific variables
    address public immutable bridgeContract;
    string public buyerSourceChain;
    string public sellerTargetChain;
    bool public isCrossChainDeal;
    address public tokenAddress; // For ERC20 tokens, address(0) for native ETH
    
    enum State {
        AWAITING_CONDITION_SETUP,   
        AWAITING_DEPOSIT,           
        AWAITING_CROSS_CHAIN_DEPOSIT, // NEW: Waiting for cross-chain funds
        AWAITING_FULFILLMENT,       
        READY_FOR_FINAL_APPROVAL,   
        IN_FINAL_APPROVAL,          
        IN_DISPUTE,                 
        READY_FOR_CROSS_CHAIN_RELEASE, // NEW: Ready to bridge to seller
        AWAITING_CROSS_CHAIN_RELEASE,  // NEW: Bridging in progress
        COMPLETED,                  
        CANCELLED                   
    }
    State public currentState;

    // Cross-chain deposit tracking
    struct CrossChainDeposit {
        bytes32 bridgeTransactionId;
        string sourceChain;
        uint256 amount;
        address originalSender;
        uint256 timestamp;
        bool verified;
    }
    
    mapping(bytes32 => bool) public conditionsFulfilledByBuyer;
    bytes32[] public requiredConditionIds;
    bool public fundsDeposited;
    CrossChainDeposit public crossChainDepositInfo;

    uint256 public finalApprovalDeadline;
    uint256 public disputeResolutionDeadline;

    // Cross-chain events
    event CrossChainDepositReceived(
        bytes32 indexed bridgeTransactionId,
        string sourceChain,
        address indexed originalSender,
        uint256 amount,
        address tokenAddress
    );
    
    event CrossChainReleaseInitiated(
        string targetChain,
        address indexed targetAddress,
        uint256 amount,
        address tokenAddress,
        bytes32 bridgeTransactionId
    );

    // Original events
    event EscrowCreated(address indexed seller, address indexed buyer, uint256 amount);
    event ConditionsSet(bytes32[] conditionIds);
    event FundsDeposited(address indexed depositor, uint256 amount);
    event ConditionMarkedFulfilled(address indexed buyer, bytes32 indexed conditionId);
    event DisputeRaised(address indexed buyer, bytes32 indexed conditionId, uint256 resolutionDeadline);
    event DisputeConditionReFulfilled(address indexed buyer, bytes32 indexed conditionId);
    event FinalApprovalPeriodStarted(uint256 deadline);
    event FundsReleasedToSeller(address indexed seller, uint256 amount);
    event ServiceFeeTransferred(address indexed serviceWallet, uint256 amount);
    event EscrowCancelledBySystem(string reason, address indexed refundee, uint256 refundAmount);
    event EscrowCancelledByUser(address indexed canceller, address indexed refundee, uint256 refundAmount);

    modifier onlyBuyer() {
        require(msg.sender == buyer, "Caller is not the buyer");
        _;
    }

    modifier buyerOrSeller() {
        require(msg.sender == buyer || msg.sender == seller, "Caller is not buyer or seller");
        _;
    }

    modifier onlyBridge() {
        require(msg.sender == bridgeContract, "Caller is not authorized bridge");
        _;
    }

    modifier inState(State _state) {
        require(currentState == _state, "Invalid state for this action");
        _;
    }

    constructor(
        address _seller,
        address _buyer,
        uint256 _escrowAmount,
        address _serviceWallet,
        address _bridgeContract,
        string memory _buyerSourceChain,
        string memory _sellerTargetChain,
        address _tokenAddress
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
        bridgeContract = _bridgeContract;
        buyerSourceChain = _buyerSourceChain;
        sellerTargetChain = _sellerTargetChain;
        tokenAddress = _tokenAddress;
        
        // Determine if this is a cross-chain deal
        isCrossChainDeal = (
            keccak256(abi.encodePacked(_buyerSourceChain)) != keccak256(abi.encodePacked("ethereum")) ||
            keccak256(abi.encodePacked(_sellerTargetChain)) != keccak256(abi.encodePacked("ethereum"))
        );
        
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
        
        // Set next state based on whether this is cross-chain
        if (isCrossChainDeal && keccak256(abi.encodePacked(buyerSourceChain)) != keccak256(abi.encodePacked("ethereum"))) {
            currentState = State.AWAITING_CROSS_CHAIN_DEPOSIT;
        } else {
            currentState = State.AWAITING_DEPOSIT;
        }
        
        emit ConditionsSet(conditionIds);
    }

    // ✅ NEW: Receive cross-chain bridged funds
    function receiveCrossChainDeposit(
        bytes32 bridgeTransactionId,
        string memory sourceChain,
        address originalSender,
        uint256 amount,
        address _tokenAddress
    ) external onlyBridge inState(State.AWAITING_CROSS_CHAIN_DEPOSIT) nonReentrant {
        require(amount == escrowAmount, "Incorrect cross-chain deposit amount");
        require(_tokenAddress == tokenAddress, "Token address mismatch");
        require(keccak256(abi.encodePacked(sourceChain)) == keccak256(abi.encodePacked(buyerSourceChain)), "Source chain mismatch");
        
        // Store cross-chain deposit information
        crossChainDepositInfo = CrossChainDeposit({
            bridgeTransactionId: bridgeTransactionId,
            sourceChain: sourceChain,
            amount: amount,
            originalSender: originalSender,
            timestamp: block.timestamp,
            verified: true
        });
        
        fundsDeposited = true;
        currentState = State.AWAITING_FULFILLMENT;
        
        emit CrossChainDepositReceived(bridgeTransactionId, sourceChain, originalSender, amount, _tokenAddress);
        emit FundsDeposited(originalSender, amount);
    }

    // Original deposit function for same-chain deals
    function depositFunds()
        external
        payable
        onlyBuyer
        inState(State.AWAITING_DEPOSIT)
        nonReentrant
    {
        require(msg.value == escrowAmount, "Incorrect deposit amount");
        require(tokenAddress == address(0), "Use depositToken for ERC20 deposits");
        
        fundsDeposited = true;
        currentState = State.AWAITING_FULFILLMENT;
        emit FundsDeposited(msg.sender, msg.value);
    }

    // ERC20 token deposit function
    function depositToken()
        external
        onlyBuyer
        inState(State.AWAITING_DEPOSIT)
        nonReentrant
    {
        require(tokenAddress != address(0), "Use depositFunds for ETH deposits");
        
        IERC20(tokenAddress).safeTransferFrom(msg.sender, address(this), escrowAmount);
        fundsDeposited = true;
        currentState = State.AWAITING_FULFILLMENT;
        emit FundsDeposited(msg.sender, escrowAmount);
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
        buyerOrSeller
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

    function raiseDisputeByUnfulfillingCondition(bytes32 conditionId)
        external
        onlyBuyer
        inState(State.IN_FINAL_APPROVAL)
    {
        require(isConditionRequired(conditionId), "Condition ID not part of this escrow.");
        require(conditionsFulfilledByBuyer[conditionId], "Condition was not marked fulfilled to unfulfill.");
        require(block.timestamp >= MIN_BLOCK_TIME, "Invalid block timestamp");
        require(block.timestamp < finalApprovalDeadline, "Final approval period has ended.");

        conditionsFulfilledByBuyer[conditionId] = false;
        currentState = State.IN_DISPUTE;
        disputeResolutionDeadline = block.timestamp + DISPUTE_RESOLUTION_PERIOD;
        emit DisputeRaised(msg.sender, conditionId, disputeResolutionDeadline);
    }

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
            currentState = State.READY_FOR_FINAL_APPROVAL;
        }
    }

    // ✅ NEW: Release funds after approval period - handles cross-chain release
    function releaseFundsAfterApprovalPeriod()
        external
        nonReentrant
        inState(State.IN_FINAL_APPROVAL)
    {
        require(block.timestamp >= MIN_BLOCK_TIME, "Invalid block timestamp");
        require(block.timestamp >= finalApprovalDeadline, "Final approval period has not ended yet.");
        require(fundsDeposited, "Funds not deposited.");
        require(areAllConditionsMet(), "Not all conditions are met.");

        // Check if seller needs cross-chain release
        if (isCrossChainDeal && keccak256(abi.encodePacked(sellerTargetChain)) != keccak256(abi.encodePacked("ethereum"))) {
            currentState = State.READY_FOR_CROSS_CHAIN_RELEASE;
            // Don't release funds yet - wait for bridge initiation
        } else {
            _releaseFundsToSeller();
        }
    }

    // ✅ NEW: Initiate cross-chain release to seller
    function initiateCrossChainRelease()
        external
        onlyBridge
        inState(State.READY_FOR_CROSS_CHAIN_RELEASE)
        nonReentrant
        returns (bytes32 bridgeTransactionId)
    {
        require(seller != address(0), "Invalid seller address");
        require(serviceWallet != address(0), "Invalid service wallet address");
        
        currentState = State.AWAITING_CROSS_CHAIN_RELEASE;
        
        uint256 serviceFee = (escrowAmount * SERVICE_FEE_PERCENTAGE) / 10000;
        uint256 remainingAmount = escrowAmount - serviceFee;
        
        // Generate bridge transaction ID
        bridgeTransactionId = keccak256(abi.encodePacked(
            block.timestamp,
            block.number,
            seller,
            remainingAmount,
            sellerTargetChain
        ));
        
        // Transfer service fee to service wallet
        if (tokenAddress == address(0)) {
            (bool success, ) = payable(serviceWallet).call{value: serviceFee}("");
            require(success, "Transfer to service wallet failed");
        } else {
            IERC20(tokenAddress).safeTransfer(serviceWallet, serviceFee);
        }
        
        emit ServiceFeeTransferred(serviceWallet, serviceFee);
        emit CrossChainReleaseInitiated(
            sellerTargetChain,
            seller,
            remainingAmount,
            tokenAddress,
            bridgeTransactionId
        );
        
        return bridgeTransactionId;
    }

    // ✅ NEW: Confirm cross-chain release completion
    function confirmCrossChainRelease(bytes32 bridgeTransactionId)
        external
        onlyBridge
        inState(State.AWAITING_CROSS_CHAIN_RELEASE)
    {
        currentState = State.COMPLETED;
        
        // Return any remaining balance to buyer
        if (tokenAddress == address(0)) {
            uint256 remainingBalance = address(this).balance;
            if (remainingBalance > 0) {
                (bool success, ) = payable(buyer).call{value: remainingBalance}("");
                require(success, "Transfer of excess to buyer failed");
            }
        } else {
            uint256 remainingBalance = IERC20(tokenAddress).balanceOf(address(this));
            if (remainingBalance > 0) {
                IERC20(tokenAddress).safeTransfer(buyer, remainingBalance);
            }
        }
        
        emit FundsReleasedToSeller(seller, escrowAmount - ((escrowAmount * SERVICE_FEE_PERCENTAGE) / 10000));
    }

    // Original release function for same-chain deals
    function _releaseFundsToSeller() internal {
        require(seller != address(0), "Invalid seller address");
        require(serviceWallet != address(0), "Invalid service wallet address");
        require(buyer != address(0), "Invalid buyer address");
        
        currentState = State.COMPLETED;
        
        uint256 serviceFee = (escrowAmount * SERVICE_FEE_PERCENTAGE) / 10000;
        uint256 remainingAmount = escrowAmount - serviceFee;
        
        emit FundsReleasedToSeller(seller, remainingAmount);
        emit ServiceFeeTransferred(serviceWallet, serviceFee);
        
        if (tokenAddress == address(0)) {
            // ETH transfers
            (bool success1, ) = payable(seller).call{value: remainingAmount}("");
            require(success1, "Transfer to seller failed");
            
            (bool success2, ) = payable(serviceWallet).call{value: serviceFee}("");
            require(success2, "Transfer to service wallet failed");

            uint256 remainingBalance = address(this).balance;
            if (remainingBalance > 0) {
                (bool success3, ) = payable(buyer).call{value: remainingBalance}("");
                require(success3, "Transfer of excess to buyer failed");
            }
        } else {
            // ERC20 token transfers
            IERC20(tokenAddress).safeTransfer(seller, remainingAmount);
            IERC20(tokenAddress).safeTransfer(serviceWallet, serviceFee);
            
            uint256 remainingBalance = IERC20(tokenAddress).balanceOf(address(this));
            if (remainingBalance > 0) {
                IERC20(tokenAddress).safeTransfer(buyer, remainingBalance);
            }
        }
    }

    function cancelEscrowAndRefundBuyer() external nonReentrant {
        bool canCancel = false;

        if (currentState == State.IN_DISPUTE && block.timestamp >= disputeResolutionDeadline) {
            require(buyer != address(0), "Invalid buyer address");
            canCancel = true;
            currentState = State.CANCELLED;
            
            if (fundsDeposited) {
                uint256 refundAmount = _getBalance();
                emit EscrowCancelledBySystem("Dispute resolution deadline passed", buyer, refundAmount);
                if (refundAmount > 0) {
                    _transferToBuyer(refundAmount);
                }
            } else {
                emit EscrowCancelledBySystem("Dispute resolution deadline passed, no funds to refund", buyer, 0);
            }
        } else if (msg.sender == buyer || msg.sender == seller) {
            if (currentState == State.AWAITING_CONDITION_SETUP ||
                currentState == State.AWAITING_DEPOSIT ||
                currentState == State.AWAITING_CROSS_CHAIN_DEPOSIT ||
                currentState == State.AWAITING_FULFILLMENT ||
                (currentState == State.IN_FINAL_APPROVAL && block.timestamp < finalApprovalDeadline) ||
                (currentState == State.IN_DISPUTE && block.timestamp < disputeResolutionDeadline)
            ) {
                require(buyer != address(0), "Invalid buyer address");
                canCancel = true;
                currentState = State.CANCELLED;
                
                uint256 refundAmount = 0;
                if (fundsDeposited) {
                    refundAmount = _getBalance();
                }
                
                emit EscrowCancelledByUser(msg.sender, buyer, refundAmount);
                if (fundsDeposited && refundAmount > 0) {
                    _transferToBuyer(refundAmount);
                }
            }
        }
        
        require(canCancel, "Conditions for cancellation not met.");
        require(currentState == State.CANCELLED, "Failed to set state to CANCELLED.");
    }

    // Helper functions
    function _getBalance() internal view returns (uint256) {
        if (tokenAddress == address(0)) {
            return address(this).balance;
        } else {
            return IERC20(tokenAddress).balanceOf(address(this));
        }
    }

    function _transferToBuyer(uint256 amount) internal {
        if (tokenAddress == address(0)) {
            (bool success, ) = payable(buyer).call{value: amount}("");
            require(success, "Refund to buyer failed");
        } else {
            IERC20(tokenAddress).safeTransfer(buyer, amount);
        }
    }

    // View functions
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
        return _getBalance();
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

    function getCrossChainInfo() external view returns (
        string memory _buyerSourceChain,
        string memory _sellerTargetChain,
        bool _isCrossChainDeal,
        address _tokenAddress,
        address _bridgeContract
    ) {
        return (buyerSourceChain, sellerTargetChain, isCrossChainDeal, tokenAddress, bridgeContract);
    }

    function getCrossChainDepositInfo() external view returns (CrossChainDeposit memory) {
        return crossChainDepositInfo;
    }
} 