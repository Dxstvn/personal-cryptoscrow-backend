import { EventEmitter } from 'events';

/**
 * Event-driven Dispute Handler Service
 * Listens for dispute events and automatically resolves them after 7 days
 * Replaces the polling-based disputeMonitor.js with an event-driven approach
 */
class DisputeEventHandler extends EventEmitter {
    constructor(escrowService, databaseService) {
        super();
        this.escrowService = escrowService;
        this.databaseService = databaseService;
        this.activeTimers = new Map(); // dealId -> { timeoutId, disputeData }
        this.isRunning = false;
        
        // Bind event handlers
        this.handleDisputeRaised = this.handleDisputeRaised.bind(this);
        this.handleDisputeResolved = this.handleDisputeResolved.bind(this);
        this.handleDisputeUpdated = this.handleDisputeUpdated.bind(this);
    }

    /**
     * Start listening for dispute events
     */
    start() {
        if (this.isRunning) {
            console.log('[DisputeEventHandler] Already running');
            return;
        }

        console.log('[DisputeEventHandler] Starting event-driven dispute handler...');
        this.isRunning = true;

        // Listen for dispute events from database
        this.databaseService.on('disputeRaised', this.handleDisputeRaised);
        this.databaseService.on('disputeResolved', this.handleDisputeResolved);
        this.databaseService.on('disputeUpdated', this.handleDisputeUpdated);

        // Check for existing unresolved disputes on startup
        this._checkExistingDisputes();
    }

    /**
     * Stop listening for events and clear all timers
     */
    stop() {
        if (!this.isRunning) {
            return;
        }

        console.log('[DisputeEventHandler] Stopping dispute handler...');
        this.isRunning = false;

        // Remove event listeners
        this.databaseService.off('disputeRaised', this.handleDisputeRaised);
        this.databaseService.off('disputeResolved', this.handleDisputeResolved);
        this.databaseService.off('disputeUpdated', this.handleDisputeUpdated);

        // Clear all active timers
        for (const [dealId, timerData] of this.activeTimers) {
            clearTimeout(timerData.timeoutId);
        }
        this.activeTimers.clear();
    }

    /**
     * Handle dispute raised event
     */
    async handleDisputeRaised(dealId, disputeData) {
        console.log(`[DisputeEventHandler] Dispute raised for deal ${dealId}`);
        
        try {
            // Calculate time until auto-resolution using custom period
            const disputeTimestamp = disputeData.disputeTimestamp || Date.now();
            const customPeriodMs = disputeData.customDisputeResolutionPeriodMs || (7 * 24 * 60 * 60 * 1000); // Default to 7 days
            const timeUntilResolution = customPeriodMs - (Date.now() - disputeTimestamp);

            if (timeUntilResolution <= 0) {
                // Dispute already past deadline, resolve immediately
                console.log(`[DisputeEventHandler] Dispute for ${dealId} already past deadline, resolving immediately`);
                await this.autoResolveDispute(dealId, disputeData);
            } else {
                // Set timer for auto-resolution
                const hoursUntilResolution = Math.floor(timeUntilResolution / 1000 / 60 / 60);
                const daysUntilResolution = Math.floor(customPeriodMs / 1000 / 60 / 60 / 24);
                console.log(`[DisputeEventHandler] Setting timer for ${dealId} - auto-resolve in ${hoursUntilResolution} hours (${daysUntilResolution} day period)`);
                
                const timeoutId = setTimeout(() => {
                    this.autoResolveDispute(dealId, disputeData);
                }, timeUntilResolution);

                // Store timer reference
                this.activeTimers.set(dealId, {
                    timeoutId,
                    disputeData,
                    scheduledTime: Date.now() + timeUntilResolution
                });

                // Emit event for monitoring
                this.emit('disputeTimerSet', {
                    dealId,
                    scheduledTime: new Date(Date.now() + timeUntilResolution),
                    hoursRemaining: Math.floor(timeUntilResolution / 1000 / 60 / 60)
                });
            }
        } catch (error) {
            console.error(`[DisputeEventHandler] Error handling dispute for ${dealId}:`, error);
            this.emit('error', { dealId, error: error.message });
        }
    }

    /**
     * Handle dispute resolved event
     */
    handleDisputeResolved(dealId, resolutionData) {
        console.log(`[DisputeEventHandler] Dispute resolved for deal ${dealId}`);
        
        // Cancel any active timer for this dispute
        if (this.activeTimers.has(dealId)) {
            const timerData = this.activeTimers.get(dealId);
            clearTimeout(timerData.timeoutId);
            this.activeTimers.delete(dealId);
            
            console.log(`[DisputeEventHandler] Cancelled auto-resolution timer for ${dealId}`);
            
            // Emit event
            this.emit('disputeTimerCancelled', { dealId });
        }
    }

