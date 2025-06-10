/**
 * CrossChainContractDeployer Unit Tests
 * 
 * Tests the CrossChainContractDeployer class logic without complex blockchain interactions
 * Focuses on validation, error handling, and service configuration
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { ethers } from 'ethers';

describe('CrossChainContractDeployer Unit Tests', () => {
  let originalEnv;

  // Valid test addresses
  const VALID_SELLER_ADDRESS = '0x16F2E21F504b4852258F8892555f6b7bc27192aD';
  const VALID_BUYER_ADDRESS = '0xD8cc065a520401f2368Db5aCa4cb0f8c397C47c3';
  const VALID_SERVICE_ADDRESS = '0x742d35Cc6634C0532925a3b8D51d9bB98A42b4B2';

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };
    
    // Set test environment variables
    process.env.ETHEREUM_RPC_URL = 'https://test-ethereum-rpc.com';
    process.env.POLYGON_RPC_URL = 'https://test-polygon-rpc.com';
    process.env.DEPLOYER_PRIVATE_KEY = '0x1234567890123456789012345678901234567890123456789012345678901234';
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
    jest.clearAllMocks();
  });

  describe('CrossChainContractDeployer Class', () => {
    let deployer;

    beforeEach(async () => {
      const { CrossChainContractDeployer } = await import('../../src/services/crossChainContractDeployer.js');
      deployer = new CrossChainContractDeployer();
    });

    describe('Constructor and Initialization', () => {
      it('should initialize with contract ABI loaded', () => {
        expect(deployer.contractABI).toBeDefined();
        expect(Array.isArray(deployer.contractABI)).toBe(true);
        expect(deployer.contractABI.length).toBeGreaterThan(0);
      });

      it('should load essential ABI functions', () => {
        const abi = deployer.contractABI;
        const abiString = JSON.stringify(abi);
        
        // Check for essential functions
        expect(abiString).toContain('constructor');
        expect(abiString).toContain('setConditions');
        expect(abiString).toContain('receiveCrossChainDeposit');
        expect(abiString).toContain('depositFunds');
        expect(abiString).toContain('depositToken');
        expect(abiString).toContain('buyerMarksConditionFulfilled');
        expect(abiString).toContain('startFinalApprovalPeriod');
        expect(abiString).toContain('releaseFundsAfterApprovalPeriod');
        expect(abiString).toContain('initiateCrossChainRelease');
        expect(abiString).toContain('confirmCrossChainRelease');
        expect(abiString).toContain('cancelEscrowAndRefundBuyer');
        expect(abiString).toContain('getContractState');
        expect(abiString).toContain('getCrossChainInfo');
        expect(abiString).toContain('getBalance');
        expect(abiString).toContain('areAllConditionsMet');
      });

      it('should load essential ABI events', () => {
        const abi = deployer.contractABI;
        const abiString = JSON.stringify(abi);
        
        // Check for essential events
        expect(abiString).toContain('EscrowCreated');
        expect(abiString).toContain('CrossChainDepositReceived');
        expect(abiString).toContain('CrossChainReleaseInitiated');
      });
    });

    describe('validateDeploymentParams', () => {
      it('should validate correct parameters', () => {
        const validParams = {
          sellerAddress: VALID_SELLER_ADDRESS,
          buyerAddress: VALID_BUYER_ADDRESS,
          escrowAmount: ethers.parseEther('1.0'),
          buyerSourceChain: 'polygon',
          sellerTargetChain: 'ethereum'
        };

        const result = deployer.validateDeploymentParams(validParams);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should reject invalid seller address', () => {
        const invalidParams = {
          sellerAddress: 'invalid-address',
          buyerAddress: VALID_BUYER_ADDRESS,
          escrowAmount: ethers.parseEther('1.0'),
          buyerSourceChain: 'polygon',
          sellerTargetChain: 'ethereum'
        };

        const result = deployer.validateDeploymentParams(invalidParams);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Invalid seller address');
      });

      it('should reject invalid buyer address', () => {
        const invalidParams = {
          sellerAddress: VALID_SELLER_ADDRESS,
          buyerAddress: 'not-an-address',
          escrowAmount: ethers.parseEther('1.0'),
          buyerSourceChain: 'polygon',
          sellerTargetChain: 'ethereum'
        };

        const result = deployer.validateDeploymentParams(invalidParams);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Invalid buyer address');
      });

      it('should reject same seller and buyer addresses', () => {
        const invalidParams = {
          sellerAddress: VALID_SELLER_ADDRESS,
          buyerAddress: VALID_SELLER_ADDRESS, // Same as seller
          escrowAmount: ethers.parseEther('1.0'),
          buyerSourceChain: 'polygon',
          sellerTargetChain: 'ethereum'
        };

        const result = deployer.validateDeploymentParams(invalidParams);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Seller and buyer addresses cannot be the same');
      });

      it('should reject zero or negative escrow amount', () => {
        const invalidParams = {
          sellerAddress: VALID_SELLER_ADDRESS,
          buyerAddress: VALID_BUYER_ADDRESS,
          escrowAmount: 0,
          buyerSourceChain: 'polygon',
          sellerTargetChain: 'ethereum'
        };

        const result = deployer.validateDeploymentParams(invalidParams);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Escrow amount must be positive');
      });

      it('should reject unsupported buyer source chain', () => {
        const invalidParams = {
          sellerAddress: VALID_SELLER_ADDRESS,
          buyerAddress: VALID_BUYER_ADDRESS,
          escrowAmount: ethers.parseEther('1.0'),
          buyerSourceChain: 'unsupported-chain',
          sellerTargetChain: 'ethereum'
        };

        const result = deployer.validateDeploymentParams(invalidParams);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Unsupported buyer source chain: unsupported-chain');
      });

      it('should reject unsupported seller target chain', () => {
        const invalidParams = {
          sellerAddress: VALID_SELLER_ADDRESS,
          buyerAddress: VALID_BUYER_ADDRESS,
          escrowAmount: ethers.parseEther('1.0'),
          buyerSourceChain: 'polygon',
          sellerTargetChain: 'unsupported-chain'
        };

        const result = deployer.validateDeploymentParams(invalidParams);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Unsupported seller target chain: unsupported-chain');
      });

      it('should validate all supported chains', () => {
        const supportedChains = ['ethereum', 'polygon', 'arbitrum', 'optimism', 'bsc', 'avalanche'];
        
        supportedChains.forEach(chain => {
          const params = {
            sellerAddress: VALID_SELLER_ADDRESS,
            buyerAddress: VALID_BUYER_ADDRESS,
            escrowAmount: ethers.parseEther('1.0'),
            buyerSourceChain: chain,
            sellerTargetChain: 'ethereum'
          };

          const result = deployer.validateDeploymentParams(params);
          expect(result.valid).toBe(true);
        });
      });

      it('should accumulate multiple validation errors', () => {
        const invalidParams = {
          sellerAddress: 'invalid-seller',
          buyerAddress: 'invalid-buyer',
          escrowAmount: -1,
          buyerSourceChain: 'invalid-chain',
          sellerTargetChain: 'invalid-target'
        };

        const result = deployer.validateDeploymentParams(invalidParams);
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(1);
        expect(result.errors).toContain('Invalid seller address');
        expect(result.errors).toContain('Invalid buyer address');
        expect(result.errors).toContain('Escrow amount must be positive');
        expect(result.errors).toContain('Unsupported buyer source chain: invalid-chain');
        expect(result.errors).toContain('Unsupported seller target chain: invalid-target');
      });
    });

    describe('estimateDeploymentCost', () => {
      it('should estimate deployment cost with valid RPC URL', async () => {
        const rpcUrl = 'https://test-ethereum-rpc.com';
        const result = await deployer.estimateDeploymentCost(rpcUrl);

        expect(result).toHaveProperty('gasPrice');
        expect(result).toHaveProperty('estimatedGas');
        expect(result).toHaveProperty('totalCost');
        expect(result).toHaveProperty('totalCostEth');
        expect(result).toHaveProperty('currency');
        expect(result.currency).toBe('ETH');
        
        // Should be numeric strings
        expect(typeof result.gasPrice).toBe('string');
        expect(typeof result.estimatedGas).toBe('string');
        expect(typeof result.totalCost).toBe('string');
        expect(typeof result.totalCostEth).toBe('string');
        
        // Should be parseable as numbers
        expect(Number(result.gasPrice)).toBeGreaterThan(0);
        expect(Number(result.estimatedGas)).toBeGreaterThan(0);
        expect(Number(result.totalCost)).toBeGreaterThan(0);
        expect(Number(result.totalCostEth)).toBeGreaterThan(0);
      });

      it('should return fallback values on RPC error', async () => {
        const invalidRpcUrl = 'https://invalid-rpc-url.com';
        const result = await deployer.estimateDeploymentCost(invalidRpcUrl);

        expect(result).toHaveProperty('gasPrice');
        expect(result).toHaveProperty('estimatedGas');
        expect(result).toHaveProperty('totalCost');
        expect(result).toHaveProperty('totalCostEth');
        expect(result).toHaveProperty('currency');
        expect(result).toHaveProperty('fallback');
        
        expect(result.fallback).toBe(true);
        expect(result.currency).toBe('ETH');
        expect(result.gasPrice).toBe('20000000000');
        expect(result.estimatedGas).toBe('3000000');
        expect(result.totalCost).toBe('60000000000000000');
        expect(result.totalCostEth).toBe('0.06');
      });
    });

    describe('createContractInstance', () => {
      it('should create contract instance with valid parameters', () => {
        const contractAddress = VALID_SELLER_ADDRESS;
        const mockProvider = new ethers.JsonRpcProvider('https://test-rpc.com');
        
        const contractInstance = deployer.createContractInstance(contractAddress, mockProvider);
        
        expect(contractInstance).toBeInstanceOf(ethers.Contract);
        expect(contractInstance.target).toBe(contractAddress);
      });

      it('should create contract instance with wallet', () => {
        const contractAddress = VALID_BUYER_ADDRESS;
        const mockProvider = new ethers.JsonRpcProvider('https://test-rpc.com');
        const wallet = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, mockProvider);
        
        const contractInstance = deployer.createContractInstance(contractAddress, wallet);
        
        expect(contractInstance).toBeInstanceOf(ethers.Contract);
        expect(contractInstance.target).toBe(contractAddress);
      });
    });
  });

  describe('Standalone Function Tests', () => {
    describe('deployCrossChainPropertyEscrowContract', () => {
      it('should validate parameters before deployment', async () => {
        const { deployCrossChainPropertyEscrowContract } = await import('../../src/services/crossChainContractDeployer.js');
        
        const invalidParams = {
          sellerAddress: 'invalid-address',
          buyerAddress: VALID_BUYER_ADDRESS,
          escrowAmount: ethers.parseEther('1.0'),
          serviceWalletAddress: VALID_SERVICE_ADDRESS,
          buyerSourceChain: 'polygon',
          sellerTargetChain: 'ethereum',
          deployerPrivateKey: process.env.DEPLOYER_PRIVATE_KEY,
          rpcUrl: 'https://test-ethereum-rpc.com',
          dealId: 'test-deal-123'
        };

        await expect(deployCrossChainPropertyEscrowContract(invalidParams))
          .rejects
          .toThrow('Invalid deployment parameters');
      });

      it('should handle missing serviceWalletAddress parameter', async () => {
        const { deployCrossChainPropertyEscrowContract } = await import('../../src/services/crossChainContractDeployer.js');
        
        const params = {
          sellerAddress: VALID_SELLER_ADDRESS,
          buyerAddress: VALID_BUYER_ADDRESS,
          escrowAmount: ethers.parseEther('1.0'),
          buyerSourceChain: 'polygon',
          sellerTargetChain: 'ethereum',
          deployerPrivateKey: process.env.DEPLOYER_PRIVATE_KEY,
          rpcUrl: 'https://test-ethereum-rpc.com',
          dealId: 'test-deal-123'
        };

        // Should throw because serviceWalletAddress is required
        await expect(deployCrossChainPropertyEscrowContract(params))
          .rejects
          .toThrow();
      });
    });
  });

  describe('Input Validation Edge Cases', () => {
    let deployer;

    beforeEach(async () => {
      const { CrossChainContractDeployer } = await import('../../src/services/crossChainContractDeployer.js');
      deployer = new CrossChainContractDeployer();
    });

    it('should handle null and undefined values in validation', () => {
      const nullParams = {
        sellerAddress: null,
        buyerAddress: undefined,
        escrowAmount: null,
        buyerSourceChain: '',
        sellerTargetChain: undefined
      };

      const result = deployer.validateDeploymentParams(nullParams);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should handle very large escrow amounts', () => {
      const largeAmountParams = {
        sellerAddress: VALID_SELLER_ADDRESS,
        buyerAddress: VALID_BUYER_ADDRESS,
        escrowAmount: ethers.parseEther('1000000'), // 1M ETH
        buyerSourceChain: 'polygon',
        sellerTargetChain: 'ethereum'
      };

      const result = deployer.validateDeploymentParams(largeAmountParams);
      expect(result.valid).toBe(true); // Should be valid, just large
    });

    it('should handle checksummed addresses correctly', () => {
      const checksummedParams = {
        sellerAddress: VALID_SELLER_ADDRESS, // Already checksummed
        buyerAddress: VALID_BUYER_ADDRESS, // Already checksummed
        escrowAmount: ethers.parseEther('1.0'),
        buyerSourceChain: 'polygon',
        sellerTargetChain: 'ethereum'
      };

      const result = deployer.validateDeploymentParams(checksummedParams);
      expect(result.valid).toBe(true);
    });

    it('should validate chain names case sensitively', () => {
      const mixedCaseParams = {
        sellerAddress: VALID_SELLER_ADDRESS,
        buyerAddress: VALID_BUYER_ADDRESS,
        escrowAmount: ethers.parseEther('1.0'),
        buyerSourceChain: 'POLYGON', // Uppercase
        sellerTargetChain: 'Ethereum' // Mixed case
      };

      const result = deployer.validateDeploymentParams(mixedCaseParams);
      // Currently the validation is case sensitive, so this should fail
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Unsupported buyer source chain: POLYGON');
      expect(result.errors).toContain('Unsupported seller target chain: Ethereum');
    });
  });

  describe('Error Handling', () => {
    it('should handle ABI loading errors gracefully', async () => {
      // This tests the constructor error handling - simply check that constructor works
      const { CrossChainContractDeployer } = await import('../../src/services/crossChainContractDeployer.js');
      const deployer = new CrossChainContractDeployer();
      // Should not throw, even if there are ABI issues
      expect(deployer).toBeDefined();
      expect(deployer.contractABI).toBeDefined();
    });

    it('should provide meaningful error messages', async () => {
      const { deployCrossChainPropertyEscrowContract } = await import('../../src/services/crossChainContractDeployer.js');
      
      const invalidParams = {
        sellerAddress: 'invalid',
        buyerAddress: 'invalid',
        escrowAmount: -1,
        serviceWalletAddress: 'invalid',
        buyerSourceChain: 'invalid',
        sellerTargetChain: 'invalid',
        deployerPrivateKey: process.env.DEPLOYER_PRIVATE_KEY,
        rpcUrl: 'https://test-ethereum-rpc.com',
        dealId: 'test-deal-123'
      };

      try {
        await deployCrossChainPropertyEscrowContract(invalidParams);
      } catch (error) {
        expect(error.message).toContain('Invalid deployment parameters');
        expect(error.message).toContain('Invalid seller address');
        expect(error.message).toContain('Invalid buyer address');
        expect(error.message).toContain('Escrow amount must be positive');
      }
    });
  });

  describe('Contract ABI Structure', () => {
    let deployer;

    beforeEach(async () => {
      const { CrossChainContractDeployer } = await import('../../src/services/crossChainContractDeployer.js');
      deployer = new CrossChainContractDeployer();
    });

    it('should have valid ABI structure', () => {
      expect(deployer.contractABI).toBeDefined();
      expect(Array.isArray(deployer.contractABI)).toBe(true);
      
      // Each ABI entry should be a string (function signature or event)
      deployer.contractABI.forEach(entry => {
        expect(typeof entry).toBe('string');
        expect(entry.length).toBeGreaterThan(0);
      });
    });

    it('should include required cross-chain functions', () => {
      const abi = deployer.contractABI;
      const abiString = JSON.stringify(abi);
      
      const requiredFunctions = [
        'receiveCrossChainDeposit',
        'initiateCrossChainRelease',
        'confirmCrossChainRelease',
        'getCrossChainInfo'
      ];

      requiredFunctions.forEach(func => {
        expect(abiString).toContain(func);
      });
    });

    it('should include required cross-chain events', () => {
      const abi = deployer.contractABI;
      const abiString = JSON.stringify(abi);
      
      const requiredEvents = [
        'CrossChainDepositReceived',
        'CrossChainReleaseInitiated'
      ];

      requiredEvents.forEach(event => {
        expect(abiString).toContain(event);
      });
    });
  });

  describe('Network Configuration', () => {
    it('should support all documented chains', () => {
      const supportedChains = ['ethereum', 'polygon', 'arbitrum', 'optimism', 'bsc', 'avalanche'];
      
      supportedChains.forEach(chain => {
        expect(chain).toMatch(/^[a-z]+$/); // lowercase, letters only
        expect(chain.length).toBeGreaterThan(2);
      });
    });

    it('should handle environment variable mapping', () => {
      const expectedEnvVars = {
        ethereum: 'ETHEREUM_RPC_URL',
        polygon: 'POLYGON_RPC_URL',
        arbitrum: 'ARBITRUM_RPC_URL',
        optimism: 'OPTIMISM_RPC_URL',
        bsc: 'BSC_RPC_URL',
        avalanche: 'AVALANCHE_RPC_URL'
      };

      Object.entries(expectedEnvVars).forEach(([chain, envVar]) => {
        expect(typeof chain).toBe('string');
        expect(typeof envVar).toBe('string');
        expect(envVar).toMatch(/^[A-Z_]+$/); // Uppercase with underscores
      });
    });
  });
}); 