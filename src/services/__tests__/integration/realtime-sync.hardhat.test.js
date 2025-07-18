/**
 * Integration tests for real-time synchronization with Hardhat
 * Tests condition sync and dispute event handling with deployed contracts
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { ethers } from 'ethers';
import * as hardhatHelpers from '../../../../test/hardhat/helpers.js';
import { databaseEvents } from '../../databaseService.js';
import { EscrowServiceV3 } from '../../escrowServiceV3.js';
import ContractConditionSync from '../../contractConditionSync.js';
import DisputeEventHandler from '../../disputeEventHandler.js';

describe('Real-time Synchronization Hardhat Integration', () => {
    let provider;
    let signers;
    let owner, buyer, seller, serviceWallet;
    let escrowContract;
    let mockWETH, mockRouter;
    let testToken;
    let escrowService;
    let conditionSync;
    let disputeHandler;
    let mockDatabaseService;

    beforeAll(async () => {
        console.log('🚀 Setting up Hardhat test environment...');
        
        // Get provider and signers
        provider = await hardhatHelpers.getHardhatProvider();
        signers = await hardhatHelpers.getSigners(provider);
        [owner, buyer, seller, serviceWallet] = signers;
        
        console.log('📝 Deploying contracts...');
        
        // Deploy mock contracts
        mockWETH = await hardhatHelpers.deployMockWETH(owner);
        mockRouter = await hardhatHelpers.deployMockRouter(owner, await mockWETH.getAddress());
        
        // Deploy test tokens
        const tokens = await hardhatHelpers.deployMockTokens(owner);
        testToken = tokens.usdc;
        
        // Deploy escrow contract
        escrowContract = await hardhatHelpers.deployEscrowV3(
            owner,
            await serviceWallet.getAddress(),
            await mockWETH.getAddress(),
            await mockRouter.getAddress()
        );
        
        console.log('✅ Contracts deployed:');
        console.log(`  - Escrow: ${await escrowContract.getAddress()}`);
        console.log(`  - USDC: ${await testToken.getAddress()}`);
        console.log(`  - WETH: ${await mockWETH.getAddress()}`);
        
        // Fund test accounts
        const fundAmount = ethers.parseUnits('10000', 6); // 10k USDC
        await hardhatHelpers.fundAccount(buyer, testToken, fundAmount);
        await hardhatHelpers.fundAccount(seller, testToken, fundAmount);
        
        // Initialize services
        escrowService = new EscrowServiceV3();
        
        // Configure escrow service with test contract
        escrowService.contracts = {
            31337: { // Hardhat chainId
                address: await escrowContract.getAddress(),
                contract: escrowContract
            }
        };
        
        // Mock database service
        mockDatabaseService = Object.assign(Object.create(databaseEvents), {
            getActiveDisputes: vi.fn().mockResolvedValue([]),
            getEscrowById: vi.fn().mockResolvedValue(null),
            updateDispute: vi.fn().mockResolvedValue({ success: true }),
            updateDealCondition: vi.fn().mockResolvedValue({ success: true })
        });
        
        // Initialize real-time services
        conditionSync = new ContractConditionSync(mockDatabaseService, escrowService);
        disputeHandler = new DisputeEventHandler(escrowService, mockDatabaseService);
        
        // Start services
        await conditionSync.start();
        disputeHandler.start();
        
        console.log('✅ Services initialized and started');
    });

    afterAll(async () => {
        console.log('🧹 Cleaning up...');
        if (conditionSync) await conditionSync.stop();
        if (disputeHandler) disputeHandler.stop();
    });

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('Escrow Creation and Condition Updates', () => {
        it('should create escrow and sync condition updates', async () => {
            const amount = ethers.parseUnits('100', 6); // 100 USDC
            const conditions = ['Item shipped', 'Item received'];
            
            // Create escrow
            const escrowId = await hardhatHelpers.createTestEscrow(
                escrowContract,
                buyer,
                seller,
                testToken,
                amount,
                conditions
            );
            
            console.log(`Created escrow: ${escrowId}`);
            
            // Verify escrow was created
            const escrowData = await escrowContract.getEscrow(escrowId);
            expect(escrowData.buyer).toBe(await buyer.getAddress());
            expect(escrowData.seller).toBe(await seller.getAddress());
            expect(escrowData.amount).toBe(amount);
            
            // Test condition update via database event
            let conditionUpdatedOnChain = false;
            
            // Listen for blockchain event
            escrowContract.once('ConditionUpdated', (id, index, met) => {
                if (id === escrowId && index === 0n && met === true) {
                    conditionUpdatedOnChain = true;
                }
            });
            
            // Emit database event to trigger sync
            mockDatabaseService.emit('conditionUpdated', 'db-deal-123', true, {
                dealId: 'db-deal-123',
                escrowId: escrowId,
                chainId: 31337,
                contractAddress: await escrowContract.getAddress(),
                conditionIndex: 0,
                conditionMet: true,
                allConditionsMet: false
            });
            
            // Wait for sync
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Verify condition was updated on chain
            const updatedEscrow = await escrowContract.getEscrow(escrowId);
            expect(updatedEscrow.conditionsMet[0]).toBe(true);
            expect(conditionUpdatedOnChain).toBe(true);
        });

        it('should handle multiple condition updates', async () => {
            const amount = ethers.parseUnits('200', 6);
            const conditions = ['Payment confirmed', 'Service started', 'Service completed'];
            
            const escrowId = await hardhatHelpers.createTestEscrow(
                escrowContract,
                buyer,
                seller,
                testToken,
                amount,
                conditions
            );
            
            // Update all conditions
            for (let i = 0; i < conditions.length; i++) {
                mockDatabaseService.emit('conditionUpdated', `deal-${i}`, true, {
                    dealId: `deal-${i}`,
                    escrowId: escrowId,
                    chainId: 31337,
                    contractAddress: await escrowContract.getAddress(),
                    conditionIndex: i,
                    conditionMet: true,
                    allConditionsMet: i === conditions.length - 1
                });
                
                await new Promise(resolve => setTimeout(resolve, 500));
            }
            
            // Verify all conditions are met
            const finalEscrow = await escrowContract.getEscrow(escrowId);
            expect(finalEscrow.conditionsMet.every(met => met)).toBe(true);
            expect(finalEscrow.allConditionsMet).toBe(true);
        });
    });

    describe('Dispute Handling', () => {
        it('should handle dispute raised from blockchain', async () => {
            const amount = ethers.parseUnits('500', 6);
            
            const escrowId = await hardhatHelpers.createTestEscrow(
                escrowContract,
                buyer,
                seller,
                testToken,
                amount,
                ['Delivery confirmed']
            );
            
            let disputeTimerSet = false;
            
            disputeHandler.once('disputeTimerSet', ({ dealId }) => {
                if (dealId === escrowId) {
                    disputeTimerSet = true;
                }
            });
            
            // Raise dispute on blockchain
            const disputeTx = await escrowContract.connect(buyer).raiseDispute(
                escrowId,
                'Item not as described'
            );
            await disputeTx.wait();
            
            // Emit database event (simulating database update from API)
            mockDatabaseService.emit('disputeRaised', escrowId, {
                dealId: escrowId,
                escrowId: escrowId,
                chainId: 31337,
                contractAddress: await escrowContract.getAddress(),
                disputeTimestamp: Date.now(),
                reason: 'Item not as described'
            });
            
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // Verify dispute is active on chain
            const escrowData = await escrowContract.getEscrow(escrowId);
            expect(escrowData.disputeRaised).toBe(true);
            
            // Verify timer was set
            expect(disputeTimerSet).toBe(true);
            expect(disputeHandler.getActiveTimers().length).toBe(1);
        });

        it('should cancel timer when dispute is resolved', async () => {
            const amount = ethers.parseUnits('300', 6);
            
            const escrowId = await hardhatHelpers.createTestEscrow(
                escrowContract,
                buyer,
                seller,
                testToken,
                amount,
                []
            );
            
            // Raise dispute
            await escrowContract.connect(buyer).raiseDispute(escrowId, 'Test dispute');
            
            mockDatabaseService.emit('disputeRaised', escrowId, {
                dealId: escrowId,
                escrowId: escrowId,
                chainId: 31337,
                contractAddress: await escrowContract.getAddress(),
                disputeTimestamp: Date.now()
            });
            
            await new Promise(resolve => setTimeout(resolve, 500));
            expect(disputeHandler.getActiveTimers().length).toBe(1);
            
            let timerCancelled = false;
            disputeHandler.once('disputeTimerCancelled', ({ dealId }) => {
                if (dealId === escrowId) {
                    timerCancelled = true;
                }
            });
            
            // Resolve dispute on blockchain
            const resolveTx = await escrowContract.connect(seller).resolveDispute(
                escrowId,
                await buyer.getAddress(),
                100 // refund percentage
            );
            await resolveTx.wait();
            
            // Emit database event
            mockDatabaseService.emit('disputeResolved', escrowId, {
                resolution: 'seller_resolved',
                txHash: resolveTx.hash
            });
            
            await new Promise(resolve => setTimeout(resolve, 500));
            
            expect(timerCancelled).toBe(true);
            expect(disputeHandler.getActiveTimers().length).toBe(0);
        });

        it('should auto-resolve dispute after timeout', async () => {
            const amount = ethers.parseUnits('1000', 6);
            
            const escrowId = await hardhatHelpers.createTestEscrow(
                escrowContract,
                buyer,
                seller,
                testToken,
                amount,
                []
            );
            
            // Raise dispute
            await escrowContract.connect(buyer).raiseDispute(escrowId, 'Timeout test');
            
            // Mock past dispute (8 days ago)
            const pastTimestamp = Date.now() - (8 * 24 * 60 * 60 * 1000);
            
            // Mock escrow service to return dispute info
            vi.spyOn(escrowService, 'getDisputeInfo').mockResolvedValue({
                disputeRaised: true,
                disputeResolved: false
            });
            
            vi.spyOn(escrowService, 'returnFundsAfterDisputeTimeout').mockResolvedValue({
                success: true,
                txHash: '0xauto123'
            });
            
            let autoResolved = false;
            disputeHandler.once('disputeAutoResolved', ({ dealId }) => {
                if (dealId === escrowId) {
                    autoResolved = true;
                }
            });
            
            // Emit past dispute
            mockDatabaseService.emit('disputeRaised', escrowId, {
                dealId: escrowId,
                escrowId: escrowId,
                chainId: 31337,
                contractAddress: await escrowContract.getAddress(),
                disputeTimestamp: pastTimestamp
            });
            
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            expect(autoResolved).toBe(true);
            expect(escrowService.returnFundsAfterDisputeTimeout).toHaveBeenCalledWith(
                escrowId,
                31337,
                await escrowContract.getAddress()
            );
        });
    });

    describe('Error Handling and Recovery', () => {
        it('should retry failed condition updates', async () => {
            const amount = ethers.parseUnits('50', 6);
            
            const escrowId = await hardhatHelpers.createTestEscrow(
                escrowContract,
                buyer,
                seller,
                testToken,
                amount,
                ['Test condition']
            );
            
            // Mock a failing then succeeding update
            let attemptCount = 0;
            vi.spyOn(escrowService, 'updateCondition').mockImplementation(async () => {
                attemptCount++;
                if (attemptCount === 1) {
                    throw new Error('Network error');
                }
                return { success: true, txHash: '0xretry123' };
            });
            
            let errorEmitted = false;
            conditionSync.once('conditionSyncError', () => {
                errorEmitted = true;
            });
            
            let successEmitted = false;
            conditionSync.once('conditionSynced', () => {
                successEmitted = true;
            });
            
            // Emit condition update
            mockDatabaseService.emit('conditionUpdated', 'retry-deal', true, {
                dealId: 'retry-deal',
                escrowId: escrowId,
                chainId: 31337,
                contractAddress: await escrowContract.getAddress(),
                conditionIndex: 0,
                conditionMet: true
            });
            
            // Wait for retry
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            expect(errorEmitted).toBe(true);
            expect(successEmitted).toBe(true);
            expect(attemptCount).toBe(2);
        });
    });

    describe('Chain State Verification', () => {
        it('should verify blockchain state matches database events', async () => {
            const amount = ethers.parseUnits('750', 6);
            const conditions = ['Milestone 1', 'Milestone 2'];
            
            const escrowId = await hardhatHelpers.createTestEscrow(
                escrowContract,
                buyer,
                seller,
                testToken,
                amount,
                conditions
            );
            
            // Update first condition
            mockDatabaseService.emit('conditionUpdated', 'verify-1', true, {
                dealId: 'verify-1',
                escrowId: escrowId,
                chainId: 31337,
                contractAddress: await escrowContract.getAddress(),
                conditionIndex: 0,
                conditionMet: true
            });
            
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // Verify on chain
            let escrowData = await escrowContract.getEscrow(escrowId);
            expect(escrowData.conditionsMet[0]).toBe(true);
            expect(escrowData.conditionsMet[1]).toBe(false);
            
            // Raise and resolve dispute
            await escrowContract.connect(buyer).raiseDispute(escrowId, 'Test verification');
            
            mockDatabaseService.emit('disputeRaised', escrowId, {
                dealId: escrowId,
                escrowId: escrowId,
                chainId: 31337,
                contractAddress: await escrowContract.getAddress(),
                disputeTimestamp: Date.now()
            });
            
            await new Promise(resolve => setTimeout(resolve, 500));
            
            escrowData = await escrowContract.getEscrow(escrowId);
            expect(escrowData.disputeRaised).toBe(true);
            
            // Check active timers
            const activeTimers = disputeHandler.getActiveTimers();
            const escrowTimer = activeTimers.find(t => t.dealId === escrowId);
            expect(escrowTimer).toBeDefined();
            expect(escrowTimer.hoursRemaining).toBeGreaterThan(160);
        });
    });
});