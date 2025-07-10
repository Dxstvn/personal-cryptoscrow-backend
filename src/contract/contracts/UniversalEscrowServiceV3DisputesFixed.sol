// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "./UniversalEscrowServiceV3StargateEnhanced.sol";

/**
 * @title UniversalEscrowServiceV3DisputesFixed
 * @notice Fixed version using .call instead of .transfer for better compatibility
 * @dev Maintains automatic dispute resolution after 7 days
 */
contract UniversalEscrowServiceV3DisputesFixed is UniversalEscrowServiceV3StargateEnhanced {
    using SafeERC20 for IERC20;
    
    uint256 public constant DISPUTE_WINDOW = 48 hours;
    uint256 public constant DISPUTE_RESOLUTION_PERIOD = 7 days;
    
    struct DisputeInfo {
        uint256 conditionMetTimestamp;
        bool disputeRaised;
        address disputeRaisedBy;
        uint256 disputeRaisedTimestamp;
        bool disputeResolved;
        string disputeReason;
    }
    
    mapping(bytes32 => DisputeInfo) public disputes;
    
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
    
    modifier onlyServiceWallet() {
        require(msg.sender == serviceWallet, "Only service wallet");
        _;
    }

    constructor(
        address _serviceWallet,
        address _weth,
        address _uniswapRouter
    ) UniversalEscrowServiceV3StargateEnhanced(_serviceWallet, _weth, _uniswapRouter) {}
    
    function updateConditionWithDispute(bytes32 escrowId, bool conditionMet) external onlyServiceWallet {
        EscrowDeposit storage escrow = escrows[escrowId];
        require(escrow.buyer != address(0), "Escrow not found");
        require(!escrow.released, "Escrow already released");
        
        escrow.conditionMet = conditionMet;
        
        if (conditionMet && disputes[escrowId].conditionMetTimestamp == 0) {
            disputes[escrowId].conditionMetTimestamp = block.timestamp;
        }
        
        emit ConditionUpdated(escrowId, conditionMet, msg.sender);
    }
    
    function raiseDispute(bytes32 escrowId, string calldata reason) external {
        EscrowDeposit storage escrow = escrows[escrowId];
        DisputeInfo storage dispute = disputes[escrowId];
        
        require(escrow.buyer != address(0), "Escrow not found");
        require(!escrow.released, "Escrow already released");
        require(escrow.conditionMet, "Conditions not met yet");
        require(!dispute.disputeRaised, "Dispute already raised");
        require(
            msg.sender == escrow.buyer || msg.sender == escrow.seller,
            "Only buyer or seller can raise dispute"
        );
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
    
    function resolveDispute(bytes32 escrowId, bool releaseFunds) external onlyServiceWallet {
        EscrowDeposit storage escrow = escrows[escrowId];
        DisputeInfo storage dispute = disputes[escrowId];
        
        require(escrow.buyer != address(0), "Escrow not found");
        require(!escrow.released, "Escrow already released");
        require(dispute.disputeRaised, "No dispute to resolve");
        require(!dispute.disputeResolved, "Dispute already resolved");
        
        dispute.disputeResolved = true;
        
        if (releaseFunds) {
            _releaseEscrowWithDispute(escrowId);
        } else {
            _returnFundsToBuyer(escrowId);
        }
        
        emit DisputeResolved(escrowId, releaseFunds, block.timestamp);
    }
    
    function releaseEscrowWithDisputeCheck(bytes32 escrowId) external payable nonReentrant {
        EscrowDeposit storage escrow = escrows[escrowId];
        DisputeInfo storage dispute = disputes[escrowId];
        
        require(escrow.buyer != address(0), "Escrow not found");
        require(escrow.conditionMet, "Condition not met");
        require(!escrow.released, "Escrow already released");
        
        if (dispute.disputeRaised) {
            require(dispute.disputeResolved, "Dispute not resolved");
            require(
                dispute.disputeRaisedTimestamp + DISPUTE_RESOLUTION_PERIOD < block.timestamp,
                "Dispute resolution period not ended"
            );
        } else {
            require(
                dispute.conditionMetTimestamp > 0,
                "Condition met timestamp not set"
            );
            require(
                block.timestamp > dispute.conditionMetTimestamp + DISPUTE_WINDOW,
                "Dispute window still active"
            );
        }
        
        escrow.released = true;
        
        if (escrow.targetChainId == block.chainid) {
            _handleSameChainRelease(escrowId, escrow);
        } else {
            _handleCrossChainReleaseEnhanced(escrowId, escrow);
        }
        
        emit AutomaticRelease(escrowId, block.timestamp);
    }
    
    /**
     * @notice AUTOMATIC REFUND - Only service wallet can trigger after 7 days if dispute unresolved
     * @dev Backend-controlled automatic dispute resolution
     */
    function returnFundsAfterDisputeTimeout(bytes32 escrowId) external nonReentrant onlyServiceWallet {
        EscrowDeposit storage escrow = escrows[escrowId];
        DisputeInfo storage dispute = disputes[escrowId];
        
        require(escrow.buyer != address(0), "Escrow not found");
        require(!escrow.released, "Escrow already released");
        require(dispute.disputeRaised, "No dispute raised");
        require(!dispute.disputeResolved, "Dispute already resolved");
        require(
            block.timestamp > dispute.disputeRaisedTimestamp + DISPUTE_RESOLUTION_PERIOD,
            "Dispute resolution period not ended"
        );
        
        _returnFundsToBuyer(escrowId);
    }
    
    /**
     * @notice Internal function to return funds to buyer - FIXED VERSION
     * @dev Uses .call instead of .transfer for better compatibility
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
    
    function _releaseEscrowWithDispute(bytes32 escrowId) internal {
        EscrowDeposit storage escrow = escrows[escrowId];
        escrow.released = true;
        
        if (escrow.targetChainId == block.chainid) {
            _handleSameChainRelease(escrowId, escrow);
        } else {
            _handleCrossChainReleaseEnhanced(escrowId, escrow);
        }
    }
    
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