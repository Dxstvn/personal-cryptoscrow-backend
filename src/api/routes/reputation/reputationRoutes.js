import express from 'express';
import { Timestamp } from 'firebase-admin/firestore';
import { getDb } from '../../../services/databaseService.js';
import { reputationService } from '../../../services/reputationService.js';
import { authMiddleware } from '../../middleware/authMiddleware.js';
import { validateRequest } from '../../middleware/validationMiddleware.js';

const router = express.Router();

/**
 * @route GET /api/reputation/stake-requirements
 * @description Calculate stake requirements for a user based on transaction amount
 * @query userId - The user ID to check reputation for
 * @query transactionAmount - The transaction amount in USD
 * @returns {Object} Stake requirements including percentage and amount
 */
router.get('/stake-requirements', authMiddleware, async (req, res) => {
    try {
        const { userId, transactionAmount } = req.query;
        
        // Validate required parameters
        if (!userId || !transactionAmount) {
            return res.status(400).json({
                success: false,
                error: 'Missing required parameters: userId, transactionAmount'
            });
        }
        
        // Validate transaction amount
        const amount = parseFloat(transactionAmount);
        if (isNaN(amount) || amount <= 0) {
            return res.status(400).json({
                success: false,
                error: 'Invalid transaction amount'
            });
        }
        
        // Check authorization - user can only check their own reputation or admin can check any
        if (req.user.uid !== userId && !req.user.isAdmin) {
            return res.status(403).json({
                success: false,
                error: 'Unauthorized to check this user\'s reputation'
            });
        }
        
        // Calculate stake requirements
        const stakeRequirements = await reputationService.calculateStakeRequirement(userId, amount);
        
        res.json({
            success: true,
            data: {
                userId,
                transactionAmount: amount,
                reputationScore: stakeRequirements.reputationScore,
                reputationLevel: stakeRequirements.reputationLevel,
                requiredStakePercentage: stakeRequirements.stakePercentage,
                requiredStakeAmount: stakeRequirements.requiredStake,
                stakeCurrency: stakeRequirements.currency
            }
        });
        
    } catch (error) {
        console.error('[ReputationRoutes] Error calculating stake requirements:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to calculate stake requirements'
        });
    }
});

/**
 * @route GET /api/reputation/score/:userId
 * @description Get reputation score for a user
 * @param userId - The user ID to get reputation for
 * @returns {Object} User reputation information
 */
router.get('/score/:userId', authMiddleware, async (req, res) => {
    try {
        const { userId } = req.params;
        
        // Check authorization
        if (req.user.uid !== userId && !req.user.isAdmin) {
            return res.status(403).json({
                success: false,
                error: 'Unauthorized to view this user\'s reputation'
            });
        }
        
        // Get reputation stats
        const reputationStats = await reputationService.getUserReputationStats(userId);
        
        res.json({
            success: true,
            data: reputationStats
        });
        
    } catch (error) {
        console.error('[ReputationRoutes] Error getting reputation score:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get reputation score'
        });
    }
});

/**
 * @route GET /api/reputation/dispute-history/:userId
 * @description Get dispute history for a user
 * @param userId - The user ID to get dispute history for
 * @returns {Object} User dispute history and statistics
 */
router.get('/dispute-history/:userId', authMiddleware, async (req, res) => {
    try {
        const { userId } = req.params;
        
        // Check authorization
        if (req.user.uid !== userId && !req.user.isAdmin) {
            return res.status(403).json({
                success: false,
                error: 'Unauthorized to view this user\'s dispute history'
            });
        }
        
        // Get dispute history
        const disputeHistory = await reputationService.getUserDisputeHistory(userId);
        
        res.json({
            success: true,
            data: disputeHistory
        });
        
    } catch (error) {
        console.error('[ReputationRoutes] Error getting dispute history:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get dispute history'
        });
    }
});

/**
 * @route PUT /api/reputation/score/:userId
 * @description Update user reputation score (admin only)
 * @param userId - The user ID to update reputation for
 * @body score - The new reputation score (0-1000)
 * @body reason - Reason for the update
 * @returns {Object} Updated reputation information
 */
router.put('/score/:userId', authMiddleware, async (req, res) => {
    try {
        // Admin only endpoint
        if (!req.user.isAdmin) {
            return res.status(403).json({
                success: false,
                error: 'Admin access required'
            });
        }
        
        const { userId } = req.params;
        const { score, reason } = req.body;
        
        // Validate score
        if (typeof score !== 'number' || score < 0 || score > 1000) {
            return res.status(400).json({
                success: false,
                error: 'Invalid score. Must be between 0 and 1000'
            });
        }
        
        if (!reason || typeof reason !== 'string') {
            return res.status(400).json({
                success: false,
                error: 'Reason is required'
            });
        }
        
        // Update reputation directly
        const db = await getDb();
        const userRef = db.collection('users').doc(userId);
        
        // Get current score
        const userDoc = await userRef.get();
        const currentScore = userDoc.exists ? (userDoc.data().reputationScore || 0) : 0;
        
        // Update score
        await userRef.set({
            reputationScore: score,
            lastReputationUpdate: Timestamp.now()
        }, { merge: true });
        
        // Record in history
        await db.collection('reputationHistory').add({
            userId,
            previousScore: currentScore,
            newScore: score,
            pointsChanged: score - currentScore,
            reason: `Admin update: ${reason}`,
            updatedBy: req.user.uid,
            timestamp: Timestamp.now()
        });
        
        const tier = reputationService.getReputationTier(score);
        
        res.json({
            success: true,
            data: {
                userId,
                previousScore: currentScore,
                newScore: score,
                tier
            }
        });
        
    } catch (error) {
        console.error('[ReputationRoutes] Error updating reputation score:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update reputation score'
        });
    }
});

/**
 * @route GET /api/reputation/tiers
 * @description Get all reputation tier configurations
 * @returns {Array} List of reputation tiers
 */
router.get('/tiers', async (req, res) => {
    try {
        const tiers = reputationService.reputationTiers.map(tier => ({
            name: tier.name,
            minScore: tier.minScore,
            maxScore: tier.maxScore,
            stakePercentage: tier.stakePercentage,
            stakePercentageDisplay: `${(tier.stakePercentage * 100).toFixed(1)}%`
        }));
        
        res.json({
            success: true,
            data: tiers
        });
        
    } catch (error) {
        console.error('[ReputationRoutes] Error getting reputation tiers:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get reputation tiers'
        });
    }
});

/**
 * @route GET /api/reputation/leaderboard
 * @description Get reputation leaderboard (public endpoint)
 * @query limit - Number of users to return (default 10, max 50)
 * @returns {Array} Top users by reputation score
 */
router.get('/leaderboard', async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 10, 50);
        
        const db = await getDb();
        const snapshot = await db.collection('users')
            .orderBy('reputationScore', 'desc')
            .limit(limit)
            .get();
        
        const leaderboard = [];
        let rank = 1;
        
        snapshot.forEach(doc => {
            const userData = doc.data();
            const tier = reputationService.getReputationTier(userData.reputationScore || 0);
            
            leaderboard.push({
                rank,
                userId: doc.id,
                // Hide personal info, only show anonymized data
                displayName: userData.displayName || `User ${doc.id.slice(-6)}`,
                reputationScore: userData.reputationScore || 0,
                reputationLevel: tier.name,
                totalTransactions: userData.totalTransactions || 0
            });
            rank++;
        });
        
        res.json({
            success: true,
            data: leaderboard
        });
        
    } catch (error) {
        console.error('[ReputationRoutes] Error getting leaderboard:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get reputation leaderboard'
        });
    }
});

export default router;