// src/services/kyc/riskAssessmentEngine.js

import { getDb } from '../databaseService.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Risk Assessment Engine
 * Calculates comprehensive risk scores based on multiple factors
 */
export class RiskAssessmentEngine {
  constructor() {
    this.riskFactors = {
      // Geographic risk factors (countries)
      geographic: {
        high: ['IR', 'KP', 'MM', 'AF', 'YE', 'SY'], // FATF high-risk jurisdictions
        medium: ['PK', 'JM', 'PH', 'ML', 'HT', 'MZ'],
        low: ['US', 'GB', 'CA', 'AU', 'NZ', 'JP', 'DE', 'FR']
      },
      
      // Transaction amount thresholds
      transactionThresholds: {
        daily: { low: 1000, medium: 10000, high: 50000 },
        monthly: { low: 10000, medium: 100000, high: 500000 }
      },
      
      // Document quality scores
      documentQuality: {
        excellent: { min: 90, score: 0 },
        good: { min: 70, score: 10 },
        fair: { min: 50, score: 20 },
        poor: { min: 0, score: 40 }
      },
      
      // Age risk factors
      ageRisk: {
        veryYoung: { min: 18, max: 21, score: 20 },
        young: { min: 22, max: 25, score: 10 },
        normal: { min: 26, max: 65, score: 0 },
        elderly: { min: 66, max: 100, score: 10 }
      }
    };
  }

  /**
   * Calculate comprehensive risk score for a user
   * @param {Object} userData - User data including KYC information
   * @param {Object} transactionData - Transaction history and patterns
   * @param {Object} amlResults - AML screening results
   * @returns {Promise<Object>} Risk assessment results
   */
  async calculateRiskScore(userData, transactionData = null, amlResults = null) {
    console.log(`[RiskAssessment] Calculating risk score for user ${userData.userId}`);

    try {
      const riskComponents = {
        geographic: this.assessGeographicRisk(userData),
        documentary: this.assessDocumentaryRisk(userData),
        behavioral: await this.assessBehavioralRisk(userData, transactionData),
        transactional: this.assessTransactionalRisk(transactionData),
        aml: this.assessAMLRisk(amlResults),
        demographic: this.assessDemographicRisk(userData),
        historical: await this.assessHistoricalRisk(userData.userId)
      };

      // Calculate weighted overall score
      const overallScore = this.calculateWeightedScore(riskComponents);
      const riskLevel = this.determineRiskLevel(overallScore);
      const requiredKYCLevel = this.determineRequiredKYCLevel(riskLevel, transactionData);

      // Generate recommendations
      const recommendations = this.generateRecommendations(riskComponents, riskLevel);

      // Store assessment results
      const assessmentId = await this.storeAssessment(userData.userId, {
        riskComponents,
        overallScore,
        riskLevel,
        requiredKYCLevel,
        recommendations
      });

      return {
        assessmentId,
        overallScore,
        riskLevel,
        riskComponents,
        requiredKYCLevel,
        recommendations,
        timestamp: new Date(),
        nextReviewDate: this.calculateNextReviewDate(riskLevel)
      };
    } catch (error) {
      console.error('[RiskAssessment] Error calculating risk score:', error);
      throw error;
    }
  }

  /**
   * Assess geographic risk based on country
   */
  assessGeographicRisk(userData) {
    const { nationality, countryOfResidence } = userData;
    let score = 0;
    let factors = [];

    // Check nationality
    if (this.riskFactors.geographic.high.includes(nationality)) {
      score += 40;
      factors.push({ factor: 'high_risk_nationality', score: 40 });
    } else if (this.riskFactors.geographic.medium.includes(nationality)) {
      score += 20;
      factors.push({ factor: 'medium_risk_nationality', score: 20 });
    }

    // Check country of residence
    if (this.riskFactors.geographic.high.includes(countryOfResidence)) {
      score += 40;
      factors.push({ factor: 'high_risk_residence', score: 40 });
    } else if (this.riskFactors.geographic.medium.includes(countryOfResidence)) {
      score += 20;
      factors.push({ factor: 'medium_risk_residence', score: 20 });
    }

    // Mismatch between nationality and residence
    if (nationality !== countryOfResidence) {
      score += 10;
      factors.push({ factor: 'nationality_residence_mismatch', score: 10 });
    }

    return {
      score: Math.min(score, 100),
      factors,
      details: {
        nationality,
        countryOfResidence,
        mismatch: nationality !== countryOfResidence
      }
    };
  }

