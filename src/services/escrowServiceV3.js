// src/services/escrowServiceV3.js
import { JsonRpcProvider, Wallet, Contract, parseEther, formatEther, parseUnits, formatUnits } from 'ethers';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs/promises';
import mockQuoter from './mockEndpointQuoter.js';
import config from '../config/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Unified service for all UniversalEscrowServiceV3 contract interactions
 * This service consolidates all escrow functionality into a single, maintainable interface
 * ONLY supports V3 contracts - no backward compatibility with V1/V2
 */
export class EscrowServiceV3 {
  constructor() {
    this.providers = new Map(); // chainId -> provider
    this.contracts = new Map(); // chainId -> contract instance
    this.wallets = new Map(); // chainId -> wallet
    this.abi = null;
    this.deploymentInfo = null;
    this.chainConfigs = null; // Will be initialized after config loads
  }

  async initializeChainConfigs() {
    if (this.chainConfigs) return; // Already initialized
    
    // Ensure config is initialized
    if (!config.isInitialized) {
      await config.initialize();
    }
    
    // Chain configurations
    this.chainConfigs = {
      // Arbitrum Sepolia
      421614: {
        name: 'arbitrum-sepolia',
        rpcUrl: config.get('ARBITRUM_SEPOLIA_RPC_URL') || config.get('RPC_URL'),
        contractAddress: process.env.ARBITRUM_SEPOLIA_V3_DISPUTES_CONTRACT || 
                        '0x56b2C2F53497B5b8E179521De50e29F78C943B57',
        layerZeroEndpointId: 40231,
        oftAdapter: process.env.ARBITRUM_SEPOLIA_OFT_ADAPTER || '0x4E958435343fcb22128546561E078942B74DFb4b',
        composer: null,
        weth: '0x980B62Da83eFf3D4576C647993b0c1D7faf17c73',
        uniswapRouter: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
        stargateRouter: '0x2a4C2F5ffB0E0F2dcB3f9EBBd442B8F77ECDB9Cc',
        stargateRouterETH: '0x771A4f8a880b499A40c8fF53c7925798E0f2E594',
        stargateChainId: 10231,
        explorerUrl: 'https://sepolia.arbiscan.io'
      },
      // Sepolia
      11155111: {
        name: 'sepolia',
        rpcUrl: config.get('RPC_URL'),
        contractAddress: process.env.SEPOLIA_V3_DISPUTES_CONTRACT || 
                        '0x607672971D94C336746bB6d1DC39E535631C9DDa',
        layerZeroEndpointId: 40161,
        oftAdapter: process.env.SEPOLIA_OFT_ADAPTER || '0x5277270f4F4F7e03439F2eCdb6d6632ED921bfF6',
        composer: '0x3e6d2247055683d53a16Fc935E24D30065a6DB05',
        weth: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14',
        uniswapRouter: '0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E',
        stargateRouter: '0x2836045A50744FB50D3d04a9C8D18aD7B5012102',
        stargateRouterETH: '0x676Fa8D37B948236aAcE03A0b34fc0Bc37FABA8D',
        stargateChainId: 10161,
        explorerUrl: 'https://sepolia.etherscan.io'
      },
      // Polygon Amoy
      80002: {
        name: 'polygon-amoy',
        rpcUrl: config.get('POLYGON_AMOY_RPC_URL') || config.get('RPC_URL'),
        contractAddress: '0x52e89b515E2636aA7bBe456e546878D0903E85f1',
        layerZeroEndpointId: 40267,
        oftAdapter: '0x746EF3c4C9c3f779Bc3558A5FF55C3f34ae20725',
        composer: '0xeE455345205F0Ab563f67307bF37E618180da05c',
        weth: '0x360ad4f9a9A8EFe9A8DCB5f461c4Cc1047E1Dcf9',
        uniswapRouter: '0x8954AfA98594b838bda56FE4C12a09D7739D179b',
        explorerUrl: 'https://amoy.polygonscan.com'
      }
    };
  }

  /**
   * Initialize the service with contract ABI
   */
  async initialize() {
    if (this.abi && this.chainConfigs) return; // Already initialized
    
    // Initialize chain configs first
    await this.initializeChainConfigs();
    
    try {
      // Try to load DisputesStargateOnly version first (production contract)
      let artifactPath = path.join(__dirname, '../contract/artifacts/contracts/UniversalEscrowServiceV3DisputesStargateOnly.sol/UniversalEscrowServiceV3DisputesStargateOnly.json');
      
      try {
        const disputesArtifact = await fs.readFile(artifactPath, 'utf8');
        const artifact = JSON.parse(disputesArtifact);
        this.abi = artifact.abi;
        this.contractVersion = 'DisputesStargateOnly';
        console.log('[EscrowServiceV3] Service initialized with DisputesStargateOnly ABI (Production)');
        return;
      } catch (disputesError) {
        // Try Enhanced Stargate version
        try {
          artifactPath = path.join(__dirname, '../contract/artifacts/contracts/UniversalEscrowServiceV3StargateEnhanced.sol/UniversalEscrowServiceV3StargateEnhanced.json');
          const enhancedArtifact = await fs.readFile(artifactPath, 'utf8');
          const artifact = JSON.parse(enhancedArtifact);
          this.abi = artifact.abi;
          this.contractVersion = 'StargateEnhanced';
          console.log('[EscrowServiceV3] Service initialized with Enhanced Stargate ABI');
          return;
        } catch (enhancedError) {
          // Try regular Stargate version
          try {
            artifactPath = path.join(__dirname, '../contract/artifacts/contracts/UniversalEscrowServiceV3Stargate.sol/UniversalEscrowServiceV3Stargate.json');
            const stargateArtifact = await fs.readFile(artifactPath, 'utf8');
            const artifact = JSON.parse(stargateArtifact);
            this.abi = artifact.abi;
            this.contractVersion = 'Stargate';
            console.log('[EscrowServiceV3] Service initialized with Stargate ABI');
            return;
          } catch (stargateError) {
            // Fallback to regular V3
            console.log('[EscrowServiceV3] Enhanced/Stargate versions not found, using regular V3');
          }
        }
      }
      
      // Load regular V3 contract ABI
      artifactPath = path.join(__dirname, '../contract/artifacts/contracts/UniversalEscrowServiceV3.sol/UniversalEscrowServiceV3.json');
      const artifactContent = await fs.readFile(artifactPath, 'utf8');
      const artifact = JSON.parse(artifactContent);
      this.abi = artifact.abi;
      this.contractVersion = 'Regular';
      
      console.log('[EscrowServiceV3] Service initialized with V3 ABI');
    } catch (error) {
      console.error('[EscrowServiceV3] Failed to load contract ABI:', error);
      throw new Error('Failed to initialize EscrowServiceV3');
    }
  }