    /**
     * Handle dispute updated event
     */
    handleDisputeUpdated(dealId, updateData) {
        // If dispute was withdrawn or invalidated, cancel timer
        if (updateData.disputeWithdrawn || updateData.disputeInvalid) {
            this.handleDisputeResolved(dealId, updateData);
        }
    }

    /**
     * Auto-resolve dispute after timeout
     */
    async autoResolveDispute(dealId, disputeData) {
        try {
            console.log(`[DisputeEventHandler] Auto-resolving dispute for deal ${dealId}`);
            
            const { escrowId, chainId, contractAddress } = disputeData;
            
            if (!escrowId || !chainId) {
                throw new Error('Missing escrow ID or chain ID for auto-resolution');
            }

            // Get current dispute info from contract
            const disputeInfo = await this.escrowService.getDisputeInfo(escrowId, chainId, contractAddress);
            
            // Verify dispute is still unresolved
            if (!disputeInfo.disputeRaised || disputeInfo.disputeResolved) {
                console.log(`[DisputeEventHandler] Dispute for ${dealId} already resolved on-chain`);
                this.activeTimers.delete(dealId);
                return;
            }

            // Call escrowServiceV3 to return funds after timeout
            const result = await this.escrowService.returnFundsAfterDisputeTimeout(escrowId, {
                chainId,
                contractAddress
            });

            if (result.success) {
                console.log(`[DisputeEventHandler] ✅ Auto-resolved dispute for ${dealId} - funds returned to buyer`);
                
                // Update database
                await this.databaseService.updateDispute(escrowId, {
                    disputeResolved: true,
                    disputeResolvedTimestamp: new Date(),
                    disputeResolution: 'auto_refund_timeout',
                    resolutionTxHash: result.txHash
                });

                // Emit success event
                this.emit('disputeAutoResolved', {
                    dealId,
                    escrowId,
                    chainId,
                    resolution: 'refund_to_buyer',
                    reason: '7_day_timeout',
                    txHash: result.txHash
                });
            } else {
                throw new Error(result.error || 'Failed to auto-resolve dispute');
            }

            // Remove from active timers
            this.activeTimers.delete(dealId);

        } catch (error) {
            console.error(`[DisputeEventHandler] Error auto-resolving dispute for ${dealId}:`, error);
            
            // Emit error but keep timer active for retry
            this.emit('disputeResolutionError', {
                dealId,
                escrowId: disputeData.escrowId,
                error: error.message,
                willRetry: true
            });

            // Retry after 1 hour
            const retryTimeout = setTimeout(() => {
                this.autoResolveDispute(dealId, disputeData);
            }, 60 * 60 * 1000);

            // Update timer reference
            if (this.activeTimers.has(dealId)) {
                const timerData = this.activeTimers.get(dealId);
                timerData.timeoutId = retryTimeout;
                timerData.scheduledTime = Date.now() + (60 * 60 * 1000);
            }
        }
    }

    /**
     * Check for existing unresolved disputes on startup
     */
    async _checkExistingDisputes() {
        try {
            console.log('[DisputeEventHandler] Checking for existing unresolved disputes...');
            
            // Get all active disputes from database
            const activeDisputes = await this.databaseService.getActiveDisputes();
            
            if (activeDisputes.length === 0) {
                console.log('[DisputeEventHandler] No existing disputes found');
                return;
            }

            console.log(`[DisputeEventHandler] Found ${activeDisputes.length} existing disputes`);
            
            // Process each existing dispute
            for (const dispute of activeDisputes) {
                // Emit disputeRaised event to set up timers
                this.handleDisputeRaised(dispute.dealId || dispute.escrowId, {
                    escrowId: dispute.escrowId,
                    chainId: dispute.chainId,
                    contractAddress: dispute.contractAddress,
                    disputeTimestamp: dispute.disputeRaisedTimestamp || dispute.disputeTimestamp,
                    ...dispute
                });
            }
        } catch (error) {
            console.error('[DisputeEventHandler] Error checking existing disputes:', error);
            this.emit('error', { error: error.message });
        }
    }

    /**
     * Get status of all active timers
     */
    getActiveTimers() {
        const timers = [];
        for (const [dealId, timerData] of this.activeTimers) {
            const timeRemaining = timerData.scheduledTime - Date.now();
            timers.push({
                dealId,
                escrowId: timerData.disputeData.escrowId,
                scheduledTime: new Date(timerData.scheduledTime),
                hoursRemaining: Math.max(0, Math.floor(timeRemaining / 1000 / 60 / 60))
            });
        }
        return timers;
    }

    /**
     * Manually trigger resolution for a specific dispute
     */
    async resolveDisputeNow(dealId) {
        const timerData = this.activeTimers.get(dealId);
        if (!timerData) {
            throw new Error(`No active timer found for deal ${dealId}`);
        }

        // Clear the existing timer
        clearTimeout(timerData.timeoutId);
        
        // Resolve immediately
        await this.autoResolveDispute(dealId, timerData.disputeData);
    }
}

export default DisputeEventHandler;