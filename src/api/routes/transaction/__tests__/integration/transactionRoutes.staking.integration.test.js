// src/api/routes/transaction/__tests__/integration/transactionRoutes.staking.integration.test.js
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import * as databaseService from '../../../../../services/databaseService.js';
import { EscrowServiceV3 } from '../../../../../services/escrowServiceV3.js';
import { ReputationService } from '../../../../../services/reputationService.js';
import transactionRoutes from '../../transactionRoutes.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';
import { ethers } from 'ethers';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test configuration
const TEST_TIMEOUT = 180000; // 3 minutes for complex blockchain operations

describe('Transaction Routes - Staking Integration Tests', () => {
  let app;
  let expressApp;
  let db;
  let auth;
  let databaseService;
  let escrowService;
  let reputationService;
  let testUsers = {};
  let authTokens = {};
  let contractAddress;
  let provider;
  let signer;

  beforeAll(async () => {
    console.log('[Test] Starting full staking integration tests...');

    // Start Hardhat node
    const contractDir = path.join(__dirname, '../../../../../../contract');
    try {
      console.log('[Test] Checking if Hardhat is running...');
      // Check if hardhat is already running by trying to connect
      const testProvider = new ethers.providers.JsonRpcProvider('http://localhost:8545');
      await testProvider.getNetwork();
      console.log('[Test] Hardhat already running');
    } catch (error) {
      console.log('[Test] Hardhat not running, skipping contract deployment for this test');
      // For integration tests, we can skip blockchain tests if hardhat isn't running
    }

    // Only deploy contracts if hardhat is available
    let hardhatAvailable = false;
    try {
      const testProvider = new ethers.providers.JsonRpcProvider('http://localhost:8545');
      await testProvider.getNetwork();
      hardhatAvailable = true;
      
      // Deploy contracts
      console.log('[Test] Deploying contracts...');
      const deployResult = await execAsync(
        'npx hardhat run scripts/deployments/deployUniversalEscrowV3.js --network localhost',
        { cwd: contractDir }
      );
      
      // Extract contract address from deployment output
      const addressMatch = deployResult.stdout.match(/Contract deployed to: (0x[a-fA-F0-9]{40})/);
      if (addressMatch) {
        contractAddress = addressMatch[1];
        console.log('[Test] Contract deployed at:', contractAddress);
      }

      // Set up provider and signer
      provider = testProvider;
      signer = provider.getSigner(0);
    } catch (error) {
      console.log('[Test] Skipping contract deployment:', error.message);
    }

    // Initialize Firebase with emulator settings
    process.env.FIRESTORE_EMULATOR_HOST = 'localhost:5004';
    process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099';
    
    app = initializeApp({
      projectId: 'test-project',
      databaseURL: 'http://localhost:5004'
    }, 'staking-integration-test');

    db = getFirestore(app);
    auth = getAuth(app);

    // Initialize services
    // databaseService is already imported as a module
    escrowService = new EscrowServiceV3();
    reputationService = new ReputationService();

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
      { 
        uid: 'excellentBuyer', 
        email: 'excellent@test.com', 
        reputation: 950,
        privateKey: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
      },
      { 
        uid: 'goodSeller', 
        email: 'good@test.com', 
        reputation: 800,
        privateKey: '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d'
      },
      { 
        uid: 'standardBuyer', 
        email: 'standard@test.com', 
        reputation: 600,
        privateKey: '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a'
      },
      { 
        uid: 'probationSeller', 
        email: 'probation@test.com', 
        reputation: 300,
        privateKey: '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6'
      },
      { 
        uid: 'restrictedBuyer', 
        email: 'restricted@test.com', 
        reputation: 100,
        privateKey: '0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a'
      }
    ];

    for (const config of userConfigs) {
      // Create user in Auth
      const userRecord = await auth.createUser({
        uid: config.uid,
        email: config.email,
        emailVerified: true
      });

      // Get wallet from private key
      const wallet = new ethers.Wallet(config.privateKey, provider);

      // Create user document with reputation and wallet
      await db.collection('users').doc(config.uid).set({
        userId: config.uid,
        email: config.email,
        reputationScore: config.reputation,
        walletAddress: wallet.address,
        createdAt: Timestamp.now()
      });

      // Generate auth token
      authTokens[config.uid] = `test-token-${config.uid}`;

      testUsers[config.uid] = {
        ...userRecord,
        reputation: config.reputation,
        wallet: wallet,
        token: authTokens[config.uid]
      };

      // Fund wallet with ETH for gas
      await signer.sendTransaction({
        to: wallet.address,
        value: ethers.utils.parseEther("10")
      });
    }

    // Deploy and setup mock USDC
    const MockToken = await ethers.getContractFactory("MockToken", signer);
    const mockUSDC = await MockToken.deploy("Mock USDC", "USDC", 6);
    await mockUSDC.deployed();

    // Fund test users with USDC
    for (const userId of Object.keys(testUsers)) {
      await mockUSDC.mint(
        testUsers[userId].wallet.address,
        ethers.utils.parseUnits("10000", 6)
      );
    }

    // Store USDC address
    process.env.MOCK_USDC_ADDRESS = mockUSDC.address;

  }, TEST_TIMEOUT);

  afterAll(async () => {
    console.log('[Test] Cleaning up...');
    
    // Clean up test users if auth was initialized
    if (auth) {
      for (const userId of Object.keys(testUsers)) {
        try {
          await auth.deleteUser(userId);
        } catch (error) {
          console.error(`[Test] Error deleting user ${userId}:`, error.message);
        }
      }
    }

    // Clean up Firestore collections if db was initialized
    if (db) {
      const collections = ['users', 'deals', 'disputeStakes', 'reputationHistory'];
      for (const collection of collections) {
        const snapshot = await db.collection(collection).get();
        const batch = db.batch();
        snapshot.docs.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
      }
    }

    // Clean up Firebase app if it was initialized
    if (app) {
      await deleteApp(app);
    }
  });

  beforeEach(async () => {
    // Clear transaction-related collections before each test
    const collections = ['deals', 'disputeStakes', 'reputationHistory'];
    for (const collection of collections) {
      const snapshot = await db.collection(collection).get();
      const batch = db.batch();
      snapshot.docs.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
    }
  });

  describe('Complete Staking Flow', () => {
    it('should handle complete dispute flow with excellent reputation', async () => {
      const buyer = testUsers.excellentBuyer;
      const seller = testUsers.goodSeller;
      const amount = 1000; // USDC

      // Step 1: Create transaction
      const createRes = await request(expressApp)
        .post('/api/transaction/create')
        .set('Authorization', `Bearer ${buyer.token}`)
        .send({
          buyer: buyer.uid,
          seller: seller.uid,
          amount: amount,
          currency: 'USDC',
          network: 'ethereum',
          description: 'Test transaction with staking',
          conditions: ['delivery', 'quality']
        });

      expect(createRes.status).toBe(201);
      const dealId = createRes.body.transaction.id;

      // Step 2: Get stake requirement
      const stakeRes = await request(expressApp)
        .get(`/api/transaction/${dealId}/stake-requirement`)
        .set('Authorization', `Bearer ${buyer.token}`);

      expect(stakeRes.status).toBe(200);
      expect(stakeRes.body).toMatchObject({
        reputationScore: 950,
        reputationLevel: 'Excellent',
        stakePercentage: 0.025,
        requiredStake: 25, // 2.5% of 1000
        currency: 'USDC'
      });

      // Step 3: Fund escrow (buyer deposits)
      const fundRes = await request(expressApp)
        .post(`/api/transaction/${dealId}/fund`)
        .set('Authorization', `Bearer ${buyer.token}`)
        .send({
          network: 'ethereum'
        });

      expect(fundRes.status).toBe(200);

      // Wait for blockchain confirmation
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Step 4: Raise dispute with stake
      const disputeRes = await request(expressApp)
        .post(`/api/transaction/${dealId}/dispute/raise-with-stake`)
        .set('Authorization', `Bearer ${buyer.token}`)
        .send({
          reason: 'Quality issue with delivered product',
          stakeAmount: 25,
          network: 'ethereum'
        });

      expect(disputeRes.status).toBe(200);
      expect(disputeRes.body.stakeId).toBeTruthy();
      expect(disputeRes.body.transaction.disputeRaised).toBe(true);
      expect(disputeRes.body.transaction.disputeStake).toBe(25);

      // Step 5: Verify stake is recorded
      const stakeDoc = await db.collection('disputeStakes').doc(disputeRes.body.stakeId).get();
      expect(stakeDoc.exists).toBe(true);
      expect(stakeDoc.data()).toMatchObject({
        userId: buyer.uid,
        dealId: dealId,
        stakeAmount: 25,
        status: 'locked',
        reputationScoreAtStake: 950
      });

      // Step 6: Get dispute status
      const statusRes = await request(expressApp)
        .get(`/api/transaction/${dealId}/dispute/status`)
        .set('Authorization', `Bearer ${buyer.token}`);

      expect(statusRes.status).toBe(200);
      expect(statusRes.body.dispute).toMatchObject({
        active: true,
        raisedBy: buyer.uid,
        stakeAmount: 25,
        reputationAtStake: 950
      });

      // Step 7: Resolve dispute in favor
      const resolveRes = await request(expressApp)
        .post(`/api/transaction/${dealId}/dispute/resolve`)
        .set('Authorization', `Bearer ${buyer.token}`)
        .send({
          resolution: 'RESOLVED_FOR_BUYER',
          network: 'ethereum'
        });

      expect(resolveRes.status).toBe(200);
      expect(resolveRes.body.stakeResolution).toMatchObject({
        outcome: 'resolved_in_favor',
        stakeReturned: 25,
        stakeSlashed: 0,
        reputationChange: 0
      });

      // Step 8: Verify reputation unchanged
      const finalRep = await reputationService.getUserReputationScore(buyer.uid);
      expect(finalRep).toBe(950);

      // Step 9: Get user stats
      const statsRes = await request(expressApp)
        .get('/api/transaction/reputation/stats')
        .set('Authorization', `Bearer ${buyer.token}`);

      expect(statsRes.status).toBe(200);
      expect(statsRes.body.disputeStats).toMatchObject({
        totalDisputes: 1,
        successfulDisputes: 1,
        failedDisputes: 0,
        totalStaked: 25,
        totalReturned: 25,
        totalSlashed: 0
      });
    });

    it('should handle invalid dispute with reputation penalty', async () => {
      const buyer = testUsers.standardBuyer;
      const seller = testUsers.probationSeller;
      const amount = 2000;

      // Create and fund transaction
      const createRes = await request(expressApp)
        .post('/api/transaction/create')
        .set('Authorization', `Bearer ${buyer.token}`)
        .send({
          buyer: buyer.uid,
          seller: seller.uid,
          amount: amount,
          currency: 'USDC',
          network: 'ethereum',
          description: 'Test invalid dispute',
          conditions: ['delivery']
        });

      const dealId = createRes.body.transaction.id;

      // Fund escrow
      await request(expressApp)
        .post(`/api/transaction/${dealId}/fund`)
        .set('Authorization', `Bearer ${buyer.token}`)
        .send({ network: 'ethereum' });

      await new Promise(resolve => setTimeout(resolve, 2000));

      // Get stake requirement (5% for standard tier)
      const stakeRes = await request(expressApp)
        .get(`/api/transaction/${dealId}/stake-requirement`)
        .set('Authorization', `Bearer ${buyer.token}`);

      expect(stakeRes.body.requiredStake).toBe(100); // 5% of 2000

      // Raise dispute
      const disputeRes = await request(expressApp)
        .post(`/api/transaction/${dealId}/dispute/raise-with-stake`)
        .set('Authorization', `Bearer ${buyer.token}`)
        .send({
          reason: 'False claim',
          stakeAmount: 100,
          network: 'ethereum'
        });

      expect(disputeRes.status).toBe(200);

      // Resolve against buyer
      const resolveRes = await request(expressApp)
        .post(`/api/transaction/${dealId}/dispute/resolve`)
        .set('Authorization', `Bearer ${buyer.token}`)
        .send({
          resolution: 'RESOLVED_FOR_SELLER',
          network: 'ethereum'
        });

      expect(resolveRes.body.stakeResolution).toMatchObject({
        outcome: 'resolved_against',
        stakeReturned: 0,
        stakeSlashed: 100,
        reputationChange: -100
      });

      // Verify reputation decreased
      const finalRep = await reputationService.getUserReputationScore(buyer.uid);
      expect(finalRep).toBe(500); // 600 - 100

      // Verify new tier
      const newStakeReq = await reputationService.calculateStakeRequirement(buyer.uid, 1000);
      expect(newStakeReq.reputationLevel).toBe('Standard'); // Still Standard at 500
    });

    it('should handle partial dispute resolution', async () => {
      const buyer = testUsers.goodSeller; // Using as buyer
      const seller = testUsers.restrictedBuyer; // Using as seller
      const amount = 3000;

      // Create transaction
      const createRes = await request(expressApp)
        .post('/api/transaction/create')
        .set('Authorization', `Bearer ${buyer.token}`)
        .send({
          buyer: buyer.uid,
          seller: seller.uid,
          amount: amount,
          currency: 'USDC',
          network: 'ethereum',
          description: 'Partial dispute test',
          conditions: ['delivery', 'quality', 'documentation']
        });

      const dealId = createRes.body.transaction.id;

      // Fund and raise dispute
      await request(expressApp)
        .post(`/api/transaction/${dealId}/fund`)
        .set('Authorization', `Bearer ${buyer.token}`)
        .send({ network: 'ethereum' });

      await new Promise(resolve => setTimeout(resolve, 2000));

      // 3.5% stake for Good tier
      const disputeRes = await request(expressApp)
        .post(`/api/transaction/${dealId}/dispute/raise-with-stake`)
        .set('Authorization', `Bearer ${buyer.token}`)
        .send({
          reason: 'Partial issues',
          stakeAmount: 105, // 3.5% of 3000
          network: 'ethereum'
        });

      const stakeId = disputeRes.body.stakeId;

      // Custom resolution (partial)
      const resolveRes = await request(expressApp)
        .post(`/api/transaction/${dealId}/dispute/resolve`)
        .set('Authorization', `Bearer ${buyer.token}`)
        .send({
          resolution: 'CUSTOM_RESOLUTION',
          customAmount: 1800, // 60% to buyer
          network: 'ethereum'
        });

      // Update stake status for partial return
      await reputationService.updateDisputeStakeStatus(stakeId, {
        status: 'partial_return',
        outcome: 'partial_return',
        amountReturned: 63, // 60% of 105
        amountSlashed: 42   // 40% of 105
      });

      // Verify reputation decreased by 50
      const finalRep = await reputationService.getUserReputationScore(buyer.uid);
      expect(finalRep).toBe(750); // 800 - 50
    });

    it('should enforce stake requirements by tier', async () => {
      const users = [
        { user: testUsers.excellentBuyer, expectedPercentage: 0.025 },
        { user: testUsers.goodSeller, expectedPercentage: 0.035 },
        { user: testUsers.standardBuyer, expectedPercentage: 0.05 },
        { user: testUsers.probationSeller, expectedPercentage: 0.07 },
        { user: testUsers.restrictedBuyer, expectedPercentage: 0.10 }
      ];

      for (const { user, expectedPercentage } of users) {
        const amount = 1000;
        const expectedStake = amount * expectedPercentage;

        // Get stake requirement
        const stakeRes = await request(expressApp)
          .post('/api/transaction/stake-requirement')
          .set('Authorization', `Bearer ${user.token}`)
          .send({ transactionAmount: amount });

        expect(stakeRes.status).toBe(200);
        expect(stakeRes.body.stakePercentage).toBe(expectedPercentage);
        expect(stakeRes.body.requiredStake).toBe(expectedStake);
      }
    });

    it('should handle insufficient balance for stake', async () => {
      const buyer = testUsers.restrictedBuyer;
      const seller = testUsers.excellentBuyer;
      const amount = 100000; // Large amount

      // Create transaction
      const createRes = await request(expressApp)
        .post('/api/transaction/create')
        .set('Authorization', `Bearer ${buyer.token}`)
        .send({
          buyer: buyer.uid,
          seller: seller.uid,
          amount: amount,
          currency: 'USDC',
          network: 'ethereum',
          description: 'Insufficient balance test',
          conditions: ['delivery']
        });

      const dealId = createRes.body.transaction.id;

      // Try to raise dispute with 10% stake (10,000 USDC)
      const disputeRes = await request(expressApp)
        .post(`/api/transaction/${dealId}/dispute/raise-with-stake`)
        .set('Authorization', `Bearer ${buyer.token}`)
        .send({
          reason: 'Test',
          stakeAmount: 10000, // More than user balance
          network: 'ethereum'
        });

      expect(disputeRes.status).toBe(400);
      expect(disputeRes.body.error).toContain('Insufficient balance');
    });

    it('should track dispute history correctly', async () => {
      const buyer = testUsers.probationSeller;
      const amounts = [1000, 2000, 3000];
      const outcomes = ['resolved_in_favor', 'resolved_against', 'partial_return'];

      for (let i = 0; i < amounts.length; i++) {
        // Create transaction
        const createRes = await request(expressApp)
          .post('/api/transaction/create')
          .set('Authorization', `Bearer ${buyer.token}`)
          .send({
            buyer: buyer.uid,
            seller: `seller${i}`,
            amount: amounts[i],
            currency: 'USDC',
            network: 'ethereum',
            description: `Test ${i}`,
            conditions: ['test']
          });

        const dealId = createRes.body.transaction.id;

        // Fund transaction
        await request(expressApp)
          .post(`/api/transaction/${dealId}/fund`)
          .set('Authorization', `Bearer ${buyer.token}`)
          .send({ network: 'ethereum' });

        await new Promise(resolve => setTimeout(resolve, 1000));

        // Raise dispute with 7% stake
        const stakeAmount = amounts[i] * 0.07;
        await request(expressApp)
          .post(`/api/transaction/${dealId}/dispute/raise-with-stake`)
          .set('Authorization', `Bearer ${buyer.token}`)
          .send({
            reason: `Dispute ${i}`,
            stakeAmount: stakeAmount,
            network: 'ethereum'
          });
      }

      // Get dispute history
      const historyRes = await request(expressApp)
        .get('/api/transaction/reputation/history')
        .set('Authorization', `Bearer ${buyer.token}`);

      expect(historyRes.status).toBe(200);
      expect(historyRes.body.disputeCount).toBe(3);
      expect(historyRes.body.totalStaked).toBe(70 + 140 + 210); // 420 total
    });

    it('should handle concurrent stake operations', async () => {
      const buyer = testUsers.standardBuyer;
      const promises = [];

      // Create multiple transactions concurrently
      for (let i = 0; i < 5; i++) {
        const promise = (async () => {
          const createRes = await request(expressApp)
            .post('/api/transaction/create')
            .set('Authorization', `Bearer ${buyer.token}`)
            .send({
              buyer: buyer.uid,
              seller: `concurrent-seller-${i}`,
              amount: 1000 * (i + 1),
              currency: 'USDC',
              network: 'ethereum',
              description: `Concurrent test ${i}`,
              conditions: ['test']
            });

          return createRes.body.transaction.id;
        })();

        promises.push(promise);
      }

      const dealIds = await Promise.all(promises);
      expect(dealIds).toHaveLength(5);

      // Verify all transactions created
      for (const dealId of dealIds) {
        const deal = await db.collection('deals').doc(dealId).get();
        expect(deal.exists).toBe(true);
      }
    });

    it('should validate stake amounts match reputation requirements', async () => {
      const buyer = testUsers.goodSeller;
      const seller = testUsers.standardBuyer;

      // Create transaction
      const createRes = await request(expressApp)
        .post('/api/transaction/create')
        .set('Authorization', `Bearer ${buyer.token}`)
        .send({
          buyer: buyer.uid,
          seller: seller.uid,
          amount: 5000,
          currency: 'USDC',
          network: 'ethereum',
          description: 'Stake validation test',
          conditions: ['delivery']
        });

      const dealId = createRes.body.transaction.id;

      // Fund transaction
      await request(expressApp)
        .post(`/api/transaction/${dealId}/fund`)
        .set('Authorization', `Bearer ${buyer.token}`)
        .send({ network: 'ethereum' });

      await new Promise(resolve => setTimeout(resolve, 2000));

      // Try with incorrect stake amount
      const wrongStakeRes = await request(expressApp)
        .post(`/api/transaction/${dealId}/dispute/raise-with-stake`)
        .set('Authorization', `Bearer ${buyer.token}`)
        .send({
          reason: 'Test',
          stakeAmount: 100, // Wrong: should be 175 (3.5% of 5000)
          network: 'ethereum'
        });

      expect(wrongStakeRes.status).toBe(400);
      expect(wrongStakeRes.body.error).toContain('Incorrect stake amount');

      // Try with correct stake amount
      const correctStakeRes = await request(expressApp)
        .post(`/api/transaction/${dealId}/dispute/raise-with-stake`)
        .set('Authorization', `Bearer ${buyer.token}`)
        .send({
          reason: 'Test',
          stakeAmount: 175, // Correct: 3.5% of 5000
          network: 'ethereum'
        });

      expect(correctStakeRes.status).toBe(200);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle network errors gracefully', async () => {
      const buyer = testUsers.excellentBuyer;

      // Create transaction with invalid network
      const res = await request(expressApp)
        .post('/api/transaction/create')
        .set('Authorization', `Bearer ${buyer.token}`)
        .send({
          buyer: buyer.uid,
          seller: 'seller123',
          amount: 1000,
          currency: 'USDC',
          network: 'invalid-network',
          description: 'Network error test',
          conditions: ['test']
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid network');
    });

    it('should prevent duplicate stake submissions', async () => {
      const buyer = testUsers.goodSeller;
      
      // Create and fund transaction
      const createRes = await request(expressApp)
        .post('/api/transaction/create')
        .set('Authorization', `Bearer ${buyer.token}`)
        .send({
          buyer: buyer.uid,
          seller: 'duplicate-seller',
          amount: 2000,
          currency: 'USDC',
          network: 'ethereum',
          description: 'Duplicate stake test',
          conditions: ['test']
        });

      const dealId = createRes.body.transaction.id;

      await request(expressApp)
        .post(`/api/transaction/${dealId}/fund`)
        .set('Authorization', `Bearer ${buyer.token}`)
        .send({ network: 'ethereum' });

      await new Promise(resolve => setTimeout(resolve, 2000));

      // First dispute succeeds
      const dispute1 = await request(expressApp)
        .post(`/api/transaction/${dealId}/dispute/raise-with-stake`)
        .set('Authorization', `Bearer ${buyer.token}`)
        .send({
          reason: 'First dispute',
          stakeAmount: 70,
          network: 'ethereum'
        });

      expect(dispute1.status).toBe(200);

      // Second dispute fails
      const dispute2 = await request(expressApp)
        .post(`/api/transaction/${dealId}/dispute/raise-with-stake`)
        .set('Authorization', `Bearer ${buyer.token}`)
        .send({
          reason: 'Second dispute',
          stakeAmount: 70,
          network: 'ethereum'
        });

      expect(dispute2.status).toBe(400);
      expect(dispute2.body.error).toContain('already disputed');
    });

    it('should handle reputation score boundaries', async () => {
      // Test user at exact tier boundary
      const boundaryUser = 'boundaryUser';
      
      await auth.createUser({
        uid: boundaryUser,
        email: 'boundary@test.com'
      });

      await db.collection('users').doc(boundaryUser).set({
        userId: boundaryUser,
        email: 'boundary@test.com',
        reputationScore: 750, // Exact boundary between Good and Standard
        createdAt: Timestamp.now()
      });

      authTokens[boundaryUser] = `test-token-${boundaryUser}`;

      const stakeRes = await request(expressApp)
        .post('/api/transaction/stake-requirement')
        .set('Authorization', `Bearer ${authTokens[boundaryUser]}`)
        .send({ transactionAmount: 1000 });

      expect(stakeRes.body.reputationLevel).toBe('Good');
      expect(stakeRes.body.stakePercentage).toBe(0.035);

      // Clean up
      await auth.deleteUser(boundaryUser);
    });
  });

  describe('Performance Tests', () => {
    it('should handle high volume of stake calculations efficiently', async () => {
      const user = testUsers.standardBuyer;
      const startTime = Date.now();
      const promises = [];

      // Make 50 concurrent stake requirement requests
      for (let i = 0; i < 50; i++) {
        promises.push(
          request(expressApp)
            .post('/api/transaction/stake-requirement')
            .set('Authorization', `Bearer ${user.token}`)
            .send({ transactionAmount: 1000 + (i * 100) })
        );
      }

      const results = await Promise.all(promises);
      const duration = Date.now() - startTime;

      // All should succeed
      results.forEach(res => {
        expect(res.status).toBe(200);
        expect(res.body.stakePercentage).toBe(0.05);
      });

      // Should complete within 5 seconds
      expect(duration).toBeLessThan(5000);
    });
  });
});