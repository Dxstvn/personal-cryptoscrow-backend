// Test to verify stake token handling in reputation service
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { reputationService } from '../../reputationService.js';

// Mock the database service
vi.mock('../../databaseService.js', () => ({
  getDb: vi.fn()
}));

describe('ReputationService Stake Token Handling', () => {
  let app;
  let db;

  beforeAll(async () => {
    // Initialize Firebase Admin for testing
    app = initializeApp({
      projectId: 'test-project',
      databaseURL: 'http://localhost:9000'
    }, 'reputation-stake-token-test');
    
    db = getFirestore(app);
    
    // Mock getDb to return our test db
    const { getDb } = await import('../../databaseService.js');
    getDb.mockResolvedValue(db);
  });

  afterAll(async () => {
    await deleteApp(app);
  });

  beforeEach(async () => {
    // Clear the disputeStakes collection
    const stakesSnapshot = await db.collection('disputeStakes').get();
    const batch = db.batch();
    stakesSnapshot.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
  });

  describe('recordDisputeStake token handling', () => {
    it('should use the provided stakeToken when specified', async () => {
      const stakeData = {
        userId: 'user123',
        dealId: 'deal123',
        transactionAmount: 10000,
        stakeAmount: 250,
        stakePercentage: 0.025,
        stakeToken: 'ETH'
      };

      const stakeId = await reputationService.recordDisputeStake(stakeData);
      
      // Verify the stake was recorded with the correct token
      const stakeDoc = await db.collection('disputeStakes').doc(stakeId).get();
      const recordedStake = stakeDoc.data();
      
      expect(recordedStake.stakeToken).toBe('ETH');
      expect(recordedStake.transactionAmount).toBe(10000);
      expect(recordedStake.stakeAmount).toBe(250);
    });

    it('should default to USDC when no stakeToken is provided', async () => {
      const stakeData = {
        userId: 'user456',
        dealId: 'deal456',
        transactionAmount: 5000,
        stakeAmount: 125,
        stakePercentage: 0.025
        // No stakeToken provided
      };

      const stakeId = await reputationService.recordDisputeStake(stakeData);
      
      // Verify the stake defaulted to USDC
      const stakeDoc = await db.collection('disputeStakes').doc(stakeId).get();
      const recordedStake = stakeDoc.data();
      
      expect(recordedStake.stakeToken).toBe('USDC');
    });

    it('should handle various token types correctly', async () => {
      const tokens = ['ETH', 'USDT', 'USDC', 'DAI', 'WBTC'];
      const stakeIds = [];

      for (const token of tokens) {
        const stakeData = {
          userId: 'multiTokenUser',
          dealId: `deal-${token}`,
          transactionAmount: 1000,
          stakeAmount: 25,
          stakePercentage: 0.025,
          stakeToken: token
        };

        const stakeId = await reputationService.recordDisputeStake(stakeData);
        stakeIds.push({ id: stakeId, expectedToken: token });
      }

      // Verify all stakes have the correct token
      for (const { id, expectedToken } of stakeIds) {
        const stakeDoc = await db.collection('disputeStakes').doc(id).get();
        const recordedStake = stakeDoc.data();
        expect(recordedStake.stakeToken).toBe(expectedToken);
      }
    });

    it('should match the escrow transaction currency when properly passed', async () => {
      // Simulate what should happen when the transaction routes pass the correct currency
      const escrowCurrency = 'WETH'; // The actual escrow uses WETH
      
      const stakeData = {
        userId: 'escrowMatchUser',
        dealId: 'wethDeal',
        transactionAmount: 15000,
        stakeAmount: 375,
        stakePercentage: 0.025,
        stakeToken: escrowCurrency // Should match the escrow currency
      };

      const stakeId = await reputationService.recordDisputeStake(stakeData);
      
      const stakeDoc = await db.collection('disputeStakes').doc(stakeId).get();
      const recordedStake = stakeDoc.data();
      
      expect(recordedStake.stakeToken).toBe(escrowCurrency);
      expect(recordedStake.stakeToken).not.toBe('USDC'); // Should NOT default to USDC
    });
  });

  describe('Integration with transaction routes', () => {
    it('should demonstrate the current issue - stakes default to USDC regardless of escrow currency', async () => {
      // This test demonstrates the current behavior where if the transaction route
      // doesn't pass a stakeToken, it defaults to USDC even if the escrow uses ETH
      
      // Simulate a deal with ETH currency
      const dealData = {
        dealId: 'ethDeal123',
        amount: 5000,
        currency: 'ETH', // Deal is in ETH
        buyer: 'buyer123',
        seller: 'seller123'
      };

      // Simulate what happens when transaction route doesn't pass the currency
      const stakeData = {
        userId: dealData.buyer,
        dealId: dealData.dealId,
        transactionAmount: dealData.amount,
        stakeAmount: 125,
        stakePercentage: 0.025
        // Note: No stakeToken provided, even though deal is in ETH
      };

      const stakeId = await reputationService.recordDisputeStake(stakeData);
      
      const stakeDoc = await db.collection('disputeStakes').doc(stakeId).get();
      const recordedStake = stakeDoc.data();
      
      // This shows the problem: stake defaults to USDC even though the escrow is in ETH
      expect(recordedStake.stakeToken).toBe('USDC');
      expect(recordedStake.stakeToken).not.toBe(dealData.currency);
      
      // This is problematic for multi-token escrows where users might need to stake
      // in a different currency than they're transacting in
    });
  });
});