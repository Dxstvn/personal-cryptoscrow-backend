// src/services/reputationService.js
import { getDb } from './databaseService.js';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';

/**
 * Service for managing user reputation scores and dispute stake calculations
 */
export class ReputationService {
  constructor() {
    // Reputation tiers configuration (matches smart contract)
    this.reputationTiers = [
      { name: 'Unverified', minScore: 0, maxScore: 199, stakePercentage: 0.10 },
      { name: 'Bronze', minScore: 200, maxScore: 499, stakePercentage: 0.05 },
      { name: 'Silver', minScore: 500, maxScore: 749, stakePercentage: 0.035 },
      { name: 'Gold', minScore: 750, maxScore: 899, stakePercentage: 0.025 },
      { name: 'Platinum', minScore: 900, maxScore: 1000, stakePercentage: 0.02 }
    ];
  }

  /**
   * Calculate required stake for a dispute based on user reputation
   * @param {string} userId - The user ID
   * @param {number} transactionAmount - The transaction amount
   * @returns {Promise<Object>} Stake requirements including percentage and amount
   */
  async calculateStakeRequirement(userId, transactionAmount) {
    try {
      // Get user reputation score
      const reputationScore = await this.getUserReputationScore(userId);
      
      // Find applicable tier
      const tier = this.getReputationTier(reputationScore);
      
      // Calculate stake amount
      const stakeAmount = transactionAmount * tier.stakePercentage;
      
      return {
        reputationScore,
        reputationLevel: tier.name,
        stakePercentage: tier.stakePercentage,
        requiredStake: stakeAmount,
        currency: 'USDC' // Default to USDC, can be made configurable
      };
    } catch (error) {
      console.error('[ReputationService] Error calculating stake requirement:', error);
      throw error;
    }
  }

  /**
   * Get user reputation score from database
   * @param {string} userId - The user ID
   * @returns {Promise<number>} The user's reputation score
   */
  async getUserReputationScore(userId) {
    try {
      const db = await getDb();
      const userDoc = await db.collection('users').doc(userId).get();
      
      if (!userDoc.exists) {
        // New user starts with 0 reputation
        return 0;
      }
      
      const userData = userDoc.data();
      return userData.reputationScore || 0;
    } catch (error) {
      console.error('[ReputationService] Error getting user reputation:', error);
      return 0; // Default to 0 on error
    }
  }

  /**
   * Update user reputation score
   * @param {string} userId - The user ID
   * @param {number} points - Points to add (positive) or subtract (negative)
   * @param {string} reason - Reason for reputation change
   * @returns {Promise<Object>} Updated reputation info
   */
  async updateReputationScore(userId, points, reason) {
    try {
      const db = await getDb();
      const userRef = db.collection('users').doc(userId);
      
      // Get current score
      const userDoc = await userRef.get();
      const currentScore = userDoc.exists ? (userDoc.data().reputationScore || 0) : 0;
      
      // Calculate new score (capped between 0 and 1000)
      let newScore = currentScore + points;
      newScore = Math.max(0, Math.min(1000, newScore));
      
      // Update user document
      await userRef.set({
        reputationScore: newScore,
        lastReputationUpdate: Timestamp.now()
      }, { merge: true });
      
      // Record reputation history
      await db.collection('reputationHistory').add({
        userId,
        previousScore: currentScore,
        newScore,
        pointsChanged: points,
        reason,
        timestamp: Timestamp.now()
      });
      
      return {
        previousScore: currentScore,
        newScore,
        pointsChanged: points,
        tier: this.getReputationTier(newScore)
      };
    } catch (error) {
      console.error('[ReputationService] Error updating reputation:', error);
      throw error;
    }
  }

  /**
   * Get reputation tier based on score
   * @param {number} score - The reputation score
   * @returns {Object} The reputation tier info
   */
  getReputationTier(score) {
    for (const tier of this.reputationTiers) {
      if (score >= tier.minScore && score <= tier.maxScore) {
        return tier;
      }
    }
    // Default to unverified tier
    return this.reputationTiers[0];
  }

  /**
   * Get user's dispute history with stake information
   * @param {string} userId - The user ID
   * @returns {Promise<Object>} Dispute history and statistics
   */
  async getUserDisputeHistory(userId) {
    try {
      const db = await getDb();
      
      // Get all disputes where user was the disputer
      const disputesSnapshot = await db.collection('disputeStakes')
        .where('userId', '==', userId)
        .orderBy('createdAt', 'desc')
        .get();
      
      const disputes = [];
      let totalStaked = 0;
      let totalReturned = 0;
      let totalSlashed = 0;
      
      disputesSnapshot.forEach(doc => {
        const dispute = { disputeId: doc.id, ...doc.data() };
        disputes.push({
          disputeId: dispute.disputeId,
          transactionAmount: dispute.transactionAmount,
          stakeAmount: dispute.stakeAmount,
          stakePercentage: dispute.stakePercentage,
          outcome: dispute.outcome,
          stakeReturned: dispute.stakeReturned || false,
          timestamp: dispute.createdAt
        });
        
        totalStaked += dispute.stakeAmount || 0;
        
        if (dispute.outcome === 'resolved_in_favor' || dispute.outcome === 'timeout_return') {
          totalReturned += dispute.stakeAmount || 0;
        } else if (dispute.outcome === 'resolved_against') {
          totalSlashed += dispute.stakeAmount || 0;
        } else if (dispute.outcome === 'partial_return') {
          totalReturned += dispute.amountReturned || 0;
          totalSlashed += (dispute.stakeAmount - (dispute.amountReturned || 0));
        }
      });
      
      return {
        disputes,
        totalStaked,
        totalReturned,
        totalSlashed,
        disputeCount: disputes.length,
        successRate: disputes.length > 0 
          ? (disputes.filter(d => d.outcome === 'resolved_in_favor').length / disputes.length) 
          : 0
      };
    } catch (error) {
      console.error('[ReputationService] Error getting dispute history:', error);
      throw error;
    }
  }

