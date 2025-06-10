import { 
  createConfig, 
  getChains, 
  getRoutes, 
  getStatus, 
  getTokens,
  executeRoute,
  ChainId 
} from '@lifi/sdk';
import { getAddress } from 'ethers';

export class LiFiBridgeService {
  constructor() {
    // Initialize LI.FI SDK configuration
    this.config = createConfig({
      integrator: 'cryptoescrow',
      // Optional: Add API key if you have one
      // apiKey: process.env.LIFI_API_KEY,
      // Enable debug mode for development
      debug: process.env.NODE_ENV === 'development'
    });

    console.log('[LIFI] LI.FI Bridge Service initialized');
  }

  /**
   * Validate and checksum Ethereum address for LI.FI API
   */
  validateAndChecksumAddress(address) {
    try {
      if (!address || address === '0x0000000000000000000000000000000000000000') {
        return address; // Valid zero address
      }
      
      // Use ethers getAddress to validate and checksum
      return getAddress(address);
    } catch (error) {
      console.warn(`[LIFI] Invalid address ${address}:`, error.message);
      throw new Error(`Invalid Ethereum address: ${address}`);
    }
  }

  /**
   * Find optimal bridge route between two chains
   */
  async findOptimalRoute({
    fromChainId,
    toChainId, 
    fromTokenAddress,
    toTokenAddress,
    fromAmount,
    fromAddress,
    toAddress,
    dealId
  }) {
    try {
      console.log(`[LIFI] Finding optimal route: ${fromChainId} -> ${toChainId} for deal ${dealId}`);

      // Validate input parameters
      if (!fromChainId || !toChainId || !fromAmount || !fromAddress || !toAddress) {
        throw new Error('Missing required parameters for route finding');
      }

      // Validate and checksum addresses for LI.FI API
      const validFromAddress = this.validateAndChecksumAddress(fromAddress);
      const validToAddress = this.validateAndChecksumAddress(toAddress);

      // Validate token addresses - use native token if invalid
      const validFromToken = this.validateAndFormatTokenAddress(fromTokenAddress);
      const validToToken = this.validateAndFormatTokenAddress(toTokenAddress);

      console.log(`[LIFI] Using validated addresses: from=${validFromAddress}, to=${validToAddress}`);
      console.log(`[LIFI] Using validated tokens: from=${validFromToken}, to=${validToToken}`);

      const routeRequest = {
        fromChainId: this.getChainId(fromChainId),
        toChainId: this.getChainId(toChainId),
        fromTokenAddress: validFromToken,
        toTokenAddress: validToToken,
        fromAmount: fromAmount.toString(),
        fromAddress: validFromAddress,
        toAddress: validToAddress,
        options: {
          order: 'RECOMMENDED', // Optimize for best user experience
          slippage: 0.03, // 3% max slippage
          allowBridges: ['across', 'connext', 'hop', 'stargate', 'polygon', 'arbitrum'], // Curated bridges
          allowExchanges: ['1inch', 'uniswap', '0x', 'paraswap'], // Trusted DEX aggregators
          insurance: true, // Enable insurance when available
          integrator: 'cryptoescrow'
        }
      };

      console.log(`[LIFI] Route request:`, {
        ...routeRequest,
        fromAmount: `${fromAmount} (${fromAmount.toString()})`
      });

      const routes = await getRoutes(routeRequest);
      
      if (!routes || !routes.routes || routes.routes.length === 0) {
        console.warn(`[LIFI] No routes found between ${fromChainId} and ${toChainId}`);
        throw new Error(`No bridge routes found between ${fromChainId} and ${toChainId}`);
      }

      // Select the best route based on multiple factors
      const bestRoute = this.selectOptimalRoute(routes.routes);
      
      if (!bestRoute) {
        throw new Error('No suitable route found after filtering');
      }

      const routeAnalysis = {
        route: bestRoute,
        estimatedTime: this.calculateTotalTime(bestRoute),
        totalFees: this.calculateTotalFees(bestRoute),
        bridgesUsed: this.extractBridgeNames(bestRoute),
        confidence: this.calculateRouteConfidence(bestRoute),
        gasEstimate: this.calculateGasEstimate(bestRoute),
        dealId,
        fromChain: fromChainId,
        toChain: toChainId,
        validatedTokens: {
          from: validFromToken,
          to: validToToken
        }
      };

      console.log(`[LIFI] Found optimal route using bridges: ${routeAnalysis.bridgesUsed.join(', ')}`);
      console.log(`[LIFI] Estimated time: ${routeAnalysis.estimatedTime}s, fees: $${routeAnalysis.totalFees.toFixed(2)}`);

      return routeAnalysis;
    } catch (error) {
      console.error(`[LIFI] Route finding failed:`, error);
      
      // Enhanced error handling for specific API errors
      if (error.message?.includes('Invalid token')) {
        throw new Error(`Token not supported for bridging: ${error.message}`);
      } else if (error.message?.includes('Invalid address')) {
        throw new Error(`Invalid address provided: ${error.message}`);
      } else if (error.message?.includes('Insufficient')) {
        throw new Error(`Insufficient liquidity for bridge: ${error.message}`);
      } else if (error.response?.status === 400) {
        throw new Error(`Invalid bridge request: ${error.response.data?.message || error.message}`);
      } else if (error.response?.status === 429) {
        throw new Error('Rate limited by LI.FI API - please try again later');
      }
      
      throw new Error(`LI.FI route finding failed: ${error.message}`);
    }
  }

