// src/jobs/__tests__/scheduledJobs.test.js
import { jest, describe, it, expect, beforeEach, afterEach, beforeAll } from '@jest/globals';
import { Timestamp } from 'firebase-admin/firestore';

// --- Mock external dependencies ---

// Mock node-cron
const mockCronSchedule = jest.fn(() => ({ start: jest.fn(), stop: jest.fn() }));
const mockCronValidate = jest.fn().mockReturnValue(true);
jest.mock('node-cron', () => ({
  __esModule: true,
  schedule: mockCronSchedule,
  validate: mockCronValidate,
  default: {
    schedule: mockCronSchedule,
    validate: mockCronValidate,
  }
}));


// Mock databaseService functions
const mockGetDealsPastFinalApproval = jest.fn();
const mockGetDealsPastDisputeDeadline = jest.fn();
const mockUpdateDealStatusInDB = jest.fn();
jest.mock('../../services/databaseService.js', () => ({
  __esModule: true,
  getDealsPastFinalApproval: mockGetDealsPastFinalApproval,
  getDealsPastDisputeDeadline: mockGetDealsPastDisputeDeadline,
  updateDealStatusInDB: mockUpdateDealStatusInDB,
}));

// Mock blockchainService functions and ABI
const mockTriggerReleaseAfterApproval = jest.fn();
const mockTriggerCancelAfterDisputeDeadline = jest.fn();
let mockContractABI = [{ type: 'function', name: 'dummyFunctionForTest' }]; // Default mock ABI
jest.mock('../../services/blockchainService.js', () => ({
  __esModule: true,
  triggerReleaseAfterApproval: mockTriggerReleaseAfterApproval,
  triggerCancelAfterDisputeDeadline: mockTriggerCancelAfterDisputeDeadline,
  get contractABI() { return mockContractABI; },
}));

