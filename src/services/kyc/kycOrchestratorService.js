// src/services/kyc/kycOrchestratorService.js

import { getDb } from '../databaseService.js';
import { FieldValue } from 'firebase-admin/firestore';
import { v4 as uuidv4 } from 'uuid';
import { kycLevelRequirements } from './schemas/kycSchemas.js';
import { databaseEvents } from '../databaseService.js';

/**
 * Core KYC Orchestrator Service
 * Manages the entire KYC verification workflow
 */
export class KYCOrchestratorService {
  constructor() {
    this.documentProcessor = null; // Will be initialized when needed
    this.faceVerifier = null; // Will be initialized when needed
    this.amlScreener = null; // Will be initialized when needed
    this.riskEngine = null; // Will be initialized when needed
    this.notificationService = null; // Will be initialized when needed
  }

  /**
   * Initialize a new KYC process for a user
   * @param {string} userId - The user ID
   * @param {string} requiredLevel - KYC level required ('basic' | 'enhanced' | 'full')
   * @returns {Promise<Object>} Session details
   */
  async initiateKYCProcess(userId, requiredLevel = 'basic') {
    try {
      const db = await getDb();
      
      // Check if user exists
      const userDoc = await db.collection('users').doc(userId).get();
      if (!userDoc.exists) {
        throw new Error('User not found');
      }
      
      const userData = userDoc.data();
      
      // Check if user already has active session
      const activeSessions = await db.collection('kycSessions')
        .where('userId', '==', userId)
        .where('status', 'in', ['active', 'in_progress'])
        .get();
      
      if (!activeSessions.empty) {
        // Return existing session
        return {
          sessionId: activeSessions.docs[0].id,
          ...activeSessions.docs[0].data()
        };
      }
      
      // Create new session
      const sessionId = uuidv4();
      const sessionData = {
        sessionId,
        userId,
        requiredLevel,
        status: 'active',
        startedAt: FieldValue.serverTimestamp(),
        completedAt: null,
        steps: {
          documentUpload: { 
            status: 'pending',
            completedAt: null 
          },
          livenessCheck: { 
            status: 'pending',
            completedAt: null 
          },
          dataVerification: { 
            status: 'pending',
            completedAt: null 
          },
          amlScreening: { 
            status: 'pending',
            completedAt: null 
          }
        },
        requiredDocuments: this.getRequiredDocuments(requiredLevel),
        metadata: {
          userAgent: null, // Will be set by API
          ipAddress: null, // Will be set by API
          deviceFingerprint: null // Will be set by API
        }
      };
      
      await db.collection('kycSessions').doc(sessionId).set(sessionData);
      
      // Update user's KYC status
      await db.collection('users').doc(userId).update({
        'kycStatus.status': 'in_progress',
        'kycStatus.lastUpdated': FieldValue.serverTimestamp()
      });
      
      // Emit event
      databaseEvents.emit('kycSessionStarted', userId, sessionData);
      
      // Log audit entry
      await this.logAuditEntry(userId, 'kyc_started', {
        sessionId,
        requiredLevel
      });
      
      console.log(`[KYCOrchestrator] KYC session ${sessionId} initiated for user ${userId}`);
      
      return sessionData;
    } catch (error) {
      console.error('[KYCOrchestrator] Error initiating KYC process:', error);
      throw error;
    }
  }

  /**
   * Process uploaded document
   * @param {string} sessionId - Session ID
   * @param {string} documentType - Type of document
   * @param {Object} documentData - Document data and metadata
   */
  async processDocument(sessionId, documentType, documentData) {
    try {
      const db = await getDb();
      const sessionRef = db.collection('kycSessions').doc(sessionId);
      
      // Get session
      const sessionDoc = await sessionRef.get();
      if (!sessionDoc.exists) {
        throw new Error('KYC session not found');
      }
      
      const session = sessionDoc.data();
      
      // Validate document type is required
      if (!session.requiredDocuments.includes(documentType)) {
        throw new Error(`Document type ${documentType} not required for this KYC level`);
      }
      
      // TODO: Process document with DocumentProcessorService
      // For now, we'll simulate processing
      const processedData = {
        documentType,
        uploadedAt: new Date(),
        status: 'pending_verification',
        extractedData: null, // Will be populated by OCR
        verificationResult: null
      };
      
      // Update session
      await sessionRef.update({
        [`documents.${documentType}`]: processedData,
        'steps.documentUpload.status': 'in_progress',
        lastUpdated: FieldValue.serverTimestamp()
      });
      
      // Update user's KYC documents
      await db.collection('users').doc(session.userId).update({
        [`kycDocuments.${this.mapDocumentType(documentType)}`]: {
          type: documentType,
          documentId: documentData.documentId,
          verified: false,
          uploadedAt: FieldValue.serverTimestamp(),
          verifiedAt: null
        }
      });
      
      // Log audit entry
      await this.logAuditEntry(session.userId, 'document_uploaded', {
        sessionId,
        documentType,
        documentId: documentData.documentId
      });
      
      console.log(`[KYCOrchestrator] Document ${documentType} processed for session ${sessionId}`);
      
      return processedData;
    } catch (error) {
      console.error('[KYCOrchestrator] Error processing document:', error);
      throw error;
    }
  }

