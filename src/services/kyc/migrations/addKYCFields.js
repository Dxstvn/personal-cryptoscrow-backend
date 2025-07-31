// src/services/kyc/migrations/addKYCFields.js

import { getDb } from '../../databaseService.js';
import { userKYCSchema } from '../schemas/kycSchemas.js';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * Migration to add KYC/AML fields to existing users
 * This can be run as a one-time migration or called during user creation
 */
export async function addKYCFieldsToUser(userId) {
  try {
    const db = await getDb();
    const userRef = db.collection('users').doc(userId);
    
    // Check if user exists
    const userDoc = await userRef.get();
    if (!userDoc.exists) {
      throw new Error(`User ${userId} not found`);
    }
    
    const userData = userDoc.data();
    
    // Check if KYC fields already exist
    if (userData.kycStatus) {
      console.log(`User ${userId} already has KYC fields`);
      return { updated: false, userId };
    }
    
    // Add KYC fields with default values
    const kycFields = {
      kycStatus: {
        level: 'none',
        status: 'pending',
        lastUpdated: FieldValue.serverTimestamp(),
        expiryDate: null,
        reviewRequired: false
      },
      
      kycDocuments: {
        identity: {
          type: null,
          documentId: null,
          verified: false,
          extractedData: {
            documentNumber: null,
            fullName: null,
            dateOfBirth: null,
            expiryDate: null,
            nationality: null,
            mrz: null
          },
          uploadedAt: null,
          verifiedAt: null
        },
        proofOfAddress: {
          type: null,
          documentId: null,
          verified: false,
          extractedAddress: null,
          uploadedAt: null
        },
        selfie: {
          imageId: null,
          livenessScore: 0,
          faceMatchScore: 0,
          uploadedAt: null
        }
      },
      
      amlStatus: {
        lastScreened: null,
        riskScore: 0,
        sanctions: {
          checked: false,
          matches: [],
          lastChecked: null
        },
        pep: {
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
      
      verificationHistory: [],
      
      riskProfile: {
        overallRisk: 'low',
        factors: {
          geographic: 0,
          transactional: 0,
          behavioral: 0,
          documentary: 0
        },
        requiresManualReview: false,
        lastCalculated: FieldValue.serverTimestamp()
      }
    };
    
    // Update user document
    await userRef.update(kycFields);
    
    console.log(`Successfully added KYC fields to user ${userId}`);
    return { updated: true, userId };
    
  } catch (error) {
    console.error(`Error adding KYC fields to user ${userId}:`, error);
    throw error;
  }
}

/**
 * Batch migration for all existing users
 * Should be run once during deployment
 */
export async function migrateAllUsersKYC() {
  try {
    const db = await getDb();
    const usersSnapshot = await db.collection('users').get();
    
    console.log(`Starting KYC migration for ${usersSnapshot.size} users`);
    
    const results = {
      total: usersSnapshot.size,
      updated: 0,
      skipped: 0,
      errors: []
    };
    
    // Process in batches to avoid overwhelming the database
    const batchSize = 100;
    const userDocs = usersSnapshot.docs;
    
    for (let i = 0; i < userDocs.length; i += batchSize) {
      const batch = userDocs.slice(i, i + batchSize);
      const promises = batch.map(async (doc) => {
        try {
          const result = await addKYCFieldsToUser(doc.id);
          if (result.updated) {
            results.updated++;
          } else {
            results.skipped++;
          }
        } catch (error) {
          results.errors.push({
            userId: doc.id,
            error: error.message
          });
        }
      });
      
      await Promise.all(promises);
      console.log(`Processed ${Math.min(i + batchSize, userDocs.length)} of ${userDocs.length} users`);
    }
    
    console.log('KYC migration completed:', results);
    return results;
    
  } catch (error) {
    console.error('Error during batch KYC migration:', error);
    throw error;
  }
}

/**
 * Create KYC collections if they don't exist
 * This includes creating initial indexes
 */
export async function createKYCCollections() {
  try {
    const db = await getDb();
    
    // Create kycSessions collection with sample document
    const sessionRef = db.collection('kycSessions').doc('_sample');
    await sessionRef.set({
      _isSample: true,
      sessionId: '_sample',
      userId: '_sample',
      status: 'completed',
      startedAt: FieldValue.serverTimestamp(),
      completedAt: FieldValue.serverTimestamp(),
      steps: {
        documentUpload: { status: 'completed', completedAt: FieldValue.serverTimestamp() },
        livenessCheck: { status: 'completed', completedAt: FieldValue.serverTimestamp() },
        dataVerification: { status: 'completed', completedAt: FieldValue.serverTimestamp() },
        amlScreening: { status: 'completed', completedAt: FieldValue.serverTimestamp() }
      },
      ipAddress: '0.0.0.0',
      userAgent: 'sample',
      deviceFingerprint: 'sample'
    });
    
    // Create amlWatchlists collection with sample document
    const watchlistRef = db.collection('amlWatchlists').doc('_sample');
    await watchlistRef.set({
      _isSample: true,
      listType: 'sanctions',
      source: 'sample',
      lastUpdated: FieldValue.serverTimestamp(),
      entries: [],
      hash: 'sample',
      expiresAt: FieldValue.serverTimestamp(),
      metadata: {
        totalEntries: 0,
        version: '1.0',
        downloadedFrom: 'sample'
      }
    });
    
    // Create complianceAudits collection with sample document
    const auditRef = db.collection('complianceAudits').doc('_sample');
    await auditRef.set({
      _isSample: true,
      auditId: '_sample',
      userId: '_sample',
      action: 'collection_created',
      performedBy: 'system',
      timestamp: FieldValue.serverTimestamp(),
      details: { reason: 'Initial collection setup' },
      ipAddress: '0.0.0.0',
      userAgent: 'system',
      result: 'success',
      metadata: {}
    });
    
    // Create documentHashes collection with sample document
    const hashRef = db.collection('documentHashes').doc('_sample');
    await hashRef.set({
      _isSample: true,
      hash: '_sample',
      userId: '_sample',
      documentType: 'identity',
      uploadedAt: FieldValue.serverTimestamp(),
      metadata: {
        fileName: 'sample.jpg',
        fileSize: 0,
        mimeType: 'image/jpeg'
      }
    });
    
    console.log('Successfully created KYC collections');
    return { success: true };
    
  } catch (error) {
    console.error('Error creating KYC collections:', error);
    throw error;
  }
}

/**
 * Run full KYC database setup
 * This includes creating collections and migrating users
 */
export async function setupKYCDatabase() {
  try {
    console.log('Starting KYC database setup...');
    
    // Step 1: Create collections
    await createKYCCollections();
    
    // Step 2: Migrate existing users
    const migrationResults = await migrateAllUsersKYC();
    
    console.log('KYC database setup completed successfully');
    return {
      collections: 'created',
      migration: migrationResults
    };
    
  } catch (error) {
    console.error('Error during KYC database setup:', error);
    throw error;
  }
}