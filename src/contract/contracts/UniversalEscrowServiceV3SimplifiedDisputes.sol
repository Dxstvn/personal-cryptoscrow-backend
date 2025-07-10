// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "./UniversalEscrowServiceV3Simplified.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title UniversalEscrowServiceV3SimplifiedDisputes
 * @notice Simplified escrow with Stargate-only cross-chain and dispute resolution
 * @dev Combines simplified architecture with dispute functionality
 */
contract UniversalEscrowServiceV3SimplifiedDisputes is UniversalEscrowServiceV3Simplified {
    using SafeERC20 for IERC20;
    struct DisputeInfo {
        bool disputeRaised;
        address disputeRaisedBy;
        uint256 disputeRaisedTimestamp;
        bool disputeResolved;
        string disputeReason;
        bool resolvedInBuyerFavor;
        uint256 conditionMetTimestamp;
    }
    
    // Dispute storage
    mapping(bytes32 => DisputeInfo) public disputes;
    
    // Dispute window (24 hours)
    uint256 public constant DISPUTE_WINDOW = 24 hours;
    
    // Dispute resolver role
    mapping(address => bool) public disputeResolvers;
    
    // Dispute timeout (30 days after dispute raised)
    uint256 public constant DISPUTE_TIMEOUT = 30 days;
    
    // Events
    event DisputeRaised(
        bytes32 indexed escrowId,
        address indexed raisedBy,
        string reason
    );
    
    event DisputeResolved(
        bytes32 indexed escrowId,
        bool inBuyerFavor,
        address resolvedBy
    );
    
    event FundsReturnedAfterDispute(
        bytes32 indexed escrowId,
        address indexed buyer,
        uint256 amount
    );
    
    // Errors
    error DisputeWindowActive();
    error DisputePending();
    error DisputeAlreadyRaised();
    error DisputeNotRaised();
    error UnauthorizedResolver();
    error DisputeWindowExpired();
    error DisputeTimeoutNotReached();
    
    modifier onlyDisputeResolver() {
        if (!disputeResolvers[msg.sender] && msg.sender != owner()) {
            revert UnauthorizedResolver();
        }
        _;
    }
    
    constructor(
        address _serviceWallet,
        address _weth,
        address _uniswapRouter
    ) UniversalEscrowServiceV3Simplified(_serviceWallet, _weth, _uniswapRouter) {}
    
    /**
     * @notice Override updateCondition to track when condition is met
     */
    function updateCondition(bytes32 escrowId, bool conditionMet) external override onlyAuthorizedUpdater {
        EscrowDeposit storage escrow = escrows[escrowId];
        if (escrow.buyer == address(0)) revert EscrowNotFound();
        if (escrow.released) revert EscrowAlreadyReleased();
        
        escrow.conditionMet = conditionMet;
        
        // Track when condition is first met for dispute window
        if (conditionMet && disputes[escrowId].conditionMetTimestamp == 0) {
            disputes[escrowId].conditionMetTimestamp = block.timestamp;
        }
        
        emit ConditionUpdated(escrowId, conditionMet, msg.sender);
    }
    
    /**
     * @notice Override releaseEscrow to check dispute status
     */
    function releaseEscrow(bytes32 escrowId) external payable override nonReentrant {
        EscrowDeposit storage escrow = escrows[escrowId];
        DisputeInfo storage dispute = disputes[escrowId];
        
        if (escrow.buyer == address(0)) revert EscrowNotFound();
        if (escrow.released) revert EscrowAlreadyReleased();
        if (!escrow.conditionMet) revert ConditionNotMet();
        
        // Check dispute status
        if (dispute.disputeRaised && !dispute.disputeResolved) {
            revert DisputePending();
        }
        
        // Check dispute window
        if (dispute.conditionMetTimestamp > 0 && 
            block.timestamp <= dispute.conditionMetTimestamp + DISPUTE_WINDOW) {
            revert DisputeWindowActive();
        }
        
        // Only buyer or owner can release
        if (msg.sender != escrow.buyer && msg.sender != owner()) {
            revert UnauthorizedCaller();
        }
        
        // If dispute was resolved in buyer's favor, don't allow release to seller
        require(
            !dispute.disputeResolved || !dispute.resolvedInBuyerFavor,
            "Dispute resolved in buyer favor"
        );
        
        escrow.released = true;
        
        // Use parent contract's transfer logic
        if (escrow.targetChainId != 0 && escrow.targetChainId != block.chainid) {
            _handleCrossChainTransfer(escrowId, escrow);
        } else {
            _handleSameChainTransfer(escrowId, escrow);
        }
    }
    
    /**
     * @notice Raise a dispute on an escrow
     */
    function raiseDispute(bytes32 escrowId, string calldata reason) external {
        EscrowDeposit storage escrow = escrows[escrowId];
        DisputeInfo storage dispute = disputes[escrowId];
        
        if (escrow.buyer == address(0)) revert EscrowNotFound();
        if (escrow.released) revert EscrowAlreadyReleased();
        if (dispute.disputeRaised) revert DisputeAlreadyRaised();
        
        // Only buyer or seller can raise dispute
        require(
            msg.sender == escrow.buyer || msg.sender == escrow.seller,
            "Only buyer or seller can raise dispute"
        );
        
        // Check if within dispute window (if condition is met)
        if (escrow.conditionMet && dispute.conditionMetTimestamp > 0) {
            if (block.timestamp > dispute.conditionMetTimestamp + DISPUTE_WINDOW) {
                revert DisputeWindowExpired();
            }
        }
        
        dispute.disputeRaised = true;
        dispute.disputeRaisedBy = msg.sender;
        dispute.disputeRaisedTimestamp = block.timestamp;
        dispute.disputeReason = reason;
        
        emit DisputeRaised(escrowId, msg.sender, reason);
    }
    
    /**
     * @notice Resolve a dispute
     */
    function resolveDispute(
        bytes32 escrowId,
        bool inBuyerFavor
    ) external onlyDisputeResolver {
        EscrowDeposit storage escrow = escrows[escrowId];
        DisputeInfo storage dispute = disputes[escrowId];
        
        if (escrow.buyer == address(0)) revert EscrowNotFound();
        if (!dispute.disputeRaised) revert DisputeNotRaised();
        require(!dispute.disputeResolved, "Dispute already resolved");
        
        dispute.disputeResolved = true;
        dispute.resolvedInBuyerFavor = inBuyerFavor;
        
        emit DisputeResolved(escrowId, inBuyerFavor, msg.sender);
        
        // If resolved in buyer's favor, return funds immediately
        if (inBuyerFavor) {
            _returnFundsToBuyer(escrowId);
        }
    }
    
    /**
     * @notice Return funds to buyer after dispute timeout
     */
    function returnFundsAfterDisputeTimeout(bytes32 escrowId) external nonReentrant {
        EscrowDeposit storage escrow = escrows[escrowId];
        DisputeInfo storage dispute = disputes[escrowId];
        
        if (escrow.buyer == address(0)) revert EscrowNotFound();
        if (!dispute.disputeRaised) revert DisputeNotRaised();
        require(!dispute.disputeResolved, "Dispute already resolved");
        require(!escrow.released, "Escrow already released");
        
        // Check if dispute timeout has passed
        if (block.timestamp < dispute.disputeRaisedTimestamp + DISPUTE_TIMEOUT) {
            revert DisputeTimeoutNotReached();
        }
        
        // Auto-resolve in buyer's favor after timeout
        dispute.disputeResolved = true;
        dispute.resolvedInBuyerFavor = true;
        
        emit DisputeResolved(escrowId, true, address(this));
        
        _returnFundsToBuyer(escrowId);
    }
    
    /**
     * @notice Internal function to return funds to buyer
     */
    function _returnFundsToBuyer(bytes32 escrowId) internal {
        EscrowDeposit storage escrow = escrows[escrowId];
        escrow.released = true;
        
        // Return netAmount (after service fee) not depositAmount
        uint256 returnAmount = escrow.netAmount;
        
        if (escrow.depositToken == address(0)) {
            // Return ETH using .call for better gas handling
            (bool success, ) = payable(escrow.buyer).call{value: returnAmount}("");
            require(success, "ETH transfer failed");
        } else {
            // Return ERC20 tokens
            IERC20(escrow.depositToken).safeTransfer(escrow.buyer, returnAmount);
        }
        
        emit FundsReturnedAfterDispute(escrowId, escrow.buyer, returnAmount);
    }
    
    /**
     * @notice Set dispute resolver authorization
     */
    function setDisputeResolver(address resolver, bool authorized) external onlyOwner {
        disputeResolvers[resolver] = authorized;
    }
    
    /**
     * @notice Check if escrow can be released
     */
    function canReleaseEscrow(bytes32 escrowId) external view returns (
        bool canRelease,
        string memory reason
    ) {
        EscrowDeposit storage escrow = escrows[escrowId];
        DisputeInfo storage dispute = disputes[escrowId];
        
        if (escrow.buyer == address(0)) {
            return (false, "Escrow not found");
        }
        
        if (!escrow.conditionMet) {
            return (false, "Conditions not met");
        }
        
        if (escrow.released) {
            return (false, "Already released");
        }
        
        if (dispute.disputeRaised && !dispute.disputeResolved) {
            return (false, "Dispute pending resolution");
        }
        
        if (dispute.conditionMetTimestamp == 0) {
            return (false, "Condition met timestamp not set");
        }
        
        if (block.timestamp <= dispute.conditionMetTimestamp + DISPUTE_WINDOW) {
            uint256 remainingTime = (dispute.conditionMetTimestamp + DISPUTE_WINDOW) - block.timestamp;
            return (false, string(abi.encodePacked("Dispute window active: ", _toString(remainingTime), " seconds remaining")));
        }
        
        return (true, "Can release");
    }
    
    /**
     * @notice Get dispute information
     */
    function getDisputeInfo(bytes32 escrowId) external view returns (
        bool disputeRaised,
        address disputeRaisedBy,
        uint256 disputeRaisedTimestamp,
        bool disputeResolved,
        string memory disputeReason,
        uint256 conditionMetTimestamp
    ) {
        DisputeInfo storage dispute = disputes[escrowId];
        return (
            dispute.disputeRaised,
            dispute.disputeRaisedBy,
            dispute.disputeRaisedTimestamp,
            dispute.disputeResolved,
            dispute.disputeReason,
            dispute.conditionMetTimestamp
        );
    }
    
    /**
     * @notice Helper function to convert uint to string
     */
    function _toString(uint256 value) internal pure returns (string memory) {
        if (value == 0) {
            return "0";
        }
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }
        return string(buffer);
    }
}