import { getAdminApp } from '../api/routes/auth/admin.js';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';

// Helper function to get database
async function getDb() {
  const adminApp = await getAdminApp();
  return getFirestore(adminApp);
}

// Lazy initialization for LI.FI service to prevent issues during test imports
let lifiService = null;
async function getLifiService() {
  if (!lifiService) {
    try {
      // Dynamic import to avoid loading @lifi/sdk during module parsing
      const { default: LiFiBridgeService } = await import('./lifiService.js');
      lifiService = new LiFiBridgeService();
    } catch (error) {
      console.warn('[CROSS-CHAIN] Failed to initialize LI.FI service:', error.message);
      // Create a mock service for testing or when LI.FI is unavailable
      lifiService = {
        findOptimalRoute: async () => { throw new Error('LI.FI service unavailable'); },
        executeBridgeTransfer: async () => { throw new Error('LI.FI service unavailable'); },
        getTransactionStatus: async () => ({ status: 'UNKNOWN', substatus: 'SERVICE_UNAVAILABLE' }),
        getSupportedChains: async () => []
      };
    }
  }
  return lifiService;
}

// Enhanced network configurations that will be enriched by LI.FI
const NETWORK_CONFIG = {
  ethereum: {
    chainId: 1,
    isEVM: true,
    nativeCurrency: 'ETH',
    wrappedNative: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH
    stableTokens: [
      '0xA0b86a33E6441b5c52E6F2c1ecAa63e4d1B28d37', // USDC
      '0xdAC17F958D2ee523a2206206994597C13D831ec7'  // USDT
    ]
  },
  polygon: {
    chainId: 137,
    isEVM: true,
    nativeCurrency: 'MATIC',
    wrappedNative: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270', // WMATIC
    wrappedETH: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619', // WETH on Polygon
    stableTokens: [
      '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', // USDC
      '0xc2132D05D31c914a87C6611C10748AEb04B58e8F'  // USDT
    ]
  },
  bsc: {
    chainId: 56,
    isEVM: true,
    nativeCurrency: 'BNB',
    wrappedNative: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', // WBNB
    stableTokens: [
      '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', // USDC
      '0x55d398326f99059fF775485246999027B3197955'  // USDT
    ]
  },
  arbitrum: {
    chainId: 42161,
    isEVM: true,
    nativeCurrency: 'ETH',
    wrappedNative: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', // WETH
    stableTokens: [
      '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8', // USDC
      '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9'  // USDT
    ]
  },
  optimism: {
    chainId: 10,
    isEVM: true,
    nativeCurrency: 'ETH',
    wrappedNative: '0x4200000000000000000000000000000000000006', // WETH
    stableTokens: [
      '0x7F5c764cBc14f9669B88837ca1490cCa17c31607', // USDC
      '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58'  // USDT
    ]
  },
  avalanche: {
    chainId: 43114,
    isEVM: true,
    nativeCurrency: 'AVAX',
    wrappedNative: '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7', // WAVAX
    stableTokens: [
      '0xA7D7079b0FEaD91F3e65f86E8915Cb59c1a4C664', // USDC
      '0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7'  // USDT
    ]
  },
  solana: {
    isEVM: false,
    nativeCurrency: 'SOL'
  },
  bitcoin: {
    isEVM: false,
    nativeCurrency: 'BTC'
  }
};

/**
 * Validate token address for a specific network
 */
function validateTokenForNetwork(tokenAddress, network) {
  if (!tokenAddress || tokenAddress === '0x0000000000000000000000000000000000000000') {
    return { valid: true, isNative: true }; // Native token
  }

  const networkConfig = NETWORK_CONFIG[network];
  if (!networkConfig) {
    return { valid: false, error: `Unsupported network: ${network}` };
  }

  // Basic EVM address validation
  if (networkConfig.isEVM) {
    if (!/^0x[a-fA-F0-9]{40}$/.test(tokenAddress)) {
      return { valid: false, error: 'Invalid EVM token address format' };
    }
  }

  return { valid: true, isNative: false };
}

/**
 * Get appropriate token address for bridging
 */
function getTokenAddressForBridge(tokenAddress, sourceNetwork, targetNetwork) {
  // If native token, use wrapped version for bridging
  if (!tokenAddress || tokenAddress === '0x0000000000000000000000000000000000000000') {
    const sourceConfig = NETWORK_CONFIG[sourceNetwork];
    if (sourceConfig?.wrappedNative) {
      return sourceConfig.wrappedNative;
    }
  }

  // For cross-chain WETH bridging (common issue in tests)
  if (sourceNetwork === 'ethereum' && targetNetwork === 'polygon') {
    if (tokenAddress === NETWORK_CONFIG.ethereum.wrappedNative) {
      return NETWORK_CONFIG.polygon.wrappedETH; // Use WETH on Polygon
    }
  }

  return tokenAddress;
}

/**
 * Initialize and get supported chains from LI.FI
 */
export async function initializeLiFiChains() {
  try {
    const lifiService = await getLifiService();
    const supportedChains = await lifiService.getSupportedChains();
    console.log(`[CROSS-CHAIN] Initialized ${supportedChains.length} LI.FI supported chains`);
    return supportedChains;
  } catch (error) {
    console.error('[CROSS-CHAIN] Failed to initialize LI.FI chains:', error);
    // Return fallback configuration
    return Object.entries(NETWORK_CONFIG).map(([name, config]) => ({
      chainId: config.chainId,
      name,
      nativeCurrency: { symbol: config.nativeCurrency },
      bridgeSupported: true
    }));
  }
}

/**
 * Check if two networks are EVM compatible
 */
export function areNetworksEVMCompatible(sourceNetwork, targetNetwork) {
  const sourceConfig = NETWORK_CONFIG[sourceNetwork];
  const targetConfig = NETWORK_CONFIG[targetNetwork];
  
  if (!sourceConfig || !targetConfig) {
    return false;
  }
  
  return sourceConfig.isEVM && targetConfig.isEVM;
}

/**
 * Get optimal transaction route using LiFi with enhanced error handling
 * Now supports both same-chain and cross-chain transactions
 */
