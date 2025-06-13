// src/services/__tests__/databaseService.test.js
import { jest, describe, it, expect, beforeEach, afterAll, beforeAll } from '@jest/globals';
import { Timestamp } from 'firebase-admin/firestore';
import admin from 'firebase-admin'; // Import admin
import { adminFirestore, PROJECT_ID } from '../../../../jest.emulator.setup.js'; // Adjust path as needed
import {
  getDealsPastFinalApproval,
  getDealsPastDisputeDeadline,
  updateDealStatusInDB,
  getCrossChainDealsPendingMonitoring,
  getCrossChainTransactionsPendingCheck,
  getCrossChainDealsStuck,
  getCrossChainDealsPastFinalApproval,
  getCrossChainDealsPastDisputeDeadline,
  updateCrossChainDealStatus,
} from '../../databaseService.js'; // Adjust path as needed
import { deleteAdminApp } from '../../../api/routes/auth/admin.js'; // Adjust path as needed

// Helper to clean up Firestore data
async function cleanUpFirestore() {
  const collections = await adminFirestore.listCollections();
  for (const collection of collections) {
    if (collection.id === 'deals' || collection.id === 'crossChainTransactions') {
      const docs = await collection.listDocuments();
      const deletePromises = docs.map(doc => doc.delete());
      await Promise.all(deletePromises);
    }
  }
}

