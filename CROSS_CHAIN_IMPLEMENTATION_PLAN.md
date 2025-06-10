# Cross-Chain Transaction Mediation Implementation Plan

## Overview

This document outlines the implementation plan for adding **actual cross-chain transaction mediation** to the CryptoEscrow backend, enabling real bridge-based transfers between different blockchain networks while maintaining EVM-based smart contracts.

## Current State Analysis

### ✅ **What We Have**
- Database tracking system (`crossChainService.js`)
- Wallet detection (`walletRoutes.js`)
- EVM smart contract deployment
- Static bridge configuration
- Cross-chain condition management

### ❌ **What's Missing**
- **Real bridge integrations** (Wormhole, LayerZero, etc.)
- **Multi-network RPC providers**
- **Bridge contract interactions**
- **Asset wrapping/unwrapping**
- **Cross-chain transaction execution**

## Architecture Design

### Core Principle: **EVM-Centric Escrow with LI.FI Bridge Aggregation**

```
┌─────────────┐   LI.FI      ┌─────────────┐   LI.FI      ┌─────────────┐
│   Solana    │◄────────────►│ EVM Escrow  │◄────────────►│ BSC Wallet  │
│   Buyer     │  Aggregation │ (Ethereum)  │ Aggregation  │   Seller    │
└─────────────┘              └─────────────┘              └─────────────┘
                                    │
                              ┌─────────────┐
                              │ LI.FI API   │
                              │ 40+ Chains  │
                              │ 14+ Bridges │
                              │ 33+ DEXs    │
                              └─────────────┘
```

### Key Components

1. **MetaMask SDK Integration** - Wallet detection and transaction signing
2. **LI.FI Bridge Service** - Professional bridge aggregation and execution
3. **Asset Management Service** - Handle wrapped tokens and conversions  
4. **Cross-Chain Coordinator** - Orchestrate multi-step transactions
5. **Smart Contract Extensions** - Bridge-aware escrow contracts

## Implementation Plan

## Phase 1: Foundation Layer

### 1.1 Enhanced Wallet Detection Route (Backend)

The backend already has a detection endpoint that receives wallet data from frontend. Let's enhance it to support dynamic chain information:

```javascript
// src/api/routes/wallet/walletRoutes.js (Enhanced)

// Enhanced wallet detection endpoint - POST /api/wallets/detection
router.post('/detection', authenticateToken, async (req, res) => {
  try {
    const userId = req.userId;
    const { detectedWallets, walletDetails } = req.body;

    if (!detectedWallets) {
      return res.status(400).json({ error: 'Detected wallets data is required' });
    }

    const { db } = await getFirebaseServices();
    
    // Enhanced storage with chain compatibility info
    const userRef = db.collection('users').doc(userId);
    await userRef.update({
      lastWalletDetection: {
        timestamp: FieldValue.serverTimestamp(),
        evmWallets: detectedWallets.evmWallets?.length || 0,
        solanaWallets: detectedWallets.solanaWallets?.length || 0,
        bitcoinWallets: detectedWallets.bitcoinWallets?.length || 0,
        totalDetected: (detectedWallets.evmWallets?.length || 0) + 
                      (detectedWallets.solanaWallets?.length || 0) + 
                      (detectedWallets.bitcoinWallets?.length || 0),
        // New: Store detailed wallet capabilities
        walletCapabilities: walletDetails || {}
      },
      updatedAt: FieldValue.serverTimestamp()
    });

    // Check LI.FI compatibility for detected wallets
    const compatibilityCheck = await checkLiFiCompatibility(detectedWallets);

    res.status(200).json({
      message: 'Wallet detection data received successfully',
      lifiCompatibility: compatibilityCheck,
      supportedChains: compatibilityCheck.supportedChains || []
    });

  } catch (error) {
    console.error('[WALLET] Error processing wallet detection:', error);
    res.status(500).json({ error: 'Internal server error while processing wallet detection' });
  }
});

// New: Dynamic wallet capability endpoint - GET /api/wallets/capabilities
router.get('/capabilities/:walletAddress', authenticateToken, async (req, res) => {
  try {
    const { walletAddress } = req.params;
    const { network } = req.query;

    // Check what chains this wallet can access through LI.FI
    const capabilities = await analyzeDynamicWalletCapabilities(walletAddress, network);

    res.json({
      success: true,
      wallet: walletAddress,
      network: network,
      capabilities,
      availableBridges: capabilities.bridges || [],
      supportedChains: capabilities.chains || []
    });

  } catch (error) {
    console.error('[WALLET] Error analyzing wallet capabilities:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to analyze wallet capabilities' 
    });
  }
});

async function checkLiFiCompatibility(detectedWallets) {
  // This will be implemented with actual LI.FI API calls
  return {
    compatible: true,
    supportedChains: ['ethereum', 'polygon', 'bsc', 'arbitrum', 'optimism'],
    bridgeCount: 14,
    dexCount: 33
  };
}

async function analyzeDynamicWalletCapabilities(walletAddress, network) {
  // Dynamic analysis based on connected wallet
  return {
    network,
    walletAddress,
    chains: ['ethereum', 'polygon', 'bsc'], // Based on wallet type
    bridges: ['lifi', 'across', 'stargate'],
    canBridge: true,
    estimatedTime: '15-45 minutes'
  };
}
```

