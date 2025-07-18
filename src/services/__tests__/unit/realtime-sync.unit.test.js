/**
 * Unit tests for real-time synchronization system
 * Tests event handling and timer logic without blockchain
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'events';
import DisputeEventHandler from '../../disputeEventHandler.js';

describe('Real-time Synchronization Unit Tests', () => {
    
    describe('DisputeEventHandler', () => {
        let disputeHandler;
        let mockEscrowService;
        let mockDatabaseService;
        let mockDatabaseEvents;

        beforeEach(() => {
            // Create mock database events
            mockDatabaseEvents = new EventEmitter();
            
            // Create mock services
            mockEscrowService = {
                getDisputeInfo: vi.fn(),
                returnFundsAfterDisputeTimeout: vi.fn()
            };

            mockDatabaseService = Object.assign(Object.create(mockDatabaseEvents), {
                getActiveDisputes: vi.fn().mockResolvedValue([]),
                updateDispute: vi.fn().mockResolvedValue({ success: true }),
                on: mockDatabaseEvents.on.bind(mockDatabaseEvents),
                off: mockDatabaseEvents.off.bind(mockDatabaseEvents),
                emit: mockDatabaseEvents.emit.bind(mockDatabaseEvents)
            });

            // Create handler
            disputeHandler = new DisputeEventHandler(mockEscrowService, mockDatabaseService);
        });

        afterEach(() => {
            if (disputeHandler) {
                disputeHandler.stop();
            }
            vi.clearAllMocks();
        });

        describe('Timer Management', () => {
            it('should set timer when dispute is raised', async () => {
                const dealId = 'test-deal-123';
                let timerSet = false;

                disputeHandler.on('disputeTimerSet', ({ dealId: setDealId }) => {
                    if (setDealId === dealId) {
                        timerSet = true;
                    }
                });

                disputeHandler.start();

                // Emit dispute raised event
                mockDatabaseEvents.emit('disputeRaised', dealId, {
                    dealId,
                    escrowId: '0x123',
                    chainId: 11155111,
                    contractAddress: '0xabc',
                    disputeTimestamp: Date.now(),
                    reason: 'Test dispute'
                });

                // Wait for async operations
                await new Promise(resolve => setTimeout(resolve, 100));

                expect(timerSet).toBe(true);
                
                // Check active timers
                const activeTimers = disputeHandler.getActiveTimers();
                expect(activeTimers).toHaveLength(1);
                expect(activeTimers[0].dealId).toBe(dealId);
                expect(activeTimers[0].hoursRemaining).toBe(167); // ~7 days
            });

            it('should cancel timer when dispute is resolved', async () => {
                const dealId = 'test-deal-456';
                let timerCancelled = false;

                disputeHandler.on('disputeTimerCancelled', ({ dealId: cancelledId }) => {
                    if (cancelledId === dealId) {
                        timerCancelled = true;
                    }
                });

                disputeHandler.start();

                // Raise dispute
                mockDatabaseEvents.emit('disputeRaised', dealId, {
                    dealId,
                    escrowId: '0x456',
                    chainId: 11155111,
                    contractAddress: '0xdef',
                    disputeTimestamp: Date.now()
                });

                await new Promise(resolve => setTimeout(resolve, 100));

                // Verify timer was set
                expect(disputeHandler.getActiveTimers()).toHaveLength(1);

                // Resolve dispute
                mockDatabaseEvents.emit('disputeResolved', dealId, {
                    resolution: 'manual_resolution',
                    txHash: '0x789'
                });

                await new Promise(resolve => setTimeout(resolve, 100));

                expect(timerCancelled).toBe(true);
                expect(disputeHandler.getActiveTimers()).toHaveLength(0);
            });

            it('should handle multiple concurrent disputes', async () => {
                disputeHandler.start();

                const disputes = [
                    { dealId: 'deal-1', timestamp: Date.now() },
                    { dealId: 'deal-2', timestamp: Date.now() - (24 * 60 * 60 * 1000) }, // 1 day ago
                    { dealId: 'deal-3', timestamp: Date.now() - (5 * 24 * 60 * 60 * 1000) } // 5 days ago
                ];

                // Raise all disputes
                for (const dispute of disputes) {
                    mockDatabaseEvents.emit('disputeRaised', dispute.dealId, {
                        dealId: dispute.dealId,
                        escrowId: `0x${dispute.dealId}`,
                        chainId: 11155111,
                        contractAddress: '0xabc',
                        disputeTimestamp: dispute.timestamp
                    });
                }

                await new Promise(resolve => setTimeout(resolve, 200));

                const activeTimers = disputeHandler.getActiveTimers();
                expect(activeTimers).toHaveLength(3);
                
                // Check hours remaining are correct
                const timer1 = activeTimers.find(t => t.dealId === 'deal-1');
                const timer2 = activeTimers.find(t => t.dealId === 'deal-2');
                const timer3 = activeTimers.find(t => t.dealId === 'deal-3');

                expect(timer1.hoursRemaining).toBeGreaterThan(165);
                expect(timer2.hoursRemaining).toBeLessThan(144); // 6 days
                expect(timer3.hoursRemaining).toBeLessThan(48); // 2 days
            });
        });

        describe('Auto-resolution', () => {
            it('should immediately resolve past-deadline disputes', async () => {
                const dealId = 'past-dispute';
                let autoResolved = false;

                // Mock successful dispute info and resolution
                mockEscrowService.getDisputeInfo.mockResolvedValue({
                    disputeRaised: true,
                    disputeResolved: false
                });
                
                mockEscrowService.returnFundsAfterDisputeTimeout.mockResolvedValue({
                    success: true,
                    txHash: '0xabc123'
                });

                disputeHandler.on('disputeAutoResolved', ({ dealId: resolvedId }) => {
                    if (resolvedId === dealId) {
                        autoResolved = true;
                    }
                });

                disputeHandler.start();

                // Raise dispute with past timestamp (8 days ago)
                mockDatabaseEvents.emit('disputeRaised', dealId, {
                    dealId,
                    escrowId: '0xpast',
                    chainId: 11155111,
                    contractAddress: '0xabc',
                    disputeTimestamp: Date.now() - (8 * 24 * 60 * 60 * 1000)
                });

                await new Promise(resolve => setTimeout(resolve, 300));

                expect(autoResolved).toBe(true);
                expect(mockEscrowService.returnFundsAfterDisputeTimeout).toHaveBeenCalled();
                expect(mockDatabaseService.updateDispute).toHaveBeenCalledWith(
                    '0xpast',
                    expect.objectContaining({
                        disputeResolved: true,
                        disputeResolution: 'auto_refund_timeout',
                        resolutionTxHash: '0xabc123'
                    })
                );
            });

            it('should retry on failure with backoff', async () => {
                const dealId = 'retry-dispute';
                let errorEmitted = false;

                // Mock dispute info
                mockEscrowService.getDisputeInfo.mockResolvedValue({
                    disputeRaised: true,
                    disputeResolved: false
                });

                // First call fails, second succeeds
                mockEscrowService.returnFundsAfterDisputeTimeout
                    .mockRejectedValueOnce(new Error('Network error'))
                    .mockResolvedValueOnce({
                        success: true,
                        txHash: '0xretry123'
                    });

                disputeHandler.on('disputeResolutionError', ({ dealId: errorId }) => {
                    if (errorId === dealId) {
                        errorEmitted = true;
                    }
                });

                disputeHandler.start();

                // Use fake timers for this test
                vi.useFakeTimers();

                // Raise past dispute
                mockDatabaseEvents.emit('disputeRaised', dealId, {
                    dealId,
                    escrowId: '0xretry',
                    chainId: 11155111,
                    contractAddress: '0xabc',
                    disputeTimestamp: Date.now() - (8 * 24 * 60 * 60 * 1000)
                });

                // Wait for initial attempt
                await vi.runOnlyPendingTimersAsync();
                expect(errorEmitted).toBe(true);
                expect(mockEscrowService.returnFundsAfterDisputeTimeout).toHaveBeenCalledTimes(1);

                // Fast-forward to retry (1 hour)
                await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
                
                // Should have retried and succeeded
                expect(mockEscrowService.returnFundsAfterDisputeTimeout).toHaveBeenCalledTimes(2);

                vi.useRealTimers();
            });
        });

        describe('Service lifecycle', () => {
            it('should check existing disputes on start', async () => {
                const existingDisputes = [
                    {
                        dealId: 'existing-1',
                        escrowId: '0xexist1',
                        chainId: 11155111,
                        contractAddress: '0xabc',
                        disputeRaisedTimestamp: Date.now() - (3 * 24 * 60 * 60 * 1000) // 3 days ago
                    }
                ];

                mockDatabaseService.getActiveDisputes.mockResolvedValue(existingDisputes);

                let timerSet = false;
                disputeHandler.on('disputeTimerSet', () => {
                    timerSet = true;
                });

                disputeHandler.start();

                await new Promise(resolve => setTimeout(resolve, 200));

                expect(mockDatabaseService.getActiveDisputes).toHaveBeenCalled();
                expect(timerSet).toBe(true);
                expect(disputeHandler.getActiveTimers()).toHaveLength(1);
            });

            it('should clean up on stop', async () => {
                disputeHandler.start();

                // Add some timers
                mockDatabaseEvents.emit('disputeRaised', 'stop-test-1', {
                    dealId: 'stop-test-1',
                    escrowId: '0xstop1',
                    chainId: 11155111,
                    contractAddress: '0xabc',
                    disputeTimestamp: Date.now()
                });

                await new Promise(resolve => setTimeout(resolve, 100));
                expect(disputeHandler.getActiveTimers()).toHaveLength(1);

                // Stop the service
                disputeHandler.stop();

                // Timers should be cleared
                expect(disputeHandler.getActiveTimers()).toHaveLength(0);

                // New events should not be processed
                mockDatabaseEvents.emit('disputeRaised', 'stop-test-2', {
                    dealId: 'stop-test-2',
                    escrowId: '0xstop2',
                    chainId: 11155111,
                    contractAddress: '0xabc',
                    disputeTimestamp: Date.now()
                });

                await new Promise(resolve => setTimeout(resolve, 100));
                expect(disputeHandler.getActiveTimers()).toHaveLength(0);
            });
        });
    });
});