  /**
   * Assess documentary risk based on document quality and verification
   */
  assessDocumentaryRisk(userData) {
    const { documents = {} } = userData;
    let score = 0;
    let factors = [];

    // Check document verification status
    if (!documents.identity?.verified) {
      score += 30;
      factors.push({ factor: 'unverified_identity', score: 30 });
    }

    // Check document quality scores
    const qualityScore = documents.identity?.qualityScore || 0;
    for (const [level, config] of Object.entries(this.riskFactors.documentQuality)) {
      if (qualityScore >= config.min) {
        score += config.score;
        if (config.score > 0) {
          factors.push({ factor: `${level}_document_quality`, score: config.score });
        }
        break;
      }
    }

    // Check for expired documents
    if (documents.identity?.expiryDate) {
      const expiryDate = new Date(documents.identity.expiryDate);
      const daysUntilExpiry = (expiryDate - new Date()) / (1000 * 60 * 60 * 24);
      
      if (daysUntilExpiry < 0) {
        score += 40;
        factors.push({ factor: 'expired_document', score: 40 });
      } else if (daysUntilExpiry < 90) {
        score += 20;
        factors.push({ factor: 'expiring_soon', score: 20 });
      }
    }

    // Missing required documents
    if (!documents.addressProof?.verified && userData.kycLevel === 'enhanced') {
      score += 20;
      factors.push({ factor: 'missing_address_proof', score: 20 });
    }

    return {
      score: Math.min(score, 100),
      factors,
      details: {
        documentsProvided: Object.keys(documents).length,
        verifiedDocuments: Object.values(documents).filter(d => d.verified).length,
        qualityScore
      }
    };
  }

  /**
   * Assess behavioral risk based on user activity patterns
   */
  async assessBehavioralRisk(userData, transactionData) {
    let score = 0;
    let factors = [];

    // Check account age
    const accountAge = (new Date() - new Date(userData.createdAt)) / (1000 * 60 * 60 * 24);
    if (accountAge < 7) {
      score += 30;
      factors.push({ factor: 'new_account', score: 30 });
    } else if (accountAge < 30) {
      score += 15;
      factors.push({ factor: 'recent_account', score: 15 });
    }

    // Check verification velocity (how quickly they're trying to get verified)
    if (userData.kycSessions?.length > 3) {
      score += 20;
      factors.push({ factor: 'multiple_kyc_attempts', score: 20 });
    }

    // Check for multiple failed verifications
    const failedSessions = userData.kycSessions?.filter(s => s.status === 'failed') || [];
    if (failedSessions.length > 0) {
      score += failedSessions.length * 10;
      factors.push({ factor: 'failed_verifications', score: failedSessions.length * 10 });
    }

    // Check for unusual patterns
    if (transactionData) {
      // Sudden increase in transaction volume
      const volumeIncrease = this.detectVolumeSpike(transactionData);
      if (volumeIncrease > 500) { // 500% increase
        score += 30;
        factors.push({ factor: 'volume_spike', score: 30, details: `${volumeIncrease}% increase` });
      }

      // Unusual transaction times
      const unusualTimes = this.detectUnusualTransactionTimes(transactionData);
      if (unusualTimes > 0.3) { // 30% of transactions at unusual times
        score += 20;
        factors.push({ factor: 'unusual_transaction_times', score: 20 });
      }
    }

    return {
      score: Math.min(score, 100),
      factors,
      details: {
        accountAgeDays: Math.floor(accountAge),
        kycAttempts: userData.kycSessions?.length || 0,
        failedVerifications: failedSessions.length
      }
    };
  }