// --- Test Suite ---
describe('Scheduled Jobs (scheduledJobs.js)', () => {
  let originalEnv;
  let consoleLogSpy, consoleErrorSpy, consoleWarnSpy;

  // Variables to hold the functions/variables from the module under test
  // Note: scheduledJobsModule is not strictly needed anymore as we don't call the test reset fn
  let startScheduledJobs;
  let checkAndProcessContractDeadlines;

  beforeAll(() => {
    originalEnv = { ...process.env };
    // Ensure NODE_ENV is set to 'test' for the finally block logic in scheduledJobs.js
    process.env.NODE_ENV = 'test';
  });

  beforeEach(async () => {
    // Set default environment variables *before* resetting modules
    process.env.BACKEND_WALLET_PRIVATE_KEY = 'test_pk_for_scheduler';
    process.env.RPC_URL = 'test_rpc_url_for_scheduler';
    process.env.CRON_SCHEDULE_DEADLINE_CHECKS = '*/5 * * * *';

    // 1. Reset Jest modules
    jest.resetModules();

    // 2. Reset mock ABI to default
    mockContractABI = [{ type: 'function', name: 'dummyFunctionForTest' }];

    // 3. Re-import the module under test
    // We need to re-import to get the functions with potentially reset internal state
    const scheduledJobsModule = await import('../scheduledJobs.js');
    startScheduledJobs = scheduledJobsModule.startScheduledJobs;
    checkAndProcessContractDeadlines = scheduledJobsModule.checkAndProcessContractDeadlines;

    // 4. Clear call history and specific implementations from ALL mocks
    jest.clearAllMocks();

    // 5. Set default mock implementations for services AFTER clearing mocks
    mockGetDealsPastFinalApproval.mockResolvedValue([]);
    mockGetDealsPastDisputeDeadline.mockResolvedValue([]);
    mockTriggerReleaseAfterApproval.mockResolvedValue({ success: true, receipt: { transactionHash: '0xreleasehash' } });
    mockTriggerCancelAfterDisputeDeadline.mockResolvedValue({ success: true, receipt: { transactionHash: '0xcancelhash' } });
    mockUpdateDealStatusInDB.mockResolvedValue(undefined);
    mockCronSchedule.mockImplementation(() => ({ start: jest.fn(), stop: jest.fn() }));
    mockCronValidate.mockReturnValue(true);

    // 6. Spy on console methods
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    // 7. Removed explicit flag reset - now handled internally in the finally block of checkAndProcessContractDeadlines
  });

  afterEach(() => {
    // Restore original environment variables (except NODE_ENV)
    const nodeEnv = process.env.NODE_ENV;
    process.env = { ...originalEnv };
    process.env.NODE_ENV = nodeEnv; // Keep NODE_ENV as 'test'

    // Restore console spies and clear mocks
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  // --- Tests for startScheduledJobs ---
  describe('startScheduledJobs', () => {
     it('should schedule the cron job with the correct schedule from env', () => {
      startScheduledJobs();
      expect(mockCronSchedule).toHaveBeenCalledTimes(1);
      expect(mockCronSchedule).toHaveBeenCalledWith(
        '*/5 * * * *',
        checkAndProcessContractDeadlines,
        expect.objectContaining({ scheduled: true, timezone: "America/New_York" })
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('[Scheduler] Initializing cron job with schedule: "*/5 * * * *"'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('[Scheduler] Automated contract deadline check job scheduled.'));
    });

    it('should use default cron schedule if env variable is not set', () => {
      delete process.env.CRON_SCHEDULE_DEADLINE_CHECKS;
      startScheduledJobs();
      expect(mockCronSchedule).toHaveBeenCalledTimes(1);
      expect(mockCronSchedule).toHaveBeenCalledWith(
        '*/30 * * * *',
        checkAndProcessContractDeadlines,
        expect.objectContaining({ scheduled: true, timezone: "America/New_York" })
      );
       expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('[Scheduler] Initializing cron job with schedule: "*/30 * * * *"'));
    });

    it('should NOT schedule jobs if BACKEND_WALLET_PRIVATE_KEY is missing', () => {
      delete process.env.BACKEND_WALLET_PRIVATE_KEY;
      startScheduledJobs();
      expect(mockCronSchedule).not.toHaveBeenCalled();
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Automated contract call jobs DISABLED due to missing BACKEND_WALLET_PRIVATE_KEY or RPC_URL.'));
    });

    it('should NOT schedule jobs if RPC_URL is missing', () => {
      delete process.env.RPC_URL;
      startScheduledJobs();
      expect(mockCronSchedule).not.toHaveBeenCalled();
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Automated contract call jobs DISABLED due to missing BACKEND_WALLET_PRIVATE_KEY or RPC_URL.'));
    });

    // --- Reinstate local reset for this specific test ---
    it('should NOT schedule jobs if contractABI is effectively null/undefined', async () => {
        // Set necessary env vars first
        process.env.BACKEND_WALLET_PRIVATE_KEY = 'test_pk_for_scheduler';
        process.env.RPC_URL = 'test_rpc_url_for_scheduler';

        // Reset modules AFTER setting env vars
        jest.resetModules();

        // Modify the mock ABI value *before* importing the module under test again
        mockContractABI = null;

        // Re-import the necessary parts after modifying the mock
        const { startScheduledJobs: localStart } = await import('../scheduledJobs.js');
        // Re-setup console spy locally
        const localConsoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

        // Clear the cron mock specifically for this test run BEFORE calling the function
        mockCronSchedule.mockClear();

        // Execute
        localStart();

        // Assert
        expect(mockCronSchedule).not.toHaveBeenCalled(); // Check calls *after* mockClear
        expect(localConsoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Automated contract call jobs DISABLED due to ABI loading failure.'));

        // Teardown
        mockContractABI = [{ type: 'function', name: 'dummyFunctionForTest' }]; // Reset ABI for other tests
        localConsoleWarnSpy.mockRestore();
    });
    // --- End Reinstate local reset ---
  });

  // --- Tests for checkAndProcessContractDeadlines ---
  // These tests should now work correctly as the flag is reset internally
  describe('checkAndProcessContractDeadlines', () => {
    // Mock data for deals
    const mockDealRelease = {
      id: 'dealRelease001',
      status: 'IN_FINAL_APPROVAL',
      smartContractAddress: '0xContractToRelease',
      finalApprovalDeadlineBackend: Timestamp.fromDate(new Date(Date.now() - 1000)), // Past deadline
    };
    const mockDealCancel = {
      id: 'dealCancel001',
      status: 'IN_DISPUTE',
      smartContractAddress: '0xContractToCancel',
      disputeResolutionDeadlineBackend: Timestamp.fromDate(new Date(Date.now() - 1000)), // Past deadline
    };

    it('should call DB checks and do nothing else if no deals are found', async () => {
      await checkAndProcessContractDeadlines();
      expect(mockGetDealsPastFinalApproval).toHaveBeenCalledTimes(1);
      expect(mockGetDealsPastDisputeDeadline).toHaveBeenCalledTimes(1);
      expect(mockTriggerReleaseAfterApproval).not.toHaveBeenCalled();
      expect(mockTriggerCancelAfterDisputeDeadline).not.toHaveBeenCalled();
      expect(mockUpdateDealStatusInDB).not.toHaveBeenCalled();
    });

    it('should process a deal for release successfully', async () => {
      mockGetDealsPastFinalApproval.mockResolvedValue([mockDealRelease]);
      await checkAndProcessContractDeadlines();
      expect(mockTriggerReleaseAfterApproval).toHaveBeenCalledTimes(1);
      expect(mockTriggerReleaseAfterApproval).toHaveBeenCalledWith(mockDealRelease.smartContractAddress, mockDealRelease.id);
      expect(mockUpdateDealStatusInDB).toHaveBeenCalledTimes(1);
      expect(mockUpdateDealStatusInDB).toHaveBeenCalledWith(
        mockDealRelease.id,
        'COMPLETED',
        expect.stringContaining('Funds automatically released'),
        '0xreleasehash'
      );
      expect(mockTriggerCancelAfterDisputeDeadline).not.toHaveBeenCalled();
    });

    it('should process a deal for cancellation successfully', async () => {
      mockGetDealsPastDisputeDeadline.mockResolvedValue([mockDealCancel]);
      await checkAndProcessContractDeadlines();
      expect(mockTriggerCancelAfterDisputeDeadline).toHaveBeenCalledTimes(1);
      expect(mockTriggerCancelAfterDisputeDeadline).toHaveBeenCalledWith(mockDealCancel.smartContractAddress, mockDealCancel.id);
      expect(mockUpdateDealStatusInDB).toHaveBeenCalledTimes(1);
      expect(mockUpdateDealStatusInDB).toHaveBeenCalledWith(
        mockDealCancel.id,
        'CANCELLED',
        expect.stringContaining('Escrow automatically cancelled'),
        '0xcancelhash'
      );
      expect(mockTriggerReleaseAfterApproval).not.toHaveBeenCalled();
    });

    it('should handle blockchain call failure for release and update DB accordingly', async () => {
      mockGetDealsPastFinalApproval.mockResolvedValue([mockDealRelease]);
      const releaseError = new Error('Blockchain Error Release');
      mockTriggerReleaseAfterApproval.mockResolvedValue({ success: false, error: releaseError });
      await checkAndProcessContractDeadlines();
      expect(mockTriggerReleaseAfterApproval).toHaveBeenCalledTimes(1);
      expect(mockTriggerReleaseAfterApproval).toHaveBeenCalledWith(mockDealRelease.smartContractAddress, mockDealRelease.id);
      expect(mockUpdateDealStatusInDB).toHaveBeenCalledTimes(1);
      expect(mockUpdateDealStatusInDB).toHaveBeenCalledWith(
        mockDealRelease.id,
        mockDealRelease.status,
        expect.stringContaining(`Attempted auto-release for deal ${mockDealRelease.id} FAILED. Error: ${releaseError.message}`),
        null
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining(`FAILED to process auto-release for deal ${mockDealRelease.id}`), releaseError.message);
    });

    it('should handle blockchain call failure for cancellation and update DB accordingly', async () => {
      mockGetDealsPastDisputeDeadline.mockResolvedValue([mockDealCancel]);
      const cancelError = new Error('Blockchain Error Cancel');
      mockTriggerCancelAfterDisputeDeadline.mockResolvedValue({ success: false, error: cancelError });
      await checkAndProcessContractDeadlines();
      expect(mockTriggerCancelAfterDisputeDeadline).toHaveBeenCalledTimes(1);
      expect(mockTriggerCancelAfterDisputeDeadline).toHaveBeenCalledWith(mockDealCancel.smartContractAddress, mockDealCancel.id);
      expect(mockUpdateDealStatusInDB).toHaveBeenCalledTimes(1);
      expect(mockUpdateDealStatusInDB).toHaveBeenCalledWith(
        mockDealCancel.id,
        mockDealCancel.status,
        expect.stringContaining(`Attempted auto-cancellation for deal ${mockDealCancel.id} FAILED. Error: ${cancelError.message}`),
        null
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining(`FAILED to process auto-cancellation for deal ${mockDealCancel.id}`), cancelError.message);
    });

    it('should skip processing and warn if deal has no smartContractAddress for release', async () => {
      const dealNoSC = { ...mockDealRelease, smartContractAddress: null };
      mockGetDealsPastFinalApproval.mockResolvedValue([dealNoSC]);
      await checkAndProcessContractDeadlines();
      expect(mockTriggerReleaseAfterApproval).not.toHaveBeenCalled();
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining(`Deal ${dealNoSC.id} is past final approval but has no smartContractAddress.`));
      expect(mockUpdateDealStatusInDB).not.toHaveBeenCalled();
    });

    it('should skip processing and warn if deal has no smartContractAddress for cancellation', async () => {
      const dealNoSC = { ...mockDealCancel, smartContractAddress: undefined };
      mockGetDealsPastDisputeDeadline.mockResolvedValue([dealNoSC]);
      await checkAndProcessContractDeadlines();
      expect(mockTriggerCancelAfterDisputeDeadline).not.toHaveBeenCalled();
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining(`Deal ${dealNoSC.id} is past dispute deadline but has no smartContractAddress.`));
      expect(mockUpdateDealStatusInDB).not.toHaveBeenCalled();
    });

    it('should prevent concurrent job runs', async () => {
      // This test relies on the internal flag logic and the finally block reset
      mockGetDealsPastFinalApproval.mockImplementationOnce(async () => {
        // We can no longer easily check the internal flag here, but the logic depends on it
        await new Promise(resolve => setTimeout(resolve, 50));
        return [mockDealRelease];
      });
      mockTriggerReleaseAfterApproval.mockResolvedValue({ success: true, receipt: {transactionHash: '0xconcurrenttx'} });

      const promise1 = checkAndProcessContractDeadlines(); // First call should run
      const promise2 = checkAndProcessContractDeadlines(); // Second call should see the flag and skip

      await Promise.allSettled([promise1, promise2]);

      expect(mockGetDealsPastFinalApproval).toHaveBeenCalledTimes(1);
      expect(mockTriggerReleaseAfterApproval).toHaveBeenCalledTimes(1);
      expect(mockUpdateDealStatusInDB).toHaveBeenCalledTimes(1);
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Deadline check job already running. Skipping this cycle.'));
    });

    it('should log critical error if database query fails unexpectedly', async () => {
      const dbError = new Error('Firestore query failed');
      mockGetDealsPastFinalApproval.mockRejectedValue(dbError);
      await checkAndProcessContractDeadlines();
      expect(consoleErrorSpy).toHaveBeenCalledWith('[Scheduler] CRITICAL ERROR in deadline check job:', dbError);
      expect(mockTriggerReleaseAfterApproval).not.toHaveBeenCalled();
      expect(mockTriggerCancelAfterDisputeDeadline).not.toHaveBeenCalled();
      // We assume the finally block reset the flag internally
    });

    it('should reset isJobRunning flag even if processing logic throws error', async () => {
        mockGetDealsPastFinalApproval.mockResolvedValue([mockDealRelease]);
        const unexpectedError = new Error('Unexpected blockchain service crash');
        mockTriggerReleaseAfterApproval.mockRejectedValue(unexpectedError);

        await checkAndProcessContractDeadlines(); // Should trigger internal finally block reset

        expect(consoleErrorSpy).toHaveBeenCalledWith('[Scheduler] CRITICAL ERROR in deadline check job:', unexpectedError);

        // Run again to ensure it doesn't skip (implicitly tests reset)
        mockGetDealsPastFinalApproval.mockResolvedValue([]);
        mockTriggerReleaseAfterApproval.mockResolvedValue({ success: true, receipt: { transactionHash: '0xreleasehash' } });
        consoleLogSpy.mockClear(); // Clear log spy for second run check

        await checkAndProcessContractDeadlines();
        expect(consoleLogSpy).not.toHaveBeenCalledWith(expect.stringContaining('Deadline check job already running.'));
    });
  });
});