  /**
   * Get or create provider for a specific chain
   */
  async getProvider(chainId) {
    if (this.providers.has(chainId)) {
      return this.providers.get(chainId);
    }

    const config = this.chainConfigs[chainId];
    if (!config) {
      throw new Error(`Chain ${chainId} not supported`);
    }

    if (!config.rpcUrl) {
      throw new Error(`RPC URL not configured for chain ${chainId}`);
    }

    const provider = new JsonRpcProvider(config.rpcUrl);
    this.providers.set(chainId, provider);
    
    // Verify connection
    try {
      await provider.getBlockNumber();
      console.log(`[EscrowServiceV3] Connected to ${config.name}`);
    } catch (error) {
      this.providers.delete(chainId);
      throw new Error(`Failed to connect to ${config.name}: ${error.message}`);
    }

    return provider;
  }

  /**
   * Get or create wallet for a specific chain
   */
  async getWallet(chainId, privateKey = null) {
    // Ensure config is initialized
    if (!config.isInitialized) {
      await config.initialize();
    }
    
    const key = privateKey || config.get('BACKEND_WALLET_PRIVATE_KEY');
    if (!key) {
      throw new Error('No private key provided');
    }

    if (this.wallets.has(chainId) && !privateKey) {
      return this.wallets.get(chainId);
    }

    const provider = await this.getProvider(chainId);
    const wallet = new Wallet(key, provider);
    
    if (!privateKey) {
      this.wallets.set(chainId, wallet);
    }

    return wallet;
  }

  /**
   * Get contract instance for a specific chain
   */
  async getContract(chainId, signerPrivateKey = null) {
    await this.initialize();
    
    const config = this.chainConfigs[chainId];
    if (!config) {
      throw new Error(`Chain ${chainId} not supported`);
    }

    const signer = signerPrivateKey 
      ? await this.getWallet(chainId, signerPrivateKey)
      : await this.getProvider(chainId);

    return new Contract(config.contractAddress, this.abi, signer);
  }

  /**
   * Deploy a new V3 escrow contract (if needed for new chains)
   */
  async deployContract(chainId, serviceWallet, weth, uniswapRouter) {
    // For V3, we don't deploy per-transaction
    // This method would only be used for initial chain setup
    throw new Error('V3 contracts are deployed once per chain, not per transaction');
  }

  /**
   * Create a new escrow
   */
  async createEscrow(params) {
    const {
      chainId,
      seller,
      depositToken = '0x0000000000000000000000000000000000000000', // ETH by default
      amount,
      targetToken = depositToken,
      targetChainId = chainId,
      signerPrivateKey = null
    } = params;

    const contract = await this.getContract(chainId, signerPrivateKey);
    
    // Prepare transaction
    const value = depositToken === '0x0000000000000000000000000000000000000000' 
      ? parseEther(amount.toString())
      : 0n;

    const tx = await contract.createEscrow(
      seller,
      depositToken,
      parseEther(amount.toString()),
      targetToken,
      targetChainId,
      { value }
    );

    const receipt = await tx.wait();
    
    // Extract escrow ID from events
    let escrowId;
    for (const log of receipt.logs) {
      try {
        const parsed = contract.interface.parseLog(log);
        if (parsed && parsed.name === 'EscrowCreated') {
          escrowId = parsed.args.escrowId;
          break;
        }
      } catch {}
    }

    return {
      txHash: receipt.hash,
      escrowId,
      contractAddress: contract.target,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed.toString()
    };
  }

  /**
   * Update escrow condition
   */
  async updateCondition(chainId, escrowId, conditionMet, signerPrivateKey = null) {
    const contract = await this.getContract(chainId, signerPrivateKey);
    
    const tx = await contract.updateCondition(escrowId, conditionMet);
    const receipt = await tx.wait();

    return {
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed.toString()
    };
  }

  /**
   * Release an escrow
   */
  async releaseEscrow(chainId, escrowId, value = 0n, signerPrivateKey = null) {
    const contract = await this.getContract(chainId, signerPrivateKey);
    
    const tx = await contract.releaseEscrow(escrowId, { value });
    const receipt = await tx.wait();

    // Extract release details from events
    let releaseInfo = {};
    for (const log of receipt.logs) {
      try {
        const parsed = contract.interface.parseLog(log);
        if (parsed && parsed.name === 'EscrowReleased') {
          releaseInfo = {
            method: parsed.args.method,
            isCompose: parsed.args.isCompose
          };
        } else if (parsed && parsed.name === 'CrossChainTransferInitiated') {
          releaseInfo.guid = parsed.args.guid;
          releaseInfo.targetChainId = parsed.args.targetChainId.toString();
        }
      } catch {}
    }

    return {
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed.toString(),
      ...releaseInfo
    };
  }

  // Note: V3 contract does not have cancelEscrow function
  // Escrows can only be released when conditions are met

  /**
   * Calculate 2% service fee
   */
  calculateServiceFee(amount) {
    const amountBN = parseEther(amount.toString());
    const fee = amountBN * 200n / 10000n; // 2%
    return formatEther(fee);
  }

  /**
   * Check if OFT adapter has peer configured for target chain
   */
  async checkOFTPeer(sourceChainId, targetChainId) {
    const sourceConfig = this.chainConfigs[sourceChainId];
    const targetConfig = this.chainConfigs[targetChainId];
    
    if (!sourceConfig || !targetConfig) {
      throw new Error('Invalid chain configuration');
    }

    const provider = await this.getProvider(sourceChainId);
    const oftAbi = [
      'function peers(uint32 eid) view returns (bytes32)'
    ];
    const oft = new Contract(sourceConfig.oftAdapter, oftAbi, provider);

    try {
      const peer = await oft.peers(targetConfig.layerZeroEndpointId);
      const isZeroAddress = peer === '0x' + '00'.repeat(32);
      console.log(`[EscrowServiceV3] Peer check ${sourceConfig.name} -> ${targetConfig.name}: ${peer} (configured: ${!isZeroAddress})`);
      return !isZeroAddress;
    } catch (error) {
      console.error('[EscrowServiceV3] Error checking OFT peer:', error);
      return false;
    }
  }