  /**
   * Assess transactional risk based on transaction patterns
   */
  assessTransactionalRisk(transactionData) {
    if (!transactionData) {
      return {
        score: 0,
        factors: [],
        details: { noTransactionHistory: true }
      };
    }

    let score = 0;
    let factors = [];

    const { daily, monthly, patterns } = transactionData;

    // Check daily volume
    if (daily.totalAmount > this.riskFactors.transactionThresholds.daily.high) {
      score += 30;
      factors.push({ factor: 'high_daily_volume', score: 30 });
    } else if (daily.totalAmount > this.riskFactors.transactionThresholds.daily.medium) {
      score += 15;
      factors.push({ factor: 'medium_daily_volume', score: 15 });
    }

    // Check monthly volume
    if (monthly.totalAmount > this.riskFactors.transactionThresholds.monthly.high) {
      score += 30;
      factors.push({ factor: 'high_monthly_volume', score: 30 });
    } else if (monthly.totalAmount > this.riskFactors.transactionThresholds.monthly.medium) {
      score += 15;
      factors.push({ factor: 'medium_monthly_volume', score: 15 });
    }

    // Check for structuring (transactions just below reporting thresholds)
    if (patterns?.possibleStructuring) {
      score += 40;
      factors.push({ factor: 'possible_structuring', score: 40 });
    }

    // Check for rapid movement of funds
    if (patterns?.rapidMovement) {
      score += 30;
      factors.push({ factor: 'rapid_fund_movement', score: 30 });
    }

    // Check transaction frequency
    if (daily.count > 10) {
      score += 20;
      factors.push({ factor: 'high_transaction_frequency', score: 20 });
    }

    return {
      score: Math.min(score, 100),
      factors,
      details: {
        dailyVolume: daily.totalAmount,
        monthlyVolume: monthly.totalAmount,
        dailyCount: daily.count,
        monthlyCount: monthly.count
      }
    };
  }

  /**
   * Assess AML risk based on screening results
   */
  assessAMLRisk(amlResults) {
    if (!amlResults) {
      return {
        score: 0,
        factors: [],
        details: { noAMLScreening: true }
      };
    }

    let score = 0;
    let factors = [];

    // Sanctions hit is critical
    if (amlResults.sanctionsHit) {
      score += 100;
      factors.push({ 
        factor: 'sanctions_hit', 
        score: 100,
        matches: amlResults.sanctionsMatches
      });
    }

    // PEP status is high risk
    if (amlResults.pepStatus) {
      score += 50;
      factors.push({ 
        factor: 'pep_status', 
        score: 50,
        details: amlResults.pepDetails
      });
    }

    // Adverse media is medium risk
    if (amlResults.adverseMedia) {
      score += 30;
      factors.push({ 
        factor: 'adverse_media', 
        score: 30,
        sources: amlResults.adverseMediaSources
      });
    }

    return {
      score: Math.min(score, 100),
      factors,
      details: {
        sanctionsChecked: true,
        pepChecked: true,
        adverseMediaChecked: true
      }
    };
  }

  /**
   * Assess demographic risk based on age and other factors
   */
  assessDemographicRisk(userData) {
    let score = 0;
    let factors = [];

    // Calculate age
    if (userData.dateOfBirth) {
      const age = Math.floor((new Date() - new Date(userData.dateOfBirth)) / (1000 * 60 * 60 * 24 * 365.25));
      
      for (const [category, config] of Object.entries(this.riskFactors.ageRisk)) {
        if (age >= config.min && age <= config.max) {
          score += config.score;
          if (config.score > 0) {
            factors.push({ factor: `${category}_age_group`, score: config.score, age });
          }
          break;
        }
      }
    }

    // Check for incomplete profile
    const requiredFields = ['firstName', 'lastName', 'dateOfBirth', 'address'];
    const missingFields = requiredFields.filter(field => !userData[field]);
    if (missingFields.length > 0) {
      score += missingFields.length * 5;
      factors.push({ 
        factor: 'incomplete_profile', 
        score: missingFields.length * 5,
        missingFields
      });
    }

    return {
      score: Math.min(score, 100),
      factors,
      details: {
        profileCompleteness: ((requiredFields.length - missingFields.length) / requiredFields.length) * 100
      }
    };
  }

  /**
   * Assess historical risk based on past behavior
   */
  async assessHistoricalRisk(userId) {
    try {
      const db = await getDb();
      
      // Get compliance history
      const complianceHistory = await db.collection('complianceAudits')
        .where('userId', '==', userId)
        .where('action', 'in', ['manual_review_required', 'suspicious_activity_detected'])
        .get();

      let score = 0;
      let factors = [];

      // Each historical issue adds to risk
      complianceHistory.forEach(doc => {
        const audit = doc.data();
        if (audit.action === 'manual_review_required') {
          score += 10;
          factors.push({ factor: 'previous_manual_review', score: 10 });
        } else if (audit.action === 'suspicious_activity_detected') {
          score += 20;
          factors.push({ factor: 'previous_suspicious_activity', score: 20 });
        }
      });

      // Check for previous high-risk assessments
      const previousAssessments = await db.collection('riskAssessments')
        .where('userId', '==', userId)
        .where('riskLevel', 'in', ['high', 'critical'])
        .limit(5)
        .get();

      if (!previousAssessments.empty) {
        score += previousAssessments.size * 5;
        factors.push({ 
          factor: 'previous_high_risk_assessments', 
          score: previousAssessments.size * 5,
          count: previousAssessments.size
        });
      }

      return {
        score: Math.min(score, 100),
        factors,
        details: {
          complianceIssues: complianceHistory.size,
          previousHighRiskAssessments: previousAssessments.size
        }
      };
    } catch (error) {
      console.error('[RiskAssessment] Error assessing historical risk:', error);
      return {
        score: 0,
        factors: [],
        details: { error: 'Unable to assess historical risk' }
      };
    }
  }