### 1.2 Frontend Wallet Detection Service (EIP-6963)

The actual wallet detection happens on the frontend using EIP-6963 standard:

```javascript
// src/services/walletDetectionService.js (Frontend)
import { MetaMaskSDK } from '@metamask/sdk';

export class WalletDetectionService {
  constructor() {
    this.detectedWallets = [];
    this.metamaskSDK = new MetaMaskSDK({
      dappMetadata: {
        name: 'CryptoEscrow',
        url: window.location.hostname,
      }
    });
  }

  // EIP-6963 Multi-Wallet Detection
  async detectAllWallets() {
    return new Promise((resolve) => {
      const wallets = [];

      // Listen for EIP-6963 wallet announcements
      window.addEventListener('eip6963:announceProvider', (event) => {
        console.log(`Detected wallet: ${event.detail.info.name}`);
        wallets.push({
          name: event.detail.info.name,
          icon: event.detail.info.icon,
          rdns: event.detail.info.rdns,
          uuid: event.detail.info.uuid,
          provider: event.detail.provider,
          type: 'evm' // EIP-6963 is primarily for EVM wallets
        });
      });

      // Request wallet providers
      window.dispatchEvent(new Event('eip6963:requestProvider'));

      // Also detect Solana wallets (different standard)
      this.detectSolanaWallets().then(solanaWallets => {
        // Combine EVM and Solana wallets
        setTimeout(() => {
          resolve({
            evmWallets: wallets,
            solanaWallets,
            bitcoinWallets: [], // Future implementation
            totalDetected: wallets.length + solanaWallets.length
          });
        }, 1000); // Give wallets time to announce
      });
    });
  }

  async detectSolanaWallets() {
    const solanaWallets = [];
    
    // Check for common Solana wallets
    if (window.solana?.isPhantom) {
      solanaWallets.push({
        name: 'Phantom',
        type: 'solana',
        provider: window.solana
      });
    }

    if (window.solflare) {
      solanaWallets.push({
        name: 'Solflare',
        type: 'solana', 
        provider: window.solflare
      });
    }

    return solanaWallets;
  }

  // Connect to a specific wallet and get capabilities
  async connectAndAnalyze(wallet) {
    try {
      let connection;
      
      if (wallet.type === 'evm') {
        // Connect using EIP-6963 provider
        const accounts = await wallet.provider.request({
          method: 'eth_requestAccounts'
        });
        
        const chainId = await wallet.provider.request({
          method: 'eth_chainId'
        });

        connection = {
          address: accounts[0],
          chainId: parseInt(chainId, 16),
          network: this.getNetworkName(parseInt(chainId, 16)),
          provider: wallet.provider
        };
      } else if (wallet.type === 'solana') {
        // Connect using Solana wallet adapter
        await wallet.provider.connect();
        connection = {
          address: wallet.provider.publicKey.toString(),
          network: 'solana',
          provider: wallet.provider
        };
      }

      // Send detection data to backend
      await this.sendDetectionToBackend({
        wallet: wallet.name,
        connection,
        capabilities: await this.analyzeCapabilities(connection)
      });

      return connection;
    } catch (error) {
      console.error('Wallet connection failed:', error);
      throw error;
    }
  }

  async analyzeCapabilities(connection) {
    // Analyze what this wallet can do based on its network and type
    return {
      canBridge: true, // Most wallets can bridge through LI.FI
      supportedChains: this.getSupportedChains(connection.network),
      bridgeCompatible: true
    };
  }

  getSupportedChains(network) {
    // Return chains this network can bridge to/from via LI.FI
    const chainMappings = {
      'ethereum': ['polygon', 'bsc', 'arbitrum', 'optimism'],
      'polygon': ['ethereum', 'bsc', 'arbitrum'],
      'solana': ['ethereum', 'polygon'], // Via wormhole/allbridge
      'bsc': ['ethereum', 'polygon']
    };
    return chainMappings[network] || [];
  }

  getNetworkName(chainId) {
    const networks = {
      1: 'ethereum',
      137: 'polygon', 
      56: 'bsc',
      42161: 'arbitrum',
      10: 'optimism'
    };
    return networks[chainId] || 'unknown';
  }

  async sendDetectionToBackend(data) {
    try {
      await fetch('/api/wallets/detection', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.getAuthToken()}`
        },
        body: JSON.stringify({
          detectedWallets: data.wallet,
          walletDetails: data
        })
      });
    } catch (error) {
      console.error('Failed to send detection to backend:', error);
    }
  }
}
```

### 1.3 Dynamic Chain Configuration Service

Instead of hardcoded RPC providers, the service adapts based on detected wallets and LI.FI supported chains:

```javascript
// src/services/dynamicChainService.js
export class DynamicChainService {
  constructor(lifiService) {
    this.lifiService = lifiService;
    this.availableChains = new Map();
    this.connectedWallets = new Map();
  }

