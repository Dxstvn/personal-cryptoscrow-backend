// src/services/scheduledJobs.js
import cron from 'node-cron';
import {
  getDealsPastFinalApproval,
  getDealsPastDisputeDeadline,
  updateDealStatusInDB,
  getCrossChainDealsPendingMonitoring,
  getCrossChainTransactionsPendingCheck,
  getCrossChainDealsStuck,
  getCrossChainDealsPastFinalApproval,
  getCrossChainDealsPastDisputeDeadline,
  updateCrossChainDealStatus
} from './databaseService.js';

// Import the entire blockchainService module as a namespace
import * as blockchainService from './blockchainService.js';
// Import the entire crossChainService module as a namespace
import * as crossChainService from './crossChainService.js';
import { Timestamp } from 'firebase-admin/firestore';

// Module-level variables to prevent concurrent job runs
let _isJobRunning = false;
let _isCrossChainJobRunning = false;

/**
 * @internal Resets the job running flags. FOR TESTING PURPOSES ONLY.
 */
export function __TEST_ONLY_resetJobRunningFlag() {
  if (process.env.NODE_ENV === 'test') {
    console.log('[TEST ENV DEBUG] __TEST_ONLY_resetJobRunningFlag called: Setting flags to false.');
  }
  _isJobRunning = false;
  _isCrossChainJobRunning = false;
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
    // Handle regular blockchain deals
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

    // Handle cross-chain deals past final approval
    const crossChainDealsPastFinalApproval = await getCrossChainDealsPastFinalApproval();
    if (process.env.NODE_ENV === 'test') {
        console.log(`[TEST ENV DEBUG] Raw crossChainDealsPastFinalApproval from databaseService:`, JSON.stringify(crossChainDealsPastFinalApproval, null, 2));
    }
    for (const deal of crossChainDealsPastFinalApproval) {
      console.log(`[Scheduler] Processing cross-chain auto-release for deal ${deal.id}`);
      
      // ✅ NEW: Use simplified cross-chain release function that works like blockchainService
      const crossChainReleaseResult = await crossChainService.triggerCrossChainReleaseAfterApprovalSimple(deal.smartContractAddress, deal.id);
      
      if (crossChainReleaseResult.success) {
        console.log(`[Scheduler] Successfully processed cross-chain auto-release for deal ${deal.id}. Tx: ${crossChainReleaseResult.receipt?.transactionHash}`);
        await updateCrossChainDealStatus(deal.id, {
          status: 'CrossChainFundsReleased',
          crossChainTxHash: crossChainReleaseResult.receipt?.transactionHash,
          lastAutomaticProcessAttempt: Timestamp.now(),
          timelineEventMessage: `Successfully auto-released cross-chain funds. ${crossChainReleaseResult.message}`
        });
      } else {
        console.error(`[Scheduler] FAILED to process cross-chain auto-release for deal ${deal.id}. Error:`, crossChainReleaseResult.error);
        await updateCrossChainDealStatus(deal.id, {
          status: crossChainReleaseResult.requiresManualIntervention ? 'CrossChainReleaseRequiresIntervention' : 'CrossChainAutoReleaseFailed',
          processingError: `Cross-chain call failed: ${crossChainReleaseResult.error}`,
          lastAutomaticProcessAttempt: Timestamp.now(),
          timelineEventMessage: `FAILED to process cross-chain auto-release. Error: ${crossChainReleaseResult.error}`
        });
      }
    }

    // ✅ NEW: Handle cross-chain deals past dispute deadline  
    const crossChainDealsPastDisputeDeadline = await getCrossChainDealsPastDisputeDeadline();
    if (process.env.NODE_ENV === 'test') {
        console.log(`[TEST ENV DEBUG] Raw crossChainDealsPastDisputeDeadline from databaseService:`, JSON.stringify(crossChainDealsPastDisputeDeadline, null, 2));
    }
    for (const deal of crossChainDealsPastDisputeDeadline) {
      console.log(`[Scheduler] Processing cross-chain auto-cancellation for deal ${deal.id}`);
      
      // ✅ NEW: Use simplified cross-chain cancellation function that works like blockchainService
      const crossChainCancelResult = await crossChainService.triggerCrossChainCancelAfterDisputeDeadline(deal.smartContractAddress, deal.id);
      
      if (crossChainCancelResult.success) {
        console.log(`[Scheduler] Successfully processed cross-chain auto-cancellation for deal ${deal.id}. Tx: ${crossChainCancelResult.receipt?.transactionHash}`);
        await updateCrossChainDealStatus(deal.id, {
          status: 'CrossChainCancelledAfterDisputeDeadline',
          crossChainTxHash: crossChainCancelResult.receipt?.transactionHash,
          lastAutomaticProcessAttempt: Timestamp.now(),
          timelineEventMessage: `Successfully auto-cancelled cross-chain deal. ${crossChainCancelResult.message}`
        });
      } else {
        console.error(`[Scheduler] FAILED to process cross-chain auto-cancellation for deal ${deal.id}. Error:`, crossChainCancelResult.error);
        await updateCrossChainDealStatus(deal.id, {
          status: 'CrossChainAutoCancellationFailed',
          processingError: `Cross-chain cancellation failed: ${crossChainCancelResult.error}`,
          lastAutomaticProcessAttempt: Timestamp.now(),
          timelineEventMessage: `FAILED to process cross-chain auto-cancellation. Error: ${crossChainCancelResult.error}`
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
 * Cross-chain monitoring job function to check pending transactions and stuck deals.
 */
export async function checkAndProcessCrossChainTransactions() {
  if (_isCrossChainJobRunning) {
    console.log('[Scheduler] Cross-chain monitoring job already running. Skipping this cycle.');
    return;
  }
  _isCrossChainJobRunning = true;

  console.log(`[Scheduler] Starting cross-chain monitoring job at ${new Date().toISOString()}...`);

  try {
    // Check pending cross-chain transactions
    const pendingTransactions = await getCrossChainTransactionsPendingCheck();
    console.log(`[Scheduler] Found ${pendingTransactions.length} pending cross-chain transactions to check`);
    
    for (const transaction of pendingTransactions) {
      console.log(`[Scheduler] Checking status for cross-chain transaction ${transaction.id}`);
      const statusResult = await crossChainService.checkPendingTransactionStatus(transaction.id);
      
      if (statusResult.success && statusResult.updated) {
        console.log(`[Scheduler] Updated cross-chain transaction ${transaction.id} status to ${statusResult.status}`);
        
        // Update associated deal if transaction completed
        if (transaction.dealId && statusResult.status === 'completed') {
          await updateCrossChainDealStatus(transaction.dealId, {
            status: 'CrossChainCompleted',
            crossChainTxHash: transaction.id,
            lastAutomaticProcessAttempt: Timestamp.now(),
            timelineEventMessage: `Cross-chain transaction completed successfully. Transaction: ${transaction.id}`
          });
        }
      } else if (!statusResult.success) {
        console.warn(`[Scheduler] Failed to check status for transaction ${transaction.id}:`, statusResult.error);
      }
    }

    // Handle stuck cross-chain deals
    const stuckDeals = await getCrossChainDealsStuck();
    console.log(`[Scheduler] Found ${stuckDeals.length} potentially stuck cross-chain deals`);
    
    for (const deal of stuckDeals) {
      // Get cross-chain transactions for this deal
      const dealTransactions = await crossChainService.getCrossChainTransactionsForDeal(deal.id);
      const stuckTransaction = dealTransactions.find(tx => 
        tx.status === 'in_progress' || tx.status === 'prepared'
      );
      
      if (stuckTransaction) {
        console.log(`[Scheduler] Handling stuck cross-chain transaction ${stuckTransaction.id} for deal ${deal.id}`);
        const handleResult = await crossChainService.handleStuckCrossChainTransaction(stuckTransaction.id);
        
        if (handleResult.success) {
          console.log(`[Scheduler] Handled stuck transaction ${stuckTransaction.id}: ${handleResult.message}`);
          
          if (handleResult.requiresManualIntervention) {
            await updateCrossChainDealStatus(deal.id, {
              status: 'CrossChainStuck',
              processingError: `Transaction stuck: ${handleResult.message}`,
              lastAutomaticProcessAttempt: Timestamp.now(),
              timelineEventMessage: `Cross-chain transaction marked as stuck - manual intervention required`
            });
          }
        } else {
          console.error(`[Scheduler] Failed to handle stuck transaction ${stuckTransaction.id}:`, handleResult.error);
        }
      }
    }

  } catch (error) {
    console.error('[Scheduler] CRITICAL ERROR in cross-chain monitoring job:', error);
  } finally {
    _isCrossChainJobRunning = false;
    console.log(`[Scheduler] Cross-chain monitoring job finished at ${new Date().toISOString()}.`);
  }
}

/**
 * Initializes and starts the scheduled jobs.
 */
export function startScheduledJobs() {
  // Check blockchain service availability
  let abiValueForLog;
  try {
    abiValueForLog = blockchainService.contractABI;
  } catch (e) {
    abiValueForLog = `Error accessing ABI: ${e.message}`;
  }
  console.log(`[SUT startScheduledJobs] Entry. process.env.NODE_ENV: ${process.env.NODE_ENV}. blockchainService.contractABI perceived as: ${JSON.stringify(abiValueForLog)} (type: ${typeof abiValueForLog}, length: ${abiValueForLog && typeof abiValueForLog.length !== 'undefined' ? abiValueForLog.length : 'N/A'})`);

  const missingEnvVars = [];
  if (!process.env.BACKEND_WALLET_PRIVATE_KEY) missingEnvVars.push('BACKEND_WALLET_PRIVATE_KEY');
  if (!process.env.RPC_URL) missingEnvVars.push('RPC_URL');

  if (missingEnvVars.length > 0) {
    console.warn(`[Scheduler] Automated contract call jobs DISABLED due to missing: ${missingEnvVars.join(', ')}.`);
    return;
  }

  // Check if blockchain service ABI is available
  const currentABI = blockchainService.contractABI;
  console.log(`[SUT DEBUG startScheduledJobs] Value of currentABI after access inside SUT: ${JSON.stringify(currentABI)}`);

  const blockchainAvailable = currentABI && (!Array.isArray(currentABI) || currentABI.length > 0);
  
  if (!blockchainAvailable) {
    console.warn("[Scheduler] Blockchain service ABI not available - blockchain jobs will be disabled.");
  }

  // Check cron schedule validity
  const CRON_SCHEDULE = process.env.CRON_SCHEDULE_DEADLINE_CHECKS || '*/30 * * * *';
  const CROSS_CHAIN_CRON_SCHEDULE = process.env.CRON_SCHEDULE_CROSS_CHAIN_CHECKS || '*/15 * * * *';
  
  if (!cron.validate(CRON_SCHEDULE)) {
    console.error(`[Scheduler] Invalid CRON_SCHEDULE: "${CRON_SCHEDULE}". Deadline check jobs will not start.`);
    return;
  }
  
  if (!cron.validate(CROSS_CHAIN_CRON_SCHEDULE)) {
    console.error(`[Scheduler] Invalid CROSS_CHAIN_CRON_SCHEDULE: "${CROSS_CHAIN_CRON_SCHEDULE}". Cross-chain jobs will not start.`);
    return;
  }

  // Start main deadline check job (includes cross-chain deadline processing)
  if (blockchainAvailable) {
    console.log(`[Scheduler] Initializing deadline check cron job with schedule: "${CRON_SCHEDULE}"`);
    console.log("[SUT DEBUG startScheduledJobs] ABOUT TO CALL CRON.SCHEDULE for deadline checks. UNIQUE_LOG_POINT_GAMMA");
    cron.schedule(CRON_SCHEDULE, checkAndProcessContractDeadlines, {
      scheduled: true,
      timezone: "America/New_York"
    });
    console.log('[Scheduler] Deadline check job scheduled successfully.');
  } else {
    console.warn('[Scheduler] Skipping deadline check job - blockchain service not available.');
  }

  // Start cross-chain monitoring job (independent of blockchain service)
  console.log(`[Scheduler] Initializing cross-chain monitoring cron job with schedule: "${CROSS_CHAIN_CRON_SCHEDULE}"`);
  cron.schedule(CROSS_CHAIN_CRON_SCHEDULE, checkAndProcessCrossChainTransactions, {
    scheduled: true,
    timezone: "America/New_York"
  });
  console.log('[Scheduler] Cross-chain monitoring job scheduled successfully.');

  console.log('[Scheduler] All scheduled jobs initialized successfully.');
}