  /**
   * Calculate weighted overall score
   */
  calculateWeightedScore(riskComponents) {
    const weights = {
      aml: 0.25,        // 25% - AML is critical
      geographic: 0.20, // 20% - Geographic risk is important
      transactional: 0.20, // 20% - Transaction patterns matter
      documentary: 0.15,   // 15% - Document quality
      behavioral: 0.10,    // 10% - Behavioral patterns
      demographic: 0.05,   // 5% - Demographics
      historical: 0.05     // 5% - Historical issues
    };

    let weightedScore = 0;
    let totalWeight = 0;

    for (const [component, weight] of Object.entries(weights)) {
      if (riskComponents[component]) {
        weightedScore += riskComponents[component].score * weight;
        totalWeight += weight;
      }
    }

    // Normalize if not all components are present
    if (totalWeight < 1) {
      weightedScore = weightedScore / totalWeight;
    }

    return Math.round(weightedScore);
  }

  /**
   * Determine risk level based on score
   */
  determineRiskLevel(score) {
    if (score >= 80) return 'critical';
    if (score >= 60) return 'high';
    if (score >= 40) return 'medium';
    if (score >= 20) return 'low';
    return 'minimal';
  }

  /**
   * Determine required KYC level based on risk
   */
  determineRequiredKYCLevel(riskLevel, transactionData) {
    // Base requirement on risk level
    const baseRequirement = {
      critical: 'full',
      high: 'full',
      medium: 'enhanced',
      low: 'basic',
      minimal: 'basic'
    };

    let requiredLevel = baseRequirement[riskLevel];

    // Upgrade based on transaction volume
    if (transactionData) {
      if (transactionData.monthly.totalAmount > 100000) {
        requiredLevel = 'full';
      } else if (transactionData.monthly.totalAmount > 10000 && requiredLevel === 'basic') {
        requiredLevel = 'enhanced';
      }
    }

    return requiredLevel;
  }

  /**
   * Generate recommendations based on risk assessment
   */
  generateRecommendations(riskComponents, riskLevel) {
    const recommendations = [];

    // Critical risk recommendations
    if (riskLevel === 'critical') {
      recommendations.push({
        priority: 'critical',
        action: 'manual_review_required',
        reason: 'Critical risk level detected',
        description: 'Immediate manual review required before any transactions'
      });
    }

    // AML-specific recommendations
    if (riskComponents.aml?.score > 50) {
      recommendations.push({
        priority: 'high',
        action: 'enhanced_monitoring',
        reason: 'AML risk detected',
        description: 'Enable enhanced transaction monitoring'
      });
    }

    // Geographic recommendations
    if (riskComponents.geographic?.score > 40) {
      recommendations.push({
        priority: 'medium',
        action: 'additional_verification',
        reason: 'High-risk jurisdiction',
        description: 'Request additional documentation for source of funds'
      });
    }

    // Transaction recommendations
    if (riskComponents.transactional?.score > 60) {
      recommendations.push({
        priority: 'high',
        action: 'transaction_limits',
        reason: 'High transaction volume',
        description: 'Apply reduced transaction limits until further verification'
      });
    }

    // Document recommendations
    if (riskComponents.documentary?.score > 40) {
      recommendations.push({
        priority: 'medium',
        action: 'document_reverification',
        reason: 'Document quality issues',
        description: 'Request clearer documents or alternative verification methods'
      });
    }

    return recommendations;
  }

