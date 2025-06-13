import { ethers } from 'ethers';
import LiFiBridgeService from './lifiService.js';

// CrossChainPropertyEscrow ABI (key functions)
const CROSS_CHAIN_ESCROW_ABI = [
    "function receiveCrossChainDeposit(bytes32 bridgeTransactionId, string memory sourceChain, address originalSender, uint256 amount, address tokenAddress) external",
    "function initiateCrossChainRelease() external returns (bytes32 bridgeTransactionId)",
    "function confirmCrossChainRelease(bytes32 bridgeTransactionId) external",
    "function getContractState() external view returns (uint8)",
    "function getCrossChainInfo() external view returns (string memory, string memory, bool, address, address)",
    "function getBalance() external view returns (uint256)",
    "event CrossChainDepositReceived(bytes32 indexed bridgeTransactionId, string sourceChain, address indexed originalSender, uint256 amount, address tokenAddress)",
    "event CrossChainReleaseInitiated(string targetChain, address indexed targetAddress, uint256 amount, address tokenAddress, bytes32 bridgeTransactionId)"
];

/**
 * SmartContractBridgeService
 * Coordinates between LiFi bridge operations and smart contract state
 */
export class SmartContractBridgeService {
    constructor() {
        this.lifiService = new LiFiBridgeService();
        this.providers = new Map();
        this.bridgeWallet = null;
        
        // Initialize providers for different networks
        this.initializeProviders();
    }

    initializeProviders() {
        const networks = {
            ethereum: process.env.ETHEREUM_RPC_URL || process.env.RPC_URL,
            polygon: process.env.POLYGON_RPC_URL,
            arbitrum: process.env.ARBITRUM_RPC_URL,
            optimism: process.env.OPTIMISM_RPC_URL,
            bsc: process.env.BSC_RPC_URL
        };

        for (const [network, rpcUrl] of Object.entries(networks)) {
            if (rpcUrl) {
                this.providers.set(network, new ethers.JsonRpcProvider(rpcUrl));
                console.log(`[BRIDGE-SERVICE] Initialized ${network} provider`);
            }
        }

        // Initialize bridge wallet (service wallet that calls contract functions)
        const isTestEnvironment = process.env.NODE_ENV === 'test' || 
                                 process.env.NODE_ENV === 'e2e_test';

        if (process.env.BRIDGE_PRIVATE_KEY) {
            this.bridgeWallet = new ethers.Wallet(process.env.BRIDGE_PRIVATE_KEY);
            console.log(`[BRIDGE-SERVICE] Bridge wallet initialized: ${this.bridgeWallet.address}`);
        } else if (isTestEnvironment) {
            // Create a mock wallet for testing
            this.bridgeWallet = ethers.Wallet.createRandom();
            console.log(`[BRIDGE-SERVICE] Mock bridge wallet created for testing: ${this.bridgeWallet.address}`);
        } else {
            console.warn('[BRIDGE-SERVICE] No BRIDGE_PRIVATE_KEY found - some functions will be limited');
        }
    }

