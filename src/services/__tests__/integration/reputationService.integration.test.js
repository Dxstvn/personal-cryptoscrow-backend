// src/services/__tests__/integration/reputationService.integration.test.js
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { ReputationService } from '../../reputationService.js';
import * as databaseService from '../../databaseService.js';

// Mock blockchain interactions
vi.mock('../../escrowServiceV3.js', () => ({
  EscrowServiceV3: vi.fn().mockImplementation(() => ({
    raiseDisputeWithStake: vi.fn().mockResolvedValue({
      transactionHash: '0xmocked123',
      blockNumber: 12345,
      success: true
    }),
    resolveDispute: vi.fn().mockResolvedValue({
      transactionHash: '0xmocked456',
      blockNumber: 12346,
      success: true
    })
  }))
}));

describe('ReputationService Integration Tests', () => {
  let app;
  let db;
  let auth;
  let reputationService;
  let testUsers = {};

  beforeAll(async () => {
    console.log('[Test] Starting ReputationService integration tests...');
    
    // Initialize Firebase with emulator settings
    process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
    process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099';
    
    app = initializeApp({
      projectId: 'test-project',
      databaseURL: 'http://localhost:8080'
    }, 'reputation-integration-test');

    db = getFirestore(app);
    auth = getAuth(app);
    
    // Initialize services
    reputationService = new ReputationService();

    // Create test users with various reputation scores
    const userConfigs = [
      { uid: 'newUser', email: 'new@test.com' }, // No reputation - should default to 1000
      { uid: 'excellentUser', email: 'excellent@test.com', reputation: 950 },
      { uid: 'goodUser', email: 'good@test.com', reputation: 800 },
      { uid: 'standardUser', email: 'standard@test.com', reputation: 600 },
      { uid: 'probationUser', email: 'probation@test.com', reputation: 300 },
      { uid: 'restrictedUser', email: 'restricted@test.com', reputation: 100 }
    ];

    for (const config of userConfigs) {
      const userRecord = await auth.createUser({
        uid: config.uid,
        email: config.email,
        emailVerified: true
      });

      // Only set reputation if specified
      if (config.reputation !== undefined) {
        await db.collection('users').doc(config.uid).set({
          userId: config.uid,
          email: config.email,
          reputationScore: config.reputation,
          createdAt: Timestamp.now()
        });
      }

      testUsers[config.uid] = {
        ...userRecord,
        reputation: config.reputation || 1000
      };
    }
  }, 60000);

  afterAll(async () => {
    console.log('[Test] Cleaning up...');
    
    // Clean up test users
    for (const userId of Object.keys(testUsers)) {
      try {
        await auth.deleteUser(userId);
      } catch (error) {
        console.error(`[Test] Error deleting user ${userId}:`, error.message);
      }
    }

    // Clean up Firestore collections
    const collections = ['users', 'deals', 'disputeStakes', 'reputationHistory'];
    for (const collection of collections) {
      const snapshot = await db.collection(collection).get();
      const batch = db.batch();
      snapshot.docs.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
    }

    // Clean up Firebase app
    await deleteApp(app);
  });

  beforeEach(async () => {
    // Clear dispute-related collections before each test
    const collections = ['disputeStakes', 'reputationHistory'];
    for (const collection of collections) {
      const snapshot = await db.collection(collection).get();
      const batch = db.batch();
      snapshot.docs.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
    }
  });

  describe('Database Operations', () => {
    it('should correctly store and retrieve reputation scores', async () => {
      // Test new user default
      const newUserScore = await reputationService.getUserReputationScore('newUser');
      expect(newUserScore).toBe(1000);

      // Test existing user scores
      const excellentScore = await reputationService.getUserReputationScore('excellentUser');
      expect(excellentScore).toBe(950);

      const restrictedScore = await reputationService.getUserReputationScore('restrictedUser');
      expect(restrictedScore).toBe(100);
    });

    it('should persist reputation updates to database', async () => {
      const userId = 'goodUser';
      
      // Update reputation
      const result = await reputationService.updateReputationScore(
        userId,
        -50,
        'Test penalty'
      );

      expect(result.previousScore).toBe(800);
      expect(result.newScore).toBe(750);

      // Verify persisted to database
      const userDoc = await db.collection('users').doc(userId).get();
      expect(userDoc.data().reputationScore).toBe(750);

      // Verify reputation history created
      const historySnapshot = await db.collection('reputationHistory')
        .where('userId', '==', userId)
        .get();

      expect(historySnapshot.empty).toBe(false);
      const history = historySnapshot.docs[0].data();
      expect(history).toMatchObject({
        userId: userId,
        previousScore: 800,
        newScore: 750,
        pointsChanged: -50,
        reason: 'Test penalty'
      });
    });

    it('should handle concurrent reputation updates correctly', async () => {
      const userId = 'standardUser';
      
      // Simulate concurrent updates
      const updates = [
        reputationService.updateReputationScore(userId, -20, 'Update 1'),
        reputationService.updateReputationScore(userId, -30, 'Update 2'),
        reputationService.updateReputationScore(userId, -10, 'Update 3')
      ];

      const results = await Promise.all(updates);

      // Final score should reflect all updates
      const finalScore = await reputationService.getUserReputationScore(userId);
      
      // One of the updates should see 600 as previous, others will see intermediate values
      const totalPointsLost = results.reduce((sum, r) => sum + r.pointsChanged, 0);
      expect(totalPointsLost).toBe(-60);
      expect(finalScore).toBeLessThanOrEqual(600 - 60); // May be less due to race conditions
    });
  });

  describe('Dispute Stake Recording', () => {
    it('should create complete dispute stake records', async () => {
      const stakeData = {
        userId: 'excellentUser',
        dealId: 'test-deal-123',
        transactionAmount: 10000,
        stakeAmount: 250,
        stakePercentage: 0.025,
        stakeToken: 'USDC',
        txHash: '0xtest123'
      };

      const stakeId = await reputationService.recordDisputeStake(stakeData);
      expect(stakeId).toBeTruthy();

      // Verify stake record
      const stakeDoc = await db.collection('disputeStakes').doc(stakeId).get();
      expect(stakeDoc.exists).toBe(true);
      
      const savedData = stakeDoc.data();
      expect(savedData).toMatchObject({
        ...stakeData,
        status: 'locked',
        reputationScoreAtStake: 950,
        createdAt: expect.any(Object)
      });
    });

    it('should track multiple stakes per user', async () => {
      const userId = 'goodUser';
      const stakeIds = [];

      // Create multiple stakes
      for (let i = 0; i < 3; i++) {
        const stakeId = await reputationService.recordDisputeStake({
          userId: userId,
          dealId: `deal-${i}`,
          transactionAmount: 1000 * (i + 1),
          stakeAmount: 35 * (i + 1), // 3.5% for Good tier
          stakePercentage: 0.035
        });
        stakeIds.push(stakeId);
      }

      // Verify all stakes exist
      for (const stakeId of stakeIds) {
        const stake = await db.collection('disputeStakes').doc(stakeId).get();
        expect(stake.exists).toBe(true);
        expect(stake.data().userId).toBe(userId);
      }

      // Get user dispute history
      const history = await reputationService.getUserDisputeHistory(userId);
      expect(history.disputes).toHaveLength(3);
      expect(history.totalStaked).toBe(35 + 70 + 105); // 210
    });
  });

  describe('Dispute Resolution Updates', () => {
    it('should update database correctly for resolved_in_favor', async () => {
      const userId = 'excellentUser';
      
      // Create stake
      const stakeId = await reputationService.recordDisputeStake({
        userId: userId,
        dealId: 'favor-deal',
        transactionAmount: 5000,
        stakeAmount: 125,
        stakePercentage: 0.025
      });

      // Resolve in favor
      await reputationService.updateDisputeStakeStatus(stakeId, {
        status: 'returned',
        outcome: 'resolved_in_favor',
        txHash: '0xresolved123'
      });

      // Verify stake updated
      const stake = await db.collection('disputeStakes').doc(stakeId).get();
      expect(stake.data()).toMatchObject({
        status: 'returned',
        outcome: 'resolved_in_favor',
        resolvedAt: expect.any(Object)
      });

      // Verify reputation unchanged
      const score = await reputationService.getUserReputationScore(userId);
      expect(score).toBe(950);
    });

    it('should update database and reputation for resolved_against', async () => {
      const userId = 'goodUser';
      
      // Create stake
      const stakeId = await reputationService.recordDisputeStake({
        userId: userId,
        dealId: 'against-deal',
        transactionAmount: 2000,
        stakeAmount: 70,
        stakePercentage: 0.035
      });

      // Resolve against
      await reputationService.updateDisputeStakeStatus(stakeId, {
        status: 'slashed',
        outcome: 'resolved_against'
      });

      // Verify stake updated
      const stake = await db.collection('disputeStakes').doc(stakeId).get();
      expect(stake.data().status).toBe('slashed');
      expect(stake.data().outcome).toBe('resolved_against');

      // Verify reputation decreased by 100
      const score = await reputationService.getUserReputationScore(userId);
      expect(score).toBe(700); // 800 - 100

      // Verify reputation history
      const history = await db.collection('reputationHistory')
        .where('userId', '==', userId)
        .orderBy('timestamp', 'desc')
        .limit(1)
        .get();

      expect(history.docs[0].data()).toMatchObject({
        userId: userId,
        previousScore: 800,
        newScore: 700,
        pointsChanged: -100,
        reason: 'Invalid dispute raised - reputation decreased'
      });
    });

    it('should handle partial returns with reputation penalty', async () => {
      const userId = 'standardUser';
      
      // Create stake
      const stakeId = await reputationService.recordDisputeStake({
        userId: userId,
        dealId: 'partial-deal',
        transactionAmount: 4000,
        stakeAmount: 200, // 5% for Standard tier
        stakePercentage: 0.05
      });

      // Partial resolution
      await reputationService.updateDisputeStakeStatus(stakeId, {
        status: 'partial_return',
        outcome: 'partial_return',
        amountReturned: 120, // 60% returned
        amountSlashed: 80    // 40% slashed
      });

      // Verify stake updated with amounts
      const stake = await db.collection('disputeStakes').doc(stakeId).get();
      expect(stake.data()).toMatchObject({
        status: 'partial_return',
        outcome: 'partial_return',
        amountReturned: 120,
        amountSlashed: 80
      });

      // Verify reputation decreased by 50
      const score = await reputationService.getUserReputationScore(userId);
      expect(score).toBe(550); // 600 - 50
    });
  });

  describe('Dispute History Tracking', () => {
    it('should accurately track dispute statistics', async () => {
      const userId = 'probationUser';
      
      // Create multiple disputes with different outcomes
      const disputes = [
        { dealId: 'd1', amount: 1000, outcome: 'resolved_in_favor' },
        { dealId: 'd2', amount: 2000, outcome: 'resolved_against' },
        { dealId: 'd3', amount: 1500, outcome: 'partial_return', returned: 75, slashed: 30 }
      ];

      const stakeIds = [];
      for (const dispute of disputes) {
        const stake = await reputationService.calculateStakeRequirement(userId, dispute.amount);
        const stakeId = await reputationService.recordDisputeStake({
          userId: userId,
          dealId: dispute.dealId,
          transactionAmount: dispute.amount,
          stakeAmount: stake.requiredStake,
          stakePercentage: stake.stakePercentage
        });
        stakeIds.push({ id: stakeId, dispute });
      }

      // Resolve disputes
      await reputationService.updateDisputeStakeStatus(stakeIds[0].id, {
        status: 'returned',
        outcome: 'resolved_in_favor'
      });

      await reputationService.updateDisputeStakeStatus(stakeIds[1].id, {
        status: 'slashed',
        outcome: 'resolved_against'
      });

      await reputationService.updateDisputeStakeStatus(stakeIds[2].id, {
        status: 'partial_return',
        outcome: 'partial_return',
        amountReturned: 75,
        amountSlashed: 30
      });

      // Get dispute history
      const history = await reputationService.getUserDisputeHistory(userId);

      expect(history.disputeCount).toBe(3);
      expect(history.successRate).toBeCloseTo(0.333, 2); // 1/3
      expect(history.totalStaked).toBe(70 + 140 + 105); // 315 total
      expect(history.totalReturned).toBe(70 + 75); // 145
      expect(history.totalSlashed).toBe(140 + 30); // 170
    });

    it('should include timestamp and transaction details in history', async () => {
      const userId = 'excellentUser';
      
      const stakeId = await reputationService.recordDisputeStake({
        userId: userId,
        dealId: 'timestamp-deal',
        transactionAmount: 3000,
        stakeAmount: 75,
        stakePercentage: 0.025,
        txHash: '0xstake123'
      });

      await reputationService.updateDisputeStakeStatus(stakeId, {
        status: 'returned',
        outcome: 'resolved_in_favor',
        txHash: '0xresolve123'
      });

      const history = await reputationService.getUserDisputeHistory(userId);
      
      expect(history.disputes[0]).toMatchObject({
        disputeId: stakeId,
        dealId: 'timestamp-deal',
        transactionAmount: 3000,
        stakeAmount: 75,
        outcome: 'resolved_in_favor',
        createdAt: expect.any(Object)
      });
    });
  });

  describe('User Statistics Integration', () => {
    it('should provide comprehensive user statistics', async () => {
      const userId = 'goodUser';
      
      // Create some dispute history
      const stake1 = await reputationService.recordDisputeStake({
        userId: userId,
        dealId: 'stat-deal-1',
        transactionAmount: 5000,
        stakeAmount: 175,
        stakePercentage: 0.035
      });

      await reputationService.updateDisputeStakeStatus(stake1, {
        status: 'returned',
        outcome: 'resolved_in_favor'
      });

      // Get comprehensive stats
      const stats = await reputationService.getUserReputationStats(userId);

      expect(stats).toMatchObject({
        userId: userId,
        reputationScore: 800,
        reputationLevel: 'Good',
        currentStakePercentage: 0.035,
        disputeStats: {
          totalDisputes: 1,
          successfulDisputes: 1,
          failedDisputes: 0,
          totalStaked: 175,
          totalReturned: 175,
          totalSlashed: 0
        }
      });

      expect(stats.nextTier).toMatchObject({
        name: 'Excellent',
        requiredScore: 900,
        pointsNeeded: 100
      });

      expect(stats.previousTier).toMatchObject({
        name: 'Standard',
        maxScore: 749,
        pointsToLose: 51
      });
    });
  });

  describe('Error Recovery and Edge Cases', () => {
    it('should handle missing user documents gracefully', async () => {
      const nonExistentUser = 'ghost-user';
      
      // Should return default reputation
      const score = await reputationService.getUserReputationScore(nonExistentUser);
      expect(score).toBe(1000);

      // Should calculate stake based on default
      const stake = await reputationService.calculateStakeRequirement(nonExistentUser, 1000);
      expect(stake).toMatchObject({
        reputationScore: 1000,
        reputationLevel: 'Excellent',
        stakePercentage: 0.025,
        requiredStake: 25
      });
    });

    it('should handle database transaction failures', async () => {
      const userId = 'standardUser';
      
      // Mock a database error
      const originalUpdate = db.collection('users').doc(userId).set;
      db.collection('users').doc(userId).set = vi.fn().mockRejectedValue(new Error('DB Error'));

      try {
        await reputationService.updateReputationScore(userId, -50, 'Test');
      } catch (error) {
        expect(error.message).toBe('DB Error');
      }

      // Restore original function
      db.collection('users').doc(userId).set = originalUpdate;

      // Verify reputation unchanged
      const score = await reputationService.getUserReputationScore(userId);
      expect(score).toBe(600);
    });

    it('should validate data integrity in dispute records', async () => {
      const userId = 'restrictedUser';
      
      // Create stake with mismatched percentage (service doesn't validate)
      const stakeId = await reputationService.recordDisputeStake({
        userId: userId,
        dealId: 'mismatch-deal',
        transactionAmount: 1000,
        stakeAmount: 50, // Should be 100 for 10% restricted tier
        stakePercentage: 0.05 // Wrong percentage
      });

      // Verify it was saved as provided
      const stake = await db.collection('disputeStakes').doc(stakeId).get();
      expect(stake.data().stakeAmount).toBe(50);
      expect(stake.data().stakePercentage).toBe(0.05);
      
      // The service records what's provided without validation
      // Validation should happen at API layer
    });
  });

  describe('Performance with Large Datasets', () => {
    it('should efficiently handle users with many disputes', async () => {
      const userId = 'standardUser';
      const disputeCount = 20;

      // Create many disputes
      const startTime = Date.now();
      const promises = [];

      for (let i = 0; i < disputeCount; i++) {
        promises.push(
          reputationService.recordDisputeStake({
            userId: userId,
            dealId: `perf-deal-${i}`,
            transactionAmount: 1000 + (i * 100),
            stakeAmount: 50 + (i * 5),
            stakePercentage: 0.05
          })
        );
      }

      const stakeIds = await Promise.all(promises);
      const creationTime = Date.now() - startTime;

      // Should create all stakes quickly
      expect(stakeIds).toHaveLength(disputeCount);
      expect(creationTime).toBeLessThan(5000); // Under 5 seconds

      // Get history efficiently
      const historyStart = Date.now();
      const history = await reputationService.getUserDisputeHistory(userId);
      const historyTime = Date.now() - historyStart;

      expect(history.disputeCount).toBe(disputeCount);
      expect(historyTime).toBeLessThan(1000); // Under 1 second
    });
  });
});