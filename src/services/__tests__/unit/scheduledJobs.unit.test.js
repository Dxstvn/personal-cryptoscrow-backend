// src/services/__tests__/scheduledJobs.test.js
import { jest, describe, it, expect, beforeEach, afterEach, afterAll } from '@jest/globals';
import { Timestamp as OriginalTimestamp } from 'firebase-admin/firestore'; // Import original for creating our fixed instance
import { deleteAdminApp } from '../../../api/routes/auth/admin.js';

// --- Define top-level variables to hold mock functions ---
const mockGetDealsPastFinalApproval = jest.fn();
const mockGetDealsPastDisputeDeadline = jest.fn();
const mockUpdateDealStatusInDB = jest.fn();
const mockTriggerReleaseAfterApproval = jest.fn();
const mockTriggerCancelAfterDisputeDeadline = jest.fn();
const mockInitializeBlockchainService = jest.fn();

// ✅ NEW: Cross-chain database service mocks
const mockGetCrossChainDealsPendingMonitoring = jest.fn();
const mockGetCrossChainTransactionsPendingCheck = jest.fn();
const mockGetCrossChainDealsStuck = jest.fn();
const mockGetCrossChainDealsPastFinalApproval = jest.fn();
const mockGetCrossChainDealsPastDisputeDeadline = jest.fn();
const mockUpdateCrossChainDealStatus = jest.fn();

// ✅ NEW: Cross-chain service mocks
const mockCheckPendingTransactionStatus = jest.fn();
const mockTriggerCrossChainReleaseAfterApproval = jest.fn();
const mockTriggerCrossChainReleaseAfterApprovalSimple = jest.fn();
const mockTriggerCrossChainCancelAfterDisputeDeadline = jest.fn();
const mockHandleStuckCrossChainTransaction = jest.fn();
const mockRetryCrossChainTransactionStep = jest.fn();
const mockGetCrossChainTransactionsForDeal = jest.fn();

const mockCronSchedule = jest.fn(() => ({ start: jest.fn(), stop: jest.fn() }));
const mockCronValidate = jest.fn().mockReturnValue(true);
const mockContractABIGet = jest.fn(); // New mock function for contractABI getter
let factoryExecutionCount = 0; // Counter for factory executions
let fixedTimestampNow; // To hold our fixed timestamp

