/**
 * Integration tests for real-time synchronization with production contracts
 * Tests condition sync and dispute event handling with actual deployed contracts
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { databaseEvents } from '../../databaseService.js';
import { EscrowServiceV3 } from '../../escrowServiceV3.js';
import ContractConditionSync from '../../contractConditionSync.js';
import DisputeEventHandler from '../../disputeEventHandler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Real-time Synchronization Production Contract Integration', () => {
    let provider;
    let owner, buyer, seller, serviceWallet;
    let escrowContract;
    let testToken;
    let escrowService;
    let conditionSync;
    let disputeHandler;
    let mockDatabaseService;

    beforeAll(async () => {
        console.log('🚀 Setting up production contract test environment...');
        
        // Connect to local Hardhat node with retry
        let connected = false;
        for (let i = 0; i < 10; i++) {
            try {
                provider = new ethers.JsonRpcProvider('http://localhost:8545');
                await provider.getNetwork(); // Test connection
                connected = true;
                break;
            } catch (error) {
                console.log(`Waiting for Hardhat connection... (attempt ${i + 1}/10)`);
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        
        if (!connected) {
            throw new Error('Failed to connect to Hardhat node');
        }
        
        // Create wallets
        const privateKeys = [
            '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80', // Account 0
            '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d', // Account 1
            '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a', // Account 2
            '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6'  // Account 3
        ];
        
        [owner, buyer, seller, serviceWallet] = privateKeys.map(pk => new ethers.Wallet(pk, provider));
        
        console.log('📝 Deploying production contracts...');
        
        // Load production contract ABI and bytecode
        const escrowArtifact = JSON.parse(
            fs.readFileSync(
                path.join(__dirname, '../../../contract/artifacts/contracts/UniversalEscrowServiceV3Test.sol/UniversalEscrowServiceV3Test.json'),
                'utf8'
            )
        );
        
        // Load and deploy test token
        const tokenArtifact = JSON.parse(
            fs.readFileSync(
                path.join(__dirname, '../../../contract/artifacts/contracts/mocks/TestToken.sol/TestToken.json'),
                'utf8'
            )
        );
        
        const TokenFactory = new ethers.ContractFactory(
            tokenArtifact.abi,
            tokenArtifact.bytecode,
            owner
        );
        testToken = await TokenFactory.deploy();
        await testToken.waitForDeployment();
        
        console.log(`  - Test Token: ${await testToken.getAddress()}`);
        
        // Deploy production escrow contract
        const EscrowFactory = new ethers.ContractFactory(
            escrowArtifact.abi,
            escrowArtifact.bytecode,
            owner
        );
        
        escrowContract = await EscrowFactory.deploy();
        await escrowContract.waitForDeployment();
        
        console.log(`  - Escrow: ${await escrowContract.getAddress()}`);
        
        // Fund test accounts with tokens
        const fundAmount = ethers.parseUnits('10000', 18); // 10k tokens
        const tx1 = await testToken.mint(await buyer.getAddress(), fundAmount);
        await tx1.wait();
        
        const tx2 = await testToken.mint(await seller.getAddress(), fundAmount);
        await tx2.wait();
        
        // Initialize services
        escrowService = new EscrowServiceV3();
        
        // Override the escrow service configuration for testing
        escrowService.abi = escrowArtifact.abi;
        escrowService.contracts.set(31337, {
            address: await escrowContract.getAddress(),
            contract: escrowContract
        });
        escrowService.wallets.set(31337, serviceWallet);
        escrowService.providers.set(31337, provider);
        
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

    beforeEach(async () => {
        vi.clearAllMocks();
        
        // Reset nonces by creating fresh wallet instances with same keys
        const privateKeys = [
            '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
            '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
            '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a',
            '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6'
        ];
        
        [owner, buyer, seller, serviceWallet] = privateKeys.map(pk => new ethers.Wallet(pk, provider));
    });

    describe('Escrow Creation and Condition Updates', () => {
        it('should create escrow and sync condition updates', async () => {
            const amount = ethers.parseUnits('100', 18); // 100 tokens
            
            // Approve token spending
            await testToken.connect(buyer).approve(await escrowContract.getAddress(), amount);
            
            // Create escrow
            const tx = await escrowContract.connect(buyer).createEscrow(
                await seller.getAddress(),
                await testToken.getAddress(), // depositToken
                amount,
                await testToken.getAddress(), // targetToken (same as deposit for testing)
                31337 // target chain (same chain for testing)
            );
            
            const receipt = await tx.wait();
            
            // Get escrow ID from events
            const event = receipt.logs.find(log => {
                try {
                    const parsed = escrowContract.interface.parseLog(log);
                    return parsed.name === 'EscrowCreated';
                } catch {
                    return false;
                }
            });
            
            const parsedEvent = escrowContract.interface.parseLog(event);
            const escrowId = parsedEvent.args.escrowId;
            
            console.log(`Created escrow: ${escrowId}`);
            
            // Verify escrow was created
            const escrowData = await escrowContract.escrows(escrowId);
            expect(escrowData.buyer.toLowerCase()).toBe((await buyer.getAddress()).toLowerCase());
            expect(escrowData.seller.toLowerCase()).toBe((await seller.getAddress()).toLowerCase());
            expect(escrowData.depositAmount).toBe(amount);
            
            // Test condition update via database event
            let conditionUpdatedOnChain = false;
            
            // Listen for blockchain event
            escrowContract.once('ConditionUpdated', (id, met) => {
                if (id === escrowId && met === true) {
                    conditionUpdatedOnChain = true;
                }
            });
            
            // Emit database event to trigger sync
            mockDatabaseService.emit('conditionUpdated', 'db-deal-123', true, {
                dealId: 'db-deal-123',
                escrowId: escrowId.toString(),
                chainId: 31337,
                contractAddress: await escrowContract.getAddress(),
                conditionMet: true,
                allConditionsMet: true
            });
            
            // Wait for sync
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Verify condition was updated on chain
            const updatedEscrow = await escrowContract.escrows(escrowId);
            expect(updatedEscrow.conditionMetTimestamp).toBeGreaterThan(0);
            expect(conditionUpdatedOnChain).toBe(true);
        });

        it('should handle multiple escrows simultaneously', async () => {
            const amount1 = ethers.parseUnits('200', 18);
            const amount2 = ethers.parseUnits('300', 18);
            
            // Create first escrow
            await testToken.connect(buyer).approve(await escrowContract.getAddress(), amount1);
            const tx1 = await escrowContract.connect(buyer).createEscrow(
                await seller.getAddress(),
                await testToken.getAddress(),
                amount1,
                await testToken.getAddress(),
                31337
            );
            const receipt1 = await tx1.wait();
            const event1 = receipt1.logs.find(log => {
                try {
                    const parsed = escrowContract.interface.parseLog(log);
                    return parsed.name === 'EscrowCreated';
                } catch {
                    return false;
                }
            });
            const escrowId1 = escrowContract.interface.parseLog(event1).args.escrowId;
            
            // Create second escrow
            await testToken.connect(seller).approve(await escrowContract.getAddress(), amount2);
            const tx2 = await escrowContract.connect(seller).createEscrow(
                await buyer.getAddress(),
                await testToken.getAddress(),
                amount2,
                await testToken.getAddress(),
                31337
            );
            const receipt2 = await tx2.wait();
            const event2 = receipt2.logs.find(log => {
                try {
                    const parsed = escrowContract.interface.parseLog(log);
                    return parsed.name === 'EscrowCreated';
                } catch {
                    return false;
                }
            });
            const escrowId2 = escrowContract.interface.parseLog(event2).args.escrowId;
            
            // Update conditions for both
            mockDatabaseService.emit('conditionUpdated', 'deal-1', true, {
                dealId: 'deal-1',
                escrowId: escrowId1.toString(),
                chainId: 31337,
                contractAddress: await escrowContract.getAddress(),
                conditionMet: true
            });
            
            mockDatabaseService.emit('conditionUpdated', 'deal-2', true, {
                dealId: 'deal-2',
                escrowId: escrowId2.toString(),
                chainId: 31337,
                contractAddress: await escrowContract.getAddress(),
                conditionMet: true
            });
            
            await new Promise(resolve => setTimeout(resolve, 1500));
            
            // Verify both conditions were met
            const escrow1 = await escrowContract.escrows(escrowId1);
            const escrow2 = await escrowContract.escrows(escrowId2);
            
            expect(escrow1.conditionMetTimestamp).toBeGreaterThan(0);
            expect(escrow2.conditionMetTimestamp).toBeGreaterThan(0);
        });
    });

    describe('Dispute Handling', () => {
        it('should handle dispute raised from blockchain', async () => {
            const amount = ethers.parseUnits('500', 18);
            
            // Create escrow
            await testToken.connect(buyer).approve(await escrowContract.getAddress(), amount);
            const tx = await escrowContract.connect(buyer).createEscrow(
                await seller.getAddress(),
                await testToken.getAddress(),
                amount,
                await testToken.getAddress(),
                31337
            );
            const receipt = await tx.wait();
            const event = receipt.logs.find(log => {
                try {
                    const parsed = escrowContract.interface.parseLog(log);
                    return parsed.name === 'EscrowCreated';
                } catch {
                    return false;
                }
            });
            const escrowId = escrowContract.interface.parseLog(event).args.escrowId;
            
            // First, set condition as met
            await escrowContract.connect(owner).updateCondition(escrowId, true);
            
            let disputeTimerSet = false;
            
            disputeHandler.once('disputeTimerSet', ({ dealId }) => {
                if (dealId === escrowId.toString()) {
                    disputeTimerSet = true;
                }
            });
            
            // Raise dispute on blockchain
            const disputeTx = await escrowContract.connect(buyer).raiseDispute(escrowId);
            await disputeTx.wait();
            
            // Emit database event (simulating database update from API)
            mockDatabaseService.emit('disputeRaised', escrowId.toString(), {
                dealId: escrowId.toString(),
                escrowId: escrowId.toString(),
                chainId: 31337,
                contractAddress: await escrowContract.getAddress(),
                disputeTimestamp: Date.now(),
                reason: 'Test dispute'
            });
            
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // Verify dispute is active on chain
            const escrowData = await escrowContract.escrows(escrowId);
            expect(escrowData.isDisputed).toBe(true);
            
            // Verify timer was set
            expect(disputeTimerSet).toBe(true);
            expect(disputeHandler.getActiveTimers().length).toBe(1);
        });

        it('should cancel timer when dispute is resolved', async () => {
            const amount = ethers.parseUnits('300', 18);
            
            // Create escrow
            await testToken.connect(buyer).approve(await escrowContract.getAddress(), amount);
            const tx = await escrowContract.connect(buyer).createEscrow(
                await seller.getAddress(),
                await testToken.getAddress(),
                amount,
                await testToken.getAddress(),
                31337
            );
            const receipt = await tx.wait();
            const event = receipt.logs.find(log => {
                try {
                    const parsed = escrowContract.interface.parseLog(log);
                    return parsed.name === 'EscrowCreated';
                } catch {
                    return false;
                }
            });
            const escrowId = escrowContract.interface.parseLog(event).args.escrowId;
            
            // Set condition as met and raise dispute
            await escrowContract.connect(owner).updateCondition(escrowId, true);
            await escrowContract.connect(buyer).raiseDispute(escrowId);
            
            mockDatabaseService.emit('disputeRaised', escrowId.toString(), {
                dealId: escrowId.toString(),
                escrowId: escrowId.toString(),
                chainId: 31337,
                contractAddress: await escrowContract.getAddress(),
                disputeTimestamp: Date.now()
            });
            
            await new Promise(resolve => setTimeout(resolve, 500));
            expect(disputeHandler.getActiveTimers().length).toBe(1);
            
            let timerCancelled = false;
            disputeHandler.once('disputeTimerCancelled', ({ dealId }) => {
                if (dealId === escrowId.toString()) {
                    timerCancelled = true;
                }
            });
            
            // Resolve dispute on blockchain
            const resolveTx = await escrowContract.connect(owner).resolveDispute(
                escrowId,
                await buyer.getAddress() // winner
            );
            await resolveTx.wait();
            
            // Emit database event
            mockDatabaseService.emit('disputeResolved', escrowId.toString(), {
                resolution: 'owner_resolved',
                txHash: resolveTx.hash
            });
            
            await new Promise(resolve => setTimeout(resolve, 500));
            
            expect(timerCancelled).toBe(true);
            expect(disputeHandler.getActiveTimers().length).toBe(0);
        });

        it('should handle auto-resolution for past disputes', async () => {
            const amount = ethers.parseUnits('1000', 18);
            
            // Create escrow
            await testToken.connect(buyer).approve(await escrowContract.getAddress(), amount);
            const tx = await escrowContract.connect(buyer).createEscrow(
                await seller.getAddress(),
                await testToken.getAddress(),
                amount,
                await testToken.getAddress(),
                31337
            );
            const receipt = await tx.wait();
            const event = receipt.logs.find(log => {
                try {
                    const parsed = escrowContract.interface.parseLog(log);
                    return parsed.name === 'EscrowCreated';
                } catch {
                    return false;
                }
            });
            const escrowId = escrowContract.interface.parseLog(event).args.escrowId;
            
            // Set condition and raise dispute
            await escrowContract.connect(owner).updateCondition(escrowId, true);
            await escrowContract.connect(buyer).raiseDispute(escrowId);
            
            // Mock past dispute (8 days ago)
            const pastTimestamp = Date.now() - (8 * 24 * 60 * 60 * 1000);
            
            // Mock escrow service to handle the production contract
            vi.spyOn(escrowService, 'getDisputeInfo').mockImplementation(async (id) => {
                if (id === escrowId.toString()) {
                    const escrowData = await escrowContract.escrows(escrowId);
                    return {
                        disputeRaised: escrowData.isDisputed,
                        disputeResolved: false
                    };
                }
                return { disputeRaised: false, disputeResolved: false };
            });
            
            vi.spyOn(escrowService, 'returnFundsAfterDisputeTimeout').mockResolvedValue({
                success: true,
                txHash: '0xauto123'
            });
            
            let autoResolved = false;
            disputeHandler.once('disputeAutoResolved', ({ dealId }) => {
                if (dealId === escrowId.toString()) {
                    autoResolved = true;
                }
            });
            
            // Emit past dispute
            mockDatabaseService.emit('disputeRaised', escrowId.toString(), {
                dealId: escrowId.toString(),
                escrowId: escrowId.toString(),
                chainId: 31337,
                contractAddress: await escrowContract.getAddress(),
                disputeTimestamp: pastTimestamp
            });
            
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            expect(autoResolved).toBe(true);
            expect(escrowService.returnFundsAfterDisputeTimeout).toHaveBeenCalledWith(
                escrowId.toString(),
                31337,
                await escrowContract.getAddress()
            );
        });
    });

    describe('Error Handling and Recovery', () => {
        it('should retry failed condition updates', async () => {
            const amount = ethers.parseUnits('50', 18);
            
            // Create escrow
            await testToken.connect(buyer).approve(await escrowContract.getAddress(), amount);
            const tx = await escrowContract.connect(buyer).createEscrow(
                await seller.getAddress(),
                await testToken.getAddress(),
                amount,
                await testToken.getAddress(),
                31337
            );
            const receipt = await tx.wait();
            const event = receipt.logs.find(log => {
                try {
                    const parsed = escrowContract.interface.parseLog(log);
                    return parsed.name === 'EscrowCreated';
                } catch {
                    return false;
                }
            });
            const escrowId = escrowContract.interface.parseLog(event).args.escrowId;
            
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
                escrowId: escrowId.toString(),
                chainId: 31337,
                contractAddress: await escrowContract.getAddress(),
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
            const amount = ethers.parseUnits('750', 18);
            
            // Create escrow
            await testToken.connect(buyer).approve(await escrowContract.getAddress(), amount);
            const tx = await escrowContract.connect(buyer).createEscrow(
                await seller.getAddress(),
                await testToken.getAddress(),
                amount,
                await testToken.getAddress(),
                31337
            );
            const receipt = await tx.wait();
            const event = receipt.logs.find(log => {
                try {
                    const parsed = escrowContract.interface.parseLog(log);
                    return parsed.name === 'EscrowCreated';
                } catch {
                    return false;
                }
            });
            const escrowId = escrowContract.interface.parseLog(event).args.escrowId;
            
            // Update condition
            mockDatabaseService.emit('conditionUpdated', 'verify-1', true, {
                dealId: 'verify-1',
                escrowId: escrowId.toString(),
                chainId: 31337,
                contractAddress: await escrowContract.getAddress(),
                conditionMet: true
            });
            
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // Verify on chain
            let escrowData = await escrowContract.escrows(escrowId);
            expect(escrowData.conditionMetTimestamp).toBeGreaterThan(0);
            
            // Raise dispute
            await escrowContract.connect(owner).updateCondition(escrowId, true);
            await escrowContract.connect(buyer).raiseDispute(escrowId);
            
            mockDatabaseService.emit('disputeRaised', escrowId.toString(), {
                dealId: escrowId.toString(),
                escrowId: escrowId.toString(),
                chainId: 31337,
                contractAddress: await escrowContract.getAddress(),
                disputeTimestamp: Date.now()
            });
            
            await new Promise(resolve => setTimeout(resolve, 500));
            
            escrowData = await escrowContract.escrows(escrowId);
            expect(escrowData.isDisputed).toBe(true);
            
            // Check active timers
            const activeTimers = disputeHandler.getActiveTimers();
            const escrowTimer = activeTimers.find(t => t.dealId === escrowId.toString());
            expect(escrowTimer).toBeDefined();
            expect(escrowTimer.hoursRemaining).toBeGreaterThan(160);
        });
    });
});