  // Initialize based on LI.FI supported chains, not hardcoded RPC URLs
  async initializeFromLiFi() {
    try {
      // Get all supported chains from LI.FI API
      const supportedChains = await this.lifiService.lifi.getChains();
      
      supportedChains.forEach(chain => {
        this.availableChains.set(chain.id, {
          chainId: chain.id,
          name: chain.name,
          nativeCurrency: chain.nativeCurrency,
          rpcUrls: chain.rpcUrls,
          blockExplorerUrls: chain.blockExplorerUrls,
          bridgeSupported: true, // Since it's from LI.FI
          dexSupported: chain.multicall ? true : false
        });
      });

      console.log(`Initialized ${this.availableChains.size} chains from LI.FI`);
      return Array.from(this.availableChains.values());
    } catch (error) {
      console.error('Failed to initialize chains from LI.FI:', error);
      // Fallback to basic chains
      return this.initializeFallbackChains();
    }
  }

  // Register a connected wallet and its capabilities
  registerConnectedWallet(walletAddress, walletInfo) {
    this.connectedWallets.set(walletAddress, {
      ...walletInfo,
      connectedAt: new Date(),
      availableChains: this.getWalletCompatibleChains(walletInfo.network)
    });
  }

  // Get chains this wallet can bridge to/from
  getWalletCompatibleChains(sourceNetwork) {
    const compatibleChains = [];
    
    for (const [chainId, chainInfo] of this.availableChains) {
      // Check if LI.FI supports bridging between source and target
      if (this.canBridgeBetween(sourceNetwork, chainInfo.name.toLowerCase())) {
        compatibleChains.push(chainInfo);
      }
    }
    
    return compatibleChains;
  }

  // Dynamic check if bridging is possible between two networks
  canBridgeBetween(sourceNetwork, targetNetwork) {
    // This could call LI.FI API for real-time compatibility
    const commonBridgeChains = [
      'ethereum', 'polygon', 'bsc', 'arbitrum', 'optimism', 
      'avalanche', 'fantom', 'moonbeam'
    ];
    
    return commonBridgeChains.includes(sourceNetwork.toLowerCase()) &&
           commonBridgeChains.includes(targetNetwork.toLowerCase());
  }

  // Get optimal path based on user's connected wallets
  async getOptimalBridgePath(fromWallet, toNetwork, amount, tokenAddress) {
    const fromWalletInfo = this.connectedWallets.get(fromWallet);
    if (!fromWalletInfo) {
      throw new Error('Wallet not connected or registered');
    }

    // Use LI.FI to find the best route
    return await this.lifiService.findOptimalRoute(
      fromWalletInfo.network,
      toNetwork,
      amount,
      tokenAddress
    );
  }

  // Initialize fallback chains when LI.FI is unavailable
  initializeFallbackChains() {
    const fallbackChains = [
      { chainId: 1, name: 'Ethereum', nativeCurrency: { symbol: 'ETH' } },
      { chainId: 137, name: 'Polygon', nativeCurrency: { symbol: 'MATIC' } },
      { chainId: 56, name: 'BSC', nativeCurrency: { symbol: 'BNB' } }
    ];

    fallbackChains.forEach(chain => {
      this.availableChains.set(chain.chainId, chain);
    });

    return fallbackChains;
  }

  // Get real-time network info from connected wallet provider
  async getNetworkInfoFromWallet(walletAddress) {
    const wallet = this.connectedWallets.get(walletAddress);
    if (!wallet?.provider) {
      throw new Error('Wallet not connected');
    }

    try {
      const chainId = await wallet.provider.request({ method: 'eth_chainId' });
      const blockNumber = await wallet.provider.request({ method: 'eth_blockNumber' });
      
      return {
        chainId: parseInt(chainId, 16),
        blockNumber: parseInt(blockNumber, 16),
        network: wallet.network,
        provider: wallet.provider
      };
    } catch (error) {
      throw new Error(`Failed to get network info: ${error.message}`);
    }
  }
}
```

## Phase 2: LI.FI Bridge Integration Layer

### 2.1 LI.FI Bridge Service Implementation

```javascript
// src/services/lifiService.js
import { LiFi, ChainId } from '@lifi/sdk';
import { createConfig } from '@lifi/sdk';

export class LiFiBridgeService {
  constructor(metamaskSDK, networkProvider) {
    this.metamaskSDK = metamaskSDK;
    this.networkProvider = networkProvider;
    this.lifi = new LiFi(createConfig({
      integrator: 'cryptoescrow',
      apiUrl: 'https://li.quest/v1',
      defaultRouteOptions: {
        order: 'RECOMMENDED', // Optimize for best user experience
        slippage: 0.03, // 3% max slippage
        allowBridges: ['across', 'connext', 'hop', 'stargate', 'polygon'], // Curated bridges
        allowExchanges: ['1inch', 'uniswap', '0x'], // Trusted DEX aggregators
      }
    }));
  }