  /**
   * Calculate next review date based on risk level
   */
  calculateNextReviewDate(riskLevel) {
    const reviewPeriods = {
      critical: 7,    // 7 days
      high: 30,       // 30 days
      medium: 90,     // 90 days
      low: 180,       // 180 days
      minimal: 365    // 1 year
    };

    const days = reviewPeriods[riskLevel] || 90;
    const nextReview = new Date();
    nextReview.setDate(nextReview.getDate() + days);
    
    return nextReview;
  }

  /**
   * Store risk assessment in database
   */
  async storeAssessment(userId, assessment) {
    try {
      const db = await getDb();
      const assessmentId = uuidv4();

      await db.collection('riskAssessments').doc(assessmentId).set({
        assessmentId,
        userId,
        ...assessment,
        createdAt: new Date(),
        createdBy: 'system'
      });

      // Update user's risk profile
      await db.collection('users').doc(userId).update({
        'riskProfile.overallRisk': assessment.riskLevel,
        'riskProfile.riskScore': assessment.overallScore,
        'riskProfile.lastAssessment': new Date(),
        'riskProfile.nextReview': this.calculateNextReviewDate(assessment.riskLevel),
        'riskProfile.factors': assessment.riskComponents
      });

      // Log audit entry
      await db.collection('complianceAudits').add({
        auditId: uuidv4(),
        userId,
        action: 'risk_assessment_completed',
        timestamp: new Date(),
        performedBy: 'system',
        details: {
          assessmentId,
          riskLevel: assessment.riskLevel,
          score: assessment.overallScore
        },
        result: 'success'
      });

      return assessmentId;
    } catch (error) {
      console.error('[RiskAssessment] Error storing assessment:', error);
      throw error;
    }
  }

  /**
   * Detect volume spikes in transaction data
   */
  detectVolumeSpike(transactionData) {
    const { historical } = transactionData;
    if (!historical || historical.length < 2) return 0;

    const currentMonth = historical[0].totalAmount;
    const previousMonth = historical[1].totalAmount;

    if (previousMonth === 0) return 0;
    
    const increase = ((currentMonth - previousMonth) / previousMonth) * 100;
    return Math.max(0, increase);
  }

  /**
   * Detect unusual transaction times
   */
  detectUnusualTransactionTimes(transactionData) {
    const { patterns } = transactionData;
    if (!patterns?.hourlyDistribution) return 0;

    // Consider transactions between 2 AM and 5 AM as unusual
    const unusualHours = [2, 3, 4, 5];
    const unusualTransactions = unusualHours.reduce((sum, hour) => 
      sum + (patterns.hourlyDistribution[hour] || 0), 0
    );

    const totalTransactions = Object.values(patterns.hourlyDistribution)
      .reduce((sum, count) => sum + count, 0);

    return totalTransactions > 0 ? unusualTransactions / totalTransactions : 0;
  }

  /**
   * Update risk assessment based on new information
   */
  async updateRiskAssessment(userId, trigger) {
    console.log(`[RiskAssessment] Updating assessment for user ${userId} due to ${trigger}`);

    try {
      const db = await getDb();
      
      // Get user data
      const userDoc = await db.collection('users').doc(userId).get();
      if (!userDoc.exists) {
        throw new Error('User not found');
      }

      const userData = { userId, ...userDoc.data() };

      // Get transaction data if available
      const transactionData = await this.getTransactionData(userId);

      // Get latest AML results
      const amlResults = userData.amlStatus?.lastScreened ? {
        sanctionsHit: userData.amlStatus.sanctions?.matches?.length > 0,
        pepStatus: userData.amlStatus.pep?.isPEP,
        adverseMedia: userData.amlStatus.adverseMedia?.hasAdverseMedia
      } : null;

      // Recalculate risk
      const assessment = await this.calculateRiskScore(userData, transactionData, amlResults);

      // Log the trigger
      await db.collection('complianceAudits').add({
        auditId: uuidv4(),
        userId,
        action: 'risk_assessment_triggered',
        timestamp: new Date(),
        performedBy: 'system',
        details: {
          trigger,
          newRiskLevel: assessment.riskLevel,
          previousRiskLevel: userData.riskProfile?.overallRisk
        },
        result: 'success'
      });

      return assessment;
    } catch (error) {
      console.error('[RiskAssessment] Error updating assessment:', error);
      throw error;
    }
  }

  /**
   * Get transaction data for risk assessment
   */
  async getTransactionData(userId) {
    // This would integrate with your transaction service
    // For now, return mock data structure
    return null;
  }
}

// Export singleton instance
export const riskAssessmentEngine = new RiskAssessmentEngine();