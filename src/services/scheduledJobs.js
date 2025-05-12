// src/jobs/scheduledJobs.js
import cron from 'node-cron';
import {
  getDealsPastFinalApproval,
  getDealsPastDisputeDeadline,
  updateDealStatusInDB
} from '../services/databaseService.js'; // Adjust path if databaseService.js is elsewhere
import {
  triggerReleaseAfterApproval,
  triggerCancelAfterDisputeDeadline,
  contractABI // Import contractABI explicitly
} from '../services/blockchainService.js'; // Adjust path

// Module-level variable to prevent concurrent job runs.
// Kept internal to the module now.
let _isJobRunning = false;

// Removed __TEST_ONLY_resetJobRunningFlag function

/**
 * Main job function to check and process contract deadlines.
 */
export async function checkAndProcessContractDeadlines() {
  // Check if the job is already running
  if (_isJobRunning) {
    console.log('[Scheduler] Deadline check job already running. Skipping this cycle.');
    return;
  }
  // Set the flag to indicate the job has started
  _isJobRunning = true;
  console.log(`[Scheduler] Running job to check contract deadlines at ${new Date().toISOString()}...`);

  try {
    // --- Process Releases ---
    const dealsToRelease = await getDealsPastFinalApproval();
    if (dealsToRelease.length > 0) {
      console.log(`[Scheduler] Found ${dealsToRelease.length} deal(s) past final approval deadline.`);
    }
    for (const deal of dealsToRelease) {
      if (!deal.smartContractAddress) {
        console.warn(`[Scheduler] Deal ${deal.id} is past final approval but has no smartContractAddress. Skipping automated release.`);
        continue;
      }
      console.log(`[Scheduler] Processing auto-release for deal: ${deal.id}, contract: ${deal.smartContractAddress}`);
      const result = await triggerReleaseAfterApproval(deal.smartContractAddress, deal.id);
      if (result && result.success) {
        await updateDealStatusInDB(
          deal.id,
          'COMPLETED',
          `Funds automatically released after approval period. Tx: ${result.receipt?.transactionHash}`,
          result.receipt?.transactionHash
        );
        console.log(`[Scheduler] Successfully processed auto-release for deal ${deal.id}.`);
      } else {
        const errorMessage = result?.error?.message || 'Unknown error during release';
        console.error(`[Scheduler] FAILED to process auto-release for deal ${deal.id}:`, errorMessage);
        await updateDealStatusInDB(
            deal.id,
            deal.status,
            `Attempted auto-release for deal ${deal.id} FAILED. Error: ${errorMessage}. Needs review.`,
            null
        );
      }
    } // End of dealsToRelease loop

    // --- Process Cancellations ---
    const dealsToCancel = await getDealsPastDisputeDeadline();
    if (dealsToCancel.length > 0) {
      console.log(`[Scheduler] Found ${dealsToCancel.length} deal(s) past dispute resolution deadline.`);
    }
    for (const deal of dealsToCancel) {
      if (!deal.smartContractAddress) {
        console.warn(`[Scheduler] Deal ${deal.id} is past dispute deadline but has no smartContractAddress. Skipping automated cancellation.`);
        continue;
      }
      console.log(`[Scheduler] Processing auto-cancellation for deal: ${deal.id}, contract: ${deal.smartContractAddress}`);
      const result = await triggerCancelAfterDisputeDeadline(deal.smartContractAddress, deal.id);
      if (result && result.success) {
        await updateDealStatusInDB(
          deal.id,
          'CANCELLED',
          `Escrow automatically cancelled and refunded after dispute deadline. Tx: ${result.receipt?.transactionHash}`,
          result.receipt?.transactionHash
        );
        console.log(`[Scheduler] Successfully processed auto-cancellation for deal ${deal.id}.`);
      } else {
        const errorMessage = result?.error?.message || 'Unknown error during cancellation';
        console.error(`[Scheduler] FAILED to process auto-cancellation for deal ${deal.id}:`, errorMessage);
        await updateDealStatusInDB(
            deal.id,
            deal.status,
            `Attempted auto-cancellation for deal ${deal.id} FAILED. Error: ${errorMessage}. Needs review.`,
            null
        );
      }
    } // End of dealsToCancel loop

  } catch (error) {
    console.error('[Scheduler] CRITICAL ERROR in deadline check job:', error);
  } finally {
    // IMPORTANT: Ensure the job running flag is reset regardless of success or failure
    _isJobRunning = false; // Always reset in production/normal runs

    // --- ADDED FOR TEST RELIABILITY ---
    // Explicitly reset the flag if running in the test environment
    // This helps overcome potential state issues between Jest tests.
    if (process.env.NODE_ENV === 'test') {
        _isJobRunning = false;
        // console.log('[TEST ENV] Resetting _isJobRunning flag in finally block.'); // Optional debug log
    }
    // --- END TEST ADDITION ---

    console.log(`[Scheduler] Deadline check job finished at ${new Date().toISOString()}.`);
  }
}

/**
 * Initializes and starts the scheduled jobs.
 * Checks for necessary environment variables and contract ABI before scheduling.
 */
export function startScheduledJobs() {
  // Check for essential environment variables first
  if (!process.env.BACKEND_WALLET_PRIVATE_KEY || !process.env.RPC_URL) {
    console.warn("[Scheduler] Automated contract call jobs DISABLED due to missing BACKEND_WALLET_PRIVATE_KEY or RPC_URL.");
    return;
  }
  // Check if the contract ABI loaded correctly (imported from blockchainService)
  if (!contractABI) {
    console.warn("[Scheduler] Automated contract call jobs DISABLED due to ABI loading failure.");
    return;
  }

  // Define CRON_SCHEDULE *inside* the function to read env var at runtime
  const CRON_SCHEDULE = process.env.CRON_SCHEDULE_DEADLINE_CHECKS || '*/30 * * * *'; // Default: every 30 mins

  // Log the schedule being used
  console.log(`[Scheduler] Initializing cron job with schedule: "${CRON_SCHEDULE}"`);

  // Schedule the job using node-cron
  cron.schedule(CRON_SCHEDULE, checkAndProcessContractDeadlines, {
    scheduled: true,
    timezone: "America/New_York" // Optional: Set your server's timezone or make it configurable
  });

  console.log('[Scheduler] Automated contract deadline check job scheduled.');
}
