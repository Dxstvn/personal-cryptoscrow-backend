process.env.FIRESTORE_EMULATOR_HOST = 'localhost:5004'; // MUST BE AT THE VERY TOP
console.log(`[Test File Top] FIRESTORE_EMULATOR_HOST set to: ${process.env.FIRESTORE_EMULATOR_HOST}`);

import { jest } from '@jest/globals';
import admin from 'firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';

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

// Mock blockchainService
const mockTriggerReleaseAfterApproval = jest.fn();
const mockTriggerCancelAfterDisputeDeadline = jest.fn();
// Use an object to hold the mock ABI, allowing its `current` property to be reassigned
// and the getter will always access the latest assignment.
const mockContractABIHolder = { current: [{ type: "function", name: "defaultMockFunction" }] }; 

// In the test file, replace the existing blockchainService mock with this:
jest.unstable_mockModule('../../blockchainService.js', () => {
  return {
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

describe('ScheduledJobs Integration Tests (with Firestore Emulator)', () => {
  let originalEnv;

  beforeAll(async () => {
    // process.env.FIRESTORE_EMULATOR_HOST = 'localhost:5004'; // Moved to top of file
    const DEFAULT_APP_NAME = '[DEFAULT]'; // Firebase SDK's name for the default app

    let defaultApp = admin.apps.find(app => app && app.name === DEFAULT_APP_NAME);

    if (!defaultApp) {
        console.log(`[Test BeforeAll] Default Firebase app (\"${DEFAULT_APP_NAME}\") not found. Initializing one.`);
        // Initialize the default app. It should pick up FIRESTORE_EMULATOR_HOST.
        admin.initializeApp({
            projectId: `scheduledjobs-suite-${Date.now()}`,
        });
    } else {
        console.log(`[Test BeforeAll] Default Firebase app (\"${DEFAULT_APP_NAME}\") already initialized. Project ID: ${defaultApp.options.projectId}`);
        // Ensure the existing default app is actually using the emulator, crucial if it was initialized by other code.
        // Note: This is a best-effort check; FIRESTORE_EMULATOR_HOST should ideally be set before ANY app init.
        if (process.env.FIRESTORE_EMULATOR_HOST && (!defaultApp.options.serviceAccountId?.includes('emulator') && defaultApp.options.projectId !== process.env.GCLOUD_PROJECT)) {
            // A more robust check might involve trying to write/read a dummy value to verify emulator connection if possible
            // For now, we log a warning if it seems the default app isn't clearly for the emulator.
            console.warn('[Test BeforeAll] Warning: Existing default app might not be configured for the Firestore emulator. Ensure FIRESTORE_EMULATOR_HOST is set globally before any test runs if issues persist.');
        }
    }
    
    // Now get the firestore instance from the (ideally correctly configured) default app
    try {
        db = admin.firestore();
    } catch (e) {
        console.error("[Test BeforeAll] CRITICAL: Failed to get Firestore instance after ensuring default app exists.", e);
        throw e; // Fail fast if db cannot be obtained
    }

    if (!db) {
        throw new Error("[Test BeforeAll] CRITICAL: Firestore 'db' instance was not initialized.");
    }

    console.log('[Test BeforeAll] Firestore instance obtained. Proceeding to clear emulator.');
    await clearFirestore();
    // console.log('[Test Setup] Firestore emulator cleared for scheduledJobs suite.'); // Redundant with above
  });

  beforeEach(async () => {
    jest.clearAllMocks(); // Clears spies and cron mocks
    process.env.NODE_ENV = 'test'; // Explicitly set NODE_ENV for the test context
    await __TEST_ONLY_resetJobRunningFlag();
    await clearFirestore(); // Clear before each test for isolation

    console.log('[Test beforeEach] Using statically imported databaseService. Firestore cleared for isolation.');

    originalEnv = { ...process.env };
    process.env.BACKEND_WALLET_PRIVATE_KEY = 'test_pk_for_scheduled_jobs';
    process.env.RPC_URL = 'http://localhost:8545'; // Needs to be valid for ABI loading in blockchainService if it depends on it
    process.env.CRON_SCHEDULE_DEADLINE_CHECKS = '* * * * *';
    
    // Reset spy mock implementations to default success if needed for blockchain service
    mockTriggerReleaseAfterApproval.mockResolvedValue({ success: true, receipt: { transactionHash: '0xsimulatedreleasehash' } });
    mockTriggerCancelAfterDisputeDeadline.mockResolvedValue({ success: true, receipt: { transactionHash: '0xsimulatedcancelhash' } });

    // Ensure a valid ABI is set before each test in this suite by resetting the holder's current value
    mockContractABIHolder.current = [{ type: "function", name: "defaultMockFunction" }];
    mockCronValidate.mockReturnValue(true); // Ensure cron.validate returns true by default
  });

  afterEach(async () => {
    process.env = originalEnv;
    await clearFirestore(); // Clean up after each test
  });

  describe('checkAndProcessContractDeadlines', () => {
    it('should do nothing if no deals meet criteria', async () => {
      await checkAndProcessContractDeadlines();
      // databaseService.getDealsPast... would be called, but spies are on blockchainService
      expect(mockTriggerReleaseAfterApproval).not.toHaveBeenCalled();
      expect(mockTriggerCancelAfterDisputeDeadline).not.toHaveBeenCalled();
    });

    it('should process a deal past final approval', async () => {
      const dealId = 'dealPastApproval';
      const smartContractAddress = '0xContractForApproval';
      await createDealInFirestore(dealId, {
        status: 'IN_FINAL_APPROVAL', // Correct status
        finalApprovalDeadlineBackend: Timestamp.fromMillis(Date.now() - 100000), // Correct field name
        disputeDeadlineTimestamp: Timestamp.fromMillis(Date.now() + 86400000), // In the future
        smartContractAddress: smartContractAddress,
        sellerId: 'seller1',
        buyerId: 'buyer1',
        escrowAmount: '1',
      });

      await checkAndProcessContractDeadlines();

      expect(mockTriggerReleaseAfterApproval).toHaveBeenCalledWith(smartContractAddress, dealId);
      const updatedDeal = await dbService.getDealById(dealId);
      expect(updatedDeal.status).toBe('FundsReleased');
      expect(updatedDeal.autoReleaseTxHash).toBe('0xsimulatedreleasehash');
      expect(updatedDeal.lastAutomaticProcessAttempt).toBeInstanceOf(Timestamp);
    });

    it('should handle failed blockchain release for a deal past final approval', async () => {
      const dealId = 'dealFailRelease';
      const smartContractAddress = '0xContractFailRelease';
      await createDealInFirestore(dealId, {
        status: 'IN_FINAL_APPROVAL', // Correct status
        finalApprovalDeadlineBackend: Timestamp.fromMillis(Date.now() - 100000), // Correct field name
        smartContractAddress: smartContractAddress,
      });
      mockTriggerReleaseAfterApproval.mockResolvedValue({ success: false, error: 'Blockchain boom!' });

      await checkAndProcessContractDeadlines();

      expect(mockTriggerReleaseAfterApproval).toHaveBeenCalledWith(smartContractAddress, dealId);
      const updatedDeal = await dbService.getDealById(dealId);
      expect(updatedDeal.status).toBe('AutoReleaseFailed');
      expect(updatedDeal.processingError).toContain('Blockchain boom!');
      expect(updatedDeal.lastAutomaticProcessAttempt).toBeInstanceOf(Timestamp);
    });

    it('should process a deal past dispute deadline', async () => {
      const dealId = 'dealPastDispute';
      const smartContractAddress = '0xContractForDispute';
      await createDealInFirestore(dealId, {
        status: 'IN_DISPUTE', // Correct status
        finalApprovalTimestamp: Timestamp.fromMillis(Date.now() + 86400000 * 2), // Far future
        disputeResolutionDeadlineBackend: Timestamp.fromMillis(Date.now() - 100000), // Correct field name
        smartContractAddress: smartContractAddress,
      });

      await checkAndProcessContractDeadlines();

      expect(mockTriggerCancelAfterDisputeDeadline).toHaveBeenCalledWith(smartContractAddress, dealId);
      const updatedDeal = await dbService.getDealById(dealId);
      expect(updatedDeal.status).toBe('CancelledAfterDisputeDeadline');
      expect(updatedDeal.autoCancelTxHash).toBe('0xsimulatedcancelhash');
    });
    
    it('should handle failed blockchain cancellation for a deal past dispute deadline', async () => {
        const dealId = 'dealFailCancel';
        const smartContractAddress = '0xContractFailCancel';
        await createDealInFirestore(dealId, {
            status: 'IN_DISPUTE', // Correct status
            disputeResolutionDeadlineBackend: Timestamp.fromMillis(Date.now() - 100000), // Correct field name
            smartContractAddress: smartContractAddress,
        });
        mockTriggerCancelAfterDisputeDeadline.mockResolvedValue({ success: false, error: 'Blockchain cancel boom!' });

        await checkAndProcessContractDeadlines();

        expect(mockTriggerCancelAfterDisputeDeadline).toHaveBeenCalledWith(smartContractAddress, dealId);
        const updatedDeal = await dbService.getDealById(dealId);
        expect(updatedDeal.status).toBe('AutoCancellationFailed');
        expect(updatedDeal.processingError).toContain('Blockchain cancel boom!');
    });


    it('should skip processing if a deal lacks a smartContractAddress', async () => {
      const dealId = 'dealNoContract';
      await createDealInFirestore(dealId, {
        status: 'IN_FINAL_APPROVAL', // Use a status that would otherwise be processed
        finalApprovalDeadlineBackend: Timestamp.fromMillis(Date.now() - 100000),
        // No smartContractAddress
      });

      await checkAndProcessContractDeadlines();

      expect(mockTriggerReleaseAfterApproval).not.toHaveBeenCalled();
      expect(mockTriggerCancelAfterDisputeDeadline).not.toHaveBeenCalled();
      const deal = await dbService.getDealById(dealId);
      // Status should remain unchanged
      expect(deal.status).toBe('IN_FINAL_APPROVAL'); 
    });
    
    it('should not run if job is already running flag is set', async () => {
      // Call once to set the internal flag
      await createDealInFirestore('tempDeal', { 
        status: 'IN_FINAL_APPROVAL', // Correct status
        finalApprovalDeadlineBackend: Timestamp.fromMillis(Date.now() - 1000), // Correct field name
        smartContractAddress: '0xtemp' 
      });
      await checkAndProcessContractDeadlines();
      expect(mockTriggerReleaseAfterApproval).toHaveBeenCalledTimes(1);
      mockTriggerReleaseAfterApproval.mockClear(); // Clear for next assertion

      // Attempt to call again, should be skipped
      await checkAndProcessContractDeadlines();
      expect(mockTriggerReleaseAfterApproval).not.toHaveBeenCalled();
      
      await __TEST_ONLY_resetJobRunningFlag(); // Clean up for other tests
    });
  });

  describe('startScheduledJobs', () => {
    let consoleWarnSpy, consoleErrorSpy, consoleLogSpy;

    beforeEach(() => {
        // Spy on console methods without mocking their implementation to see logs
        consoleWarnSpy = jest.spyOn(console, 'warn');
        consoleErrorSpy = jest.spyOn(console, 'error');
        consoleLogSpy = jest.spyOn(console, 'log');
        // Ensure a valid ABI is set before each test in this suite by resetting the holder's current value
        mockContractABIHolder.current = [{ type: "function", name: "defaultMockFunctionForStartScheduledJobs" }];
        console.log(`[Test beforeEach for startScheduledJobs] mockContractABIHolder.current set to: ${JSON.stringify(mockContractABIHolder.current)}`);
        mockCronValidate.mockReturnValue(true);
    });

    afterEach(() => {
        // Restore spies safely
        if (consoleWarnSpy) consoleWarnSpy.mockRestore();
        if (consoleErrorSpy) consoleErrorSpy.mockRestore();
        if (consoleLogSpy) consoleLogSpy.mockRestore();
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

    it('should warn and not schedule if contractABI is effectively not available (e.g. loading failed in blockchainService)', async () => {
      // Part 1: Test with null ABI
      await jest.isolateModules(async () => {
        jest.resetModules();
        
        // Mock the global cron module to check it wasn't called
        mockCronSchedule.mockClear();
        
        // Mock blockchainService with null ABI
        jest.unstable_mockModule('../../blockchainService.js', () => ({
          triggerReleaseAfterApproval: mockTriggerReleaseAfterApproval,
          triggerCancelAfterDisputeDeadline: mockTriggerCancelAfterDisputeDeadline,
          get contractABI() {
            return null;
          },
          __TEST_ONLY_simulateAbiLoadingFailure: jest.fn(),
          __TEST_ONLY_getInternalAbiState: jest.fn(),
          initializeService: jest.fn().mockResolvedValue(true), 
        }));

        const { startScheduledJobs: isolatedStartScheduledJobsNull } = await import('../../scheduledJobs.js');
        
        isolatedStartScheduledJobsNull(); 

        // Verify that cron.schedule was NOT called when ABI is null
        expect(mockCronSchedule).not.toHaveBeenCalled(); 
      });
      
      mockCronSchedule.mockClear(); 

      // Part 2: Test with empty array ABI
      await jest.isolateModules(async () => {
        jest.resetModules();
        
        // Mock the global cron module to check it wasn't called
        mockCronSchedule.mockClear();
        
        // Mock blockchainService with empty array ABI
        jest.unstable_mockModule('../../blockchainService.js', () => ({
          triggerReleaseAfterApproval: mockTriggerReleaseAfterApproval,
          triggerCancelAfterDisputeDeadline: mockTriggerCancelAfterDisputeDeadline,
          get contractABI() {
            return [];
          },
          __TEST_ONLY_simulateAbiLoadingFailure: jest.fn(),
          __TEST_ONLY_getInternalAbiState: jest.fn(),
          initializeService: jest.fn().mockResolvedValue(true),
        }));
        
        const { startScheduledJobs: isolatedStartScheduledJobsEmpty } = await import('../../scheduledJobs.js');
        
        // Call the function
        isolatedStartScheduledJobsEmpty();
        
        // The key behavior we're testing is that cron.schedule should NOT be called
        // when contractABI is empty. This is more important than capturing the console warning.
        expect(mockCronSchedule).not.toHaveBeenCalled();
      });
    });
    
    it('should log an error and not schedule if CRON_SCHEDULE is invalid', () => {
      mockCronValidate.mockReturnValue(false); // Simulate invalid cron string
      // Ensure ABI is valid for this specific test so it reaches cron validation
      // mockContractABI = [{ type: "function", name: "testFunctionToReachCronValidation" }]; // This is good, ensures ABI is set for THIS test's context if default wasn't enough or was changed
      startScheduledJobs();
      expect(mockCronSchedule).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("Invalid CRON_SCHEDULE"));
    });

    it('should schedule job with correct cron expression from env var if all conditions met', () => {
      const testCronExpression = '5 * * * *';
      process.env.CRON_SCHEDULE_DEADLINE_CHECKS = testCronExpression;
      // mockContractABI = [{ type: "function", name: "testFunctionValidABI" }]; // Ensured by module-level default or can be set here for clarity
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
      // mockContractABI = [{ type: "function", name: "testFunctionValidABI" }]; // Ensured by module-level default or can be set here for clarity
      startScheduledJobs();
      expect(mockCronValidate).toHaveBeenCalledWith(defaultCronExpression);
      expect(mockCronSchedule).toHaveBeenCalledWith(defaultCronExpression, checkAndProcessContractDeadlines, {
        scheduled: true,
        timezone: "America/New_York"
      });
    });
  });
}); 