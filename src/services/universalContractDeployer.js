import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';

// Cache for contract artifacts
let universalContractArtifact = null;

/**
 * Load the Universal Property Escrow contract artifact
 */
async function loadUniversalContractArtifact() {
    if (universalContractArtifact) {
        return universalContractArtifact;
    }

    try {
        const artifactPath = path.join(process.cwd(), 'src/contract/artifacts/contracts/UniversalPropertyEscrow.sol/UniversalPropertyEscrow.json');
        const artifactContent = fs.readFileSync(artifactPath, 'utf8');
        universalContractArtifact = JSON.parse(artifactContent);
        return universalContractArtifact;
    } catch (error) {
        console.error('[UNIVERSAL-DEPLOYER] Error loading contract artifact:', error);
        
        // Fallback: try to load from different possible paths
        const fallbackPaths = [
            path.join(process.cwd(), 'src/contract/UniversalPropertyEscrow.json'),
            path.join(process.cwd(), 'contract/artifacts/UniversalPropertyEscrow.json'),
            path.join(process.cwd(), 'artifacts/contracts/UniversalPropertyEscrow.sol/UniversalPropertyEscrow.json')
        ];

        for (const fallbackPath of fallbackPaths) {
            try {
                const fallbackContent = fs.readFileSync(fallbackPath, 'utf8');
                universalContractArtifact = JSON.parse(fallbackContent);
                console.log(`[UNIVERSAL-DEPLOYER] Loaded artifact from fallback path: ${fallbackPath}`);
                return universalContractArtifact;
            } catch (fallbackError) {
                // Continue to next fallback
            }
        }

        throw new Error('Could not load UniversalPropertyEscrow contract artifact from any path');
    }
}

/**
 * Detect transaction type based on networks and token
 */
function detectTransactionType(buyerNetwork, sellerNetwork, tokenAddress) {
    const isSameNetwork = buyerNetwork === sellerNetwork;
    const isNativeToken = !tokenAddress || tokenAddress === '0x0000000000000000000000000000000000000000';
    
    if (isSameNetwork && isNativeToken) {
        return 'same_chain';
    } else if (isSameNetwork && !isNativeToken) {
        return 'same_chain_swap';
    } else if (!isSameNetwork && isNativeToken) {
        return 'cross_chain_bridge';
    } else {
        return 'cross_chain_swap_bridge';
    }
}

/**
 * Generate a LiFi route ID for transaction orchestration
 */
function generateLiFiRouteId(transactionData) {
    const { buyerNetwork, sellerNetwork, tokenAddress, amount, dealId } = transactionData;
    const routeString = `${buyerNetwork}-${sellerNetwork}-${tokenAddress || 'native'}-${amount}-${dealId || 'unknown'}`;
    return ethers.keccak256(ethers.toUtf8Bytes(routeString));
}

/**
 * Get optimal LiFi route for the transaction
 */
async function getOptimalLiFiRoute(transactionData) {
    try {
        const { buyerNetwork, sellerNetwork, buyerAddress, sellerAddress, amount, tokenAddress } = transactionData;
        
        // Import LiFi service
        const liFiModule = await import('./lifiService.js');
        const lifiService = new liFiModule.LiFiBridgeService();
        
        // Convert network names to chain IDs
        const fromChainId = lifiService.getChainId(buyerNetwork);
        const toChainId = lifiService.getChainId(sellerNetwork);
        
        if (!fromChainId || !toChainId) {
            console.warn(`[UNIVERSAL-DEPLOYER] Unsupported network for LiFi: ${buyerNetwork} -> ${sellerNetwork}`);
            return null;
        }

        // Find universal route
        const route = await lifiService.findUniversalRoute({
            fromChainId,
            toChainId,
            fromTokenAddress: tokenAddress || '0x0000000000000000000000000000000000000000',
            toTokenAddress: tokenAddress || '0x0000000000000000000000000000000000000000',
            fromAmount: ethers.parseEther(amount.toString()).toString(),
            fromAddress: buyerAddress,
            toAddress: sellerAddress,
            dealId: transactionData.dealId || `deploy-${Date.now()}`,
            transactionType: 'auto'
        });

        return route;
    } catch (error) {
        console.warn('[UNIVERSAL-DEPLOYER] Error getting LiFi route:', error.message);
        return null;
    }
}

