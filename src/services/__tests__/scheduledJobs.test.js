// src/jobs/__tests__/scheduledJobs.test.js
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import cron from 'node-cron';
import * as databaseService from '../../services/databaseService.js'; // Import all as a module
import * as blockchainService from '../../services/blockchainService.js'; // Import all as a module
import { startScheduledJobs, checkAndProcessContractDeadlines } from '../scheduledJobs.js'; // Function to test directly
import { Timestamp } from 'firebase-admin/firestore'; // Assuming Timestamp is used in the test

// --- Mock external dependencies ---
jest.mock('node-cron', () => ({
  schedule: jest.fn(),
  validate: jest.fn().mockReturnValue(true), // Assuming valid cron patterns
}));

jest.mock('../../services/databaseService.js', () => ({
  getDealsPastFinalApproval: jest.fn(),
  getDealsPastDisputeDeadline: jest.fn(),
  updateDealStatusInDB: jest.fn(),
}));

jest.mock('../../services/blockchainService.js', () => ({
  triggerReleaseAfterApproval: jest.fn(),
  triggerCancelAfterDisputeDeadline: jest.fn(),
  // Ensure contractABI is mocked if scheduledJobs.js directly accesses it (it doesn't in the current version)
}));

// Helper to reset all mocks
const resetAllMocks = () => {
  cron.schedule.mockClear();
  databaseService.getDealsPastFinalApproval.mockReset();
  databaseService.getDealsPastDisputeDeadline.mockReset();
  databaseService.updateDealStatusInDB.mockReset();
  blockchainService.triggerReleaseAfterApproval.mockReset();
  blockchainService.triggerCancelAfterDisputeDeadline.mockReset();
};

