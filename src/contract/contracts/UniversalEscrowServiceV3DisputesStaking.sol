// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "./UniversalEscrowServiceV3StargateOnly.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title UniversalEscrowServiceV3DisputesStaking
 * @notice Production-ready escrow with Stargate-only cross-chain, full dispute resolution, and staking mechanism
 * @dev Adds staking requirements for raising disputes based on user reputation
 */
contract UniversalEscrowServiceV3DisputesStaking is UniversalEscrowServiceV3StargateOnly, Pausable {
    using SafeERC20 for IERC20;
    
    // Dispute constants
    uint256 public constant DISPUTE_WINDOW = 48 hours;
    uint256 public constant DEFAULT_SLASH_PERCENTAGE = 50; // 50% slash for false disputes
    uint256 public constant MAX_STAKE_PERCENTAGE = 1000; // 10% max (in basis points)
    uint256 public constant MIN_STAKE_PERCENTAGE = 200; // 2% min (in basis points)
    
    // Dispute info storage
    struct DisputeInfo {
        uint256 conditionMetTimestamp;
        bool disputeRaised;
        address disputeRaisedBy;
        uint256 disputeRaisedTimestamp;
        bool disputeResolved;
        string disputeReason;
        // New staking fields
        uint256 stakeAmount;
        uint256 stakePercentage; // In basis points (e.g., 250 = 2.5%)
        address stakeToken;
        StakeStatus stakeStatus;
        uint256 reputationScoreAtStake;
    }
    
    enum StakeStatus {
        None,
        Locked,
        Returned,
        Slashed,
        PartialReturn
    }
    
    // Reputation tiers (basis points)
    struct ReputationTier {
        uint256 minScore;
        uint256 stakePercentage; // In basis points
    }
    
    mapping(bytes32 => DisputeInfo) public disputes;
    mapping(address => uint256) public reputationScores;
    ReputationTier[] public reputationTiers;
    
    // Events
    event DisputeRaised(bytes32 indexed escrowId, address indexed raisedBy, string reason, uint256 stakeAmount);
    event DisputeResolved(bytes32 indexed escrowId, bool releasedToSeller, uint256 stakeReturned, uint256 stakeSlashed);
    event StakeReturned(bytes32 indexed escrowId, address indexed to, uint256 amount);
    event StakeSlashed(bytes32 indexed escrowId, uint256 amount, address beneficiary);
    event ReputationUpdated(address indexed user, uint256 oldScore, uint256 newScore);
    event AutomaticRelease(bytes32 indexed escrowId);
    event FundsReturnedToBuyer(bytes32 indexed escrowId, address indexed buyer, uint256 amount);
    
    // Custom errors
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
    error InsufficientStake();
    error InvalidStakePercentage();
    error StakeTransferFailed();
    error InvalidSlashPercentage();
    error StakeAlreadyProcessed();
    error InsufficientBalance();
    error MaxTiersExceeded();

    constructor(
        address _serviceWallet,
        address _weth,
        address _uniswapRouter
    ) UniversalEscrowServiceV3StargateOnly(_serviceWallet, _weth, _uniswapRouter) {
        // Initialize default reputation tiers
        // Unverified: 0-199 score = 10% stake
        reputationTiers.push(ReputationTier(0, 1000));
        // Bronze: 200-499 score = 5% stake
        reputationTiers.push(ReputationTier(200, 500));
        // Silver: 500-749 score = 3.5% stake
        reputationTiers.push(ReputationTier(500, 350));
        // Gold: 750-899 score = 2.5% stake
        reputationTiers.push(ReputationTier(750, 250));
        // Platinum: 900+ score = 2% stake
        reputationTiers.push(ReputationTier(900, 200));
    }
    
    modifier onlyServiceWallet() {
        if (msg.sender != serviceWallet) revert DisputeNotServiceWallet();
        _;
    }
    
    /**
     * @notice Calculate required stake amount based on user reputation
     * @param user The user address
     * @param transactionAmount The transaction amount
     * @return stakePercentage The required stake percentage in basis points
     * @return stakeAmount The required stake amount
     */
    function calculateStakeRequirement(address user, uint256 transactionAmount) 
        public 
        view 
        returns (uint256 stakePercentage, uint256 stakeAmount) 
    {
        uint256 userScore = reputationScores[user];
        stakePercentage = MAX_STAKE_PERCENTAGE; // Default to max
        
        // Find applicable tier (with gas optimization)
        uint256 tierCount = reputationTiers.length;
        if (tierCount > 10) revert MaxTiersExceeded(); // Gas protection
        
        for (uint i = tierCount; i > 0; i--) {
            if (userScore >= reputationTiers[i-1].minScore) {
                stakePercentage = reputationTiers[i-1].stakePercentage;
                break;
            }
        }
        
        stakeAmount = (transactionAmount * stakePercentage) / 10000;
        return (stakePercentage, stakeAmount);
    }
    
    /**
     * @notice Update condition with dispute window tracking
     * @param escrowId The escrow to update
     * @param conditionMet Whether the condition is met
     */
    function updateConditionWithDispute(bytes32 escrowId, bool conditionMet) external onlyServiceWallet {
        EscrowDeposit storage escrow = escrows[escrowId];
        if (escrow.buyer == address(0)) revert DisputeNotFound();
        if (escrow.released) revert DisputeAlreadyReleased();
        
        escrow.conditionMet = conditionMet;
        
        // Track when condition was first met for dispute window
        if (conditionMet && disputes[escrowId].conditionMetTimestamp == 0) {
            disputes[escrowId].conditionMetTimestamp = block.timestamp;
        }
        
        emit ConditionUpdated(escrowId, conditionMet, msg.sender);
    }
    
    /**
     * @notice Raise a dispute within the dispute window with required stake
     * @param escrowId The escrow to dispute
     * @param reason The reason for the dispute
     * @param stakeToken The token to use for staking (address(0) for ETH)
     */
    function raiseDispute(
        bytes32 escrowId, 
        string calldata reason,
        address stakeToken
    ) external payable nonReentrant whenNotPaused {
        EscrowDeposit storage escrow = escrows[escrowId];
        DisputeInfo storage dispute = disputes[escrowId];
        
        if (escrow.buyer == address(0)) revert DisputeNotFound();
        if (escrow.released) revert DisputeAlreadyReleased();
        if (!escrow.conditionMet) revert DisputeConditionNotMet();
        if (dispute.disputeRaised) revert DisputeAlreadyRaised();
        if (msg.sender != escrow.buyer && msg.sender != escrow.seller) revert NotBuyerOrSeller();
        if (block.timestamp > dispute.conditionMetTimestamp + DISPUTE_WINDOW) revert DisputeWindowPassed();
        
        // Calculate required stake
        (uint256 stakePercentage, uint256 requiredStake) = calculateStakeRequirement(msg.sender, escrow.depositAmount);
        
        // Validate user has sufficient balance
        if (stakeToken == address(0)) {
            if (msg.value < requiredStake) revert InsufficientStake();
        } else {
            uint256 userBalance = IERC20(stakeToken).balanceOf(msg.sender);
            if (userBalance < requiredStake) revert InsufficientBalance();
            uint256 allowance = IERC20(stakeToken).allowance(msg.sender, address(this));
            if (allowance < requiredStake) revert InsufficientBalance();
        }
        
        // Handle stake transfer
        if (stakeToken == address(0)) {
            // ETH stake
            if (msg.value < requiredStake) revert InsufficientStake();
            // Refund excess ETH
            if (msg.value > requiredStake) {
                payable(msg.sender).transfer(msg.value - requiredStake);
            }
        } else {
            // ERC20 stake
            IERC20(stakeToken).safeTransferFrom(msg.sender, address(this), requiredStake);
        }
        
        dispute.disputeRaised = true;
        dispute.disputeRaisedBy = msg.sender;
        dispute.disputeRaisedTimestamp = block.timestamp;
        dispute.disputeReason = reason;
        dispute.stakeAmount = requiredStake;
        dispute.stakePercentage = stakePercentage;
        dispute.stakeToken = stakeToken;
        dispute.stakeStatus = StakeStatus.Locked;
        dispute.reputationScoreAtStake = reputationScores[msg.sender];
        
        emit DisputeRaised(escrowId, msg.sender, reason, requiredStake);
    }
    
    /**
     * @notice Resolve a dispute with stake handling (service wallet only)
     * @param escrowId The escrow to resolve
     * @param releaseFunds Whether to release funds to seller (true) or return to buyer (false)
     * @param slashPercentage Percentage of stake to slash (0-100, 0 means full return)
     */
    function resolveDispute(
        bytes32 escrowId, 
        bool releaseFunds,
        uint256 slashPercentage
    ) external onlyServiceWallet {
        EscrowDeposit storage escrow = escrows[escrowId];
        DisputeInfo storage dispute = disputes[escrowId];
        
        if (escrow.buyer == address(0)) revert DisputeNotFound();
        if (escrow.released) revert DisputeAlreadyReleased();
        if (!dispute.disputeRaised) revert NoDispute();
        if (dispute.disputeResolved) revert DisputeAlreadyReleased();
        if (slashPercentage > 100) revert InvalidSlashPercentage();
        
        dispute.disputeResolved = true;
        
        // Handle stake based on resolution
        uint256 stakeReturned = 0;
        uint256 stakeSlashed = 0;
        
        if (slashPercentage == 0) {
            // Full stake return (dispute was valid)
            stakeReturned = dispute.stakeAmount;
            dispute.stakeStatus = StakeStatus.Returned;
            _returnStake(escrowId, dispute.disputeRaisedBy, dispute.stakeAmount);
            
            // Increase reputation for valid dispute
            _updateReputation(dispute.disputeRaisedBy, 25, true);
        } else if (slashPercentage == 100) {
            // Full stake slash (dispute was invalid)
            stakeSlashed = dispute.stakeAmount;
            dispute.stakeStatus = StakeStatus.Slashed;
            _slashStake(escrowId, dispute.stakeAmount);
            
            // Decrease reputation for invalid dispute
            _updateReputation(dispute.disputeRaisedBy, 100, false);
        } else {
            // Partial return/slash
            stakeSlashed = (dispute.stakeAmount * slashPercentage) / 100;
            stakeReturned = dispute.stakeAmount - stakeSlashed;
            dispute.stakeStatus = StakeStatus.PartialReturn;
            
            if (stakeReturned > 0) {
                _returnStake(escrowId, dispute.disputeRaisedBy, stakeReturned);
            }
            if (stakeSlashed > 0) {
                _slashStake(escrowId, stakeSlashed);
            }
            
            // Moderate reputation impact
            _updateReputation(dispute.disputeRaisedBy, 50, false);
        }
        
        // Handle escrow funds
        if (releaseFunds) {
            escrow.released = true;
            if (escrow.targetChainId == block.chainid || escrow.targetChainId == 0) {
                _handleSameChainRelease(escrowId, escrow);
            } else {
                _handleCrossChainRelease(escrowId, escrow);
            }
        } else {
            _returnFundsToBuyer(escrowId);
        }
        
        emit DisputeResolved(escrowId, releaseFunds, stakeReturned, stakeSlashed);
    }
    
    /**
     * @notice Return stake to user with reentrancy protection
     */
    function _returnStake(bytes32 escrowId, address to, uint256 amount) internal nonReentrant {
        DisputeInfo storage dispute = disputes[escrowId];
        
        if (dispute.stakeToken == address(0)) {
            payable(to).transfer(amount);
        } else {
            IERC20(dispute.stakeToken).safeTransfer(to, amount);
        }
        
        emit StakeReturned(escrowId, to, amount);
    }
    
    /**
     * @notice Slash stake (send to counterparty or service wallet) with reentrancy protection
     */
    function _slashStake(bytes32 escrowId, uint256 amount) internal nonReentrant {
        EscrowDeposit storage escrow = escrows[escrowId];
        DisputeInfo storage dispute = disputes[escrowId];
        
        // Send slashed stake to the counterparty (if buyer disputed, seller gets it, and vice versa)
        address beneficiary = dispute.disputeRaisedBy == escrow.buyer ? escrow.seller : escrow.buyer;
        
        if (dispute.stakeToken == address(0)) {
            payable(beneficiary).transfer(amount);
        } else {
            IERC20(dispute.stakeToken).safeTransfer(beneficiary, amount);
        }
        
        emit StakeSlashed(escrowId, amount, beneficiary);
    }
    
    /**
     * @notice Update user reputation score
     */
    function _updateReputation(address user, uint256 points, bool increase) internal {
        uint256 oldScore = reputationScores[user];
        uint256 newScore;
        
        if (increase) {
            newScore = oldScore + points;
            if (newScore > 1000) newScore = 1000; // Cap at 1000
        } else {
            newScore = oldScore > points ? oldScore - points : 0;
        }
        
        reputationScores[user] = newScore;
        emit ReputationUpdated(user, oldScore, newScore);
    }
    
    /**
     * @notice Set user reputation score (service wallet only)
     */
    function setReputationScore(address user, uint256 score) external onlyServiceWallet {
        if (score > 1000) revert InvalidStakePercentage();
        uint256 oldScore = reputationScores[user];
        reputationScores[user] = score;
        emit ReputationUpdated(user, oldScore, score);
    }
    
    /**
     * @notice Update reputation tier configuration (service wallet only)
     */
    function updateReputationTier(uint256 index, uint256 minScore, uint256 stakePercentage) 
        external 
        onlyServiceWallet 
    {
        if (stakePercentage < MIN_STAKE_PERCENTAGE || stakePercentage > MAX_STAKE_PERCENTAGE) {
            revert InvalidStakePercentage();
        }
        if (index >= reputationTiers.length) revert DisputeNotFound();
        
        reputationTiers[index] = ReputationTier(minScore, stakePercentage);
    }
    
    /**
     * @notice Release escrow with dispute check
     * @param escrowId The escrow to release
     */
    function releaseEscrowWithDisputeCheck(bytes32 escrowId) external payable nonReentrant {
        EscrowDeposit storage escrow = escrows[escrowId];
        DisputeInfo storage dispute = disputes[escrowId];
        
        if (escrow.buyer == address(0)) revert DisputeNotFound();
        if (!escrow.conditionMet) revert DisputeConditionNotMet();
        if (escrow.released) revert DisputeAlreadyReleased();
        
        // Check dispute status
        if (dispute.disputeRaised) {
            if (!dispute.disputeResolved) revert DisputeNotResolved();
            uint256 resolutionPeriod = escrow.disputeResolutionDays * 1 days;
            if (block.timestamp <= dispute.disputeRaisedTimestamp + resolutionPeriod) {
                revert DisputePeriodNotEnded();
            }
        } else {
            if (dispute.conditionMetTimestamp == 0) revert DisputeConditionNotMet();
            if (block.timestamp <= dispute.conditionMetTimestamp + DISPUTE_WINDOW) {
                revert DisputeWindowActive();
            }
        }
        
        escrow.released = true;
        
        if (escrow.targetChainId == block.chainid || escrow.targetChainId == 0) {
            _handleSameChainRelease(escrowId, escrow);
        } else {
            _handleCrossChainRelease(escrowId, escrow);
        }
        
        emit AutomaticRelease(escrowId);
    }
    
    /**
     * @notice Return funds to buyer after dispute timeout
     * @param escrowId The escrow to return
     */
    function returnFundsAfterDisputeTimeout(bytes32 escrowId) external nonReentrant {
        EscrowDeposit storage escrow = escrows[escrowId];
        DisputeInfo storage dispute = disputes[escrowId];
        
        if (escrow.buyer == address(0)) revert DisputeNotFound();
        if (escrow.released) revert DisputeAlreadyReleased();
        if (!dispute.disputeRaised) revert NoDispute();
        if (dispute.disputeResolved) revert DisputeAlreadyReleased();
        uint256 resolutionPeriod = escrow.disputeResolutionDays * 1 days;
        if (block.timestamp <= dispute.disputeRaisedTimestamp + resolutionPeriod) {
            revert DisputePeriodNotEnded();
        }
        
        // Auto-return stake to dispute raiser on timeout
        if (dispute.stakeStatus == StakeStatus.Locked) {
            dispute.stakeStatus = StakeStatus.Returned;
            _returnStake(escrowId, dispute.disputeRaisedBy, dispute.stakeAmount);
        }
        
        _returnFundsToBuyer(escrowId);
    }
    
    /**
     * @notice Internal function to return funds to buyer
     * @param escrowId The escrow to return
     */
    function _returnFundsToBuyer(bytes32 escrowId) internal {
        EscrowDeposit storage escrow = escrows[escrowId];
        escrow.released = true;
        
        // Return only the net amount (contract doesn't hold the service fee)
        uint256 returnAmount = escrow.netAmount;
        
        if (escrow.depositToken == address(0)) {
            payable(escrow.buyer).transfer(returnAmount);
        } else {
            IERC20(escrow.depositToken).safeTransfer(escrow.buyer, returnAmount);
        }
        
        emit FundsReturnedToBuyer(escrowId, escrow.buyer, returnAmount);
    }
    
    /**
     * @notice Handle same-chain release (with or without swap)
     */
    function _handleSameChainRelease(bytes32 escrowId, EscrowDeposit memory escrow) internal {
        if (escrow.depositToken != escrow.targetToken) {
            _handleSameChainSwap(escrowId, escrow);
        } else {
            _handleDirectTransfer(escrowId, escrow);
        }
    }
    
    /**
     * @notice Handle cross-chain release via Stargate
     */
    function _handleCrossChainRelease(bytes32 escrowId, EscrowDeposit memory escrow) internal {
        _handleStargateRelease(escrowId, escrow);
    }
    
    /**
     * @notice Get dispute information including stake details
     * @param escrowId The escrow to query
     */
    function getDisputeInfo(bytes32 escrowId) external view returns (
        bool disputeRaised,
        address disputeRaisedBy,
        uint256 disputeRaisedTimestamp,
        bool disputeResolved,
        string memory disputeReason,
        uint256 conditionMetTimestamp,
        uint256 stakeAmount,
        uint256 stakePercentage,
        address stakeToken,
        StakeStatus stakeStatus
    ) {
        DisputeInfo storage dispute = disputes[escrowId];
        return (
            dispute.disputeRaised,
            dispute.disputeRaisedBy,
            dispute.disputeRaisedTimestamp,
            dispute.disputeResolved,
            dispute.disputeReason,
            dispute.conditionMetTimestamp,
            dispute.stakeAmount,
            dispute.stakePercentage,
            dispute.stakeToken,
            dispute.stakeStatus
        );
    }
    
    /**
     * @notice Emergency stake return (service wallet only)
     * @param escrowId The escrow with stuck stake
     */
    function emergencyStakeReturn(bytes32 escrowId) external onlyServiceWallet nonReentrant {
        DisputeInfo storage dispute = disputes[escrowId];
        
        if (dispute.stakeStatus != StakeStatus.Locked) revert StakeAlreadyProcessed();
        if (dispute.stakeAmount == 0) revert DisputeNotFound();
        
        dispute.stakeStatus = StakeStatus.Returned;
        _returnStake(escrowId, dispute.disputeRaisedBy, dispute.stakeAmount);
    }
    
    /**
     * @notice Check if escrow can be released
     * @param escrowId The escrow to check
     * @return canRelease Whether the escrow can be released
     * @return reason The reason if it cannot be released
     */
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
    
    /**
     * @notice Pause contract operations (emergency only)
     */
    function pause() external onlyServiceWallet {
        _pause();
    }
    
    /**
     * @notice Unpause contract operations
     */
    function unpause() external onlyServiceWallet {
        _unpause();
    }
}