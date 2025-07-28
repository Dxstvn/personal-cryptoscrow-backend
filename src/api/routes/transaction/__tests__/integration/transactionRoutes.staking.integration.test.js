// src/api/routes/transaction/__tests__/integration/transactionRoutes.staking.integration.test.js
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
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

// Mock getAdminApp to use test Firebase instance
vi.mock('../../../auth/admin.js', () => ({
  getAdminApp: vi.fn()
}));

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
    let testProvider;
    try {
      console.log('[Test] Checking if Hardhat is running...');
      // Check if hardhat is already running by trying to connect
      testProvider = new ethers.JsonRpcProvider('http://localhost:8545');
      await testProvider.getNetwork();
      console.log('[Test] Hardhat already running');
    } catch (error) {
      console.log('[Test] Hardhat not running, skipping contract deployment for this test');
      // For integration tests, we can skip blockchain tests if hardhat isn't running
    }

    // Only deploy contracts if hardhat is available
    let hardhatAvailable = false;
    if (testProvider) {
      try {
        await testProvider.getNetwork();
        hardhatAvailable = true;
        
        // Deploy contracts
        console.log('[Test] Deploying contracts...');
        const deployResult = await execAsync(
          'npx hardhat run scripts/deployment-scripts/deployStakingContract.js --network localhost',
          { cwd: contractDir }
        );
        
        // Extract contract address from deployment output
        const addressMatch = deployResult.stdout.match(/Contract deployed to: (0x[a-fA-F0-9]{40})|Contract: (0x[a-fA-F0-9]{40})/);
        if (addressMatch) {
          contractAddress = addressMatch[1] || addressMatch[2];
          console.log('[Test] Contract deployed at:', contractAddress);
        }

        // Set up provider and signer
        provider = testProvider;
        signer = await provider.getSigner(0);
      } catch (error) {
        console.log('[Test] Skipping contract deployment:', error.message);
      }
    }
    
    // Set environment variables for the API to use
    if (contractAddress) {
      process.env.ETHEREUM_CONTRACT_ADDRESS = contractAddress;
      process.env.SEPOLIA_CONTRACT_ADDRESS = contractAddress;
    } else {
      // Use placeholder contract address for tests
      process.env.ETHEREUM_CONTRACT_ADDRESS = '0x' + '3'.repeat(40);
      process.env.SEPOLIA_CONTRACT_ADDRESS = '0x' + '3'.repeat(40);
    }
    
    // Set RPC URLs
    process.env.ETHEREUM_RPC_URL = 'http://127.0.0.1:8545';
    process.env.SEPOLIA_RPC_URL = 'http://127.0.0.1:8545';

    // Initialize Firebase with emulator settings
    process.env.FIRESTORE_EMULATOR_HOST = 'localhost:5004';
    process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099';
    
    app = initializeApp({
      projectId: 'demo-test',
      databaseURL: 'http://localhost:5004'
    }, 'staking-integration-test');

    db = getFirestore(app);
    auth = getAuth(app);
    
    // Configure mock to return test app
    // Configure the mock after importing
    const { getAdminApp } = await import('../../../auth/admin.js');
    getAdminApp.mockResolvedValue(app);

    // Initialize services
    // databaseService is already imported as a module
    escrowService = new EscrowServiceV3();
    reputationService = new ReputationService();

    // Set up Express app
    expressApp = express();
    expressApp.use(express.json());
    
    // Mock Firebase auth verification for testing
    const mockAuthMiddleware = (req, res, next) => {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        const userId = Object.keys(authTokens).find(uid => authTokens[uid] === token);
        if (userId) {
          req.user = { uid: userId };
          // Mock Firebase auth.verifyIdToken
          req.app.locals = {
            ...req.app.locals,
            mockAuth: {
              verifyIdToken: async () => ({ uid: userId })
            }
          };
        }
      }
      next();
    };
    
    expressApp.use(mockAuthMiddleware);
    expressApp.use('/api/transaction', transactionRoutes);
    expressApp.use('/api/reputation', (await import('../../../../../api/routes/reputation/reputationRoutes.js')).default);

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

      let wallet;
      let walletAddress;
      
      if (provider) {
        // Get wallet from private key
        wallet = new ethers.Wallet(config.privateKey, provider);
        walletAddress = wallet.address;
      } else {
        // Generate a valid placeholder address for tests without blockchain
        const hash = config.uid.split('').reduce((a, b) => {
          a = ((a << 5) - a) + b.charCodeAt(0);
          return a & a;
        }, 0);
        walletAddress = '0x' + Math.abs(hash).toString(16).padStart(8, '0').repeat(5).substring(0, 40);
      }

      // Create user document with reputation and wallet
      await db.collection('users').doc(config.uid).set({
        userId: config.uid,
        email: config.email,
        reputationScore: config.reputation,
        walletAddress: walletAddress,
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

      // Fund wallet with ETH for gas if blockchain is available
      if (signer && wallet) {
        await signer.sendTransaction({
          to: wallet.address,
          value: ethers.parseEther("10")
        });
      }
    }

    // Deploy and setup mock USDC if blockchain is available
    let mockUSDC;
    if (signer) {
      const MockToken = await ethers.getContractFactory("MockToken", signer);
      mockUSDC = await MockToken.deploy("Mock USDC", "USDC", 6);
      await mockUSDC.waitForDeployment();

      // Fund test users with USDC
      for (const userId of Object.keys(testUsers)) {
        if (testUsers[userId].wallet) {
          await mockUSDC.mint(
            testUsers[userId].wallet.address,
            ethers.parseUnits("10000", 6)
          );
        }
      }
      
      // Store USDC address
      process.env.MOCK_USDC_ADDRESS = await mockUSDC.getAddress();
    }

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
          amount: amount,
          sellerEmail: seller.email,
          productDescription: 'Test transaction with staking',
          conditions: [{text: 'delivery', status: 'pending'}, {text: 'quality', status: 'pending'}],
          sellerWalletAddress: seller.wallet ? seller.wallet.address : '0x' + '2'.repeat(40),
          buyerWalletAddress: buyer.wallet ? buyer.wallet.address : '0x' + '1'.repeat(40),
          isSeller: false,
          buyerNetwork: 'ethereum',
          sellerNetwork: 'ethereum'
        });

      if (createRes.status !== 201) {
        throw new Error(`Create transaction failed: ${createRes.status} - ${JSON.stringify(createRes.body)}`);
      }
      
      const dealId = createRes.body.dealId || createRes.body.transactionData?.id;
      if (!dealId) {
        throw new Error(`No deal ID in create response: ${JSON.stringify(createRes.body)}`);
      }

      // Step 2: Get stake requirement
      const stakeRes = await request(expressApp)
        .get(`/api/transaction/${dealId}/stake-requirement`)
        .set('Authorization', `Bearer ${buyer.token}`);

      if (stakeRes.status !== 200) {
        throw new Error(`Stake requirement failed: ${stakeRes.status} - ${JSON.stringify(stakeRes.body)} - Deal ID: ${dealId}`);
      }
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

      // For E2E testing, create REAL blockchain escrow if contract is available
      if (contractAddress && provider) {
        console.log('[Test] Creating REAL blockchain escrow for true E2E testing...');
        
        try {
          // Get contract instance
          const { ethers } = await import('ethers');
          const escrowContract = new ethers.Contract(
            contractAddress,
            [
              "function createEscrow(address seller, address depositToken, uint256 amount, address targetToken, uint256 targetChainId, uint256 disputeResolutionPeriodDays) external payable returns (uint256)",
              "function raiseDispute(uint256 escrowId, string memory reason, address stakeToken) external payable",
              "function escrows(uint256) external view returns (tuple(address buyer, address seller, address depositToken, uint256 amount, bool isActive, bool allConditionsMet, bool disputeRaised, uint256 disputeTimestamp, uint256 disputeDeadline, bool disputeResolved, uint256 createdAt))"
            ],
            provider.getSigner(0)
          );

          // Create actual escrow on blockchain using ETH (address(0))
          // Use second hardhat account as seller (different from tx sender)
          const accounts = await provider.listAccounts();
          const sellerAddress = accounts[1].address; // Remove fallback, use actual account
          const buyerAddress = accounts[0].address; // Remove fallback, use actual account
          
          const depositAmount = ethers.parseEther("0.1"); // Use larger amount to avoid precision issues
          
          console.log('[Test] Creating escrow with buyer:', buyerAddress, 'seller:', sellerAddress);
          console.log('[Test] Escrow parameters:', {
            seller: sellerAddress,
            depositToken: ethers.ZeroAddress,
            depositAmount: depositAmount.toString(),
            targetToken: ethers.ZeroAddress,
            targetChainId: 0,
            disputeResolutionDays: 7,
            msgValue: depositAmount.toString()
          });
          
          const tx = await escrowContract.createEscrow(
            sellerAddress, // use second hardhat account as seller
            ethers.ZeroAddress, // ETH deposit (address(0))
            depositAmount, // use same variable for both
            ethers.ZeroAddress, // target token (ETH)
            0, // same chain
            7, // 7 days dispute resolution
            { value: depositAmount } // use same variable for both
          );
          
          const receipt = await tx.wait();
          console.log('[Test] Real escrow created! TX:', receipt.hash);
          
          // Extract escrow ID from events (it should be 0 for first escrow)
          const escrowId = 0;
          
          // Update deal with REAL blockchain fields
          await db.collection('deals').doc(dealId).update({
            escrowId: escrowId,
            smartContractAddress: contractAddress,
            buyerChainId: 31337, // Hardhat chain ID
            hasBlockchainIntegration: true,
            blockchainTxHash: receipt.hash,
            blockNumber: receipt.blockNumber,
            lastUpdated: new Date()
          });
          console.log('[Test] Deal updated with REAL blockchain escrow ID:', escrowId);
          
        } catch (error) {
          console.log('[Test] Real escrow creation failed, using mock:', error.message);
          console.log('[Test] Error details:', {
            code: error.code,
            data: error.data,
            reason: error.reason,
            transaction: error.transaction
          });
          // Fallback to mock data
          await db.collection('deals').doc(dealId).update({
            escrowId: 1,
            smartContractAddress: contractAddress,
            buyerChainId: 31337,
            hasBlockchainIntegration: true,
            lastUpdated: new Date()
          });
        }
      }

      // Wait for blockchain confirmation
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Step 4: Verify deal has blockchain integration fields
      const dealCheck = await db.collection('deals').doc(dealId).get();
      const dealDataCheck = dealCheck.data();
      console.log('[Test] Deal before dispute:', {
        hasEscrowId: !!dealDataCheck.escrowId,
        hasContract: !!dealDataCheck.smartContractAddress,
        hasChainId: !!dealDataCheck.buyerChainId,
        contractAddress: dealDataCheck.smartContractAddress
      });

      // Step 4: Raise dispute with stake
      const disputeRes = await request(expressApp)
        .post(`/api/transaction/${dealId}/dispute/raise-with-stake`)
        .set('Authorization', `Bearer ${buyer.token}`)
        .send({
          reason: 'Quality issue with delivered product',
          stakeAmount: 25,
          network: 'ethereum'
        });

      console.log('[Test] Dispute response:', {
        status: disputeRes.status,
        isRealBlockchain: disputeRes.body.dispute?.isRealBlockchain,
        transactionHash: disputeRes.body.dispute?.transactionHash
      });

      if (disputeRes.status !== 200 || !disputeRes.body.success) {
        throw new Error(`Dispute failed: ${disputeRes.status} - ${JSON.stringify(disputeRes.body)}`);
      }
      expect(disputeRes.status).toBe(200);
      expect(disputeRes.body.success).toBe(true);
      
      // Check that stakeId is returned
      expect(disputeRes.body.stakeId).toBeTruthy();
      
      // Step 5: Verify stake is recorded
      const stakeDoc = await db.collection('disputeStakes').doc(disputeRes.body.stakeId).get();
      expect(stakeDoc.exists).toBe(true);
      const stakeData = stakeDoc.data();
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

      if (resolveRes.status !== 200) {
        throw new Error(`Resolve dispute failed: ${resolveRes.status} - ${JSON.stringify(resolveRes.body)}`);
      }
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
        .get('/api/reputation/stats')
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
          amount: amount,
          sellerEmail: seller.email,
          productDescription: 'Test invalid dispute',
          conditions: [{text: 'delivery', status: 'pending'}],
          sellerWalletAddress: seller.wallet ? seller.wallet.address : '0x' + '2'.repeat(40),
          buyerWalletAddress: buyer.wallet ? buyer.wallet.address : '0x' + '1'.repeat(40),
          isSeller: false,
          buyerNetwork: 'ethereum',
          sellerNetwork: 'ethereum'
        });

      if (createRes.status !== 201) {
        throw new Error(`Create transaction failed: ${createRes.status} - ${JSON.stringify(createRes.body)}`);
      }
      
      const dealId = createRes.body.dealId || createRes.body.transactionData?.id;
      if (!dealId) {
        throw new Error(`No deal ID in create response: ${JSON.stringify(createRes.body)}`);
      }

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

      expect(stakeRes.body.requiredStake).toBe(100); // 5% of 2000 for Standard tier (score 600)

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
          amount: amount,
          sellerEmail: seller.email,
          productDescription: 'Partial dispute test',
          conditions: [{text: 'delivery', status: 'pending'}, {text: 'quality', status: 'pending'}, {text: 'documentation', status: 'pending'}],
          sellerWalletAddress: seller.wallet ? seller.wallet.address : '0x' + '2'.repeat(40),
          buyerWalletAddress: buyer.wallet ? buyer.wallet.address : '0x' + '1'.repeat(40),
          isSeller: false,
          buyerNetwork: 'ethereum',
          sellerNetwork: 'ethereum'
        });

      if (createRes.status !== 201) {
        throw new Error(`Create transaction failed: ${createRes.status} - ${JSON.stringify(createRes.body)}`);
      }
      
      const dealId = createRes.body.dealId || createRes.body.transactionData?.id;
      if (!dealId) {
        throw new Error(`No deal ID in create response: ${JSON.stringify(createRes.body)}`);
      }

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

      // Custom resolution (partial) - endpoint should handle stake and reputation updates automatically
      const resolveRes = await request(expressApp)
        .post(`/api/transaction/${dealId}/dispute/resolve`)
        .set('Authorization', `Bearer ${buyer.token}`)
        .send({
          resolution: 'CUSTOM_RESOLUTION',
          customAmount: 1800, // 60% to buyer
          network: 'ethereum'
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
          amount: amount,
          sellerEmail: seller.email,
          productDescription: 'Insufficient balance test',
          conditions: [{text: 'delivery', status: 'pending'}],
          sellerWalletAddress: seller.wallet ? seller.wallet.address : '0x' + '2'.repeat(40),
          buyerWalletAddress: buyer.wallet ? buyer.wallet.address : '0x' + '1'.repeat(40),
          isSeller: false,
          buyerNetwork: 'ethereum',
          sellerNetwork: 'ethereum'
        });

      if (createRes.status !== 201) {
        throw new Error(`Create transaction failed: ${createRes.status} - ${JSON.stringify(createRes.body)}`);
      }
      
      const dealId = createRes.body.dealId || createRes.body.transactionData?.id;
      if (!dealId) {
        throw new Error(`No deal ID in create response: ${JSON.stringify(createRes.body)}`);
      }

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

    it('should allow high-value stakes for excellent reputation users', async () => {
      const buyer = testUsers.excellentBuyer; // 950 reputation = 2.5% stake
      const amount = 200000; // $200k property transaction
      const expectedStake = 5000; // 2.5% of $200k = $5k stake
      
      // Create high-value transaction
      const createRes = await request(expressApp)
        .post('/api/transaction/create')
        .set('Authorization', `Bearer ${buyer.token}`)
        .send({
          amount: amount,
          sellerEmail: 'property-seller@test.com',
          productDescription: 'High-value property transaction',
          conditions: [{text: 'property transfer', status: 'pending'}],
          sellerWalletAddress: '0x' + '2'.repeat(40),
          buyerWalletAddress: buyer.wallet ? buyer.wallet.address : '0x' + '1'.repeat(40),
          isSeller: false,
          buyerNetwork: 'ethereum',
          sellerNetwork: 'ethereum'
        });

      expect(createRes.status).toBe(201);
      const dealId = createRes.body.dealId || createRes.body.transactionData?.id;

      // Fund the transaction
      await request(expressApp)
        .post(`/api/transaction/${dealId}/fund`)
        .set('Authorization', `Bearer ${buyer.token}`)
        .send({ network: 'ethereum' });

      await new Promise(resolve => setTimeout(resolve, 2000));

      // Raise dispute with high stake - should succeed because excellent user has $100k balance
      const disputeRes = await request(expressApp)
        .post(`/api/transaction/${dealId}/dispute/raise-with-stake`)
        .set('Authorization', `Bearer ${buyer.token}`)
        .send({
          reason: 'Property condition discrepancy',
          stakeAmount: expectedStake, // $5k stake, within $100k balance
          network: 'ethereum'
        });

      expect(disputeRes.status).toBe(200);
      expect(disputeRes.body.success).toBe(true);
      expect(disputeRes.body.stakeId).toBeTruthy();
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
            amount: amounts[i],
            sellerEmail: `seller${i}@test.com`,
            productDescription: `Test ${i}`,
            conditions: [{text: 'test', status: 'pending'}],
            sellerWalletAddress: '0x' + '2'.repeat(40),
            buyerWalletAddress: buyer.wallet ? buyer.wallet.address : '0x' + '1'.repeat(40),
            isSeller: false,
            buyerNetwork: 'ethereum',
            sellerNetwork: 'ethereum'
          });

        if (createRes.status !== 201) {
        throw new Error(`Create transaction failed: ${createRes.status} - ${JSON.stringify(createRes.body)}`);
      }
      
      const dealId = createRes.body.dealId || createRes.body.transactionData?.id;
      if (!dealId) {
        throw new Error(`No deal ID in create response: ${JSON.stringify(createRes.body)}`);
      }

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
              amount: 1000 * (i + 1),
              sellerEmail: `concurrent-seller-${i}@test.com`,
              productDescription: `Concurrent test ${i}`,
              conditions: [{text: 'test', status: 'pending'}],
              sellerWalletAddress: `0x${i}234567890123456789012345678901234567890`,
              buyerWalletAddress: buyer.wallet ? buyer.wallet.address : '0x' + '1'.repeat(40),
              isSeller: false,
              buyerNetwork: 'ethereum',
              sellerNetwork: 'ethereum'
            });

          return createRes.body.dealId || createRes.body.transactionData?.id;
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
          amount: 5000,
          sellerEmail: seller.email,
          productDescription: 'Stake validation test',
          conditions: [{text: 'delivery', status: 'pending'}],
          sellerWalletAddress: seller.wallet ? seller.wallet.address : '0x' + '2'.repeat(40),
          buyerWalletAddress: buyer.wallet ? buyer.wallet.address : '0x' + '1'.repeat(40),
          isSeller: false,
          buyerNetwork: 'ethereum',
          sellerNetwork: 'ethereum'
        });

      if (createRes.status !== 201) {
        throw new Error(`Create transaction failed: ${createRes.status} - ${JSON.stringify(createRes.body)}`);
      }
      
      const dealId = createRes.body.dealId || createRes.body.transactionData?.id;
      if (!dealId) {
        throw new Error(`No deal ID in create response: ${JSON.stringify(createRes.body)}`);
      }

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
          amount: 1000,
          sellerEmail: 'seller@test.com',
          productDescription: 'Network error test',
          conditions: [{text: 'test', status: 'pending'}],
          sellerWalletAddress: '0x1234567890123456789012345678901234567890',
          buyerWalletAddress: buyer.wallet ? buyer.wallet.address : `0x${buyer.uid.padEnd(40, '0')}`,
          isSeller: false,
          buyerNetwork: 'invalid-network',
          sellerNetwork: 'invalid-network'
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Unsupported network');
    });

    it('should prevent duplicate stake submissions', async () => {
      const buyer = testUsers.goodSeller;
      
      // Create and fund transaction
      const createRes = await request(expressApp)
        .post('/api/transaction/create')
        .set('Authorization', `Bearer ${buyer.token}`)
        .send({
          amount: 2000,
          sellerEmail: 'duplicate-seller@test.com',
          productDescription: 'Duplicate stake test',
          conditions: [{text: 'test', status: 'pending'}],
          sellerWalletAddress: '0x1234567890123456789012345678901234567890',
          buyerWalletAddress: buyer.wallet ? buyer.wallet.address : '0x' + '1'.repeat(40),
          isSeller: false,
          buyerNetwork: 'ethereum',
          sellerNetwork: 'ethereum'
        });

      if (createRes.status !== 201) {
        throw new Error(`Create transaction failed: ${createRes.status} - ${JSON.stringify(createRes.body)}`);
      }
      
      const dealId = createRes.body.dealId || createRes.body.transactionData?.id;
      if (!dealId) {
        throw new Error(`No deal ID in create response: ${JSON.stringify(createRes.body)}`);
      }

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