  /**
   * Quote cross-chain fee directly from LayerZero endpoint
   * This method doesn't require OFT adapter peers to be configured
   */
  async quoteDirectFromEndpoint(sourceChainId, targetChainId, amount) {
    const sourceConfig = this.chainConfigs[sourceChainId];
    const targetConfig = this.chainConfigs[targetChainId];
    
    if (!sourceConfig || !targetConfig) {
      throw new Error('Invalid chain configuration');
    }

    const provider = await this.getProvider(sourceChainId);
    
    // Get the LayerZero endpoint address from OFT adapter
    const oftAbi = ['function endpoint() view returns (address)'];
    const oft = new Contract(sourceConfig.oftAdapter, oftAbi, provider);
    let endpointAddress;
    
    try {
      endpointAddress = await oft.endpoint();
    } catch (error) {
      console.error('[EscrowServiceV3] Failed to get endpoint address:', error);
      // Use known endpoint addresses as fallback
      const knownEndpoints = {
        11155111: '0x6EDCE65403992e310A62460808c4b910D972f10f', // Sepolia
        421614: '0x6EDCE65403992e310A62460808c4b910D972f10f', // Arbitrum Sepolia
        80002: '0x6EDCE65403992e310A62460808c4b910D972f10f' // Polygon Amoy
      };
      endpointAddress = knownEndpoints[sourceChainId];
      if (!endpointAddress) {
        throw new Error('Could not determine LayerZero endpoint address');
      }
    }
    
    // LayerZero V2 endpoint ABI for quote function
    const endpointAbi = [
      {
        "inputs": [
          {
            "components": [
              {"internalType": "uint32", "name": "dstEid", "type": "uint32"},
              {"internalType": "bytes32", "name": "receiver", "type": "bytes32"},
              {"internalType": "bytes", "name": "message", "type": "bytes"},
              {"internalType": "bytes", "name": "options", "type": "bytes"},
              {"internalType": "bool", "name": "payInLzToken", "type": "bool"}
            ],
            "internalType": "struct MessagingParams",
            "name": "_params",
            "type": "tuple"
          },
          {"internalType": "address", "name": "_sender", "type": "address"}
        ],
        "name": "quote",
        "outputs": [
          {
            "components": [
              {"internalType": "uint256", "name": "nativeFee", "type": "uint256"},
              {"internalType": "uint256", "name": "lzTokenFee", "type": "uint256"}
            ],
            "internalType": "struct MessagingFee",
            "name": "fee",
            "type": "tuple"
          }
        ],
        "stateMutability": "view",
        "type": "function"
      }
    ];
    
    const endpoint = new Contract(endpointAddress, endpointAbi, provider);
    
    // Build options for gas limit
    const gasLimit = 200000n;
    const value = 0n;
    
    // Type 3 = ExecutorLzReceiveOption
    const optionType = '03';
    const gasBytes = gasLimit.toString(16).padStart(32, '0');
    const valueBytes = value.toString(16).padStart(32, '0');
    const optionData = gasBytes + valueBytes;
    const optionLength = (optionData.length / 2).toString(16).padStart(4, '0');
    const options = '0x' + optionType + optionLength + optionData;
    
    // Create a simple message payload (empty for quote)
    const message = '0x';
    
    // Build messaging params
    const messagingParams = {
      dstEid: targetConfig.layerZeroEndpointId,
      receiver: '0x' + targetConfig.contractAddress.slice(2).padStart(64, '0'),
      message: message,
      options: options,
      payInLzToken: false
    };
    
    try {
      console.log('[EscrowServiceV3] Quoting from endpoint:', endpointAddress);
      console.log('[EscrowServiceV3] Messaging params:', {
        dstEid: messagingParams.dstEid,
        receiver: messagingParams.receiver,
        sender: sourceConfig.oftAdapter
      });
      
      // Quote from the endpoint directly
      const fee = await endpoint.quote(messagingParams, sourceConfig.oftAdapter);
      
      return {
        nativeFee: formatEther(fee.nativeFee || fee[0]),
        zroFee: formatEther(fee.lzTokenFee || fee[1] || 0n),
        recommended: formatEther((fee.nativeFee || fee[0]) * 3n) // 3x buffer
      };
    } catch (error) {
      console.error('[EscrowServiceV3] Direct endpoint quote error:', error);
      
      // Common testnet issues:
      // - 0x41705130: Endpoint configuration error
      // - Contract not registered with endpoint
      // - Missing DVN (Decentralized Verifier Network) configuration
      
      // Fallback to a reasonable default for testing
      return {
        nativeFee: '0.001',
        zroFee: '0',
        recommended: '0.003',
        warning: 'Using default quote due to testnet configuration'
      };
    }
  }

  /**
   * Quote cross-chain fee with Stargate support
   */
  async quoteCrossChainFee(sourceChainId, targetChainId, amount, options = {}) {
    const sourceConfig = this.chainConfigs[sourceChainId];
    const targetConfig = this.chainConfigs[targetChainId];
    
    if (!sourceConfig || !targetConfig) {
      throw new Error('Invalid chain configuration');
    }

    // Same chain - no cross-chain fee
    if (sourceChainId === targetChainId) {
      return {
        nativeFee: '0',
        zroFee: '0',
        recommended: '0',
        isSameChain: true
      };
    }
    
    // Try Stargate quote first if available
    if ((this.contractVersion === 'Stargate' || this.contractVersion === 'StargateEnhanced') && sourceConfig.stargateRouter) {
      try {
        return await this.quoteStargateTransfer(sourceChainId, targetChainId, amount);
      } catch (error) {
        console.log('[EscrowServiceV3] Stargate quote failed, falling back to LayerZero:', error.message);
      }
    }

    const { preferEndpoint = true, verbose = false } = options;

    if (verbose) {
      console.log(`[EscrowServiceV3] Quoting fee: ${sourceConfig.name} (${sourceChainId}) -> ${targetConfig.name} (${targetChainId})`);
      console.log(`[EscrowServiceV3] Source endpoint: ${sourceConfig.layerZeroEndpointId}, Target endpoint: ${targetConfig.layerZeroEndpointId}`);
    }
    
    // Production strategy: Try multiple methods in order of preference
    const methods = [
      { 
        name: 'OFT Adapter Quote',
        enabled: !preferEndpoint,
        func: () => this.quoteViaOFTAdapter(sourceChainId, targetChainId, amount)
      },
      {
        name: 'Direct Endpoint Quote',
        enabled: true,
        func: () => this.quoteDirectFromEndpoint(sourceChainId, targetChainId, amount)
      },
      {
        name: 'Fallback Estimate',
        enabled: true,
        func: () => this.getFallbackQuote(sourceChainId, targetChainId, amount)
      }
    ];
    
    for (const method of methods) {
      if (!method.enabled) continue;
      
      try {
        if (verbose) console.log(`[EscrowServiceV3] Trying ${method.name}...`);
        const result = await method.func();
        
        // Validate result
        if (result && result.nativeFee && parseFloat(result.nativeFee) > 0) {
          if (verbose) console.log(`[EscrowServiceV3] ${method.name} succeeded`);
          return { ...result, method: method.name };
        }
      } catch (error) {
        if (verbose) console.error(`[EscrowServiceV3] ${method.name} failed:`, error.message);
      }
    }
    
    // If all methods fail, return a conservative estimate
    return this.getFallbackQuote(sourceChainId, targetChainId, amount);
  }