  async findOptimalRoute(sourceChain, targetChain, amount, tokenAddress) {
    try {
      const routeRequest = {
        fromChainId: this.getChainId(sourceChain),
        toChainId: this.getChainId(targetChain),
        fromTokenAddress: tokenAddress,
        toTokenAddress: tokenAddress, // Same asset bridging
        fromAmount: amount.toString(),
        fromAddress: await this.metamaskSDK.getAddress(),
        toAddress: await this.metamaskSDK.getAddress(),
      };

      const routes = await this.lifi.getRoutes(routeRequest);
      
      // Return best route with metadata
      const bestRoute = routes.routes[0];
      return {
        route: bestRoute,
        estimatedTime: bestRoute.steps.reduce((total, step) => total + step.estimate.executionDuration, 0),
        totalFees: bestRoute.steps.reduce((total, step) => total + parseFloat(step.estimate.feeCosts[0]?.amount || '0'), 0),
        bridgesUsed: bestRoute.steps.map(step => step.tool),
        confidence: this.calculateRouteConfidence(bestRoute)
      };
    } catch (error) {
      throw new Error(`LI.FI route finding failed: ${error.message}`);
    }
  }

  async executeBridgeTransfer(route, transferParams) {
    try {
      const { dealId, fromAddress, toAddress } = transferParams;
      
      // Execute the route using LI.FI's execution engine
      const execution = await this.lifi.executeRoute({
        route: route.route,
        settings: {
          updateCallback: (updatedRoute) => {
            this.handleRouteUpdate(dealId, updatedRoute);
          },
          switchChainHook: async (requiredChainId) => {
            return await this.metamaskSDK.switchChain(requiredChainId);
          },
          acceptSlippageUpdateHook: (slippageUpdate) => {
            return slippageUpdate.slippage < 0.05; // Accept up to 5% slippage
          }
        }
      });

      return {
        success: true,
        transactionHash: execution.txHash,
        route: route.route,
        bridgeUsed: route.bridgesUsed,
        executionId: execution.executionId,
        dealId
      };
    } catch (error) {
      throw new Error(`LI.FI bridge execution failed: ${error.message}`);
    }
  }

  async getRouteStatus(executionId) {
    return await this.lifi.getStatus({
      bridge: 'lifi',
      txHash: executionId
    });
  }

  getChainId(networkName) {
    const chainMapping = {
      'ethereum': ChainId.ETH,
      'polygon': ChainId.POL,
      'bsc': ChainId.BSC,
      'arbitrum': ChainId.ARB,
      'optimism': ChainId.OPT,
      'solana': ChainId.SOL,
      'avalanche': ChainId.AVA
    };
    return chainMapping[networkName.toLowerCase()] || networkName;
  }

  calculateRouteConfidence(route) {
    // Calculate confidence based on LI.FI route metadata
    let confidence = 100;
    
    // Reduce confidence for multiple bridge hops
    const bridgeSteps = route.steps.filter(step => step.type === 'cross');
    confidence -= (bridgeSteps.length - 1) * 10;
    
    // Consider time estimates
    const totalTime = route.steps.reduce((total, step) => total + step.estimate.executionDuration, 0);
    if (totalTime > 1800) confidence -= 15; // Reduce for > 30 min routes
    
    return Math.max(confidence, 50); // Minimum 50% confidence
  }
}
```

### 2.2 Asset Wrapping and Chain Support

```javascript
// src/services/assetMappingService.js
export class AssetMappingService {
  constructor(lifiService) {
    this.lifiService = lifiService;
    this.assetMappings = new Map();
  }

  async getSupportedTokens(chainId) {
    // Get supported tokens from LI.FI for a specific chain
    return await this.lifiService.lifi.getTokens({ chainId });
  }

  async findBridgeableAsset(sourceChain, targetChain, tokenAddress) {
    try {
      // Check if asset can be bridged directly
      const tokens = await this.getSupportedTokens(sourceChain);
      const sourceToken = tokens.find(token => 
        token.address.toLowerCase() === tokenAddress.toLowerCase()
      );

      if (!sourceToken) {
        throw new Error(`Token ${tokenAddress} not supported on ${sourceChain}`);
      }

      // Get possible connections for this token
      const connections = await this.lifiService.lifi.getPossibleConnections({
        fromChainId: sourceChain,
        toChainId: targetChain,
        fromTokenAddress: tokenAddress
      });

      return {
        sourceToken,
        targetTokens: connections.toTokens,
        bridgeAvailable: connections.toTokens.length > 0
      };
    } catch (error) {
      throw new Error(`Asset mapping failed: ${error.message}`);
    }
  }

  async getOptimalAssetRoute(sourceChain, targetChain, tokenAddress, amount) {
    const assetInfo = await this.findBridgeableAsset(sourceChain, targetChain, tokenAddress);
    
    if (!assetInfo.bridgeAvailable) {
      throw new Error(`No bridge route available for ${tokenAddress} from ${sourceChain} to ${targetChain}`);
    }

    // Find best target token (prefer same symbol, then stablecoins)
    const bestTargetToken = this.selectBestTargetToken(assetInfo.sourceToken, assetInfo.targetTokens);

    return {
      sourceToken: assetInfo.sourceToken,
      targetToken: bestTargetToken,
      route: await this.lifiService.findOptimalRoute(
        sourceChain, 
        targetChain, 
        amount, 
        tokenAddress
      )
    };
  }

