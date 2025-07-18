/**
 * Integration tests for real-time synchronization system
 * Tests both condition sync and dispute event handling with Hardhat
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { ethers } from 'ethers';
import pkg from '../../../contract/package.json' assert { type: 'json' };
import { databaseEvents } from '../../databaseService.js';
import { EscrowServiceV3 } from '../../escrowServiceV3.js';
import ContractConditionSync from '../../contractConditionSync.js';
import DisputeEventHandler from '../../disputeEventHandler.js';

// Test utilities
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

describe('Real-time Synchronization Integration Tests', () => {
    let escrowService;
    let conditionSync;
    let disputeHandler;
    let mockDatabaseService;
    let escrowContract;
    let owner, buyer, seller, serviceWallet;
    let testToken;

    beforeAll(async () => {
        // Connect to local Hardhat node
        const provider = new ethers.JsonRpcProvider('http://localhost:8545');
        
        // Get signers
        owner = new ethers.Wallet('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80', provider);
        buyer = new ethers.Wallet('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d', provider);
        seller = new ethers.Wallet('0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a', provider);
        serviceWallet = new ethers.Wallet('0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6', provider);

        // Read contract ABIs
        const { abi: mockERC20ABI } = await import('../../../contract/artifacts/contracts/mocks/MockERC20.sol/MockERC20.json', { assert: { type: 'json' } });
        const { abi: mockWETHABI } = await import('../../../contract/artifacts/contracts/mocks/MockWETH.sol/MockWETH.json', { assert: { type: 'json' } });
        const { abi: mockRouterABI } = await import('../../../contract/artifacts/contracts/mocks/MockUniswapV2Router.sol/MockUniswapV2Router.json', { assert: { type: 'json' } });
        const { abi: escrowABI } = await import('../../../contract/artifacts/contracts/UniversalEscrowServiceV3Disputes.sol/UniversalEscrowServiceV3Disputes.json', { assert: { type: 'json' } });

        // Deploy test token
        const MockERC20 = new ethers.ContractFactory(mockERC20ABI, '0x' + '60806040523480156100115760006000fd5b50', owner);
        testToken = await MockERC20.deploy('Test Token', 'TEST', 18);
        await testToken.waitForDeployment();

        // Deploy mock contracts if needed
        const MockWETH = new ethers.ContractFactory(mockWETHABI, '0x' + '60806040523480156100115760006000fd5b50', owner);
        const mockWETH = await MockWETH.deploy();
        await mockWETH.waitForDeployment();

        const MockRouter = new ethers.ContractFactory(mockRouterABI, '0x' + '60806040523480156100115760006000fd5b50', owner);
        const mockRouter = await MockRouter.deploy(await mockWETH.getAddress());
        await mockRouter.waitForDeployment();

        // Deploy V3 Escrow Contract
        const UniversalEscrowV3 = new ethers.ContractFactory(escrowABI, '0x' + '60806040523480156100115760006000fd5b50', owner);
        escrowContract = await UniversalEscrowV3.deploy(
            await serviceWallet.getAddress(),
            await mockWETH.getAddress(),
            await mockRouter.getAddress(),
            ethers.ZeroAddress, // Stargate router (not needed for test)
            200 // 2% fee
        );
        await escrowContract.waitForDeployment();

        // Initialize services
        escrowService = new EscrowServiceV3();
        await escrowService.initialize();

        // Create mock database service
        mockDatabaseService = Object.assign(Object.create(databaseEvents), {
            getActiveDisputes: vi.fn().mockResolvedValue([]),
            getEscrowById: vi.fn().mockImplementation(async (id) => ({
                escrowId: id,
                chainId: 31337, // Hardhat chainId
                contractAddress: await escrowContract.getAddress(),
                buyerAddress: await buyer.getAddress(),
                sellerAddress: await seller.getAddress(),
                amount: ethers.parseEther('1'),
                tokenAddress: await testToken.getAddress()
            })),
            updateDispute: vi.fn().mockResolvedValue({ success: true }),
            on: databaseEvents.on.bind(databaseEvents),
            off: databaseEvents.off.bind(databaseEvents),
            emit: databaseEvents.emit.bind(databaseEvents)
        });

        // Configure escrowService to use our deployed contract
        escrowService.contracts.set(
            `31337-${await escrowContract.getAddress()}`,
            escrowContract
        );
    });

    afterAll(async () => {
        // Cleanup
        if (conditionSync) conditionSync.stop();
        if (disputeHandler) disputeHandler.stop();
    });

    describe('Contract Condition Sync', () => {
        beforeEach(async () => {
            conditionSync = new ContractConditionSync(mockDatabaseService, escrowService);
            await conditionSync.start();
        });

        afterEach(() => {
            if (conditionSync) conditionSync.stop();
        });

        it('should sync condition updates to blockchain', async () => {
            // Create an escrow first
            const escrowId = ethers.encodeBytes32String('test-escrow-1');
            const amount = ethers.parseEther('1');

            // Fund the contract
            await testToken.mint(await buyer.getAddress(), amount);
            await testToken.connect(buyer).approve(await escrowContract.getAddress(), amount);

            // Create escrow on-chain
            await escrowContract.connect(buyer).createEscrow(
                await seller.getAddress(),
                await testToken.getAddress(),
                amount,
                await testToken.getAddress(),
                31337 // same chain
            );

            // Set up event listener
            let syncCompleted = false;
            let syncedTxHash;
            
            conditionSync.on('conditionSynced', ({ escrowId: syncedId, txHash }) => {
                if (syncedId === escrowId) {
                    syncCompleted = true;
                    syncedTxHash = txHash;
                }
            });

            // Emit condition update event
            databaseEvents.emit('conditionUpdated', escrowId, true, {
                escrowId,
                chainId: 31337,
                contractAddress: await escrowContract.getAddress(),
                allConditionsMet: true
            });

            // Wait for sync
            await delay(3000);

            // Verify
            expect(syncCompleted).toBe(true);
            expect(syncedTxHash).toBeDefined();

            // Check on-chain state
            const escrowData = await escrowContract.escrows(escrowId);
            expect(escrowData.conditionMet).toBe(true);
        });

        it('should handle sync errors gracefully', async () => {
            const invalidEscrowId = ethers.encodeBytes32String('invalid-escrow');
            let errorEmitted = false;

            conditionSync.on('syncError', ({ escrowId, error }) => {
                if (escrowId === invalidEscrowId) {
                    errorEmitted = true;
                }
            });

            // Emit update for non-existent escrow
            databaseEvents.emit('conditionUpdated', invalidEscrowId, true, {
                escrowId: invalidEscrowId,
                chainId: 31337,
                contractAddress: await escrowContract.getAddress()
            });

            await delay(2000);

            expect(errorEmitted).toBe(true);
        });
    });

    describe('Dispute Event Handler', () => {
        beforeEach(async () => {
            disputeHandler = new DisputeEventHandler(escrowService, mockDatabaseService);
            disputeHandler.start();
        });

        afterEach(() => {
            if (disputeHandler) disputeHandler.stop();
        });

        it('should set timer for new disputes', async () => {
            const dealId = 'test-dispute-' + Date.now();
            const escrowId = ethers.encodeBytes32String(dealId);
            let timerSet = false;

            disputeHandler.on('disputeTimerSet', ({ dealId: setDealId }) => {
                if (setDealId === dealId) {
                    timerSet = true;
                }
            });

            // Raise dispute event
            databaseEvents.emit('disputeRaised', dealId, {
                dealId,
                escrowId,
                chainId: 31337,
                contractAddress: await escrowContract.getAddress(),
                disputeTimestamp: Date.now(),
                reason: 'Test dispute'
            });

            await delay(1000);

            expect(timerSet).toBe(true);
            
            // Check active timers
            const activeTimers = disputeHandler.getActiveTimers();
            expect(activeTimers.length).toBeGreaterThan(0);
            expect(activeTimers.some(t => t.dealId === dealId)).toBe(true);
        });

        it('should cancel timer when dispute is resolved', async () => {
            const dealId = 'test-cancel-' + Date.now();
            const escrowId = ethers.encodeBytes32String(dealId);
            let timerCancelled = false;

            disputeHandler.on('disputeTimerCancelled', ({ dealId: cancelledDealId }) => {
                if (cancelledDealId === dealId) {
                    timerCancelled = true;
                }
            });

            // Raise dispute
            databaseEvents.emit('disputeRaised', dealId, {
                dealId,
                escrowId,
                chainId: 31337,
                contractAddress: await escrowContract.getAddress(),
                disputeTimestamp: Date.now()
            });

            await delay(500);

            // Resolve dispute
            databaseEvents.emit('disputeResolved', dealId, {
                resolution: 'manual_resolution',
                txHash: '0x' + 'a'.repeat(64)
            });

            await delay(500);

            expect(timerCancelled).toBe(true);
            
            // Verify timer was removed
            const activeTimers = disputeHandler.getActiveTimers();
            expect(activeTimers.some(t => t.dealId === dealId)).toBe(false);
        });

        it('should immediately resolve past-deadline disputes', async () => {
            const dealId = 'past-dispute-' + Date.now();
            const escrowId = ethers.encodeBytes32String(dealId);

            // Mock the escrow service to simulate successful resolution
            const originalReturnFunds = escrowService.returnFundsAfterDisputeTimeout;
            escrowService.returnFundsAfterDisputeTimeout = vi.fn().mockResolvedValue({
                success: true,
                txHash: '0x' + 'b'.repeat(64)
            });

            let autoResolved = false;
            disputeHandler.on('disputeAutoResolved', ({ dealId: resolvedDealId }) => {
                if (resolvedDealId === dealId) {
                    autoResolved = true;
                }
            });

            // Raise dispute with past timestamp
            databaseEvents.emit('disputeRaised', dealId, {
                dealId,
                escrowId,
                chainId: 31337,
                contractAddress: await escrowContract.getAddress(),
                disputeTimestamp: Date.now() - (8 * 24 * 60 * 60 * 1000), // 8 days ago
                reason: 'Old dispute'
            });

            await delay(3000);

            expect(autoResolved).toBe(true);
            expect(escrowService.returnFundsAfterDisputeTimeout).toHaveBeenCalled();

            // Restore original method
            escrowService.returnFundsAfterDisputeTimeout = originalReturnFunds;
        });
    });

    describe('Full Integration Flow', () => {
        it('should handle complete escrow lifecycle with dispute', async () => {
            // Initialize both services
            conditionSync = new ContractConditionSync(mockDatabaseService, escrowService);
            disputeHandler = new DisputeEventHandler(escrowService, mockDatabaseService);
            
            await conditionSync.start();
            disputeHandler.start();

            // Create escrow
            const escrowId = ethers.encodeBytes32String('integration-test');
            const amount = ethers.parseEther('2');
            const dealId = 'integration-deal-' + Date.now();

            // Fund and create escrow
            await testToken.mint(await buyer.getAddress(), amount);
            await testToken.connect(buyer).approve(await escrowContract.getAddress(), amount);
            await escrowContract.connect(buyer).createEscrow(
                await seller.getAddress(),
                await testToken.getAddress(),
                amount,
                await testToken.getAddress(),
                31337
            );

            // Step 1: Update condition
            let conditionSynced = false;
            conditionSync.on('conditionSynced', () => {
                conditionSynced = true;
            });

            databaseEvents.emit('conditionUpdated', escrowId, true, {
                escrowId,
                chainId: 31337,
                contractAddress: await escrowContract.getAddress()
            });

            await delay(2000);
            expect(conditionSynced).toBe(true);

            // Step 2: Raise dispute
            let disputeTimerSet = false;
            disputeHandler.on('disputeTimerSet', () => {
                disputeTimerSet = true;
            });

            // First update condition to true on contract
            await escrowContract.connect(serviceWallet).updateCondition(escrowId, true);

            // Then raise dispute
            await escrowContract.connect(buyer).raiseDispute(escrowId, 'Integration test dispute');

            databaseEvents.emit('disputeRaised', dealId, {
                dealId,
                escrowId,
                chainId: 31337,
                contractAddress: await escrowContract.getAddress(),
                disputeTimestamp: Date.now()
            });

            await delay(1000);
            expect(disputeTimerSet).toBe(true);

            // Step 3: Resolve dispute
            let disputeTimerCancelled = false;
            disputeHandler.on('disputeTimerCancelled', () => {
                disputeTimerCancelled = true;
            });

            await escrowContract.connect(serviceWallet).resolveDispute(escrowId, true);

            databaseEvents.emit('disputeResolved', dealId, {
                resolution: 'released_to_seller',
                txHash: '0x' + 'c'.repeat(64)
            });

            await delay(1000);
            expect(disputeTimerCancelled).toBe(true);

            // Cleanup
            conditionSync.stop();
            disputeHandler.stop();
        });
    });
});