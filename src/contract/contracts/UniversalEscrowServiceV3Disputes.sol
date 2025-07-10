// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "./UniversalEscrowServiceV3StargateEnhanced.sol";

/**
 * @title UniversalEscrowServiceV3Disputes
 * @notice Enhanced escrow service with dispute resolution mechanism
 * @dev Adds 48-hour dispute window and 7-day resolution period
 */
contract UniversalEscrowServiceV3Disputes is UniversalEscrowServiceV3StargateEnhanced {
    using SafeERC20 for IERC20;
    
    // Dispute constants
    uint256 public constant DISPUTE_WINDOW = 48 hours;
    uint256 public constant DISPUTE_RESOLUTION_PERIOD = 7 days;
    
    // Production mode flag
    bool public productionMode = false;
    
    // Enhanced escrow structure with dispute fields
    struct DisputeInfo {
        uint256 conditionMetTimestamp;
        bool disputeRaised;
        address disputeRaisedBy;
        uint256 disputeRaisedTimestamp;
        bool disputeResolved;
        string disputeReason;
    }
    
    // Dispute storage
    mapping(bytes32 => DisputeInfo) public disputes;
    
    // Events
    event DisputeRaised(
        bytes32 indexed escrowId, 
        address indexed raisedBy, 
        string reason,
        uint256 timestamp
    );
    event DisputeResolved(
        bytes32 indexed escrowId, 
        bool releasedToSeller,
        uint256 timestamp
    );
    event AutomaticRelease(
        bytes32 indexed escrowId,
        uint256 timestamp
    );
    event FundsReturnedToBuyer(
        bytes32 indexed escrowId,
        address indexed buyer,
        uint256 amount,
        string reason
    );
    
    // Modifiers
    modifier onlyServiceWallet() {
        require(msg.sender == serviceWallet, "Only service wallet");
        _;
    }

    constructor(
        address _serviceWallet,
        address _weth,
        address _uniswapRouter
    ) UniversalEscrowServiceV3StargateEnhanced(_serviceWallet, _weth, _uniswapRouter) {}
    
    /**
     * @notice Update condition status with timestamp tracking
     * @param escrowId The escrow ID
     * @param conditionMet Whether the condition is met
     */
    function updateConditionWithDispute(bytes32 escrowId, bool conditionMet) external onlyServiceWallet {
        EscrowDeposit storage escrow = escrows[escrowId];
        require(escrow.buyer != address(0), "Escrow not found");
        require(!escrow.released, "Escrow already released");
        
        escrow.conditionMet = conditionMet;
        
        // Track when conditions were first met
        if (conditionMet && disputes[escrowId].conditionMetTimestamp == 0) {
            disputes[escrowId].conditionMetTimestamp = block.timestamp;
        }
        
        emit ConditionUpdated(escrowId, conditionMet, msg.sender);
    }
    
    /**
     * @notice Raise a dispute within 48 hours of conditions being met
     * @param escrowId The escrow ID
     * @param reason The reason for dispute
     */
    function raiseDispute(bytes32 escrowId, string calldata reason) external {
        EscrowDeposit storage escrow = escrows[escrowId];
        DisputeInfo storage dispute = disputes[escrowId];
        
        require(escrow.buyer != address(0), "Escrow not found");
        require(!escrow.released, "Escrow already released");
        require(escrow.conditionMet, "Conditions not met yet");
        require(!dispute.disputeRaised, "Dispute already raised");
        
        // Only buyer or seller can raise dispute
        require(
            msg.sender == escrow.buyer || msg.sender == escrow.seller,
            "Only buyer or seller can raise dispute"
        );
        
        // Must be within dispute window
        require(
            block.timestamp <= dispute.conditionMetTimestamp + DISPUTE_WINDOW,
            "Dispute window has passed"
        );
        
        dispute.disputeRaised = true;
        dispute.disputeRaisedBy = msg.sender;
        dispute.disputeRaisedTimestamp = block.timestamp;
        dispute.disputeReason = reason;
        
        emit DisputeRaised(escrowId, msg.sender, reason, block.timestamp);
    }
    
    /**
     * @notice Resolve a dispute (only buyer and seller together)
     * @param escrowId The escrow ID
     * @param releaseFunds Whether to release funds to seller (true) or return to buyer (false)
     */
    function resolveDispute(bytes32 escrowId, bool releaseFunds) external {
        EscrowDeposit storage escrow = escrows[escrowId];
        DisputeInfo storage dispute = disputes[escrowId];
        
        require(escrow.buyer != address(0), "Escrow not found");
        require(!escrow.released, "Escrow already released");
        require(dispute.disputeRaised, "No dispute to resolve");
        require(!dispute.disputeResolved, "Dispute already resolved");
        
        // For now, only service wallet can resolve disputes
        // In production, this could be an arbiter or require both parties' signatures
        require(msg.sender == serviceWallet, "Only service wallet can resolve disputes");
        
        dispute.disputeResolved = true;
        
        if (releaseFunds) {
            // Release to seller using optimal mechanism
            _releaseEscrowWithDispute(escrowId);
        } else {
            // Return funds to buyer
            _returnFundsToBuyer(escrowId);
        }
        
        emit DisputeResolved(escrowId, releaseFunds, block.timestamp);
    }
    
    /**
     * @notice Enhanced release function that checks dispute status
     */
    function releaseEscrowWithDisputeCheck(bytes32 escrowId) external payable nonReentrant {
        EscrowDeposit storage escrow = escrows[escrowId];
        DisputeInfo storage dispute = disputes[escrowId];
        
        require(escrow.buyer != address(0), "Escrow not found");
        require(escrow.conditionMet, "Condition not met");
        require(!escrow.released, "Escrow already released");
        
        // Check dispute status
        if (dispute.disputeRaised) {
            require(dispute.disputeResolved, "Dispute not resolved");
            // If dispute was resolved in favor of buyer, funds should have been returned
            require(
                dispute.disputeRaisedTimestamp + DISPUTE_RESOLUTION_PERIOD < block.timestamp,
                "Dispute resolution period not ended"
            );
        } else {
            // No dispute raised - check if dispute window has passed
            require(
                dispute.conditionMetTimestamp > 0,
                "Condition met timestamp not set"
            );
            require(
                block.timestamp > dispute.conditionMetTimestamp + DISPUTE_WINDOW,
                "Dispute window still active"
            );
        }
        
        // Mark as released
        escrow.released = true;
        
        // Proceed with normal release logic
        if (escrow.targetChainId == block.chainid) {
            _handleSameChainRelease(escrowId, escrow);
        } else {
            _handleCrossChainReleaseEnhanced(escrowId, escrow);
        }
        
        emit AutomaticRelease(escrowId, block.timestamp);
    }
    
    /**
     * @notice Check if escrow can be released (considering dispute window)
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
     * @notice Return funds to buyer (in case of unresolved dispute)
     * @dev Only service wallet can trigger this after 7 days
     */
    function returnFundsAfterDisputeTimeout(bytes32 escrowId) external nonReentrant onlyServiceWallet {
        EscrowDeposit storage escrow = escrows[escrowId];
        DisputeInfo storage dispute = disputes[escrowId];
        
        require(escrow.buyer != address(0), "Escrow not found");
        require(!escrow.released, "Escrow already released");
        require(dispute.disputeRaised, "No dispute raised");
        require(!dispute.disputeResolved, "Dispute already resolved");
        
        // Check if resolution period has passed
        require(
            block.timestamp > dispute.disputeRaisedTimestamp + DISPUTE_RESOLUTION_PERIOD,
            "Dispute resolution period not ended"
        );
        
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
        
        emit FundsReturnedToBuyer(
            escrowId, 
            escrow.buyer, 
            returnAmount, 
            "Dispute unresolved or resolved in buyer favor"
        );
    }
    
    /**
     * @notice Internal function to release after dispute resolution
     */
    function _releaseEscrowWithDispute(bytes32 escrowId) internal {
        EscrowDeposit storage escrow = escrows[escrowId];
        escrow.released = true;
        
        // Proceed with normal release logic
        if (escrow.targetChainId == block.chainid) {
            _handleSameChainRelease(escrowId, escrow);
        } else {
            _handleCrossChainReleaseEnhanced(escrowId, escrow);
        }
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