  selectBestTargetToken(sourceToken, targetTokens) {
    // Priority: Same symbol > same name > stablecoins > others
    const sameSymbol = targetTokens.find(token => token.symbol === sourceToken.symbol);
    if (sameSymbol) return sameSymbol;

    const sameName = targetTokens.find(token => token.name === sourceToken.name);
    if (sameName) return sameName;

    const stablecoins = ['USDC', 'USDT', 'DAI', 'BUSD'];
    const stablecoin = targetTokens.find(token => stablecoins.includes(token.symbol));
    if (stablecoin) return stablecoin;

    return targetTokens[0]; // Default to first available
  }
}
```

## Phase 3: Enhanced Cross-Chain Coordination

### 3.1 Cross-Chain Coordinator Service

```javascript
// src/services/crossChainCoordinator.js
import { MetaMaskSDKService } from './metamaskSDKService.js';
import { LiFiBridgeService } from './lifiService.js';
import { AssetMappingService } from './assetMappingService.js';

export class CrossChainCoordinator {
  constructor() {
    this.metamaskSDK = new MetaMaskSDKService();
    this.lifiService = new LiFiBridgeService(this.metamaskSDK);
    this.assetMapping = new AssetMappingService(this.lifiService);
  }

  async planCrossChainEscrow({
    buyerWallet,
    sellerWallet, 
    amount,
    tokenAddress,
    escrowNetwork = 'ethereum'
  }) {
    try {
      // 1. Validate wallet compatibility
      const walletValidation = await this.validateWalletCompatibility(buyerWallet, sellerWallet);
      if (!walletValidation.valid) {
        throw new Error(`Wallet compatibility issue: ${walletValidation.error}`);
      }

      // 2. Plan buyer to escrow route
      const buyerToEscrow = buyerWallet.network !== escrowNetwork 
        ? await this.planBridgeRoute(buyerWallet.network, escrowNetwork, amount, tokenAddress)
        : null;

      // 3. Plan escrow to seller route  
      const escrowToSeller = sellerWallet.network !== escrowNetwork
        ? await this.planBridgeRoute(escrowNetwork, sellerWallet.network, amount, tokenAddress)
        : null;

      // 4. Calculate total costs and time
      const totalCosts = await this.calculateTotalCosts(buyerToEscrow, escrowToSeller);
      const estimatedTime = await this.calculateTotalTime(buyerToEscrow, escrowToSeller);

      return {
        plan: {
          buyerToEscrow,
          escrowToSeller,
          escrowNetwork,
          totalSteps: (buyerToEscrow ? 1 : 0) + (escrowToSeller ? 1 : 0) + 1
        },
        costs: totalCosts,
        estimatedTime,
        confidence: this.calculatePlanConfidence(buyerToEscrow, escrowToSeller)
      };
    } catch (error) {
      throw new Error(`Cross-chain planning failed: ${error.message}`);
    }
  }

  async planBridgeRoute(sourceChain, targetChain, amount, tokenAddress) {
    const assetRoute = await this.assetMapping.getOptimalAssetRoute(
      sourceChain, 
      targetChain, 
      tokenAddress, 
      amount
    );

    return {
      sourceChain,
      targetChain,
      sourceToken: assetRoute.sourceToken,
      targetToken: assetRoute.targetToken,
      route: assetRoute.route,
      bridgeInfo: {
        bridges: assetRoute.route.bridgesUsed,
        estimatedTime: assetRoute.route.estimatedTime,
        totalFees: assetRoute.route.totalFees
      }
    };
  }

  async validateWalletCompatibility(buyerWallet, sellerWallet) {
    // Check if both wallets are supported by LI.FI
    const supportedChains = await this.lifiService.lifi.getChains();
    const supportedChainIds = supportedChains.map(chain => chain.id);

    const buyerSupported = supportedChainIds.includes(buyerWallet.chainId);
    const sellerSupported = supportedChainIds.includes(sellerWallet.chainId);

    if (!buyerSupported) {
      return { valid: false, error: `Buyer wallet chain ${buyerWallet.network} not supported` };
    }

    if (!sellerSupported) {
      return { valid: false, error: `Seller wallet chain ${sellerWallet.network} not supported` };
    }

    return { valid: true };
  }

  calculatePlanConfidence(buyerToEscrow, escrowToSeller) {
    let confidence = 100;
    
    // Reduce confidence for each bridge step
    if (buyerToEscrow) confidence -= (100 - buyerToEscrow.route.confidence) * 0.5;
    if (escrowToSeller) confidence -= (100 - escrowToSeller.route.confidence) * 0.5;
    
    return Math.max(confidence, 60); // Minimum 60% confidence
  }
}
```

## Phase 4: Enhanced Smart Contract Integration

### 4.1 Bridge-Aware Escrow Contract

```solidity
// contracts/CrossChainEscrow.sol
pragma solidity ^0.8.19;

