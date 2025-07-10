// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "./UniversalEscrowServiceV3StargateEnhanced.sol";

/**
 * @title UniversalEscrowServiceV3DisputesOptimized
 * @notice Optimized version with same functionality but smaller bytecode
 * @dev Dispute resolution with 48-hour window and 7-day resolution period
 */
contract UniversalEscrowServiceV3DisputesOptimized is UniversalEscrowServiceV3StargateEnhanced {
    using SafeERC20 for IERC20;
    
    // Dispute constants
    uint256 public constant DISPUTE_WINDOW = 48 hours;
    uint256 public constant DISPUTE_RESOLUTION_PERIOD = 7 days;
    
    // Dispute info storage
    struct DisputeInfo {
        uint256 conditionMetTimestamp;
        bool disputeRaised;
        address disputeRaisedBy;
        uint256 disputeRaisedTimestamp;
        bool disputeResolved;
        string disputeReason;
    }
    
    mapping(bytes32 => DisputeInfo) public disputes;
    
    // Events (removed timestamps - available in block)
    event DisputeRaised(bytes32 indexed escrowId, address indexed raisedBy, string reason);
    event DisputeResolved(bytes32 indexed escrowId, bool releasedToSeller);
    event AutomaticRelease(bytes32 indexed escrowId);
    event FundsReturnedToBuyer(bytes32 indexed escrowId, address indexed buyer, uint256 amount);
    
    // Custom errors (more gas efficient than strings)
    error DisputeNotFound();
    error DisputeAlreadyReleased();
    error DisputeNotServiceWallet();
    error DisputeWindowPassed();
    error DisputeAlreadyRaised();
    error NoDispute();
    error DisputeNotResolved();
    error DisputePeriodNotEnded();
    error DisputeConditionNotMet();
    error DisputeWindowActive();
    error NotBuyerOrSeller();

    constructor(
        address _serviceWallet,
        address _weth,
        address _uniswapRouter
    ) UniversalEscrowServiceV3StargateEnhanced(_serviceWallet, _weth, _uniswapRouter) {}
    
    modifier onlyServiceWallet() {
        if (msg.sender != serviceWallet) revert DisputeNotServiceWallet();
        _;
    }
    
    function updateConditionWithDispute(bytes32 escrowId, bool conditionMet) external onlyServiceWallet {
        EscrowDeposit storage escrow = escrows[escrowId];
        if (escrow.buyer == address(0)) revert DisputeNotFound();
        if (escrow.released) revert DisputeAlreadyReleased();
        
        escrow.conditionMet = conditionMet;
        
        if (conditionMet && disputes[escrowId].conditionMetTimestamp == 0) {
            disputes[escrowId].conditionMetTimestamp = block.timestamp;
        }
        
        emit ConditionUpdated(escrowId, conditionMet, msg.sender);
    }
    
    function raiseDispute(bytes32 escrowId, string calldata reason) external {
        EscrowDeposit storage escrow = escrows[escrowId];
        DisputeInfo storage dispute = disputes[escrowId];
        
        if (escrow.buyer == address(0)) revert DisputeNotFound();
        if (escrow.released) revert DisputeAlreadyReleased();
        if (!escrow.conditionMet) revert DisputeConditionNotMet();
        if (dispute.disputeRaised) revert DisputeAlreadyRaised();
        if (msg.sender != escrow.buyer && msg.sender != escrow.seller) revert NotBuyerOrSeller();
        if (block.timestamp > dispute.conditionMetTimestamp + DISPUTE_WINDOW) revert DisputeWindowPassed();
        
        dispute.disputeRaised = true;
        dispute.disputeRaisedBy = msg.sender;
        dispute.disputeRaisedTimestamp = block.timestamp;
        dispute.disputeReason = reason;
        
        emit DisputeRaised(escrowId, msg.sender, reason);
    }
    
    function resolveDispute(bytes32 escrowId, bool releaseFunds) external onlyServiceWallet {
        EscrowDeposit storage escrow = escrows[escrowId];
        DisputeInfo storage dispute = disputes[escrowId];
        
        if (escrow.buyer == address(0)) revert DisputeNotFound();
        if (escrow.released) revert DisputeAlreadyReleased();
        if (!dispute.disputeRaised) revert NoDispute();
        if (dispute.disputeResolved) revert DisputeAlreadyReleased();
        
        dispute.disputeResolved = true;
        
        if (releaseFunds) {
            escrow.released = true;
            if (escrow.targetChainId == block.chainid) {
                _handleSameChainRelease(escrowId, escrow);
            } else {
                _handleCrossChainReleaseEnhanced(escrowId, escrow);
            }
        } else {
            _returnFundsToBuyer(escrowId);
        }
        
        emit DisputeResolved(escrowId, releaseFunds);
    }
    
    function releaseEscrowWithDisputeCheck(bytes32 escrowId) external payable nonReentrant {
        EscrowDeposit storage escrow = escrows[escrowId];
        DisputeInfo storage dispute = disputes[escrowId];
        
        if (escrow.buyer == address(0)) revert DisputeNotFound();
        if (!escrow.conditionMet) revert DisputeConditionNotMet();
        if (escrow.released) revert DisputeAlreadyReleased();
        
        if (dispute.disputeRaised) {
            if (!dispute.disputeResolved) revert DisputeNotResolved();
            if (block.timestamp <= dispute.disputeRaisedTimestamp + DISPUTE_RESOLUTION_PERIOD) {
                revert DisputePeriodNotEnded();
            }
        } else {
            if (dispute.conditionMetTimestamp == 0) revert DisputeConditionNotMet();
            if (block.timestamp <= dispute.conditionMetTimestamp + DISPUTE_WINDOW) {
                revert DisputeWindowActive();
            }
        }
        
        escrow.released = true;
        
        if (escrow.targetChainId == block.chainid) {
            _handleSameChainRelease(escrowId, escrow);
        } else {
            _handleCrossChainReleaseEnhanced(escrowId, escrow);
        }
        
        emit AutomaticRelease(escrowId);
    }
    
    function canReleaseEscrow(bytes32 escrowId) external view returns (bool canRelease, string memory reason) {
        EscrowDeposit storage escrow = escrows[escrowId];
        DisputeInfo storage dispute = disputes[escrowId];
        
        if (escrow.buyer == address(0)) return (false, "Not found");
        if (!escrow.conditionMet) return (false, "Conditions not met");
        if (escrow.released) return (false, "Already released");
        if (dispute.disputeRaised && !dispute.disputeResolved) return (false, "Dispute pending");
        if (dispute.conditionMetTimestamp == 0) return (false, "Timestamp not set");
        if (block.timestamp <= dispute.conditionMetTimestamp + DISPUTE_WINDOW) {
            return (false, "Dispute window active");
        }
        
        return (true, "Can release");
    }
    
    function returnFundsAfterDisputeTimeout(bytes32 escrowId) external nonReentrant {
        EscrowDeposit storage escrow = escrows[escrowId];
        DisputeInfo storage dispute = disputes[escrowId];
        
        if (escrow.buyer == address(0)) revert DisputeNotFound();
        if (escrow.released) revert DisputeAlreadyReleased();
        if (!dispute.disputeRaised) revert NoDispute();
        if (dispute.disputeResolved) revert DisputeAlreadyReleased();
        if (block.timestamp <= dispute.disputeRaisedTimestamp + DISPUTE_RESOLUTION_PERIOD) {
            revert DisputePeriodNotEnded();
        }
        
        _returnFundsToBuyer(escrowId);
    }
    
    function _returnFundsToBuyer(bytes32 escrowId) internal {
        EscrowDeposit storage escrow = escrows[escrowId];
        escrow.released = true;
        
        uint256 returnAmount = escrow.depositAmount;
        
        if (escrow.depositToken == address(0)) {
            payable(escrow.buyer).transfer(returnAmount);
        } else {
            IERC20(escrow.depositToken).safeTransfer(escrow.buyer, returnAmount);
        }
        
        emit FundsReturnedToBuyer(escrowId, escrow.buyer, returnAmount);
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
}