/**
 * Deploy Universal Property Escrow Contract
 * This replaces both deployPropertyEscrowContract and deployCrossChainPropertyEscrowContract
 */
export async function deployUniversalPropertyEscrow({
    sellerAddress,
    buyerAddress,
    escrowAmount,
    serviceWalletAddress,
    buyerNetwork = 'ethereum',
    sellerNetwork = 'ethereum',
    tokenAddress = null,
    deployerPrivateKey,
    rpcUrl,
    dealId = null,
    gasOptions = {}
}) {
    console.log(`[UNIVERSAL-DEPLOYER] Starting universal contract deployment`);
    console.log(`[UNIVERSAL-DEPLOYER] Networks: ${buyerNetwork} -> ${sellerNetwork}`);
    console.log(`[UNIVERSAL-DEPLOYER] Token: ${tokenAddress || 'native'}`);
    console.log(`[UNIVERSAL-DEPLOYER] Amount: ${escrowAmount.toString()}`);

    try {
        // Validate inputs
        if (!ethers.isAddress(sellerAddress)) {
            throw new Error(`Invalid seller address: ${sellerAddress}`);
        }
        if (!ethers.isAddress(buyerAddress)) {
            throw new Error(`Invalid buyer address: ${buyerAddress}`);
        }
        if (!ethers.isAddress(serviceWalletAddress)) {
            throw new Error(`Invalid service wallet address: ${serviceWalletAddress}`);
        }
        if (!deployerPrivateKey || !rpcUrl) {
            throw new Error('Deployer private key and RPC URL are required');
        }

        // Setup provider and wallet
        const provider = new ethers.JsonRpcProvider(rpcUrl);
        const deployerWallet = new ethers.Wallet(deployerPrivateKey, provider);
        
        console.log(`[UNIVERSAL-DEPLOYER] Deployer address: ${deployerWallet.address}`);

        // Load contract artifact
        const contractArtifact = await loadUniversalContractArtifact();
        
        // Detect transaction type
        const transactionType = detectTransactionType(buyerNetwork, sellerNetwork, tokenAddress);
        console.log(`[UNIVERSAL-DEPLOYER] Detected transaction type: ${transactionType}`);

        // Get optimal LiFi route for complex transactions
        const lifiRoute = await getOptimalLiFiRoute({
            buyerNetwork,
            sellerNetwork,
            buyerAddress,
            sellerAddress,
            amount: ethers.formatEther(escrowAmount),
            tokenAddress,
            dealId
        });

        // Generate LiFi route ID
        const lifiRouteId = generateLiFiRouteId({
            buyerNetwork,
            sellerNetwork,
            tokenAddress,
            amount: escrowAmount.toString(),
            dealId
        });

        console.log(`[UNIVERSAL-DEPLOYER] LiFi route ID: ${lifiRouteId}`);
        if (lifiRoute) {
            console.log(`[UNIVERSAL-DEPLOYER] LiFi route found: ${lifiRoute.transactionType}`);
        }

        // Create contract factory
        const contractFactory = new ethers.ContractFactory(
            contractArtifact.abi,
            contractArtifact.bytecode,
            deployerWallet
        );

        // Prepare constructor parameters
        const constructorParams = [
            sellerAddress,
            buyerAddress,
            escrowAmount,
            serviceWalletAddress,
            buyerNetwork,
            sellerNetwork,
            tokenAddress || '0x0000000000000000000000000000000000000000',
            lifiRouteId,
            transactionType
        ];

        console.log(`[UNIVERSAL-DEPLOYER] Constructor params:`, {
            seller: sellerAddress,
            buyer: buyerAddress,
            amount: escrowAmount.toString(),
            serviceWallet: serviceWalletAddress,
            buyerNetwork,
            sellerNetwork,
            tokenAddress: tokenAddress || 'native',
            lifiRouteId,
            transactionType
        });

        // Estimate gas
        let gasLimit;
        try {
            const estimatedGas = await contractFactory.getDeployTransaction(...constructorParams).then(tx => 
                provider.estimateGas(tx)
            );
            gasLimit = BigInt(Math.floor(Number(estimatedGas) * 1.2)); // Add 20% buffer
            console.log(`[UNIVERSAL-DEPLOYER] Estimated gas: ${estimatedGas}, using: ${gasLimit}`);
        } catch (gasError) {
            console.warn('[UNIVERSAL-DEPLOYER] Gas estimation failed, using default:', gasError.message);
            gasLimit = BigInt(3000000); // Default 3M gas
        }

        // Prepare deployment options
        const deployOptions = {
            gasLimit,
            ...gasOptions
        };

        // Add gas price if not provided
        if (!deployOptions.gasPrice && !deployOptions.maxFeePerGas) {
            try {
                const feeData = await provider.getFeeData();
                if (feeData.maxFeePerGas) {
                    deployOptions.maxFeePerGas = feeData.maxFeePerGas;
                    deployOptions.maxPriorityFeePerGas = feeData.maxPriorityFeePerGas;
                } else {
                    deployOptions.gasPrice = feeData.gasPrice;
                }
            } catch (feeError) {
                console.warn('[UNIVERSAL-DEPLOYER] Fee data retrieval failed:', feeError.message);
            }
        }

        console.log(`[UNIVERSAL-DEPLOYER] Deploying with options:`, {
            gasLimit: deployOptions.gasLimit?.toString(),
            gasPrice: deployOptions.gasPrice?.toString(),
            maxFeePerGas: deployOptions.maxFeePerGas?.toString()
        });

        // Deploy the contract
        const contract = await contractFactory.deploy(...constructorParams, deployOptions);
        console.log(`[UNIVERSAL-DEPLOYER] Contract deployment transaction sent: ${contract.deploymentTransaction().hash}`);

        // Wait for deployment
        const deployedContract = await contract.waitForDeployment();
        const contractAddress = await deployedContract.getAddress();
        
        console.log(`[UNIVERSAL-DEPLOYER] Universal contract deployed at: ${contractAddress}`);

        // Get deployment transaction receipt
        const receipt = await contract.deploymentTransaction().wait();
        const gasUsed = receipt.gasUsed;
        const effectiveGasPrice = receipt.gasPrice || receipt.effectiveGasPrice;
        const deploymentCost = gasUsed * effectiveGasPrice;

        console.log(`[UNIVERSAL-DEPLOYER] Deployment successful:`);
        console.log(`  - Contract: ${contractAddress}`);
        console.log(`  - Gas used: ${gasUsed.toString()}`);
        console.log(`  - Gas price: ${ethers.formatUnits(effectiveGasPrice, 'gwei')} gwei`);
        console.log(`  - Cost: ${ethers.formatEther(deploymentCost)} ETH`);

        // Verify contract state
        const deployedTxMetadata = await deployedContract.getTransactionMetadata();
        console.log(`[UNIVERSAL-DEPLOYER] Contract metadata verified:`, {
            buyerNetwork: deployedTxMetadata.buyerNetwork,
            sellerNetwork: deployedTxMetadata.sellerNetwork,
            tokenAddress: deployedTxMetadata.tokenAddress,
            isUniversalDeal: deployedTxMetadata.isUniversalDeal,
            transactionType: deployedTxMetadata.transactionType
        });

        return {
            contractAddress,
            gasUsed: gasUsed.toString(),
            deploymentCost: ethers.formatEther(deploymentCost),
            transactionHash: contract.deploymentTransaction().hash,
            contractInfo: {
                isUniversalContract: true,
                transactionType,
                buyerNetwork,
                sellerNetwork,
                tokenAddress: tokenAddress || null,
                lifiRouteId,
                lifiRoute: lifiRoute ? {
                    transactionType: lifiRoute.transactionType,
                    estimatedTime: lifiRoute.estimatedTime,
                    totalFees: lifiRoute.totalFees
                } : null,
                metadata: deployedTxMetadata
            },
            abi: contractArtifact.abi
        };

    } catch (error) {
        console.error('[UNIVERSAL-DEPLOYER] Deployment failed:', error);
        throw new Error(`Universal contract deployment failed: ${error.message}`);
    }
}