  /**
   * Quote via OFT adapter (requires peers to be configured)
   */
  async quoteViaOFTAdapter(sourceChainId, targetChainId, amount) {
    const sourceConfig = this.chainConfigs[sourceChainId];
    const targetConfig = this.chainConfigs[targetChainId];
    
    // Check if peer is configured
    const hasPeer = await this.checkOFTPeer(sourceChainId, targetChainId);
    if (!hasPeer) {
      throw new Error(`No peer configured for ${targetConfig.name} on ${sourceConfig.name} OFT adapter`);
    }

    // Get OFT adapter contract
    const provider = await this.getProvider(sourceChainId);
    // Load the proper ABI from deployment artifact
    const oftAbi = [
      {
        "inputs": [
          {
            "components": [
              {"internalType": "uint32", "name": "dstEid", "type": "uint32"},
              {"internalType": "bytes32", "name": "to", "type": "bytes32"},
              {"internalType": "uint256", "name": "amountLD", "type": "uint256"},
              {"internalType": "uint256", "name": "minAmountLD", "type": "uint256"},
              {"internalType": "bytes", "name": "extraOptions", "type": "bytes"},
              {"internalType": "bytes", "name": "composeMsg", "type": "bytes"},
              {"internalType": "bytes", "name": "oftCmd", "type": "bytes"}
            ],
            "internalType": "struct SendParam",
            "name": "_sendParam",
            "type": "tuple"
          },
          {"internalType": "bool", "name": "_payInLzToken", "type": "bool"}
        ],
        "name": "quoteSend",
        "outputs": [
          {
            "components": [
              {"internalType": "uint256", "name": "nativeFee", "type": "uint256"},
              {"internalType": "uint256", "name": "lzTokenFee", "type": "uint256"}
            ],
            "internalType": "struct MessagingFee",
            "name": "msgFee",
            "type": "tuple"
          }
        ],
        "stateMutability": "view",
        "type": "function"
      }
    ];
    const oft = new Contract(sourceConfig.oftAdapter, oftAbi, provider);

    // Encode extra options for LayerZero V2
    // For quotes, we need to specify the gas limit for the lzReceive call
    // Options format: type (1 byte) + length (2 bytes) + gas (16 bytes) + value (16 bytes)
    const gasLimit = 200000n;
    const value = 0n;
    
    // Type 3 = ExecutorLzReceiveOption
    const optionType = '03';
    const gasBytes = gasLimit.toString(16).padStart(32, '0');
    const valueBytes = value.toString(16).padStart(32, '0');
    const optionData = gasBytes + valueBytes;
    const optionLength = (optionData.length / 2).toString(16).padStart(4, '0');
    
    const extraOptions = '0x' + optionType + optionLength + optionData;
    
    // Prepare send parameters as a struct
    const sendParam = {
      dstEid: targetConfig.layerZeroEndpointId, // Destination endpoint ID  
      to: '0x' + targetConfig.contractAddress.slice(2).padStart(64, '0'), // Target escrow contract as bytes32
      amountLD: parseEther(amount.toString()), // Amount in local decimals
      minAmountLD: parseEther(amount.toString()) * 98n / 100n, // Min amount (2% slippage)
      extraOptions: extraOptions, // Extra LayerZero options with gas limit
      composeMsg: '0x', // No compose message needed
      oftCmd: '0x'  // No OFT command needed
    };
    
    console.log('[EscrowServiceV3] SendParam:', {
      dstEid: sendParam.dstEid,
      to: sendParam.to,
      amountLD: sendParam.amountLD.toString(),
      minAmountLD: sendParam.minAmountLD.toString(),
      extraOptions: sendParam.extraOptions,
      composeMsg: sendParam.composeMsg,
      oftCmd: sendParam.oftCmd
    });

    try {
      const msgFee = await oft.quoteSend(sendParam, false);
      // The result is a struct with nativeFee and lzTokenFee
      return {
        nativeFee: formatEther(msgFee.nativeFee || msgFee[0]),
        zroFee: formatEther(msgFee.lzTokenFee || msgFee[1] || 0n),
        recommended: formatEther((msgFee.nativeFee || msgFee[0]) * 3n) // 3x buffer for safety
      };
    } catch (error) {
      console.error('[EscrowServiceV3] Quote error:', error);
      
      // Decode the NoPeer error if present
      if (error.data && error.data.startsWith('0x6592671c')) {
        // Extract the uint32 parameter from error data
        const errorData = error.data.slice(10); // Remove selector
        const endpointId = errorData.length >= 64 ? parseInt('0x' + errorData.slice(56, 64), 16) : 0;
        console.error(`[EscrowServiceV3] NoPeer error for endpoint ID: ${endpointId}`);
        
        if (endpointId === 0) {
          console.error('[EscrowServiceV3] Endpoint ID 0 suggests the OFT adapter may not be properly initialized');
          console.error('[EscrowServiceV3] This could mean:');
          console.error('  1. The OFT adapter needs initialization');
          console.error('  2. The adapter is looking up its own endpoint ID and finding 0');
          console.error('  3. There\'s a configuration issue with the LayerZero endpoint');
        }
      }
      
      // Check if it's a known testnet issue
      if (error.code === 'CALL_EXCEPTION' && error.data) {
        console.error('[EscrowServiceV3] OFT adapter error - this may be due to testnet configuration');
        // Return a default quote for testing purposes
        return {
          nativeFee: '0.001',
          zroFee: '0',
          recommended: '0.003',
          error: 'OFT adapter not configured on testnet'
        };
      }
      throw new Error(`Failed to quote cross-chain fee: ${error.message}`);
    }
  }

