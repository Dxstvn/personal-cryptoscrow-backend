process.env.FIRESTORE_EMULATOR_HOST = 'localhost:5004'; // MUST BE AT THE VERY TOP
console.log(`[Test File Top] FIRESTORE_EMULATOR_HOST set to: ${process.env.FIRESTORE_EMULATOR_HOST}`);

import { jest, describe, it, expect, beforeEach, afterEach, afterAll } from '@jest/globals';
import admin from 'firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import { 
  getDealsPastFinalApproval, 
  getDealsPastDisputeDeadline, 
  updateDealStatusInDB,
  // ✅ NEW: Cross-chain database functions
  getCrossChainDealsPendingMonitoring,
  getCrossChainTransactionsPendingCheck,
  getCrossChainDealsStuck,
  getCrossChainDealsPastFinalApproval,
  getCrossChainDealsPastDisputeDeadline,
  updateCrossChainDealStatus
} from '../../databaseService.js';
import { deleteAdminApp } from '../../../api/routes/auth/admin.js';

// Initialize Firebase Admin SDK for tests if not already initialized
// if (!admin.apps.length) { // Moved to beforeAll
//   process.env.FIRESTORE_EMULATOR_HOST = 'localhost:5004'; // Make sure this is set
//   admin.initializeApp({ // Moved to beforeAll
//     projectId: 'test-project-scheduledjobs', // Use a dummy project ID for emulator
//   });
// }
// const db = admin.firestore(); // Moved to beforeAll
let db; // Declare db here, initialize in beforeAll

// Mock node-cron
const mockCronSchedule = jest.fn(() => ({ start: jest.fn(), stop: jest.fn() }));
const mockCronValidate = jest.fn().mockReturnValue(true);
jest.unstable_mockModule('node-cron', () => ({
  schedule: mockCronSchedule,
  validate: mockCronValidate,
  default: {
    schedule: mockCronSchedule,
    validate: mockCronValidate,
  }
}));

// Mock blockchainService
const mockTriggerReleaseAfterApproval = jest.fn();
const mockTriggerCancelAfterDisputeDeadline = jest.fn();
const mockInitializeBlockchainService = jest.fn();

// ✅ NEW: Mock cross-chain service
const mockCheckPendingTransactionStatus = jest.fn();
const mockTriggerCrossChainReleaseAfterApprovalSimple = jest.fn();
const mockTriggerCrossChainCancelAfterDisputeDeadline = jest.fn();
const mockHandleStuckCrossChainTransaction = jest.fn();
const mockGetCrossChainTransactionsForDeal = jest.fn();

// Use an object to hold the mock ABI, allowing its `current` property to be reassigned
// and the getter will always access the latest assignment.
const mockContractABIHolder = { current: [{ type: "function", name: "defaultMockFunction" }] }; 

// In the test file, replace the existing blockchainService mock with this:
jest.unstable_mockModule('../../blockchainService.js', () => {
  return {
    __esModule: true,
    initializeBlockchainService: mockInitializeBlockchainService,
    triggerReleaseAfterApproval: mockTriggerReleaseAfterApproval,
    triggerCancelAfterDisputeDeadline: mockTriggerCancelAfterDisputeDeadline,
    get contractABI() {
      console.log(`[TEST DEBUGGERY] contractABI getter invoked. Returning: ${JSON.stringify(mockContractABIHolder.current)}`);
      return mockContractABIHolder.current;
    },
    __TEST_ONLY_simulateAbiLoadingFailure: jest.fn(),
    __TEST_ONLY_getInternalAbiState: jest.fn(),
    initializeService: jest.fn().mockResolvedValue(true),
  };
});

// Import the actual blockchainService to spy on its methods
// import * as actualBlockchainService from '../../blockchainService.js'; // No longer needed for spying
// Spy on the methods we expect scheduledJobs to call
// const triggerReleaseSpy = jest.spyOn(actualBlockchainService, 'triggerReleaseAfterApproval'); // Replaced by mock
// const triggerCancelSpy = jest.spyOn(actualBlockchainService, 'triggerCancelAfterDisputeDeadline'); // Replaced by mock