export async function getOptimalTransactionRoute({
  sourceNetwork,
  targetNetwork,
  amount,
  tokenAddress,
  fromAddress,
  toAddress,
  dealId,
  transactionType = 'auto'
}) {
  try {
    console.log(`[CROSS-CHAIN] Finding optimal transaction route for deal ${dealId}: ${sourceNetwork} -> ${targetNetwork}`);

    // Validate input parameters
    if (!fromAddress || !toAddress || !amount || !sourceNetwork || !targetNetwork || !dealId) {
      throw new Error('Missing required parameters for route finding');
    }

    // Validate token for source network
    const tokenValidation = validateTokenForNetwork(tokenAddress, sourceNetwork);
    if (!tokenValidation.valid) {
      throw new Error(`Token validation failed: ${tokenValidation.error}`);
    }

    // Get appropriate token addresses for bridging
    const fromTokenAddress = getTokenAddressForBridge(tokenAddress, sourceNetwork, targetNetwork);
    const toTokenAddress = getTokenAddressForBridge(tokenAddress, targetNetwork, sourceNetwork);

    console.log(`[CROSS-CHAIN] Using token addresses: from=${fromTokenAddress}, to=${toTokenAddress}`);

    const lifiService = await getLifiService();
    
    // LiFi now handles universal routing for all supported chains
    console.log(`[CROSS-CHAIN] Using LiFi universal routing for ${sourceNetwork} -> ${targetNetwork}`);
    
    // Let LiFi determine if the route is supported
    // No need for hardcoded address detection - LiFi handles this internally
    
    const route = await lifiService.findUniversalRoute({
      fromChainId: sourceNetwork,
      toChainId: targetNetwork,
      fromTokenAddress,
      toTokenAddress,
      fromAmount: amount,
      fromAddress,
      toAddress,
      dealId,
      transactionType
    });

    // Validate route response structure
    if (!route) {
      throw new Error('LI.FI service returned null route');
    }

    // Extract data safely with fallbacks
    const bridgesUsed = route.bridgesUsed || (route.route?.steps ? 
      route.route.steps.filter(s => s.type === 'cross').map(s => s.tool || s.toolDetails?.name || 'unknown') : 
      ['unknown']
    );

    const routeAnalysis = {
      bridge: route.bridge || (Array.isArray(bridgesUsed) ? bridgesUsed.join(', ') : 'unknown'),
      estimatedTime: `${Math.round((route.estimatedTime || 1800) / 60)} minutes`,
      fees: `$${(route.totalFees || 0).toFixed(2)}`,
      confidence: `${route.confidence || 70}%`,
      route: route.route || route,
      dealId,
      fromTokenAddress: route.fromTokenAddress || fromTokenAddress,
      toTokenAddress: route.toTokenAddress || toTokenAddress,
      validatedTokens: route.validatedTokens || true,
      bridgesUsed: Array.isArray(bridgesUsed) ? bridgesUsed : ['unknown']
    };

    console.log(`[CROSS-CHAIN] Found optimal route using bridges: ${routeAnalysis.bridgesUsed.join(', ')}`);
    console.log(`[CROSS-CHAIN] Estimated time: ${routeAnalysis.estimatedTime}, fees: ${routeAnalysis.fees}`);

    return routeAnalysis;
  } catch (error) {
    console.error(`[CROSS-CHAIN] Failed to get optimal route for deal ${dealId}:`, error);
    
    // Enhanced error handling for specific LI.FI API errors
    if (error.message?.includes('Token not supported')) {
      throw new Error(`Token ${tokenAddress} not supported for bridging between ${sourceNetwork} and ${targetNetwork}`);
    } else if (error.message?.includes('No routes found')) {
      throw new Error(`No bridge routes available between ${sourceNetwork} and ${targetNetwork} for this token`);
    } else if (error.message?.includes('insufficient liquidity')) {
      throw new Error(`Insufficient liquidity for bridge between ${sourceNetwork} and ${targetNetwork}`);
    } else if (error.message?.includes('Rate limited')) {
      throw new Error('Rate limited by LI.FI API - please try again later');
    }
    
    throw new Error(`Bridge route failed: ${error.message}`);
  }
}

/**
 * Get bridge information using LI.FI for cross-chain transaction
 */
export async function getTransactionInfo(sourceNetwork, targetNetwork, amount, tokenAddress, fromAddress, toAddress, dealId) {
  try {
    // NEW: Now handles both same-chain and cross-chain transactions
    const isSameChain = areNetworksEVMCompatible(sourceNetwork, targetNetwork) && sourceNetwork === targetNetwork;
    console.log(`[CROSS-CHAIN] Getting transaction info - same chain: ${isSameChain}`);
    
    const route = await getOptimalTransactionRoute({
      sourceNetwork,
      targetNetwork,
      amount,
      tokenAddress,
      fromAddress,
      toAddress,
      dealId,
      transactionType: isSameChain ? 'swap' : 'bridge'
    });

    return route;
  } catch (error) {
    console.error('[CROSS-CHAIN] Error getting transaction info:', error);
    return null;
  }
}

// Legacy bridge info function for backward compatibility
export async function getBridgeInfo(sourceNetwork, targetNetwork, amount, tokenAddress, fromAddress, toAddress, dealId) {
  try {
    if (areNetworksEVMCompatible(sourceNetwork, targetNetwork) && sourceNetwork === targetNetwork) {
      return null; // No bridge needed for same-chain transactions
    }
    
    const route = await getOptimalTransactionRoute({
      sourceNetwork,
      targetNetwork,
      amount,
      tokenAddress,
      fromAddress,
      toAddress,
      dealId,
      transactionType: 'bridge'
    });

    return route;
  } catch (error) {
    console.error('[CROSS-CHAIN] Error getting bridge info:', error);
    return null;
  }
}

/**
 * Estimate transaction fees using LI.FI with enhanced validation
 */
export async function estimateTransactionFees(sourceNetwork, targetNetwork, amount, tokenAddress, fromAddress) {
  try {
    const sourceConfig = NETWORK_CONFIG[sourceNetwork];
    const targetConfig = NETWORK_CONFIG[targetNetwork];
    
    if (!sourceConfig || !targetConfig) {
      throw new Error('Unsupported network');
    }

    // Validate token with graceful fallback for invalid tokens
    let tokenValidation = validateTokenForNetwork(tokenAddress, sourceNetwork);
    let effectiveTokenAddress = tokenAddress;
    
    if (!tokenValidation.valid) {
      console.warn(`[CROSS-CHAIN] Invalid token ${tokenAddress} for network ${sourceNetwork}, falling back to native token`);
      // Fall back to native token
      effectiveTokenAddress = '0x0000000000000000000000000000000000000000';
      tokenValidation = validateTokenForNetwork(effectiveTokenAddress, sourceNetwork);
    }

    if (areNetworksEVMCompatible(sourceNetwork, targetNetwork) && sourceNetwork === targetNetwork) {
      // Same network transaction
      return {
        sourceNetworkFee: '0.002',
        targetNetworkFee: '0',
        bridgeFee: '0',
        totalEstimatedFee: '0.002',
        estimatedTime: '1-5 minutes',
        confidence: '95%',
        fallbackMode: false,
        tokenValidated: true
      };
    }

    // Use LI.FI for cross-chain fee estimation with proper token addresses
    try {
      const fromTokenAddress = getTokenAddressForBridge(tokenAddress, sourceNetwork, targetNetwork);
      
      // LiFi handles universal fee estimation for all supported chains
      console.log(`[CROSS-CHAIN] Using LiFi universal fee estimation for ${sourceNetwork} -> ${targetNetwork}`);
      
      // No need for hardcoded network detection - LiFi handles this internally
      
      // Create a route estimation request using the same structure as findOptimalRoute
      const lifiService = await getLifiService();
      const routeEstimate = await lifiService.findOptimalRoute({
        fromChainId: sourceNetwork,
        toChainId: targetNetwork,
        fromTokenAddress,
        toTokenAddress: fromTokenAddress, // Same token on both chains for estimation
        fromAmount: amount,
        fromAddress: fromAddress || '0x0000000000000000000000000000000000000000',
        toAddress: fromAddress || '0x0000000000000000000000000000000000000000', // Same address for estimation
        dealId: 'fee-estimate'
      });

      if (routeEstimate) {
        return {
          sourceNetworkFee: '0.005', // Base gas estimate
          targetNetworkFee: '0.001', // Estimated target network claim fee
          bridgeFee: (routeEstimate.totalFees || 10).toFixed(2),
          totalEstimatedFee: ((routeEstimate.totalFees || 10) + 0.006).toFixed(6),
          estimatedTime: `${Math.round((routeEstimate.estimatedTime || 1800) / 60)} minutes`,
          confidence: `${routeEstimate.confidence || 80}%`,
          bridgesUsed: routeEstimate.bridgesUsed || ['unknown'],
          tokenValidated: true,
          fallbackMode: false
        };
      }
    } catch (lifiError) {
      console.error('[CROSS-CHAIN] LI.FI fee estimation failed:', lifiError);
      // Continue to fallback - don't throw here
    }
    
    // Provide realistic fallback fees based on network and token type
    let bridgeFee = '10.00';
    if (tokenValidation.isNative) {
      bridgeFee = '8.00'; // Native tokens often have lower fees
    } else if (tokenAddress && (
      tokenAddress === NETWORK_CONFIG[sourceNetwork]?.wrappedNative ||
      NETWORK_CONFIG[sourceNetwork]?.stableTokens?.includes(tokenAddress)
    )) {
      bridgeFee = '5.00'; // Common tokens have better rates
    }
    
    return {
      sourceNetworkFee: '0.005',
      targetNetworkFee: '0.002',
      bridgeFee,
      totalEstimatedFee: (parseFloat(bridgeFee) + 0.007).toFixed(6),
      estimatedTime: '15-45 minutes',
      confidence: '80%',
      error: 'Using estimated fees - LI.FI unavailable',
      fallbackMode: true,
      tokenValidated: true
    };
  } catch (error) {
    console.error('[CROSS-CHAIN] Error estimating fees:', error);
    
    // Always return a valid structure, even on error
    return {
      sourceNetworkFee: '0.005',
      targetNetworkFee: '0.002',
      bridgeFee: '15.00',
      totalEstimatedFee: '15.007',
      estimatedTime: '15-45 minutes',
      confidence: '70%',
      error: `Fee estimation failed: ${error.message}`,
      fallbackMode: true,
      tokenValidated: false
    };
  }
}

