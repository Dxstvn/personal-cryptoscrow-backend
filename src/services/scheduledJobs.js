// src/jobs/scheduledJobs.js
import cron from 'node-cron';
import {
  getDealsPastFinalApproval,
  getDealsPastDisputeDeadline,
  updateDealStatusInDB
} from '../services/databaseService.js'; // Adjust path if databaseService.js is elsewhere
import {
  triggerReleaseAfterApproval,
  triggerCancelAfterDisputeDeadline
} from '../services/blockchainService.js'; // Adjust path

const CRON_SCHEDULE = process.env.CRON_SCHEDULE_DEADLINE_CHECKS || '*/30 * * * *'; // Default: every 30 mins

let isJobRunning = false; // Simple lock to prevent concurrent runs

/**
 * Main job function to check and process contract deadlines.
 */
export async function checkAndProcessContractDeadlines() {
  if (isJobRunning) {
    console.log('[Scheduler] Deadline check job already running. Skipping this cycle.');
    return;
  }
  isJobRunning = true;
  console.log(`[Scheduler] Running job to check contract deadlines at ${new Date().toISOString()}...`);

  try {
    // 1. Check for releases after final approval period
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
      // Important: Add a check here to ensure the contract is still in the expected state on-chain if necessary,
      // though releaseFundsAfterApprovalPeriod itself has checks.

      const result = await triggerReleaseAfterApproval(deal.smartContractAddress, deal.id);
      if (result && result.success) {
        await updateDealStatusInDB(
          deal.id,
          'COMPLETED', // Or whatever status your contract transitions to
          `Funds automatically released after approval period. Tx: ${result.receipt?.transactionHash}`,
          result.receipt?.transactionHash
        );
        console.log(`[Scheduler] Successfully processed auto-release for deal ${deal.id}.`);
      } else {
        console.error(`[Scheduler] FAILED to process auto-release for deal ${deal.id}:`, result?.error?.message || 'Unknown error');
        // Implement more robust error handling: e.g., mark for manual review, retry logic with backoff for specific errors
        await updateDealStatusInDB(
            deal.id,
            deal.status, // Keep current status or a specific error status
            `Attempted auto-release for deal ${deal.id} FAILED. Error: ${result?.error?.message || 'Unknown error'}. Needs review.`
        );
      }
    }

    // 2. Check for cancellations after dispute resolution deadline
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
      // Similar to above, on-chain state checks can be added if the contract function isn't fully protective.

      const result = await triggerCancelAfterDisputeDeadline(deal.smartContractAddress, deal.id);
      if (result && result.success) {
        await updateDealStatusInDB(
          deal.id,
          'CANCELLED', // Or whatever status your contract transitions to
          `Escrow automatically cancelled and refunded after dispute deadline. Tx: ${result.receipt?.transactionHash}`,
          result.receipt?.transactionHash
        );
        console.log(`[Scheduler] Successfully processed auto-cancellation for deal ${deal.id}.`);
      } else {
        console.error(`[Scheduler] FAILED to process auto-cancellation for deal ${deal.id}:`, result?.error?.message || 'Unknown error');
        await updateDealStatusInDB(
            deal.id,
            deal.status, // Keep current status or a specific error status
            `Attempted auto-cancellation for deal ${deal.id} FAILED. Error: ${result?.error?.message || 'Unknown error'}. Needs review.`
        );
      }
    }

  } catch (error) {
    console.error('[Scheduler] CRITICAL ERROR in deadline check job:', error);
  } finally {
    isJobRunning = false;
    console.log(`[Scheduler] Deadline check job finished at ${new Date().toISOString()}.`);
  }
}

/**
 * Initializes and starts the scheduled jobs.
 */
export function startScheduledJobs() {
  if (!process.env.BACKEND_WALLET_PRIVATE_KEY || !process.env.RPC_URL) {
    console.warn("[Scheduler] Automated contract call jobs DISABLED due to missing BACKEND_WALLET_PRIVATE_KEY or RPC_URL.");
    return;
  }
  if (!contractABI) { // Check if ABI loaded correctly in blockchainService
    console.warn("[Scheduler] Automated contract call jobs DISABLED due to ABI loading failure.");
    return;
  }

  console.log(`[Scheduler] Initializing cron job with schedule: "${CRON_SCHEDULE}"`);
  cron.schedule(CRON_SCHEDULE, checkAndProcessContractDeadlines, {
    scheduled: true,
    timezone: "America/New_York" // Optional: Set your server's timezone
  });

  console.log('[Scheduler] Automated contract deadline check job scheduled.');

  // Optionally, run once on startup for immediate checks (after a short delay)
  // setTimeout(() => {
  //   console.log("[Scheduler] Running initial deadline check on startup...");
  //   checkAndProcessContractDeadlines();
  // }, 10000); // e.g., 10 seconds after startup
}