import "./PropertyEscrow.sol";
import "./interfaces/IBridgeReceiver.sol";

contract CrossChainEscrow is PropertyEscrow, IBridgeReceiver {
    struct CrossChainInfo {
        string originChain;
        string destinationChain;
        address bridgeContract;
        bytes32 bridgeTransactionId;
        bool isWrappedAsset;
    }

    mapping(bytes32 => CrossChainInfo) public crossChainDeposits;
    mapping(address => bool) public authorizedBridges;

    event CrossChainDepositReceived(
        bytes32 indexed dealId,
        string originChain,
        address indexed buyer,
        uint256 amount
    );

    event CrossChainReleaseInitiated(
        bytes32 indexed dealId,
        string destinationChain,
        address indexed seller,
        uint256 amount
    );

    modifier onlyAuthorizedBridge() {
        require(authorizedBridges[msg.sender], "Unauthorized bridge");
        _;
    }

    function receiveCrossChainDeposit(
        bytes32 dealId,
        address buyer,
        uint256 amount,
        string memory originChain,
        bytes32 bridgeTransactionId
    ) external onlyAuthorizedBridge {
        crossChainDeposits[dealId] = CrossChainInfo({
            originChain: originChain,
            destinationChain: "",
            bridgeContract: msg.sender,
            bridgeTransactionId: bridgeTransactionId,
            isWrappedAsset: true
        });

        // Mark as deposited in the main escrow logic
        _markFundsDeposited(dealId, buyer, amount);

        emit CrossChainDepositReceived(dealId, originChain, buyer, amount);
    }

    function releaseFundsCrossChain(
        bytes32 dealId,
        string memory destinationChain,
        address destinationAddress
    ) external {
        require(canReleaseFunds(dealId), "Cannot release funds yet");
        
        CrossChainInfo storage info = crossChainDeposits[dealId];
        info.destinationChain = destinationChain;

        uint256 amount = getEscrowAmount(dealId);
        
        // Initiate bridge transfer to destination chain
        IBridgeContract(info.bridgeContract).initiateCrossChainTransfer(
            dealId,
            destinationChain,
            destinationAddress,
            amount
        );

        emit CrossChainReleaseInitiated(dealId, destinationChain, destinationAddress, amount);
    }
}
```

## Phase 5: Backend Service Integration

### 5.1 Enhanced Cross-Chain Service

```javascript
// src/services/crossChainService.js (Enhanced)
import { MetaMaskSDKService } from './metamaskSDKService.js';
import { LiFiBridgeService } from './lifiService.js';
import { CrossChainCoordinator } from './crossChainCoordinator.js';
import { AssetMappingService } from './assetMappingService.js';

export class CrossChainService {
  constructor() {
    this.metamaskSDK = new MetaMaskSDKService();
    this.lifiService = new LiFiBridgeService(this.metamaskSDK);
    this.coordinator = new CrossChainCoordinator();
    this.assetMapping = new AssetMappingService(this.lifiService);
  }

  async executeCrossChainEscrowDeposit({
    dealId,
    buyerWallet,
    sellerWallet,
    amount,
    tokenAddress
  }) {
    try {
      // 1. Plan the cross-chain route using LI.FI
      const escrowPlan = await this.coordinator.planCrossChainEscrow({
        buyerWallet,
        sellerWallet,
        amount,
        tokenAddress,
        escrowNetwork: 'ethereum'
      });

      // 2. Connect buyer wallet via MetaMask SDK
      const buyerConnection = await this.metamaskSDK.connectWallet();
      if (buyerConnection.address.toLowerCase() !== buyerWallet.address.toLowerCase()) {
        throw new Error('Connected wallet does not match buyer wallet');
      }

      // 3. Execute buyer deposit via LI.FI bridge
      let depositResult = null;
      if (escrowPlan.plan.buyerToEscrow) {
        depositResult = await this.lifiService.executeBridgeTransfer(
          escrowPlan.plan.buyerToEscrow.route,
          {
            dealId,
            fromAddress: buyerWallet.address,
            toAddress: process.env.ESCROW_CONTRACT_ADDRESS, // Our escrow contract
            amount,
            tokenAddress
          }
        );
      }

      // 4. Store cross-chain transaction details in Firestore
      await this.storeCrossChainTransaction({
        dealId,
        buyerDeposit: depositResult,
        escrowPlan,
        status: 'DEPOSIT_INITIATED'
      });

      return {
        success: true,
        depositTransactionHash: depositResult?.transactionHash,
        escrowPlan,
        estimatedCompletionTime: escrowPlan.estimatedTime
      };
    } catch (error) {
      throw new Error(`Cross-chain escrow deposit failed: ${error.message}`);
    }
  }