  /**
   * Get fallback quote using mock quoter
   */
  async getFallbackQuote(sourceChainId, targetChainId, amount) {
    // Use the mock quoter for more accurate estimates
    return mockQuoter.getStaticQuote(sourceChainId, targetChainId, amount);
  }

  /**
   * Estimate total fees for a transaction with Stargate support
   */
  async estimateTotalFees(params) {
    const { amount, sourceChainId, targetChainId, requiresSwap } = params;
    
    const serviceFee = this.calculateServiceFee(amount);
    let crossChainFee = '0';
    let gasEstimate = '0.001'; // Default estimate
    let method = 'direct';

    // Cross-chain fee if different chains
    if (sourceChainId !== targetChainId) {
      const quote = await this.quoteCrossChainFee(sourceChainId, targetChainId, amount);
      crossChainFee = quote.recommended;
      method = quote.method || 'LayerZero';
      gasEstimate = method === 'Stargate' ? '0.0015' : '0.002'; // Stargate is more efficient
    }

    // Additional gas for swaps
    if (requiresSwap) {
      gasEstimate = (parseFloat(gasEstimate) + 0.001).toString();
    }

    return {
      serviceFee,
      crossChainFee,
      gasEstimate,
      method,
      isEnhanced: this.contractVersion === 'StargateEnhanced',
      total: (parseFloat(serviceFee) + parseFloat(crossChainFee) + parseFloat(gasEstimate)).toFixed(6)
    };
  }
  
  /**
   * Create escrow with enhanced token support
   */
  async createEscrowEnhanced(params) {
    const {
      chainId,
      seller,
      depositToken = '0x0000000000000000000000000000000000000000',
      amount,
      targetToken = depositToken,
      targetChainId = chainId,
      signerPrivateKey = null
    } = params;
    
    // Check if enhanced contract is available
    if (this.contractVersion !== 'StargateEnhanced') {
      console.log('[EscrowServiceV3] Enhanced features not available, falling back to regular createEscrow');
      return this.createEscrow(params);
    }
    
    // Enhanced validation for token support
    if (targetChainId !== chainId) {
      const isSourceSupported = await this.isStargateAvailable(chainId, targetChainId, depositToken);
      const isTargetSupported = await this.isStargateAvailable(chainId, targetChainId, targetToken);
      
      if (!isSourceSupported && !isTargetSupported) {
        console.log('[EscrowServiceV3] Neither source nor target token supported by Stargate, may require conversion');
      }
    }
    
    // Use regular createEscrow with enhanced contract
    return this.createEscrow(params);
  }

  /**
   * Get token information
   */
  async getTokenInfo(tokenAddress, chainId) {
    if (tokenAddress === '0x0000000000000000000000000000000000000000') {
      return {
        symbol: 'ETH',
        decimals: 18,
        name: 'Ether'
      };
    }

    const provider = await this.getProvider(chainId);
    const erc20Abi = [
      'function symbol() view returns (string)',
      'function decimals() view returns (uint8)',
      'function name() view returns (string)'
    ];
    
    const token = new Contract(tokenAddress, erc20Abi, provider);
    
    try {
      const [symbol, decimals, name] = await Promise.all([
        token.symbol(),
        token.decimals(),
        token.name()
      ]);
      
      return { symbol, decimals, name };
    } catch (error) {
      throw new Error(`Failed to get token info: ${error.message}`);
    }
  }

  /**
   * Quote Uniswap swap
   */
  async quoteSwap(fromToken, toToken, amount, chainId) {
    const config = this.chainConfigs[chainId];
    if (!config) {
      throw new Error(`Chain ${chainId} not supported`);
    }

    const provider = await this.getProvider(chainId);
    const routerAbi = [
      'function getAmountsOut(uint,address[]) view returns (uint[])'
    ];
    const router = new Contract(config.uniswapRouter, routerAbi, provider);

    const path = [
      fromToken === '0x0000000000000000000000000000000000000000' ? config.weth : fromToken,
      toToken === '0x0000000000000000000000000000000000000000' ? config.weth : toToken
    ];

    try {
      const amounts = await router.getAmountsOut(parseEther(amount.toString()), path);
      return {
        amountIn: formatEther(amounts[0]),
        amountOut: formatEther(amounts[amounts.length - 1]),
        path
      };
    } catch (error) {
      throw new Error(`Failed to quote swap: ${error.message}`);
    }
  }

  /**
   * Get supported tokens for a chain (simplified for now)
   */
  async getSupportedTokens(chainId) {
    const config = this.chainConfigs[chainId];
    if (!config) {
      throw new Error(`Chain ${chainId} not supported`);
    }

    // Return common tokens - in production, this would query from a token list
    return [
      {
        address: '0x0000000000000000000000000000000000000000',
        symbol: 'ETH',
        decimals: 18,
        name: 'Ether'
      },
      {
        address: config.weth,
        symbol: 'WETH',
        decimals: 18,
        name: 'Wrapped Ether'
      }
      // Add more tokens as needed
    ];
  }

  /**
   * Get OFT adapter address for a chain
   */
  getOFTAdapter(chainId) {
    const config = this.chainConfigs[chainId];
    return config ? config.oftAdapter : null;
  }

  /**
   * Get composer address for a chain
   */
  getComposer(chainId) {
    const config = this.chainConfigs[chainId];
    return config ? config.composer : null;
  }

  /**
   * Track LayerZero transfer by GUID
   */
  async trackLayerZeroTransfer(guid) {
    // In production, this would query LayerZero Scan API
    return {
      guid,
      status: 'pending',
      scanUrl: `https://layerzeroscan.com/tx/${guid}`
    };
  }

  /**
   * Get LayerZero endpoint ID for a chain
   */
  getLayerZeroEndpointId(chainId) {
    const config = this.chainConfigs[chainId];
    return config ? config.layerZeroEndpointId : null;
  }

