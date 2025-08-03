import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RiskAssessmentEngine } from '../riskAssessmentEngine.js';

// Mock dependencies
vi.mock('../../databaseService.js', () => ({
  getDb: vi.fn(() => mockDb)
}));

// Mock Firestore
const mockCollection = vi.fn();
const mockDoc = vi.fn();
const mockGet = vi.fn();
const mockSet = vi.fn();
const mockUpdate = vi.fn();
const mockAdd = vi.fn();
const mockWhere = vi.fn();
const mockOrderBy = vi.fn();
const mockLimit = vi.fn();

const mockDb = {
  collection: mockCollection.mockReturnThis(),
  doc: mockDoc.mockReturnThis(),
  get: mockGet,
  set: mockSet,
  update: mockUpdate,
  add: mockAdd,
  where: mockWhere.mockReturnThis(),
  orderBy: mockOrderBy.mockReturnThis(),
  limit: mockLimit.mockReturnThis()
};

describe('RiskAssessmentEngine', () => {
  let riskEngine;

  beforeEach(() => {
    vi.clearAllMocks();
    riskEngine = new RiskAssessmentEngine();
  });

  describe('calculateRiskScore', () => {
    it('should calculate comprehensive risk score', async () => {
      const userData = {
        userId: 'test-user-123',
        firstName: 'John',
        lastName: 'Doe',
        nationality: 'US',
        countryOfResidence: 'US',
        dateOfBirth: '1990-01-01',
        createdAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), // 90 days old account
        documents: {
          identity: {
            verified: true,
            qualityScore: 85,
            expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
          }
        }
      };

      const transactionData = {
        daily: { totalAmount: 500, count: 2 },
        monthly: { totalAmount: 5000, count: 20 },
        patterns: { possibleStructuring: false, rapidMovement: false }
      };

      const amlResults = {
        sanctionsHit: false,
        pepStatus: false,
        adverseMedia: false
      };

      // Mock historical data
      mockGet.mockResolvedValue({ 
        empty: true,
        size: 0,
        forEach: vi.fn()
      });

      const result = await riskEngine.calculateRiskScore(userData, transactionData, amlResults);

      expect(result).toMatchObject({
        assessmentId: expect.any(String),
        overallScore: expect.any(Number),
        riskLevel: expect.stringMatching(/^(minimal|low|medium|high|critical)$/),
        riskComponents: {
          geographic: expect.any(Object),
          documentary: expect.any(Object),
          behavioral: expect.any(Object),
          transactional: expect.any(Object),
          aml: expect.any(Object),
          demographic: expect.any(Object),
          historical: expect.any(Object)
        },
        requiredKYCLevel: expect.stringMatching(/^(basic|enhanced|full)$/),
        recommendations: expect.any(Array),
        timestamp: expect.any(Date),
        nextReviewDate: expect.any(Date)
      });
    });

    it('should handle missing data gracefully', async () => {
      const minimalUserData = {
        userId: 'test-user-123',
        createdAt: new Date()
      };

      mockGet.mockResolvedValue({ empty: true, forEach: vi.fn() });

      const result = await riskEngine.calculateRiskScore(minimalUserData, null, null);

      expect(result.riskLevel).toBeDefined();
      expect(result.overallScore).toBeGreaterThanOrEqual(0);
      expect(result.overallScore).toBeLessThanOrEqual(100);
    });
  });

  describe('assessGeographicRisk', () => {
    it('should identify high-risk countries', () => {
      const userData = {
        nationality: 'IR', // High-risk
        countryOfResidence: 'US'
      };

      const result = riskEngine.assessGeographicRisk(userData);

      expect(result.score).toBeGreaterThanOrEqual(40);
      expect(result.factors).toContainEqual(
        expect.objectContaining({ factor: 'high_risk_nationality' })
      );
    });

    it('should identify medium-risk countries', () => {
      const userData = {
        nationality: 'PK', // Medium-risk
        countryOfResidence: 'PK'
      };

      const result = riskEngine.assessGeographicRisk(userData);

      expect(result.score).toBeGreaterThanOrEqual(20);
      expect(result.score).toBeLessThan(80);
    });

    it('should detect nationality-residence mismatch', () => {
      const userData = {
        nationality: 'US',
        countryOfResidence: 'GB'
      };

      const result = riskEngine.assessGeographicRisk(userData);

      expect(result.factors).toContainEqual(
        expect.objectContaining({ factor: 'nationality_residence_mismatch' })
      );
      expect(result.details.mismatch).toBe(true);
    });

    it('should give low score for low-risk countries', () => {
      const userData = {
        nationality: 'US',
        countryOfResidence: 'US'
      };

      const result = riskEngine.assessGeographicRisk(userData);

      expect(result.score).toBe(0);
      expect(result.factors).toHaveLength(0);
    });
  });

  describe('assessDocumentaryRisk', () => {
    it('should assess verified documents as low risk', () => {
      const userData = {
        documents: {
          identity: {
            verified: true,
            qualityScore: 95,
            expiryDate: new Date(Date.now() + 2 * 365 * 24 * 60 * 60 * 1000).toISOString()
          },
          addressProof: {
            verified: true
          }
        },
        kycLevel: 'enhanced'
      };

      const result = riskEngine.assessDocumentaryRisk(userData);

      expect(result.score).toBe(0);
      expect(result.factors).toHaveLength(0);
    });

    it('should detect unverified documents', () => {
      const userData = {
        documents: {
          identity: {
            verified: false,
            qualityScore: 85
          }
        }
      };

      const result = riskEngine.assessDocumentaryRisk(userData);

      expect(result.factors).toContainEqual(
        expect.objectContaining({ factor: 'unverified_identity' })
      );
    });

    it('should detect expired documents', () => {
      const userData = {
        documents: {
          identity: {
            verified: true,
            expiryDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() // Expired yesterday
          }
        }
      };

      const result = riskEngine.assessDocumentaryRisk(userData);

      expect(result.factors).toContainEqual(
        expect.objectContaining({ factor: 'expired_document' })
      );
      expect(result.score).toBeGreaterThanOrEqual(40);
    });

    it('should detect poor document quality', () => {
      const userData = {
        documents: {
          identity: {
            verified: true,
            qualityScore: 45 // Poor quality
          }
        }
      };

      const result = riskEngine.assessDocumentaryRisk(userData);

      expect(result.factors).toContainEqual(
        expect.objectContaining({ 
          factor: 'poor_document_quality',
          score: 40
        })
      );
    });
  });

  describe('assessBehavioralRisk', () => {
    it('should identify new accounts as higher risk', async () => {
      const userData = {
        createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // 3 days old
        kycSessions: []
      };

      const result = await riskEngine.assessBehavioralRisk(userData, null);

      expect(result.factors).toContainEqual(
        expect.objectContaining({ factor: 'new_account' })
      );
      expect(result.score).toBeGreaterThanOrEqual(30);
    });

    it('should detect multiple KYC attempts', async () => {
      const userData = {
        createdAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
        kycSessions: [
          { status: 'failed' },
          { status: 'failed' },
          { status: 'abandoned' },
          { status: 'in_progress' }
        ]
      };

      const result = await riskEngine.assessBehavioralRisk(userData, null);

      expect(result.factors).toContainEqual(
        expect.objectContaining({ factor: 'multiple_kyc_attempts' })
      );
      expect(result.factors).toContainEqual(
        expect.objectContaining({ factor: 'failed_verifications' })
      );
    });

    it('should detect volume spikes', async () => {
      const transactionData = {
        historical: [
          { totalAmount: 50000 }, // Current month
          { totalAmount: 5000 }    // Previous month - 10x increase
        ]
      };

      const result = await riskEngine.assessBehavioralRisk(
        { createdAt: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000) },
        transactionData
      );

      expect(result.factors).toContainEqual(
        expect.objectContaining({ 
          factor: 'volume_spike',
          details: expect.stringContaining('%')
        })
      );
    });
  });

  describe('assessTransactionalRisk', () => {
    it('should assess high transaction volumes', () => {
      const transactionData = {
        daily: { totalAmount: 75000, count: 15 },
        monthly: { totalAmount: 600000, count: 150 },
        patterns: {}
      };

      const result = riskEngine.assessTransactionalRisk(transactionData);

      expect(result.factors).toContainEqual(
        expect.objectContaining({ factor: 'high_daily_volume' })
      );
      expect(result.factors).toContainEqual(
        expect.objectContaining({ factor: 'high_monthly_volume' })
      );
      expect(result.score).toBeGreaterThanOrEqual(60);
    });

    it('should detect possible structuring', () => {
      const transactionData = {
        daily: { totalAmount: 9500, count: 5 },
        monthly: { totalAmount: 95000, count: 50 },
        patterns: { possibleStructuring: true }
      };

      const result = riskEngine.assessTransactionalRisk(transactionData);

      expect(result.factors).toContainEqual(
        expect.objectContaining({ 
          factor: 'possible_structuring',
          score: 40
        })
      );
    });

    it('should handle no transaction history', () => {
      const result = riskEngine.assessTransactionalRisk(null);

      expect(result.score).toBe(0);
      expect(result.details.noTransactionHistory).toBe(true);
    });
  });

  describe('assessAMLRisk', () => {
    it('should assign critical risk for sanctions hit', () => {
      const amlResults = {
        sanctionsHit: true,
        sanctionsMatches: [{ listSource: 'OFAC' }],
        pepStatus: false,
        adverseMedia: false
      };

      const result = riskEngine.assessAMLRisk(amlResults);

      expect(result.score).toBe(100);
      expect(result.factors).toContainEqual(
        expect.objectContaining({ 
          factor: 'sanctions_hit',
          score: 100
        })
      );
    });

    it('should calculate cumulative AML risk', () => {
      const amlResults = {
        sanctionsHit: false,
        pepStatus: true,
        pepDetails: { position: 'Minister' },
        adverseMedia: true,
        adverseMediaSources: ['News Article 1']
      };

      const result = riskEngine.assessAMLRisk(amlResults);

      expect(result.score).toBe(80); // 50 + 30
      expect(result.factors).toHaveLength(2);
    });
  });

  describe('assessDemographicRisk', () => {
    it('should assess age-based risk', () => {
      const youngUser = {
        dateOfBirth: new Date(Date.now() - 19 * 365.25 * 24 * 60 * 60 * 1000).toISOString(), // 19 years old
        firstName: 'John',
        lastName: 'Doe',
        address: '123 Test St'
      };

      const result = riskEngine.assessDemographicRisk(youngUser);

      expect(result.factors).toContainEqual(
        expect.objectContaining({ 
          factor: 'veryYoung_age_group',
          age: expect.any(Number)
        })
      );
    });

    it('should detect incomplete profiles', () => {
      const incompleteUser = {
        firstName: 'John',
        // Missing lastName, dateOfBirth, address
      };

      const result = riskEngine.assessDemographicRisk(incompleteUser);

      expect(result.factors).toContainEqual(
        expect.objectContaining({ 
          factor: 'incomplete_profile',
          missingFields: expect.arrayContaining(['lastName', 'dateOfBirth', 'address'])
        })
      );
      expect(result.details.profileCompleteness).toBeLessThan(50);
    });
  });

  describe('calculateWeightedScore', () => {
    it('should apply correct weights', () => {
      const riskComponents = {
        aml: { score: 100 },         // 25% weight
        geographic: { score: 50 },    // 20% weight
        transactional: { score: 40 }, // 20% weight
        documentary: { score: 30 },   // 15% weight
        behavioral: { score: 20 },    // 10% weight
        demographic: { score: 10 },   // 5% weight
        historical: { score: 10 }     // 5% weight
      };

      const score = riskEngine.calculateWeightedScore(riskComponents);

      // Expected: (100*0.25) + (50*0.20) + (40*0.20) + (30*0.15) + (20*0.10) + (10*0.05) + (10*0.05)
      // = 25 + 10 + 8 + 4.5 + 2 + 0.5 + 0.5 = 50.5 ≈ 51
      expect(score).toBe(51);
    });

    it('should normalize when components are missing', () => {
      const partialComponents = {
        aml: { score: 100 },      // 25% of original weight
        geographic: { score: 50 } // 20% of original weight
      };

      const score = riskEngine.calculateWeightedScore(partialComponents);

      // Should normalize: 100 * (0.25/0.45) + 50 * (0.20/0.45)
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(100);
    });
  });

  describe('determineRiskLevel', () => {
    it('should categorize risk levels correctly', () => {
      const testCases = [
        { score: 95, expected: 'critical' },
        { score: 80, expected: 'critical' },
        { score: 75, expected: 'high' },
        { score: 60, expected: 'high' },
        { score: 55, expected: 'medium' },
        { score: 40, expected: 'medium' },
        { score: 35, expected: 'low' },
        { score: 20, expected: 'low' },
        { score: 15, expected: 'minimal' },
        { score: 0, expected: 'minimal' }
      ];

      testCases.forEach(({ score, expected }) => {
        const result = riskEngine.determineRiskLevel(score);
        expect(result).toBe(expected);
      });
    });
  });

  describe('determineRequiredKYCLevel', () => {
    it('should require full KYC for critical risk', () => {
      const result = riskEngine.determineRequiredKYCLevel('critical', null);
      expect(result).toBe('full');
    });

    it('should upgrade based on transaction volume', () => {
      const transactionData = {
        monthly: { totalAmount: 150000 }
      };

      const result = riskEngine.determineRequiredKYCLevel('low', transactionData);
      expect(result).toBe('full');
    });

    it('should maintain minimum requirements', () => {
      const result = riskEngine.determineRequiredKYCLevel('minimal', null);
      expect(result).toBe('basic');
    });
  });

  describe('generateRecommendations', () => {
    it('should generate critical recommendations', () => {
      const riskComponents = {
        aml: { score: 100 }
      };

      const recommendations = riskEngine.generateRecommendations(riskComponents, 'critical');

      expect(recommendations).toContainEqual(
        expect.objectContaining({
          priority: 'critical',
          action: 'manual_review_required'
        })
      );
    });

    it('should generate multiple relevant recommendations', () => {
      const riskComponents = {
        aml: { score: 60 },
        geographic: { score: 50 },
        transactional: { score: 70 },
        documentary: { score: 45 }
      };

      const recommendations = riskEngine.generateRecommendations(riskComponents, 'high');

      expect(recommendations.length).toBeGreaterThanOrEqual(4);
      expect(recommendations).toContainEqual(
        expect.objectContaining({ action: 'enhanced_monitoring' })
      );
      expect(recommendations).toContainEqual(
        expect.objectContaining({ action: 'transaction_limits' })
      );
    });
  });

  describe('calculateNextReviewDate', () => {
    it('should set appropriate review periods', () => {
      const now = new Date();
      
      const criticalReview = riskEngine.calculateNextReviewDate('critical');
      const daysDiff = (criticalReview - now) / (1000 * 60 * 60 * 24);
      expect(Math.round(daysDiff)).toBe(7);

      const minimalReview = riskEngine.calculateNextReviewDate('minimal');
      const daysDiffMinimal = (minimalReview - now) / (1000 * 60 * 60 * 24);
      expect(Math.round(daysDiffMinimal)).toBe(365);
    });
  });

  describe('updateRiskAssessment', () => {
    it('should update assessment on trigger', async () => {
      const userId = 'test-user-123';
      
      mockGet.mockResolvedValueOnce({
        exists: true,
        data: () => ({
          userId: 'test-user-123',
          firstName: 'John',
          lastName: 'Doe',
          nationality: 'US',
          countryOfResidence: 'US',
          dateOfBirth: '1990-01-01',
          createdAt: new Date(),
          riskProfile: { overallRisk: 'low' }
        })
      });

      const result = await riskEngine.updateRiskAssessment(userId, 'transaction_limit_exceeded');

      expect(result).toMatchObject({
        assessmentId: expect.any(String),
        riskLevel: expect.any(String)
      });

      expect(mockAdd).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'risk_assessment_triggered',
          details: expect.objectContaining({
            trigger: 'transaction_limit_exceeded'
          })
        })
      );
    });
  });

  describe('Performance Tests', () => {
    it('should complete risk assessment within acceptable time', async () => {
      const userData = {
        userId: 'test-user-123',
        firstName: 'John',
        lastName: 'Doe',
        nationality: 'US',
        countryOfResidence: 'US',
        dateOfBirth: '1990-01-01',
        createdAt: new Date()
      };
      mockGet.mockResolvedValue({ empty: true, forEach: vi.fn() });

      const startTime = Date.now();
      await riskEngine.calculateRiskScore(userData, null, null);
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
    });

    it('should handle concurrent assessments', async () => {
      mockGet.mockResolvedValue({ empty: true, forEach: vi.fn() });

      const promises = Array(5).fill(null).map((_, i) => 
        riskEngine.calculateRiskScore({
          userId: `user-${i}`,
          nationality: ['US', 'IR', 'GB', 'PK', 'CA'][i],
          countryOfResidence: ['US', 'IR', 'GB', 'PK', 'CA'][i],
          createdAt: new Date()
        })
      );

      const results = await Promise.all(promises);

      expect(results).toHaveLength(5);
      expect(results.every(r => r.riskLevel)).toBe(true);
    });
  });
});