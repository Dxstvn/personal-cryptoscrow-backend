// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title UniversalEscrowServiceV3Test
 * @notice Simplified test version of the escrow contract for unit testing
 */
contract UniversalEscrowServiceV3Test is Ownable {
    using SafeERC20 for IERC20;
    
    // Constants
    uint256 public constant SERVICE_FEE_BASIS_POINTS = 200; // 2%
    uint256 public constant BASIS_POINTS = 10000;
    
    // Escrow structure
    struct Escrow {
        address buyer;
        address seller;
        address depositToken;
        uint256 depositAmount;
        address targetToken;
        uint256 targetChainId;
        bool isDisputed;
        bool isCompleted;
        bool isReleased;
        uint256 conditionMetTimestamp;
    }
    
    // Storage
    mapping(uint256 => Escrow) public escrows;
    uint256 public nextEscrowId = 1;
    
    // Events
    event EscrowCreated(
        uint256 indexed escrowId,
        address indexed buyer,
        address indexed seller,
        address depositToken,
        uint256 depositAmount,
        uint256 targetChainId
    );
    
    event ConditionUpdated(uint256 indexed escrowId, bool conditionMet);
    event EscrowReleased(uint256 indexed escrowId, address to, uint256 amount);
    event DisputeRaised(uint256 indexed escrowId, address by);
    event DisputeResolved(uint256 indexed escrowId, address winner);
    
    // Constructor
    constructor() Ownable(msg.sender) {}
    
    /**
     * @notice Create a new escrow
     */
    function createEscrow(
        address seller,
        address depositToken,
        uint256 depositAmount,
        address targetToken,
        uint256 targetChainId,
        uint256 disputeResolutionDays
    ) external payable returns (uint256) {
        require(seller != address(0), "Invalid seller");
        require(depositAmount > 0, "Invalid amount");
        
        uint256 escrowId = nextEscrowId++;
        
        escrows[escrowId] = Escrow({
            buyer: msg.sender,
            seller: seller,
            depositToken: depositToken,
            depositAmount: depositAmount,
            targetToken: targetToken,
            targetChainId: targetChainId,
            isDisputed: false,
            isCompleted: false,
            isReleased: false,
            conditionMetTimestamp: 0
        });
        
        // Handle deposit
        if (depositToken == address(0)) {
            require(msg.value == depositAmount, "Incorrect ETH amount");
        } else {
            require(msg.value == 0, "ETH sent with token deposit");
            IERC20(depositToken).safeTransferFrom(msg.sender, address(this), depositAmount);
        }
        
        emit EscrowCreated(escrowId, msg.sender, seller, depositToken, depositAmount, targetChainId);
        
        return escrowId;
    }
    
    /**
     * @notice Update escrow condition (seller confirms delivery)
     */
    function updateCondition(uint256 escrowId, bool conditionMet) external {
        Escrow storage escrow = escrows[escrowId];
        require(msg.sender == escrow.seller, "Only seller can update");
        require(!escrow.isCompleted, "Escrow already completed");
        require(!escrow.isDisputed, "Escrow disputed");
        
        if (conditionMet && escrow.conditionMetTimestamp == 0) {
            escrow.conditionMetTimestamp = block.timestamp;
        } else if (!conditionMet) {
            escrow.conditionMetTimestamp = 0;
        }
        
        emit ConditionUpdated(escrowId, conditionMet);
    }
    
    /**
     * @notice Release escrow to seller
     */
    function releaseEscrow(uint256 escrowId) external {
        Escrow storage escrow = escrows[escrowId];
        require(msg.sender == escrow.buyer, "Only buyer can release");
        require(!escrow.isCompleted, "Already completed");
        require(!escrow.isDisputed, "Escrow disputed");
        
        escrow.isCompleted = true;
        escrow.isReleased = true;
        
        uint256 amount = escrow.depositAmount;
        uint256 serviceFee = (amount * SERVICE_FEE_BASIS_POINTS) / BASIS_POINTS;
        uint256 sellerAmount = amount - serviceFee;
        
        if (escrow.depositToken == address(0)) {
            payable(escrow.seller).transfer(sellerAmount);
            payable(owner()).transfer(serviceFee);
        } else {
            IERC20(escrow.depositToken).safeTransfer(escrow.seller, sellerAmount);
            IERC20(escrow.depositToken).safeTransfer(owner(), serviceFee);
        }
        
        emit EscrowReleased(escrowId, escrow.seller, sellerAmount);
    }
    
    /**
     * @notice Raise a dispute
     */
    function raiseDispute(uint256 escrowId) external {
        Escrow storage escrow = escrows[escrowId];
        require(msg.sender == escrow.buyer || msg.sender == escrow.seller, "Not a party");
        require(!escrow.isCompleted, "Already completed");
        require(!escrow.isDisputed, "Already disputed");
        
        escrow.isDisputed = true;
        emit DisputeRaised(escrowId, msg.sender);
    }
    
    /**
     * @notice Get escrow details
     */
    function getEscrowDetails(uint256 escrowId) external view returns (
        address buyer,
        address seller,
        address depositToken,
        uint256 depositAmount,
        address targetToken,
        uint256 targetChainId,
        bool isDisputed,
        bool isCompleted,
        bool isReleased,
        uint256 conditionMetTimestamp
    ) {
        Escrow memory escrow = escrows[escrowId];
        return (
            escrow.buyer,
            escrow.seller,
            escrow.depositToken,
            escrow.depositAmount,
            escrow.targetToken,
            escrow.targetChainId,
            escrow.isDisputed,
            escrow.isCompleted,
            escrow.isReleased,
            escrow.conditionMetTimestamp
        );
    }
    
    /**
     * @notice Estimate total fees for an escrow
     */
    function estimateTotalFees(
        uint256, // srcChainId
        uint256, // dstChainId
        address, // tokenAddress
        uint256 amount,
        bool // isCrossChain
    ) external pure returns (
        uint256 serviceFee,
        uint256 messagingFee,
        uint256 targetChainGasFee
    ) {
        serviceFee = (amount * SERVICE_FEE_BASIS_POINTS) / BASIS_POINTS;
        messagingFee = 0; // No cross-chain in test
        targetChainGasFee = 0; // No cross-chain in test
        
        return (serviceFee, messagingFee, targetChainGasFee);
    }
}