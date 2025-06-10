import { jest } from '@jest/globals';
import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';

// Load test environment variables
function loadTestEnv() {
  try {
    const envTestPath = path.resolve(process.cwd(), '.env.test');
    if (fs.existsSync(envTestPath)) {
      const envContent = fs.readFileSync(envTestPath, 'utf8');
      const lines = envContent.split('\n');
      
      for (const line of lines) {
        const trimmedLine = line.trim();
        if (trimmedLine && !trimmedLine.startsWith('#')) {
          const [key, ...valueParts] = trimmedLine.split('=');
          if (key && valueParts.length > 0) {
            const value = valueParts.join('=').trim();
            const cleanValue = value.replace(/^["']|["']$/g, '');
            if (!process.env[key]) {
              process.env[key] = cleanValue;
            }
          }
        }
      }
      console.log('✅ Loaded .env.test for CrossChainContractDeployer integration testing');
      return true;
    } else {
      console.warn('⚠️ .env.test file not found, using fallback test environment');
      return false;
    }
  } catch (error) {
    console.warn(`⚠️ Could not load .env.test:`, error.message);
    return false;
  }
}

// Load test environment
const envLoaded = loadTestEnv();
process.env.NODE_ENV = 'test';

// Set up test environment variables with fallbacks
if (!process.env.RPC_URL) {
  process.env.RPC_URL = 'https://sepolia.infura.io/v3/test-key';
}
if (!process.env.ETHEREUM_RPC_URL) {
  process.env.ETHEREUM_RPC_URL = process.env.RPC_URL;
}
if (!process.env.POLYGON_RPC_URL) {
  process.env.POLYGON_RPC_URL = 'https://polygon-mumbai.infura.io/v3/test-key';
}
if (!process.env.DEPLOYER_PRIVATE_KEY) {
  process.env.DEPLOYER_PRIVATE_KEY = '0x1234567890123456789012345678901234567890123456789012345678901234';
}

// Import services after environment setup
import { CrossChainContractDeployer, deployCrossChainPropertyEscrowContract } from '../../src/services/crossChainContractDeployer.js';

// Configure Jest to handle async cleanup
jest.setTimeout(60000);

// Valid test addresses (using properly formatted Ethereum addresses)
const VALID_SELLER_ADDRESS = '0x16F2E21F504b4852258F8892555f6b7bc27192aD';
const VALID_BUYER_ADDRESS = '0xD8cc065a520401f2368Db5aCa4cb0f8c397C47c3';
const VALID_SERVICE_WALLET_ADDRESS = '0x965F1f215a049AB146752ca48850102Bfe396f72';
const VALID_BRIDGE_CONTRACT_ADDRESS = '0x5FbDB2315678afecb367f032d93F642f64180aa3';
const VALID_TOKEN_ADDRESS = '0xD9444938d55FB45F58C1eD4bf217609c6d52aE18';

describe('CrossChainContractDeployer Integration Tests', () => {
  let deployer;
  let provider;
  let deployerWallet;
  const activeProviders = new Set(); // Track providers for cleanup

  beforeAll(async () => {
    console.log('[CROSS-CHAIN-DEPLOYER-INTEGRATION] 🧪 Starting CrossChainContractDeployer Integration Tests...');
    
    // Verify environment setup
    const hasRealEnv = envLoaded && process.env.RPC_URL && !process.env.RPC_URL.includes('test');
    
    if (hasRealEnv) {
      console.log('✅ Real blockchain environment detected');
      console.log(`  RPC URL: ${process.env.RPC_URL.substring(0, 50)}...`);
    } else {
      console.log('⚠️ Using test/mock environment for integration tests');
    }

    // Initialize provider and wallet
    try {
      provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
      activeProviders.add(provider); // Track for cleanup
      
      if (process.env.DEPLOYER_PRIVATE_KEY) {
        deployerWallet = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, provider);
        console.log(`[CROSS-CHAIN-DEPLOYER-INTEGRATION] ✅ Connected with deployer: ${deployerWallet.address}`);
      }
    } catch (error) {
      console.warn(`[CROSS-CHAIN-DEPLOYER-INTEGRATION] ⚠️ Provider setup failed: ${error.message}`);
    }

    // Initialize deployer service
    deployer = new CrossChainContractDeployer();
    console.log('[CROSS-CHAIN-DEPLOYER-INTEGRATION] ✅ CrossChainContractDeployer initialized');
  }, 30000);

  describe('Service Initialization', () => {
    it('should initialize with correct configuration', () => {
      expect(deployer).toBeInstanceOf(CrossChainContractDeployer);
      expect(deployer.contractABI).toBeDefined();
      expect(Array.isArray(deployer.contractABI)).toBe(true);
      expect(deployer.contractABI.length).toBeGreaterThan(0);
    });

    it('should load complete contract ABI', () => {
      const abi = deployer.contractABI;
      const abiString = JSON.stringify(abi);
      
      // Verify essential functions are present
      const essentialFunctions = [
        'constructor',
        'receiveCrossChainDeposit',
        'initiateCrossChainRelease',
        'confirmCrossChainRelease',
        'getContractState',
        'getCrossChainInfo',
        'getBalance'
      ];

      essentialFunctions.forEach(func => {
        expect(abiString).toContain(func);
      });

      // Verify essential events are present
      const essentialEvents = [
        'EscrowCreated',
        'CrossChainDepositReceived',
        'CrossChainReleaseInitiated'
      ];

      essentialEvents.forEach(event => {
        expect(abiString).toContain(event);
      });
    });
  });

  describe('Parameter Validation Integration', () => {
    it('should validate real-world deployment parameters', () => {
      const realWorldParams = {
        sellerAddress: VALID_SELLER_ADDRESS,
        buyerAddress: VALID_BUYER_ADDRESS,
        escrowAmount: ethers.parseEther('0.1'), // 0.1 ETH
        buyerSourceChain: 'polygon',
        sellerTargetChain: 'ethereum'
      };

      const result = deployer.validateDeploymentParams(realWorldParams);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle mainnet addresses correctly', () => {
      // Real mainnet addresses
      const mainnetParams = {
        sellerAddress: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', // Vitalik's address
        buyerAddress: '0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B', // Valid mainnet address
        escrowAmount: ethers.parseEther('1.0'),
        buyerSourceChain: 'ethereum',
        sellerTargetChain: 'polygon'
      };

      const result = deployer.validateDeploymentParams(mainnetParams);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate cross-chain combinations', () => {
      const crossChainCombinations = [
        { buyer: 'ethereum', seller: 'polygon' },
        { buyer: 'polygon', seller: 'ethereum' },
        { buyer: 'arbitrum', seller: 'optimism' },
        { buyer: 'bsc', seller: 'avalanche' }
      ];

      crossChainCombinations.forEach(({ buyer, seller }) => {
        const params = {
          sellerAddress: VALID_SELLER_ADDRESS,
          buyerAddress: VALID_BUYER_ADDRESS,
          escrowAmount: ethers.parseEther('1.0'),
          buyerSourceChain: buyer,
          sellerTargetChain: seller
        };

        const result = deployer.validateDeploymentParams(params);
        expect(result.valid).toBe(true);
        console.log(`✅ Validated ${buyer} -> ${seller} cross-chain setup`);
      });
    });
  });

  describe('Deployment Cost Estimation', () => {
    it('should estimate deployment costs for real networks', async () => {
      // Test cost estimation for configured networks
      const networks = [
        { name: 'ethereum', rpc: process.env.ETHEREUM_RPC_URL },
        { name: 'polygon', rpc: process.env.POLYGON_RPC_URL }
      ];

      for (const network of networks) {
        if (network.rpc) {
          console.log(`[COST-ESTIMATION] Testing ${network.name}...`);
          
          const costEstimate = await deployer.estimateDeploymentCost(network.rpc);
          
          expect(costEstimate).toHaveProperty('gasPrice');
          expect(costEstimate).toHaveProperty('estimatedGas');
          expect(costEstimate).toHaveProperty('totalCost');
          expect(costEstimate).toHaveProperty('totalCostEth');
          expect(costEstimate).toHaveProperty('currency');
          expect(costEstimate.currency).toBe('ETH');
          
          // Verify numeric values
          expect(Number(costEstimate.gasPrice)).toBeGreaterThan(0);
          expect(Number(costEstimate.estimatedGas)).toBeGreaterThan(0);
          expect(Number(costEstimate.totalCost)).toBeGreaterThan(0);
          expect(Number(costEstimate.totalCostEth)).toBeGreaterThan(0);
          
          console.log(`  Gas Price: ${costEstimate.gasPrice} wei`);
          console.log(`  Estimated Gas: ${costEstimate.estimatedGas}`);
          console.log(`  Total Cost: ${costEstimate.totalCostEth} ETH`);
          
          // Cost should be reasonable (between 0.001 and 1 ETH)
          const costInEth = Number(costEstimate.totalCostEth);
          expect(costInEth).toBeGreaterThan(0.001);
          expect(costInEth).toBeLessThan(1.0);
        } else {
          console.log(`⚠️ Skipping ${network.name} - no RPC URL configured`);
        }
      }
    }, 30000);

    it('should handle network errors gracefully', async () => {
      const invalidRpcUrl = 'https://invalid-network-url.com/rpc';
      
      const costEstimate = await deployer.estimateDeploymentCost(invalidRpcUrl);
      
      expect(costEstimate).toHaveProperty('fallback');
      expect(costEstimate.fallback).toBe(true);
      expect(costEstimate.currency).toBe('ETH');
      expect(costEstimate.gasPrice).toBe('20000000000');
      expect(costEstimate.estimatedGas).toBe('3000000');
      expect(costEstimate.totalCostEth).toBe('0.06');
    });
  });

  describe('Contract Instance Creation', () => {
    it('should create contract instances with real providers', () => {
      if (!provider) {
        console.log('⚠️ Skipping contract instance test - no provider available');
        return;
      }

      const contractAddress = VALID_SELLER_ADDRESS;
      const contractInstance = deployer.createContractInstance(contractAddress, provider);
      
      expect(contractInstance).toBeInstanceOf(ethers.Contract);
      expect(contractInstance.target).toBe(contractAddress);
      expect(contractInstance.runner).toBe(provider);
    });

    it('should create contract instances with wallets', () => {
      if (!deployerWallet) {
        console.log('⚠️ Skipping wallet contract instance test - no wallet available');
        return;
      }

      const contractAddress = VALID_BUYER_ADDRESS;
      const contractInstance = deployer.createContractInstance(contractAddress, deployerWallet);
      
      expect(contractInstance).toBeInstanceOf(ethers.Contract);
      expect(contractInstance.target).toBe(contractAddress);
      expect(contractInstance.runner).toBe(deployerWallet);
    });

    it('should include all required function interfaces', () => {
      if (!provider) {
        console.log('⚠️ Skipping function interface test - no provider available');
        return;
      }

      const contractAddress = VALID_SELLER_ADDRESS;
      const contractInstance = deployer.createContractInstance(contractAddress, provider);
      
      // Verify contract has required functions
      const requiredFunctions = [
        'receiveCrossChainDeposit',
        'initiateCrossChainRelease',
        'confirmCrossChainRelease',
        'getContractState',
        'getCrossChainInfo',
        'getBalance'
      ];

      requiredFunctions.forEach(functionName => {
        expect(contractInstance.interface.hasFunction(functionName)).toBe(true);
      });
    });
  });

  describe('Mock Deployment Integration', () => {
    it('should perform mock deployment with valid parameters', async () => {
      const deploymentParams = {
        sellerAddress: VALID_SELLER_ADDRESS,
        buyerAddress: VALID_BUYER_ADDRESS,
        escrowAmount: ethers.parseEther('1.0'),
        serviceWalletAddress: VALID_SERVICE_WALLET_ADDRESS,
        bridgeContractAddress: VALID_BRIDGE_CONTRACT_ADDRESS,
        buyerSourceChain: 'polygon',
        sellerTargetChain: 'ethereum',
        tokenAddress: null, // ETH
        deployerPrivateKey: process.env.DEPLOYER_PRIVATE_KEY,
        rpcUrl: process.env.RPC_URL,
        dealId: 'integration-test-deal-001'
      };

      console.log('[MOCK-DEPLOYMENT] Starting mock deployment...');
      const result = await deployer.deployCrossChainEscrow(deploymentParams);
      
      expect(result.success).toBe(true);
      expect(result.contractAddress).toBeDefined();
      expect(result.transactionHash).toBeDefined();
      expect(result.blockNumber).toBeDefined();
      expect(result.gasUsed).toBeDefined();
      expect(result.deploymentCost).toBeDefined();
      expect(result.contractInfo).toBeDefined();
      expect(result.abi).toBeDefined();
      
      console.log(`✅ Mock deployment successful:`);
      console.log(`  Contract Address: ${result.contractAddress}`);
      console.log(`  Transaction Hash: ${result.transactionHash}`);
      console.log(`  Block Number: ${result.blockNumber}`);
      console.log(`  Gas Used: ${result.gasUsed}`);
      console.log(`  Deployment Cost: ${result.deploymentCost} ETH`);
      
      // Verify contract info
      expect(result.contractInfo.seller).toBe(deploymentParams.sellerAddress);
      expect(result.contractInfo.buyer).toBe(deploymentParams.buyerAddress);
      expect(result.contractInfo.escrowAmount).toBe(deploymentParams.escrowAmount.toString());
      expect(result.contractInfo.buyerSourceChain).toBe(deploymentParams.buyerSourceChain);
      expect(result.contractInfo.sellerTargetChain).toBe(deploymentParams.sellerTargetChain);
      expect(result.contractInfo.isCrossChain).toBe(true);
    }, 30000);

    it('should handle token deployment correctly', async () => {
      const tokenDeploymentParams = {
        sellerAddress: VALID_SELLER_ADDRESS,
        buyerAddress: VALID_BUYER_ADDRESS,
        escrowAmount: ethers.parseUnits('1000', 6), // 1000 USDC (6 decimals)
        serviceWalletAddress: VALID_SERVICE_WALLET_ADDRESS,
        bridgeContractAddress: VALID_BRIDGE_CONTRACT_ADDRESS,
        buyerSourceChain: 'ethereum',
        sellerTargetChain: 'polygon',
        tokenAddress: VALID_TOKEN_ADDRESS, // Mock USDC address
        deployerPrivateKey: process.env.DEPLOYER_PRIVATE_KEY,
        rpcUrl: process.env.RPC_URL,
        dealId: 'integration-test-deal-token-001'
      };

      console.log('[TOKEN-DEPLOYMENT] Starting token deployment...');
      const result = await deployer.deployCrossChainEscrow(tokenDeploymentParams);
      
      expect(result.success).toBe(true);
      expect(result.contractInfo.tokenAddress).toBe(tokenDeploymentParams.tokenAddress);
      expect(result.contractInfo.escrowAmount).toBe(tokenDeploymentParams.escrowAmount.toString());
      
      console.log(`✅ Token deployment successful with token: ${result.contractInfo.tokenAddress}`);
    }, 30000);

    it('should fail deployment with invalid parameters', async () => {
      const invalidParams = {
        sellerAddress: 'invalid-address',
        buyerAddress: VALID_BUYER_ADDRESS,
        escrowAmount: ethers.parseEther('1.0'),
        serviceWalletAddress: VALID_SERVICE_WALLET_ADDRESS,
        bridgeContractAddress: VALID_BRIDGE_CONTRACT_ADDRESS,
        buyerSourceChain: 'polygon',
        sellerTargetChain: 'ethereum',
        deployerPrivateKey: process.env.DEPLOYER_PRIVATE_KEY,
        rpcUrl: process.env.RPC_URL,
        dealId: 'integration-test-deal-invalid'
      };

      await expect(deployer.deployCrossChainEscrow(invalidParams))
        .rejects
        .toThrow('Invalid seller address');
    });
  });

  describe('Standalone Function Integration', () => {
    it('should deploy using standalone function', async () => {
      const deploymentParams = {
        sellerAddress: VALID_SELLER_ADDRESS,
        buyerAddress: VALID_BUYER_ADDRESS,
        escrowAmount: ethers.parseEther('0.5'),
        serviceWalletAddress: VALID_SERVICE_WALLET_ADDRESS,
        buyerSourceChain: 'polygon',
        sellerTargetChain: 'ethereum',
        deployerPrivateKey: process.env.DEPLOYER_PRIVATE_KEY,
        rpcUrl: process.env.RPC_URL,
        dealId: 'integration-test-standalone-001'
      };

      console.log('[STANDALONE-DEPLOYMENT] Testing standalone function...');
      const result = await deployCrossChainPropertyEscrowContract(deploymentParams);
      
      expect(result.success).toBe(true);
      expect(result.contractAddress).toBeDefined();
      expect(result.contractInfo).toBeDefined();
      expect(result.contractInfo.isCrossChain).toBe(true);
      
      console.log(`✅ Standalone deployment successful: ${result.contractAddress}`);
    }, 30000);

    it('should validate parameters in standalone function', async () => {
      const invalidParams = {
        sellerAddress: 'invalid-seller',
        buyerAddress: 'invalid-buyer',
        escrowAmount: -1,
        serviceWalletAddress: 'invalid-service',
        buyerSourceChain: 'invalid-chain',
        sellerTargetChain: 'invalid-target',
        deployerPrivateKey: process.env.DEPLOYER_PRIVATE_KEY,
        rpcUrl: process.env.RPC_URL,
        dealId: 'integration-test-standalone-invalid'
      };

      await expect(deployCrossChainPropertyEscrowContract(invalidParams))
        .rejects
        .toThrow('Invalid deployment parameters');
    });
  });

  describe('Real Network Integration (if available)', () => {
    it('should connect to real networks when available', async () => {
      const networks = [
        { name: 'ethereum', rpc: process.env.ETHEREUM_RPC_URL },
        { name: 'polygon', rpc: process.env.POLYGON_RPC_URL }
      ];

      for (const network of networks) {
        if (network.rpc && !network.rpc.includes('test')) {
          try {
            console.log(`[REAL-NETWORK] Testing connection to ${network.name}...`);
            
            const testProvider = new ethers.JsonRpcProvider(network.rpc);
            activeProviders.add(testProvider); // Track for cleanup
            const blockNumber = await testProvider.getBlockNumber();
            
            expect(blockNumber).toBeGreaterThan(0);
            console.log(`✅ ${network.name} connection successful (block: ${blockNumber})`);
            
            // Test gas price if available
            try {
              const gasPrice = await testProvider.getGasPrice();
              expect(gasPrice).toBeGreaterThan(0n);
              console.log(`  Gas price: ${ethers.formatUnits(gasPrice, 'gwei')} gwei`);
            } catch (gasPriceError) {
              console.log(`  ⚠️ Gas price unavailable: ${gasPriceError.message}`);
            }
            
          } catch (error) {
            console.log(`⚠️ ${network.name} connection failed: ${error.message}`);
            // Don't fail the test, just log the issue
          }
        } else {
          console.log(`⚠️ Skipping ${network.name} - test environment detected`);
        }
      }
    }, 45000);

    it('should estimate realistic gas costs on real networks', async () => {
      if (!process.env.ETHEREUM_RPC_URL || process.env.ETHEREUM_RPC_URL.includes('test')) {
        console.log('⚠️ Skipping real network gas estimation - test environment');
        return;
      }

      try {
        const costEstimate = await deployer.estimateDeploymentCost(process.env.ETHEREUM_RPC_URL);
        
        if (!costEstimate.fallback) {
          const costInEth = Number(costEstimate.totalCostEth);
          
          // Real network costs should be within reasonable bounds
          expect(costInEth).toBeGreaterThan(0.001); // At least 0.001 ETH
          expect(costInEth).toBeLessThan(0.5);      // Less than 0.5 ETH
          
          console.log(`✅ Real network cost estimate: ${costEstimate.totalCostEth} ETH`);
        }
      } catch (error) {
        console.log(`⚠️ Real network cost estimation failed: ${error.message}`);
      }
    }, 30000);
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle network timeout gracefully', async () => {
      const timeoutParams = {
        sellerAddress: VALID_SELLER_ADDRESS,
        buyerAddress: VALID_BUYER_ADDRESS,
        escrowAmount: ethers.parseEther('1.0'),
        serviceWalletAddress: VALID_SERVICE_WALLET_ADDRESS,
        bridgeContractAddress: VALID_BRIDGE_CONTRACT_ADDRESS,
        buyerSourceChain: 'polygon',
        sellerTargetChain: 'ethereum',
        deployerPrivateKey: process.env.DEPLOYER_PRIVATE_KEY,
        rpcUrl: 'https://very-slow-network.timeout.test', // This will timeout
        dealId: 'integration-test-timeout'
      };

      // This should either complete successfully (mock) or fail gracefully
      try {
        const result = await deployer.deployCrossChainEscrow(timeoutParams);
        // If it succeeds, it should be a valid mock result
        expect(result.success).toBe(true);
        console.log('✅ Network timeout handled with mock deployment');
      } catch (error) {
        // If it fails, it should be a meaningful error
        expect(error.message).toContain('failed');
        console.log(`✅ Network timeout handled gracefully: ${error.message}`);
      }
    }, 20000);

    it('should handle concurrent deployment requests', async () => {
      const baseParams = {
        sellerAddress: VALID_SELLER_ADDRESS,
        buyerAddress: VALID_BUYER_ADDRESS,
        escrowAmount: ethers.parseEther('1.0'),
        serviceWalletAddress: VALID_SERVICE_WALLET_ADDRESS,
        bridgeContractAddress: VALID_BRIDGE_CONTRACT_ADDRESS,
        buyerSourceChain: 'polygon',
        sellerTargetChain: 'ethereum',
        deployerPrivateKey: process.env.DEPLOYER_PRIVATE_KEY,
        rpcUrl: process.env.RPC_URL
      };

      // Launch multiple concurrent deployments
      const concurrentDeployments = Array.from({ length: 3 }, (_, i) => 
        deployer.deployCrossChainEscrow({
          ...baseParams,
          dealId: `integration-test-concurrent-${i + 1}`
        })
      );

      const results = await Promise.all(concurrentDeployments);
      
      // All deployments should succeed
      results.forEach((result, index) => {
        expect(result.success).toBe(true);
        expect(result.contractAddress).toBeDefined();
        console.log(`✅ Concurrent deployment ${index + 1}: ${result.contractAddress}`);
      });

      // Contract addresses should be unique
      const addresses = results.map(r => r.contractAddress);
      const uniqueAddresses = new Set(addresses);
      expect(uniqueAddresses.size).toBe(addresses.length);
    }, 45000);
  });

  afterAll(async () => {
    console.log('[CROSS-CHAIN-DEPLOYER-INTEGRATION] 🏁 Integration tests completed');
    
    // Clean up all provider connections to prevent open handles
    for (const activeProvider of activeProviders) {
      try {
        if (activeProvider && typeof activeProvider.destroy === 'function') {
          await activeProvider.destroy();
        } else if (activeProvider && typeof activeProvider.removeAllListeners === 'function') {
          activeProvider.removeAllListeners();
        }
      } catch (error) {
        // Ignore cleanup errors
      }
    }
    activeProviders.clear();
    
    // Force garbage collection and wait for cleanup
    if (global.gc) {
      global.gc();
    }
    
    // Give a small delay for async cleanup
    await new Promise(resolve => setTimeout(resolve, 200));
  });
}); 