  /**
   * Perform liveness check
   * @param {string} sessionId - Session ID
   * @param {string} imageData - Base64 encoded image data
   */
  async performLivenessCheck(sessionId, imageData) {
    try {
      const db = await getDb();
      const sessionRef = db.collection('kycSessions').doc(sessionId);
      
      // Get session
      const sessionDoc = await sessionRef.get();
      if (!sessionDoc.exists) {
        throw new Error('KYC session not found');
      }
      
      const session = sessionDoc.data();
      
      // TODO: Implement actual liveness check with FaceVerificationService
      // For now, simulate liveness check
      const livenessResult = {
        isLive: true,
        confidence: 0.95,
        timestamp: new Date(),
        faceMatchScore: 0.92
      };
      
      // Update session
      await sessionRef.update({
        livenessCheck: livenessResult,
        'steps.livenessCheck.status': 'completed',
        'steps.livenessCheck.completedAt': FieldValue.serverTimestamp(),
        lastUpdated: FieldValue.serverTimestamp()
      });
      
      // Update user's KYC documents
      await db.collection('users').doc(session.userId).update({
        'kycDocuments.selfie.livenessScore': livenessResult.confidence,
        'kycDocuments.selfie.faceMatchScore': livenessResult.faceMatchScore,
        'kycDocuments.selfie.uploadedAt': FieldValue.serverTimestamp()
      });
      
      // Log audit entry
      await this.logAuditEntry(session.userId, 'liveness_check_completed', {
        sessionId,
        livenessScore: livenessResult.confidence,
        faceMatchScore: livenessResult.faceMatchScore
      });
      
      console.log(`[KYCOrchestrator] Liveness check completed for session ${sessionId}`);
      
      return livenessResult;
    } catch (error) {
      console.error('[KYCOrchestrator] Error performing liveness check:', error);
      throw error;
    }
  }

  /**
   * Complete KYC process and calculate risk score
   * @param {string} sessionId - Session ID
   */
  async completeKYCProcess(sessionId) {
    try {
      const db = await getDb();
      const sessionRef = db.collection('kycSessions').doc(sessionId);
      
      // Get session
      const sessionDoc = await sessionRef.get();
      if (!sessionDoc.exists) {
        throw new Error('KYC session not found');
      }
      
      const session = sessionDoc.data();
      
      // Verify all required steps are completed
      const requiredSteps = this.getRequiredSteps(session.requiredLevel);
      for (const step of requiredSteps) {
        if (session.steps[step]?.status !== 'completed') {
          throw new Error(`Step ${step} not completed`);
        }
      }
      
      // TODO: Calculate risk score with RiskAssessmentEngine
      const riskScore = await this.calculateRiskScore(session);
      
      // Determine if manual review is needed
      const requiresManualReview = this.requiresManualReview(riskScore, session);
      
      // Update session status
      const newStatus = requiresManualReview ? 'pending_review' : 'completed';
      await sessionRef.update({
        status: newStatus,
        completedAt: FieldValue.serverTimestamp(),
        riskScore,
        requiresManualReview,
        lastUpdated: FieldValue.serverTimestamp()
      });
      
      // Update user's KYC status
      const kycStatus = {
        level: session.requiredLevel,
        status: requiresManualReview ? 'pending' : 'approved',
        lastUpdated: FieldValue.serverTimestamp(),
        expiryDate: this.calculateExpiryDate(),
        reviewRequired: requiresManualReview
      };
      
      await db.collection('users').doc(session.userId).update({
        kycStatus,
        'riskProfile.overallRisk': riskScore.overall,
        'riskProfile.factors': riskScore.factors,
        'riskProfile.requiresManualReview': requiresManualReview,
        'riskProfile.lastCalculated': FieldValue.serverTimestamp()
      });
      
      // TODO: Trigger AML screening if approved
      if (!requiresManualReview) {
        // await this.amlScreener.screenUser(session.userId);
      }
      
      // Emit event
      databaseEvents.emit('kycProcessCompleted', session.userId, {
        sessionId,
        status: kycStatus.status,
        riskScore: riskScore.overall,
        requiresManualReview
      });
      
      // Log audit entry
      await this.logAuditEntry(session.userId, 'kyc_completed', {
        sessionId,
        status: kycStatus.status,
        riskScore: riskScore.overall,
        requiresManualReview
      });
      
      console.log(`[KYCOrchestrator] KYC process completed for session ${sessionId}`);
      
      return {
        status: kycStatus.status,
        riskScore: riskScore.overall,
        requiresManualReview,
        expiryDate: kycStatus.expiryDate
      };
    } catch (error) {
      console.error('[KYCOrchestrator] Error completing KYC process:', error);
      throw error;
    }
  }

