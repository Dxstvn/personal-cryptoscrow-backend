// src/api/routes/transaction/__tests__/integration/disputeStaking.integration.test.js
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import admin from 'firebase-admin';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

// Test configuration
const TEST_TIMEOUT = 120000;

describe('Dispute Staking Integration Tests', () => {
  let expressApp;
  let db;
  let auth;
  let databaseService;
  let escrowService;
  let reputationService;
  let transactionRoutes;
  let testUsers = {};
  let authTokens = {};

  beforeAll(async () => {
    console.log('[Test] Initializing dispute staking tests...');

    // Set up Firebase emulators
    process.env.FIRESTORE_EMULATOR_HOST = 'localhost:5004';
    process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099';
    process.env.NODE_ENV = 'test';
    
    // Initialize default Firebase admin app (not named)
    if (admin.apps.length === 0) {
      admin.initializeApp({
        projectId: 'demo-test'
      });
    }

    db = getFirestore();
    auth = getAuth();
    
    // Import and reset database service
    const dbModule = await import('../../../../../services/databaseService.js');
    dbModule.resetDbInstance();
    databaseService = dbModule;
    
    // Import services after Firebase is initialized
    const { EscrowServiceV3 } = await import('../../../../../services/escrowServiceV3.js');
    const { ReputationService } = await import('../../../../../services/reputationService.js');
    const routes = await import('../../transactionRoutes.js');
    transactionRoutes = routes.default;
    
    escrowService = new EscrowServiceV3();
    reputationService = new ReputationService();

    // Note: This test doesn't need actual blockchain contracts
    // It's testing the API layer with Firebase integration

    // Set up Express app
    expressApp = express();
    expressApp.use(express.json());
    
    // Mock authentication middleware
    expressApp.use((req, res, next) => {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        const userId = Object.keys(authTokens).find(uid => authTokens[uid] === token);
        if (userId) {
          req.user = { uid: userId };
        }
      }
      next();
    });

    expressApp.use('/api/transaction', transactionRoutes);

    // Create test users with different reputation levels
    const userConfigs = [
      { uid: 'buyer1', email: 'buyer1@test.com', reputation: 950, wallet: '0x1234567890123456789012345678901234567890' },
      { uid: 'seller1', email: 'seller1@test.com', reputation: 800, wallet: '0x2345678901234567890123456789012345678901' },
      { uid: 'buyer2', email: 'buyer2@test.com', reputation: 600, wallet: '0x3456789012345678901234567890123456789012' },
      { uid: 'seller2', email: 'seller2@test.com', reputation: 300, wallet: '0x4567890123456789012345678901234567890123' }
    ];

    for (const config of userConfigs) {
      // Create user in Auth
      await auth.createUser({
        uid: config.uid,
        email: config.email,
        emailVerified: true
      });

      // Create user document with reputation
      await db.collection('users').doc(config.uid).set({
        userId: config.uid,
        email: config.email,
        reputationScore: config.reputation,
        walletAddress: config.wallet,
        createdAt: Timestamp.now()
      });

      // Generate mock auth token
      authTokens[config.uid] = `mock-token-${config.uid}`;
      
      testUsers[config.uid] = config;
    }
  }, TEST_TIMEOUT);

  afterAll(async () => {
    console.log('[Test] Cleaning up dispute staking tests...');
    
    // Clean up users
    for (const userId of Object.keys(testUsers)) {
      try {
        await auth.deleteUser(userId);
      } catch (error) {
        console.error(`Error deleting user ${userId}:`, error.message);
      }
    }

    // Clean up Firebase admin apps
    const apps = admin.apps;
    await Promise.all(apps.map(app => app.delete()));
    
    // Reset environment
    delete process.env.FIRESTORE_EMULATOR_HOST;
    delete process.env.FIREBASE_AUTH_EMULATOR_HOST;
  });

  beforeEach(async () => {
    // Clear test data
    const collections = ['deals', 'disputeStakes', 'reputationHistory'];
    for (const collection of collections) {
      const snapshot = await db.collection(collection).get();
      const batch = db.batch();
      snapshot.docs.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
    }
  });

  describe('Dispute Creation with Staking', () => {
    it('should calculate and require correct stake for dispute', async () => {
      // Create a deal first
      const dealData = {
        buyer: testUsers.buyer1.uid,
        seller: testUsers.seller1.uid,
        amount: 10000,
        currency: 'USDC',
        description: 'Test deal for staking',
        conditions: [
          { description: 'Delivery confirmation', status: 'met' },
          { description: 'Quality verification', status: 'met' }
        ],
        status: 'active',
        participants: [testUsers.buyer1.uid, testUsers.seller1.uid],
        createdAt: Timestamp.now(),
        conditionsMetAt: Timestamp.now() // All conditions met
      };

      const dealRef = await db.collection('deals').add(dealData);
      const dealId = dealRef.id;

      // Get stake requirements
      const stakeResponse = await request(expressApp)
        .get(`/api/transaction/dispute/stake-requirements?dealId=${dealId}`)
        .set('Authorization', `Bearer ${authTokens.buyer1}`)
        .expect(200);

      expect(stakeResponse.body.data).toMatchObject({
        reputationScore: 950,
        reputationLevel: 'Excellent',
        stakePercentage: 0.025,
        requiredStake: 250, // 2.5% of 10,000
        currency: 'USDC',
        transactionAmount: 10000
      });

      // Raise dispute with stake
      const disputeResponse = await request(expressApp)
        .post(`/api/transaction/${dealId}/dispute`)
        .set('Authorization', `Bearer ${authTokens.buyer1}`)
        .send({
          reason: 'Product quality not as described',
          evidence: ['photo1.jpg', 'photo2.jpg'],
          stakeToken: 'USDC' // This triggers staking in the route
        })
        .expect(200);

      expect(disputeResponse.body.message).toContain('Dispute raised successfully');

      // Verify stake was recorded
      const stakeSnapshot = await db.collection('disputeStakes')
        .where('userId', '==', testUsers.buyer1.uid)
        .where('dealId', '==', dealId)
        .get();

      expect(stakeSnapshot.empty).toBe(false);
      const stake = stakeSnapshot.docs[0].data();
      expect(stake).toMatchObject({
        userId: testUsers.buyer1.uid,
        dealId: dealId,
        transactionAmount: 10000,
        stakeAmount: 250,
        stakePercentage: 0.025,
        status: 'locked',
        reputationScoreAtStake: 950
      });
    });

    it('should reject dispute if user cannot afford stake', async () => {
      // Create a large deal
      const dealData = {
        buyer: testUsers.buyer2.uid,
        seller: testUsers.seller2.uid,
        amount: 100000, // Large amount
        currency: 'USDC',
        status: 'active',
        participants: [testUsers.buyer2.uid, testUsers.seller2.uid],
        conditions: [{ description: 'Test', status: 'met' }],
        conditionsMetAt: Timestamp.now(),
        createdAt: Timestamp.now()
      };

      const dealRef = await db.collection('deals').add(dealData);
      const dealId = dealRef.id;

      // Buyer2 has 600 reputation (Standard tier = 5% stake)
      // Required stake = 100,000 * 0.05 = 5,000 USDC

      // Mock insufficient balance check (would normally check blockchain)
      const disputeResponse = await request(expressApp)
        .post(`/api/transaction/${dealId}/dispute`)
        .set('Authorization', `Bearer ${authTokens.buyer2}`)
        .send({
          reason: 'Cannot afford the stake',
          stakeToken: 'USDC'
        });

      if (disputeResponse.status !== 400) {
        console.log('Dispute response:', disputeResponse.body);
        console.log('Deal amount:', 100000);
        console.log('Expected stake:', 100000 * 0.05);
      }
      
      expect(disputeResponse.status).toBe(400);
      expect(disputeResponse.body.error || disputeResponse.body.message).toMatch(/Insufficient balance|insufficient funds|balance for stake/);
    });

    it('should handle different reputation tiers correctly', async () => {
      // Test with Probation tier user (seller2 has 300 reputation)
      const dealData = {
        buyer: testUsers.buyer1.uid,
        seller: testUsers.seller2.uid,
        amount: 5000,
        currency: 'USDC',
        status: 'active',
        participants: [testUsers.buyer1.uid, testUsers.seller2.uid],
        conditions: [{ description: 'Test', status: 'met' }],
        conditionsMetAt: Timestamp.now(),
        createdAt: Timestamp.now()
      };

      const dealRef = await db.collection('deals').add(dealData);
      const dealId = dealRef.id;

      // Get stake requirements for seller (Probation tier)
      const stakeResponse = await request(expressApp)
        .get(`/api/transaction/dispute/stake-requirements?dealId=${dealId}`)
        .set('Authorization', `Bearer ${authTokens.seller2}`)
        .expect(200);

      expect(stakeResponse.body.data).toMatchObject({
        reputationScore: 300,
        reputationLevel: 'Probation',
        stakePercentage: 0.07,
        requiredStake: 350, // 7% of 5,000
        currency: 'USDC'
      });
    });
  });

  describe('Dispute Resolution with Stake Handling', () => {
    let disputedDealId;
    let stakeId;

    beforeEach(async () => {
      // Create a disputed deal with stake
      const dealData = {
        buyer: testUsers.buyer1.uid,
        seller: testUsers.seller1.uid,
        amount: 8000,
        currency: 'USDC',
        status: 'disputed',
        disputeReason: 'Quality issue',
        disputeInitiator: testUsers.buyer1.uid,
        participants: [testUsers.buyer1.uid, testUsers.seller1.uid],
        conditions: [{ description: 'Test', status: 'met' }],
        conditionsMetAt: Timestamp.now(),
        disputedAt: Timestamp.now(),
        createdAt: Timestamp.now()
      };

      const dealRef = await db.collection('deals').add(dealData);
      disputedDealId = dealRef.id;

      // Record the stake
      const stakeRef = await db.collection('disputeStakes').add({
        userId: testUsers.buyer1.uid,
        dealId: disputedDealId,
        transactionAmount: 8000,
        stakeAmount: 200, // 2.5% of 8000
        stakePercentage: 0.025,
        stakeToken: 'USDC',
        reputationScoreAtStake: 950,
        status: 'locked',
        createdAt: Timestamp.now()
      });
      stakeId = stakeRef.id;

      // Update deal with stakeId
      await dealRef.update({ stakeId: stakeId });
      
      // Reset buyer1's reputation to 950 for consistent test runs
      await db.collection('users').doc(testUsers.buyer1.uid).update({
        reputationScore: 950
      });
    });

    it('should return stake for valid dispute (resolved in buyer favor)', async () => {
      // Admin resolves dispute in buyer's favor
      const resolveResponse = await request(expressApp)
        .post(`/api/transaction/${disputedDealId}/resolve`)
        .set('Authorization', `Bearer ${authTokens.buyer1}`) // In real app, this would be admin
        .send({
          resolution: 'refund_buyer',
          reason: 'Product was indeed defective',
          slashPercentage: 0 // Full stake return
        });

      console.log('Resolve response body:', JSON.stringify(resolveResponse.body, null, 2));
      console.log('Status:', resolveResponse.status);
      
      expect(resolveResponse.status).toBe(200);
      expect(resolveResponse.body.message).toContain('Dispute resolved');

      // Verify stake was returned
      const stake = await db.collection('disputeStakes').doc(stakeId).get();
      expect(stake.data()).toMatchObject({
        status: 'returned',
        outcome: 'resolved_in_favor'
      });

      // Verify reputation unchanged
      const user = await db.collection('users').doc(testUsers.buyer1.uid).get();
      expect(user.data().reputationScore).toBe(950);
    });

    it('should slash stake for invalid dispute', async () => {
      // Debug: Check deal exists
      const dealCheck = await db.collection('deals').doc(disputedDealId).get();
      console.log('Deal exists:', dealCheck.exists);
      console.log('Deal ID:', disputedDealId);
      console.log('Stake ID:', dealCheck.data()?.stakeId);
      
      // Admin resolves dispute against buyer
      const resolveResponse = await request(expressApp)
        .post(`/api/transaction/${disputedDealId}/resolve`)
        .set('Authorization', `Bearer ${authTokens.seller1}`) // In real app, this would be admin
        .send({
          resolution: 'release_to_seller',
          reason: 'No evidence of quality issues',
          slashPercentage: 100 // Full slash
        });

      if (resolveResponse.status !== 200) {
        console.error('Slash stake error:', JSON.stringify(resolveResponse.body, null, 2));
        console.error('Response status:', resolveResponse.status);
        console.error('Deal ID was:', disputedDealId);
        console.error('Full response:', resolveResponse.text);
      }
      expect(resolveResponse.status).toBe(200);

      // Verify stake was slashed
      const stake = await db.collection('disputeStakes').doc(stakeId).get();
      expect(stake.data()).toMatchObject({
        status: 'slashed',
        outcome: 'resolved_against',
        amountSlashed: 200
      });

      // Verify reputation decreased
      const user = await db.collection('users').doc(testUsers.buyer1.uid).get();
      expect(user.data().reputationScore).toBe(850); // 950 - 100
    });

    it('should handle partial resolution', async () => {
      // Admin partially resolves dispute
      const resolveResponse = await request(expressApp)
        .post(`/api/transaction/${disputedDealId}/resolve`)
        .set('Authorization', `Bearer ${authTokens.buyer1}`) // In real app, this would be admin
        .send({
          resolution: 'partial_refund',
          refundAmount: 4000, // 50% refund
          reason: 'Some issues found but not all claims valid',
          slashPercentage: 40 // 40% slash, 60% return
        })
        .expect(200);

      // Verify partial stake handling
      const stake = await db.collection('disputeStakes').doc(stakeId).get();
      expect(stake.data()).toMatchObject({
        status: 'partial_return',
        outcome: 'partial_return',
        amountReturned: 120, // 60% of 200
        amountSlashed: 80    // 40% of 200
      });

      // Verify reputation slightly decreased
      const user = await db.collection('users').doc(testUsers.buyer1.uid).get();
      expect(user.data().reputationScore).toBe(900); // 950 - 50
    });
  });

  describe('Reputation Impact on Future Stakes', () => {
    it('should increase stake requirements after reputation loss', async () => {
      const userId = testUsers.buyer2.uid;
      
      // Initial reputation: 600 (Standard tier, 5% stake)
      let stakeReq = await reputationService.calculateStakeRequirement(userId, 10000);
      expect(stakeReq.stakePercentage).toBe(0.05);
      expect(stakeReq.requiredStake).toBe(500);

      // Simulate reputation loss
      await reputationService.updateReputationScore(userId, -150, 'Multiple invalid disputes');

      // New reputation: 450 (Probation tier, 7% stake)
      stakeReq = await reputationService.calculateStakeRequirement(userId, 10000);
      expect(stakeReq.stakePercentage).toBe(0.07);
      expect(stakeReq.requiredStake).toBe(700);

      // Verify via API
      const dealRef = await db.collection('deals').add({
        buyer: userId,
        seller: testUsers.seller1.uid,
        amount: 10000,
        status: 'active',
        participants: [userId, testUsers.seller1.uid],
        createdAt: Timestamp.now()
      });

      const response = await request(expressApp)
        .get(`/api/transaction/dispute/stake-requirements?dealId=${dealRef.id}`)
        .set('Authorization', `Bearer ${authTokens.buyer2}`)
        .expect(200);

      expect(response.body.data.stakePercentage).toBe(0.07);
      expect(response.body.data.requiredStake).toBe(700);
    });
  });

  describe('API Endpoint Tests', () => {
    it('should get user reputation stats', async () => {
      // Create some dispute history
      const userId = testUsers.seller1.uid;
      
      // Add dispute stakes
      await db.collection('disputeStakes').add({
        userId: userId,
        dealId: 'deal1',
        transactionAmount: 5000,
        stakeAmount: 175,
        stakePercentage: 0.035,
        status: 'returned',
        outcome: 'resolved_in_favor',
        createdAt: Timestamp.now()
      });

      await db.collection('disputeStakes').add({
        userId: userId,
        dealId: 'deal2',
        transactionAmount: 3000,
        stakeAmount: 105,
        stakePercentage: 0.035,
        status: 'slashed',
        outcome: 'resolved_against',
        createdAt: Timestamp.now()
      });

      const response = await request(expressApp)
        .get('/api/transaction/reputation/stats')
        .set('Authorization', `Bearer ${authTokens.seller1}`)
        .expect(200);

      expect(response.body.data).toMatchObject({
        userId: userId,
        reputationScore: 800,
        reputationLevel: 'Good',
        currentStakePercentage: 0.035,
        disputeStats: {
          totalDisputes: 2,
          successfulDisputes: 1,
          failedDisputes: 1,
          totalStaked: 280,
          totalReturned: 175,
          totalSlashed: 105
        }
      });
    });

    it('should get dispute history with stake information', async () => {
      const userId = testUsers.buyer1.uid;
      
      // Add some disputes
      const disputes = [
        {
          userId: userId,
          dealId: 'deal1',
          transactionAmount: 10000,
          stakeAmount: 250,
          stakePercentage: 0.025,
          status: 'returned',
          outcome: 'resolved_in_favor',
          createdAt: Timestamp.fromDate(new Date('2024-01-01'))
        },
        {
          userId: userId,
          dealId: 'deal2',
          transactionAmount: 5000,
          stakeAmount: 125,
          stakePercentage: 0.025,
          status: 'slashed',
          outcome: 'resolved_against',
          createdAt: Timestamp.fromDate(new Date('2024-01-15'))
        }
      ];

      for (const dispute of disputes) {
        await db.collection('disputeStakes').add(dispute);
      }

      const response = await request(expressApp)
        .get('/api/transaction/disputes/history')
        .set('Authorization', `Bearer ${authTokens.buyer1}`)
        .expect(200);

      expect(response.body.data.disputes).toHaveLength(2);
      expect(response.body.data.totalStaked).toBe(375);
      expect(response.body.data.successRate).toBe(0.5);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle missing stake requirements gracefully', async () => {
      const response = await request(expressApp)
        .get('/api/transaction/dispute/stake-requirements?dealId=nonexistent')
        .set('Authorization', `Bearer ${authTokens.buyer1}`)
        .expect(404);

      expect(response.body.error || response.body.message).toMatch(/Deal not found|not found/);
    });

    it('should prevent non-participants from raising disputes', async () => {
      // Create deal between buyer1 and seller1
      const dealRef = await db.collection('deals').add({
        buyer: testUsers.buyer1.uid,
        seller: testUsers.seller1.uid,
        amount: 5000,
        status: 'active',
        participants: [testUsers.buyer1.uid, testUsers.seller1.uid],
        createdAt: Timestamp.now()
      });

      // buyer2 tries to raise dispute
      const response = await request(expressApp)
        .post(`/api/transaction/${dealRef.id}/dispute`)
        .set('Authorization', `Bearer ${authTokens.buyer2}`)
        .send({
          reason: 'Not my deal',
          stakeToken: 'USDC'
        })
        .expect(403);

      expect(response.body.error || response.body.message).toMatch(/not authorized|Not authorized/);
    });

    it('should handle concurrent dispute attempts', async () => {
      const dealRef = await db.collection('deals').add({
        buyer: testUsers.buyer1.uid,
        seller: testUsers.seller1.uid,
        amount: 5000,
        status: 'active',
        conditions: [{ description: 'Test', status: 'met' }],
        conditionsMetAt: Timestamp.now(),
        participants: [testUsers.buyer1.uid, testUsers.seller1.uid],
        createdAt: Timestamp.now()
      });

      const dealId = dealRef.id;

      // Both parties try to dispute simultaneously
      const promises = [
        request(expressApp)
          .post(`/api/transaction/${dealId}/dispute`)
          .set('Authorization', `Bearer ${authTokens.buyer1}`)
          .send({ reason: 'Buyer dispute', stakeToken: 'USDC' }),
        
        request(expressApp)
          .post(`/api/transaction/${dealId}/dispute`)
          .set('Authorization', `Bearer ${authTokens.seller1}`)
          .send({ reason: 'Seller dispute', stakeToken: 'USDC' })
      ];

      const results = await Promise.allSettled(promises);
      
      // One should succeed, one should fail
      const successCount = results.filter(r => r.status === 'fulfilled' && r.value.status === 200).length;
      const failCount = results.filter(r => r.status === 'fulfilled' && r.value.status === 400).length;
      
      expect(successCount).toBe(1);
      expect(failCount).toBe(1);
    });
  });
});