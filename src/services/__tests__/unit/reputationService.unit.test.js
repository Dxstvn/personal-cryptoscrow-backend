// src/services/__tests__/unit/reputationService.unit.test.js
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ReputationService } from '../../reputationService.js';
import { Timestamp } from 'firebase-admin/firestore';
import { getDb } from '../../databaseService.js';

// Mock the database service
vi.mock('../../databaseService.js', () => ({
  getDb: vi.fn()
}));

// Mock Timestamp
vi.mock('firebase-admin/firestore', () => ({
  Timestamp: {
    now: vi.fn(() => ({ toDate: () => new Date() }))
  },
  FieldValue: {
    serverTimestamp: vi.fn()
  }
}));

describe('ReputationService Unit Tests', () => {
  let reputationService;
  let mockDb;
  let mockCollection;
  let mockDoc;
  let mockDocRef;
  let mockSnapshot;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Create mock database structure
    mockSnapshot = {
      exists: false,
      data: vi.fn(),
      forEach: vi.fn()
    };

    mockDocRef = {
      get: vi.fn(() => Promise.resolve(mockSnapshot)),
      set: vi.fn(() => Promise.resolve()),
      update: vi.fn(() => Promise.resolve())
    };

    mockDoc = vi.fn(() => mockDocRef);

    mockCollection = {
      doc: mockDoc,
      add: vi.fn(() => Promise.resolve({ id: 'test-id' })),
      where: vi.fn(() => ({
        orderBy: vi.fn(() => ({
          get: vi.fn(() => Promise.resolve({
            forEach: vi.fn((callback) => {
              // Simulate some test documents
              const testDocs = [
                {
                  id: 'dispute1',
                  data: () => ({
                    userId: 'user123',
                    dealId: 'deal123',
                    transactionAmount: 1000,
                    stakeAmount: 25,
                    stakePercentage: 0.025,
                    outcome: 'resolved_in_favor',
                    createdAt: Timestamp.now()
                  })
                },
                {
                  id: 'dispute2',
                  data: () => ({
                    userId: 'user123',
                    dealId: 'deal456',
                    transactionAmount: 2000,
                    stakeAmount: 50,
                    stakePercentage: 0.025,
                    outcome: 'resolved_against',
                    createdAt: Timestamp.now()
                  })
                }
              ];
              testDocs.forEach(doc => callback(doc));
            })
          }))
        }))
      }))
    };

    mockDb = {
      collection: vi.fn((name) => mockCollection)
    };

    // Set up the mock return value
    getDb.mockResolvedValue(mockDb);

    // Create service instance
    reputationService = new ReputationService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Reputation Tiers', () => {
    it('should have correct tier configuration', () => {
      const tiers = reputationService.reputationTiers;
      
      expect(tiers).toHaveLength(5);
      expect(tiers[0]).toEqual({
        name: 'Restricted',
        minScore: 0,
        maxScore: 199,
        stakePercentage: 0.10
      });
      expect(tiers[1]).toEqual({
        name: 'Probation',
        minScore: 200,
        maxScore: 499,
        stakePercentage: 0.07
      });
      expect(tiers[2]).toEqual({
        name: 'Standard',
        minScore: 500,
        maxScore: 749,
        stakePercentage: 0.05
      });
      expect(tiers[3]).toEqual({
        name: 'Good',
        minScore: 750,
        maxScore: 899,
        stakePercentage: 0.035
      });
      expect(tiers[4]).toEqual({
        name: 'Excellent',
        minScore: 900,
        maxScore: 1000,
        stakePercentage: 0.025
      });
    });
  });

  describe('getUserReputationScore', () => {
    it('should return 1000 for new users', async () => {
      mockSnapshot.exists = false;
      
      const score = await reputationService.getUserReputationScore('newuser123');
      
      expect(score).toBe(1000);
      expect(mockCollection.doc).toHaveBeenCalledWith('newuser123');
    });

    it('should return stored reputation score for existing users', async () => {
      mockSnapshot.exists = true;
      mockSnapshot.data.mockReturnValue({ reputationScore: 850 });
      
      const score = await reputationService.getUserReputationScore('user123');
      
      expect(score).toBe(850);
    });

    it('should return 1000 if user exists but has no reputation score', async () => {
      mockSnapshot.exists = true;
      mockSnapshot.data.mockReturnValue({ name: 'Test User' });
      
      const score = await reputationService.getUserReputationScore('user123');
      
      expect(score).toBe(1000);
    });

    it('should return 1000 on database error', async () => {
      mockDocRef.get.mockRejectedValue(new Error('Database error'));
      
      const score = await reputationService.getUserReputationScore('user123');
      
      expect(score).toBe(1000);
    });
  });

  describe('calculateStakeRequirement', () => {
    it('should calculate correct stake for Excellent reputation (900-1000)', async () => {
      mockSnapshot.exists = true;
      mockSnapshot.data.mockReturnValue({ reputationScore: 950 });
      
      const result = await reputationService.calculateStakeRequirement('user123', 1000);
      
      expect(result).toEqual({
        reputationScore: 950,
        reputationLevel: 'Excellent',
        stakePercentage: 0.025,
        requiredStake: 25,
        currency: 'USDC'
      });
    });

    it('should calculate correct stake for Good reputation (750-899)', async () => {
      mockSnapshot.exists = true;
      mockSnapshot.data.mockReturnValue({ reputationScore: 800 });
      
      const result = await reputationService.calculateStakeRequirement('user123', 1000);
      
      expect(result).toEqual({
        reputationScore: 800,
        reputationLevel: 'Good',
        stakePercentage: 0.035,
        requiredStake: 35,
        currency: 'USDC'
      });
    });

    it('should calculate correct stake for Standard reputation (500-749)', async () => {
      mockSnapshot.exists = true;
      mockSnapshot.data.mockReturnValue({ reputationScore: 600 });
      
      const result = await reputationService.calculateStakeRequirement('user123', 1000);
      
      expect(result).toEqual({
        reputationScore: 600,
        reputationLevel: 'Standard',
        stakePercentage: 0.05,
        requiredStake: 50,
        currency: 'USDC'
      });
    });

    it('should calculate correct stake for Probation reputation (200-499)', async () => {
      mockSnapshot.exists = true;
      mockSnapshot.data.mockReturnValue({ reputationScore: 300 });
      
      const result = await reputationService.calculateStakeRequirement('user123', 1000);
      
      expect(result).toEqual({
        reputationScore: 300,
        reputationLevel: 'Probation',
        stakePercentage: 0.07,
        requiredStake: 70,
        currency: 'USDC'
      });
    });

    it('should calculate correct stake for Restricted reputation (0-199)', async () => {
      mockSnapshot.exists = true;
      mockSnapshot.data.mockReturnValue({ reputationScore: 100 });
      
      const result = await reputationService.calculateStakeRequirement('user123', 1000);
      
      expect(result).toEqual({
        reputationScore: 100,
        reputationLevel: 'Restricted',
        stakePercentage: 0.10,
        requiredStake: 100,
        currency: 'USDC'
      });
    });

    it('should handle large transaction amounts correctly', async () => {
      mockSnapshot.exists = true;
      mockSnapshot.data.mockReturnValue({ reputationScore: 950 });
      
      const result = await reputationService.calculateStakeRequirement('user123', 100000);
      
      expect(result.requiredStake).toBe(2500); // 2.5% of 100,000
    });
  });

  describe('updateReputationScore', () => {
    it('should decrease reputation score for negative points', async () => {
      mockSnapshot.exists = true;
      mockSnapshot.data.mockReturnValue({ reputationScore: 1000 });
      
      const result = await reputationService.updateReputationScore('user123', -100, 'Invalid dispute');
      
      expect(result).toEqual({
        previousScore: 1000,
        newScore: 900,
        pointsChanged: -100,
        tier: {
          name: 'Excellent',
          minScore: 900,
          maxScore: 1000,
          stakePercentage: 0.025
        }
      });
      
      expect(mockDocRef.set).toHaveBeenCalledWith({
        reputationScore: 900,
        lastReputationUpdate: expect.any(Object)
      }, { merge: true });
    });

    it('should not increase reputation above 1000', async () => {
      mockSnapshot.exists = true;
      mockSnapshot.data.mockReturnValue({ reputationScore: 950 });
      
      const result = await reputationService.updateReputationScore('user123', 100, 'Valid dispute');
      
      expect(result.newScore).toBe(1000); // Capped at 1000
    });

    it('should not decrease reputation below 0', async () => {
      mockSnapshot.exists = true;
      mockSnapshot.data.mockReturnValue({ reputationScore: 50 });
      
      const result = await reputationService.updateReputationScore('user123', -100, 'Invalid dispute');
      
      expect(result.newScore).toBe(0); // Capped at 0
    });

    it('should create reputation history record', async () => {
      mockSnapshot.exists = true;
      mockSnapshot.data.mockReturnValue({ reputationScore: 1000 });
      
      await reputationService.updateReputationScore('user123', -50, 'Partially valid dispute');
      
      expect(mockCollection.add).toHaveBeenCalledWith({
        userId: 'user123',
        previousScore: 1000,
        newScore: 950,
        pointsChanged: -50,
        reason: 'Partially valid dispute',
        timestamp: expect.any(Object)
      });
    });

    it('should handle database errors gracefully', async () => {
      mockDocRef.get.mockRejectedValue(new Error('Database error'));
      
      await expect(
        reputationService.updateReputationScore('user123', -50, 'Test')
      ).rejects.toThrow('Database error');
    });
  });

  describe('getReputationTier', () => {
    it('should return correct tier for score 1000', () => {
      const tier = reputationService.getReputationTier(1000);
      expect(tier.name).toBe('Excellent');
    });

    it('should return correct tier for score 900', () => {
      const tier = reputationService.getReputationTier(900);
      expect(tier.name).toBe('Excellent');
    });

    it('should return correct tier for score 899', () => {
      const tier = reputationService.getReputationTier(899);
      expect(tier.name).toBe('Good');
    });

    it('should return correct tier for score 0', () => {
      const tier = reputationService.getReputationTier(0);
      expect(tier.name).toBe('Restricted');
    });

    it('should handle boundary values correctly', () => {
      expect(reputationService.getReputationTier(199).name).toBe('Restricted');
      expect(reputationService.getReputationTier(200).name).toBe('Probation');
      expect(reputationService.getReputationTier(499).name).toBe('Probation');
      expect(reputationService.getReputationTier(500).name).toBe('Standard');
      expect(reputationService.getReputationTier(749).name).toBe('Standard');
      expect(reputationService.getReputationTier(750).name).toBe('Good');
    });
  });

  describe('recordDisputeStake', () => {
    it('should create dispute stake record with correct data', async () => {
      mockSnapshot.exists = true;
      mockSnapshot.data.mockReturnValue({ reputationScore: 950 });
      
      const stakeData = {
        userId: 'user123',
        dealId: 'deal123',
        transactionAmount: 1000,
        stakeAmount: 25,
        stakePercentage: 0.025,
        stakeToken: 'USDC'
      };
      
      const stakeId = await reputationService.recordDisputeStake(stakeData);
      
      expect(stakeId).toBe('test-id');
      expect(mockCollection.add).toHaveBeenCalledWith({
        userId: 'user123',
        dealId: 'deal123',
        transactionAmount: 1000,
        stakeAmount: 25,
        stakePercentage: 0.025,
        stakeToken: 'USDC',
        reputationScoreAtStake: 950,
        status: 'locked',
        createdAt: expect.any(Object)
      });
    });

    it('should use USDC as default token', async () => {
      mockSnapshot.exists = true;
      mockSnapshot.data.mockReturnValue({ reputationScore: 950 });
      
      const stakeData = {
        userId: 'user123',
        dealId: 'deal123',
        transactionAmount: 1000,
        stakeAmount: 25,
        stakePercentage: 0.025
      };
      
      await reputationService.recordDisputeStake(stakeData);
      
      expect(mockCollection.add).toHaveBeenCalledWith(
        expect.objectContaining({
          stakeToken: 'USDC'
        })
      );
    });
  });

  describe('updateDisputeStakeStatus', () => {
    beforeEach(() => {
      // Mock the stake document retrieval
      mockSnapshot.exists = true;
      mockSnapshot.data.mockReturnValue({
        userId: 'user123',
        stakeAmount: 50
      });
    });

    it('should handle resolved_in_favor outcome (no reputation loss)', async () => {
      const resolution = {
        status: 'returned',
        outcome: 'resolved_in_favor'
      };
      
      await reputationService.updateDisputeStakeStatus('stake123', resolution);
      
      expect(mockDocRef.update).toHaveBeenCalledWith({
        status: 'returned',
        outcome: 'resolved_in_favor',
        resolvedAt: expect.any(Object)
      });
    });

    it('should handle resolved_against outcome (100 reputation loss)', async () => {
      // Mock updateReputationScore
      const updateScoreSpy = vi.spyOn(reputationService, 'updateReputationScore')
        .mockResolvedValue({ newScore: 900 });
      
      const resolution = {
        status: 'slashed',
        outcome: 'resolved_against'
      };
      
      await reputationService.updateDisputeStakeStatus('stake123', resolution);
      
      expect(updateScoreSpy).toHaveBeenCalledWith(
        'user123',
        -100,
        'Invalid dispute raised - reputation decreased'
      );
    });

    it('should handle partial_return outcome (50 reputation loss)', async () => {
      const updateScoreSpy = vi.spyOn(reputationService, 'updateReputationScore')
        .mockResolvedValue({ newScore: 950 });
      
      const resolution = {
        status: 'partial_return',
        outcome: 'partial_return',
        amountReturned: 25,
        amountSlashed: 25
      };
      
      await reputationService.updateDisputeStakeStatus('stake123', resolution);
      
      expect(updateScoreSpy).toHaveBeenCalledWith(
        'user123',
        -50,
        'Partially valid dispute - reputation slightly decreased'
      );
      
      expect(mockDocRef.update).toHaveBeenCalledWith({
        status: 'partial_return',
        outcome: 'partial_return',
        resolvedAt: expect.any(Object),
        amountReturned: 25,
        amountSlashed: 25
      });
    });

    it('should handle timeout_return outcome (no reputation loss)', async () => {
      const resolution = {
        status: 'returned',
        outcome: 'timeout_return'
      };
      
      await reputationService.updateDisputeStakeStatus('stake123', resolution);
      
      expect(mockDocRef.update).toHaveBeenCalledWith({
        status: 'returned',
        outcome: 'timeout_return',
        resolvedAt: expect.any(Object)
      });
    });
  });

  describe('getUserDisputeHistory', () => {
    it('should calculate dispute statistics correctly', async () => {
      const history = await reputationService.getUserDisputeHistory('user123');
      
      expect(history).toEqual({
        disputes: expect.any(Array),
        totalStaked: 75, // 25 + 50
        totalReturned: 25, // Only dispute1
        totalSlashed: 50, // Only dispute2
        disputeCount: 2,
        successRate: 0.5 // 1 successful out of 2
      });
      
      expect(history.disputes).toHaveLength(2);
      expect(history.disputes[0]).toMatchObject({
        disputeId: 'dispute1',
        transactionAmount: 1000,
        stakeAmount: 25,
        outcome: 'resolved_in_favor'
      });
    });

    it('should handle partial returns in statistics', async () => {
      // Override the mock forEach to include a partial return
      mockCollection.where.mockReturnValue({
        orderBy: vi.fn(() => ({
          get: vi.fn(() => Promise.resolve({
            forEach: vi.fn((callback) => {
              callback({
                id: 'dispute1',
                data: () => ({
                  userId: 'user123',
                  stakeAmount: 100,
                  outcome: 'partial_return',
                  amountReturned: 60,
                  createdAt: Timestamp.now()
                })
              });
            })
          }))
        }))
      });
      
      const history = await reputationService.getUserDisputeHistory('user123');
      
      expect(history.totalStaked).toBe(100);
      expect(history.totalReturned).toBe(60);
      expect(history.totalSlashed).toBe(40);
    });
  });

  describe('getUserReputationStats', () => {
    it('should return comprehensive reputation statistics', async () => {
      mockSnapshot.exists = true;
      mockSnapshot.data.mockReturnValue({ reputationScore: 850 });
      
      const stats = await reputationService.getUserReputationStats('user123');
      
      expect(stats).toMatchObject({
        userId: 'user123',
        reputationScore: 850,
        reputationLevel: 'Good',
        currentStakePercentage: 0.035,
        disputeStats: {
          totalDisputes: 2,
          successfulDisputes: 1,
          failedDisputes: 1,
          totalStaked: 75,
          totalReturned: 25,
          totalSlashed: 50
        }
      });
      
      expect(stats.nextTier).toEqual({
        name: 'Excellent',
        requiredScore: 900,
        pointsNeeded: 50,
        stakePercentage: 0.025
      });
      
      expect(stats.previousTier).toEqual({
        name: 'Standard',
        maxScore: 749,
        pointsToLose: 101,
        stakePercentage: 0.05
      });
    });
  });

  describe('getNextTier and getPreviousTier', () => {
    it('should return null for next tier when at maximum', () => {
      const nextTier = reputationService.getNextTier(1000);
      expect(nextTier).toBeNull();
    });

    it('should return null for previous tier when at minimum', () => {
      const prevTier = reputationService.getPreviousTier(0);
      expect(prevTier).toBeNull();
    });

    it('should calculate correct points needed for next tier', () => {
      const nextTier = reputationService.getNextTier(850); // Good tier
      expect(nextTier.pointsNeeded).toBe(50); // 900 - 850
    });

    it('should calculate correct points to lose for previous tier', () => {
      const prevTier = reputationService.getPreviousTier(850); // Good tier
      expect(prevTier.pointsToLose).toBe(101); // 850 - 749
    });
  });
});