    /**
     * Handle incoming cross-chain deposit to smart contract
     */
    async handleIncomingCrossChainDeposit({
        contractAddress,
        bridgeTransactionId,
        sourceChain,
        originalSender,
        amount,
        tokenAddress,
        dealId
    }) {
        try {
            console.log(`[BRIDGE-SERVICE] Processing incoming cross-chain deposit for deal ${dealId}`);
            console.log(`  Contract: ${contractAddress}`);
            console.log(`  Bridge TX: ${bridgeTransactionId}`);
            console.log(`  Source: ${sourceChain} -> ethereum`);
            console.log(`  Amount: ${ethers.formatEther(amount)} tokens`);

            // Check if we're in test environment
            const isTestEnvironment = process.env.NODE_ENV === 'test' || 
                                     process.env.NODE_ENV === 'e2e_test';

            if (isTestEnvironment) {
                console.log(`[BRIDGE-SERVICE] Test environment - mocking cross-chain deposit`);
                
                // Return mock successful result
                return {
                    success: true,
                    transactionHash: `0x${Math.random().toString(16).substr(2, 64)}`,
                    blockNumber: Math.floor(Math.random() * 1000000),
                    gasUsed: '150000',
                    depositEvent: {
                        bridgeTransactionId,
                        sourceChain,
                        originalSender,
                        amount: amount.toString(),
                        tokenAddress: tokenAddress || ethers.ZeroAddress
                    },
                    newContractState: 3, // AWAITING_CONDITION_FULFILLMENT
                    isMock: true
                };
            }

            // Get Ethereum provider (contract is deployed on Ethereum)
            const provider = this.providers.get('ethereum');
            if (!provider) {
                throw new Error('Ethereum provider not available');
            }

            // Connect bridge wallet to provider
            if (!this.bridgeWallet) {
                throw new Error('Bridge wallet not configured');
            }
            const signer = this.bridgeWallet.connect(provider);

            // Create contract instance
            const contract = new ethers.Contract(contractAddress, CROSS_CHAIN_ESCROW_ABI, signer);

            // Verify contract state before deposit
            const contractState = await contract.getContractState();
            console.log(`[BRIDGE-SERVICE] Contract state: ${contractState} (2 = AWAITING_CROSS_CHAIN_DEPOSIT)`);

            if (contractState !== 2) { // State.AWAITING_CROSS_CHAIN_DEPOSIT = 2
                throw new Error(`Contract not ready for cross-chain deposit. Current state: ${contractState}`);
            }

            // Call contract function to record cross-chain deposit
            console.log(`[BRIDGE-SERVICE] Calling receiveCrossChainDeposit...`);
            const tx = await contract.receiveCrossChainDeposit(
                bridgeTransactionId,
                sourceChain,
                originalSender,
                amount,
                tokenAddress || ethers.ZeroAddress,
                { gasLimit: 300000 } // Sufficient gas for cross-chain deposit
            );

            console.log(`[BRIDGE-SERVICE] Cross-chain deposit transaction sent: ${tx.hash}`);
            const receipt = await tx.wait();
            
            if (receipt.status === 1) {
                console.log(`[BRIDGE-SERVICE] Cross-chain deposit confirmed in block ${receipt.blockNumber}`);
                
                // Extract event data
                const depositEvent = receipt.logs.find(log => 
                    log.topics[0] === ethers.id("CrossChainDepositReceived(bytes32,string,address,uint256,address)")
                );
                
                return {
                    success: true,
                    transactionHash: tx.hash,
                    blockNumber: receipt.blockNumber,
                    gasUsed: receipt.gasUsed.toString(),
                    depositEvent: depositEvent ? {
                        bridgeTransactionId,
                        sourceChain,
                        originalSender,
                        amount: amount.toString(),
                        tokenAddress
                    } : null,
                    newContractState: await contract.getContractState(),
                    isMock: false
                };
            } else {
                throw new Error('Transaction failed');
            }

        } catch (error) {
            console.error(`[BRIDGE-SERVICE] Error handling incoming deposit:`, error);
            throw new Error(`Cross-chain deposit failed: ${error.message}`);
        }
    }

