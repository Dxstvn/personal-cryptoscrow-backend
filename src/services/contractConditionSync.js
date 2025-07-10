/**
 * Real-time contract condition synchronization service
 * Updates on-chain condition status immediately when database condition changes
 */

const { ethers } = require('ethers');
const EventEmitter = require('events');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

class ContractConditionSync extends EventEmitter {
    constructor(databaseService, escrowService) {
        super();
        this.db = databaseService;
        this.escrowService = escrowService;
        this.isRunning = false;
        this.providers = {};
        this.wallets = {};
        this.contracts = {};
        
        this._initializeProviders();
    }

    /**
     * Initialize providers and wallets for each chain
     */
    _initializeProviders() {
        // Sepolia
        if (process.env.SEPOLIA_RPC_URL) {
            this.providers[11155111] = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
            this.wallets[11155111] = new ethers.Wallet(
                process.env.BACKEND_WALLET_PRIVATE_KEY,
                this.providers[11155111]
            );
        }
        
        // Arbitrum Sepolia
        if (process.env.ARBITRUM_SEPOLIA_RPC_URL) {
            this.providers[421614] = new ethers.JsonRpcProvider(process.env.ARBITRUM_SEPOLIA_RPC_URL);
            this.wallets[421614] = new ethers.Wallet(
                process.env.BACKEND_WALLET_PRIVATE_KEY,
                this.providers[421614]
            );
        }
        
        // Polygon Amoy
        if (process.env.POLYGON_AMOY_RPC_URL) {
            this.providers[80002] = new ethers.JsonRpcProvider(process.env.POLYGON_AMOY_RPC_URL);
            this.wallets[80002] = new ethers.Wallet(
                process.env.BACKEND_WALLET_PRIVATE_KEY,
                this.providers[80002]
            );
        }
    }

    /**
     * Get or create contract instance for a chain
     */
    async _getContract(chainId, contractAddress) {
        const key = `${chainId}-${contractAddress}`;
        
        if (!this.contracts[key]) {
            const wallet = this.wallets[chainId];
            if (!wallet) {
                throw new Error(`No wallet configured for chain ${chainId}`);
            }
            
            // Get contract ABI
            const contractArtifact = require('../contract/artifacts/contracts/UniversalEscrowServiceV3Disputes.sol/UniversalEscrowServiceV3Disputes.json');
            
            this.contracts[key] = new ethers.Contract(
                contractAddress,
                contractArtifact.abi,
                wallet
            );
        }
        
        return this.contracts[key];
    }

    /**
     * Start watching for database condition updates
     */
    async start() {
        if (this.isRunning) return;
        this.isRunning = true;

        console.log('Starting real-time contract condition sync...');
        
        // Listen for database condition updates
        this.db.on('conditionUpdated', async (escrowId, newStatus, escrowData) => {
            try {
                await this.syncConditionToContract(escrowId, newStatus, escrowData);
            } catch (error) {
                console.error(`Failed to sync condition for escrow ${escrowId}:`, error);
                this.emit('syncError', { escrowId, error });
            }
        });
        
        // Also listen for dispute events
        this.db.on('disputeRaised', async (escrowId, disputeData) => {
            try {
                await this.syncDisputeToContract(escrowId, disputeData);
            } catch (error) {
                console.error(`Failed to sync dispute for escrow ${escrowId}:`, error);
                this.emit('syncError', { escrowId, error });
            }
        });
    }

    /**
     * Sync a single condition update to the contract
     */
    async syncConditionToContract(escrowId, conditionMet, escrowData) {
        console.log(`Syncing condition for escrow ${escrowId}: ${conditionMet}`);

        // Get escrow details from database if not provided
        if (!escrowData) {
            escrowData = await this.db.getEscrowById(escrowId);
        }
        
        if (!escrowData) {
            throw new Error(`Escrow ${escrowId} not found in database`);
        }

        const contract = await this._getContract(escrowData.chainId, escrowData.contractAddress);

        // Check on-chain status
        const onChainEscrow = await contract.escrows(escrowId);
        if (onChainEscrow.conditionMet === conditionMet) {
            console.log(`Condition already synced for ${escrowId}`);
            return;
        }

        // Update on-chain condition
        const tx = await contract.updateCondition(escrowId, conditionMet);
        const receipt = await tx.wait();

        console.log(`✅ Condition synced for ${escrowId}. Tx: ${tx.hash}`);
        
        // Check if we should trigger automatic release
        if (conditionMet) {
            await this._checkAutoRelease(escrowId, escrowData);
        }
        
        this.emit('conditionSynced', { 
            escrowId, 
            conditionMet, 
            txHash: tx.hash,
            blockNumber: receipt.blockNumber 
        });

        return tx.hash;
    }

    /**
     * Check if escrow can be automatically released after dispute window
     */
    async _checkAutoRelease(escrowId, escrowData) {
        const contract = await this._getContract(escrowData.chainId, escrowData.contractAddress);
        
        // Check if escrow can be released
        const [canRelease, reason] = await contract.canReleaseEscrow(escrowId);
        
        if (canRelease) {
            // Schedule automatic release
            console.log(`Escrow ${escrowId} can be released. Scheduling automatic release...`);
            this.emit('readyForRelease', { escrowId, escrowData });
        } else {
            console.log(`Escrow ${escrowId} cannot be released yet: ${reason}`);
            
            // If dispute window is active, schedule a check after it expires
            if (reason.includes('Dispute window active')) {
                const match = reason.match(/(\d+) seconds remaining/);
                if (match) {
                    const secondsRemaining = parseInt(match[1]);
                    console.log(`Scheduling release check in ${secondsRemaining + 60} seconds`);
                    
                    setTimeout(async () => {
                        await this._checkAutoRelease(escrowId, escrowData);
                    }, (secondsRemaining + 60) * 1000);
                }
            }
        }
    }

