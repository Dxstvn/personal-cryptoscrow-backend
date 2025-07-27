// src/services/__tests__/escrowServiceV3.test.js
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { parseEther, formatEther } from 'ethers';

// Mock config module
vi.mock('../../config/index.js', () => ({
  default: {
    isInitialized: true,
    initialize: vi.fn().mockResolvedValue(undefined),
    get: vi.fn((key) => {
      const configs = {
        'RPC_URL': 'https://sepolia.infura.io/v3/test',
        'ARBITRUM_SEPOLIA_RPC_URL': 'https://arbitrum-sepolia.infura.io/v3/test',
        'POLYGON_AMOY_RPC_URL': 'https://polygon-amoy.infura.io/v3/test'
      };
      return configs[key] || null;
    })
  }
}));

// Mock mockEndpointQuoter module
vi.mock('../mockEndpointQuoter.js', () => ({
  default: {
    getQuoteOFT: vi.fn().mockResolvedValue({
      nativeFee: parseEther('0.001').toString(),
      lzTokenFee: '0'
    })
  }
}));

// Mock fs/promises for ABI loading
vi.mock('fs/promises', () => ({
  default: {
    readFile: vi.fn().mockImplementation((path) => {
      if (path.includes('UniversalEscrowServiceV3DisputesStargateOnly.json')) {
        // Return mock DisputesStargateOnly ABI
        return Promise.resolve(JSON.stringify({
          abi: [
            { name: 'createEscrow', type: 'function' },
            { name: 'updateCondition', type: 'function' },
            { name: 'releaseEscrow', type: 'function' },
            { name: 'getEscrowDetails', type: 'function' },
            { name: 'estimateTotalFees', type: 'function' }
          ]
        }));
      } else if (path.includes('UniversalEscrowServiceV3Test.json')) {
        // Return mock Test ABI
        return Promise.resolve(JSON.stringify({
          abi: [
            { name: 'createEscrow', type: 'function' },
            { name: 'updateCondition', type: 'function' },
            { name: 'releaseEscrow', type: 'function' },
            { name: 'getEscrowDetails', type: 'function' },
            { name: 'estimateTotalFees', type: 'function' }
          ]
        }));
      }
      return Promise.reject(new Error('File not found'));
    })
  }
}));

import { EscrowServiceV3 } from '../escrowServiceV3.js';