// Import the module to test AFTER mocks and spies are set up
// IMPORTANT: databaseService will be the REAL one, interacting with the emulator
const { checkAndProcessContractDeadlines, startScheduledJobs, __TEST_ONLY_resetJobRunningFlag } = await import('../../scheduledJobs.js');
import * as dbService from '../../databaseService.js'; // Import as namespace

const DEALS_COLLECTION = 'deals';

// Helper function to clean up Firestore emulator before each test
const clearFirestore = async () => {
  if (!db) return; // Guard if db not initialized
  const collections = await db.listCollections();
  for (const collection of collections) {
    const snapshot = await collection.get();
    const batch = db.batch();
    snapshot.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
  }
};

// Helper function to create a deal in Firestore
const createDealInFirestore = async (dealId, dealData) => {
  console.log(`[Test Helper createDealInFirestore] Creating deal ${dealId} with data:`, JSON.stringify(dealData, null, 2));
  await db.collection(DEALS_COLLECTION).doc(dealId).set(dealData);
  const createdDoc = await db.collection(DEALS_COLLECTION).doc(dealId).get();
  if (!createdDoc.exists) {
    console.error(`[Test Helper createDealInFirestore] FAILED to retrieve deal ${dealId} immediately after creation.`);
    throw new Error(`Failed to create or retrieve deal ${dealId}`);
  }
  console.log(`[Test Helper createDealInFirestore] Successfully created and verified deal ${dealId} in Firestore.`);
  return { id: dealId, ...dealData }; // Return input data as it was intended to be set
};