describe('Scheduled Jobs (scheduledJobs.js)', () => {
  let consoleLogSpy;
  let consoleErrorSpy;
  let consoleWarnSpy;

  const originalEnv = { ...process.env }; // Store original environment variables

  beforeEach(() => {
    resetAllMocks();
    // Spy on console methods to check logging output
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    // Set default mock implementations
    databaseService.getDealsPastFinalApproval.mockResolvedValue([]);
    databaseService.getDealsPastDisputeDeadline.mockResolvedValue([]);
    blockchainService.triggerReleaseAfterApproval.mockResolvedValue({ success: true, receipt: { transactionHash: '0xreleasehash' } });
    blockchainService.triggerCancelAfterDisputeDeadline.mockResolvedValue({ success: true, receipt: { transactionHash: '0xcancelhash' } });
    databaseService.updateDealStatusInDB.mockResolvedValue(undefined);

    // Ensure essential env vars are set for tests that need them for job scheduling
    process.env.BACKEND_WALLET_PRIVATE_KEY = 'test_pk';
    process.env.RPC_URL = 'test_rpc_url';
    process.env.CRON_SCHEDULE_DEADLINE_CHECKS = '*/5 * * * *'; // Test cron schedule
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    process.env = { ...originalEnv }; // Restore original environment
    jest.useRealTimers(); // Ensure real timers are used after each test if fake ones were used
  });

  describe('startScheduledJobs', () => {
    it('should schedule the cron job with the correct schedule from env', () => {
      startScheduledJobs();
      expect(cron.schedule).toHaveBeenCalledTimes(1);
      expect(cron.schedule).toHaveBeenCalledWith(
        process.env.CRON_SCHEDULE_DEADLINE_CHECKS,
        expect.any(Function), // The checkAndProcessContractDeadlines function (or a wrapper)
        expect.objectContaining({ scheduled: true })
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('[Scheduler] Automated contract deadline check job scheduled.'));
    });

    it('should use default cron schedule if env variable is not set', () => {
      delete process.env.CRON_SCHEDULE_DEADLINE_CHECKS;
      startScheduledJobs();
      expect(cron.schedule).toHaveBeenCalledWith(
        '*/30 * * * *', // Default schedule
        expect.any(Function),
        expect.anything()
      );
    });

    it('should NOT schedule jobs if BACKEND_WALLET_PRIVATE_KEY is missing', () => {
      delete process.env.BACKEND_WALLET_PRIVATE_KEY;
      startScheduledJobs();
      expect(cron.schedule).not.toHaveBeenCalled();
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Automated contract call jobs DISABLED due to missing BACKEND_WALLET_PRIVATE_KEY or RPC_URL.'));
    });

    it('should NOT schedule jobs if RPC_URL is missing', () => {
      delete process.env.RPC_URL;
      startScheduledJobs();
      expect(cron.schedule).not.toHaveBeenCalled();
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Automated contract call jobs DISABLED due to missing BACKEND_WALLET_PRIVATE_KEY or RPC_URL.'));
    });

    // If blockchainService.js directly checks for ABI and scheduledJobs.js relies on that check
    // you might need a test like this. However, current scheduledJobs.js checks ABI via blockchainService initialization.
    // it('should NOT schedule jobs if contract ABI is not loaded (simulated)', () => {
    //   // This requires a way to simulate ABI loading failure within blockchainService,
    //   // or for scheduledJobs to directly check an ABI status.
    //   // For now, this scenario is indirectly covered by blockchainService's own init checks.
    // });
  });

  describe('checkAndProcessContractDeadlines', () => {
    const mockDealRelease = {
      id: 'dealRelease001',
      status: 'IN_FINAL_APPROVAL',
      smartContractAddress: '0xContractToRelease',
      finalApprovalDeadlineBackend: Timestamp.now(), // Assuming it's past
    };
    const mockDealCancel = {
      id: 'dealCancel001',
      status: 'IN_DISPUTE',
      smartContractAddress: '0xContractToCancel',
      disputeResolutionDeadlineBackend: Timestamp.now(), // Assuming it's past
    };

    it('should do nothing if no deals are found', async () => {
      await checkAndProcessContractDeadlines();
      expect(databaseService.getDealsPastFinalApproval).toHaveBeenCalledTimes(1);
      expect(databaseService.getDealsPastDisputeDeadline).toHaveBeenCalledTimes(1);
      expect(blockchainService.triggerReleaseAfterApproval).not.toHaveBeenCalled();
      expect(blockchainService.triggerCancelAfterDisputeDeadline).not.toHaveBeenCalled();
    });

    it('should process a deal for release successfully', async () => {
      databaseService.getDealsPastFinalApproval.mockResolvedValue([mockDealRelease]);

      await checkAndProcessContractDeadlines();

      expect(blockchainService.triggerReleaseAfterApproval).toHaveBeenCalledWith(mockDealRelease.smartContractAddress, mockDealRelease.id);
      expect(databaseService.updateDealStatusInDB).toHaveBeenCalledWith(
        mockDealRelease.id,
        'COMPLETED',
        expect.stringContaining('Funds automatically released'),
        '0xreleasehash'
      );
    });

    it('should process a deal for cancellation successfully', async () => {
      databaseService.getDealsPastDisputeDeadline.mockResolvedValue([mockDealCancel]);

      await checkAndProcessContractDeadlines();

      expect(blockchainService.triggerCancelAfterDisputeDeadline).toHaveBeenCalledWith(mockDealCancel.smartContractAddress, mockDealCancel.id);
      expect(databaseService.updateDealStatusInDB).toHaveBeenCalledWith(
        mockDealCancel.id,
        'CANCELLED',
        expect.stringContaining('Escrow automatically cancelled'),
        '0xcancelhash'
      );
    });

    it('should handle blockchain call failure for release and update DB accordingly', async () => {
      databaseService.getDealsPastFinalApproval.mockResolvedValue([mockDealRelease]);
      blockchainService.triggerReleaseAfterApproval.mockResolvedValue({ success: false, error: new Error('Blockchain Error Release') });

      await checkAndProcessContractDeadlines();

      expect(blockchainService.triggerReleaseAfterApproval).toHaveBeenCalledWith(mockDealRelease.smartContractAddress, mockDealRelease.id);
      expect(databaseService.updateDealStatusInDB).toHaveBeenCalledWith(
        mockDealRelease.id,
        mockDealRelease.status, // Status should not change on failure, or to a specific error status
        expect.stringContaining('Attempted auto-release for deal dealRelease001 FAILED. Error: Blockchain Error Release'),
        // No transaction hash on failure
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('FAILED to process auto-release'), expect.any(String));
    });

    it('should handle blockchain call failure for cancellation and update DB accordingly', async () => {
      databaseService.getDealsPastDisputeDeadline.mockResolvedValue([mockDealCancel]);
      blockchainService.triggerCancelAfterDisputeDeadline.mockResolvedValue({ success: false, error: new Error('Blockchain Error Cancel') });

      await checkAndProcessContractDeadlines();

      expect(blockchainService.triggerCancelAfterDisputeDeadline).toHaveBeenCalledWith(mockDealCancel.smartContractAddress, mockDealCancel.id);
      expect(databaseService.updateDealStatusInDB).toHaveBeenCalledWith(
        mockDealCancel.id,
        mockDealCancel.status,
        expect.stringContaining('Attempted auto-cancellation for deal dealCancel001 FAILED. Error: Blockchain Error Cancel')
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('FAILED to process auto-cancellation'), expect.any(String));
    });

    it('should skip processing if deal has no smartContractAddress for release', async () => {
      const dealNoSC = { ...mockDealRelease, smartContractAddress: null };
      databaseService.getDealsPastFinalApproval.mockResolvedValue([dealNoSC]);

      await checkAndProcessContractDeadlines();

      expect(blockchainService.triggerReleaseAfterApproval).not.toHaveBeenCalled();
      expect(databaseService.updateDealStatusInDB).not.toHaveBeenCalledWith(dealNoSC.id, 'COMPLETED', expect.anything());
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining(`Deal ${dealNoSC.id} is past final approval but has no smartContractAddress.`));
    });

    it('should skip processing if deal has no smartContractAddress for cancellation', async () => {
      const dealNoSC = { ...mockDealCancel, smartContractAddress: undefined };
      databaseService.getDealsPastDisputeDeadline.mockResolvedValue([dealNoSC]);

      await checkAndProcessContractDeadlines();

      expect(blockchainService.triggerCancelAfterDisputeDeadline).not.toHaveBeenCalled();
      expect(databaseService.updateDealStatusInDB).not.toHaveBeenCalledWith(dealNoSC.id, 'CANCELLED', expect.anything());
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining(`Deal ${dealNoSC.id} is past dispute deadline but has no smartContractAddress.`));
    });

    it('should prevent concurrent job runs', async () => {
      // Simulate job is already running
      // This requires checkAndProcessContractDeadlines to be exported or a way to set isJobRunning
      // For this test, we'll call it twice quickly. The internal lock should prevent the second full execution.
      databaseService.getDealsPastFinalApproval.mockImplementation(async () => {
        // Simulate a long running job
        await new Promise(resolve => setTimeout(resolve, 50));
        return [];
      });

      const promise1 = checkAndProcessContractDeadlines();
      const promise2 = checkAndProcessContractDeadlines(); // This should hit the lock

      await Promise.all([promise1, promise2]);

      // getDealsPastFinalApproval should only be called once by the first invocation
      expect(databaseService.getDealsPastFinalApproval).toHaveBeenCalledTimes(1);
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Deadline check job already running. Skipping this cycle.'));
    });

    it('should log critical error if database query fails unexpectedly', async () => {
        const dbError = new Error('Firestore query failed');
        databaseService.getDealsPastFinalApproval.mockRejectedValue(dbError);
        // No need to mock getDealsPastDisputeDeadline if the first one throws and stops execution

        await checkAndProcessContractDeadlines();

        expect(consoleErrorSpy).toHaveBeenCalledWith('[Scheduler] CRITICAL ERROR in deadline check job:', dbError);
    });
  });
});
