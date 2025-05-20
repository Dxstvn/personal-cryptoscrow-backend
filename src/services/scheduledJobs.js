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
        console.log(`[TEST ENV DEBUG] Raw dealsPastFinalApproval from databaseService:`, JSON.stringify(dealsPastFinalApproval, null, 2));
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
          lastAutomaticProcessAttempt: Timestamp.now(),
          timelineEventMessage: `Successfully auto-released funds. Tx: ${releaseResult.receipt?.transactionHash}`
        });
      } else {
        console.error(`[Scheduler] FAILED to process auto-release for deal ${deal.id}. Error:`, releaseResult.error);
        await updateDealStatusInDB(deal.id, {
          status: 'AutoReleaseFailed',
          processingError: `Blockchain call failed: ${releaseResult.error}`,
          lastAutomaticProcessAttempt: Timestamp.now(),
          timelineEventMessage: `FAILED to process auto-release. Error: ${releaseResult.error}`
        });
      }
    }

    const dealsPastDisputeDeadline = await getDealsPastDisputeDeadline();
    if (process.env.NODE_ENV === 'test') {
        console.log(`[TEST ENV DEBUG] Raw dealsPastDisputeDeadline from databaseService:`, JSON.stringify(dealsPastDisputeDeadline, null, 2));
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
          lastAutomaticProcessAttempt: Timestamp.now(),
          timelineEventMessage: `Successfully auto-cancelled deal. Tx: ${cancelResult.receipt?.transactionHash}`
        });
      } else {
        console.error(`[Scheduler] FAILED to process auto-cancellation for deal ${deal.id}. Error:`, cancelResult.error);
        await updateDealStatusInDB(deal.id, {
          status: 'AutoCancellationFailed',
          processingError: `Blockchain call failed: ${cancelResult.error}`,
          lastAutomaticProcessAttempt: Timestamp.now(),
          timelineEventMessage: `FAILED to process auto-cancellation. Error: ${cancelResult.error}`
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
  // Add specific logging for the value it sees
  let abiValueForLog;
  try {
    abiValueForLog = blockchainService.contractABI; // Access it
  } catch (e) {
    abiValueForLog = `Error accessing ABI: ${e.message}`;
  }
  console.log(`[SUT startScheduledJobs] Entry. process.env.NODE_ENV: ${process.env.NODE_ENV}. blockchainService.contractABI perceived as: ${JSON.stringify(abiValueForLog)} (type: ${typeof abiValueForLog}, length: ${abiValueForLog && typeof abiValueForLog.length !== 'undefined' ? abiValueForLog.length : 'N/A'})`);

  if (!process.env.BACKEND_WALLET_PRIVATE_KEY || !process.env.RPC_URL) {
    console.warn("[Scheduler] Automated contract call jobs DISABLED due to missing BACKEND_WALLET_PRIVATE_KEY or RPC_URL.");
    return;
  }

  // Access contractABI via the blockchainService namespace. This is CRITICAL for the mock to work correctly in tests.
  const currentABI = blockchainService.contractABI; // Call getter
  console.log(`[SUT DEBUG startScheduledJobs] Value of currentABI after access inside SUT: ${JSON.stringify(currentABI)}`);

  if (!currentABI || (Array.isArray(currentABI) && currentABI.length === 0)) {
    console.warn("[Scheduler] Automated contract call jobs DISABLED due to ABI loading failure or empty ABI.");
    console.log("[SUT DEBUG startScheduledJobs] ABI is null or empty. Attempting to return. UNIQUE_LOG_POINT_ALPHA");
    return;
  }
  console.log("[SUT DEBUG startScheduledJobs] Proceeding past ABI check, ABI appears valid. UNIQUE_LOG_POINT_BETA");

  const CRON_SCHEDULE = process.env.CRON_SCHEDULE_DEADLINE_CHECKS || '*/30 * * * *';
  if (!cron.validate(CRON_SCHEDULE)) {
    console.error(`[Scheduler] Invalid CRON_SCHEDULE: "${CRON_SCHEDULE}". Automated jobs will not start.`);
    return;
  }
  console.log(`[Scheduler] Initializing cron job with schedule: "${CRON_SCHEDULE}"`);
  console.log("[SUT DEBUG startScheduledJobs] ABOUT TO CALL CRON.SCHEDULE. UNIQUE_LOG_POINT_GAMMA");
  cron.schedule(CRON_SCHEDULE, checkAndProcessContractDeadlines, {
    scheduled: true,
    timezone: "America/New_York"
  });

  console.log('[Scheduler] Deadline check job scheduled successfully.');
}