    /**
     * Initiate cross-chain release from smart contract to seller
     */
    async initiateCrossChainRelease({
        contractAddress,
        targetChain,
        targetAddress,
        dealId
    }) {
        try {
            console.log(`[BRIDGE-SERVICE] Initiating cross-chain release for deal ${dealId}`);
            console.log(`  Contract: ${contractAddress}`);
            console.log(`  Target: ethereum -> ${targetChain}`);
            console.log(`  Seller: ${targetAddress}`);

            // Check if we're in test environment
            const isTestEnvironment = process.env.NODE_ENV === 'test' || 
                                     process.env.NODE_ENV === 'e2e_test';

            if (isTestEnvironment) {
                console.log(`[BRIDGE-SERVICE] Test environment - mocking cross-chain release`);
                
                const mockBridgeTransactionId = `bridge-${Math.random().toString(16).substr(2, 16)}`;
                const mockAmount = ethers.parseEther('2.5'); // Mock amount
                
                // Mock the bridge execution
                const bridgeResult = {
                    success: true,
                    transactionHash: `0x${Math.random().toString(16).substr(2, 64)}`,
                    executionId: `mock-bridge-${Date.now()}`,
                    bridgeTransactionId: mockBridgeTransactionId,
                    estimatedTime: '5-10 minutes',
                    bridgeProvider: 'mock-bridge'
                };

                return {
                    success: true,
                    contractTransactionHash: `0x${Math.random().toString(16).substr(2, 64)}`,
                    bridgeTransactionId: mockBridgeTransactionId,
                    bridgeResult,
                    releaseAmount: mockAmount.toString(),
                    newContractState: 8, // CROSS_CHAIN_RELEASE_INITIATED
                    isMock: true
                };
            }

            // Get Ethereum provider (contract is on Ethereum)
            const provider = this.providers.get('ethereum');
            if (!provider) {
                throw new Error('Ethereum provider not available');
            }

            const signer = this.bridgeWallet.connect(provider);
            const contract = new ethers.Contract(contractAddress, CROSS_CHAIN_ESCROW_ABI, signer);

            // Verify contract is ready for release
            const contractState = await contract.getContractState();
            console.log(`[BRIDGE-SERVICE] Contract state: ${contractState} (7 = READY_FOR_CROSS_CHAIN_RELEASE)`);

            if (contractState !== 7) { // State.READY_FOR_CROSS_CHAIN_RELEASE = 7
                throw new Error(`Contract not ready for cross-chain release. Current state: ${contractState}`);
            }

            // Get contract balance and info
            const balance = await contract.getBalance();
            const [, sellerTargetChain, isCrossChain, tokenAddress] = await contract.getCrossChainInfo();
            
            console.log(`[BRIDGE-SERVICE] Contract balance: ${ethers.formatEther(balance)} tokens`);
            console.log(`[BRIDGE-SERVICE] Target chain: ${sellerTargetChain}`);
            console.log(`[BRIDGE-SERVICE] Token: ${tokenAddress}`);

            // Call contract to initiate cross-chain release
            console.log(`[BRIDGE-SERVICE] Calling initiateCrossChainRelease...`);
            const tx = await contract.initiateCrossChainRelease({
                gasLimit: 400000 // Sufficient gas for release initiation
            });

            const receipt = await tx.wait();
            
            if (receipt.status === 1) {
                console.log(`[BRIDGE-SERVICE] Cross-chain release initiated in block ${receipt.blockNumber}`);
                
                // Extract bridge transaction ID from events
                const releaseEvent = receipt.logs.find(log => 
                    log.topics[0] === ethers.id("CrossChainReleaseInitiated(string,address,uint256,address,bytes32)")
                );
                
                let bridgeTransactionId = null;
                let releaseAmount = null;
                
                if (releaseEvent) {
                    // Parse the event to get bridge transaction ID
                    const parsedEvent = contract.interface.parseLog(releaseEvent);
                    bridgeTransactionId = parsedEvent.args.bridgeTransactionId;
                    releaseAmount = parsedEvent.args.amount;
                    
                    console.log(`[BRIDGE-SERVICE] Bridge transaction ID: ${bridgeTransactionId}`);
                    console.log(`[BRIDGE-SERVICE] Release amount: ${ethers.formatEther(releaseAmount)} tokens`);
                }

                // Now execute the actual bridge transfer using LiFi
                const bridgeResult = await this.executeBridgeToSeller({
                    fromChain: 'ethereum',
                    toChain: targetChain,
                    fromAddress: contractAddress,
                    toAddress: targetAddress,
                    amount: releaseAmount || balance,
                    tokenAddress,
                    bridgeTransactionId,
                    dealId
                });

                return {
                    success: true,
                    contractTransactionHash: tx.hash,
                    bridgeTransactionId,
                    bridgeResult,
                    releaseAmount: (releaseAmount || balance).toString(),
                    newContractState: await contract.getContractState(),
                    isMock: false
                };
            } else {
                throw new Error('Contract transaction failed');
            }

        } catch (error) {
            console.error(`[BRIDGE-SERVICE] Error initiating cross-chain release:`, error);
            throw new Error(`Cross-chain release failed: ${error.message}`);
        }
    }

