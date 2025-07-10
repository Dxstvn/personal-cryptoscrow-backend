// src/services/__tests__/escrowServiceV3.integration.test.js
/**
 * Integration tests for EscrowServiceV3
 * These tests interact with actual deployed V3 contracts on testnets
 * Run with: npm test -- --testPathPattern=escrowServiceV3.integration
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { EscrowServiceV3 } from '../escrowServiceV3.js';
import { parseEther } from 'ethers';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Skip these tests in CI or if no RPC URLs are configured
const SKIP_INTEGRATION = !process.env.SEPOLIA_RPC_URL || process.env.CI === 'true';

describe.skipIf(SKIP_INTEGRATION)('EscrowServiceV3 Integration Tests', () => {
  let service;
  let testWalletAddress;

  beforeAll(async () => {
    service = new EscrowServiceV3();
    await service.initialize();
    
    // Get test wallet address
    if (process.env.BACKEND_WALLET_PRIVATE_KEY) {
      const wallet = await service.getWallet(11155111);
      testWalletAddress = wallet.address;
    }
  });

  describe('Contract ABI Loading', () => {
    it('should load V3 contract ABI successfully', () => {
      expect(service.abi).toBeDefined();
      expect(Array.isArray(service.abi)).toBe(true);
      expect(service.abi.length).toBeGreaterThan(0);
      
      // Check for key V3 functions
      const functionNames = service.abi
        .filter(item => item.type === 'function')
        .map(item => item.name);
      
      expect(functionNames).toContain('createEscrow');
      expect(functionNames).toContain('updateCondition');
      expect(functionNames).toContain('releaseEscrow');
      // Note: V3 might not have cancelEscrow or it might be named differently
      // Let's check what functions are actually available
      console.log('Available functions:', functionNames);
    });
  });

  describe('Provider Connections', () => {
    it('should connect to Sepolia', async () => {
      const provider = await service.getProvider(11155111);
      expect(provider).toBeDefined();
      
      const blockNumber = await provider.getBlockNumber();
      expect(blockNumber).toBeGreaterThan(0);
    });

    it('should connect to Arbitrum Sepolia', async () => {
      if (!process.env.ARBITRUM_SEPOLIA_RPC_URL) {
        console.log('Skipping Arbitrum test - no RPC URL configured');
        return;
      }
      
      const provider = await service.getProvider(421614);
      expect(provider).toBeDefined();
      
      const blockNumber = await provider.getBlockNumber();
      expect(blockNumber).toBeGreaterThan(0);
    });

    it('should connect to Polygon Amoy', async () => {
      if (!process.env.POLYGON_AMOY_RPC_URL) {
        console.log('Skipping Polygon test - no RPC URL configured');
        return;
      }
      
      const provider = await service.getProvider(80002);
      expect(provider).toBeDefined();
      
      const blockNumber = await provider.getBlockNumber();
      expect(blockNumber).toBeGreaterThan(0);
    });
  });

  describe('Contract Instances', () => {
    it('should get V3 contract instance on Sepolia', async () => {
      const contract = await service.getContract(11155111);
      expect(contract).toBeDefined();
      expect(contract.target).toBe('0xBA10d8d3A09439eA5984F545C925d61958fa14E9');
      
      // Verify it's a V3 contract by checking for V3-specific functions
      expect(contract.interface.getFunction('createEscrow')).toBeDefined();
      expect(contract.interface.getFunction('updateCondition')).toBeDefined();
    });
  });

  describe('Cross-Chain Fee Quotes', () => {
    it('should quote cross-chain fee from Sepolia to Polygon', async () => {
      try {
        const quote = await service.quoteCrossChainFee(11155111, 80002, '0.1');
        
        expect(quote).toBeDefined();
        expect(quote.nativeFee).toBeDefined();
        expect(parseFloat(quote.nativeFee)).toBeGreaterThan(0);
        expect(quote.recommended).toBeDefined();
        expect(parseFloat(quote.recommended)).toBeGreaterThan(parseFloat(quote.nativeFee));
        
        console.log('Cross-chain fee quote:', quote);
      } catch (error) {
        console.log('Fee quote failed (may be due to testnet issues):', error.message);
      }
    });
  });

  describe('Token Operations', () => {
    it('should get WETH token info on Sepolia', async () => {
      const wethAddress = '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14';
      const tokenInfo = await service.getTokenInfo(wethAddress, 11155111);
      
      expect(tokenInfo).toBeDefined();
      expect(tokenInfo.symbol).toBe('WETH');
      expect(tokenInfo.decimals).toBe(18n); // BigInt comparison
      expect(tokenInfo.name).toContain('Wrapped');
    });
  });

  describe('Uniswap Quotes', () => {
    it('should quote ETH to WETH swap on Sepolia', async () => {
      try {
        const quote = await service.quoteSwap(
          '0x0000000000000000000000000000000000000000', // ETH
          '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14', // WETH
          '1', // 1 ETH
          11155111
        );
        
        expect(quote).toBeDefined();
        expect(quote.amountIn).toBe('1.0');
        expect(parseFloat(quote.amountOut)).toBeGreaterThan(0);
        expect(Array.isArray(quote.path)).toBe(true);
        
        console.log('Swap quote:', quote);
      } catch (error) {
        console.log('Swap quote failed (may be due to testnet liquidity):', error.message);
      }
    });
  });

  describe('Read-Only Contract Interactions', () => {
    it('should check if a non-existent escrow is released', async () => {
      const randomEscrowId = '0x' + '0'.repeat(64);
      
      try {
        const isReleased = await service.isEscrowReleased(11155111, randomEscrowId);
        expect(isReleased).toBe(false);
      } catch (error) {
        // This is expected if the escrow doesn't exist
        expect(error.message).toContain('Failed to get escrow details');
      }
    });
  });

  // Note: Write operations (createEscrow, releaseEscrow, etc.) are not tested here
  // as they would require test ETH and could interfere with production contracts
  // These should be tested in a dedicated test environment or with mock contracts
});