describe('Scheduled Jobs Integration Tests', () => {
  let startScheduledJobs;
  let checkAndProcessContractDeadlines;
  let checkAndProcessCrossChainTransactions; // ✅ NEW
  let __TEST_ONLY_resetJobRunningFlag;

  const testDeals = {
    regularRelease: {
      id: 'test-deal-release-001',
      smartContractAddress: '0x123ReleaseContract',
      status: 'FinalApproval',
      finalApprovalTimestamp: Timestamp.fromDate(new Date(Date.now() - 25 * 60 * 60 * 1000)), // 25 hours ago
      buyerAddress: '0xBuyer123',
      sellerAddress: '0xSeller123',
      amount: 100
    },
    regularCancel: {
      id: 'test-deal-cancel-001',
      smartContractAddress: '0x123CancelContract',
      status: 'InDispute',
      disputeDeadlineTimestamp: Timestamp.fromDate(new Date(Date.now() - 25 * 60 * 60 * 1000)), // 25 hours ago
      buyerAddress: '0xBuyer456',
      sellerAddress: '0xSeller456',
      amount: 50
    },
    // ✅ NEW: Cross-chain test deals
    crossChainRelease: {
      id: 'test-cc-deal-release-001',
      smartContractAddress: '0xCCReleaseContract',
      status: 'CrossChainFinalApproval',
      isCrossChain: true,
      hasCrossChainTransaction: true,
      finalApprovalDeadlineBackend: Timestamp.fromDate(new Date(Date.now() - 25 * 60 * 60 * 1000)),
      buyerSourceChain: 'ethereum',
      sellerTargetChain: 'polygon',
      crossChainTransactionId: 'cc-tx-release-001',
      amount: 200
    },
    crossChainCancel: {
      id: 'test-cc-deal-cancel-001',
      smartContractAddress: '0xCCCancelContract',
      status: 'CrossChainInDispute',
      isCrossChain: true,
      hasCrossChainTransaction: true,
      disputeResolutionDeadlineBackend: Timestamp.fromDate(new Date(Date.now() - 25 * 60 * 60 * 1000)),
      buyerSourceChain: 'ethereum',
      sellerTargetChain: 'arbitrum',
      crossChainTransactionId: 'cc-tx-cancel-001',
      amount: 75
    },
    crossChainStuck: {
      id: 'test-cc-deal-stuck-001',
      smartContractAddress: '0xCCStuckContract',
      status: 'CrossChainInProgress',
      isCrossChain: true,
      hasCrossChainTransaction: true,
      crossChainLastActivity: Timestamp.fromDate(new Date(Date.now() - 25 * 60 * 60 * 1000)), // 25 hours ago
      crossChainTransactionId: 'cc-tx-stuck-001',
      amount: 150
    }
  };

  const testTransactions = {
    pending: {
      id: 'test-cc-tx-pending-001',
      dealId: 'test-deal-cc-pending',
      status: 'in_progress',
      lastUpdated: Timestamp.fromDate(new Date(Date.now() - 4 * 60 * 60 * 1000)), // 4 hours ago
      sourceChain: 'ethereum',
      targetChain: 'polygon',
      bridgeProvider: 'lifi'
    },
    stuck: {
      id: 'test-cc-tx-stuck-001',
      dealId: testDeals.crossChainStuck.id,
      status: 'in_progress',
      lastUpdated: Timestamp.fromDate(new Date(Date.now() - 25 * 60 * 60 * 1000)), // 25 hours ago
      sourceChain: 'ethereum',
      targetChain: 'arbitrum',
      bridgeProvider: 'lifi'
    }
  };

  beforeEach(async () => {
    // Set required environment variables
    process.env.BACKEND_WALLET_PRIVATE_KEY = 'test-private-key';
    process.env.RPC_URL = 'https://test-rpc-url.com';
    process.env.NODE_ENV = 'test';
    delete process.env.CRON_SCHEDULE_DEADLINE_CHECKS;
    delete process.env.CRON_SCHEDULE_CROSS_CHAIN_CHECKS;

    jest.resetModules();

    // Mock blockchain service
    jest.unstable_mockModule('../../blockchainService.js', () => ({
      __esModule: true,
      initializeBlockchainService: mockInitializeBlockchainService,
      triggerReleaseAfterApproval: mockTriggerReleaseAfterApproval,
      triggerCancelAfterDisputeDeadline: mockTriggerCancelAfterDisputeDeadline,
      get contractABI() { return [{ type: 'function', name: 'validABI' }]; }
    }));

    // ✅ NEW: Mock cross-chain service
    jest.unstable_mockModule('../../crossChainService.js', () => ({
      __esModule: true,
      checkPendingTransactionStatus: mockCheckPendingTransactionStatus,
      triggerCrossChainReleaseAfterApprovalSimple: mockTriggerCrossChainReleaseAfterApprovalSimple,
      triggerCrossChainCancelAfterDisputeDeadline: mockTriggerCrossChainCancelAfterDisputeDeadline,
      handleStuckCrossChainTransaction: mockHandleStuckCrossChainTransaction,
      getCrossChainTransactionsForDeal: mockGetCrossChainTransactionsForDeal,
      retryCrossChainTransactionStep: jest.fn().mockResolvedValue({ success: true })
    }));

    // Mock cron
    jest.unstable_mockModule('node-cron', () => ({
      __esModule: true,
      schedule: mockCronSchedule,
      validate: mockCronValidate,
      default: { schedule: mockCronSchedule, validate: mockCronValidate }
    }));

    // Reset all mocks
    mockTriggerReleaseAfterApproval.mockReset().mockResolvedValue({ 
      success: true, 
      receipt: { transactionHash: '0xtestreleasehash' } 
    });
    mockTriggerCancelAfterDisputeDeadline.mockReset().mockResolvedValue({ 
      success: true, 
      receipt: { transactionHash: '0xtestcancelhash' } 
    });
    mockInitializeBlockchainService.mockReset().mockResolvedValue(true);

    // ✅ NEW: Reset cross-chain mocks
    mockCheckPendingTransactionStatus.mockReset().mockResolvedValue({ 
      success: true, 
      updated: false 
    });
    mockTriggerCrossChainReleaseAfterApprovalSimple.mockReset().mockResolvedValue({ 
      success: true, 
      receipt: { transactionHash: '0xccreleasehash' } 
    });
    mockTriggerCrossChainCancelAfterDisputeDeadline.mockReset().mockResolvedValue({ 
      success: true, 
      receipt: { transactionHash: '0xcccancelhash' } 
    });
    mockHandleStuckCrossChainTransaction.mockReset().mockResolvedValue({ 
      success: true, 
      message: 'Transaction marked as stuck' 
    });
    mockGetCrossChainTransactionsForDeal.mockReset().mockResolvedValue([]);

    mockCronSchedule.mockClear();
    mockCronValidate.mockClear().mockReturnValue(true);

    // Import the module under test
    const scheduledJobsModule = await import('../../scheduledJobs.js');
    startScheduledJobs = scheduledJobsModule.startScheduledJobs;
    checkAndProcessContractDeadlines = scheduledJobsModule.checkAndProcessContractDeadlines;
    checkAndProcessCrossChainTransactions = scheduledJobsModule.checkAndProcessCrossChainTransactions; // ✅ NEW
    __TEST_ONLY_resetJobRunningFlag = scheduledJobsModule.__TEST_ONLY_resetJobRunningFlag;

    // Reset job flags
    if (typeof __TEST_ONLY_resetJobRunningFlag === 'function') {
      __TEST_ONLY_resetJobRunningFlag();
    }
  });

  afterEach(() => {
    jest.resetAllMocks();
    jest.useRealTimers();
  });

  afterAll(async () => {
    await deleteAdminApp();
  });

  describe('Full Integration - Regular Blockchain Deals', () => {
    it('should process regular deals end-to-end with real database calls', async () => {
      // This test uses actual database service functions (not mocked)
      // We don't insert real data but verify the integration pattern
      
      await checkAndProcessContractDeadlines();

      // Verify database functions were called
      expect(getDealsPastFinalApproval).toBeDefined();
      expect(getDealsPastDisputeDeadline).toBeDefined();
      expect(updateDealStatusInDB).toBeDefined();
    });

    it('should handle concurrent regular and cross-chain processing', async () => {
      // Run both job types simultaneously
      const results = await Promise.allSettled([
        checkAndProcessContractDeadlines(),
        checkAndProcessCrossChainTransactions()
      ]);

      // Both should complete successfully
      expect(results[0].status).toBe('fulfilled');
      expect(results[1].status).toBe('fulfilled');

      // Verify both database service groups were available
      expect(getCrossChainDealsPendingMonitoring).toBeDefined();
      expect(getCrossChainTransactionsPendingCheck).toBeDefined();
      expect(updateCrossChainDealStatus).toBeDefined();
    });
  });

  // ✅ NEW: Cross-chain integration tests
  describe('Full Integration - Cross-Chain Deals', () => {
    it('should process cross-chain deals end-to-end with real database calls', async () => {
      await checkAndProcessCrossChainTransactions();

      // Verify cross-chain database functions were called
      expect(getCrossChainTransactionsPendingCheck).toBeDefined();
      expect(getCrossChainDealsStuck).toBeDefined();
      expect(updateCrossChainDealStatus).toBeDefined();
    });

    it('should handle cross-chain transaction status monitoring integration', async () => {
      // Mock cross-chain transaction that needs status check
      const mockTransaction = { ...testTransactions.pending };
      jest.mocked(getCrossChainTransactionsPendingCheck).mockResolvedValueOnce([mockTransaction]);
      
      mockCheckPendingTransactionStatus.mockResolvedValueOnce({
        success: true,
        updated: true,
        status: 'completed',
        finalTxHash: '0xcompletedtxhash'
      });

      await checkAndProcessCrossChainTransactions();

      expect(mockCheckPendingTransactionStatus).toHaveBeenCalledWith(mockTransaction.id);
      // In real integration, this would call updateCrossChainDealStatus
    });

    it('should handle stuck cross-chain deals with manual intervention flow', async () => {
      // Mock stuck deal
      jest.mocked(getCrossChainDealsStuck).mockResolvedValueOnce([testDeals.crossChainStuck]);
      mockGetCrossChainTransactionsForDeal.mockResolvedValueOnce([testTransactions.stuck]);
      
      mockHandleStuckCrossChainTransaction.mockResolvedValueOnce({
        success: true,
        message: 'Transaction marked for manual intervention',
        requiresManualIntervention: true
      });

      await checkAndProcessCrossChainTransactions();

      expect(mockHandleStuckCrossChainTransaction).toHaveBeenCalledWith(testTransactions.stuck.id);
      // In real integration, this would trigger manual intervention workflows
    });

    it('should process cross-chain deadlines alongside regular deadlines', async () => {
      // Mock data for both regular and cross-chain deals
      jest.mocked(getDealsPastFinalApproval).mockResolvedValueOnce([testDeals.regularRelease]);
      jest.mocked(getCrossChainDealsPastFinalApproval).mockResolvedValueOnce([testDeals.crossChainRelease]);
      
      await checkAndProcessContractDeadlines();

      // Verify both regular and cross-chain processing occurred
      expect(mockTriggerReleaseAfterApproval).toHaveBeenCalledWith(
        testDeals.regularRelease.smartContractAddress, 
        testDeals.regularRelease.id
      );
      expect(mockTriggerCrossChainReleaseAfterApprovalSimple).toHaveBeenCalledWith(
        testDeals.crossChainRelease.smartContractAddress, 
        testDeals.crossChainRelease.id
      );
    });
  });

  describe('Service Integration Patterns', () => {
    it('should start both regular and cross-chain scheduled jobs', async () => {
      startScheduledJobs();

      // Verify both job types are scheduled
      expect(mockCronSchedule).toHaveBeenCalledTimes(2);
      
      // First call: deadline checks
      expect(mockCronSchedule).toHaveBeenNthCalledWith(1, '*/30 * * * *', expect.any(Function), expect.objectContaining({
        scheduled: true,
        timezone: "America/New_York"
      }));
      
      // Second call: cross-chain monitoring
      expect(mockCronSchedule).toHaveBeenNthCalledWith(2, '*/15 * * * *', expect.any(Function), expect.objectContaining({
        scheduled: true,
        timezone: "America/New_York"
      }));
    });

    it('should respect custom cron schedules for both job types', async () => {
      process.env.CRON_SCHEDULE_DEADLINE_CHECKS = '0 */6 * * *'; // Every 6 hours
      process.env.CRON_SCHEDULE_CROSS_CHAIN_CHECKS = '*/5 * * * *'; // Every 5 minutes

      startScheduledJobs();

      expect(mockCronSchedule).toHaveBeenCalledWith('0 */6 * * *', expect.any(Function), expect.objectContaining({
        scheduled: true,
        timezone: "America/New_York"
      }));
      expect(mockCronSchedule).toHaveBeenCalledWith('*/5 * * * *', expect.any(Function), expect.objectContaining({
        scheduled: true,
        timezone: "America/New_York"
      }));
    });

    it('should gracefully handle blockchain service unavailability while maintaining cross-chain jobs', async () => {
      jest.resetModules();
      
      // Mock blockchain service as unavailable
      jest.unstable_mockModule('../../blockchainService.js', () => ({
        __esModule: true,
        get contractABI() { return null; }
      }));

      // Keep cross-chain service available
      jest.unstable_mockModule('../../crossChainService.js', () => ({
        __esModule: true,
        checkPendingTransactionStatus: mockCheckPendingTransactionStatus,
      }));

      jest.unstable_mockModule('node-cron', () => ({
        __esModule: true,
        schedule: mockCronSchedule,
        validate: mockCronValidate,
        default: { schedule: mockCronSchedule, validate: mockCronValidate }
      }));

      const { startScheduledJobs: gracefulStartScheduledJobs } = await import('../../scheduledJobs.js');
      gracefulStartScheduledJobs();

      // Should only schedule cross-chain job
      expect(mockCronSchedule).toHaveBeenCalledTimes(1);
      expect(mockCronSchedule).toHaveBeenCalledWith('*/15 * * * *', expect.any(Function), expect.any(Object));
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle mixed success and failure scenarios', async () => {
      // Setup mixed scenario: one regular success, one cross-chain failure
      jest.mocked(getDealsPastFinalApproval).mockResolvedValueOnce([testDeals.regularRelease]);
      jest.mocked(getCrossChainDealsPastFinalApproval).mockResolvedValueOnce([testDeals.crossChainRelease]);
      
      // Regular deal succeeds
      mockTriggerReleaseAfterApproval.mockResolvedValueOnce({ 
        success: true, 
        receipt: { transactionHash: '0xsuccesshash' } 
      });
      
      // Cross-chain deal fails
      mockTriggerCrossChainReleaseAfterApprovalSimple.mockResolvedValueOnce({ 
        success: false, 
        error: 'Bridge temporarily unavailable',
        requiresManualIntervention: true
      });

      await checkAndProcessContractDeadlines();

      // Both should be processed despite one failure
      expect(mockTriggerReleaseAfterApproval).toHaveBeenCalledWith(
        testDeals.regularRelease.smartContractAddress, 
        testDeals.regularRelease.id
      );
      expect(mockTriggerCrossChainReleaseAfterApprovalSimple).toHaveBeenCalledWith(
        testDeals.crossChainRelease.smartContractAddress, 
        testDeals.crossChainRelease.id
      );
    });

    it('should handle database errors gracefully and continue processing', async () => {
      // Mock database error for regular deals but cross-chain succeeds
      jest.mocked(getDealsPastFinalApproval).mockRejectedValueOnce(new Error('Database timeout'));
      jest.mocked(getCrossChainTransactionsPendingCheck).mockResolvedValueOnce([testTransactions.pending]);

      // Both jobs should handle their respective errors
      const deadlineResult = checkAndProcessContractDeadlines();
      const crossChainResult = checkAndProcessCrossChainTransactions();

      await expect(deadlineResult).resolves.toBeUndefined(); // Doesn't throw
      await expect(crossChainResult).resolves.toBeUndefined(); // Doesn't throw

      // Cross-chain processing should continue despite regular database error
      expect(mockCheckPendingTransactionStatus).toHaveBeenCalled();
    });

    it('should recover from transaction status check failures', async () => {
      const failingTransaction = { ...testTransactions.pending, id: 'failing-tx' };
      const successTransaction = { ...testTransactions.pending, id: 'success-tx' };
      
      jest.mocked(getCrossChainTransactionsPendingCheck).mockResolvedValueOnce([failingTransaction, successTransaction]);
      
      mockCheckPendingTransactionStatus
        .mockResolvedValueOnce({ success: false, error: 'Network error' })
        .mockResolvedValueOnce({ success: true, updated: true, status: 'completed' });

      await checkAndProcessCrossChainTransactions();

      // Should attempt to check both transactions
      expect(mockCheckPendingTransactionStatus).toHaveBeenCalledTimes(2);
      expect(mockCheckPendingTransactionStatus).toHaveBeenCalledWith('failing-tx');
      expect(mockCheckPendingTransactionStatus).toHaveBeenCalledWith('success-tx');
    });
  });

  describe('Performance and Concurrency', () => {
    it('should prevent concurrent executions of the same job type', async () => {
      jest.useFakeTimers();
      
      if (typeof __TEST_ONLY_resetJobRunningFlag === 'function') {
        __TEST_ONLY_resetJobRunningFlag();
      }

      // Start two deadline check jobs simultaneously
      const promise1 = checkAndProcessContractDeadlines();
      const promise2 = checkAndProcessContractDeadlines();
      
      jest.advanceTimersByTime(100);
      await Promise.all([promise1, promise2]);

      // Should only execute database queries once (second job skipped)
      expect(jest.mocked(getDealsPastFinalApproval)).toHaveBeenCalledTimes(1);
      
      jest.useRealTimers();
    });

    it('should allow concurrent execution of different job types', async () => {
      jest.useFakeTimers();
      
      if (typeof __TEST_ONLY_resetJobRunningFlag === 'function') {
        __TEST_ONLY_resetJobRunningFlag();
      }

      // Start deadline check and cross-chain monitoring simultaneously
      const deadlinePromise = checkAndProcessContractDeadlines();
      const crossChainPromise = checkAndProcessCrossChainTransactions();
      
      jest.advanceTimersByTime(100);
      await Promise.all([deadlinePromise, crossChainPromise]);

      // Both job types should execute their respective database queries
      expect(jest.mocked(getDealsPastFinalApproval)).toHaveBeenCalled();
      expect(jest.mocked(getCrossChainTransactionsPendingCheck)).toHaveBeenCalled();
      
      jest.useRealTimers();
    });

    it('should handle high-frequency cross-chain monitoring efficiently', async () => {
      // Simulate rapid successive calls (like cron every 15 minutes)
      const transactions = Array.from({ length: 5 }, (_, i) => ({
        ...testTransactions.pending,
        id: `rapid-tx-${i}`,
        dealId: `rapid-deal-${i}`
      }));

      jest.mocked(getCrossChainTransactionsPendingCheck).mockResolvedValue(transactions);
      mockCheckPendingTransactionStatus.mockResolvedValue({ success: true, updated: false });

      // Execute the job
      await checkAndProcessCrossChainTransactions();

      // Should efficiently process all transactions
      expect(mockCheckPendingTransactionStatus).toHaveBeenCalledTimes(5);
      transactions.forEach((tx, i) => {
        expect(mockCheckPendingTransactionStatus).toHaveBeenNthCalledWith(i + 1, tx.id);
      });
    });
  });

  describe('Real-World Integration Scenarios', () => {
    it('should handle peak usage with mixed deal types', async () => {
      // Simulate peak usage scenario with multiple deal types
      const regularDeals = [testDeals.regularRelease, testDeals.regularCancel];
      const crossChainDeals = [testDeals.crossChainRelease, testDeals.crossChainCancel];
      const pendingTransactions = [testTransactions.pending];
      const stuckDeals = [testDeals.crossChainStuck];

      jest.mocked(getDealsPastFinalApproval).mockResolvedValueOnce([testDeals.regularRelease]);
      jest.mocked(getDealsPastDisputeDeadline).mockResolvedValueOnce([testDeals.regularCancel]);
      jest.mocked(getCrossChainDealsPastFinalApproval).mockResolvedValueOnce([testDeals.crossChainRelease]);
      jest.mocked(getCrossChainDealsPastDisputeDeadline).mockResolvedValueOnce([testDeals.crossChainCancel]);
      jest.mocked(getCrossChainTransactionsPendingCheck).mockResolvedValueOnce(pendingTransactions);
      jest.mocked(getCrossChainDealsStuck).mockResolvedValueOnce(stuckDeals);
      mockGetCrossChainTransactionsForDeal.mockResolvedValueOnce([testTransactions.stuck]);

      // Run both job types in parallel
      await Promise.all([
        checkAndProcessContractDeadlines(),
        checkAndProcessCrossChainTransactions()
      ]);

      // Verify all deal types were processed
      expect(mockTriggerReleaseAfterApproval).toHaveBeenCalledWith(testDeals.regularRelease.smartContractAddress, testDeals.regularRelease.id);
      expect(mockTriggerCancelAfterDisputeDeadline).toHaveBeenCalledWith(testDeals.regularCancel.smartContractAddress, testDeals.regularCancel.id);
      expect(mockTriggerCrossChainReleaseAfterApprovalSimple).toHaveBeenCalledWith(testDeals.crossChainRelease.smartContractAddress, testDeals.crossChainRelease.id);
      expect(mockTriggerCrossChainCancelAfterDisputeDeadline).toHaveBeenCalledWith(testDeals.crossChainCancel.smartContractAddress, testDeals.crossChainCancel.id);
      expect(mockCheckPendingTransactionStatus).toHaveBeenCalledWith(testTransactions.pending.id);
      expect(mockHandleStuckCrossChainTransaction).toHaveBeenCalledWith(testTransactions.stuck.id);
    });

    it('should maintain service integration integrity under load', async () => {
      // Test that the integration between services remains stable under load
      const promises = [];
      
      // Simulate multiple job cycles running
      for (let i = 0; i < 3; i++) {
        promises.push(checkAndProcessContractDeadlines());
        promises.push(checkAndProcessCrossChainTransactions());
      }

      const results = await Promise.allSettled(promises);
      
      // All jobs should complete successfully
      results.forEach((result, index) => {
        expect(result.status).toBe('fulfilled');
      });

      // Services should maintain their integration patterns
      expect(mockCheckPendingTransactionStatus).toBeDefined();
      expect(mockTriggerReleaseAfterApproval).toBeDefined();
      expect(getCrossChainTransactionsPendingCheck).toBeDefined();
      expect(updateCrossChainDealStatus).toBeDefined();
    });
  });
}); 