  /**
   * Get escrow details
   */
  async getEscrowDetails(chainId, escrowId) {
    const contract = await this.getContract(chainId);
    
    try {
      const escrow = await contract.escrows(escrowId);
      
      return {
        buyer: escrow.buyer,
        seller: escrow.seller,
        depositToken: escrow.depositToken,
        targetToken: escrow.targetToken,
        depositAmount: formatEther(escrow.depositAmount),
        netAmount: formatEther(escrow.netAmount),
        serviceFee: formatEther(escrow.serviceFee),
        targetChainId: escrow.targetChainId.toString(),
        conditionMet: escrow.conditionMet,
        released: escrow.released
      };
    } catch (error) {
      throw new Error(`Failed to get escrow details: ${error.message}`);
    }
  }

  /**
   * Check if escrow is released
   */
  async isEscrowReleased(chainId, escrowId) {
    const details = await this.getEscrowDetails(chainId, escrowId);
    return details.released;
  }

  /**
   * Get chain configuration
   */
  getChainConfig(chainId) {
    return this.chainConfigs[chainId] || null;
  }

  /**
   * Get all supported chains
   */
  getSupportedChains() {
    return Object.entries(this.chainConfigs).map(([chainId, config]) => ({
      chainId: parseInt(chainId),
      name: config.name,
      contractAddress: config.contractAddress,
      oftAdapter: config.oftAdapter,
      layerZeroEndpointId: config.layerZeroEndpointId,
      explorerUrl: config.explorerUrl
    }));
  }

  /**
   * Get explorer URL for a transaction
   */
  getExplorerUrl(chainId, txHash) {
    const config = this.chainConfigs[chainId];
    if (!config) return null;
    
    return `${config.explorerUrl}/tx/${txHash}`;
  }

  /**
   * Get peer configuration instructions for OFT adapters
   */
  async getOFTPeerSetupInstructions() {
    const instructions = [];
    const chainIds = Object.keys(this.chainConfigs).map(id => parseInt(id));
    
    for (const sourceChainId of chainIds) {
      const sourceConfig = this.chainConfigs[sourceChainId];
      
      for (const targetChainId of chainIds) {
        if (sourceChainId === targetChainId) continue;
        
        const targetConfig = this.chainConfigs[targetChainId];
        const hasPeer = await this.checkOFTPeer(sourceChainId, targetChainId);
        
        if (!hasPeer) {
          // Convert target OFT adapter address to bytes32
          const peerBytes32 = '0x' + targetConfig.oftAdapter.slice(2).padStart(64, '0');
          
          instructions.push({
            chain: sourceConfig.name,
            oftAdapter: sourceConfig.oftAdapter,
            targetChain: targetConfig.name,
            targetEndpointId: targetConfig.layerZeroEndpointId,
            targetPeer: peerBytes32,
            command: `setPeer(${targetConfig.layerZeroEndpointId}, "${peerBytes32}")`
          });
        }
      }
    }
    
    return instructions;
  }
  
  /**
   * Quote Stargate transfer fee
   */
  async quoteStargateTransfer(sourceChainId, targetChainId, amount, tokenAddress = null) {
    const contract = await this.getContract(sourceChainId);
    
    try {
      let quote;
      
      if (this.contractVersion === 'StargateEnhanced' && tokenAddress) {
        // Use enhanced quote with token address
        quote = await contract.getStargateQuote(targetChainId, tokenAddress, parseEther(amount.toString()));
      } else {
        // Use backward compatible quote (ETH only)
        quote = await contract.getStargateQuote(targetChainId, parseEther(amount.toString()));
      }
      
      return {
        nativeFee: formatEther(quote.fee),
        zroFee: '0',
        recommended: formatEther(quote.fee),
        method: 'Stargate',
        minAmountOut: formatEther(quote.minAmountOut)
      };
    } catch (error) {
      throw new Error(`Stargate quote failed: ${error.message}`);
    }
  }
  
  /**
   * Check if Stargate is available for cross-chain transfer
   */
  async isStargateAvailable(sourceChainId, targetChainId, tokenAddress = null) {
    if (this.contractVersion !== 'Stargate' && this.contractVersion !== 'StargateEnhanced') return false;
    
    const sourceConfig = this.chainConfigs[sourceChainId];
    if (!sourceConfig || !sourceConfig.stargateRouter) return false;
    
    try {
      const contract = await this.getContract(sourceChainId);
      
      if (this.contractVersion === 'StargateEnhanced' && tokenAddress) {
        // Use enhanced availability check with token address
        return await contract.isStargateAvailable(targetChainId, tokenAddress);
      } else {
        // Use backward compatible check or chain-level check
        if (contract.isStargateAvailableForChain) {
          return await contract.isStargateAvailableForChain(targetChainId);
        } else {
          return await contract.isStargateAvailable(targetChainId);
        }
      }
    } catch (error) {
      console.error('[EscrowServiceV3] Error checking Stargate availability:', error);
      return false;
    }
  }
  
  /**
   * Get transfer options for a target chain
   */
  async getTransferOptions(sourceChainId, targetChainId) {
    if (this.contractVersion !== 'Stargate' && this.contractVersion !== 'StargateEnhanced') {
      // Regular V3 contract
      return {
        sameChain: sourceChainId === targetChainId,
        hasLayerZero: this.chainConfigs[targetChainId]?.layerZeroEndpointId ? true : false,
        hasStargate: false,
        preferredMode: 'LayerZero OFT'
      };
    }
    
    try {
      const contract = await this.getContract(sourceChainId);
      const options = await contract.getTransferOptions(targetChainId);
      
      const modeNames = ['DISABLED', 'LAYERZERO_OFT', 'STARGATE'];
      
      return {
        sameChain: options.sameChain,
        hasLayerZero: options.hasLayerZero,
        hasStargate: options.hasStargate,
        preferredMode: modeNames[options.preferredMode] || 'UNKNOWN'
      };
    } catch (error) {
      console.error('[EscrowServiceV3] Error getting transfer options:', error);
      return {
        sameChain: sourceChainId === targetChainId,
        hasLayerZero: false,
        hasStargate: false,
        preferredMode: 'ERROR'
      };
    }
  }
  
