/**
 * Dispute Resolution Integration
 * 
 * This module integrates dispute monitoring and resolution into the backend.
 */

import DisputeMonitor from './disputeMonitor.js';
import * as databaseService from './databaseService.js';
import escrowServiceV3 from './escrowServiceV3.js';

class DisputeIntegration {
    constructor() {
        this.monitor = new DisputeMonitor(escrowServiceV3, databaseService);
        this.setupEventHandlers();
    }

    /**
     * Start the dispute monitoring service
     */
    start() {
        console.log('[DisputeIntegration] Starting dispute resolution service...');
        this.monitor.start();
    }

    /**
     * Stop the dispute monitoring service
     */
    stop() {
        console.log('[DisputeIntegration] Stopping dispute resolution service...');
        this.monitor.stop();
    }

    /**
     * Setup event handlers for dispute events
     */
    setupEventHandlers() {
        // Handle automatic dispute resolution
        this.monitor.on('disputeAutoResolved', async (data) => {
            console.log('[DisputeIntegration] Dispute auto-resolved:', data);
            
            try {
                // Send notification to buyer
                await this.notifyUser(data.escrowId, 'buyer', {
                    type: 'dispute_auto_resolved',
                    message: 'Your dispute has been automatically resolved due to timeout. Funds have been returned.',
                    txHash: data.txHash
                });

                // Send notification to seller
                await this.notifyUser(data.escrowId, 'seller', {
                    type: 'dispute_auto_resolved', 
                    message: 'The dispute has been automatically resolved due to timeout. Funds returned to buyer.',
                    txHash: data.txHash
                });
            } catch (error) {
                console.error('[DisputeIntegration] Error sending notifications:', error);
            }
        });

        // Handle resolution errors
        this.monitor.on('disputeResolutionError', async (data) => {
            console.error('[DisputeIntegration] Dispute resolution error:', data);
            
            // Alert operations team
            await this.alertOperations({
                type: 'dispute_resolution_failed',
                escrowId: data.escrowId,
                error: data.error,
                action: 'manual_intervention_required'
            });
        });

        // Handle general errors
        this.monitor.on('error', (error) => {
            console.error('[DisputeIntegration] Monitor error:', error);
        });
    }

    /**
     * Manually check disputes (for testing or admin use)
     */
    async checkDisputesNow() {
        return await this.monitor.checkNow();
    }

    /**
     * Get status of a specific dispute
     */
    async getDisputeStatus(escrowId, chainId, contractAddress) {
        return await this.monitor.getDisputeStatus(escrowId, chainId, contractAddress);
    }

    /**
     * Process manual refund (admin function)
     */
    async processManualRefund(escrowId, chainId, contractAddress) {
        try {
            console.log(`[DisputeIntegration] Admin initiated manual refund for escrow ${escrowId}`);
            
            // Resolve dispute in buyer's favor
            const result = await escrowServiceV3.resolveDispute(
                escrowId,
                false, // false = refund to buyer
                chainId,
                contractAddress
            );

            if (result.success) {
                // Update database
                await databaseService.updateDispute(escrowId, {
                    disputeResolved: true,
                    disputeResolvedTimestamp: new Date(),
                    disputeResolution: 'admin_manual_refund',
                    resolutionTxHash: result.txHash
                });

                // Send notifications
                await this.notifyUser(escrowId, 'buyer', {
                    type: 'dispute_resolved',
                    message: 'Your dispute has been resolved. Funds have been returned.',
                    txHash: result.txHash
                });

                await this.notifyUser(escrowId, 'seller', {
                    type: 'dispute_resolved',
                    message: 'The dispute has been resolved. Funds returned to buyer.',
                    txHash: result.txHash
                });

                return { success: true, txHash: result.txHash };
            } else {
                throw new Error(result.error || 'Failed to process refund');
            }
        } catch (error) {
            console.error('[DisputeIntegration] Error processing manual refund:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Notify user (stub - implement based on your notification system)
     */
    async notifyUser(escrowId, userType, notification) {
        console.log(`[DisputeIntegration] Notifying ${userType} for escrow ${escrowId}:`, notification);
        // TODO: Implement actual notification logic (email, push, etc.)
    }

    /**
     * Alert operations team (stub - implement based on your alerting system)
     */
    async alertOperations(alert) {
        console.error('[DisputeIntegration] OPERATIONS ALERT:', alert);
        // TODO: Implement actual alerting (PagerDuty, Slack, etc.)
    }

    /**
     * Get dispute statistics
     */
    async getDisputeStats() {
        try {
            const activeDisputes = await databaseService.getActiveDisputes();
            const now = Date.now();
            const sevenDaysInMs = 7 * 24 * 60 * 60 * 1000;
            
            const stats = {
                total: activeDisputes.length,
                requiresAction: 0,
                pendingResolution: 0,
                approachingDeadline: 0
            };

            for (const dispute of activeDisputes) {
                if (dispute.disputeRaisedTimestamp) {
                    const age = now - new Date(dispute.disputeRaisedTimestamp).getTime();
                    
                    if (age > sevenDaysInMs) {
                        stats.requiresAction++;
                    } else if (age > sevenDaysInMs - 24 * 60 * 60 * 1000) {
                        stats.approachingDeadline++;
                    } else {
                        stats.pendingResolution++;
                    }
                }
            }

            return stats;
        } catch (error) {
            console.error('[DisputeIntegration] Error getting dispute stats:', error);
            return null;
        }
    }
}

// Export singleton instance
const disputeIntegration = new DisputeIntegration();
export default disputeIntegration;

// Also export the class for testing
export { DisputeIntegration };