  /**
   * Validate and format token address for LI.FI API
   */
  validateAndFormatTokenAddress(tokenAddress) {
    // Handle null, undefined, or empty string
    if (!tokenAddress || tokenAddress === '' || tokenAddress === '0x') {
      return '0x0000000000000000000000000000000000000000'; // Native token
    }

    // Handle already valid native token address
    if (tokenAddress === '0x0000000000000000000000000000000000000000') {
      return tokenAddress;
    }

    // Validate EVM address format
    if (!/^0x[a-fA-F0-9]{40}$/.test(tokenAddress)) {
      console.warn(`[LIFI] Invalid token address format: ${tokenAddress}, using native token`);
      return '0x0000000000000000000000000000000000000000';
    }

    return tokenAddress.toLowerCase();
  }

  /**
   * Calculate safe gas estimate from route
   */
  calculateGasEstimate(route) {
    try {
      if (!route.steps || !Array.isArray(route.steps)) {
        return 0;
      }

      return route.steps.reduce((total, step) => {
        if (step.estimate?.gasCosts && Array.isArray(step.estimate.gasCosts)) {
          const gasAmount = step.estimate.gasCosts[0]?.amount || 0;
          return total + (typeof gasAmount === 'string' ? parseInt(gasAmount) : gasAmount);
        }
        return total;
      }, 0);
    } catch (error) {
      console.warn(`[LIFI] Failed to calculate gas estimate:`, error);
      return 0;
    }
  }

  /**
   * Execute cross-chain bridge transaction
   */
  async executeBridgeTransfer({
    route,
    dealId,
    onStatusUpdate,
    onError
  }) {
    try {
      console.log(`[LIFI] Executing bridge transfer for deal ${dealId}`);

      // Validate route object
      if (!route || !route.route) {
        throw new Error('Invalid route object provided');
      }

      // Execute the route using LI.FI's execution engine
      const execution = await executeRoute({
        route: route.route,
        settings: {
          updateCallback: (updatedRoute) => {
            console.log(`[LIFI] Route update for deal ${dealId}:`, updatedRoute.status);
            if (onStatusUpdate && typeof onStatusUpdate === 'function') {
              try {
                onStatusUpdate(dealId, updatedRoute);
              } catch (callbackError) {
                console.error(`[LIFI] Status update callback failed:`, callbackError);
              }
            }
          },
          switchChainHook: async (requiredChainId) => {
            console.log(`[LIFI] Chain switch required: ${requiredChainId}`);
            // Return the provider for the required chain
            // This will be handled by the frontend wallet
            throw new Error(`Please switch to chain ${requiredChainId} in your wallet`);
          },
          acceptSlippageUpdateHook: (slippageUpdate) => {
            // Accept up to 5% slippage for escrow transactions
            const acceptable = slippageUpdate.slippage < 0.05;
            console.log(`[LIFI] Slippage update: ${slippageUpdate.slippage}%, acceptable: ${acceptable}`);
            return acceptable;
          }
        }
      });

      // Validate execution result
      if (!execution || !execution.txHash) {
        throw new Error('Bridge execution failed - no transaction hash returned');
      }

      const result = {
        success: true,
        transactionHash: execution.txHash,
        route: route.route,
        bridgeUsed: route.bridgesUsed || ['unknown'],
        executionId: execution.executionId || execution.txHash,
        dealId,
        fromChain: route.fromChain,
        toChain: route.toChain,
        estimatedTime: route.estimatedTime || 1800, // 30 minutes default
        status: 'PENDING'
      };

      console.log(`[LIFI] Bridge transfer initiated for deal ${dealId}, txHash: ${execution.txHash}`);
      return result;
    } catch (error) {
      console.error(`[LIFI] Bridge execution failed for deal ${dealId}:`, error);
      if (onError && typeof onError === 'function') {
        try {
          onError(dealId, error);
        } catch (callbackError) {
          console.error(`[LIFI] Error callback failed:`, callbackError);
        }
      }
      throw new Error(`LI.FI bridge execution failed: ${error.message}`);
    }
  }