    /**
     * Execute bridge transfer to seller using LiFi
     */
    async executeBridgeToSeller({
        fromChain,
        toChain,
        fromAddress,
        toAddress,
        amount,
        tokenAddress,
        bridgeTransactionId,
        dealId
    }) {
        try {
            console.log(`[BRIDGE-SERVICE] Executing bridge transfer for deal ${dealId}`);
            
            // Find optimal route using LiFi
            const route = await this.lifiService.findOptimalRoute({
                fromChainId: fromChain,
                toChainId: toChain,
                fromTokenAddress: tokenAddress || '0x0000000000000000000000000000000000000000',
                toTokenAddress: tokenAddress || '0x0000000000000000000000000000000000000000',
                fromAmount: amount.toString(),
                fromAddress,
                toAddress,
                dealId
            });

            if (!route) {
                throw new Error('No bridge route found');
            }

            console.log(`[BRIDGE-SERVICE] Found route using bridge: ${route.bridgesUsed?.join(', ')}`);
            console.log(`[BRIDGE-SERVICE] Estimated time: ${route.estimatedTime}s`);
            console.log(`[BRIDGE-SERVICE] Total fees: $${route.totalFees}`);

            // Execute the bridge transfer
            const bridgeExecution = await this.lifiService.executeBridgeTransfer({
                route,
                dealId,
                onStatusUpdate: (dealId, updatedRoute) => {
                    console.log(`[BRIDGE-SERVICE] Bridge status update for ${dealId}:`, updatedRoute.status);
                },
                onError: (dealId, error) => {
                    console.error(`[BRIDGE-SERVICE] Bridge error for ${dealId}:`, error);
                }
            });

            return {
                success: true,
                bridgeProvider: route.bridgesUsed?.join(', ') || 'unknown',
                executionId: bridgeExecution.executionId,
                transactionHash: bridgeExecution.transactionHash,
                estimatedTime: route.estimatedTime,
                estimatedFees: route.totalFees,
                fromChain,
                toChain,
                amount: amount.toString()
            };

        } catch (error) {
            console.error(`[BRIDGE-SERVICE] Error executing bridge to seller:`, error);
            throw new Error(`Bridge execution failed: ${error.message}`);
        }
    }

    /**
     * Confirm cross-chain release completion in smart contract
     */
    async confirmCrossChainRelease({
        contractAddress,
        bridgeTransactionId,
        dealId
    }) {
        try {
            console.log(`[BRIDGE-SERVICE] Confirming cross-chain release completion for deal ${dealId}`);
            
            const provider = this.providers.get('ethereum');
            const signer = this.bridgeWallet.connect(provider);
            const contract = new ethers.Contract(contractAddress, CROSS_CHAIN_ESCROW_ABI, signer);

            // Verify contract is awaiting confirmation
            const contractState = await contract.getContractState();
            if (contractState !== 8) { // State.AWAITING_CROSS_CHAIN_RELEASE = 8
                throw new Error(`Contract not awaiting cross-chain release confirmation. Current state: ${contractState}`);
            }

            // Confirm the release
            const tx = await contract.confirmCrossChainRelease(bridgeTransactionId, {
                gasLimit: 200000
            });

            const receipt = await tx.wait();
            
            if (receipt.status === 1) {
                console.log(`[BRIDGE-SERVICE] Cross-chain release confirmed in block ${receipt.blockNumber}`);
                
                return {
                    success: true,
                    transactionHash: tx.hash,
                    blockNumber: receipt.blockNumber,
                    newContractState: await contract.getContractState(), // Should be COMPLETED = 9
                    dealCompleted: true
                };
            } else {
                throw new Error('Confirmation transaction failed');
            }

        } catch (error) {
            console.error(`[BRIDGE-SERVICE] Error confirming cross-chain release:`, error);
            throw new Error(`Cross-chain release confirmation failed: ${error.message}`);
        }
    }