  /**
   * Get supported Stargate tokens for a chain (Enhanced version only)
   */
  async getSupportedStargateTokens(chainId) {
    if (this.contractVersion !== 'StargateEnhanced') {
      return {
        tokens: [],
        configs: [],
        error: 'Enhanced Stargate contract required'
      };
    }
    
    try {
      const contract = await this.getContract(chainId);
      const [tokens, configs] = await contract.getSupportedStargateTokens(chainId);
      
      return {
        tokens: tokens.map(addr => addr === '0x0000000000000000000000000000000000000000' ? 'ETH' : addr),
        configs: configs.map(config => ({
          address: config.tokenAddress,
          poolId: config.poolId.toString(),
          isNative: config.isNative,
          supported: config.supported
        })),
        error: null
      };
    } catch (error) {
      console.error('[EscrowServiceV3] Error getting supported tokens:', error);
      return {
        tokens: [],
        configs: [],
        error: error.message
      };
    }
  }
  
  /**
   * Get service version information
   */
  getServiceInfo() {
    const isStargateCapable = this.contractVersion === 'Stargate' || this.contractVersion === 'StargateEnhanced';
    const isEnhanced = this.contractVersion === 'StargateEnhanced';
    
    return {
      version: 'V3',
      contractVersion: this.contractVersion || 'Unknown',
      supportedFeatures: {
        sameChainDirect: true,
        sameChainSwap: true,
        crossChainLayerZero: true,
        crossChainStargate: isStargateCapable,
        multiTokenStargate: isEnhanced,
        intelligentRouting: isEnhanced,
        uniswapV2Integration: isEnhanced
      },
      supportedTokens: isEnhanced ? {
        native: ['ETH'],
        erc20: ['USDC', 'USDT'],
        configurable: true
      } : {
        native: ['ETH'],
        erc20: [],
        configurable: false
      },
      transactionTypes: [
        'Same-chain, same-token (direct transfer)',
        'Same-chain, different-token (Uniswap swap)',
        isStargateCapable ? 'Cross-chain (Stargate bridge)' : 'Cross-chain (LayerZero OFT)'
      ],
      supportedChains: this.getSupportedChains()
    };
  }

  /**
   * Raise a dispute for an escrow
   * @param {string} escrowId - The escrow ID
   * @param {string} reason - The reason for the dispute
   * @param {object} options - Additional options
   * @returns {Promise<object>} Transaction result
   */
  async raiseDispute(escrowId, reason, options = {}) {
    const { chainId, contractAddress } = options;
    
    if (!chainId || !contractAddress) {
      throw new Error('Chain ID and contract address required for dispute');
    }

    const provider = await this.getProvider(chainId);
    const signer = await this.getSigner(chainId);
    
    // Get contract instance
    // Use the already loaded ABI from initialization
    const contractABI = this.abi;
    const contract = new Contract(contractAddress, contractABI, signer);

    // Raise dispute
    const tx = await contract.raiseDispute(escrowId, reason);
    const receipt = await tx.wait();

    return {
      success: true,
      transactionHash: tx.hash,
      blockNumber: receipt.blockNumber,
      events: receipt.logs
    };
  }

  /**
   * Resolve a dispute
   * @param {string} escrowId - The escrow ID
   * @param {boolean} releaseFunds - Whether to release funds to seller
   * @param {object} options - Additional options
   * @returns {Promise<object>} Transaction result
   */
  async resolveDispute(escrowId, releaseFunds, options = {}) {
    const { chainId, contractAddress } = options;
    
    if (!chainId || !contractAddress) {
      throw new Error('Chain ID and contract address required for dispute resolution');
    }

    const signer = await this.getSigner(chainId);
    
    // Get contract instance
    // Use the already loaded ABI from initialization
    const contractABI = this.abi;
    const contract = new Contract(contractAddress, contractABI, signer);

    // Resolve dispute
    const tx = await contract.resolveDispute(escrowId, releaseFunds);
    const receipt = await tx.wait();

    return {
      success: true,
      transactionHash: tx.hash,
      blockNumber: receipt.blockNumber,
      events: receipt.logs
    };
  }

  /**
   * Get dispute information
   * @param {string} escrowId - The escrow ID
   * @param {object} options - Additional options
   * @returns {Promise<object>} Dispute information
   */
  async getDisputeInfo(escrowId, options = {}) {
    const { chainId, contractAddress } = options;
    
    if (!chainId || !contractAddress) {
      throw new Error('Chain ID and contract address required');
    }

    const provider = await this.getProvider(chainId);
    
    // Get contract instance
    // Use the already loaded ABI from initialization
    const contractABI = this.abi;
    const contract = new Contract(contractAddress, contractABI, provider);

    // Get dispute info
    const disputeInfo = await contract.getDisputeInfo(escrowId);

    return {
      disputeRaised: disputeInfo[0],
      disputeRaisedBy: disputeInfo[1],
      disputeRaisedTimestamp: disputeInfo[2].toString(),
      disputeResolved: disputeInfo[3],
      disputeReason: disputeInfo[4],
      conditionMetTimestamp: disputeInfo[5].toString()
    };
  }

  /**
   * Check if escrow can be released
   * @param {string} escrowId - The escrow ID
   * @param {object} options - Additional options
   * @returns {Promise<object>} Release status
   */
  async canReleaseEscrow(escrowId, options = {}) {
    const { chainId, contractAddress } = options;
    
    if (!chainId || !contractAddress) {
      throw new Error('Chain ID and contract address required');
    }

    const provider = await this.getProvider(chainId);
    
    // Get contract instance
    // Use the already loaded ABI from initialization
    const contractABI = this.abi;
    const contract = new Contract(contractAddress, contractABI, provider);

    // Check if can release
    const [canRelease, reason] = await contract.canReleaseEscrow(escrowId);

    return {
      canRelease,
      reason
    };
  }

  /**
   * Return funds after dispute timeout
   * @param {string} escrowId - The escrow ID
   * @param {object} options - Additional options
   * @returns {Promise<object>} Transaction result
   */
  async returnFundsAfterDisputeTimeout(escrowId, options = {}) {
    const { chainId, contractAddress } = options;
    
    if (!chainId || !contractAddress) {
      throw new Error('Chain ID and contract address required');
    }

    const signer = await this.getSigner(chainId);
    
    // Get contract instance
    // Use the already loaded ABI from initialization
    const contractABI = this.abi;
    const contract = new Contract(contractAddress, contractABI, signer);

    // Return funds
    const tx = await contract.returnFundsAfterDisputeTimeout(escrowId);
    const receipt = await tx.wait();

    return {
      success: true,
      transactionHash: tx.hash,
      blockNumber: receipt.blockNumber,
      events: receipt.logs
    };
  }