  /**
   * Get status of cross-chain transaction
   */
  async getTransactionStatus(executionId, dealId) {
    try {
      if (!executionId) {
        throw new Error('Execution ID is required for status check');
      }

      const status = await getStatus({
        bridge: 'lifi',
        txHash: executionId
      });

      console.log(`[LIFI] Status check for deal ${dealId}: ${status?.status || 'unknown'}`);
      
      return {
        dealId,
        executionId,
        status: status?.status || 'UNKNOWN',
        substatus: status?.substatus || 'UNKNOWN',
        substatusMessage: status?.substatusMessage || 'No additional information',
        fromChain: status?.fromChain || 'unknown',
        toChain: status?.toChain || 'unknown',
        fromTxHash: status?.sending?.txHash || null,
        toTxHash: status?.receiving?.txHash || null,
        lastUpdated: new Date().toISOString()
      };
    } catch (error) {
      console.error(`[LIFI] Status check failed for deal ${dealId}:`, error);
      
      // Return a failed status instead of throwing
      return {
        dealId,
        executionId,
        status: 'FAILED',
        substatus: 'STATUS_CHECK_FAILED',
        substatusMessage: `Failed to get status: ${error.message}`,
        fromChain: 'unknown',
        toChain: 'unknown',
        fromTxHash: null,
        toTxHash: null,
        lastUpdated: new Date().toISOString(),
        error: error.message
      };
    }
  }

  /**
   * Get supported chains from LI.FI
   */
  async getSupportedChains() {
    try {
      const chains = await getChains();
      console.log(`[LIFI] Retrieved ${chains?.length || 0} supported chains`);
      
      if (!chains || !Array.isArray(chains)) {
        throw new Error('Invalid chains response from LI.FI');
      }
      
      return chains.map(chain => ({
        chainId: chain.id || chain.chainId,
        name: chain.name || 'Unknown',
        nativeCurrency: chain.nativeCurrency || { symbol: 'ETH' },
        rpcUrls: chain.rpcUrls || [],
        blockExplorerUrls: chain.blockExplorerUrls || [],
        bridgeSupported: true,
        dexSupported: chain.multicall ? true : false
      }));
    } catch (error) {
      console.error('[LIFI] Failed to get supported chains:', error);
      
      // Return fallback chains instead of throwing
      return [
        { chainId: 1, name: 'Ethereum', nativeCurrency: { symbol: 'ETH' }, bridgeSupported: true },
        { chainId: 137, name: 'Polygon', nativeCurrency: { symbol: 'MATIC' }, bridgeSupported: true },
        { chainId: 56, name: 'BSC', nativeCurrency: { symbol: 'BNB' }, bridgeSupported: true },
        { chainId: 42161, name: 'Arbitrum', nativeCurrency: { symbol: 'ETH' }, bridgeSupported: true },
        { chainId: 10, name: 'Optimism', nativeCurrency: { symbol: 'ETH' }, bridgeSupported: true }
      ];
    }
  }

