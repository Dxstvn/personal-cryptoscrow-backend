// src/services/__tests__/databaseService.test.js
import { jest, describe, it, expect, beforeEach, afterAll, beforeAll } from '@jest/globals';
import { Timestamp } from 'firebase-admin/firestore';
import { adminFirestore, PROJECT_ID } from '../../../jest.emulator.setup.js'; // Adjust path as needed
import {
  getDealsPastFinalApproval,
  getDealsPastDisputeDeadline,
  updateDealStatusInDB,
} from '../databaseService.js'; // Adjust path as needed
import { deleteAdminApp } from '../../api/routes/auth/admin.js'; // Adjust path as needed

// Helper to clean up Firestore data
async function cleanUpFirestore() {
  const collections = await adminFirestore.listCollections();
  for (const collection of collections) {
    if (collection.id === 'deals') { // Only clear 'deals' for these tests
      const docs = await collection.listDocuments();
      const deletePromises = docs.map(doc => doc.delete());
      await Promise.all(deletePromises);
    }
  }
}

describe('Database Service Tests', () => {
  // Use a unique collection name for tests if needed, or ensure clean slate
  const dealsCollection = adminFirestore.collection('deals');

  beforeAll(async () => {
    // Ensure emulators are running and connected
    console.log(`[DB Service Tests] Using Project ID: ${PROJECT_ID} and Firestore emulator.`);
  });

  beforeEach(async () => {
    await cleanUpFirestore(); // Clear 'deals' collection before each test
  });

  afterAll(async () => {
    await cleanUpFirestore();
    // If adminApp was initialized by databaseService or its imports, ensure it's cleaned up
    // This might be handled by a global afterAll in jest.setup.js if adminApp is shared
    // For now, assuming jest.emulator.setup.js handles its own adminApp lifecycle or it's managed elsewhere.
    // await deleteAdminApp(); // Uncomment if adminApp used by service needs explicit cleanup here
  });

  describe('getDealsPastFinalApproval', () => {
    it('should return deals that are IN_FINAL_APPROVAL and past their deadline', async () => {
      const now = Timestamp.now();
      const oneHourAgo = Timestamp.fromMillis(now.toMillis() - 60 * 60 * 1000);
      const oneHourFromNow = Timestamp.fromMillis(now.toMillis() + 60 * 60 * 1000);

      await dealsCollection.doc('deal1').set({
        status: 'IN_FINAL_APPROVAL',
        finalApprovalDeadlineBackend: oneHourAgo, // Past deadline
        propertyAddress: '123 Main St',
      });
      await dealsCollection.doc('deal2').set({
        status: 'IN_FINAL_APPROVAL',
        finalApprovalDeadlineBackend: oneHourFromNow, // Future deadline
        propertyAddress: '456 Oak Ave',
      });
      await dealsCollection.doc('deal3').set({
        status: 'AWAITING_FULFILLMENT', // Wrong status
        finalApprovalDeadlineBackend: oneHourAgo,
        propertyAddress: '789 Pine Ln',
      });
      await dealsCollection.doc('deal4').set({
        status: 'IN_FINAL_APPROVAL',
        finalApprovalDeadlineBackend: oneHourAgo, // Past deadline
        propertyAddress: '101 Maple Dr',
      });
       await dealsCollection.doc('deal5').set({
        status: 'IN_FINAL_APPROVAL',
        // No deadline set, should not be picked up
        propertyAddress: '202 Birch Rd',
      });


      const deals = await getDealsPastFinalApproval();
      expect(deals).toHaveLength(2);
      expect(deals.map(d => d.id).sort()).toEqual(['deal1', 'deal4'].sort());
    });

    it('should return an empty array if no deals match', async () => {
      const now = Timestamp.now();
      const oneHourFromNow = Timestamp.fromMillis(now.toMillis() + 60 * 60 * 1000);
      await dealsCollection.doc('deal1').set({
        status: 'IN_FINAL_APPROVAL',
        finalApprovalDeadlineBackend: oneHourFromNow,
      });
      const deals = await getDealsPastFinalApproval();
      expect(deals).toHaveLength(0);
    });
  });

  describe('getDealsPastDisputeDeadline', () => {
    it('should return deals that are IN_DISPUTE and past their deadline', async () => {
      const now = Timestamp.now();
      const oneDayAgo = Timestamp.fromMillis(now.toMillis() - 24 * 60 * 60 * 1000);
      const oneDayFromNow = Timestamp.fromMillis(now.toMillis() + 24 * 60 * 60 * 1000);

      await dealsCollection.doc('dispute1').set({
        status: 'IN_DISPUTE',
        disputeResolutionDeadlineBackend: oneDayAgo, // Past deadline
        propertyAddress: 'Dispute Prop 1',
      });
      await dealsCollection.doc('dispute2').set({
        status: 'IN_DISPUTE',
        disputeResolutionDeadlineBackend: oneDayFromNow, // Future deadline
        propertyAddress: 'Dispute Prop 2',
      });
       await dealsCollection.doc('dispute3').set({
        status: 'IN_FINAL_APPROVAL', // Wrong status
        disputeResolutionDeadlineBackend: oneDayAgo,
        propertyAddress: 'Dispute Prop 3',
      });

      const deals = await getDealsPastDisputeDeadline();
      expect(deals).toHaveLength(1);
      expect(deals[0].id).toBe('dispute1');
    });

    it('should return an empty array if no deals match', async () => {
      const deals = await getDealsPastDisputeDeadline();
      expect(deals).toHaveLength(0);
    });
  });

  describe('updateDealStatusInDB', () => {
    it('should update deal status and add a timeline event', async () => {
      const dealId = 'dealToUpdate';
      await dealsCollection.doc(dealId).set({
        status: 'IN_FINAL_APPROVAL',
        propertyAddress: 'Update Test Prop',
        timeline: [],
      });

      const newStatus = 'COMPLETED';
      const eventMessage = 'Deal automatically completed.';
      const txHash = '0x123abc';

      await updateDealStatusInDB(dealId, newStatus, eventMessage, txHash);

      const updatedDeal = await dealsCollection.doc(dealId).get();
      expect(updatedDeal.exists).toBe(true);
      const dealData = updatedDeal.data();
      expect(dealData.status).toBe(newStatus);
      expect(dealData.updatedAt).toBeInstanceOf(Timestamp);
      expect(dealData.timeline).toHaveLength(1);
      expect(dealData.timeline[0].event).toBe(eventMessage);
      expect(dealData.timeline[0].systemTriggered).toBe(true);
      expect(dealData.timeline[0].transactionHash).toBe(txHash);
      expect(dealData.timeline[0].timestamp).toBeInstanceOf(Timestamp);
    });

    it('should not throw if dealId is invalid but log an error (or handle as per implementation)', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      await updateDealStatusInDB(null, 'COMPLETED', 'Test event');
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[DBService] Invalid parameters for updateDealStatusInDB:",
        expect.objectContaining({ dealId: null })
      );
      consoleErrorSpy.mockRestore();
    });
  });
}); 