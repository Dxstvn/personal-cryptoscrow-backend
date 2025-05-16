import { jest } from '@jest/globals';
import admin from 'firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';

// Initialize Firebase Admin SDK for tests if not already initialized
if (!admin.apps.length) {
  process.env.FIRESTORE_EMULATOR_HOST = 'localhost:5004'; // Make sure this is set
  admin.initializeApp({
    projectId: 'test-project-scheduledjobs', // Use a dummy project ID for emulator
  });
}
const db = admin.firestore();

// Mock node-cron
const mockCronSchedule = jest.fn();
const mockCronValidate = jest.fn(() => true); // Assume valid cron string by default
jest.unstable_mockModule('node-cron', () => ({
  schedule: mockCronSchedule,
  validate: mockCronValidate,
  default: {
    schedule: mockCronSchedule,
    validate: mockCronValidate,
  }
}));

// Import the actual blockchainService to spy on its methods
import * as actualBlockchainService from '../../../blockchainService.js';
// Spy on the methods we expect scheduledJobs to call
const triggerReleaseSpy = jest.spyOn(actualBlockchainService, 'triggerReleaseAfterApproval');
const triggerCancelSpy = jest.spyOn(actualBlockchainService, 'triggerCancelAfterDisputeDeadline');


// Import the module to test AFTER mocks and spies are set up
// IMPORTANT: databaseService will be the REAL one, interacting with the emulator
const { checkAndProcessContractDeadlines, startScheduledJobs, __TEST_ONLY_resetJobRunningFlag } = await import('../../../scheduledJobs.js');
const { updateDealStatusInDB, getDealById } = await import('../../../databaseService.js'); // For test setup and verification

const DEALS_COLLECTION = 'deals';

// Helper function to clean up Firestore emulator before each test
const clearFirestore = async () => {
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
  await db.collection(DEALS_COLLECTION).doc(dealId).set(dealData);
  return { id: dealId, ...dealData };
};

