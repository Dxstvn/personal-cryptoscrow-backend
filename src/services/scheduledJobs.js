// src/services/scheduledJobs.js
import cron from 'node-cron';
import {
  getDealsPastFinalApproval,
  getDealsPastDisputeDeadline,
  updateDealStatusInDB
} from './databaseService.js'; // Assuming databaseService.js is in the same directory

// Import the entire blockchainService module as a namespace
import * as blockchainService from './blockchainService.js'; // Assuming blockchainService.js is in the same directory
import { Timestamp } from 'firebase-admin/firestore';

// Module-level variable to prevent concurrent job runs
let _isJobRunning = false;

/**
 * @internal Resets the job running flag. FOR TESTING PURPOSES ONLY.
 */
export function __TEST_ONLY_resetJobRunningFlag() {
  if (process.env.NODE_ENV === 'test') {
    console.log('[TEST ENV DEBUG] __TEST_ONLY_resetJobRunningFlag called: Setting _isJobRunning to false.');
  }
  _isJobRunning = false;
}

/**
 * Main job function to check and process contract deadlines.
 */
export async function checkAndProcessContractDeadlines() {
  if (process.env.NODE_ENV === 'test') {
    console.log(`[TEST ENV DEBUG] Entering checkAndProcessContractDeadlines. Current _isJobRunning: ${_isJobRunning}`);
  }

  if (_isJobRunning) {
    console.log('[Scheduler] Deadline check job already running. Skipping this cycle.');
    return;
  }
  _isJobRunning = true;
  if (process.env.NODE_ENV === 'test') {
    console.log(`[TEST ENV DEBUG] _isJobRunning set to true. Current _isJobRunning: ${_isJobRunning}`);
  }

  console.log(`[Scheduler] Starting deadline check job at ${new Date().toISOString()}...`);

  try {
    // These will now correctly call the mocked functions from databaseService.js
    const dealsPastFinalApproval = await getDealsPastFinalApproval();
    if (process.env.NODE_ENV === 'test') {
        console.log(`[TEST ENV DEBUG] Fetched ${dealsPastFinalApproval.length} deals past final approval.`);
    }
    for (const deal of dealsPastFinalApproval) {
      if (!deal.smartContractAddress) {
        console.warn(`[Scheduler] Deal ${deal.id} is past final approval but has no smartContractAddress. Skipping.`);
        continue;
      }
      console.log(`[Scheduler] Processing auto-release for deal ${deal.id} at contract ${deal.smartContractAddress}`);
      // Use blockchainService namespace to call its functions
      const releaseResult = await blockchainService.triggerReleaseAfterApproval(deal.smartContractAddress, deal.id);
      if (releaseResult.success) {
        console.log(`[Scheduler] Successfully auto-released funds for deal ${deal.id}. Tx: ${releaseResult.receipt?.transactionHash}`);
        await updateDealStatusInDB(deal.id, {
          status: 'FundsReleased',
          autoReleaseTxHash: releaseResult.receipt?.transactionHash,
          lastAutomaticProcessAttempt: Timestamp.now()
        });
      } else {
        console.error(`[Scheduler] FAILED to process auto-release for deal ${deal.id}. Error:`, releaseResult.error);
        await updateDealStatusInDB(deal.id, {
          status: 'AutoReleaseFailed',
          processingError: `Blockchain call failed: ${releaseResult.error}`,
          lastAutomaticProcessAttempt: Timestamp.now()
        });
      }
    }

    const dealsPastDisputeDeadline = await getDealsPastDisputeDeadline();
    if (process.env.NODE_ENV === 'test') {
        console.log(`[TEST ENV DEBUG] Fetched ${dealsPastDisputeDeadline.length} deals past dispute deadline.`);
    }
    for (const deal of dealsPastDisputeDeadline) {
      if (!deal.smartContractAddress) {
        console.warn(`[Scheduler] Deal ${deal.id} is past dispute deadline but has no smartContractAddress. Skipping.`);
        continue;
      }
      console.log(`[Scheduler] Processing auto-cancellation for deal ${deal.id} at contract ${deal.smartContractAddress}`);
      // Use blockchainService namespace
      const cancelResult = await blockchainService.triggerCancelAfterDisputeDeadline(deal.smartContractAddress, deal.id);
      if (cancelResult.success) {
        console.log(`[Scheduler] Successfully auto-cancelled deal ${deal.id}. Tx: ${cancelResult.receipt?.transactionHash}`);
        await updateDealStatusInDB(deal.id, {
          status: 'CancelledAfterDisputeDeadline',
          autoCancelTxHash: cancelResult.receipt?.transactionHash,
          lastAutomaticProcessAttempt: Timestamp.now()
        });
      } else {
        console.error(`[Scheduler] FAILED to process auto-cancellation for deal ${deal.id}. Error:`, cancelResult.error);
        await updateDealStatusInDB(deal.id, {
          status: 'AutoCancellationFailed',
          processingError: `Blockchain call failed: ${cancelResult.error}`,
          lastAutomaticProcessAttempt: Timestamp.now()
        });
      }
    }
  } catch (error) {
    console.error('[Scheduler] CRITICAL ERROR in deadline check job:', error);
    if (process.env.NODE_ENV === 'test') {
        console.log('[TEST ENV DEBUG] Error caught in checkAndProcessContractDeadlines main try-catch:', error);
    }
  } finally {
    _isJobRunning = false;
    if (process.env.NODE_ENV === 'test') {
      console.log(`[TEST ENV DEBUG] In finally block, _isJobRunning set to false. Current _isJobRunning: ${_isJobRunning}`);
    }
    console.log(`[Scheduler] Deadline check job finished at ${new Date().toISOString()}.`);
  }
}

/**
 * Initializes and starts the scheduled jobs.
 */
export function startScheduledJobs() {
  if (process.env.NODE_ENV === 'test') {
    // Access contractABI via the blockchainService namespace to ensure it gets the mocked version's current state
    console.log('[TEST ENV DEBUG] startScheduledJobs called. Value of blockchainService.contractABI:',
      blockchainService.contractABI ? 'Exists' : 'NULL or Undefined',
    );
  }

  if (!process.env.BACKEND_WALLET_PRIVATE_KEY || !process.env.RPC_URL) {
    console.warn("[Scheduler] Automated contract call jobs DISABLED due to missing BACKEND_WALLET_PRIVATE_KEY or RPC_URL.");
    return;
  }

  // Access contractABI via the blockchainService namespace. This is CRITICAL for the mock to work correctly in tests.
  if (!blockchainService.contractABI || blockchainService.contractABI.length === 0) {
    console.warn("[Scheduler] Automated contract call jobs DISABLED due to ABI loading failure or empty ABI.");
    return;
  }

  const CRON_SCHEDULE = process.env.CRON_SCHEDULE_DEADLINE_CHECKS || '*/30 * * * *';
  if (!cron.validate(CRON_SCHEDULE)) {
    console.error(`[Scheduler] Invalid CRON_SCHEDULE: "${CRON_SCHEDULE}". Automated jobs will not start.`);
    return;
  }
  console.log(`[Scheduler] Initializing cron job with schedule: "${CRON_SCHEDULE}"`);

  cron.schedule(CRON_SCHEDULE, checkAndProcessContractDeadlines, {
    scheduled: true,
    timezone: "America/New_York"
  });

  console.log('[Scheduler] Deadline check job scheduled successfully.');
}