/**
 * Backward compatibility: Legacy deployer function
 * This maintains compatibility with existing code
 */
export async function deployPropertyEscrowContract(
    sellerAddress,
    buyerAddress,
    escrowAmountWei,
    deployerPrivateKey,
    rpcUrl,
    serviceWalletAddress,
    gasOptions = {}
) {
    console.log('[UNIVERSAL-DEPLOYER] Using legacy deployment interface - converting to universal');
    
    return await deployUniversalPropertyEscrow({
        sellerAddress,
        buyerAddress,
        escrowAmount: BigInt(escrowAmountWei),
        serviceWalletAddress,
        buyerNetwork: 'ethereum',
        sellerNetwork: 'ethereum',
        tokenAddress: null,
        deployerPrivateKey,
        rpcUrl,
        dealId: `legacy-${Date.now()}`,
        gasOptions
    });
}

/**
 * Backward compatibility: Legacy cross-chain deployer function
 */
export async function deployCrossChainPropertyEscrowContract({
    sellerAddress,
    buyerAddress,
    escrowAmount,
    serviceWalletAddress,
    buyerSourceChain,
    sellerTargetChain,
    tokenAddress,
    deployerPrivateKey,
    rpcUrl,
    dealId
}) {
    console.log('[UNIVERSAL-DEPLOYER] Using legacy cross-chain deployment interface - converting to universal');
    
    return await deployUniversalPropertyEscrow({
        sellerAddress,
        buyerAddress,
        escrowAmount,
        serviceWalletAddress,
        buyerNetwork: buyerSourceChain,
        sellerNetwork: sellerTargetChain,
        tokenAddress,
        deployerPrivateKey,
        rpcUrl,
        dealId
    });
}