describe('ScheduledJobs Integration Tests (with Firestore Emulator)', () => {
  let originalEnv;

  beforeAll(async () => {
    // Ensure Firestore is clear before all tests in this suite
    await clearFirestore();
  });

  beforeEach(async () => {
    jest.clearAllMocks(); // Clears spies and cron mocks
    await __TEST_ONLY_resetJobRunningFlag();
    await clearFirestore(); // Clear before each test for isolation

    originalEnv = { ...process.env };
    process.env.BACKEND_WALLET_PRIVATE_KEY = 'test_pk_for_scheduled_jobs';
    process.env.RPC_URL = 'http://localhost:8545'; // Needs to be valid for ABI loading in blockchainService if it depends on it
    process.env.CRON_SCHEDULE_DEADLINE_CHECKS = '* * * * *';
    
    // Reset spy mock implementations to default success if needed for blockchain service
    triggerReleaseSpy.mockResolvedValue({ success: true, receipt: { transactionHash: '0xsimulatedreleasehash' } });
    triggerCancelSpy.mockResolvedValue({ success: true, receipt: { transactionHash: '0xsimulatedcancelhash' } });
  });

  afterEach(async () => {
    process.env = originalEnv;
    await clearFirestore(); // Clean up after each test
  });

  describe('checkAndProcessContractDeadlines', () => {
    it('should do nothing if no deals meet criteria', async () => {
      await checkAndProcessContractDeadlines();
      // databaseService.getDealsPast... would be called, but spies are on blockchainService
      expect(triggerReleaseSpy).not.toHaveBeenCalled();
      expect(triggerCancelSpy).not.toHaveBeenCalled();
    });

    it('should process a deal past final approval', async () => {
      const dealId = 'dealPastApproval';
      const smartContractAddress = '0xContractForApproval';
      await createDealInFirestore(dealId, {
        status: 'PaymentConfirmed', // Assuming this is before release
        finalApprovalTimestamp: Timestamp.fromMillis(Date.now() - 100000), // In the past
        disputeDeadlineTimestamp: Timestamp.fromMillis(Date.now() + 86400000), // In the future
        smartContractAddress: smartContractAddress,
        sellerId: 'seller1',
        buyerId: 'buyer1',
        escrowAmount: '1',
      });

      await checkAndProcessContractDeadlines();

      expect(triggerReleaseSpy).toHaveBeenCalledWith(smartContractAddress, dealId);
      const updatedDeal = await getDealById(dealId);
      expect(updatedDeal.status).toBe('FundsReleased');
      expect(updatedDeal.autoReleaseTxHash).toBe('0xsimulatedreleasehash');
      expect(updatedDeal.lastAutomaticProcessAttempt).toBeInstanceOf(Timestamp);
    });

    it('should handle failed blockchain release for a deal past final approval', async () => {
      const dealId = 'dealFailRelease';
      const smartContractAddress = '0xContractFailRelease';
      await createDealInFirestore(dealId, {
        status: 'PaymentConfirmed',
        finalApprovalTimestamp: Timestamp.fromMillis(Date.now() - 100000),
        smartContractAddress: smartContractAddress,
      });
      triggerReleaseSpy.mockResolvedValue({ success: false, error: 'Blockchain boom!' });

      await checkAndProcessContractDeadlines();

      expect(triggerReleaseSpy).toHaveBeenCalledWith(smartContractAddress, dealId);
      const updatedDeal = await getDealById(dealId);
      expect(updatedDeal.status).toBe('AutoReleaseFailed');
      expect(updatedDeal.processingError).toContain('Blockchain boom!');
      expect(updatedDeal.lastAutomaticProcessAttempt).toBeInstanceOf(Timestamp);
    });

    it('should process a deal past dispute deadline', async () => {
      const dealId = 'dealPastDispute';
      const smartContractAddress = '0xContractForDispute';
      await createDealInFirestore(dealId, {
        status: 'PaymentConfirmed', // Or a status that allows cancellation after dispute
        finalApprovalTimestamp: Timestamp.fromMillis(Date.now() + 86400000 * 2), // Far future
        disputeDeadlineTimestamp: Timestamp.fromMillis(Date.now() - 100000), // In the past
        smartContractAddress: smartContractAddress,
      });

      await checkAndProcessContractDeadlines();

      expect(triggerCancelSpy).toHaveBeenCalledWith(smartContractAddress, dealId);
      const updatedDeal = await getDealById(dealId);
      expect(updatedDeal.status).toBe('CancelledAfterDisputeDeadline');
      expect(updatedDeal.autoCancelTxHash).toBe('0xsimulatedcancelhash');
    });
    
    it('should handle failed blockchain cancellation for a deal past dispute deadline', async () => {
        const dealId = 'dealFailCancel';
        const smartContractAddress = '0xContractFailCancel';
        await createDealInFirestore(dealId, {
            status: 'PaymentConfirmed',
            disputeDeadlineTimestamp: Timestamp.fromMillis(Date.now() - 100000),
            smartContractAddress: smartContractAddress,
        });
        triggerCancelSpy.mockResolvedValue({ success: false, error: 'Blockchain cancel boom!' });

        await checkAndProcessContractDeadlines();

        expect(triggerCancelSpy).toHaveBeenCalledWith(smartContractAddress, dealId);
        const updatedDeal = await getDealById(dealId);
        expect(updatedDeal.status).toBe('AutoCancellationFailed');
        expect(updatedDeal.processingError).toContain('Blockchain cancel boom!');
    });


    it('should skip processing if a deal lacks a smartContractAddress', async () => {
      const dealId = 'dealNoContract';
      await createDealInFirestore(dealId, {
        status: 'PaymentConfirmed',
        finalApprovalTimestamp: Timestamp.fromMillis(Date.now() - 100000),
        // No smartContractAddress
      });

      await checkAndProcessContractDeadlines();

      expect(triggerReleaseSpy).not.toHaveBeenCalled();
      expect(triggerCancelSpy).not.toHaveBeenCalled();
      const deal = await getDealById(dealId);
      // Status should remain unchanged, or have a specific error if that's the logic
      expect(deal.status).toBe('PaymentConfirmed'); 
    });
    
    it('should not run if job is already running flag is set', async () => {
      // Call once to set the internal flag
      await createDealInFirestore('tempDeal', { status: 'PaymentConfirmed', finalApprovalTimestamp: Timestamp.fromMillis(Date.now() - 1000), smartContractAddress: '0xtemp' });
      await checkAndProcessContractDeadlines();
      expect(triggerReleaseSpy).toHaveBeenCalledTimes(1);
      triggerReleaseSpy.mockClear(); // Clear for next assertion

      // Attempt to call again, should be skipped
      await checkAndProcessContractDeadlines();
      expect(triggerReleaseSpy).not.toHaveBeenCalled();
      
      await __TEST_ONLY_resetJobRunningFlag(); // Clean up for other tests
    });
  });

  describe('startScheduledJobs', () => {
    let consoleWarnSpy, consoleErrorSpy, consoleLogSpy;

    beforeEach(() => {
        consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {}); // To quiet successful logs
    });

    afterEach(() => {
        consoleWarnSpy.mockRestore();
        consoleErrorSpy.mockRestore();
        consoleLogSpy.mockRestore();
    });
    
    it('should warn and not schedule if BACKEND_WALLET_PRIVATE_KEY is missing', () => {
      delete process.env.BACKEND_WALLET_PRIVATE_KEY;
      startScheduledJobs();
      expect(mockCronSchedule).not.toHaveBeenCalled();
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining("Automated contract call jobs DISABLED due to missing BACKEND_WALLET_PRIVATE_KEY or RPC_URL."));
    });

    it('should warn and not schedule if RPC_URL is missing', () => {
      delete process.env.RPC_URL;
      startScheduledJobs();
      expect(mockCronSchedule).not.toHaveBeenCalled();
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining("Automated contract call jobs DISABLED due to missing BACKEND_WALLET_PRIVATE_KEY or RPC_URL."));
    });

    // This test depends on how blockchainService.contractABI is loaded and its actual value.
    // If ABI loading is robust, this test might need to simulate a scenario where ABI is truly empty/null.
    // For now, assuming blockchainService correctly loads its ABI if files are present.
    // To test ABI failure, one might need to mock fs or path within blockchainService, which is too deep for this integration.
    it('should warn and not schedule if contractABI is effectively not available (e.g. loading failed in blockchainService)', async () => {
        // This requires a way to make actualBlockchainService.contractABI null or empty.
        // One way is to temporarily mock the getter if it were a class, or the module export.
        // Given it's a direct export, we might need to mock the blockchainService module partially for this specific sub-test,
        // or ensure the conditions for ABI loading failure in the actual blockchainService.
        // For simplicity, if blockchainService always loads an ABI or throws, this test is hard to make pass without deeper mocking.
        // Let's assume for now that if blockchainService.js itself can't load the ABI, it would make contractABI null/empty.
        
        const originalABI = actualBlockchainService.contractABI;
        Object.defineProperty(actualBlockchainService, 'contractABI', { value: null, configurable: true });

        startScheduledJobs();
        expect(mockCronSchedule).not.toHaveBeenCalled();
        expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining("Automated contract call jobs DISABLED due to ABI loading failure or empty ABI."));
        
        Object.defineProperty(actualBlockchainService, 'contractABI', { value: [], configurable: true }); // Empty array
        startScheduledJobs();
        expect(mockCronSchedule).not.toHaveBeenCalled(); // Still not called for the second case
        expect(consoleWarnSpy).toHaveBeenCalledTimes(2);

        Object.defineProperty(actualBlockchainService, 'contractABI', { value: originalABI, configurable: true }); // Restore
    });
    
    it('should log an error and not schedule if CRON_SCHEDULE is invalid', () => {
      mockCronValidate.mockReturnValue(false); // Simulate invalid cron string
      startScheduledJobs();
      expect(mockCronSchedule).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("Invalid CRON_SCHEDULE"));
    });

    it('should schedule job with correct cron expression from env var if all conditions met', () => {
      const testCronExpression = '5 * * * *';
      process.env.CRON_SCHEDULE_DEADLINE_CHECKS = testCronExpression;
      startScheduledJobs();
      expect(mockCronValidate).toHaveBeenCalledWith(testCronExpression);
      expect(mockCronSchedule).toHaveBeenCalledWith(testCronExpression, checkAndProcessContractDeadlines, {
        scheduled: true,
        timezone: "America/New_York"
      });
    });

    it('should use default cron schedule if CRON_SCHEDULE_DEADLINE_CHECKS env var is not set and conditions met', () => {
      delete process.env.CRON_SCHEDULE_DEADLINE_CHECKS;
      const defaultCronExpression = '*/30 * * * *'; // Default from scheduledJobs.js
      startScheduledJobs();
      expect(mockCronValidate).toHaveBeenCalledWith(defaultCronExpression);
      expect(mockCronSchedule).toHaveBeenCalledWith(defaultCronExpression, checkAndProcessContractDeadlines, {
        scheduled: true,
        timezone: "America/New_York"
      });
    });
  });
}); 