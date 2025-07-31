// src/services/kyc/schemas/kycSchemas.js

/**
 * KYC/AML Database Schemas for Firestore Collections
 * This file defines the structure of KYC-related data
 */

/**
 * User Collection Schema Enhancement
 * These fields will be added to the existing user document
 */
export const userKYCSchema = {
  // KYC Status Information
  kycStatus: {
    level: 'none', // 'none' | 'basic' | 'enhanced' | 'full'
    status: 'pending', // 'pending' | 'in_progress' | 'approved' | 'rejected' | 'expired'
    lastUpdated: null, // Firestore Timestamp
    expiryDate: null, // Firestore Timestamp
    reviewRequired: false // boolean
  },
  
  // KYC Documents
  kycDocuments: {
    identity: {
      type: null, // 'passport' | 'driving_license' | 'national_id'
      documentId: null, // Reference to stored document
      verified: false,
      extractedData: {
        documentNumber: null,
        fullName: null,
        dateOfBirth: null,
        expiryDate: null,
        nationality: null,
        mrz: null // Machine Readable Zone data
      },
      uploadedAt: null,
      verifiedAt: null
    },
    proofOfAddress: {
      type: null, // 'utility_bill' | 'bank_statement' | 'lease'
      documentId: null,
      verified: false,
      extractedAddress: null, // Object with parsed address
      uploadedAt: null
    },
    selfie: {
      imageId: null,
      livenessScore: 0,
      faceMatchScore: 0,
      uploadedAt: null
    }
  },
  
  // AML Status
  amlStatus: {
    lastScreened: null,
    riskScore: 0, // 0-100
    sanctions: {
      checked: false,
      matches: [], // Array of matches
      lastChecked: null
    },
    pep: { // Politically Exposed Person
      isPEP: false,
      details: null,
      lastChecked: null
    },
    adverseMedia: {
      hasAdverseMedia: false,
      sources: [],
      lastChecked: null
    }
  },
  
  // Verification History
  verificationHistory: [], // Array of verification events
  
  // Risk Profile
  riskProfile: {
    overallRisk: 'low', // 'low' | 'medium' | 'high' | 'critical'
    factors: {
      geographic: 0,
      transactional: 0,
      behavioral: 0,
      documentary: 0
    },
    requiresManualReview: false,
    lastCalculated: null
  }
};

/**
 * KYC Sessions Collection Schema
 * Tracks individual KYC verification sessions
 */
export const kycSessionSchema = {
  sessionId: null, // Auto-generated
  userId: null, // Reference to user
  status: 'active', // 'active' | 'completed' | 'expired' | 'abandoned'
  startedAt: null, // Timestamp
  completedAt: null, // Timestamp
  steps: {
    documentUpload: { 
      status: 'pending', // 'pending' | 'in_progress' | 'completed' | 'failed'
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
  ipAddress: null,
  userAgent: null,
  deviceFingerprint: null,
  metadata: {} // Additional session data
};

/**
 * AML Watchlists Collection Schema
 * Cached sanctions and watchlist data
 */
export const amlWatchlistSchema = {
  listType: null, // 'sanctions' | 'pep' | 'adverse_media'
  source: null, // 'ofac' | 'un' | 'eu' | 'interpol' etc.
  lastUpdated: null,
  entries: [], // Array of watchlist entries
  hash: null, // For integrity verification
  expiresAt: null, // When to refresh the list
  metadata: {
    totalEntries: 0,
    version: null,
    downloadedFrom: null
  }
};

/**
 * Compliance Audits Collection Schema
 * Tracks all compliance-related actions
 */
export const complianceAuditSchema = {
  auditId: null, // Auto-generated
  userId: null, // User being acted upon
  action: null, // 'kyc_started' | 'document_uploaded' | 'kyc_approved' | 'kyc_rejected' | 'manual_review' | 'aml_check' etc.
  performedBy: null, // User ID or 'system'
  timestamp: null,
  details: {}, // Action-specific details
  ipAddress: null,
  userAgent: null,
  result: null, // 'success' | 'failure' | 'pending'
  metadata: {} // Additional audit data
};

/**
 * Document Hashes Collection Schema
 * Prevents document reuse across accounts
 */
export const documentHashSchema = {
  hash: null, // SHA-256 hash of document
  userId: null, // User who uploaded
  documentType: null, // 'identity' | 'address' | 'selfie'
  uploadedAt: null,
  metadata: {
    fileName: null,
    fileSize: null,
    mimeType: null
  }
};

/**
 * Verification Events Schema
 * Used in user.verificationHistory array
 */
export const verificationEventSchema = {
  timestamp: null,
  action: null, // 'document_uploaded' | 'liveness_passed' | 'aml_cleared' etc.
  result: null, // 'success' | 'failure'
  metadata: {}, // Event-specific data
  sessionId: null // Reference to KYC session
};

/**
 * KYC Level Requirements
 * Defines what's required for each KYC level
 */
export const kycLevelRequirements = {
  basic: {
    requiredDocuments: ['identity'],
    requiredChecks: ['documentVerification'],
    transactionLimit: 1000, // USD per transaction
    monthlyLimit: 10000 // USD per month
  },
  enhanced: {
    requiredDocuments: ['identity', 'proofOfAddress'],
    requiredChecks: ['documentVerification', 'livenessCheck', 'amlScreening'],
    transactionLimit: 10000,
    monthlyLimit: 100000
  },
  full: {
    requiredDocuments: ['identity', 'proofOfAddress', 'selfie'],
    requiredChecks: ['documentVerification', 'livenessCheck', 'amlScreening', 'enhancedDueDiligence'],
    transactionLimit: null, // No limit
    monthlyLimit: null
  }
};