  async executeCrossChainEscrowRelease({
    dealId,
    sellerWallet,
    amount
  }) {
    try {
      // 1. Get stored transaction info from Firestore
      const txInfo = await this.getCrossChainTransaction(dealId);
      
      // 2. Connect seller wallet via MetaMask SDK
      const sellerConnection = await this.metamaskSDK.connectWallet();
      if (sellerConnection.address.toLowerCase() !== sellerWallet.address.toLowerCase()) {
        throw new Error('Connected wallet does not match seller wallet');
      }

      // 3. Release from escrow contract
      const escrowReleaseResult = await this.releaseFromEscrow(dealId);

      // 4. Bridge to seller's network using LI.FI (if cross-chain)
      let bridgeResult = null;
      if (txInfo.escrowPlan.plan.escrowToSeller) {
        bridgeResult = await this.lifiService.executeBridgeTransfer(
          txInfo.escrowPlan.plan.escrowToSeller.route,
          {
            dealId,
            fromAddress: process.env.ESCROW_CONTRACT_ADDRESS,
            toAddress: sellerWallet.address,
            amount,
            tokenAddress: txInfo.escrowPlan.plan.escrowToSeller.targetToken.address
          }
        );
      }

      // 5. Update transaction status
      await this.updateCrossChainTransaction(dealId, {
        status: 'COMPLETED',
        escrowRelease: escrowReleaseResult,
        sellerBridge: bridgeResult,
        completedAt: new Date().toISOString()
      });

      return {
        success: true,
        escrowReleaseHash: escrowReleaseResult.transactionHash,
        bridgeTransactionHash: bridgeResult?.transactionHash,
        finalNetwork: sellerWallet.network,
        completionTime: new Date().toISOString()
      };
    } catch (error) {
      throw new Error(`Cross-chain escrow release failed: ${error.message}`);
    }
  }

  async monitorCrossChainTransaction(dealId) {
    try {
      const txInfo = await this.getCrossChainTransaction(dealId);
      
      // Monitor bridge execution status using LI.FI
      if (txInfo.buyerDeposit?.executionId) {
        const depositStatus = await this.lifiService.getRouteStatus(txInfo.buyerDeposit.executionId);
        
        await this.updateCrossChainTransaction(dealId, {
          depositStatus: depositStatus.status,
          lastChecked: new Date().toISOString()
        });
        
        return depositStatus;
      }
      
      return { status: 'PENDING', message: 'No active bridge transactions to monitor' };
    } catch (error) {
      console.error(`Failed to monitor cross-chain transaction ${dealId}:`, error);
      return { status: 'ERROR', message: error.message };
    }
  }