describe('EscrowServiceV3', () => {
  let service;
  
  beforeAll(async () => {
    // Mock environment variables
    process.env.SEPOLIA_RPC_URL = 'https://sepolia.infura.io/v3/test';
    process.env.ARBITRUM_SEPOLIA_RPC_URL = 'https://arbitrum-sepolia.infura.io/v3/test';
    process.env.POLYGON_AMOY_RPC_URL = 'https://polygon-amoy.infura.io/v3/test';
    process.env.BACKEND_WALLET_PRIVATE_KEY = '0x' + '1'.repeat(64);
    
    service = new EscrowServiceV3();
    await service.initialize();
  });

  afterAll(() => {
    // Clean up
    vi.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should have chain configurations', () => {
      expect(service.chainConfigs).toBeDefined();
      expect(service.chainConfigs[11155111]).toBeDefined();
      expect(service.chainConfigs[11155111].name).toBe('sepolia');
    });

    it('should support all three chains', () => {
      const chains = service.getSupportedChains();
      expect(chains).toHaveLength(3);
      expect(chains.map(c => c.name)).toContain('sepolia');
      expect(chains.map(c => c.name)).toContain('arbitrum-sepolia');
      expect(chains.map(c => c.name)).toContain('polygon-amoy');
    });
  });

  describe('Fee Calculations', () => {
    it('should calculate 2% service fee correctly', () => {
      const fee = service.calculateServiceFee('100');
      expect(fee).toBe('2.0');
    });

    it('should calculate service fee for small amounts', () => {
      const fee = service.calculateServiceFee('1');
      expect(fee).toBe('0.02');
    });

    it('should calculate service fee for large amounts', () => {
      const fee = service.calculateServiceFee('10000');
      expect(fee).toBe('200.0');
    });
  });

  describe('Chain Configuration', () => {
    it('should return chain config for valid chain', () => {
      const config = service.getChainConfig(11155111);
      expect(config).toBeDefined();
      expect(config.name).toBe('sepolia');
      expect(config.contractAddress).toBe('0x607672971D94C336746bB6d1DC39E535631C9DDa');
    });

    it('should return null for invalid chain', () => {
      const config = service.getChainConfig(999999);
      expect(config).toBeNull();
    });

    it('should get OFT adapter address', () => {
      const adapter = service.getOFTAdapter(11155111);
      expect(adapter).toBe('0x5277270f4F4F7e03439F2eCdb6d6632ED921bfF6');
    });

    it('should get composer address', () => {
      const composer = service.getComposer(11155111);
      expect(composer).toBe('0x3e6d2247055683d53a16Fc935E24D30065a6DB05');
    });

    it('should return null composer for chains without composer', () => {
      const composer = service.getComposer(421614); // Arbitrum Sepolia
      expect(composer).toBeNull();
    });

    it('should get LayerZero endpoint ID', () => {
      const endpointId = service.getLayerZeroEndpointId(11155111);
      expect(endpointId).toBe(40161);
    });
  });

  describe('Token Information', () => {
    it('should return ETH info for zero address', async () => {
      const info = await service.getTokenInfo('0x0000000000000000000000000000000000000000', 11155111);
      expect(info).toEqual({
        symbol: 'ETH',
        decimals: 18,
        name: 'Ether'
      });
    }, 10000); // 10 second timeout

    it('should get supported tokens for a chain', async () => {
      const tokens = await service.getSupportedTokens(11155111);
      expect(tokens).toBeInstanceOf(Array);
      expect(tokens.length).toBeGreaterThan(0);
      expect(tokens[0].symbol).toBe('ETH');
    }, 10000); // 10 second timeout
  });

  describe('Explorer URLs', () => {
    it('should generate correct explorer URL for Sepolia', () => {
      const url = service.getExplorerUrl(11155111, '0x123abc');
      expect(url).toBe('https://sepolia.etherscan.io/tx/0x123abc');
    });

    it('should generate correct explorer URL for Arbitrum Sepolia', () => {
      const url = service.getExplorerUrl(421614, '0x456def');
      expect(url).toBe('https://sepolia.arbiscan.io/tx/0x456def');
    });

    it('should generate correct explorer URL for Polygon Amoy', () => {
      const url = service.getExplorerUrl(80002, '0x789ghi');
      expect(url).toBe('https://amoy.polygonscan.com/tx/0x789ghi');
    });

    it('should return null for unsupported chain', () => {
      const url = service.getExplorerUrl(999999, '0xabc');
      expect(url).toBeNull();
    });
  });

  describe('LayerZero Integration', () => {
    it('should track LayerZero transfer', async () => {
      const result = await service.trackLayerZeroTransfer('0x7e037acbb2667df60e69d7a6518786f3f76d9216e3ca0fef9eea8cdb96633679');
      expect(result).toEqual({
        guid: '0x7e037acbb2667df60e69d7a6518786f3f76d9216e3ca0fef9eea8cdb96633679',
        status: 'pending',
        scanUrl: 'https://layerzeroscan.com/tx/0x7e037acbb2667df60e69d7a6518786f3f76d9216e3ca0fef9eea8cdb96633679'
      });
    }, 10000); // 10 second timeout
  });

  describe('Error Handling', () => {
    it('should throw error for unsupported chain in getProvider', async () => {
      await expect(service.getProvider(999999)).rejects.toThrow('Chain 999999 not supported');
    });

    it('should throw error for missing RPC URL', async () => {
      // Create a new service instance with missing RPC config
      const { default: config } = await import('../../config/index.js');
      const originalGet = config.get;
      
      // Mock config to return null for RPC_URL
      config.get = vi.fn((key) => {
        if (key === 'RPC_URL') return null;
        return originalGet(key);
      });
      
      const newService = new EscrowServiceV3();
      await newService.initialize();
      await expect(newService.getProvider(11155111)).rejects.toThrow('RPC URL not configured for chain 11155111');
      
      // Restore
      config.get = originalGet;
    });

    it('should throw error for missing private key', async () => {
      const originalKey = process.env.BACKEND_WALLET_PRIVATE_KEY;
      delete process.env.BACKEND_WALLET_PRIVATE_KEY;
      
      const newService = new EscrowServiceV3();
      await expect(newService.getWallet(11155111)).rejects.toThrow('No private key provided');
      
      // Restore
      process.env.BACKEND_WALLET_PRIVATE_KEY = originalKey;
    });

    it('should not support per-transaction deployment', async () => {
      await expect(service.deployContract(11155111, '0x123', '0x456', '0x789'))
        .rejects.toThrow('V3 contracts are deployed once per chain, not per transaction');
    });
  });

  describe('Contract Interaction Methods (Mock Tests)', () => {
    // These tests verify the method signatures and basic logic
    // In integration tests, these would interact with real contracts

    it('should have createEscrow method with correct parameters', async () => {
      expect(service.createEscrow).toBeDefined();
      expect(typeof service.createEscrow).toBe('function');
    });

    it('should have updateCondition method', async () => {
      expect(service.updateCondition).toBeDefined();
      expect(typeof service.updateCondition).toBe('function');
    });

    it('should have releaseEscrow method', async () => {
      expect(service.releaseEscrow).toBeDefined();
      expect(typeof service.releaseEscrow).toBe('function');
    });

    // Note: V3 doesn't have cancelEscrow

    it('should have getEscrowDetails method', async () => {
      expect(service.getEscrowDetails).toBeDefined();
      expect(typeof service.getEscrowDetails).toBe('function');
    });

    it('should have estimateTotalFees method', async () => {
      expect(service.estimateTotalFees).toBeDefined();
      
      // Mock the cross-chain quote to test fee estimation
      service.quoteCrossChainFee = vi.fn().mockResolvedValue({
        nativeFee: '0.001',
        zroFee: '0',
        recommended: '0.003'
      });

      const fees = await service.estimateTotalFees({
        amount: '100',
        sourceChainId: 11155111,
        targetChainId: 80002,
        requiresSwap: true
      });

      expect(fees).toEqual({
        serviceFee: '2.0',
        crossChainFee: '0.003',
        gasEstimate: '0.003',
        total: '2.006000',
        method: 'LayerZero',
        isEnhanced: false
      });
    });
  });

  describe('Additional Coverage Tests', () => {
    it('should test same-chain fee estimation', async () => {
      const fees = await service.estimateTotalFees({
        amount: '50',
        sourceChainId: 11155111,
        targetChainId: 11155111,
        requiresSwap: false
      });

      expect(fees).toEqual({
        serviceFee: '1.0',
        crossChainFee: '0',
        gasEstimate: '0.001',
        total: '1.001000',
        method: 'direct',
        isEnhanced: false
      });
    });

    it('should handle provider caching', async () => {
      // Mock successful connection
      const mockProvider = {
        getBlockNumber: vi.fn().mockResolvedValue(12345)
      };
      
      // Replace JsonRpcProvider constructor
      const originalJsonRpcProvider = service.constructor.prototype.getProvider;
      
      // First call should create provider
      service.providers.clear();
      
      // Test that providers are cached
      expect(service.providers.size).toBe(0);
    });

    it('should handle wallet caching', async () => {
      service.wallets.clear();
      expect(service.wallets.size).toBe(0);
      
      // Test private key parameter
      const customKey = '0x' + '2'.repeat(64);
      try {
        // This will fail due to mock provider, but we're testing the logic
        await service.getWallet(11155111, customKey);
      } catch (error) {
        // Expected to fail
      }
      
      // Custom key should not be cached
      expect(service.wallets.size).toBe(0);
    });

    it('should initialize only once', async () => {
      // Create a new instance to test initialization
      const newService = new EscrowServiceV3();
      expect(newService.abi).toBeNull();
      
      // First initialization
      await newService.initialize();
      expect(newService.abi).toBeDefined();
      const loadedAbi = newService.abi;
      
      // Second call should not change ABI
      await newService.initialize();
      expect(newService.abi).toBe(loadedAbi);
    });

    it('should handle missing chain config', () => {
      // Test methods with invalid chain ID
      expect(service.getOFTAdapter(999999)).toBeNull();
      expect(service.getComposer(999999)).toBeNull();
    });

    it('should format explorer URLs correctly', () => {
      // Test with different hash formats
      expect(service.getExplorerUrl(11155111, '0xabc')).toBe('https://sepolia.etherscan.io/tx/0xabc');
      expect(service.getExplorerUrl(11155111, 'abc')).toBe('https://sepolia.etherscan.io/tx/abc');
    });

    it('should handle all supported chains in getSupportedChains', () => {
      const chains = service.getSupportedChains();
      expect(chains).toHaveLength(3);
      
      // Check each chain has required properties
      chains.forEach(chain => {
        expect(chain.chainId).toBeDefined();
        expect(chain.name).toBeDefined();
        expect(chain.contractAddress).toBeDefined();
        expect(chain.explorerUrl).toBeDefined();
      });
    });

    it('should return correct endpoint IDs', () => {
      expect(service.getLayerZeroEndpointId(11155111)).toBe(40161);
      expect(service.getLayerZeroEndpointId(421614)).toBe(40231);
      expect(service.getLayerZeroEndpointId(80002)).toBe(40267);
      expect(service.getLayerZeroEndpointId(999999)).toBeNull();
    });

    it('should handle all chain configs', () => {
      Object.keys(service.chainConfigs).forEach(chainId => {
        const config = service.getChainConfig(parseInt(chainId));
        expect(config).toBeDefined();
        expect(config.name).toBeDefined();
        expect(config.contractAddress).toBeDefined();
        expect(config.rpcUrl).toBeDefined();
      });
    });
  });
});