  /**
   * Record a new dispute stake
   * @param {Object} stakeData - The stake information
   * @returns {Promise<string>} The stake record ID
   */
  async recordDisputeStake(stakeData) {
    try {
      const db = await getDb();
      
      const stakeRecord = {
        userId: stakeData.userId,
        dealId: stakeData.dealId,
        transactionAmount: stakeData.transactionAmount,
        stakeAmount: stakeData.stakeAmount,
        stakePercentage: stakeData.stakePercentage,
        stakeToken: stakeData.stakeToken || 'USDC',
        reputationScoreAtStake: await this.getUserReputationScore(stakeData.userId),
        status: 'locked',
        createdAt: Timestamp.now()
      };
      
      const docRef = await db.collection('disputeStakes').add(stakeRecord);
      
      return docRef.id;
    } catch (error) {
      console.error('[ReputationService] Error recording dispute stake:', error);
      throw error;
    }
  }

  /**
   * Update dispute stake status after resolution
   * @param {string} stakeId - The stake record ID
   * @param {Object} resolution - Resolution details
   * @returns {Promise<void>}
   */
  async updateDisputeStakeStatus(stakeId, resolution) {
    try {
      const db = await getDb();
      const stakeRef = db.collection('disputeStakes').doc(stakeId);
      
      const updateData = {
        status: resolution.status, // 'returned', 'slashed', 'partial_return'
        outcome: resolution.outcome, // 'resolved_in_favor', 'resolved_against', 'partial_return', 'timeout_return'
        resolvedAt: Timestamp.now()
      };
      
      if (resolution.amountReturned !== undefined) {
        updateData.amountReturned = resolution.amountReturned;
      }
      
      if (resolution.amountSlashed !== undefined) {
        updateData.amountSlashed = resolution.amountSlashed;
      }
      
      await stakeRef.update(updateData);
      
      // Update user reputation based on outcome
      const stakeDoc = await stakeRef.get();
      const stakeData = stakeDoc.data();
      
      let reputationChange = 0;
      let reason = '';
      
      switch (resolution.outcome) {
        case 'resolved_in_favor':
          reputationChange = 25;
          reason = 'Valid dispute raised';
          break;
        case 'resolved_against':
          reputationChange = -100;
          reason = 'Invalid dispute raised';
          break;
        case 'partial_return':
          reputationChange = -50;
          reason = 'Partially valid dispute';
          break;
        case 'timeout_return':
          reputationChange = 10;
          reason = 'Dispute auto-resolved in favor';
          break;
      }
      
      if (reputationChange !== 0) {
        await this.updateReputationScore(stakeData.userId, reputationChange, reason);
      }
    } catch (error) {
      console.error('[ReputationService] Error updating dispute stake status:', error);
      throw error;
    }
  }

  /**
   * Get reputation statistics for a user
   * @param {string} userId - The user ID
   * @returns {Promise<Object>} Reputation statistics
   */
  async getUserReputationStats(userId) {
    try {
      const [reputationScore, disputeHistory] = await Promise.all([
        this.getUserReputationScore(userId),
        this.getUserDisputeHistory(userId)
      ]);
      
      const tier = this.getReputationTier(reputationScore);
      
      return {
        userId,
        reputationScore,
        reputationLevel: tier.name,
        currentStakePercentage: tier.stakePercentage,
        disputeStats: {
          totalDisputes: disputeHistory.disputeCount,
          successfulDisputes: disputeHistory.disputes.filter(d => d.outcome === 'resolved_in_favor').length,
          failedDisputes: disputeHistory.disputes.filter(d => d.outcome === 'resolved_against').length,
          totalStaked: disputeHistory.totalStaked,
          totalReturned: disputeHistory.totalReturned,
          totalSlashed: disputeHistory.totalSlashed
        },
        nextTier: this.getNextTier(reputationScore),
        previousTier: this.getPreviousTier(reputationScore)
      };
    } catch (error) {
      console.error('[ReputationService] Error getting reputation stats:', error);
      throw error;
    }
  }

  /**
   * Get the next reputation tier
   * @param {number} currentScore - Current reputation score
   * @returns {Object|null} Next tier info or null if at max
   */
  getNextTier(currentScore) {
    const currentTier = this.getReputationTier(currentScore);
    const currentIndex = this.reputationTiers.findIndex(t => t.name === currentTier.name);
    
    if (currentIndex < this.reputationTiers.length - 1) {
      const nextTier = this.reputationTiers[currentIndex + 1];
      return {
        name: nextTier.name,
        requiredScore: nextTier.minScore,
        pointsNeeded: nextTier.minScore - currentScore,
        stakePercentage: nextTier.stakePercentage
      };
    }
    
    return null;
  }

  /**
   * Get the previous reputation tier
   * @param {number} currentScore - Current reputation score
   * @returns {Object|null} Previous tier info or null if at min
   */
  getPreviousTier(currentScore) {
    const currentTier = this.getReputationTier(currentScore);
    const currentIndex = this.reputationTiers.findIndex(t => t.name === currentTier.name);
    
    if (currentIndex > 0) {
      const prevTier = this.reputationTiers[currentIndex - 1];
      return {
        name: prevTier.name,
        maxScore: prevTier.maxScore,
        pointsToLose: currentScore - prevTier.maxScore,
        stakePercentage: prevTier.stakePercentage
      };
    }
    
    return null;
  }
}

// Export singleton instance
export const reputationService = new ReputationService();