    /**
     * Sync dispute to contract
     */
    async syncDisputeToContract(escrowId, disputeData) {
        console.log(`Syncing dispute for escrow ${escrowId}`);

        const escrowData = await this.db.getEscrowById(escrowId);
        if (!escrowData) {
            throw new Error(`Escrow ${escrowId} not found in database`);
        }

        const contract = await this._getContract(escrowData.chainId, escrowData.contractAddress);

        // Raise dispute on-chain
        const tx = await contract.raiseDispute(escrowId, disputeData.reason);
        await tx.wait();

        console.log(`✅ Dispute synced for ${escrowId}. Tx: ${tx.hash}`);
        this.emit('disputeSynced', { escrowId, txHash: tx.hash });

        return tx.hash;
    }

    /**
     * Batch sync all pending conditions
     */
    async syncAllPendingConditions() {
        const pendingEscrows = await this.db.getEscrowsWithPendingConditions();
        console.log(`Found ${pendingEscrows.length} escrows with pending condition updates`);

        const results = [];
        for (const escrow of pendingEscrows) {
            try {
                const txHash = await this.syncConditionToContract(
                    escrow.escrowId,
                    escrow.conditionMet,
                    escrow
                );
                results.push({ escrowId: escrow.escrowId, success: true, txHash });
            } catch (error) {
                results.push({ escrowId: escrow.escrowId, success: false, error: error.message });
            }
        }

        return results;
    }

    /**
     * Handle automatic release after dispute window
     */
    async handleAutomaticRelease(escrowId) {
        console.log(`Processing automatic release for escrow ${escrowId}`);

        const escrowData = await this.db.getEscrowById(escrowId);
        if (!escrowData) {
            throw new Error(`Escrow ${escrowId} not found in database`);
        }

        const contract = await this._getContract(escrowData.chainId, escrowData.contractAddress);

        // Check one more time if release is allowed
        const [canRelease, reason] = await contract.canReleaseEscrow(escrowId);
        if (!canRelease) {
            console.log(`Cannot release ${escrowId}: ${reason}`);
            return;
        }

        // Get fee quote if cross-chain
        let fee = 0;
        if (escrowData.targetChainId !== escrowData.chainId) {
            const quote = await this.escrowService.getStargateQuote(
                escrowData.chainId,
                escrowData.targetChainId,
                escrowData.depositToken,
                escrowData.netAmount
            );
            fee = quote.fee;
        }

        // Execute release
        const tx = await contract.releaseEscrow(escrowId, { value: fee });
        const receipt = await tx.wait();

        console.log(`✅ Automatic release completed for ${escrowId}. Tx: ${tx.hash}`);
        this.emit('automaticReleaseCompleted', { 
            escrowId, 
            txHash: tx.hash,
            blockNumber: receipt.blockNumber 
        });

        // Update database
        await this.db.updateEscrowStatus(escrowId, 'released');

        return tx.hash;
    }

    /**
     * Handle funds return after unresolved dispute
     */
    async handleDisputeTimeout(escrowId) {
        console.log(`Processing dispute timeout for escrow ${escrowId}`);

        const escrowData = await this.db.getEscrowById(escrowId);
        if (!escrowData) {
            throw new Error(`Escrow ${escrowId} not found in database`);
        }

        const contract = await this._getContract(escrowData.chainId, escrowData.contractAddress);

        // Return funds to buyer
        const tx = await contract.returnFundsAfterDisputeTimeout(escrowId);
        const receipt = await tx.wait();

        console.log(`✅ Funds returned to buyer for ${escrowId}. Tx: ${tx.hash}`);
        this.emit('fundsReturnedToBuyer', { 
            escrowId, 
            txHash: tx.hash,
            blockNumber: receipt.blockNumber 
        });

        // Update database
        await this.db.updateEscrowStatus(escrowId, 'cancelled');

        return tx.hash;
    }

    /**
     * Monitor dispute deadlines
     */
    async monitorDisputeDeadlines() {
        // Get all escrows with active disputes
        const activeDisputes = await this.db.getActiveDisputes();
        
        for (const dispute of activeDisputes) {
            const contract = await this._getContract(dispute.chainId, dispute.contractAddress);
            const disputeInfo = await contract.disputes(dispute.escrowId);
            
            const now = Math.floor(Date.now() / 1000);
            const resolutionDeadline = disputeInfo.disputeRaisedTimestamp + (7 * 24 * 60 * 60); // 7 days
            
            if (now > resolutionDeadline && !disputeInfo.disputeResolved) {
                // Dispute timeout - return funds to buyer
                await this.handleDisputeTimeout(dispute.escrowId);
            }
        }
    }

    /**
     * Stop the sync service
     */
    stop() {
        this.isRunning = false;
        this.removeAllListeners();
        console.log('Contract condition sync stopped');
    }
}

module.exports = ContractConditionSync;

/**
 * Example usage:
 * 
 * const sync = new ContractConditionSync(databaseService, escrowServiceV3);
 * 
 * // Start real-time sync
 * await sync.start();
 * 
 * // Listen for sync events
 * sync.on('conditionSynced', ({ escrowId, txHash }) => {
 *     console.log(`Condition synced for ${escrowId}: ${txHash}`);
 * });
 * 
 * sync.on('readyForRelease', async ({ escrowId }) => {
 *     await sync.handleAutomaticRelease(escrowId);
 * });
 * 
 * sync.on('syncError', ({ escrowId, error }) => {
 *     console.error(`Sync failed for ${escrowId}:`, error);
 * });
 * 
 * // Monitor dispute deadlines (run periodically)
 * setInterval(() => sync.monitorDisputeDeadlines(), 60 * 60 * 1000); // Every hour
 */