  /**
   * Get supported tokens for a specific chain
   */
  async getSupportedTokens(chainId) {
    try {
      console.log(`[LIFI] Requesting tokens for chain: ${chainId}`);
      const chainIdNumber = this.getChainId(chainId);
      console.log(`[LIFI] Converted to chain ID: ${chainIdNumber}`);
      
      const tokens = await getTokens({ 
        chainId: chainIdNumber
      });
      
      console.log(`[LIFI] Raw response type:`, typeof tokens);
      console.log(`[LIFI] Raw response:`, tokens ? (Array.isArray(tokens) ? `Array(${tokens.length})` : 'Object') : 'null/undefined');
      
      // Handle different response formats from LI.FI API
      let tokenArray = [];
      
      if (Array.isArray(tokens)) {
        tokenArray = tokens;
      } else if (tokens && typeof tokens === 'object') {
        // Check if tokens is an object with a tokens property
        if (Array.isArray(tokens.tokens)) {
          tokenArray = tokens.tokens;
        } else if (tokens.data && Array.isArray(tokens.data)) {
          tokenArray = tokens.data;
        } else {
          // Convert object values to array if it's a token mapping
          tokenArray = Object.values(tokens).filter(token => 
            token && typeof token === 'object' && token.address
          );
        }
      }
      
      console.log(`[LIFI] Retrieved ${tokenArray.length} tokens for chain ${chainId}`);
      return tokenArray;
    } catch (error) {
      console.error(`[LIFI] Failed to get tokens for chain ${chainId}:`, error);
      console.error(`[LIFI] Error details:`, {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data
      });
      // Return empty array instead of throwing
      return [];
    }
  }

  /**
   * Estimate bridge fees for a transaction
   */
  async estimateBridgeFees({
    fromChainId,
    toChainId,
    fromTokenAddress,
    amount,
    fromAddress
  }) {
    try {
      const route = await this.findOptimalRoute({
        fromChainId,
        toChainId,
        fromTokenAddress,
        toTokenAddress: fromTokenAddress, // Same token on both chains
        fromAmount: amount,
        fromAddress,
        toAddress: fromAddress, // Same address
        dealId: 'fee-estimate'
      });

      return {
        totalFees: route.totalFees || 0,
        gasFees: route.gasEstimate || 0,
        bridgeFees: Math.max(0, (route.totalFees || 0) - (route.gasEstimate || 0)),
        estimatedTime: route.estimatedTime || 1800,
        bridgesUsed: route.bridgesUsed || [],
        confidence: route.confidence || 80
      };
    } catch (error) {
      console.error('[LIFI] Fee estimation failed:', error);
      
      // Return realistic fallback estimates
      return {
        totalFees: 10.5,
        gasFees: 0.005,
        bridgeFees: 10.0,
        estimatedTime: 1800,
        bridgesUsed: ['fallback'],
        confidence: 70,
        fallback: true,
        error: error.message
      };
    }
  }

  /**
   * Select optimal route from available routes
   */
  selectOptimalRoute(routes) {
    if (!routes || !Array.isArray(routes) || routes.length === 0) {
      return null;
    }

    // If only one route, return it
    if (routes.length === 1) {
      return routes[0];
    }

    // Sort routes by multiple criteria
    return routes.sort((a, b) => {
      const aTime = this.calculateTotalTime(a);
      const bTime = this.calculateTotalTime(b);
      const aFees = this.calculateTotalFees(a);
      const bFees = this.calculateTotalFees(b);
      const aConfidence = this.calculateRouteConfidence(a);
      const bConfidence = this.calculateRouteConfidence(b);

      // Weighted scoring: confidence (40%), time (30%), fees (30%)
      const aScore = (aConfidence * 0.4) + ((3600 - aTime) / 3600 * 0.3) + ((50 - Math.min(aFees, 50)) / 50 * 0.3);
      const bScore = (bConfidence * 0.4) + ((3600 - bTime) / 3600 * 0.3) + ((50 - Math.min(bFees, 50)) / 50 * 0.3);

      return bScore - aScore; // Higher score is better
    })[0];
  }

  /**
   * Calculate total execution time for a route
   */
  calculateTotalTime(route) {
    try {
      if (!route?.steps || !Array.isArray(route.steps)) {
        return 1800; // 30 minutes default
      }

      return route.steps.reduce((total, step) => {
        const duration = step.estimate?.executionDuration || 600; // 10 minutes default per step
        return total + duration;
      }, 0);
    } catch (error) {
      console.warn(`[LIFI] Failed to calculate total time:`, error);
      return 1800;
    }
  }

