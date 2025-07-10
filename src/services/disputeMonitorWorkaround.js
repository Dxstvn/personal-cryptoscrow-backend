const EventEmitter = require('events');

/**
 * Dispute Monitor Service with Workaround
 * 
 * Due to a Hardhat environment issue with returnFundsAfterDisputeTimeout,
 * this version uses resolveDispute(escrowId, true) to release funds to seller
 * when appropriate, and tracks refunds separately for manual processing.
 */
class DisputeMonitorWorkaround extends EventEmitter {
    constructor(escrowService, databaseService) {
        super();
        this.escrowService = escrowService;
        this.databaseService = databaseService;
        this.checkInterval = 60 * 60 * 1000; // Check every hour
        this.isRunning = false;
        this.intervalId = null;
    }

    start() {
        if (this.isRunning) {
            console.log('Dispute monitor already running');
            return;
        }

        console.log('Starting dispute monitor (with workaround)...');
        this.isRunning = true;

        // Run immediately
        this._checkDisputes();

        // Then run periodically
        this.intervalId = setInterval(() => {
            this._checkDisputes();
        }, this.checkInterval);
    }

    stop() {
        if (!this.isRunning) return;

        console.log('Stopping dispute monitor...');
        this.isRunning = false;

        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }

    async _checkDisputes() {
        try {
            console.log('[DisputeMonitor] Checking for unresolved disputes...');

            const activeDisputes = await this.databaseService.getActiveDisputes();
            
            if (activeDisputes.length === 0) {
                console.log('[DisputeMonitor] No active disputes found');
                return;
            }

            console.log(`[DisputeMonitor] Found ${activeDisputes.length} active disputes`);

            for (const escrowRecord of activeDisputes) {
                await this._checkSingleDispute(escrowRecord);
            }
        } catch (error) {
            console.error('[DisputeMonitor] Error checking disputes:', error);
            this.emit('error', error);
        }
    }

    async _checkSingleDispute(escrowRecord) {
        try {
            const { escrowId, chainId, contractAddress, disputeRaisedTimestamp } = escrowRecord;
            
            if (!disputeRaisedTimestamp) return;

            const disputeAge = Date.now() - new Date(disputeRaisedTimestamp).getTime();
            const sevenDaysInMs = 7 * 24 * 60 * 60 * 1000;

            console.log(`[DisputeMonitor] Checking dispute for escrow ${escrowId}`);
            console.log(`[DisputeMonitor] Dispute age: ${Math.floor(disputeAge / 1000 / 60 / 60)} hours`);

            if (disputeAge > sevenDaysInMs) {
                console.log(`[DisputeMonitor] Dispute for escrow ${escrowId} is older than 7 days.`);
                
                try {
                    // Get on-chain dispute info
                    const disputeInfo = await this.escrowService.getDisputeInfo(escrowId, chainId, contractAddress);
                    
                    if (disputeInfo.disputeRaised && !disputeInfo.disputeResolved) {
                        console.log(`[DisputeMonitor] ⚠️  ATTENTION REQUIRED: Escrow ${escrowId} needs manual refund`);
                        
                        // Update database to flag for manual processing
                        await this.databaseService.updateDispute(escrowId, {
                            requiresManualRefund: true,
                            manualRefundReason: 'auto_refund_timeout',
                            flaggedForRefundAt: new Date()
                        });

                        // Emit event for notification service
                        this.emit('disputeRequiresManualRefund', {
                            escrowId,
                            chainId,
                            contractAddress,
                            reason: '7_day_timeout',
                            disputeInfo
                        });

                        // Log for operations team
                        console.log(`[DisputeMonitor] 🚨 Manual refund required for escrow ${escrowId}`);
                        console.log(`[DisputeMonitor] To refund, use: escrowService.resolveDispute('${escrowId}', false, ${chainId}, '${contractAddress}')`);
                        console.log(`[DisputeMonitor] Or use the admin panel to process the refund`);
                    }
                } catch (error) {
                    console.error(`[DisputeMonitor] Error processing dispute for escrow ${escrowId}:`, error);
                    this.emit('disputeProcessingError', { escrowId, chainId, error: error.message });
                }
            } else {
                const hoursRemaining = Math.ceil((sevenDaysInMs - disputeAge) / 1000 / 60 / 60);
                console.log(`[DisputeMonitor] Dispute for escrow ${escrowId} has ${hoursRemaining} hours remaining`);
            }
        } catch (error) {
            console.error(`[DisputeMonitor] Error processing dispute for escrow ${escrowRecord.escrowId}:`, error);
        }
    }

    /**
     * Get all disputes requiring manual refund
     */
    async getDisputesRequiringRefund() {
        try {
            const db = await this.databaseService.getDb();
            const snapshot = await db.collection('escrows')
                .where('requiresManualRefund', '==', true)
                .where('disputeResolved', '!=', true)
                .get();

            if (snapshot.empty) {
                return [];
            }

            return snapshot.docs.map(doc => ({
                escrowId: doc.id,
                ...doc.data()
            }));
        } catch (error) {
            console.error('[DisputeMonitor] Error fetching disputes requiring refund:', error);
            return [];
        }
    }

    /**
     * Process a manual refund
     */
    async processManualRefund(escrowId, chainId, contractAddress) {
        try {
            console.log(`[DisputeMonitor] Processing manual refund for escrow ${escrowId}...`);
            
            // Note: In production environment, resolveDispute(false) should work correctly
            // This is a workaround for the Hardhat testing environment issue
            const result = await this.escrowService.resolveDispute(escrowId, false, chainId, contractAddress);
            
            if (result.success) {
                console.log(`[DisputeMonitor] ✅ Manual refund processed for escrow ${escrowId}`);
                
                await this.databaseService.updateDispute(escrowId, {
                    disputeResolved: true,
                    disputeResolvedTimestamp: new Date(),
                    disputeResolution: 'manual_refund_timeout',
                    requiresManualRefund: false,
                    resolutionTxHash: result.txHash
                });

                this.emit('manualRefundProcessed', {
                    escrowId,
                    chainId,
                    txHash: result.txHash
                });

                return { success: true, txHash: result.txHash };
            } else {
                throw new Error(result.error || 'Failed to process refund');
            }
        } catch (error) {
            console.error(`[DisputeMonitor] Error processing manual refund for escrow ${escrowId}:`, error);
            return { success: false, error: error.message };
        }
    }

    async checkNow() {
        console.log('[DisputeMonitor] Manual dispute check triggered');
        await this._checkDisputes();
    }
}

module.exports = DisputeMonitorWorkaround;