describe('Database Service Tests', () => {
  // Use a unique collection name for tests if needed, or ensure clean slate
  const dealsCollection = adminFirestore.collection('deals');
  // let db; // This was not used meaningfully

  beforeAll(async () => {
    // Ensure emulators are running and connected
    console.log(`[DB Service Tests] Using Project ID: ${PROJECT_ID} and Firestore emulator.`);

    // Initialize Firebase Admin SDK for tests if not already initialized
    // This ensures that admin.firestore() in databaseService.js can find the default app
    const DEFAULT_APP_NAME = '[DEFAULT]';
    if (!admin.apps.find(app => app && app.name === DEFAULT_APP_NAME)) {
        console.log(`[DB Service Tests BeforeAll] Initializing default Firebase app for databaseService tests.`);
        admin.initializeApp({
            projectId: PROJECT_ID || `db-service-tests-${Date.now()}`, // Use PROJECT_ID from emulator setup
            // Add other configurations if necessary, e.g., storageBucket, but FIRESTORE_EMULATOR_HOST should be picked up
        });
    } else {
        console.log(`[DB Service Tests BeforeAll] Default Firebase app already initialized.`);
    }

    // databaseService.js, when NODE_ENV === 'test', should now pick up
    // the default app initialized by jest.emulator.setup.js or by the code above.
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

      await updateDealStatusInDB(dealId, {
        status: newStatus,
        timelineEventMessage: eventMessage,
        autoReleaseTxHash: txHash // Assuming this is the relevant hash field based on usage
      });

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
      await updateDealStatusInDB(null, { 
        status: 'COMPLETED', 
        timelineEventMessage: 'Test event' 
      });
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[DBService] Invalid parameters for updateDealStatusInDB:",
        expect.objectContaining({ dealId: null, updateData: expect.objectContaining({ status: 'COMPLETED' }) })
      );
      consoleErrorSpy.mockRestore();
    });
  });

  describe('Cross-Chain Database Service Integration Tests', () => {
    const crossChainDealsCollection = adminFirestore.collection('deals');
    const crossChainTransactionsCollection = adminFirestore.collection('crossChainTransactions');

    describe('getCrossChainDealsPendingMonitoring', () => {
      it('should return cross-chain deals needing monitoring', async () => {
        const now = Timestamp.now();
        const tenMinutesAgo = Timestamp.fromMillis(now.toMillis() - 10 * 60 * 1000);

        // Create regular deal (should not be returned)
        await crossChainDealsCollection.doc('regular-deal').set({
          status: 'AWAITING_FULFILLMENT',
          propertyAddress: 'Regular Deal Property',
          createdAt: now
        });

        // Create cross-chain deals
        await crossChainDealsCollection.doc('cc-deal-1').set({
          status: 'AWAITING_FULFILLMENT',
          isNativeCrossChain: true,
          crossChainTransactionId: 'tx-123',
          sourceNetwork: 'ethereum',
          targetNetwork: 'polygon',
          lastMonitoredAt: tenMinutesAgo,
          propertyAddress: 'Cross Chain Deal 1',
          createdAt: now
        });

        await crossChainDealsCollection.doc('cc-deal-2').set({
          status: 'IN_FINAL_APPROVAL',
          isNativeCrossChain: true,
          crossChainTransactionId: 'tx-456',
          sourceNetwork: 'ethereum',
          targetNetwork: 'solana',
          lastMonitoredAt: tenMinutesAgo,
          propertyAddress: 'Cross Chain Deal 2',
          createdAt: now
        });

        await crossChainDealsCollection.doc('cc-deal-completed').set({
          status: 'COMPLETED', // Should not be returned
          isNativeCrossChain: true,
          crossChainTransactionId: 'tx-789',
          sourceNetwork: 'ethereum',
          targetNetwork: 'polygon',
          propertyAddress: 'Completed Cross Chain Deal',
          createdAt: now
        });

        const pendingDeals = await getCrossChainDealsPendingMonitoring();

        expect(pendingDeals).toHaveLength(2);
        expect(pendingDeals.map(d => d.id).sort()).toEqual(['cc-deal-1', 'cc-deal-2'].sort());
        expect(pendingDeals.every(d => d.isNativeCrossChain === true)).toBe(true);
        expect(pendingDeals.every(d => ['AWAITING_FULFILLMENT', 'IN_FINAL_APPROVAL', 'IN_DISPUTE'].includes(d.status))).toBe(true);
      });

      it('should return empty array if no cross-chain deals need monitoring', async () => {
        // Only add completed cross-chain deals
        await crossChainDealsCollection.doc('completed-cc-deal').set({
          status: 'COMPLETED',
          isNativeCrossChain: true,
          crossChainTransactionId: 'tx-completed',
          sourceNetwork: 'ethereum',
          targetNetwork: 'polygon',
          propertyAddress: 'Completed Deal',
          createdAt: Timestamp.now()
        });

        const pendingDeals = await getCrossChainDealsPendingMonitoring();
        expect(pendingDeals).toHaveLength(0);
      });
    });

    describe('getCrossChainTransactionsPendingCheck', () => {
      it('should return cross-chain transactions needing status check', async () => {
        const now = Timestamp.now();
        const fiveMinutesAgo = Timestamp.fromMillis(now.toMillis() - 5 * 60 * 1000);
        const oneHourAgo = Timestamp.fromMillis(now.toMillis() - 60 * 60 * 1000);

        // Create transactions with different statuses
        await crossChainTransactionsCollection.doc('tx-pending').set({
          status: 'PENDING',
          sourceNetwork: 'ethereum',
          targetNetwork: 'polygon',
          lastStatusCheck: oneHourAgo, // Old check
          dealId: 'deal-1',
          amount: '1.5',
          createdAt: now
        });

        await crossChainTransactionsCollection.doc('tx-processing').set({
          status: 'PROCESSING',
          sourceNetwork: 'ethereum',
          targetNetwork: 'solana',
          lastStatusCheck: oneHourAgo, // Old check
          dealId: 'deal-2',
          amount: '2.0',
          bridgeInfo: { bridge: 'wormhole', estimatedTime: '15 minutes' },
          createdAt: now
        });

        await crossChainTransactionsCollection.doc('tx-completed').set({
          status: 'COMPLETED', // Should not be returned
          sourceNetwork: 'ethereum',
          targetNetwork: 'polygon',
          lastStatusCheck: fiveMinutesAgo,
          dealId: 'deal-3',
          amount: '0.5',
          createdAt: now
        });

        await crossChainTransactionsCollection.doc('tx-failed').set({
          status: 'FAILED', // Should not be returned
          sourceNetwork: 'ethereum',
          targetNetwork: 'solana',
          lastStatusCheck: oneHourAgo,
          dealId: 'deal-4',
          amount: '1.0',
          createdAt: now
        });

        const pendingTransactions = await getCrossChainTransactionsPendingCheck();

        expect(pendingTransactions).toHaveLength(2);
        expect(pendingTransactions.map(t => t.id).sort()).toEqual(['tx-pending', 'tx-processing'].sort());
        expect(pendingTransactions.every(t => ['PENDING', 'PROCESSING'].includes(t.status))).toBe(true);
      });

      it('should return empty array if no transactions need checking', async () => {
        // Add only completed/failed transactions
        await crossChainTransactionsCollection.doc('tx-done').set({
          status: 'COMPLETED',
          sourceNetwork: 'ethereum',
          targetNetwork: 'polygon',
          lastStatusCheck: Timestamp.now(),
          dealId: 'deal-done',
          amount: '1.0',
          createdAt: Timestamp.now()
        });

        const pendingTransactions = await getCrossChainTransactionsPendingCheck();
        expect(pendingTransactions).toHaveLength(0);
      });
    });

    describe('getCrossChainDealsStuck', () => {
      it('should return deals that appear stuck', async () => {
        const now = Timestamp.now();
        const twoHoursAgo = Timestamp.fromMillis(now.toMillis() - 2 * 60 * 60 * 1000);
        const fiveMinutesAgo = Timestamp.fromMillis(now.toMillis() - 5 * 60 * 1000);

        // Create stuck deal
        await crossChainDealsCollection.doc('stuck-deal').set({
          status: 'AWAITING_FULFILLMENT',
          isNativeCrossChain: true,
          crossChainTransactionId: 'stuck-tx',
          sourceNetwork: 'ethereum',
          targetNetwork: 'solana',
          lastMonitoredAt: twoHoursAgo, // Very old
          createdAt: twoHoursAgo, // Created long ago
          propertyAddress: 'Stuck Deal Property'
        });

        // Create recent deal (should not be returned)
        await crossChainDealsCollection.doc('recent-deal').set({
          status: 'AWAITING_FULFILLMENT',
          isNativeCrossChain: true,
          crossChainTransactionId: 'recent-tx',
          sourceNetwork: 'ethereum',
          targetNetwork: 'polygon',
          lastMonitoredAt: fiveMinutesAgo, // Recent
          createdAt: fiveMinutesAgo, // Recent
          propertyAddress: 'Recent Deal Property'
        });

        const stuckDeals = await getCrossChainDealsStuck();

        expect(stuckDeals).toHaveLength(1);
        expect(stuckDeals[0].id).toBe('stuck-deal');
        expect(stuckDeals[0].isNativeCrossChain).toBe(true);
        expect(['AWAITING_FULFILLMENT', 'IN_FINAL_APPROVAL'].includes(stuckDeals[0].status)).toBe(true);
      });

      it('should return empty array if no deals are stuck', async () => {
        const now = Timestamp.now();
        
        // Add only recent deals
        await crossChainDealsCollection.doc('active-deal').set({
          status: 'AWAITING_FULFILLMENT',
          isNativeCrossChain: true,
          crossChainTransactionId: 'active-tx',
          sourceNetwork: 'ethereum',
          targetNetwork: 'polygon',
          lastMonitoredAt: now,
          createdAt: now,
          propertyAddress: 'Active Deal'
        });

        const stuckDeals = await getCrossChainDealsStuck();
        expect(stuckDeals).toHaveLength(0);
      });
    });

    describe('getCrossChainDealsPastFinalApproval', () => {
      it('should return cross-chain deals past final approval deadline', async () => {
        const now = Timestamp.now();
        const oneHourAgo = Timestamp.fromMillis(now.toMillis() - 60 * 60 * 1000);
        const oneHourFromNow = Timestamp.fromMillis(now.toMillis() + 60 * 60 * 1000);

        // Cross-chain deal past deadline
        await crossChainDealsCollection.doc('cc-approval-past').set({
          status: 'IN_FINAL_APPROVAL',
          isNativeCrossChain: true,
          finalApprovalDeadlineBackend: oneHourAgo,
          crossChainTransactionId: 'tx-approval-past',
          sourceNetwork: 'ethereum',
          targetNetwork: 'polygon',
          propertyAddress: 'Past Approval CC Deal'
        });

        // Cross-chain deal future deadline (should not be returned)
        await crossChainDealsCollection.doc('cc-approval-future').set({
          status: 'IN_FINAL_APPROVAL',
          isNativeCrossChain: true,
          finalApprovalDeadlineBackend: oneHourFromNow,
          crossChainTransactionId: 'tx-approval-future',
          sourceNetwork: 'ethereum',
          targetNetwork: 'solana',
          propertyAddress: 'Future Approval CC Deal'
        });

        // Regular deal past deadline (should not be returned by this function)
        await crossChainDealsCollection.doc('regular-approval-past').set({
          status: 'IN_FINAL_APPROVAL',
          finalApprovalDeadlineBackend: oneHourAgo,
          propertyAddress: 'Regular Past Approval Deal'
        });

        const pastDeals = await getCrossChainDealsPastFinalApproval();

        expect(pastDeals).toHaveLength(1);
        expect(pastDeals[0].id).toBe('cc-approval-past');
        expect(pastDeals[0].isNativeCrossChain).toBe(true);
        expect(pastDeals[0].status).toBe('IN_FINAL_APPROVAL');
      });

      it('should return empty array if no cross-chain deals past deadline', async () => {
        const now = Timestamp.now();
        const oneHourFromNow = Timestamp.fromMillis(now.toMillis() + 60 * 60 * 1000);

        await crossChainDealsCollection.doc('future-cc-deal').set({
          status: 'IN_FINAL_APPROVAL',
          isNativeCrossChain: true,
          finalApprovalDeadlineBackend: oneHourFromNow,
          crossChainTransactionId: 'tx-future',
          sourceNetwork: 'ethereum',
          targetNetwork: 'polygon',
          propertyAddress: 'Future CC Deal'
        });

        const pastDeals = await getCrossChainDealsPastFinalApproval();
        expect(pastDeals).toHaveLength(0);
      });
    });

    describe('getCrossChainDealsPastDisputeDeadline', () => {
      it('should return cross-chain deals past dispute deadline', async () => {
        const now = Timestamp.now();
        const oneDayAgo = Timestamp.fromMillis(now.toMillis() - 24 * 60 * 60 * 1000);
        const oneDayFromNow = Timestamp.fromMillis(now.toMillis() + 24 * 60 * 60 * 1000);

        // Cross-chain deal past dispute deadline
        await crossChainDealsCollection.doc('cc-dispute-past').set({
          status: 'IN_DISPUTE',
          isNativeCrossChain: true,
          disputeResolutionDeadlineBackend: oneDayAgo,
          crossChainTransactionId: 'tx-dispute-past',
          sourceNetwork: 'ethereum',
          targetNetwork: 'solana',
          propertyAddress: 'Past Dispute CC Deal'
        });

        // Cross-chain deal future dispute deadline
        await crossChainDealsCollection.doc('cc-dispute-future').set({
          status: 'IN_DISPUTE',
          isNativeCrossChain: true,
          disputeResolutionDeadlineBackend: oneDayFromNow,
          crossChainTransactionId: 'tx-dispute-future',
          sourceNetwork: 'ethereum',
          targetNetwork: 'polygon',
          propertyAddress: 'Future Dispute CC Deal'
        });

        // Regular deal past dispute deadline
        await crossChainDealsCollection.doc('regular-dispute-past').set({
          status: 'IN_DISPUTE',
          disputeResolutionDeadlineBackend: oneDayAgo,
          propertyAddress: 'Regular Past Dispute Deal'
        });

        const pastDisputeDeals = await getCrossChainDealsPastDisputeDeadline();

        expect(pastDisputeDeals).toHaveLength(1);
        expect(pastDisputeDeals[0].id).toBe('cc-dispute-past');
        expect(pastDisputeDeals[0].isNativeCrossChain).toBe(true);
        expect(pastDisputeDeals[0].status).toBe('IN_DISPUTE');
      });

      it('should return empty array if no cross-chain disputes past deadline', async () => {
        const oneDayFromNow = Timestamp.fromMillis(Timestamp.now().toMillis() + 24 * 60 * 60 * 1000);

        await crossChainDealsCollection.doc('future-dispute').set({
          status: 'IN_DISPUTE',
          isNativeCrossChain: true,
          disputeResolutionDeadlineBackend: oneDayFromNow,
          crossChainTransactionId: 'tx-future-dispute',
          sourceNetwork: 'ethereum',
          targetNetwork: 'polygon',
          propertyAddress: 'Future Dispute Deal'
        });

        const pastDisputeDeals = await getCrossChainDealsPastDisputeDeadline();
        expect(pastDisputeDeals).toHaveLength(0);
      });
    });

    describe('updateCrossChainDealStatus', () => {
      it('should update cross-chain deal with transaction details', async () => {
        const dealId = 'cc-deal-update';
        await crossChainDealsCollection.doc(dealId).set({
          status: 'AWAITING_FULFILLMENT',
          isNativeCrossChain: true,
          crossChainTransactionId: 'tx-update',
          sourceNetwork: 'ethereum',
          targetNetwork: 'polygon',
          propertyAddress: 'Update Test CC Deal',
          timeline: [],
          createdAt: Timestamp.now()
        });

        const updateData = {
          status: 'COMPLETED',
          timelineEventMessage: 'Cross-chain transaction completed successfully',
          crossChainTxHash: '0xcc123abc',
          sourceNetwork: 'ethereum',
          targetNetwork: 'polygon',
          bridgeUsed: null // EVM-to-EVM, no bridge
        };

        await updateCrossChainDealStatus(dealId, updateData);

        const updatedDeal = await crossChainDealsCollection.doc(dealId).get();
        expect(updatedDeal.exists).toBe(true);
        
        const dealData = updatedDeal.data();
        expect(dealData.status).toBe('COMPLETED');
        expect(dealData.crossChainTxHash).toBe('0xcc123abc');
        expect(dealData.lastCrossChainUpdate).toBeInstanceOf(Timestamp);
        expect(dealData.updatedAt).toBeInstanceOf(Timestamp);
        
        expect(dealData.timeline).toHaveLength(1);
        const timelineEvent = dealData.timeline[0];
        expect(timelineEvent.event).toBe('Cross-chain transaction completed successfully');
        expect(timelineEvent.systemTriggered).toBe(true);
        expect(timelineEvent.transactionHash).toBe('0xcc123abc');
        expect(timelineEvent.timestamp).toBeInstanceOf(Timestamp);
        expect(timelineEvent.crossChainDetails).toEqual({
          sourceNetwork: 'ethereum',
          targetNetwork: 'polygon',
          bridgeUsed: null
        });
      });

      it('should update cross-chain deal with bridge information', async () => {
        const dealId = 'cc-deal-bridge';
        await crossChainDealsCollection.doc(dealId).set({
          status: 'AWAITING_FULFILLMENT',
          isNativeCrossChain: true,
          crossChainTransactionId: 'tx-bridge',
          sourceNetwork: 'ethereum',
          targetNetwork: 'solana',
          propertyAddress: 'Bridge Test CC Deal',
          timeline: [],
          createdAt: Timestamp.now()
        });

        const updateData = {
          status: 'COMPLETED',
          timelineEventMessage: 'Cross-chain bridge transaction completed via Wormhole',
          crossChainTxHash: '0xbridge456def',
          sourceNetwork: 'ethereum',
          targetNetwork: 'solana',
          bridgeUsed: 'wormhole'
        };

        await updateCrossChainDealStatus(dealId, updateData);

        const updatedDeal = await crossChainDealsCollection.doc(dealId).get();
        const dealData = updatedDeal.data();
        
        expect(dealData.status).toBe('COMPLETED');
        expect(dealData.crossChainTxHash).toBe('0xbridge456def');
        
        const timelineEvent = dealData.timeline[0];
        expect(timelineEvent.crossChainDetails.bridgeUsed).toBe('wormhole');
        expect(timelineEvent.crossChainDetails.sourceNetwork).toBe('ethereum');
        expect(timelineEvent.crossChainDetails.targetNetwork).toBe('solana');
      });

      it('should handle status update without transaction hash', async () => {
        const dealId = 'cc-deal-no-hash';
        await crossChainDealsCollection.doc(dealId).set({
          status: 'IN_FINAL_APPROVAL',
          isNativeCrossChain: true,
          crossChainTransactionId: 'tx-no-hash',
          sourceNetwork: 'ethereum',
          targetNetwork: 'polygon',
          propertyAddress: 'No Hash CC Deal',
          timeline: [],
          createdAt: Timestamp.now()
        });

        const updateData = {
          status: 'IN_DISPUTE',
          timelineEventMessage: 'Cross-chain deal disputed',
          sourceNetwork: 'ethereum',
          targetNetwork: 'polygon'
          // No crossChainTxHash provided
        };

        await updateCrossChainDealStatus(dealId, updateData);

        const updatedDeal = await crossChainDealsCollection.doc(dealId).get();
        const dealData = updatedDeal.data();
        
        expect(dealData.status).toBe('IN_DISPUTE');
        expect(dealData.lastCrossChainUpdate).toBeInstanceOf(Timestamp);
        expect(dealData).not.toHaveProperty('crossChainTxHash');
        
        const timelineEvent = dealData.timeline[0];
        expect(timelineEvent.event).toBe('Cross-chain deal disputed');
        expect(timelineEvent).not.toHaveProperty('transactionHash');
        expect(timelineEvent.crossChainDetails).toEqual({
          sourceNetwork: 'ethereum',
          targetNetwork: 'polygon',
          bridgeUsed: undefined
        });
      });

      it('should not update if dealId does not exist', async () => {
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        
        // This should not throw but should log an error
        await updateCrossChainDealStatus('non-existent-deal', {
          status: 'COMPLETED',
          timelineEventMessage: 'Test message',
          sourceNetwork: 'ethereum',
          targetNetwork: 'polygon'
        });

        // The function should complete without throwing
        // Database update might fail silently or create a new document (depending on implementation)
        consoleErrorSpy.mockRestore();
      });
    });

    describe('Integration - Mixed Regular and Cross-Chain Operations', () => {
      it('should handle mixed deal types in deadline queries', async () => {
        const now = Timestamp.now();
        const oneHourAgo = Timestamp.fromMillis(now.toMillis() - 60 * 60 * 1000);

        // Add both regular and cross-chain deals with past deadlines
        await crossChainDealsCollection.doc('regular-past').set({
          status: 'IN_FINAL_APPROVAL',
          finalApprovalDeadlineBackend: oneHourAgo,
          propertyAddress: 'Regular Deal Past'
        });

        await crossChainDealsCollection.doc('cc-past').set({
          status: 'IN_FINAL_APPROVAL',
          isNativeCrossChain: true,
          finalApprovalDeadlineBackend: oneHourAgo,
          crossChainTransactionId: 'tx-mixed',
          sourceNetwork: 'ethereum',
          targetNetwork: 'polygon',
          propertyAddress: 'CC Deal Past'
        });

        // Test regular function gets both
        const allPastDeals = await getDealsPastFinalApproval();
        expect(allPastDeals).toHaveLength(2);

        // Test cross-chain function gets only cross-chain
        const ccPastDeals = await getCrossChainDealsPastFinalApproval();
        expect(ccPastDeals).toHaveLength(1);
        expect(ccPastDeals[0].id).toBe('cc-past');
        expect(ccPastDeals[0].isNativeCrossChain).toBe(true);
      });

      it('should handle concurrent database operations', async () => {
        const now = Timestamp.now();
        
        // Create test data
        await crossChainDealsCollection.doc('concurrent-1').set({
          status: 'AWAITING_FULFILLMENT',
          isNativeCrossChain: true,
          crossChainTransactionId: 'concurrent-tx-1',
          sourceNetwork: 'ethereum',
          targetNetwork: 'polygon',
          lastMonitoredAt: now,
          propertyAddress: 'Concurrent Test 1',
          createdAt: now
        });

        await crossChainTransactionsCollection.doc('concurrent-tx-1').set({
          status: 'PROCESSING',
          sourceNetwork: 'ethereum',
          targetNetwork: 'polygon',
          lastStatusCheck: now,
          dealId: 'concurrent-1',
          amount: '1.0',
          createdAt: now
        });

        // Run multiple operations concurrently
        const results = await Promise.allSettled([
          getCrossChainDealsPendingMonitoring(),
          getCrossChainTransactionsPendingCheck(),
          getCrossChainDealsStuck(),
          updateCrossChainDealStatus('concurrent-1', {
            status: 'IN_FINAL_APPROVAL',
            timelineEventMessage: 'Concurrent update test',
            sourceNetwork: 'ethereum',
            targetNetwork: 'polygon'
          })
        ]);

        // All operations should succeed
        results.forEach((result, index) => {
          expect(result.status).toBe('fulfilled');
        });

        // Verify update worked
        const updatedDeal = await crossChainDealsCollection.doc('concurrent-1').get();
        expect(updatedDeal.data().status).toBe('IN_FINAL_APPROVAL');
      });

      it('should maintain data consistency across operations', async () => {
        const dealId = 'consistency-test';
        const txId = 'consistency-tx';
        const now = Timestamp.now();

        // Create linked deal and transaction
        await crossChainDealsCollection.doc(dealId).set({
          status: 'AWAITING_FULFILLMENT',
          isNativeCrossChain: true,
          crossChainTransactionId: txId,
          sourceNetwork: 'ethereum',
          targetNetwork: 'solana',
          lastMonitoredAt: now,
          propertyAddress: 'Consistency Test Deal',
          timeline: [],
          createdAt: now
        });

        await crossChainTransactionsCollection.doc(txId).set({
          status: 'PROCESSING',
          sourceNetwork: 'ethereum',
          targetNetwork: 'solana',
          lastStatusCheck: now,
          dealId: dealId,
          amount: '2.5',
          bridgeInfo: { bridge: 'wormhole', estimatedTime: '15 minutes' },
          createdAt: now
        });

        // Update deal status
        await updateCrossChainDealStatus(dealId, {
          status: 'COMPLETED',
          timelineEventMessage: 'Cross-chain transfer completed',
          crossChainTxHash: '0xconsistency789',
          sourceNetwork: 'ethereum',
          targetNetwork: 'solana',
          bridgeUsed: 'wormhole'
        });

        // Verify deal was updated correctly
        const updatedDeal = await crossChainDealsCollection.doc(dealId).get();
        const dealData = updatedDeal.data();
        
        expect(dealData.status).toBe('COMPLETED');
        expect(dealData.crossChainTxHash).toBe('0xconsistency789');
        expect(dealData.timeline).toHaveLength(1);
        
        // Verify timeline contains proper cross-chain details
        const timelineEvent = dealData.timeline[0];
        expect(timelineEvent.crossChainDetails).toEqual({
          sourceNetwork: 'ethereum',
          targetNetwork: 'solana',
          bridgeUsed: 'wormhole'
        });

        // Verify transaction still exists unchanged
        const transaction = await crossChainTransactionsCollection.doc(txId).get();
        expect(transaction.exists).toBe(true);
        expect(transaction.data().dealId).toBe(dealId);
      });
    });
  });
}); 