// src/services/databaseService.js
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
import { adminApp } from '../api/routes/auth/admin.js'; // Adjust path if adminApp is elsewhere

const db = getFirestore(adminApp);

/**
 * Retrieves deals that are in 'IN_FINAL_APPROVAL' state and past their finalApprovalDeadlineBackend.
 * @returns {Promise<Array<Object>>} A list of deal objects.
 */
export async function getDealsPastFinalApproval() {
  const now = Timestamp.now();
  try {
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
 * @param {string} newStatus The new status for the deal.
 * @param {string} eventMessage A message for the timeline event.
 * @param {string | null} transactionHash Optional blockchain transaction hash.
 */
export async function updateDealStatusInDB(dealId, newStatus, eventMessage, transactionHash = null) {
  if (!dealId || !newStatus || !eventMessage) {
    console.error("[DBService] Invalid parameters for updateDealStatusInDB:", { dealId, newStatus, eventMessage });
    return;
  }
  const dealRef = db.collection('deals').doc(dealId);
  try {
    const timelineEvent = {
      event: eventMessage,
      timestamp: Timestamp.now(),
      systemTriggered: true, // Indicate this was an automated backend action
    };
    if (transactionHash) {
      timelineEvent.transactionHash = transactionHash;
    }

    await dealRef.update({
      status: newStatus,
      updatedAt: Timestamp.now(),
      timeline: FieldValue.arrayUnion(timelineEvent),
    });
    console.log(`[DBService] Deal ${dealId} status updated to ${newStatus}. Event: "${eventMessage}"`);
  } catch (error) {
    console.error(`[DBService] Error updating status for deal ${dealId} to ${newStatus}:`, error);
    // Consider more robust error handling or logging to a dedicated error service
  }
}
