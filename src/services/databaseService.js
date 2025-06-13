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

/**
 * Retrieves cross-chain deals that are pending monitoring (have active cross-chain transactions).
 * @returns {Promise<Array<Object>>} A list of deal objects with cross-chain transactions.
 */
export async function getCrossChainDealsPendingMonitoring() {
  try {
    const db = await getDb();
    const snapshot = await db.collection('deals')
      .where('isNativeCrossChain', '==', true)
      .where('status', 'in', ['AWAITING_FULFILLMENT', 'IN_FINAL_APPROVAL', 'IN_DISPUTE'])
      .get();

    if (snapshot.empty) {
      return [];
    }
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error('[DBService] Error fetching cross-chain deals pending monitoring:', error);
    return [];
  }
}

/**
 * Retrieves cross-chain transactions that need status checking.
 * @returns {Promise<Array<Object>>} A list of transaction objects.
 */
export async function getCrossChainTransactionsPendingCheck() {
  const oneHourAgo = Timestamp.fromDate(new Date(Date.now() - 60 * 60 * 1000));
  try {
    const db = await getDb();
    const snapshot = await db.collection('crossChainTransactions')
      .where('status', 'in', ['PENDING', 'PROCESSING'])
      .where('lastStatusCheck', '<=', oneHourAgo)
      .get();

    if (snapshot.empty) {
      return [];
    }
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error('[DBService] Error fetching cross-chain transactions pending check:', error);
    return [];
  }
}

/**
 * Retrieves cross-chain deals that are stuck (transactions failed or timed out).
 * @returns {Promise<Array<Object>>} A list of deal objects with stuck cross-chain transactions.
 */
export async function getCrossChainDealsStuck() {
  const twoHoursAgo = Timestamp.fromDate(new Date(Date.now() - 2 * 60 * 60 * 1000));
  try {
    const db = await getDb();
    const snapshot = await db.collection('deals')
      .where('isNativeCrossChain', '==', true)
      .where('status', 'in', ['AWAITING_FULFILLMENT', 'IN_FINAL_APPROVAL'])
      .where('lastMonitoredAt', '<=', twoHoursAgo)
      .get();

    if (snapshot.empty) {
      return [];
    }
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error('[DBService] Error fetching stuck cross-chain deals:', error);
    return [];
  }
}

/**
 * Retrieves cross-chain deals past their final approval deadlines that need processing.
 * @returns {Promise<Array<Object>>} A list of deal objects.
 */
export async function getCrossChainDealsPastFinalApproval() {
  const now = Timestamp.now();
  try {
    const db = await getDb();
    const snapshot = await db.collection('deals')
      .where('status', '==', 'IN_FINAL_APPROVAL')
      .where('isNativeCrossChain', '==', true)
      .where('finalApprovalDeadlineBackend', '<=', now)
      .get();

    if (snapshot.empty) {
      return [];
    }
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error('[DBService] Error fetching cross-chain deals past final approval:', error);
    return [];
  }
}

/**
 * Retrieves cross-chain deals past their dispute resolution deadlines that need processing.
 * @returns {Promise<Array<Object>>} A list of deal objects.
 */
export async function getCrossChainDealsPastDisputeDeadline() {
  const now = Timestamp.now();
  try {
    const db = await getDb();
    const snapshot = await db.collection('deals')
      .where('status', '==', 'IN_DISPUTE')
      .where('isNativeCrossChain', '==', true)
      .where('disputeResolutionDeadlineBackend', '<=', now)
      .get();

    if (snapshot.empty) {
      return [];
    }
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error('[DBService] Error fetching cross-chain deals past dispute deadline:', error);
    return [];
  }
}

/**
 * Updates cross-chain deal status with specialized fields for cross-chain transactions.
 * @param {string} dealId The ID of the deal to update.
 * @param {object} updateData Cross-chain specific update data.
 */
export async function updateCrossChainDealStatus(dealId, updateData) {
  if (!dealId || !updateData || !updateData.status || !updateData.timelineEventMessage) {
    console.error("[DBService] Invalid parameters for updateCrossChainDealStatus:", { dealId, updateData });
    return;
  }
  try {
    const db = await getDb();
    const dealRef = db.collection('deals').doc(dealId);
    
    // Check if document exists before updating
    const docSnapshot = await dealRef.get();
    if (!docSnapshot.exists) {
      console.error(`[DBService] Deal ${dealId} does not exist for cross-chain status update`);
      return;
    }
    
    const timelineEvent = {
      event: updateData.timelineEventMessage,
      timestamp: Timestamp.now(),
      systemTriggered: true,
      crossChainEvent: true,
    };

    if (updateData.crossChainTxHash) {
      timelineEvent.transactionHash = updateData.crossChainTxHash;
    }
    if (updateData.bridgeStatus) {
      timelineEvent.bridgeStatus = updateData.bridgeStatus;
    }

    // Add cross-chain details to timeline event
    if (updateData.sourceNetwork || updateData.targetNetwork || updateData.bridgeUsed !== undefined) {
      timelineEvent.crossChainDetails = {};
      if (updateData.sourceNetwork) timelineEvent.crossChainDetails.sourceNetwork = updateData.sourceNetwork;
      if (updateData.targetNetwork) timelineEvent.crossChainDetails.targetNetwork = updateData.targetNetwork;
      if (updateData.bridgeUsed !== undefined) timelineEvent.crossChainDetails.bridgeUsed = updateData.bridgeUsed;
    }

    const firestoreUpdateData = {
      status: updateData.status,
      updatedAt: Timestamp.now(),
      timeline: FieldValue.arrayUnion(timelineEvent),
      lastCrossChainUpdate: Timestamp.now(),
    };

    if (updateData.crossChainTxHash) firestoreUpdateData.crossChainTxHash = updateData.crossChainTxHash;
    if (updateData.bridgeStatus) firestoreUpdateData.bridgeStatus = updateData.bridgeStatus;
    if (updateData.processingError) firestoreUpdateData.processingError = updateData.processingError;
    if (updateData.lastAutomaticProcessAttempt) firestoreUpdateData.lastAutomaticProcessAttempt = updateData.lastAutomaticProcessAttempt;
    if (updateData.crossChainFailureReason) firestoreUpdateData.crossChainFailureReason = updateData.crossChainFailureReason;

    await dealRef.update(firestoreUpdateData);
    console.log(`[DBService] Cross-chain deal ${dealId} status updated to ${updateData.status}. Event: "${updateData.timelineEventMessage}"`);
  } catch (error) {
    console.error(`[DBService] Error updating cross-chain status for deal ${dealId} to ${updateData.status}:`, error);
  }
}