  /**
   * Get cross-chain transfer quote
   * @param {object} params - Quote parameters
   * @returns {Promise<object>} Quote details including fees
   */
  async getCrossChainQuote(params) {
    const { 
      sourceChainId, 
      targetChainId, 
      tokenAddress, 
      amount,
      contractAddress 
    } = params;

    if (!sourceChainId || !targetChainId || !amount) {
      throw new Error('Source chain, target chain, and amount required');
    }

    // For same-chain transfers, no cross-chain fee
    if (sourceChainId === targetChainId) {
      return {
        crossChainFee: '0',
        serviceFee: (BigInt(amount) * 200n / 10000n).toString(), // 2% service fee
        totalFee: (BigInt(amount) * 200n / 10000n).toString(),
        minAmountOut: amount,
        route: 'same-chain'
      };
    }

    // Get provider for source chain
    const provider = await this.getProvider(sourceChainId);
    
    // If contract address provided, use it; otherwise use default
    const escrowAddress = contractAddress || this.chainConfigs[sourceChainId]?.v3DisputesContract;
    
    if (!escrowAddress) {
      throw new Error(`No V3 contract configured for chain ${sourceChainId}`);
    }

    // Get contract instance
    // Use the already loaded ABI from initialization
    const contractABI = this.abi;
    const contract = new Contract(escrowAddress, contractABI, provider);

    try {
      // Simplified quote logic without calling non-existent contract methods
      const isCrossChain = sourceChainId !== targetChainId;
      const serviceFee = BigInt(amount) * 200n / 10000n; // 2% service fee
      
      if (!isCrossChain) {
        // Same chain - no cross-chain fee
        return {
          crossChainFee: '0',
          serviceFee: serviceFee.toString(),
          totalFee: serviceFee.toString(),
          minAmountOut: (BigInt(amount) - serviceFee).toString(),
          route: 'direct',
          slippage: '0%'
        };
      }
      
      // Cross-chain quote
      // In production, this would call actual Stargate quote methods
      // For now, use estimated fees
      const estimatedCrossChainFee = parseEther('0.01'); // 0.01 ETH base fee
      const slippageBps = 500n; // 5% slippage
      const amountAfterSlippage = BigInt(amount) * (10000n - slippageBps) / 10000n;
      const minAmountOut = amountAfterSlippage - serviceFee;
      
      return {
        crossChainFee: estimatedCrossChainFee.toString(),
        serviceFee: serviceFee.toString(),
        totalFee: (estimatedCrossChainFee + serviceFee).toString(),
        minAmountOut: minAmountOut.toString(),
        route: 'stargate',
        slippage: '5%',
        warning: 'Using estimated fees - production would use actual Stargate quotes'
      };
    } catch (error) {
      console.error('[EscrowServiceV3] Error getting cross-chain quote:', error);
      throw new Error(`Failed to get quote: ${error.message}`);
    }
  }

  /**
   * Get dispute information
   */
  async getDisputeInfo(escrowId, chainId, contractAddress) {
    const provider = await this.getProvider(chainId);
    const wallet = await this.getServiceWallet(chainId);
    const contract = new Contract(contractAddress || this.getContractAddress(chainId), this.abi, wallet);
    
    try {
      const result = await contract.getDisputeInfo(escrowId);
      return {
        disputeRaised: result[0],
        disputeRaisedBy: result[1],
        disputeRaisedTimestamp: result[2].toNumber() * 1000, // Convert to milliseconds
        disputeResolved: result[3],
        disputeReason: result[4],
        conditionMetTimestamp: result[5].toNumber() * 1000
      };
    } catch (error) {
      console.error('[EscrowServiceV3] Error getting dispute info:', error);
      throw error;
    }
  }

  /**
   * Resolve a dispute
   */
  async resolveDispute(escrowId, releaseFunds, chainId, contractAddress) {
    const wallet = await this.getServiceWallet(chainId);
    const contract = new Contract(contractAddress || this.getContractAddress(chainId), this.abi, wallet);
    
    try {
      console.log(`[EscrowServiceV3] Resolving dispute for ${escrowId} - release to seller: ${releaseFunds}`);
      
      const tx = await contract.resolveDispute(escrowId, releaseFunds);
      console.log(`[EscrowServiceV3] Dispute resolution tx: ${tx.hash}`);
      
      const receipt = await tx.wait();
      console.log(`[EscrowServiceV3] Dispute resolved in block ${receipt.blockNumber}`);
      
      return {
        success: true,
        txHash: receipt.transactionHash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString()
      };
    } catch (error) {
      console.error('[EscrowServiceV3] Error resolving dispute:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Raise a dispute (for testing - in production, backend does this on behalf of users)
   */
  async raiseDispute(escrowId, reason, chainId, contractAddress) {
    const wallet = await this.getServiceWallet(chainId);
    const contract = new Contract(contractAddress || this.getContractAddress(chainId), this.abi, wallet);
    
    try {
      const tx = await contract.raiseDispute(escrowId, reason);
      const receipt = await tx.wait();
      
      return {
        success: true,
        txHash: receipt.transactionHash,
        blockNumber: receipt.blockNumber
      };
    } catch (error) {
      console.error('[EscrowServiceV3] Error raising dispute:', error);
      throw error;
    }
  }

  /**
   * Update condition with dispute tracking
   */
  async updateConditionWithDispute(escrowId, conditionMet, chainId, contractAddress) {
    const wallet = await this.getServiceWallet(chainId);
    const contract = new Contract(contractAddress || this.getContractAddress(chainId), this.abi, wallet);
    
    try {
      const tx = await contract.updateConditionWithDispute(escrowId, conditionMet);
      const receipt = await tx.wait();
      
      return {
        success: true,
        txHash: receipt.transactionHash,
        blockNumber: receipt.blockNumber
      };
    } catch (error) {
      console.error('[EscrowServiceV3] Error updating condition:', error);
      throw error;
    }
  }
}

const escrowServiceInstance = new EscrowServiceV3();
export default escrowServiceInstance;

// Class is already exported at declaration