/**
 * Prepare cross-chain transaction with LI.FI integration and enhanced validation
 */
export async function prepareCrossChainTransaction(params) {
  try {
    const {
      fromAddress,
      toAddress,
      amount,
      sourceNetwork,
      targetNetwork,
      dealId,
      userId,
      tokenAddress
    } = params;

    console.log(`[CROSS-CHAIN] Preparing transaction for deal ${dealId}: ${fromAddress} -> ${toAddress}`);

    // Validate required parameters
    if (!fromAddress || !toAddress || !amount || !sourceNetwork || !targetNetwork || !dealId) {
      throw new Error('Missing required parameters for cross-chain transaction');
    }

    // Basic address validation - LiFi will handle network-specific validation
    if (!fromAddress || typeof fromAddress !== 'string' || fromAddress.length < 10) {
      throw new Error('Invalid fromAddress format');
    }
    if (!toAddress || typeof toAddress !== 'string' || toAddress.length < 10) {
      throw new Error('Invalid toAddress format');
    }
    
    console.log(`[CROSS-CHAIN] Using LiFi universal address validation for ${fromAddress} -> ${toAddress}`);

    // Validate networks
    if (!NETWORK_CONFIG[sourceNetwork] || !NETWORK_CONFIG[targetNetwork]) {
      throw new Error('Unsupported network');
    }

    // Validate token with graceful fallback for invalid tokens
    let tokenValidation = validateTokenForNetwork(tokenAddress, sourceNetwork);
    let effectiveTokenAddress = tokenAddress;
    
    if (!tokenValidation.valid) {
      console.warn(`[CROSS-CHAIN] Invalid token ${tokenAddress} for network ${sourceNetwork}, falling back to native token`);
      // Fall back to native token
      effectiveTokenAddress = '0x0000000000000000000000000000000000000000';
      tokenValidation = validateTokenForNetwork(effectiveTokenAddress, sourceNetwork);
    }

    // Check if bridge is needed
    const needsBridge = sourceNetwork !== targetNetwork;
    let bridgeInfo = null;
    let lifiRoute = null;
    let bridgeAvailable = true;

    if (needsBridge) {
      try {
        const route = await getOptimalTransactionRoute({
          sourceNetwork,
          targetNetwork,
          amount,
          tokenAddress: effectiveTokenAddress,
          fromAddress,
          toAddress,
          dealId
        });
        bridgeInfo = route;
        lifiRoute = route.route;
        console.log(`[CROSS-CHAIN] Bridge route found using ${route.bridge} for deal ${dealId}`);
      } catch (error) {
        console.warn(`[CROSS-CHAIN] Bridge route not available for deal ${dealId}:`, error.message);
        // Don't throw here - let the transaction be created as failed with details
        bridgeInfo = {
          error: error.message,
          available: false,
          fallbackReason: 'No viable bridge route found'
        };
        bridgeAvailable = false;
      }
    }

    // Estimate fees using LI.FI - this now always returns a valid object
    const feeEstimate = await estimateTransactionFees(
      sourceNetwork, 
      targetNetwork, 
      amount, 
      effectiveTokenAddress, 
      fromAddress
    );

    // Determine transaction status
    let transactionStatus = 'prepared';
    if (needsBridge && (!bridgeInfo || bridgeInfo.error)) {
      transactionStatus = 'failed';
    }

    // Create steps based on transaction type and bridge availability
    let steps = [];
    
    if (!needsBridge) {
      // Same network transaction
      steps = [
        { 
          step: 1, 
          action: 'direct_transfer', 
          status: 'pending',
          description: `Transfer ${amount} on ${sourceNetwork}`,
          conditionMapping: 'funds_locked'
        }
      ];
    } else if (bridgeAvailable && lifiRoute && !bridgeInfo.error) {
      // Cross-chain transaction with working bridge
      steps = [
        { 
          step: 1, 
          action: 'initiate_bridge', 
          status: 'pending',
          description: `Initiate bridge transfer via ${bridgeInfo.bridge}`,
          lifiStep: true,
          conditionMapping: 'cross_chain_funds_locked'
        },
        { 
          step: 2, 
          action: 'monitor_bridge', 
          status: 'pending',
          description: `Monitor bridge execution`,
          lifiStep: true,
          conditionMapping: 'cross_chain_bridge_transfer'
        },
        { 
          step: 3, 
          action: 'confirm_receipt', 
          status: 'pending',
          description: `Confirm funds received on ${targetNetwork}`,
          lifiStep: true,
          conditionMapping: 'cross_chain_bridge_setup'
        }
      ];
    } else {
      // Bridge failed or not available
      steps = [
        { 
          step: 1, 
          action: 'bridge_failed', 
          status: 'failed',
          description: `Bridge failed: ${bridgeInfo?.error || 'Bridge not available'}`,
          conditionMapping: 'funds_locked',
          error: bridgeInfo?.error || 'Bridge not available'
        }
      ];
    }

    // Prepare enhanced transaction object with better error handling
    const transaction = {
      id: `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      dealId,
      userId,
      fromAddress,
      toAddress,
      amount,
      tokenAddress: effectiveTokenAddress, // Use effective token address for processing
      originalTokenAddress: tokenAddress, // Store original for reference
      sourceNetwork,
      targetNetwork,
      needsBridge,
      bridgeInfo,
      lifiRoute,
      feeEstimate,
      status: transactionStatus,
      createdAt: new Date(),
      metadata: {
        tokenValidated: tokenValidation.valid,
        isNativeToken: tokenValidation.isNative,
        bridgeAvailable,
        estimationMethod: (feeEstimate && feeEstimate.fallbackMode) ? 'fallback' : 'lifi',
        tokenFallbackUsed: effectiveTokenAddress !== tokenAddress
      },
      steps
    };

    // Store in database
    const db = await getDb();
    await db.collection('crossChainTransactions').doc(transaction.id).set(transaction);

    // Link to deal
    await linkTransactionToDeal(transaction.id, dealId, userId);

    console.log(`[CROSS-CHAIN] Prepared transaction ${transaction.id} for deal ${dealId} (status: ${transaction.status})`);
    return transaction;
  } catch (error) {
    console.error('[CROSS-CHAIN] Error preparing transaction:', error);
    throw error;
  }
}

/**
 * Execute cross-chain transaction step with enhanced LI.FI integration and error handling
 */
export async function executeCrossChainStep(transactionId, stepNumber, txHash = null, walletProvider = null) {
  try {
    console.log(`[CROSS-CHAIN] Executing step ${stepNumber} for transaction ${transactionId}`);

    const db = await getDb();
    const txDoc = await db.collection('crossChainTransactions').doc(transactionId).get();
    
    if (!txDoc.exists) {
      throw new Error('Transaction not found');
    }

    const transaction = txDoc.data();
    
    // Ensure steps array exists
    if (!transaction.steps || !Array.isArray(transaction.steps)) {
      console.error(`[CROSS-CHAIN] Transaction ${transactionId} has invalid or missing steps array`);
      return {
        success: true,
        step: stepNumber,
        status: 'failed',
        transactionStatus: 'failed',
        error: 'Transaction steps not properly initialized',
        allStepsCompleted: false
      };
    }
    
    const step = transaction.steps.find(s => s.step === stepNumber);
    
    if (!step) {
      console.error(`[CROSS-CHAIN] Step ${stepNumber} not found for transaction ${transactionId}`);
      return {
        success: true,
        step: stepNumber,
        status: 'failed',
        transactionStatus: 'failed',
        error: 'Step not found',
        allStepsCompleted: false
      };
    }

    // Handle failed steps gracefully
    if (step.status === 'failed') {
      console.warn(`[CROSS-CHAIN] Attempting to execute already failed step ${stepNumber} for transaction ${transactionId}`);
      return {
        success: true, // Success in handling the failure
        step: stepNumber,
        status: 'failed',
        transactionStatus: 'failed',
        message: step.error || 'Step previously failed',
        allStepsCompleted: false
      };
    }

    // Handle LI.FI steps with enhanced error handling
    if (step.lifiStep && step.action === 'initiate_bridge') {
      console.log(`[CROSS-CHAIN] Initiating LI.FI bridge for transaction ${transactionId}`);
      
      try {
        // Validate bridge info exists
        if (!transaction.bridgeInfo || transaction.bridgeInfo.error) {
          throw new Error(`Bridge info not available: ${transaction.bridgeInfo?.error || 'Unknown error'}`);
        }

        const lifiService = await getLifiService();
        const bridgeResult = await lifiService.executeBridgeTransfer({
          route: transaction.bridgeInfo,
          dealId: transaction.dealId,
          onStatusUpdate: (dealId, updatedRoute) => {
            console.log(`[CROSS-CHAIN] Bridge status update for deal ${dealId}:`, updatedRoute.status);
            updateTransactionStatus(transactionId, updatedRoute);
          },
          onError: (dealId, error) => {
            console.error(`[CROSS-CHAIN] Bridge error for deal ${dealId}:`, error);
          }
        });

        step.status = 'completed';
        step.txHash = bridgeResult.transactionHash;
        step.executionId = bridgeResult.executionId;
        step.completedAt = new Date();

        // Auto-advance to monitoring step
        const monitorStep = transaction.steps.find(s => s.step === 2);
        if (monitorStep) {
          monitorStep.status = 'in_progress';
          monitorStep.executionId = bridgeResult.executionId;
        }

      } catch (lifiError) {
        console.error(`[CROSS-CHAIN] LI.FI bridge execution failed:`, lifiError);
        step.status = 'failed';
        step.error = lifiError.message;
        step.failedAt = new Date();
      }
    } 
    else if (step.lifiStep && step.action === 'monitor_bridge') {
      console.log(`[CROSS-CHAIN] Monitoring LI.FI bridge for transaction ${transactionId}`);
      
      try {
        if (!step.executionId) {
          throw new Error('No execution ID available for monitoring');
        }

        const lifiService = await getLifiService();
        const status = await lifiService.getTransactionStatus(step.executionId, transaction.dealId);
        
        step.bridgeStatus = status.status;
        step.lastChecked = new Date();

        if (status.status === 'DONE') {
          step.status = 'completed';
          step.completedAt = new Date();
          
          // Auto-advance to confirmation step
          const confirmStep = transaction.steps.find(s => s.step === 3);
          if (confirmStep) {
            confirmStep.status = 'completed';
            confirmStep.completedAt = new Date();
          }
        } else if (status.status === 'FAILED') {
          step.status = 'failed';
          step.error = status.substatusMessage || 'Bridge transaction failed';
          step.failedAt = new Date();
        }
      } catch (statusError) {
        console.error(`[CROSS-CHAIN] Status check failed:`, statusError);
        step.error = statusError.message;
        step.lastChecked = new Date();
        // Don't mark as failed immediately - might be temporary network issue
      }
    }
    else {
      // Handle non-LI.FI steps (direct transfers, etc.)
      step.status = 'completed';
      step.txHash = txHash;
      step.completedAt = new Date();
    }

    // Update transaction in database with safe metadata access
    transaction.steps = transaction.steps.map(s => s.step === stepNumber ? step : s);
    transaction.lastUpdated = new Date();
    
    // Safely update metadata
    if (!transaction.metadata) {
      transaction.metadata = {};
    }
    transaction.metadata.lastStepExecuted = stepNumber;
    transaction.metadata.lastStepStatus = step.status;
    
    // Check if all steps completed
    const allStepsCompleted = transaction.steps.every(s => s.status === 'completed');
    const anyStepFailed = transaction.steps.some(s => s.status === 'failed');
    
    if (allStepsCompleted) {
      transaction.status = 'completed';
      transaction.completedAt = new Date();
    } else if (anyStepFailed) {
      transaction.status = 'failed';
      transaction.failedAt = new Date();
    } else {
      transaction.status = 'in_progress';
    }

    await db.collection('crossChainTransactions').doc(transactionId).update(transaction);

    // Update deal conditions
    await updateDealConditionsFromStep(transaction.dealId, step, allStepsCompleted);

    console.log(`[CROSS-CHAIN] Step ${stepNumber} ${step.status} for transaction ${transactionId}`);
    
    return {
      success: true,
      step: stepNumber,
      status: step.status,
      transactionStatus: transaction.status,
      nextStep: getNextAction(transaction.steps, transaction.status),
      allStepsCompleted,
      error: step.error
    };

  } catch (error) {
    console.error(`[CROSS-CHAIN] Error executing step ${stepNumber}:`, error);
    
    // Return success: true but with error details for graceful handling
    return {
      success: true,
      step: stepNumber,
      status: 'failed',
      transactionStatus: 'failed',
      error: error.message,
      allStepsCompleted: false
    };
  }
}

// Helper function to update transaction status during bridge execution
async function updateTransactionStatus(transactionId, routeUpdate) {
  try {
    const db = await getDb();
    await db.collection('crossChainTransactions').doc(transactionId).update({
      bridgeStatus: routeUpdate.status,
      bridgeSubstatus: routeUpdate.substatus,
      lastBridgeUpdate: new Date(),
      lastUpdated: new Date()
    });
  } catch (error) {
    console.error('[CROSS-CHAIN] Failed to update transaction status:', error);
  }
}

/**
 * Get real-time bridge status for a transaction
 */
export async function getBridgeStatus(transactionId) {
  try {
    const db = await getDb();
    const txDoc = await db.collection('crossChainTransactions').doc(transactionId).get();
    
    if (!txDoc.exists) {
      throw new Error('Transaction not found');
    }

    const transaction = txDoc.data();
    const bridgeStep = transaction.steps.find(s => s.action === 'monitor_bridge');
    
    if (!bridgeStep?.executionId) {
      return { status: 'NOT_STARTED', message: 'Bridge not yet initiated' };
    }

    const lifiService = await getLifiService();
    const status = await lifiService.getTransactionStatus(bridgeStep.executionId, transaction.dealId);
    return status;
  } catch (error) {
    console.error('[CROSS-CHAIN] Error getting bridge status:', error);
    throw error;
  }
}

/**
 * Update deal conditions based on cross-chain step completion
 */
async function updateDealConditionsFromStep(dealId, completedStep, allStepsCompleted) {
  try {
    const db = await getDb();
    const dealRef = db.collection('deals').doc(dealId);
    const dealDoc = await dealRef.get();

    if (!dealDoc.exists) {
      console.warn(`[CROSS-CHAIN] Deal ${dealId} not found for condition update`);
      return;
    }

    const dealData = dealDoc.data();
    const conditions = [...dealData.conditions];
    let updated = false;

    // Update specific condition based on step mapping
    if (completedStep.conditionMapping) {
      const conditionIndex = conditions.findIndex(c => c.id === completedStep.conditionMapping);
      if (conditionIndex !== -1 && conditions[conditionIndex].status === 'PENDING_BUYER_ACTION') {
        conditions[conditionIndex] = {
          ...conditions[conditionIndex],
          status: 'FULFILLED_BY_BUYER',
          updatedAt: FieldValue.serverTimestamp(),
          autoFulfilledBy: 'cross_chain_system',
          crossChainTxHash: completedStep.txHash,
          fulfillmentNote: `Auto-fulfilled by cross-chain step: ${completedStep.description}`
        };
        updated = true;
      }
    }

    // If all steps completed, update network validation condition
    if (allStepsCompleted) {
      const networkValidationIndex = conditions.findIndex(c => c.id === 'cross_chain_network_validation');
      if (networkValidationIndex !== -1 && conditions[networkValidationIndex].status === 'PENDING_BUYER_ACTION') {
        conditions[networkValidationIndex] = {
          ...conditions[networkValidationIndex],
          status: 'FULFILLED_BY_BUYER',
          updatedAt: FieldValue.serverTimestamp(),
          autoFulfilledBy: 'cross_chain_system',
          fulfillmentNote: 'Auto-fulfilled: Cross-chain transaction completed successfully'
        };
        updated = true;
      }
    }

    if (updated) {
      await dealRef.update({
        conditions,
        timeline: FieldValue.arrayUnion({
          event: `Cross-chain condition auto-updated: ${completedStep.description}`,
          timestamp: FieldValue.serverTimestamp(),
          system: true,
          crossChainStep: completedStep.step
        }),
        updatedAt: FieldValue.serverTimestamp()
      });

      console.log(`[CROSS-CHAIN] Updated deal ${dealId} conditions from step completion`);
    }
  } catch (error) {
    console.error('[CROSS-CHAIN] Error updating deal conditions:', error);
  }
}

/**
 * Get cross-chain transaction status with deal integration info
 */
export async function getCrossChainTransactionStatus(transactionId) {
  try {
    const db = await getDb();
    const transactionDoc = await db.collection('crossChainTransactions').doc(transactionId).get();

    if (!transactionDoc.exists) {
      throw new Error('Transaction not found');
    }

    const transaction = transactionDoc.data();

    // If deal is linked, get deal status
    let dealStatus = null;
    if (transaction.dealId) {
      const dealDoc = await db.collection('deals').doc(transaction.dealId).get();
      if (dealDoc.exists) {
        const dealData = dealDoc.data();
        dealStatus = {
          dealId: transaction.dealId,
          dealStatus: dealData.status,
          crossChainConditions: dealData.conditions.filter(c => c.type === 'CROSS_CHAIN'),
          allConditionsFulfilled: dealData.conditions.every(c => c.status === 'FULFILLED_BY_BUYER')
        };
      }
    }

    return {
      ...transaction,
      dealStatus,
      progressPercentage: calculateProgressPercentage(transaction.steps),
      nextAction: getNextAction(transaction.steps, transaction.status)
    };
  } catch (error) {
    console.error('[CROSS-CHAIN] Error getting transaction status:', error);
    throw error;
  }
}

/**
 * Calculate progress percentage based on completed steps
 */
function calculateProgressPercentage(steps) {
  if (!steps || steps.length === 0) return 0;
  const completedSteps = steps.filter(s => s.status === 'completed').length;
  return Math.round((completedSteps / steps.length) * 100);
}

/**
 * Get next action for the user
 */
function getNextAction(steps, status) {
  if (status === 'completed') return 'Transaction completed';
  if (status === 'failed') return 'Transaction failed - manual intervention required';
  
  const nextStep = steps.find(s => s.status === 'pending');
  return nextStep ? `Next: ${nextStep.description}` : 'All steps in progress';
}

/**
 * Link existing cross-chain transaction to a deal
 */
export async function linkTransactionToDeal(transactionId, dealId, userId) {
  try {
    const db = await getDb();
    
    // Get current transaction data
    const txDoc = await db.collection('crossChainTransactions').doc(transactionId).get();
    if (!txDoc.exists) {
      throw new Error('Transaction not found');
    }
    
    const transaction = txDoc.data();
    
    await db.collection('crossChainTransactions').doc(transactionId).update({
      dealId,
      linkedAt: FieldValue.serverTimestamp(),
      linkedBy: userId,
      metadata: {
        ...(transaction.metadata || {}),
        linkedToDeal: true,
        linkMethod: 'manual'
      }
    });

    console.log(`[CROSS-CHAIN] Linked transaction ${transactionId} to deal ${dealId}`);
    return { success: true };
  } catch (error) {
    console.error('[CROSS-CHAIN] Error linking transaction to deal:', error);
    throw error;
  }
}

/**
 * Get all cross-chain transactions for a specific deal
 */
export async function getCrossChainTransactionsForDeal(dealId) {
  try {
    const db = await getDb();
    const querySnapshot = await db.collection('crossChainTransactions')
      .where('dealId', '==', dealId)
      .orderBy('createdAt', 'desc')
      .get();

    const transactions = [];
    querySnapshot.forEach(doc => {
      transactions.push({
        id: doc.id,
        ...doc.data()
      });
    });

    return transactions;
  } catch (error) {
    console.error('[CROSS-CHAIN] Error getting transactions for deal:', error);
    throw error;
  }
}

/**
 * Check and update status of pending cross-chain transactions - for scheduled jobs
 */
export async function checkPendingTransactionStatus(transactionId) {
  try {
    console.log(`[CROSS-CHAIN-SCHEDULER] Checking status for transaction ${transactionId}`);
    
    const db = await getDb();
    const txDoc = await db.collection('crossChainTransactions').doc(transactionId).get();
    
    if (!txDoc.exists) {
      console.warn(`[CROSS-CHAIN-SCHEDULER] Transaction ${transactionId} not found`);
      return { success: false, error: 'Transaction not found' };
    }

    const transaction = txDoc.data();
    
    // Skip if already completed or failed
    if (transaction.status === 'completed' || transaction.status === 'failed') {
      return { success: true, message: `Transaction already ${transaction.status}` };
    }

    // Check if there are any monitoring steps
    const monitoringStep = transaction.steps?.find(s => s.action === 'monitor_bridge' && s.status === 'in_progress');
    
    if (monitoringStep?.executionId) {
      try {
        const lifiService = await getLifiService();
        const status = await lifiService.getTransactionStatus(monitoringStep.executionId, transaction.dealId);
        
        let statusUpdate = {
          bridgeStatus: status.status,
          lastStatusCheck: new Date(),
          lastUpdated: new Date()
        };

        if (status.status === 'DONE') {
          statusUpdate.status = 'completed';
          statusUpdate.completedAt = new Date();
          
          // Mark all remaining steps as completed
          const updatedSteps = transaction.steps.map(step => {
            if (step.status === 'pending' || step.status === 'in_progress') {
              return { ...step, status: 'completed', completedAt: new Date() };
            }
            return step;
          });
          statusUpdate.steps = updatedSteps;
          
        } else if (status.status === 'FAILED') {
          statusUpdate.status = 'failed';
          statusUpdate.failedAt = new Date();
          statusUpdate.error = status.substatusMessage || 'Bridge transaction failed';
        }

        await db.collection('crossChainTransactions').doc(transactionId).update(statusUpdate);
        
        console.log(`[CROSS-CHAIN-SCHEDULER] Updated transaction ${transactionId} status to ${status.status}`);
        return { success: true, status: status.status, updated: true };
        
      } catch (statusError) {
        console.error(`[CROSS-CHAIN-SCHEDULER] Failed to check bridge status for ${transactionId}:`, statusError);
        return { success: false, error: statusError.message };
      }
    }

    return { success: true, message: 'No monitoring step found or status check not needed' };
    
  } catch (error) {
    console.error(`[CROSS-CHAIN-SCHEDULER] Error checking transaction status ${transactionId}:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Trigger cross-chain release after final approval deadline - for scheduled jobs
 */
export async function triggerCrossChainReleaseAfterApproval(dealId) {
  try {
    console.log(`[CROSS-CHAIN-SCHEDULER] Processing cross-chain auto-release for deal ${dealId}`);
    
    const db = await getDb();
    const dealDoc = await db.collection('deals').doc(dealId).get();
    
    if (!dealDoc.exists) {
      throw new Error(`Deal ${dealId} not found`);
    }

    const dealData = dealDoc.data();
    
    // Get active cross-chain transactions for this deal
    const transactions = await getCrossChainTransactionsForDeal(dealId);
    const activeTransaction = transactions.find(tx => 
      tx.status === 'completed' && tx.needsBridge
    );

    if (!activeTransaction) {
      console.warn(`[CROSS-CHAIN-SCHEDULER] No completed cross-chain transaction found for deal ${dealId}`);
      return { 
        success: false, 
        error: 'No completed cross-chain transaction found',
        requiresManualIntervention: true
      };
    }

    // Check if all cross-chain conditions are fulfilled
    const crossChainConditions = dealData.conditions?.filter(c => 
      c.type === 'CROSS_CHAIN' || c.id.includes('cross_chain')
    ) || [];

    const allCrossChainConditionsFulfilled = crossChainConditions.every(c => 
      c.status === 'FULFILLED_BY_BUYER'
    );

    if (!allCrossChainConditionsFulfilled) {
      console.warn(`[CROSS-CHAIN-SCHEDULER] Cross-chain conditions not all fulfilled for deal ${dealId}`);
      return { 
        success: false, 
        error: 'Cross-chain conditions not fulfilled',
        requiresManualIntervention: true
      };
    }

    // Update deal status to indicate funds are released cross-chain
    const updateData = {
      status: 'CrossChainFundsReleased',
      crossChainAutoReleaseAt: FieldValue.serverTimestamp(),
      crossChainLastActivity: FieldValue.serverTimestamp(),
      timeline: FieldValue.arrayUnion({
        event: `Cross-chain funds auto-released after final approval deadline`,
        timestamp: FieldValue.serverTimestamp(),
        systemTriggered: true,
        crossChainEvent: true,
        transactionId: activeTransaction.id
      }),
      updatedAt: FieldValue.serverTimestamp()
    };

    await db.collection('deals').doc(dealId).update(updateData);
    
    console.log(`[CROSS-CHAIN-SCHEDULER] Successfully processed cross-chain auto-release for deal ${dealId}`);
    return { 
      success: true, 
      transactionId: activeTransaction.id,
      message: 'Cross-chain auto-release processed successfully'
    };
    
  } catch (error) {
    console.error(`[CROSS-CHAIN-SCHEDULER] Error processing cross-chain auto-release for deal ${dealId}:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Handle stuck cross-chain transactions - for scheduled jobs
 */
export async function handleStuckCrossChainTransaction(transactionId) {
  try {
    console.log(`[CROSS-CHAIN-SCHEDULER] Handling stuck transaction ${transactionId}`);
    
    const db = await getDb();
    const txDoc = await db.collection('crossChainTransactions').doc(transactionId).get();
    
    if (!txDoc.exists) {
      return { success: false, error: 'Transaction not found' };
    }

    const transaction = txDoc.data();
    
    // Check if transaction is actually stuck (no updates for 24+ hours)
    const lastUpdateTime = transaction.lastUpdated?.toDate?.() || transaction.createdAt?.toDate?.() || new Date();
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    if (lastUpdateTime > twentyFourHoursAgo) {
      return { success: true, message: 'Transaction not actually stuck - recent activity found' };
    }

    // Try to get latest status from bridge if monitoring step exists
    const monitoringStep = transaction.steps?.find(s => s.action === 'monitor_bridge');
    
    if (monitoringStep?.executionId) {
      try {
        const lifiService = await getLifiService();
        const latestStatus = await lifiService.getTransactionStatus(monitoringStep.executionId, transaction.dealId);
        
        if (latestStatus.status === 'DONE' || latestStatus.status === 'FAILED') {
          // Transaction was actually completed or failed - update it
          await checkPendingTransactionStatus(transactionId);
          return { 
            success: true, 
            message: `Transaction was ${latestStatus.status} - status updated`,
            actualStatus: latestStatus.status
          };
        }
      } catch (statusError) {
        console.warn(`[CROSS-CHAIN-SCHEDULER] Could not get status for stuck transaction ${transactionId}:`, statusError.message);
      }
    }

    // Mark transaction as stuck and requiring manual intervention
    const updateData = {
      status: 'stuck',
      stuckAt: FieldValue.serverTimestamp(),
      lastUpdated: FieldValue.serverTimestamp(),
      metadata: {
        ...(transaction.metadata || {}),
        markedAsStuck: true,
        stuckReason: 'No activity for 24+ hours',
        requiresManualIntervention: true
      }
    };

    await db.collection('crossChainTransactions').doc(transactionId).update(updateData);

    // Update associated deal if exists
    if (transaction.dealId) {
      const dealRef = db.collection('deals').doc(transaction.dealId);
      await dealRef.update({
        status: 'CrossChainStuck',
        crossChainLastActivity: FieldValue.serverTimestamp(),
        timeline: FieldValue.arrayUnion({
          event: `Cross-chain transaction marked as stuck - manual intervention required`,
          timestamp: Timestamp.now(),
          systemTriggered: true,
          crossChainEvent: true,
          transactionId,
          requiresAction: true
        }),
        updatedAt: FieldValue.serverTimestamp()
      });
    }

    console.log(`[CROSS-CHAIN-SCHEDULER] Marked transaction ${transactionId} as stuck`);
    return { 
      success: true, 
      message: 'Transaction marked as stuck - manual intervention required',
      requiresManualIntervention: true
    };
    
  } catch (error) {
    console.error(`[CROSS-CHAIN-SCHEDULER] Error handling stuck transaction ${transactionId}:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Retry failed cross-chain transaction step - for scheduled jobs
 */
export async function retryCrossChainTransactionStep(transactionId, stepNumber) {
  try {
    console.log(`[CROSS-CHAIN-SCHEDULER] Retrying step ${stepNumber} for transaction ${transactionId}`);
    
    // Use the existing executeCrossChainStep function with retry logic
    const result = await executeCrossChainStep(transactionId, stepNumber);
    
    if (result.success && result.status !== 'failed') {
      console.log(`[CROSS-CHAIN-SCHEDULER] Successfully retried step ${stepNumber} for transaction ${transactionId}`);
      return { success: true, result };
    } else {
      console.warn(`[CROSS-CHAIN-SCHEDULER] Retry failed for step ${stepNumber} of transaction ${transactionId}:`, result.error);
      return { success: false, error: result.error || 'Retry failed' };
    }
  } catch (error) {
    console.error(`[CROSS-CHAIN-SCHEDULER] Error retrying step ${stepNumber} for transaction ${transactionId}:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Simplified cross-chain release function - works like blockchainService.triggerReleaseAfterApproval
 */
export async function triggerCrossChainReleaseAfterApprovalSimple(contractAddress, dealId) {
  try {
    console.log(`[CROSS-CHAIN-SIMPLE] Triggering cross-chain release for contract ${contractAddress}, deal ${dealId}`);
    
    // Get deal info from database
    const db = await getDb();
    const dealDoc = await db.collection('deals').doc(dealId).get();
    
    if (!dealDoc.exists) {
      throw new Error(`Deal ${dealId} not found`);
    }

    const dealData = dealDoc.data();
    
    // Check if this is actually a cross-chain deal
    if (!dealData.isCrossChain) {
      console.warn(`[CROSS-CHAIN-SIMPLE] Deal ${dealId} is not cross-chain, skipping`);
      return { success: false, error: 'Not a cross-chain deal' };
    }

    // ✅ FIXED: Require actual smart contract for fund release
    if (!contractAddress) {
      return { 
        success: false, 
        error: 'Contract address required for cross-chain fund release' 
      };
    }

    // ✅ FIXED: Only allow mock deployment bypass for test environments
    if (dealData.isMockDeployment && process.env.NODE_ENV !== 'test') {
      return { 
        success: false, 
        error: 'Mock deployments not allowed in production for fund release' 
      };
    }

    // For real smart contracts, use the bridge service
    if (!dealData.isMockDeployment) {
      // Import smart contract bridge service
      const SmartContractBridgeService = (await import('./smartContractBridgeService.js')).default;
      const bridgeService = new SmartContractBridgeService();
      
      const releaseResult = await bridgeService.initiateCrossChainRelease({
        contractAddress,
        targetChain: dealData.sellerNetwork,
        targetAddress: dealData.sellerWalletAddress,
        dealId
      });

      return {
        success: true,
        receipt: {
          transactionHash: releaseResult.contractTransactionHash,
          blockNumber: releaseResult.blockNumber
        },
        bridgeTransactionId: releaseResult.bridgeTransactionId,
        message: 'Cross-chain release initiated via smart contract'
      };
    } else {
      // ✅ FIXED: Only for test environment - mock deployment handling
      const db = await getDb();
      await db.collection('deals').doc(dealId).update({
        status: 'CrossChainFundsReleased',
        fundsReleasedToSeller: true,
        timeline: FieldValue.arrayUnion({
          event: `Cross-chain funds released (TEST MODE - mock contract)`,
          timestamp: FieldValue.serverTimestamp(),
          system: true,
          crossChainDirectRelease: true,
          testMode: true
        }),
        updatedAt: FieldValue.serverTimestamp()
      });

      return {
        success: true,
        receipt: {
          transactionHash: `test-cross-chain-release-${dealId}-${Date.now()}`,
          blockNumber: null
        },
        message: 'Cross-chain release completed (TEST MODE)',
        testMode: true
      };
    }

  } catch (error) {
    console.error(`[CROSS-CHAIN-SIMPLE] Error in triggerCrossChainReleaseAfterApproval:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Simplified cross-chain cancellation function - works like blockchainService.triggerCancelAfterDisputeDeadline
 */
export async function triggerCrossChainCancelAfterDisputeDeadline(contractAddress, dealId) {
  try {
    console.log(`[CROSS-CHAIN-SIMPLE] Triggering cross-chain cancellation for contract ${contractAddress}, deal ${dealId}`);
    
    // Get deal info from database
    const db = await getDb();
    const dealDoc = await db.collection('deals').doc(dealId).get();
    
    if (!dealDoc.exists) {
      throw new Error(`Deal ${dealId} not found`);
    }

    const dealData = dealDoc.data();
    
    // Check if this is actually a cross-chain deal
    if (!dealData.isCrossChain) {
      console.warn(`[CROSS-CHAIN-SIMPLE] Deal ${dealId} is not cross-chain, skipping`);
      return { success: false, error: 'Not a cross-chain deal' };
    }

    // ✅ FIXED: Require actual smart contract for cancellation
    if (!contractAddress) {
      return { 
        success: false, 
        error: 'Contract address required for cross-chain cancellation' 
      };
    }

    // ✅ FIXED: Only allow mock deployment bypass for test environments
    if (dealData.isMockDeployment && process.env.NODE_ENV !== 'test') {
      return { 
        success: false, 
        error: 'Mock deployments not allowed in production for cancellation' 
      };
    }

    // For cross-chain deals, cancellation means refunding to buyer on their original network
    // This is more complex than regular EVM cancellation
    
    if (!dealData.isMockDeployment) {
      // ✅ FIXED: Use proper service pattern like blockchainService
      try {
        // Import the contract deployer to get proper ABI
        const { CrossChainContractDeployer } = await import('./crossChainContractDeployer.js');
        const deployer = new CrossChainContractDeployer();
        
        if (!deployer.contractABI) {
          throw new Error('Contract ABI not available - deployment artifacts not found');
        }

        // Create provider and contract instance using service pattern
        const { ethers } = await import('ethers');
        
        if (!process.env.RPC_URL || !process.env.BACKEND_WALLET_PRIVATE_KEY) {
          throw new Error('Missing RPC_URL or BACKEND_WALLET_PRIVATE_KEY configuration');
        }

        const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
        const wallet = new ethers.Wallet(process.env.BACKEND_WALLET_PRIVATE_KEY, provider);
        
        // Validate contract address format
        if (!ethers.isAddress(contractAddress)) {
          throw new Error(`Invalid contract address format: ${contractAddress}`);
        }
        
        const contract = new ethers.Contract(contractAddress, deployer.contractABI, wallet);
        
        // Call the cancel function
        console.log(`[CROSS-CHAIN-SIMPLE] Calling cancelEscrowAndRefundBuyer on contract ${contractAddress}...`);
        const tx = await contract.cancelEscrowAndRefundBuyer();
        const receipt = await tx.wait();
        
        if (receipt.status !== 1) {
          throw new Error('Transaction failed - receipt status is not success');
        }
        
        // Update deal status
        await db.collection('deals').doc(dealId).update({
          status: 'CrossChainCancelledAfterDisputeDeadline',
          autoCancelTxHash: tx.hash,
          timeline: FieldValue.arrayUnion({
            event: `Cross-chain escrow cancelled via smart contract. Tx: ${tx.hash}`,
            timestamp: FieldValue.serverTimestamp(),
            system: true,
            contractCancellation: true
          }),
          updatedAt: FieldValue.serverTimestamp()
        });

        return {
          success: true,
          receipt: {
            transactionHash: tx.hash,
            blockNumber: receipt.blockNumber
          },
          message: 'Cross-chain cancellation completed via smart contract'
        };
        
      } catch (contractError) {
        console.error(`[CROSS-CHAIN-SIMPLE] Smart contract cancellation failed:`, contractError);
        // ✅ FIXED: Don't fall through to database-only operations
        return { 
          success: false, 
          error: `Smart contract cancellation failed: ${contractError.message}` 
        };
      }
    } else {
      // ✅ FIXED: Only for test environment - mock cancellation
      await db.collection('deals').doc(dealId).update({
        status: 'CrossChainCancelledAfterDisputeDeadline',
        timeline: FieldValue.arrayUnion({
          event: `Cross-chain deal cancelled after dispute deadline (TEST MODE - mock contract)`,
          timestamp: FieldValue.serverTimestamp(),
          system: true,
          mockCancellation: true,
          testMode: true
        }),
        updatedAt: FieldValue.serverTimestamp()
      });

      return {
        success: true,
        receipt: {
          transactionHash: `test-cancel-${dealId}-${Date.now()}`,
          blockNumber: null
        },
        message: 'Cross-chain cancellation completed (TEST MODE)',
        testMode: true
      };
    }

  } catch (error) {
    console.error(`[CROSS-CHAIN-SIMPLE] Error in triggerCrossChainCancelAfterDisputeDeadline:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Check if cross-chain deal is ready for automated processing
 */
export async function isCrossChainDealReady(dealId) {
  try {
    const db = await getDb();
    const dealDoc = await db.collection('deals').doc(dealId).get();
    
    if (!dealDoc.exists) {
      return { ready: false, reason: 'Deal not found' };
    }

    const dealData = dealDoc.data();
    
    if (!dealData.isCrossChain) {
      return { ready: false, reason: 'Not a cross-chain deal' };
    }

    // Check if cross-chain transaction exists and is completed
    if (dealData.crossChainTransactionId) {
      const crossChainStatus = await getCrossChainTransactionStatus(dealData.crossChainTransactionId);
      
      if (crossChainStatus.status !== 'completed') {
        return { 
          ready: false, 
          reason: `Cross-chain transaction not completed: ${crossChainStatus.status}` 
        };
      }
    }

    // Check if all cross-chain conditions are fulfilled
    const crossChainConditions = dealData.conditions?.filter(c => c.type === 'CROSS_CHAIN') || [];
    const unfulfilledConditions = crossChainConditions.filter(c => c.status !== 'FULFILLED_BY_BUYER');
    
    if (unfulfilledConditions.length > 0) {
      return { 
        ready: false, 
        reason: `Cross-chain conditions not fulfilled: ${unfulfilledConditions.map(c => c.id).join(', ')}` 
      };
    }

    return { ready: true, reason: 'All cross-chain requirements met' };

  } catch (error) {
    console.error(`[CROSS-CHAIN-SIMPLE] Error checking if deal ${dealId} is ready:`, error);
    return { ready: false, reason: error.message };
  }
}

/**
 * Auto-complete cross-chain transaction steps if possible
 */
export async function autoCompleteCrossChainSteps(dealId) {
  try {
    console.log(`[CROSS-CHAIN-SIMPLE] Auto-completing cross-chain steps for deal ${dealId}`);
    
    const db = await getDb();
    const dealDoc = await db.collection('deals').doc(dealId).get();
    
    if (!dealDoc.exists || !dealDoc.data().crossChainTransactionId) {
      return { success: false, error: 'No cross-chain transaction found' };
    }

    const dealData = dealDoc.data();
    const transactionId = dealData.crossChainTransactionId;
    
    // Check current transaction status
    const currentStatus = await getCrossChainTransactionStatus(transactionId);
    
    if (currentStatus.status === 'completed') {
      return { success: true, message: 'Cross-chain transaction already completed' };
    }

    // Try to complete pending steps
    let completedSteps = 0;
    let failedSteps = 0;

    for (const step of currentStatus.steps || []) {
      if (step.status === 'pending') {
        try {
          const stepResult = await executeCrossChainStep(transactionId, step.step);
          
          if (stepResult.status === 'completed') {
            completedSteps++;
          } else if (stepResult.status === 'failed') {
            failedSteps++;
          }
        } catch (stepError) {
          console.warn(`[CROSS-CHAIN-SIMPLE] Failed to auto-complete step ${step.step}:`, stepError.message);
          failedSteps++;
        }
      }
    }

    // Update deal timeline
    await db.collection('deals').doc(dealId).update({
      timeline: FieldValue.arrayUnion({
        event: `Auto-completion attempted: ${completedSteps} steps completed, ${failedSteps} steps failed`,
        timestamp: FieldValue.serverTimestamp(),
        system: true,
        autoCompletion: true,
        completedSteps,
        failedSteps
      }),
      updatedAt: FieldValue.serverTimestamp()
    });

    return { 
      success: completedSteps > 0, 
      completedSteps, 
      failedSteps,
      message: `Auto-completed ${completedSteps} steps, ${failedSteps} failed`
    };

  } catch (error) {
    console.error(`[CROSS-CHAIN-SIMPLE] Error auto-completing steps for deal ${dealId}:`, error);
    return { success: false, error: error.message };
  }
}

export default {
  areNetworksEVMCompatible,
  getBridgeInfo,
  estimateTransactionFees,
  prepareCrossChainTransaction,
  executeCrossChainStep,
  getCrossChainTransactionStatus,
  linkTransactionToDeal,
  getCrossChainTransactionsForDeal,
  // ✅ NEW: Simplified functions that work like blockchainService
  triggerCrossChainReleaseAfterApprovalSimple,
  triggerCrossChainCancelAfterDisputeDeadline,
  isCrossChainDealReady,
  autoCompleteCrossChainSteps,
  // Existing scheduled job functions
  checkPendingTransactionStatus,
  triggerCrossChainReleaseAfterApproval,
  handleStuckCrossChainTransaction,
  retryCrossChainTransactionStep
}; 