    /**
     * Monitor bridge status and auto-confirm when complete
     */
    async monitorAndConfirmBridge({
        contractAddress,
        bridgeTransactionId,
        executionId,
        dealId,
        maxWaitTime = 1800000 // 30 minutes
    }) {
        const startTime = Date.now();
        const checkInterval = 30000; // 30 seconds

        console.log(`[BRIDGE-SERVICE] Starting bridge monitoring for deal ${dealId}`);
        console.log(`[BRIDGE-SERVICE] Execution ID: ${executionId}`);
        console.log(`[BRIDGE-SERVICE] Max wait time: ${maxWaitTime / 60000} minutes`);

        return new Promise((resolve, reject) => {
            const checkStatus = async () => {
                try {
                    // Check if we've exceeded max wait time
                    if (Date.now() - startTime > maxWaitTime) {
                        reject(new Error('Bridge monitoring timeout'));
                        return;
                    }

                    // Get bridge status from LiFi
                    const status = await this.lifiService.getTransactionStatus(executionId, dealId);
                    console.log(`[BRIDGE-SERVICE] Bridge status: ${status.status} (${status.substatus})`);

                    if (status.status === 'DONE') {
                        console.log(`[BRIDGE-SERVICE] Bridge completed! Confirming in smart contract...`);
                        
                        // Confirm completion in smart contract
                        const confirmResult = await this.confirmCrossChainRelease({
                            contractAddress,
                            bridgeTransactionId,
                            dealId
                        });

                        resolve({
                            success: true,
                            bridgeStatus: status,
                            contractConfirmation: confirmResult,
                            totalTime: Date.now() - startTime
                        });
                    } else if (status.status === 'FAILED') {
                        reject(new Error(`Bridge failed: ${status.substatusMessage || 'Unknown error'}`));
                    } else {
                        // Still in progress, check again later
                        setTimeout(checkStatus, checkInterval);
                    }

                } catch (error) {
                    console.error(`[BRIDGE-SERVICE] Error during bridge monitoring:`, error);
                    // Don't reject immediately on individual check failures
                    setTimeout(checkStatus, checkInterval);
                }
            };

            // Start monitoring
            checkStatus();
        });
    }

    /**
     * Get contract state information
     */
    async getContractInfo(contractAddress) {
        try {
            const provider = this.providers.get('ethereum');
            const contract = new ethers.Contract(contractAddress, CROSS_CHAIN_ESCROW_ABI, provider);

            const [state, balance, crossChainInfo] = await Promise.all([
                contract.getContractState(),
                contract.getBalance(),
                contract.getCrossChainInfo()
            ]);

            const [buyerSourceChain, sellerTargetChain, isCrossChain, tokenAddress, bridgeContract] = crossChainInfo;

            return {
                contractAddress,
                state: parseInt(state),
                balance: balance.toString(),
                balanceFormatted: ethers.formatEther(balance),
                buyerSourceChain,
                sellerTargetChain,
                isCrossChain,
                tokenAddress,
                bridgeContract
            };

        } catch (error) {
            console.error(`[BRIDGE-SERVICE] Error getting contract info:`, error);
            throw new Error(`Failed to get contract info: ${error.message}`);
        }
    }
}

export default SmartContractBridgeService; 