  async estimateCrossChainCosts(buyerWallet, sellerWallet, amount, tokenAddress) {
    try {
      const escrowPlan = await this.coordinator.planCrossChainEscrow({
        buyerWallet,
        sellerWallet,
        amount,
        tokenAddress
      });

      return {
        totalFees: escrowPlan.costs.totalFees,
        bridgeFees: escrowPlan.costs.bridgeFees,
        gasFees: escrowPlan.costs.gasFees,
        estimatedTime: escrowPlan.estimatedTime,
        confidence: escrowPlan.confidence
      };
    } catch (error) {
      throw new Error(`Cost estimation failed: ${error.message}`);
    }
  }
}
```

### 5.2 Enhanced Transaction Routes

```javascript
// src/api/routes/transaction/transactionRoutes.js (Enhanced)
router.post('/create-cross-chain', authenticateToken, async (req, res) => {
  try {
    const {
      buyerWallet,
      sellerWallet,
      amount,
      asset,
      propertyAddress,
      conditions
    } = req.body;

    // 1. Validate cross-chain wallets
    const walletValidation = await validateCrossChainWallets(buyerWallet, sellerWallet);
    if (!walletValidation.valid) {
      return res.status(400).json({ error: walletValidation.error });
    }

    // 2. Create deal record
    const dealId = await createDealRecord({
      buyerWallet,
      sellerWallet,
      amount,
      asset,
      propertyAddress,
      conditions,
      isCrossChain: true
    });

    // 3. Deploy escrow contract on Ethereum
    const escrowContract = await deployPropertyEscrowContract({
      dealId,
      buyerAddress: buyerWallet.address, // Will be updated with bridge address
      sellerAddress: sellerWallet.address,
      amount,
      asset
    });

    // 4. Execute cross-chain deposit
    const depositResult = await crossChainService.executeCrossChainEscrowDeposit({
      dealId,
      buyerWallet,
      sellerWallet,
      amount,
      asset
    });

    res.status(201).json({
      message: 'Cross-chain escrow transaction created successfully',
      dealId,
      escrowContract: escrowContract.address,
      crossChainDeposit: depositResult,
      estimatedCompletionTime: '15-45 minutes'
    });

  } catch (error) {
    console.error('[CROSS-CHAIN] Error creating cross-chain transaction:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/release-cross-chain/:dealId', authenticateToken, async (req, res) => {
  try {
    const { dealId } = req.params;
    const { sellerWallet } = req.body;

    // 1. Verify deal is ready for release
    const deal = await getDeal(dealId);
    if (!canReleaseFunds(deal)) {
      return res.status(400).json({ error: 'Deal not ready for release' });
    }

    // 2. Execute cross-chain release
    const releaseResult = await crossChainService.executeCrossChainEscrowRelease({
      dealId,
      sellerWallet,
      amount: deal.amount
    });

    // 3. Update deal status
    await updateDealStatus(dealId, 'COMPLETED');

    res.json({
      message: 'Cross-chain release executed successfully',
      releaseResult,
      dealStatus: 'COMPLETED'
    });

  } catch (error) {
    console.error('[CROSS-CHAIN] Error releasing cross-chain funds:', error);
    res.status(500).json({ error: error.message });
  }
});
```

## Phase 6: Enhanced Wallet Routes Integration

### 6.1 Cross-Chain Wallet Detection

```javascript
// src/api/routes/wallet/walletRoutes.js (Enhanced)
router.post('/detect-cross-chain-capabilities', authenticateToken, async (req, res) => {
  try {
    const { walletAddresses } = req.body;
    
    const capabilities = await Promise.all(
      walletAddresses.map(async wallet => {
        const detection = await walletDetectionService.analyzeWallet(wallet);
        const bridgeSupport = await bridgeService.getBridgeSupport(wallet.network);
        
        return {
          ...wallet,
          ...detection,
          bridgeSupport,
          crossChainCompatible: bridgeSupport.length > 0
        };
      })
    );

    res.json({
      success: true,
      walletCapabilities: capabilities,
      recommendedBridges: await bridgeService.getRecommendedBridges(capabilities)
    });

  } catch (error) {
    console.error('[WALLET] Error detecting cross-chain capabilities:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/estimate-cross-chain-path', authenticateToken, async (req, res) => {
  try {
    const { buyerWallet, sellerWallet, amount, asset } = req.body;

    const path = await crossChainService.determineCrossChainPath(
      buyerWallet.network,
      'ethereum', // Escrow network
      sellerWallet.network
    );

    const totalFees = await crossChainService.estimateTotalFees(path, amount, asset);
    const timeEstimate = await crossChainService.estimateTotalTime(path);

    res.json({
      success: true,
      path,
      fees: totalFees,
      estimatedTime: timeEstimate,
      complexity: path.totalSteps
    });

  } catch (error) {
    console.error('[WALLET] Error estimating cross-chain path:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});
```

## Implementation Phases & Timeline

### **Phase 1: Dynamic Wallet Detection & LI.FI Foundation (Weeks 1-2)**
- [ ] Implement frontend EIP-6963 wallet detection service
- [ ] Enhance backend wallet detection endpoint with LI.FI compatibility
- [ ] Install and configure LI.FI SDK for bridge aggregation
- [ ] Create DynamicChainService that initializes from LI.FI supported chains
- [ ] Set up LiFiBridgeService for route finding
- [ ] Create AssetMappingService for token compatibility
- [ ] Add dynamic wallet capability analysis endpoint

### **Phase 2: Cross-Chain Coordination (Weeks 3-4)**
- [ ] Implement CrossChainCoordinator for route planning
- [ ] Add wallet compatibility validation
- [ ] Build cost and time estimation features
- [ ] Create confidence scoring for routes
- [ ] Add support for 40+ chains via LI.FI

### **Phase 3: Smart Contract Integration (Weeks 5-6)**
- [ ] Update escrow contracts for LI.FI bridge compatibility
- [ ] Implement bridge-aware deposit handling
- [ ] Add cross-chain release functionality with LI.FI
- [ ] Deploy and test on LI.FI supported testnets

### **Phase 4: Backend Service Integration (Weeks 7-8)**
- [ ] Enhanced crossChainService with LI.FI integration
- [ ] Update transaction routes for MetaMask SDK
- [ ] Add LI.FI transaction monitoring and status tracking
- [ ] Implement comprehensive error handling and retries

### **Phase 5: Testing & Production Readiness (Weeks 9-10)**
- [ ] Integration testing with MetaMask extension and mobile
- [ ] LI.FI route testing across multiple chains
- [ ] Load testing with LI.FI's production infrastructure
- [ ] Security audit focusing on MetaMask-LI.FI integration

## Security Considerations

### **Bridge Security**
- Validate all bridge transactions with multiple confirmations
- Implement timeout mechanisms for failed bridges
- Monitor bridge contract security status
- Maintain emergency pause functionality

### **Asset Protection**
- Verify wrapped asset legitimacy
- Implement slippage protection
- Add maximum transaction limits
- Monitor for bridge exploits

### **Transaction Integrity**
- Use cryptographic proofs for cross-chain verification
- Implement atomic transaction guarantees where possible
- Add dispute resolution for failed bridge transactions
- Maintain comprehensive audit trails

## Monitoring & Observability

### **Bridge Monitoring**
- Track bridge transaction success rates
- Monitor bridge fees and performance
- Alert on bridge downtime or issues
- Log all cross-chain transaction attempts

### **User Experience Tracking**
- Measure cross-chain transaction completion times
- Track user drop-off rates during bridge transactions
- Monitor gas fee fluctuations across networks
- Analyze most used bridge combinations

This plan provides a comprehensive roadmap for implementing real cross-chain transaction mediation using MetaMask SDK for wallet management and LI.FI for professional bridge aggregation, while maintaining the EVM-centric escrow architecture and leveraging proven, production-ready infrastructure. 