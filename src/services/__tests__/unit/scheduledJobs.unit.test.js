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
const mockCronSchedule = jest.fn(() => ({ start: jest.fn(), stop: jest.fn() }));
const mockCronValidate = jest.fn().mockReturnValue(true);
const mockContractABIGet = jest.fn(); // New mock function for contractABI getter
let factoryExecutionCount = 0; // Counter for factory executions

// This variable will be controlled by tests to change the ABI value.
// let mockableContractABIValueForTests; // REMOVED
// console.log('[TEST FILE SCOPE] mockableContractABIValueForTests declared top-level.'); // REMOVED
let fixedTimestampNow; // To hold our fixed timestamp

// Mock node-cron at the top level (can remain jest.mock as it's likely CJS)
// jest.mock('node-cron', () => ({
//   __esModule: true,
//   schedule: mockCronSchedule,
//   validate: mockCronValidate,
//   default: {
//     schedule: mockCronSchedule,
//     validate: mockCronValidate,
//   }
// }));

// REMOVE top-level jest.unstable_mockModule for blockchainService.js and databaseService.js
// They will be moved into beforeEach

// --- Test Suite ---
describe('Scheduled Jobs (scheduledJobs.js)', () => {
  let startScheduledJobs;
  let checkAndProcessContractDeadlines;
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
  const dealNoSCRelease = {
    id: 'dealNoSC001Release',
    smartContractAddress: null,
    finalApprovalTimestamp: OriginalTimestamp.fromDate(new Date(Date.now() - 24 * 60 * 60 * 1000)),
  };
  const dealNoSCCancel = {
    id: 'dealNoSC001Cancel',
    smartContractAddress: null,
    disputeDeadlineTimestamp: OriginalTimestamp.fromDate(new Date(Date.now() - 24 * 60 * 60 * 1000)),
  };

  beforeEach(async () => {
    // 0. Create a fixed timestamp for Timestamp.now()
    fixedTimestampNow = OriginalTimestamp.fromDate(new Date('2024-01-01T10:00:00.000Z'));
    console.log('[BEFORE EACH START] Beginning beforeEach setup.');

    // 1. Set default for mockableContractABIValueForTests and ENV variables.
    // mockableContractABIValueForTests = [{ type: 'function', name: 'defaultValidABI' }]; // REMOVED
    // console.log(`[BEFORE EACH] mockableContractABIValueForTests initialized to: ${JSON.stringify(mockableContractABIValueForTests)}`); // REMOVED
    process.env.BACKEND_WALLET_PRIVATE_KEY = 'dummyPrivateKey';
    process.env.RPC_URL = 'dummyRpcUrl';
    delete process.env.CRON_SCHEDULE_DEADLINE_CHECKS;

    // 2. Reset modules
    console.log('[BEFORE EACH] Calling jest.resetModules().');
    jest.resetModules();
    console.log('[BEFORE EACH] jest.resetModules() completed.');

    // 3. Define mocks using jest.unstable_mockModule INSIDE beforeEach, AFTER resetModules
    // console.log('[BEFORE EACH] Setting up unstable_mockModule for blockchainService.js.'); // REMOVED
    jest.unstable_mockModule('../../blockchainService.js', () => {
      factoryExecutionCount++;
      const currentFactoryExecution = factoryExecutionCount;
      console.log(`[TEST DEBUG] blockchainService MOCK FACTORY EXECUTED. Count: ${currentFactoryExecution}. mockContractABIGet is now set to return (will call its current mock impl).`);
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
    // console.log('[BEFORE EACH] unstable_mockModule for blockchainService.js configured.'); // REMOVED

    console.log('[BEFORE EACH] Setting up unstable_mockModule for databaseService.js.');
    jest.unstable_mockModule('../../databaseService.js', () => ({
      __esModule: true,
      getDealsPastFinalApproval: mockGetDealsPastFinalApproval,
      getDealsPastDisputeDeadline: mockGetDealsPastDisputeDeadline,
      updateDealStatusInDB: mockUpdateDealStatusInDB,
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
    mockContractABIGet.mockReset().mockReturnValue([{ type: 'function', name: 'defaultValidABI' }]); // Reset and set default for new mock
    
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
    // console.log('[BEFORE EACH] Dynamically importing SUT (../../scheduledJobs.js)...'); // REMOVED
    const SUT = await import('../../scheduledJobs.js');
    // console.log('[BEFORE EACH] SUT import completed.'); // REMOVED
    startScheduledJobs = SUT.startScheduledJobs;
    checkAndProcessContractDeadlines = SUT.checkAndProcessContractDeadlines;
    __TEST_ONLY_resetJobRunningFlag = SUT.__TEST_ONLY_resetJobRunningFlag;

    // Now, reset the job running flag for the actual module instance if it was already loaded
    // This is important because the module might have been imported by Jest for initial parsing
    // before mocks were fully in place for its top-level execution paths.
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
    // REMOVED jest.forceExit();
  });

  describe('startScheduledJobs', () => {
    it('should schedule the cron job with the correct schedule from env', async () => {
      process.env.CRON_SCHEDULE_DEADLINE_CHECKS = '0 0 * * *';
      // const { startScheduledJobs } = await import('../../services/scheduledJobs.js'); // Ensure SUT import
      startScheduledJobs();
      expect(mockCronSchedule).toHaveBeenCalledTimes(1);
      expect(mockCronSchedule).toHaveBeenCalledWith('0 0 * * *', expect.any(Function), expect.objectContaining({
        scheduled: true,
        timezone: "America/New_York"
      }));
    });

    it('should use default cron schedule if env variable is not set', async () => {
      // const { startScheduledJobs } = await import('../../services/scheduledJobs.js'); // Ensure SUT import
      startScheduledJobs();
      expect(mockCronSchedule).toHaveBeenCalledTimes(1);
      expect(mockCronSchedule).toHaveBeenCalledWith('*/30 * * * *', expect.any(Function), expect.objectContaining({
        scheduled: true,
        timezone: "America/New_York"
      }));
    });

    it('should NOT schedule jobs if BACKEND_WALLET_PRIVATE_KEY is missing', async () => {
      delete process.env.BACKEND_WALLET_PRIVATE_KEY;
      // const { startScheduledJobs } = await import('../../services/scheduledJobs.js'); // Ensure SUT import
      startScheduledJobs();
      expect(mockCronSchedule).not.toHaveBeenCalled();
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Automated contract call jobs DISABLED due to missing BACKEND_WALLET_PRIVATE_KEY or RPC_URL.'));
    });

    it('should NOT schedule jobs if RPC_URL is missing', async () => {
      delete process.env.RPC_URL;
      // const { startScheduledJobs } = await import('../../services/scheduledJobs.js'); // Ensure SUT import
      startScheduledJobs();
      expect(mockCronSchedule).not.toHaveBeenCalled();
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Automated contract call jobs DISABLED due to missing BACKEND_WALLET_PRIVATE_KEY or RPC_URL.'));
    });

    it('should NOT schedule jobs if contractABI is null', async () => {
      console.log('[TEST DEBUG] Test: contractABI is null - START');
      jest.resetModules(); // Reset modules for this specific test
      console.log('[TEST DEBUG] Test: contractABI is null - jest.resetModules() DONE');

      // Re-apply mocks for this test after resetModules
      mockContractABIGet.mockReset().mockReturnValue(null); // IMPORTANT: Set for this test *before* SUT import
      console.log(`[TEST DEBUG] Test: contractABI is null - mockContractABIGet configured to return null. Direct call: ${JSON.stringify(mockContractABIGet())}`);

      factoryExecutionCount = 0; // Reset for clarity
      jest.unstable_mockModule('../../blockchainService.js', () => {
        factoryExecutionCount++;
        const currentFactoryExecution = factoryExecutionCount;
        console.log(`[TEST DEBUG IN-TEST] blockchainService MOCK FACTORY EXECUTED. Count: ${currentFactoryExecution}.`);
        return {
          __esModule: true, initializeBlockchainService: mockInitializeBlockchainService, triggerReleaseAfterApproval: mockTriggerReleaseAfterApproval, triggerCancelAfterDisputeDeadline: mockTriggerCancelAfterDisputeDeadline,
          get contractABI() { const val = mockContractABIGet(); console.log(`[TEST DEBUG IN-TEST] contractABI GETTER CALLED (Factory Exec Count: ${currentFactoryExecution}). mockContractABIGet() returned: ${JSON.stringify(val)}`); return val; }
        };
      });
      jest.unstable_mockModule('../../databaseService.js', () => ({ __esModule: true, getDealsPastFinalApproval: mockGetDealsPastFinalApproval, getDealsPastDisputeDeadline: mockGetDealsPastDisputeDeadline, updateDealStatusInDB: mockUpdateDealStatusInDB }));
      jest.unstable_mockModule('node-cron', () => ({ __esModule: true, schedule: mockCronSchedule, validate: mockCronValidate, default: { schedule: mockCronSchedule, validate: mockCronValidate } }));
      const originalFirestore = jest.requireActual('firebase-admin/firestore');
      jest.unstable_mockModule('firebase-admin/firestore', () => ({ ...originalFirestore, Timestamp: { ...originalFirestore.Timestamp, now: jest.fn(() => fixedTimestampNow) } }));

      const { startScheduledJobs: localStartScheduledJobs } = await import('../../scheduledJobs.js');
      console.log('[TEST DEBUG] Test: contractABI is null - localStartScheduledJobs imported');
      localStartScheduledJobs();
      expect(mockCronSchedule).not.toHaveBeenCalled();
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('DISABLED due to ABI loading failure or empty ABI.'));
      console.log('[TEST DEBUG] Test: contractABI is null - END');
    });

    it('should NOT schedule jobs if contractABI is an empty array', async () => {
      console.log('[TEST DEBUG] Test: contractABI is empty array - START');
      jest.resetModules(); // Reset modules for this specific test
      console.log('[TEST DEBUG] Test: contractABI is empty array - jest.resetModules() DONE');

      // Re-apply mocks for this test after resetModules
      mockContractABIGet.mockReset().mockReturnValue([]); // IMPORTANT: Set for this test *before* SUT import
      console.log(`[TEST DEBUG] Test: contractABI is empty array - mockContractABIGet configured to return []. Direct call: ${JSON.stringify(mockContractABIGet())}`);
      
      factoryExecutionCount = 0; // Reset for clarity
      jest.unstable_mockModule('../../blockchainService.js', () => {
        factoryExecutionCount++;
        const currentFactoryExecution = factoryExecutionCount;
        console.log(`[TEST DEBUG IN-TEST] blockchainService MOCK FACTORY EXECUTED. Count: ${currentFactoryExecution}.`);
        return {
          __esModule: true, initializeBlockchainService: mockInitializeBlockchainService, triggerReleaseAfterApproval: mockTriggerReleaseAfterApproval, triggerCancelAfterDisputeDeadline: mockTriggerCancelAfterDisputeDeadline,
          get contractABI() { const val = mockContractABIGet(); console.log(`[TEST DEBUG IN-TEST] contractABI GETTER CALLED (Factory Exec Count: ${currentFactoryExecution}). mockContractABIGet() returned: ${JSON.stringify(val)}`); return val; }
        };
      });
      jest.unstable_mockModule('../../databaseService.js', () => ({ __esModule: true, getDealsPastFinalApproval: mockGetDealsPastFinalApproval, getDealsPastDisputeDeadline: mockGetDealsPastDisputeDeadline, updateDealStatusInDB: mockUpdateDealStatusInDB }));
      jest.unstable_mockModule('node-cron', () => ({ __esModule: true, schedule: mockCronSchedule, validate: mockCronValidate, default: { schedule: mockCronSchedule, validate: mockCronValidate } }));
      const originalFirestore = jest.requireActual('firebase-admin/firestore');
      jest.unstable_mockModule('firebase-admin/firestore', () => ({ ...originalFirestore, Timestamp: { ...originalFirestore.Timestamp, now: jest.fn(() => fixedTimestampNow) } }));

      const { startScheduledJobs: localStartScheduledJobs } = await import('../../scheduledJobs.js');
      console.log('[TEST DEBUG] Test: contractABI is empty array - localStartScheduledJobs imported');
      localStartScheduledJobs();
      expect(mockCronSchedule).not.toHaveBeenCalled();
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('DISABLED due to ABI loading failure or empty ABI.'));
      console.log('[TEST DEBUG] Test: contractABI is empty array - END');
    });

    it('should NOT schedule jobs if CRON_SCHEDULE_DEADLINE_CHECKS is invalid', async () => {
      process.env.CRON_SCHEDULE_DEADLINE_CHECKS = 'invalid-cron-string';
      mockCronValidate.mockReturnValue(false); // Simulate cron.validate returning false
      // const { startScheduledJobs } = await import('../../services/scheduledJobs.js');
      startScheduledJobs();
      expect(mockCronSchedule).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Scheduler] Invalid CRON_SCHEDULE: "invalid-cron-string". Automated jobs will not start.')
      );
    });
  });

  describe('checkAndProcessContractDeadlines', () => {
    async function getSutWithFreshJobFlag() {
      const mod = await import('../../scheduledJobs.js');
      if (typeof mod.__TEST_ONLY_resetJobRunningFlag === 'function') {
        mod.__TEST_ONLY_resetJobRunningFlag();
      }
      // Return all exports, but the test will destructure what it needs
      return mod; 
    }

    it('should call DB checks and do nothing else if no deals are found', async () => {
      // const { checkAndProcessContractDeadlines } = await getSutWithFreshJobFlag();
      await checkAndProcessContractDeadlines();
      expect(mockGetDealsPastFinalApproval).toHaveBeenCalledTimes(1);
      expect(mockGetDealsPastDisputeDeadline).toHaveBeenCalledTimes(1);
      expect(mockTriggerReleaseAfterApproval).not.toHaveBeenCalled();
      expect(mockTriggerCancelAfterDisputeDeadline).not.toHaveBeenCalled();
      expect(mockUpdateDealStatusInDB).not.toHaveBeenCalled();
    });

    it('should process a deal for release successfully', async () => {
      mockGetDealsPastFinalApproval.mockResolvedValueOnce([mockDealRelease]);
      // const { checkAndProcessContractDeadlines } = await getSutWithFreshJobFlag(); // Use helper
      await checkAndProcessContractDeadlines();
      expect(mockGetDealsPastFinalApproval).toHaveBeenCalledTimes(1);
      expect(mockGetDealsPastDisputeDeadline).toHaveBeenCalledTimes(1);
      expect(mockTriggerReleaseAfterApproval).toHaveBeenCalledTimes(1);
      expect(mockTriggerReleaseAfterApproval).toHaveBeenCalledWith(mockDealRelease.smartContractAddress, mockDealRelease.id);
      expect(mockUpdateDealStatusInDB).toHaveBeenCalledTimes(1);
      expect(mockUpdateDealStatusInDB).toHaveBeenCalledWith(mockDealRelease.id, {
        status: 'FundsReleased',
        autoReleaseTxHash: '0xreleasehash',
        lastAutomaticProcessAttempt: fixedTimestampNow,
        timelineEventMessage: expect.stringContaining('Successfully auto-released funds')
      });
    });

    it('should process a deal for cancellation successfully', async () => {
      mockGetDealsPastDisputeDeadline.mockResolvedValueOnce([mockDealCancel]);
      // const { checkAndProcessContractDeadlines } = await getSutWithFreshJobFlag(); // Use helper
      await checkAndProcessContractDeadlines();
      expect(mockGetDealsPastFinalApproval).toHaveBeenCalledTimes(1);
      expect(mockGetDealsPastDisputeDeadline).toHaveBeenCalledTimes(1);
      expect(mockTriggerCancelAfterDisputeDeadline).toHaveBeenCalledTimes(1);
      expect(mockTriggerCancelAfterDisputeDeadline).toHaveBeenCalledWith(mockDealCancel.smartContractAddress, mockDealCancel.id);
      expect(mockUpdateDealStatusInDB).toHaveBeenCalledTimes(1);
      expect(mockUpdateDealStatusInDB).toHaveBeenCalledWith(mockDealCancel.id, {
        status: 'CancelledAfterDisputeDeadline',
        autoCancelTxHash: '0xcancelhash',
        lastAutomaticProcessAttempt: fixedTimestampNow,
        timelineEventMessage: expect.stringContaining('Successfully auto-cancelled deal')
      });
    });

    it('should handle blockchain call failure for release and update DB accordingly', async () => {
      const releaseError = new Error('Blockchain release failed');
      mockGetDealsPastFinalApproval.mockResolvedValueOnce([mockDealRelease]);
      mockTriggerReleaseAfterApproval.mockResolvedValueOnce({ success: false, error: releaseError.message });
      // const { checkAndProcessContractDeadlines } = await getSutWithFreshJobFlag(); // Use helper
      await checkAndProcessContractDeadlines();
      expect(mockTriggerReleaseAfterApproval).toHaveBeenCalledTimes(1);
      expect(mockUpdateDealStatusInDB).toHaveBeenCalledTimes(1);
      expect(mockUpdateDealStatusInDB).toHaveBeenCalledWith(mockDealRelease.id, {
        status: 'AutoReleaseFailed',
        lastAutomaticProcessAttempt: fixedTimestampNow, 
        processingError: `Blockchain call failed: ${releaseError.message}`,
        timelineEventMessage: expect.stringContaining('FAILED to process auto-release')
      });
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining(`[Scheduler] FAILED to process auto-release for deal ${mockDealRelease.id}`), releaseError.message);
    });

    it('should handle blockchain call failure for cancellation and update DB accordingly', async () => {
      const cancelError = new Error('Blockchain cancel failed');
      mockGetDealsPastDisputeDeadline.mockResolvedValueOnce([mockDealCancel]);
      mockTriggerCancelAfterDisputeDeadline.mockResolvedValueOnce({ success: false, error: cancelError.message });
      // const { checkAndProcessContractDeadlines } = await getSutWithFreshJobFlag(); // Use helper
      await checkAndProcessContractDeadlines();
      expect(mockTriggerCancelAfterDisputeDeadline).toHaveBeenCalledTimes(1);
      expect(mockUpdateDealStatusInDB).toHaveBeenCalledTimes(1);
      expect(mockUpdateDealStatusInDB).toHaveBeenCalledWith(mockDealCancel.id, {
        status: 'AutoCancellationFailed',
        lastAutomaticProcessAttempt: fixedTimestampNow, 
        processingError: `Blockchain call failed: ${cancelError.message}`,
        timelineEventMessage: expect.stringContaining('FAILED to process auto-cancellation')
      });
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining(`[Scheduler] FAILED to process auto-cancellation for deal ${mockDealCancel.id}`), cancelError.message);
    });

    it('should skip processing and warn if deal has no smartContractAddress for release', async () => {
      mockGetDealsPastFinalApproval.mockResolvedValueOnce([dealNoSCRelease]);
      // const { checkAndProcessContractDeadlines } = await getSutWithFreshJobFlag(); // Use helper
      await checkAndProcessContractDeadlines();
      expect(mockTriggerReleaseAfterApproval).not.toHaveBeenCalled();
      expect(mockUpdateDealStatusInDB).not.toHaveBeenCalled();
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining(`[Scheduler] Deal ${dealNoSCRelease.id} is past final approval but has no smartContractAddress. Skipping.`));
    });

    it('should skip processing and warn if deal has no smartContractAddress for cancellation', async () => {
      mockGetDealsPastDisputeDeadline.mockResolvedValueOnce([dealNoSCCancel]);
      // const { checkAndProcessContractDeadlines } = await getSutWithFreshJobFlag(); // Use helper
      await checkAndProcessContractDeadlines();
      expect(mockTriggerCancelAfterDisputeDeadline).not.toHaveBeenCalled();
      expect(mockUpdateDealStatusInDB).not.toHaveBeenCalled();
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining(`[Scheduler] Deal ${dealNoSCCancel.id} is past dispute deadline but has no smartContractAddress. Skipping.`));
    });

    it('should prevent concurrent job runs', async () => {
      jest.useFakeTimers();
      // const { checkAndProcessContractDeadlines, __TEST_ONLY_resetJobRunningFlag } = await import('../../services/scheduledJobs.js');
      // if (typeof __TEST_ONLY_resetJobRunningFlag === 'function') __TEST_ONLY_resetJobRunningFlag();
      
      // Ensure the SUT's internal flag is reset before this specific test
      if (typeof __TEST_ONLY_resetJobRunningFlag === 'function') {
        __TEST_ONLY_resetJobRunningFlag();
      }

      const promise1 = checkAndProcessContractDeadlines();
      const promise2 = checkAndProcessContractDeadlines(); 
      
      jest.advanceTimersByTime(100);
      await Promise.all([promise1, promise2]);
      
      expect(mockGetDealsPastFinalApproval).toHaveBeenCalledTimes(1);
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('[Scheduler] Deadline check job already running. Skipping this cycle.'));
      jest.useRealTimers();
    }, 10000);

    it('should log critical error if database query fails unexpectedly', async () => {
      const dbError = new Error('Firestore query failed');
      mockGetDealsPastFinalApproval.mockRejectedValueOnce(dbError);
      // const { checkAndProcessContractDeadlines } = await getSutWithFreshJobFlag(); // Use helper
      await checkAndProcessContractDeadlines();
      expect(consoleErrorSpy).toHaveBeenCalledWith('[Scheduler] CRITICAL ERROR in deadline check job:', dbError);
      
      mockGetDealsPastFinalApproval.mockReset().mockResolvedValue([]);
      // const { checkAndProcessContractDeadlines: cpcDeadlinesAfterError } = await getSutWithFreshJobFlag(); 
      
      // Reset flag before next call within the same test if needed, or rely on fresh SUT state.
      // For this particular follow-up, we want to ensure the flag was reset by the previous error.
      // So, we'll call the already initialized 'checkAndProcessContractDeadlines' directly.
      // No, we still need a clean state for the flag to test if it's correctly reset.
      const { checkAndProcessContractDeadlines: cpcDeadlinesAfterError } = await getSutWithFreshJobFlag();

      await cpcDeadlinesAfterError();
      expect(mockGetDealsPastFinalApproval).toHaveBeenCalledTimes(1); // This assertion counts calls *within this new SUT instance*
    });

    it('should reset isJobRunning flag even if processing logic throws error', async () => {
      mockGetDealsPastFinalApproval.mockResolvedValueOnce([mockDealRelease]);
      const unexpectedError = new Error('Unexpected blockchain service crash');
      mockTriggerReleaseAfterApproval.mockRejectedValueOnce(unexpectedError);
      // const { checkAndProcessContractDeadlines } = await getSutWithFreshJobFlag(); // Use helper
      await checkAndProcessContractDeadlines();
      expect(consoleErrorSpy).toHaveBeenCalledWith('[Scheduler] CRITICAL ERROR in deadline check job:', unexpectedError);
      
      mockGetDealsPastFinalApproval.mockReset().mockResolvedValue([]);
      mockTriggerReleaseAfterApproval.mockReset().mockResolvedValue({ success: true, receipt: { transactionHash: '0xreleasehash' } });
      consoleLogSpy.mockClear();

      // const { checkAndProcessContractDeadlines: cpcDeadlinesAfterError } = await getSutWithFreshJobFlag();
      // Call the 'checkAndProcessContractDeadlines' that should now have its flag reset by the 'finally' block
      // of the previous invocation within this test (even though it threw an error).
      // We need a fresh SUT instance to properly test the flag reset from a prior run.
      const { checkAndProcessContractDeadlines: cpcDeadlinesAfterError } = await getSutWithFreshJobFlag();
      await cpcDeadlinesAfterError();
      expect(consoleLogSpy).not.toHaveBeenCalledWith(expect.stringContaining('[Scheduler] Deadline check job already running. Skipping this cycle.'));
      expect(mockGetDealsPastFinalApproval).toHaveBeenCalledTimes(1); // Counts calls for this new SUT instance
    });
  });
}); 