  /**
   * Get user's current KYC status
   * @param {string} userId - User ID
   */
  async getUserKYCStatus(userId) {
    try {
      const db = await getDb();
      const userDoc = await db.collection('users').doc(userId).get();
      
      if (!userDoc.exists) {
        throw new Error('User not found');
      }
      
      const userData = userDoc.data();
      
      // Get active session if any
      const activeSessions = await db.collection('kycSessions')
        .where('userId', '==', userId)
        .where('status', 'in', ['active', 'in_progress'])
        .orderBy('startedAt', 'desc')
        .limit(1)
        .get();
      
      const activeSession = !activeSessions.empty ? {
        sessionId: activeSessions.docs[0].id,
        ...activeSessions.docs[0].data()
      } : null;
      
      return {
        status: userData.kycStatus || { level: 'none', status: 'not_started' },
        riskProfile: userData.riskProfile,
        activeSession,
        documents: userData.kycDocuments,
        amlStatus: userData.amlStatus
      };
    } catch (error) {
      console.error('[KYCOrchestrator] Error getting user KYC status:', error);
      throw error;
    }
  }

  /**
   * Helper: Get required documents for KYC level
   */
  getRequiredDocuments(level) {
    const requirements = kycLevelRequirements[level];
    if (!requirements) {
      throw new Error(`Invalid KYC level: ${level}`);
    }
    return requirements.requiredDocuments;
  }

  /**
   * Helper: Get required steps for KYC level
   */
  getRequiredSteps(level) {
    const requirements = kycLevelRequirements[level];
    if (!requirements) {
      throw new Error(`Invalid KYC level: ${level}`);
    }
    return requirements.requiredChecks.map(check => {
      // Map check names to step names
      const stepMapping = {
        documentVerification: 'documentUpload',
        livenessCheck: 'livenessCheck',
        amlScreening: 'amlScreening',
        enhancedDueDiligence: 'dataVerification'
      };
      return stepMapping[check] || check;
    });
  }

  /**
   * Helper: Map document types to schema fields
   */
  mapDocumentType(documentType) {
    const mapping = {
      passport: 'identity',
      drivers_license: 'identity',
      national_id: 'identity',
      utility_bill: 'proofOfAddress',
      bank_statement: 'proofOfAddress',
      rental_agreement: 'proofOfAddress'
    };
    return mapping[documentType] || documentType;
  }

  /**
   * Helper: Calculate risk score (simplified)
   */
  async calculateRiskScore(session) {
    // TODO: Implement actual risk calculation with RiskAssessmentEngine
    // For now, return mock risk score
    return {
      overall: 'low',
      factors: {
        geographic: 10,
        transactional: 5,
        behavioral: 8,
        documentary: 12
      },
      score: 35 // Out of 100
    };
  }

  /**
   * Helper: Determine if manual review is required
   */
  requiresManualReview(riskScore, session) {
    // Manual review required if:
    // - High risk score
    // - Failed document verification
    // - Low liveness score
    // - First-time large transaction
    
    if (riskScore.overall === 'high' || riskScore.overall === 'critical') {
      return true;
    }
    
    if (session.livenessCheck?.confidence < 0.8) {
      return true;
    }
    
    // TODO: Add more sophisticated logic
    return false;
  }

  /**
   * Helper: Calculate KYC expiry date
   */
  calculateExpiryDate() {
    // KYC valid for 1 year
    const expiryDate = new Date();
    expiryDate.setFullYear(expiryDate.getFullYear() + 1);
    return expiryDate;
  }

  /**
   * Helper: Log audit entry
   */
  async logAuditEntry(userId, action, details) {
    try {
      const db = await getDb();
      const auditEntry = {
        auditId: uuidv4(),
        userId,
        action,
        timestamp: FieldValue.serverTimestamp(),
        performedBy: 'system',
        details,
        result: 'success',
        metadata: {}
      };
      
      await db.collection('complianceAudits').add(auditEntry);
    } catch (error) {
      console.error('[KYCOrchestrator] Error logging audit entry:', error);
      // Don't throw - audit logging should not break the flow
    }
  }
}

// Export singleton instance
export const kycOrchestrator = new KYCOrchestratorService();