  /**
   * Calculate total fees for a route
   */
  calculateTotalFees(route) {
    try {
      if (!route?.steps || !Array.isArray(route.steps)) {
        return 0;
      }

      return route.steps.reduce((total, step) => {
        if (step.estimate?.feeCosts && Array.isArray(step.estimate.feeCosts)) {
          const feeAmount = step.estimate.feeCosts[0]?.amountUSD || 
                           step.estimate.feeCosts[0]?.amount || 0;
          return total + (typeof feeAmount === 'string' ? parseFloat(feeAmount) : feeAmount);
        }
        return total;
      }, 0);
    } catch (error) {
      console.warn(`[LIFI] Failed to calculate total fees:`, error);
      return 0;
    }
  }

  /**
   * Extract bridge names from route
   */
  extractBridgeNames(route) {
    try {
      if (!route?.steps || !Array.isArray(route.steps)) {
        return ['unknown'];
      }

      const bridges = route.steps
        .filter(step => step.type === 'cross' || step.toolDetails?.name)
        .map(step => step.toolDetails?.name || step.tool || 'unknown');
      
      return bridges.length > 0 ? [...new Set(bridges)] : ['unknown'];
    } catch (error) {
      console.warn(`[LIFI] Failed to extract bridge names:`, error);
      return ['unknown'];
    }
  }

  /**
   * Calculate confidence score for a route
   */
  calculateRouteConfidence(route) {
    try {
      if (!route) return 50;

      let confidence = 100;
      
      // Reduce confidence for multiple steps
      const stepCount = route.steps?.length || 1;
      confidence -= (stepCount - 1) * 10;
      
      // Reduce confidence for long execution time
      const totalTime = this.calculateTotalTime(route);
      if (totalTime > 3600) confidence -= 15; // > 1 hour
      else if (totalTime > 1800) confidence -= 10; // > 30 minutes
      
      // Reduce confidence for high fees
      const totalFees = this.calculateTotalFees(route);
      if (totalFees > 50) confidence -= 15;
      else if (totalFees > 20) confidence -= 10;
      
      // Boost confidence for reputable bridges
      const bridges = this.extractBridgeNames(route);
      const reputableBridges = ['across', 'stargate', 'hop', 'connext'];
      if (bridges.some(bridge => reputableBridges.includes(bridge.toLowerCase()))) {
        confidence += 10;
      }
      
      return Math.max(Math.min(confidence, 100), 30); // Clamp between 30-100
    } catch (error) {
      console.warn(`[LIFI] Failed to calculate route confidence:`, error);
      return 70; // Default confidence
    }
  }

  /**
   * Convert network names or IDs to LI.FI chain IDs
   */
  getChainId(networkName) {
    // Convert network names to chain IDs
    const chainMapping = {
      'ethereum': ChainId.ETH,
      'polygon': ChainId.POL,
      'bsc': ChainId.BSC,
      'arbitrum': ChainId.ARB,
      'optimism': ChainId.OPT,
      'avalanche': ChainId.AVA,
      'fantom': ChainId.FTM,
      1: ChainId.ETH,
      137: ChainId.POL,
      56: ChainId.BSC,
      42161: ChainId.ARB,
      10: ChainId.OPT,
      43114: ChainId.AVA,
      250: ChainId.FTM
    };
    
    const result = chainMapping[networkName.toString().toLowerCase()];
    if (result) {
      return result;
    }
    
    // Try parsing as number if not in mapping
    const parsed = parseInt(networkName);
    return isNaN(parsed) ? ChainId.ETH : parsed; // Default to Ethereum
  }

  /**
   * Convert chain IDs to network names
   */
  getNetworkName(chainId) {
    const networks = {
      [ChainId.ETH]: 'ethereum',
      [ChainId.POL]: 'polygon',
      [ChainId.BSC]: 'bsc',
      [ChainId.ARB]: 'arbitrum',
      [ChainId.OPT]: 'optimism',
      [ChainId.AVA]: 'avalanche',
      [ChainId.FTM]: 'fantom'
    };
    return networks[chainId] || `chain-${chainId}`;
  }
}

export default LiFiBridgeService; 