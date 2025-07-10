const EventEmitter = require('events');
const { ethers } = require('ethers');

/**
 * Dispute Monitor Service
 * Monitors unresolved disputes and automatically resolves them after 7 days
 */
class DisputeMonitor extends EventEmitter {
    constructor(escrowService, databaseService) {
        super();
        this.escrowService = escrowService;
        this.databaseService = databaseService;
        this.checkInterval = 60 * 60 * 1000; // Check every hour
        this.isRunning = false;
        this.intervalId = null;
    }

    /**
     * Start monitoring disputes
     */
    start() {
        if (this.isRunning) {
            console.log('Dispute monitor already running');
            return;
        }

        console.log('Starting dispute monitor...');
        this.isRunning = true;

        // Run immediately
        this._checkDisputes();

        // Then run periodically
        this.intervalId = setInterval(() => {
            this._checkDisputes();
        }, this.checkInterval);
    }

    /**
     * Stop monitoring
     */
    stop() {
        if (!this.isRunning) {
            return;
        }

        console.log('Stopping dispute monitor...');
        this.isRunning = false;

        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }

    /**
     * Check all active disputes
     */
    async _checkDisputes() {
        try {
            console.log('[DisputeMonitor] Checking for unresolved disputes...');

            // Get all escrows with active disputes from database
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

    /**
     * Check a single dispute
     */
    async _checkSingleDispute(escrowRecord) {
        try {
            const { escrowId, chainId, contractAddress, disputeRaisedTimestamp } = escrowRecord;
            
            // Skip if no dispute timestamp
            if (!disputeRaisedTimestamp) {
                return;
            }

            // Calculate time since dispute was raised
            const disputeAge = Date.now() - new Date(disputeRaisedTimestamp).getTime();
            const sevenDaysInMs = 7 * 24 * 60 * 60 * 1000;

            console.log(`[DisputeMonitor] Checking dispute for escrow ${escrowId}`);
            console.log(`[DisputeMonitor] Dispute age: ${Math.floor(disputeAge / 1000 / 60 / 60)} hours`);

            // Check if dispute is older than 7 days
            if (disputeAge > sevenDaysInMs) {
                console.log(`[DisputeMonitor] Dispute for escrow ${escrowId} is older than 7 days. Auto-resolving...`);
                
                try {
                    // Get on-chain dispute info to verify
                    const disputeInfo = await this.escrowService.getDisputeInfo(escrowId, chainId, contractAddress);
                    
                    // Verify dispute is still unresolved on-chain
                    if (disputeInfo.disputeRaised && !disputeInfo.disputeResolved) {
                        // Auto-resolve in favor of buyer (return funds)
                        const result = await this.escrowService.resolveDispute(
                            escrowId,
                            false, // false = return to buyer
                            chainId,
                            contractAddress
                        );

                        if (result.success) {
                            console.log(`[DisputeMonitor] ✅ Auto-resolved dispute for escrow ${escrowId} - funds returned to buyer`);
                            
                            // Update database
                            await this.databaseService.updateDispute(escrowId, {
                                disputeResolved: true,
                                disputeResolvedTimestamp: new Date(),
                                disputeResolution: 'auto_refund_timeout',
                                resolutionTxHash: result.txHash
                            });

                            // Emit event for notification service
                            this.emit('disputeAutoResolved', {
                                escrowId,
                                chainId,
                                resolution: 'refund_to_buyer',
                                reason: '7_day_timeout',
                                txHash: result.txHash
                            });
                        } else {
                            console.error(`[DisputeMonitor] Failed to auto-resolve dispute for escrow ${escrowId}:`, result.error);
                        }
                    } else {
                        // Dispute already resolved on-chain, update database
                        console.log(`[DisputeMonitor] Dispute for escrow ${escrowId} already resolved on-chain`);
                        await this.databaseService.updateDispute(escrowId, {
                            disputeResolved: true,
                            disputeResolvedTimestamp: new Date()
                        });
                    }
                } catch (error) {
                    console.error(`[DisputeMonitor] Error resolving dispute for escrow ${escrowId}:`, error);
                    
                    // Emit error but continue processing other disputes
                    this.emit('disputeResolutionError', {
                        escrowId,
                        chainId,
                        error: error.message
                    });
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
     * Manually trigger dispute check
     */
    async checkNow() {
        console.log('[DisputeMonitor] Manual dispute check triggered');
        await this._checkDisputes();
    }

    /**
     * Get status of a specific dispute
     */
    async getDisputeStatus(escrowId, chainId, contractAddress) {
        try {
            const escrowRecord = await this.databaseService.getEscrowById(escrowId);
            const disputeInfo = await this.escrowService.getDisputeInfo(escrowId, chainId, contractAddress);
            
            if (!disputeInfo.disputeRaised) {
                return {
                    status: 'no_dispute',
                    canAutoResolve: false
                };
            }

            if (disputeInfo.disputeResolved) {
                return {
                    status: 'resolved',
                    resolvedAt: disputeInfo.disputeResolvedTimestamp,
                    canAutoResolve: false
                };
            }

            // Calculate time remaining
            const disputeAge = Date.now() - new Date(disputeInfo.disputeRaisedTimestamp).getTime();
            const sevenDaysInMs = 7 * 24 * 60 * 60 * 1000;
            const timeRemaining = sevenDaysInMs - disputeAge;

            return {
                status: 'active',
                raisedBy: disputeInfo.disputeRaisedBy,
                reason: disputeInfo.disputeReason,
                raisedAt: disputeInfo.disputeRaisedTimestamp,
                canAutoResolve: timeRemaining <= 0,
                timeRemaining: timeRemaining > 0 ? timeRemaining : 0,
                hoursRemaining: Math.ceil(timeRemaining / 1000 / 60 / 60)
            };
        } catch (error) {
            console.error('[DisputeMonitor] Error getting dispute status:', error);
            throw error;
        }
    }
}

module.exports = DisputeMonitor;