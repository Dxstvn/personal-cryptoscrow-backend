/**
 * Simple cross-chain service test
 * Following the pattern from wallet-detection-minimal.test.tsx
 */

import {
  areNetworksEVMCompatible,
  getBridgeInfo,
  estimateTransactionFees
} from '../crossChainService.js';

describe('Cross-Chain Service', () => {
  describe('areNetworksEVMCompatible', () => {
    it('should return true for EVM-to-EVM networks', () => {
      expect(areNetworksEVMCompatible('ethereum', 'polygon')).toBe(true);
      expect(areNetworksEVMCompatible('ethereum', 'bsc')).toBe(true);
      expect(areNetworksEVMCompatible('polygon', 'bsc')).toBe(true);
    });

    it('should return false for non-EVM networks', () => {
      expect(areNetworksEVMCompatible('ethereum', 'solana')).toBe(false);
      expect(areNetworksEVMCompatible('ethereum', 'bitcoin')).toBe(false);
      expect(areNetworksEVMCompatible('solana', 'bitcoin')).toBe(false);
    });

    it('should handle unsupported networks gracefully', () => {
      expect(areNetworksEVMCompatible('unknown', 'ethereum')).toBe(false);
      expect(areNetworksEVMCompatible('ethereum', 'unknown')).toBe(false);
    });
  });

  describe('getBridgeInfo', () => {
    it('should return null for EVM-compatible networks', () => {
      expect(getBridgeInfo('ethereum', 'polygon')).toBeNull();
      expect(getBridgeInfo('polygon', 'bsc')).toBeNull();
    });

    it('should return bridge info for cross-chain transactions', () => {
      const bridgeInfo = getBridgeInfo('ethereum', 'solana');
      expect(bridgeInfo).toBeDefined();
      expect(bridgeInfo.bridge).toBe('wormhole');
      expect(bridgeInfo.estimatedTime).toBeDefined();
    });

    it('should work in reverse direction', () => {
      const bridgeInfo = getBridgeInfo('solana', 'ethereum');
      expect(bridgeInfo).toBeDefined();
      expect(bridgeInfo.bridge).toBe('wormhole');
    });

    it('should return null for unsupported bridge combinations', () => {
      expect(getBridgeInfo('bitcoin', 'unknown')).toBeNull();
    });
  });

  describe('estimateTransactionFees', () => {
    it('should estimate fees for EVM-to-EVM transaction', async () => {
      const fees = await estimateTransactionFees('ethereum', 'polygon', '1.0');
      
      expect(fees).toBeDefined();
      expect(fees.sourceNetworkFee).toBeDefined();
      expect(fees.targetNetworkFee).toBeDefined();
      expect(fees.bridgeFee).toBe('0');
      expect(fees.totalEstimatedFee).toBeDefined();
      expect(parseFloat(fees.totalEstimatedFee)).toBeGreaterThan(0);
    });

    it('should estimate fees for cross-chain bridge transaction', async () => {
      const fees = await estimateTransactionFees('ethereum', 'solana', '1.0');
      
      expect(fees).toBeDefined();
      expect(fees.sourceNetworkFee).toBeDefined();
      expect(fees.targetNetworkFee).toBeDefined();
      expect(fees.bridgeFee).toBeDefined();
      expect(parseFloat(fees.bridgeFee)).toBeGreaterThan(0);
      expect(fees.totalEstimatedFee).toBeDefined();
      expect(parseFloat(fees.totalEstimatedFee)).toBeGreaterThan(parseFloat(fees.bridgeFee));
    });

    it('should throw error for unsupported networks', async () => {
      await expect(estimateTransactionFees('unknown', 'ethereum', '1.0'))
        .rejects.toThrow('Unsupported network');
      
      await expect(estimateTransactionFees('ethereum', 'unknown', '1.0'))
        .rejects.toThrow('Unsupported network');
    });
  });

  describe('Integration Test - Complete Cross-Chain Logic', () => {
    it('should handle EVM-to-EVM transaction logic', async () => {
      const sourceNetwork = 'ethereum';
      const targetNetwork = 'polygon';
      const amount = '1.0';

      // Step 1: Check network compatibility
      const isEVMCompatible = areNetworksEVMCompatible(sourceNetwork, targetNetwork);
      expect(isEVMCompatible).toBe(true);

      // Step 2: Check bridge requirement
      const bridgeInfo = getBridgeInfo(sourceNetwork, targetNetwork);
      expect(bridgeInfo).toBeNull(); // No bridge needed

      // Step 3: Estimate fees
      const fees = await estimateTransactionFees(sourceNetwork, targetNetwork, amount);
      expect(fees.bridgeFee).toBe('0');
      expect(parseFloat(fees.totalEstimatedFee)).toBeLessThan(0.01); // Lower fees for EVM-to-EVM

      console.log('EVM-to-EVM transaction logic test completed successfully');
    });

    it('should handle cross-chain bridge transaction logic', async () => {
      const sourceNetwork = 'ethereum';
      const targetNetwork = 'solana';
      const amount = '1.0';

      // Step 1: Check network compatibility
      const isEVMCompatible = areNetworksEVMCompatible(sourceNetwork, targetNetwork);
      expect(isEVMCompatible).toBe(false);

      // Step 2: Check bridge requirement
      const bridgeInfo = getBridgeInfo(sourceNetwork, targetNetwork);
      expect(bridgeInfo).toBeDefined();
      expect(bridgeInfo.bridge).toBe('wormhole');
      expect(bridgeInfo.estimatedTime).toBeDefined();

      // Step 3: Estimate fees
      const fees = await estimateTransactionFees(sourceNetwork, targetNetwork, amount);
      expect(parseFloat(fees.bridgeFee)).toBeGreaterThan(0);
      expect(parseFloat(fees.totalEstimatedFee)).toBeGreaterThan(0.01); // Higher fees for bridge

      console.log('Cross-chain bridge transaction logic test completed successfully');
    });

    it('should handle all supported network combinations', async () => {
      const networks = ['ethereum', 'polygon', 'bsc', 'solana', 'bitcoin'];
      const testResults = [];

      for (const source of networks) {
        for (const target of networks) {
          if (source !== target) {
            const isEVMCompatible = areNetworksEVMCompatible(source, target);
            const bridgeInfo = getBridgeInfo(source, target);
            
            // Bridge info should be null for EVM-compatible pairs
            if (isEVMCompatible) {
              expect(bridgeInfo).toBeNull();
            }

            try {
              const fees = await estimateTransactionFees(source, target, '1.0');
              testResults.push({
                source,
                target,
                isEVMCompatible,
                hasBridge: !!bridgeInfo,
                totalFee: fees.totalEstimatedFee
              });
            } catch (error) {
              // Some combinations might not be supported yet
              console.log(`Note: ${source} -> ${target} not supported:`, error.message);
            }
          }
        }
      }

      expect(testResults.length).toBeGreaterThan(0);
      console.log(`Successfully tested ${testResults.length} network combinations`);
    });
  });
}); 