/**
 * Get contract interaction helper
 */
export async function getUniversalContractInterface(contractAddress, providerOrSigner) {
    const contractArtifact = await loadUniversalContractArtifact();
    return new ethers.Contract(contractAddress, contractArtifact.abi, providerOrSigner);
}

/**
 * Estimate gas for universal contract deployment
 */
export async function estimateUniversalDeploymentGas({
    sellerAddress,
    buyerAddress,
    escrowAmount,
    serviceWalletAddress,
    buyerNetwork = 'ethereum',
    sellerNetwork = 'ethereum',
    tokenAddress = null,
    rpcUrl
}) {
    try {
        const provider = new ethers.JsonRpcProvider(rpcUrl);
        const contractArtifact = await loadUniversalContractArtifact();
        
        const transactionType = detectTransactionType(buyerNetwork, sellerNetwork, tokenAddress);
        const lifiRouteId = generateLiFiRouteId({
            buyerNetwork,
            sellerNetwork,
            tokenAddress,
            amount: escrowAmount.toString(),
            dealId: 'gas-estimate'
        });

        const contractFactory = new ethers.ContractFactory(
            contractArtifact.abi,
            contractArtifact.bytecode,
            provider
        );

        const constructorParams = [
            sellerAddress,
            buyerAddress,
            escrowAmount,
            serviceWalletAddress,
            buyerNetwork,
            sellerNetwork,
            tokenAddress || '0x0000000000000000000000000000000000000000',
            lifiRouteId,
            transactionType
        ];

        const deployTx = await contractFactory.getDeployTransaction(...constructorParams);
        const estimatedGas = await provider.estimateGas(deployTx);
        const feeData = await provider.getFeeData();
        
        const gasPrice = feeData.gasPrice || feeData.maxFeePerGas;
        const estimatedCost = estimatedGas * gasPrice;

        return {
            gasLimit: estimatedGas.toString(),
            gasPrice: gasPrice.toString(),
            estimatedCost: ethers.formatEther(estimatedCost),
            transactionType,
            isUniversalDeal: transactionType !== 'same_chain'
        };
    } catch (error) {
        console.error('[UNIVERSAL-DEPLOYER] Gas estimation failed:', error);
        throw new Error(`Gas estimation failed: ${error.message}`);
    }
}

export default {
    deployUniversalPropertyEscrow,
    deployPropertyEscrowContract,
    deployCrossChainPropertyEscrowContract,
    getUniversalContractInterface,
    estimateUniversalDeploymentGas
}; 