describe('Scheduled Jobs (scheduledJobs.js)', () => {
  let startScheduledJobs;
  let checkAndProcessContractDeadlines;
  let checkAndProcessCrossChainTransactions; // ✅ NEW
  let __TEST_ONLY_resetJobRunningFlag;

  // Console spies
  let consoleLogSpy;
  let consoleWarnSpy;
  let consoleErrorSpy;

  // Mock Data
  const mockDealRelease = {
    id: 'dealRelease001',
    smartContractAddress: '0xReleaseContractAddress',
    finalApprovalTimestamp: OriginalTimestamp.fromDate(new Date(Date.now() - 24 * 60 * 60 * 1000)),
  };
  const mockDealCancel = {
    id: 'dealCancel001',
    smartContractAddress: '0xCancelContractAddress',
    disputeDeadlineTimestamp: OriginalTimestamp.fromDate(new Date(Date.now() - 24 * 60 * 60 * 1000)),
  };

  // ✅ NEW: Cross-chain mock data
  const mockCrossChainDealRelease = {
    id: 'crossChainDealRelease001',
    isCrossChain: true,
    smartContractAddress: '0xCrossChainReleaseContract',
    crossChainTransactionId: 'cc-tx-release-001',
    status: 'CrossChainFinalApproval',
    finalApprovalDeadlineBackend: OriginalTimestamp.fromDate(new Date(Date.now() - 24 * 60 * 60 * 1000)),
  };

  const mockCrossChainDealCancel = {
    id: 'crossChainDealCancel001',
    isCrossChain: true,
    smartContractAddress: '0xCrossChainCancelContract',
    crossChainTransactionId: 'cc-tx-cancel-001',
    status: 'CrossChainInDispute',
    disputeResolutionDeadlineBackend: OriginalTimestamp.fromDate(new Date(Date.now() - 24 * 60 * 60 * 1000)),
  };

  const mockCrossChainTransaction = {
    id: 'cc-tx-pending-001',
    status: 'in_progress',
    dealId: 'deal-123',
    lastUpdated: OriginalTimestamp.fromDate(new Date(Date.now() - 4 * 60 * 60 * 1000)), // 4 hours ago
  };

  const mockStuckCrossChainDeal = {
    id: 'stuckDeal001',
    isCrossChain: true,
    status: 'CrossChainInProgress',
    crossChainTransactionId: 'cc-tx-stuck-001',
    crossChainLastActivity: OriginalTimestamp.fromDate(new Date(Date.now() - 25 * 60 * 60 * 1000)), // 25 hours ago
  };

  beforeEach(async () => {
    // 0. Create a fixed timestamp for Timestamp.now()
    fixedTimestampNow = OriginalTimestamp.fromDate(new Date('2024-01-01T10:00:00.000Z'));
    console.log('[BEFORE EACH START] Beginning beforeEach setup.');

    // 1. Set ENV variables
    process.env.BACKEND_WALLET_PRIVATE_KEY = 'dummyPrivateKey';
    process.env.RPC_URL = 'dummyRpcUrl';
    delete process.env.CRON_SCHEDULE_DEADLINE_CHECKS;
    delete process.env.CRON_SCHEDULE_CROSS_CHAIN_CHECKS; // ✅ NEW

    // 2. Reset modules
    console.log('[BEFORE EACH] Calling jest.resetModules().');
    jest.resetModules();
    console.log('[BEFORE EACH] jest.resetModules() completed.');

    // 3. Define mocks using jest.unstable_mockModule INSIDE beforeEach, AFTER resetModules
    jest.unstable_mockModule('../../blockchainService.js', () => {
      factoryExecutionCount++;
      const currentFactoryExecution = factoryExecutionCount;
      console.log(`[TEST DEBUG] blockchainService MOCK FACTORY EXECUTED. Count: ${currentFactoryExecution}.`);
      return {
        __esModule: true,
        initializeBlockchainService: mockInitializeBlockchainService,
        triggerReleaseAfterApproval: mockTriggerReleaseAfterApproval,
        triggerCancelAfterDisputeDeadline: mockTriggerCancelAfterDisputeDeadline,
        get contractABI() {
          const val = mockContractABIGet();
          console.log(`[TEST DEBUG] contractABI GETTER CALLED (Factory Exec Count: ${currentFactoryExecution}). mockContractABIGet() returned: ${JSON.stringify(val)}`);
          return val;
        }
      };
    });

    // ✅ NEW: Enhanced database service mock with cross-chain functions
    console.log('[BEFORE EACH] Setting up unstable_mockModule for databaseService.js.');
    jest.unstable_mockModule('../../databaseService.js', () => ({
      __esModule: true,
      getDealsPastFinalApproval: mockGetDealsPastFinalApproval,
      getDealsPastDisputeDeadline: mockGetDealsPastDisputeDeadline,
      updateDealStatusInDB: mockUpdateDealStatusInDB,
      // Cross-chain functions
      getCrossChainDealsPendingMonitoring: mockGetCrossChainDealsPendingMonitoring,
      getCrossChainTransactionsPendingCheck: mockGetCrossChainTransactionsPendingCheck,
      getCrossChainDealsStuck: mockGetCrossChainDealsStuck,
      getCrossChainDealsPastFinalApproval: mockGetCrossChainDealsPastFinalApproval,
      getCrossChainDealsPastDisputeDeadline: mockGetCrossChainDealsPastDisputeDeadline,
      updateCrossChainDealStatus: mockUpdateCrossChainDealStatus,
    }));

    // ✅ NEW: Cross-chain service mock
    jest.unstable_mockModule('../../crossChainService.js', () => ({
      __esModule: true,
      checkPendingTransactionStatus: mockCheckPendingTransactionStatus,
      triggerCrossChainReleaseAfterApproval: mockTriggerCrossChainReleaseAfterApproval,
      triggerCrossChainReleaseAfterApprovalSimple: mockTriggerCrossChainReleaseAfterApprovalSimple,
      triggerCrossChainCancelAfterDisputeDeadline: mockTriggerCrossChainCancelAfterDisputeDeadline,
      handleStuckCrossChainTransaction: mockHandleStuckCrossChainTransaction,
      retryCrossChainTransactionStep: mockRetryCrossChainTransactionStep,
      getCrossChainTransactionsForDeal: mockGetCrossChainTransactionsForDeal,
    }));

    jest.unstable_mockModule('node-cron', () => ({
      __esModule: true,
      schedule: mockCronSchedule,
      validate: mockCronValidate,
      default: {
        schedule: mockCronSchedule,
        validate: mockCronValidate,
      }
    }));

    jest.unstable_mockModule('firebase-admin/firestore', () => {
      const originalFirestore = jest.requireActual('firebase-admin/firestore');
      return {
        ...originalFirestore,
        Timestamp: {
          ...originalFirestore.Timestamp,
          now: jest.fn(() => fixedTimestampNow), // Mock Timestamp.now()
        },
      };
    });

    // 4. Reset all predefined mock functions' states and set default implementations
    mockGetDealsPastFinalApproval.mockReset().mockImplementation(() => Promise.resolve([]));
    mockGetDealsPastDisputeDeadline.mockReset().mockImplementation(() => Promise.resolve([]));
    mockUpdateDealStatusInDB.mockReset().mockImplementation(() => Promise.resolve({ success: true }));
    mockInitializeBlockchainService.mockReset().mockImplementation(() => Promise.resolve(true));
    mockTriggerReleaseAfterApproval.mockReset().mockImplementation(() => Promise.resolve({ success: true, receipt: { transactionHash: '0xreleasehash' } }));
    mockTriggerCancelAfterDisputeDeadline.mockReset().mockImplementation(() => Promise.resolve({ success: true, receipt: { transactionHash: '0xcancelhash' } }));
    mockContractABIGet.mockReset().mockReturnValue([{ type: 'function', name: 'defaultValidABI' }]);
    
    // ✅ NEW: Reset cross-chain mocks
    mockGetCrossChainDealsPendingMonitoring.mockReset().mockImplementation(() => Promise.resolve([]));
    mockGetCrossChainTransactionsPendingCheck.mockReset().mockImplementation(() => Promise.resolve([]));
    mockGetCrossChainDealsStuck.mockReset().mockImplementation(() => Promise.resolve([]));
    mockGetCrossChainDealsPastFinalApproval.mockReset().mockImplementation(() => Promise.resolve([]));
    mockGetCrossChainDealsPastDisputeDeadline.mockReset().mockImplementation(() => Promise.resolve([]));
    mockUpdateCrossChainDealStatus.mockReset().mockImplementation(() => Promise.resolve({ success: true }));
    mockCheckPendingTransactionStatus.mockReset().mockImplementation(() => Promise.resolve({ success: true, updated: false }));
    mockTriggerCrossChainReleaseAfterApproval.mockReset().mockImplementation(() => Promise.resolve({ success: true, transactionId: 'cc-tx-release' }));
    mockTriggerCrossChainReleaseAfterApprovalSimple.mockReset().mockImplementation(() => Promise.resolve({ success: true, receipt: { transactionHash: '0xccreleasehash' } }));
    mockTriggerCrossChainCancelAfterDisputeDeadline.mockReset().mockImplementation(() => Promise.resolve({ success: true, receipt: { transactionHash: '0xcccancelhash' } }));
    mockHandleStuckCrossChainTransaction.mockReset().mockImplementation(() => Promise.resolve({ success: true, message: 'Transaction unstuck' }));
    mockRetryCrossChainTransactionStep.mockReset().mockImplementation(() => Promise.resolve({ success: true, result: { status: 'completed' } }));
    mockGetCrossChainTransactionsForDeal.mockReset().mockImplementation(() => Promise.resolve([]));
    
    mockCronSchedule.mockClear(); // Clear cron schedule mock specifically
    mockCronValidate.mockClear().mockReturnValue(true);

    // 6. Setup console spies
    consoleLogSpy = jest.spyOn(console, 'log');
    consoleWarnSpy = jest.spyOn(console, 'warn');
    consoleErrorSpy = jest.spyOn(console, 'error');

    // 7. Reset job running flag
    if (typeof __TEST_ONLY_resetJobRunningFlag === 'function') {
      __TEST_ONLY_resetJobRunningFlag();
    }

    // Dynamically import the SUT (System Under Test) AFTER all mocks are set up
    const SUT = await import('../../scheduledJobs.js');
    startScheduledJobs = SUT.startScheduledJobs;
    checkAndProcessContractDeadlines = SUT.checkAndProcessContractDeadlines;
    checkAndProcessCrossChainTransactions = SUT.checkAndProcessCrossChainTransactions; // ✅ NEW
    __TEST_ONLY_resetJobRunningFlag = SUT.__TEST_ONLY_resetJobRunningFlag;

    // Now, reset the job running flag for the actual module instance if it was already loaded
    if (typeof __TEST_ONLY_resetJobRunningFlag === 'function') {
        __TEST_ONLY_resetJobRunningFlag();
    }
  });

  afterEach(() => {
    // Clean up console spies
    if (consoleLogSpy) consoleLogSpy.mockRestore();
    if (consoleWarnSpy) consoleWarnSpy.mockRestore();
    if (consoleErrorSpy) consoleErrorSpy.mockRestore();
    
    jest.useRealTimers();
    jest.resetAllMocks();
  });

  afterAll(async () => {
    await deleteAdminApp();
  });

  describe('startScheduledJobs', () => {
    it('should schedule both deadline check and cross-chain monitoring jobs with correct schedules', async () => {
      process.env.CRON_SCHEDULE_DEADLINE_CHECKS = '0 0 * * *';
      process.env.CRON_SCHEDULE_CROSS_CHAIN_CHECKS = '*/10 * * * *';
      
      startScheduledJobs();
      
      expect(mockCronSchedule).toHaveBeenCalledTimes(2); // ✅ NEW: Now schedules 2 jobs
      expect(mockCronSchedule).toHaveBeenCalledWith('0 0 * * *', expect.any(Function), expect.objectContaining({
        scheduled: true,
        timezone: "America/New_York"
      }));
      expect(mockCronSchedule).toHaveBeenCalledWith('*/10 * * * *', expect.any(Function), expect.objectContaining({
        scheduled: true,
        timezone: "America/New_York"
      }));
    });

    it('should use default cron schedules if env variables are not set', async () => {
      startScheduledJobs();
      
      expect(mockCronSchedule).toHaveBeenCalledTimes(2);
      expect(mockCronSchedule).toHaveBeenCalledWith('*/30 * * * *', expect.any(Function), expect.objectContaining({
        scheduled: true,
        timezone: "America/New_York"
      }));
      expect(mockCronSchedule).toHaveBeenCalledWith('*/15 * * * *', expect.any(Function), expect.objectContaining({
        scheduled: true,
        timezone: "America/New_York"
      }));
    });

    it('should skip deadline check job if blockchain service not available but still schedule cross-chain job', async () => {
      mockContractABIGet.mockReturnValue(null);
      jest.resetModules();
      
      // Re-setup mocks with null ABI
      jest.unstable_mockModule('../../blockchainService.js', () => ({
        __esModule: true,
        get contractABI() { return null; }
      }));
      jest.unstable_mockModule('../../databaseService.js', () => ({
        __esModule: true,
        getCrossChainDealsPendingMonitoring: mockGetCrossChainDealsPendingMonitoring,
        getCrossChainTransactionsPendingCheck: mockGetCrossChainTransactionsPendingCheck,
        getCrossChainDealsStuck: mockGetCrossChainDealsStuck,
      }));
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

      const { startScheduledJobs: localStartScheduledJobs } = await import('../../scheduledJobs.js');
      localStartScheduledJobs();
      
      expect(mockCronSchedule).toHaveBeenCalledTimes(1); // Only cross-chain job
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Skipping deadline check job - blockchain service not available'));
    });

    it('should NOT schedule any jobs if required env vars are missing', async () => {
      delete process.env.BACKEND_WALLET_PRIVATE_KEY;
      startScheduledJobs();
      expect(mockCronSchedule).not.toHaveBeenCalled();
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Automated contract call jobs DISABLED due to missing BACKEND_WALLET_PRIVATE_KEY or RPC_URL.'));
    });

    it('should NOT schedule jobs if cross-chain cron schedule is invalid', async () => {
      process.env.CRON_SCHEDULE_CROSS_CHAIN_CHECKS = 'invalid-cron-string';
      mockCronValidate.mockImplementation((schedule) => {
        if (schedule === 'invalid-cron-string') return false;
        return true;
      });
      
      startScheduledJobs();
      expect(mockCronSchedule).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid CROSS_CHAIN_CRON_SCHEDULE'));
    });
  });

  describe('checkAndProcessContractDeadlines (Enhanced)', () => {
    it('should process regular deals and cross-chain deals past final approval', async () => {
      mockGetDealsPastFinalApproval.mockResolvedValueOnce([mockDealRelease]);
      mockGetCrossChainDealsPastFinalApproval.mockResolvedValueOnce([mockCrossChainDealRelease]);
      
      await checkAndProcessContractDeadlines();
      
      // Regular deal processing
      expect(mockTriggerReleaseAfterApproval).toHaveBeenCalledWith(mockDealRelease.smartContractAddress, mockDealRelease.id);
      expect(mockUpdateDealStatusInDB).toHaveBeenCalledWith(mockDealRelease.id, expect.objectContaining({
        status: 'FundsReleased',
        autoReleaseTxHash: '0xreleasehash',
      }));
      
      // ✅ NEW: Cross-chain deal processing
      expect(mockTriggerCrossChainReleaseAfterApprovalSimple).toHaveBeenCalledWith(mockCrossChainDealRelease.smartContractAddress, mockCrossChainDealRelease.id);
      expect(mockUpdateCrossChainDealStatus).toHaveBeenCalledWith(mockCrossChainDealRelease.id, expect.objectContaining({
        status: 'CrossChainFundsReleased',
        crossChainTxHash: '0xccreleasehash',
      }));
    });

    it('should process regular deals and cross-chain deals past dispute deadline', async () => {
      mockGetDealsPastDisputeDeadline.mockResolvedValueOnce([mockDealCancel]);
      mockGetCrossChainDealsPastDisputeDeadline.mockResolvedValueOnce([mockCrossChainDealCancel]);
      
      await checkAndProcessContractDeadlines();
      
      // Regular deal processing
      expect(mockTriggerCancelAfterDisputeDeadline).toHaveBeenCalledWith(mockDealCancel.smartContractAddress, mockDealCancel.id);
      expect(mockUpdateDealStatusInDB).toHaveBeenCalledWith(mockDealCancel.id, expect.objectContaining({
        status: 'CancelledAfterDisputeDeadline',
        autoCancelTxHash: '0xcancelhash',
      }));
      
      // ✅ NEW: Cross-chain deal processing
      expect(mockTriggerCrossChainCancelAfterDisputeDeadline).toHaveBeenCalledWith(mockCrossChainDealCancel.smartContractAddress, mockCrossChainDealCancel.id);
      expect(mockUpdateCrossChainDealStatus).toHaveBeenCalledWith(mockCrossChainDealCancel.id, expect.objectContaining({
        status: 'CrossChainCancelledAfterDisputeDeadline',
        crossChainTxHash: '0xcccancelhash',
      }));
    });

    it('should handle cross-chain release failure requiring manual intervention', async () => {
      const crossChainDealWithFailure = { ...mockCrossChainDealRelease };
      mockGetCrossChainDealsPastFinalApproval.mockResolvedValueOnce([crossChainDealWithFailure]);
      mockTriggerCrossChainReleaseAfterApprovalSimple.mockResolvedValueOnce({ 
        success: false, 
        error: 'Bridge unavailable',
        requiresManualIntervention: true 
      });
      
      await checkAndProcessContractDeadlines();
      
      expect(mockUpdateCrossChainDealStatus).toHaveBeenCalledWith(crossChainDealWithFailure.id, expect.objectContaining({
        status: 'CrossChainReleaseRequiresIntervention',
        processingError: 'Cross-chain call failed: Bridge unavailable',
      }));
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('FAILED to process cross-chain auto-release'));
    });
  });

  // ✅ NEW: Cross-chain monitoring job tests
  describe('checkAndProcessCrossChainTransactions', () => {
    it('should check pending cross-chain transactions and update status', async () => {
      mockGetCrossChainTransactionsPendingCheck.mockResolvedValueOnce([mockCrossChainTransaction]);
      mockCheckPendingTransactionStatus.mockResolvedValueOnce({
        success: true,
        updated: true,
        status: 'completed'
      });
      
      await checkAndProcessCrossChainTransactions();
      
      expect(mockCheckPendingTransactionStatus).toHaveBeenCalledWith(mockCrossChainTransaction.id);
      expect(mockUpdateCrossChainDealStatus).toHaveBeenCalledWith(mockCrossChainTransaction.dealId, expect.objectContaining({
        status: 'CrossChainCompleted',
        crossChainTxHash: mockCrossChainTransaction.id,
      }));
    });

    it('should handle stuck cross-chain deals and mark for manual intervention', async () => {
      mockGetCrossChainDealsStuck.mockResolvedValueOnce([mockStuckCrossChainDeal]);
      mockGetCrossChainTransactionsForDeal.mockResolvedValueOnce([{
        id: 'stuck-tx-001',
        status: 'in_progress',
        dealId: mockStuckCrossChainDeal.id
      }]);
      mockHandleStuckCrossChainTransaction.mockResolvedValueOnce({
        success: true,
        message: 'Transaction marked as stuck',
        requiresManualIntervention: true
      });
      
      await checkAndProcessCrossChainTransactions();
      
      expect(mockHandleStuckCrossChainTransaction).toHaveBeenCalledWith('stuck-tx-001');
      expect(mockUpdateCrossChainDealStatus).toHaveBeenCalledWith(mockStuckCrossChainDeal.id, expect.objectContaining({
        status: 'CrossChainStuck',
        processingError: 'Transaction stuck: Transaction marked as stuck',
      }));
    });

    it('should prevent concurrent cross-chain job runs', async () => {
      jest.useFakeTimers();
      
      if (typeof __TEST_ONLY_resetJobRunningFlag === 'function') {
        __TEST_ONLY_resetJobRunningFlag();
      }

      const promise1 = checkAndProcessCrossChainTransactions();
      const promise2 = checkAndProcessCrossChainTransactions(); 
      
      jest.advanceTimersByTime(100);
      await Promise.all([promise1, promise2]);
      
      expect(mockGetCrossChainTransactionsPendingCheck).toHaveBeenCalledTimes(1);
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('[Scheduler] Cross-chain monitoring job already running. Skipping this cycle.'));
      jest.useRealTimers();
    });

    it('should handle cross-chain monitoring errors gracefully', async () => {
      const dbError = new Error('Cross-chain query failed');
      mockGetCrossChainTransactionsPendingCheck.mockRejectedValueOnce(dbError);
      
      await checkAndProcessCrossChainTransactions();
      
      expect(consoleErrorSpy).toHaveBeenCalledWith('[Scheduler] CRITICAL ERROR in cross-chain monitoring job:', dbError);
    });

    it('should warn when transaction status check fails but continue processing', async () => {
      const failingTransaction = { ...mockCrossChainTransaction, id: 'failing-tx' };
      mockGetCrossChainTransactionsPendingCheck.mockResolvedValueOnce([failingTransaction]);
      mockCheckPendingTransactionStatus.mockResolvedValueOnce({
        success: false,
        error: 'Network timeout'
      });
      
      await checkAndProcessCrossChainTransactions();
      
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to check status for transaction failing-tx:'), 'Network timeout');
    });
  });

  // ✅ NEW: Integration test for dual job system
  describe('Dual Job System Integration', () => {
    it('should run both deadline check and cross-chain monitoring independently', async () => {
      // Setup data for both job types
      mockGetDealsPastFinalApproval.mockResolvedValueOnce([mockDealRelease]);
      mockGetCrossChainTransactionsPendingCheck.mockResolvedValueOnce([mockCrossChainTransaction]);
      mockCheckPendingTransactionStatus.mockResolvedValueOnce({ success: true, updated: false });
      
      // Run both jobs
      await Promise.all([
        checkAndProcessContractDeadlines(),
        checkAndProcessCrossChainTransactions()
      ]);
      
      // Verify both jobs executed their respective functions
      expect(mockTriggerReleaseAfterApproval).toHaveBeenCalledWith(mockDealRelease.smartContractAddress, mockDealRelease.id);
      expect(mockCheckPendingTransactionStatus).toHaveBeenCalledWith(mockCrossChainTransaction.id);
      
      // Verify separate update functions were called
      expect(mockUpdateDealStatusInDB).toHaveBeenCalledWith(mockDealRelease.id, expect.any(Object));
      expect(mockCheckPendingTransactionStatus).toHaveBeenCalled();
    });

    it('should maintain separate job running flags for deadline check and cross-chain monitoring', async () => {
      jest.useFakeTimers();
      
      if (typeof __TEST_ONLY_resetJobRunningFlag === 'function') {
        __TEST_ONLY_resetJobRunningFlag();
      }

      // Start deadline check job
      const deadlinePromise1 = checkAndProcessContractDeadlines();
      const deadlinePromise2 = checkAndProcessContractDeadlines(); // Should be skipped
      
      // Start cross-chain job (should NOT be blocked by deadline check job)
      const crossChainPromise = checkAndProcessCrossChainTransactions();
      
      jest.advanceTimersByTime(100);
      await Promise.all([deadlinePromise1, deadlinePromise2, crossChainPromise]);
      
      // Verify deadline check was blocked on second call
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('[Scheduler] Deadline check job already running. Skipping this cycle.'));
      
      // Verify cross-chain job was NOT blocked
      expect(mockGetCrossChainTransactionsPendingCheck).toHaveBeenCalledTimes(1);
      
      jest.useRealTimers();
    });
  });
}); 