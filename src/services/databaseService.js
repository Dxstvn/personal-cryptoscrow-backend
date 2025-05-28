// src/services/databaseService.js
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
import { getAdminApp } from '../api/routes/auth/admin.js'; // Use async getAdminApp
import admin from 'firebase-admin'; // Import admin to access default app

let dbInstance = null;

async function getDb() {
  if (dbInstance) {
    return dbInstance;
  }

  if (process.env.NODE_ENV === 'test') {
    console.log('[DBService Test Env] Attempting to get Firestore instance from default app for testing.');
    try {
      // Assume the test environment (e.g., jest.emulator.setup.js or test file's beforeAll)
      // has initialized the default Firebase app.
      dbInstance = admin.firestore(); // Directly use admin.firestore() which relies on the default app
      console.log(`[DBService Test Env] Successfully obtained Firestore from default app via admin.firestore() for testing.`);
    } catch (e) {
      console.error(`[DBService Test Env] CRITICAL ERROR: Could not get Firestore using admin.firestore(). Is default app initialized? Error: ${e.message}.`);
      throw e; // Re-throw the error, as this is critical for tests.
    }
  } else {
    console.log('[DBService Prod Env] Using Firestore from adminApp.');
    const adminApp = await getAdminApp();
    dbInstance = getFirestore(adminApp);
  }
  return dbInstance;
}

/**
 * Retrieves deals that are in 'IN_FINAL_APPROVAL' state and past their finalApprovalDeadlineBackend.
 * @returns {Promise<Array<Object>>} A list of deal objects.
 */
export async function getDealsPastFinalApproval() {
  const now = Timestamp.now();
  try {
    const db = await getDb();
    const snapshot = await db.collection('deals')
      .where('status', '==', 'IN_FINAL_APPROVAL')
      .where('finalApprovalDeadlineBackend', '<=', now)
      .get();

    if (snapshot.empty) {
      return [];
    }
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error('[DBService] Error fetching deals past final approval:', error);
    return [];
  }
}

/**
 * Retrieves deals that are in 'IN_DISPUTE' state and past their disputeResolutionDeadlineBackend.
 * @returns {Promise<Array<Object>>} A list of deal objects.
 */
export async function getDealsPastDisputeDeadline() {
  const now = Timestamp.now();
  try {
    const db = await getDb();
    const snapshot = await db.collection('deals')
      .where('status', '==', 'IN_DISPUTE')
      .where('disputeResolutionDeadlineBackend', '<=', now)
      .get();

    if (snapshot.empty) {
      return [];
    }
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error('[DBService] Error fetching deals past dispute deadline:', error);
    return [];
  }
}

/**
 * Updates the status of a deal in Firestore and adds a timeline event.
 * @param {string} dealId The ID of the deal to update.
 * @param {object} updateData An object containing the new status and other fields to update.
 *                            Expected fields: status, timelineEventMessage.
 *                            Optional: autoReleaseTxHash, autoCancelTxHash, processingError, lastAutomaticProcessAttempt.
 */
export async function updateDealStatusInDB(dealId, updateData) {
  if (!dealId || !updateData || !updateData.status || !updateData.timelineEventMessage) {
    console.error("[DBService] Invalid parameters for updateDealStatusInDB:", { dealId, updateData });
    return;
  }
  try {
    const db = await getDb();
    const dealRef = db.collection('deals').doc(dealId);
    
    const timelineEvent = {
      event: updateData.timelineEventMessage,
      timestamp: Timestamp.now(),
      systemTriggered: true, // Indicate this was an automated backend action
    };

    if (updateData.autoReleaseTxHash) {
      timelineEvent.transactionHash = updateData.autoReleaseTxHash;
    }
    if (updateData.autoCancelTxHash) {
      timelineEvent.transactionHash = updateData.autoCancelTxHash;
    }

    const firestoreUpdateData = {
      status: updateData.status,
      updatedAt: Timestamp.now(),
      timeline: FieldValue.arrayUnion(timelineEvent),
    };

    if (updateData.autoReleaseTxHash) firestoreUpdateData.autoReleaseTxHash = updateData.autoReleaseTxHash;
    if (updateData.autoCancelTxHash) firestoreUpdateData.autoCancelTxHash = updateData.autoCancelTxHash;
    if (updateData.processingError) firestoreUpdateData.processingError = updateData.processingError;
    if (updateData.lastAutomaticProcessAttempt) firestoreUpdateData.lastAutomaticProcessAttempt = updateData.lastAutomaticProcessAttempt;


    await dealRef.update(firestoreUpdateData);
    console.log(`[DBService] Deal ${dealId} status updated to ${updateData.status}. Event: "${updateData.timelineEventMessage}"`);
  } catch (error) {
    console.error(`[DBService] Error updating status for deal ${dealId} to ${updateData.status}:`, error);
    // Consider more robust error handling or logging to a dedicated error service
  }
}

/**
 * Retrieves a specific deal by its ID.
 * @param {string} dealId The ID of the deal to retrieve.
 * @returns {Promise<Object|null>} The deal object or null if not found.
 */
export async function getDealById(dealId) {
  if (!dealId) {
    console.error("[DBService] getDealById called with no dealId.");
    return null;
  }
  try {
    const db = await getDb();
    const docRef = db.collection('deals').doc(dealId);
    const docSnap = await docRef.get();
    if (docSnap.exists) {
      return { id: docSnap.id, ...docSnap.data() };
    } else {
      console.log(`[DBService] No deal found with ID: ${dealId}`);
      return null;
    }
  } catch (error) {
    console.error(`[DBService] Error fetching deal by ID ${dealId}:`, error);
    return null;
  }
}
