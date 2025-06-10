import { jest } from '@jest/globals';
import LiFiBridgeService from '../../src/services/lifiService.js';

// Mock the LI.FI SDK
jest.mock('@lifi/sdk', () => ({
  createConfig: jest.fn(() => ({ integrator: 'cryptoescrow' })),
  getChains: jest.fn(),
  getRoutes: jest.fn(),
  getStatus: jest.fn(),
  getTokens: jest.fn(),
  executeRoute: jest.fn(),
  ChainId: {
    ETH: 1,
    POL: 137,
    BSC: 56,
    ARB: 42161,
    OPT: 10,
    AVA: 43114,
    FTM: 250
  }
}));

import {
  createConfig,
  getChains,
  getRoutes,
  getStatus,
  getTokens,
  executeRoute
} from '@lifi/sdk';

describe('LiFiBridgeService', () => {
  let lifiService;

  beforeEach(() => {
    jest.clearAllMocks();
    lifiService = new LiFiBridgeService();
  });

  describe('Constructor', () => {
    it('should initialize with correct configuration', () => {
      expect(createConfig).toHaveBeenCalledWith({
        integrator: 'cryptoescrow',
        debug: false
      });
    });
  });

  describe('getSupportedChains', () => {
    it('should return formatted chain data', async () => {
      const mockChains = [
        {
          id: 1,
          name: 'Ethereum',
          nativeCurrency: { symbol: 'ETH' },
          rpcUrls: ['https://mainnet.infura.io'],
          blockExplorerUrls: ['https://etherscan.io'],
          multicall: true
        },
        {
          id: 137,
          name: 'Polygon',
          nativeCurrency: { symbol: 'MATIC' },
          rpcUrls: ['https://polygon-rpc.com'],
          blockExplorerUrls: ['https://polygonscan.com'],
          multicall: true
        }
      ];

      getChains.mockResolvedValue(mockChains);

      const result = await lifiService.getSupportedChains();

      expect(getChains).toHaveBeenCalled();
      expect(result).toEqual([
        {
          chainId: 1,
          name: 'Ethereum',
          nativeCurrency: { symbol: 'ETH' },
          rpcUrls: ['https://mainnet.infura.io'],
          blockExplorerUrls: ['https://etherscan.io'],
          bridgeSupported: true,
          dexSupported: true
        },
        {
          chainId: 137,
          name: 'Polygon',
          nativeCurrency: { symbol: 'MATIC' },
          rpcUrls: ['https://polygon-rpc.com'],
          blockExplorerUrls: ['https://polygonscan.com'],
          bridgeSupported: true,
          dexSupported: true
        }
      ]);
    });

    it('should handle API errors gracefully', async () => {
      getChains.mockRejectedValue(new Error('API Error'));

      await expect(lifiService.getSupportedChains()).rejects.toThrow('API Error');
    });
  });

  describe('findOptimalRoute', () => {
    const mockRouteRequest = {
      fromChainId: 'ethereum',
      toChainId: 'polygon',
      fromTokenAddress: '0x0000000000000000000000000000000000000000',
      toTokenAddress: '0x0000000000000000000000000000000000000000',
      fromAmount: '1000000000000000000',
      fromAddress: '0x742d35Cc6634C0532925a3b8D51d9bB98A42b4B2',
      toAddress: '0x742d35Cc6634C0532925a3b8D51d9bB98A42b4B2',
      dealId: 'test-deal-123'
    };

    it('should find and return optimal route', async () => {
      const mockRoutes = {
        routes: [
          {
            id: 'route-1',
            steps: [
              {
                type: 'cross',
                tool: 'across',
                estimate: {
                  executionDuration: 900, // 15 minutes
                  feeCosts: [{ amountUSD: '5.50' }],
                  gasCosts: [{ amount: '0.01' }]
                }
              }
            ],
            insurance: true
          },
          {
            id: 'route-2',
            steps: [
              {
                type: 'cross',
                tool: 'stargate',
                estimate: {
                  executionDuration: 1200, // 20 minutes
                  feeCosts: [{ amountUSD: '3.20' }],
                  gasCosts: [{ amount: '0.008' }]
                }
              }
            ],
            insurance: false
          }
        ]
      };

      getRoutes.mockResolvedValue(mockRoutes);

      const result = await lifiService.findOptimalRoute(mockRouteRequest);

      expect(getRoutes).toHaveBeenCalledWith({
        fromChainId: 1,
        toChainId: 137,
        fromTokenAddress: '0x0000000000000000000000000000000000000000',
        toTokenAddress: '0x0000000000000000000000000000000000000000',
        fromAmount: '1000000000000000000',
        fromAddress: '0x742d35Cc6634C0532925a3b8D51d9bB98A42b4B2',
        toAddress: '0x742d35Cc6634C0532925a3b8D51d9bB98A42b4B2',
        options: {
          order: 'RECOMMENDED',
          slippage: 0.03,
          allowBridges: ['across', 'connext', 'hop', 'stargate', 'polygon', 'arbitrum'],
          allowExchanges: ['1inch', 'uniswap', '0x', 'paraswap'],
          insurance: true,
          integrator: 'cryptoescrow'
        }
      });

      expect(result).toMatchObject({
        route: expect.any(Object),
        estimatedTime: expect.any(Number),
        totalFees: expect.any(Number),
        bridgesUsed: expect.arrayContaining(['across']),
        confidence: expect.any(Number),
        dealId: 'test-deal-123',
        fromChain: 'ethereum',
        toChain: 'polygon'
      });
    });

    it('should throw error when no routes found', async () => {
      getRoutes.mockResolvedValue({ routes: [] });

      await expect(
        lifiService.findOptimalRoute(mockRouteRequest)
      ).rejects.toThrow('No bridge routes found between ethereum and polygon');
    });

    it('should handle LI.FI API errors', async () => {
      getRoutes.mockRejectedValue(new Error('LI.FI API Error'));

      await expect(
        lifiService.findOptimalRoute(mockRouteRequest)
      ).rejects.toThrow('LI.FI route finding failed: LI.FI API Error');
    });
  });

  describe('Route Selection Algorithm', () => {
    it('should select route with best score based on multiple factors', () => {
      const routes = [
        {
          id: 'slow-expensive',
          steps: [
            {
              type: 'cross',
              tool: 'slow-bridge',
              estimate: {
                executionDuration: 3600, // 1 hour
                feeCosts: [{ amountUSD: '50.00' }]
              }
            }
          ],
          insurance: false
        },
        {
          id: 'fast-cheap',
          steps: [
            {
              type: 'cross',
              tool: 'across',
              estimate: {
                executionDuration: 900, // 15 minutes
                feeCosts: [{ amountUSD: '5.00' }]
              }
            }
          ],
          insurance: true
        },
        {
          id: 'medium',
          steps: [
            {
              type: 'cross',
              tool: 'stargate',
              estimate: {
                executionDuration: 1800, // 30 minutes
                feeCosts: [{ amountUSD: '15.00' }]
              }
            }
          ],
          insurance: false
        }
      ];

      const result = lifiService.selectOptimalRoute(routes);

      // Should select the fast-cheap route due to best combination of factors
      expect(result.id).toBe('fast-cheap');
    });
  });

  describe('executeBridgeTransfer', () => {
    it('should execute bridge transfer successfully', async () => {
      const mockRoute = {
        route: { id: 'test-route' },
        bridgesUsed: ['across'],
        fromChain: 'ethereum',
        toChain: 'polygon',
        estimatedTime: 900
      };

      const mockExecution = {
        txHash: '0x123abc',
        executionId: 'exec-123'
      };

      executeRoute.mockResolvedValue(mockExecution);

      const result = await lifiService.executeBridgeTransfer({
        route: mockRoute,
        dealId: 'test-deal',
        onStatusUpdate: jest.fn(),
        onError: jest.fn()
      });

      expect(executeRoute).toHaveBeenCalledWith({
        route: mockRoute.route,
        settings: expect.objectContaining({
          updateCallback: expect.any(Function),
          switchChainHook: expect.any(Function),
          acceptSlippageUpdateHook: expect.any(Function)
        })
      });

      expect(result).toEqual({
        success: true,
        transactionHash: '0x123abc',
        route: mockRoute.route,
        bridgeUsed: ['across'],
        executionId: 'exec-123',
        dealId: 'test-deal',
        fromChain: 'ethereum',
        toChain: 'polygon',
        estimatedTime: 900,
        status: 'PENDING'
      });
    });

    it('should handle bridge execution errors', async () => {
      const mockRoute = {
        route: { id: 'test-route' }
      };

      const mockError = new Error('Bridge execution failed');
      executeRoute.mockRejectedValue(mockError);

      const onError = jest.fn();

      await expect(
        lifiService.executeBridgeTransfer({
          route: mockRoute,
          dealId: 'test-deal',
          onError
        })
      ).rejects.toThrow('LI.FI bridge execution failed: Bridge execution failed');

      expect(onError).toHaveBeenCalledWith('test-deal', mockError);
    });
  });

  describe('getTransactionStatus', () => {
    it('should return transaction status', async () => {
      const mockStatus = {
        status: 'DONE',
        substatus: 'COMPLETED',
        substatusMessage: 'Transaction completed successfully',
        fromChain: 1,
        toChain: 137,
        sending: { txHash: '0x123' },
        receiving: { txHash: '0x456' }
      };

      getStatus.mockResolvedValue(mockStatus);

      const result = await lifiService.getTransactionStatus('exec-123', 'deal-123');

      expect(getStatus).toHaveBeenCalledWith({
        bridge: 'lifi',
        txHash: 'exec-123'
      });

      expect(result).toEqual({
        dealId: 'deal-123',
        executionId: 'exec-123',
        status: 'DONE',
        substatus: 'COMPLETED',
        substatusMessage: 'Transaction completed successfully',
        fromChain: 1,
        toChain: 137,
        fromTxHash: '0x123',
        toTxHash: '0x456',
        lastUpdated: expect.any(String)
      });
    });
  });

  describe('estimateBridgeFees', () => {
    it('should estimate bridge fees correctly', async () => {
      const mockRoute = {
        totalFees: 10.5,
        gasEstimate: 0.005,
        estimatedTime: 900,
        bridgesUsed: ['across'],
        confidence: 85
      };

      // Mock the findOptimalRoute method
      jest.spyOn(lifiService, 'findOptimalRoute').mockResolvedValue(mockRoute);

      const result = await lifiService.estimateBridgeFees({
        fromChainId: 'ethereum',
        toChainId: 'polygon',
        fromTokenAddress: '0x0000000000000000000000000000000000000000',
        amount: '1000000000000000000',
        fromAddress: '0x742d35Cc6634C0532925a3b8D51d9bB98A42b4B2'
      });

      expect(result).toEqual({
        totalFees: 10.5,
        gasFees: 0.005,
        bridgeFees: 10.495,
        estimatedTime: 900,
        bridgesUsed: ['across'],
        confidence: 85
      });
    });
  });

  describe('Helper Methods', () => {
    describe('getChainId', () => {
      it('should convert network names to chain IDs', () => {
        expect(lifiService.getChainId('ethereum')).toBe(1);
        expect(lifiService.getChainId('polygon')).toBe(137);
        expect(lifiService.getChainId('bsc')).toBe(56);
        expect(lifiService.getChainId(42161)).toBe(42161);
      });
    });

    describe('getNetworkName', () => {
      it('should convert chain IDs to network names', () => {
        expect(lifiService.getNetworkName(1)).toBe('ethereum');
        expect(lifiService.getNetworkName(137)).toBe('polygon');
        expect(lifiService.getNetworkName(56)).toBe('bsc');
      });
    });

    describe('calculateTotalTime', () => {
      it('should calculate total execution time', () => {
        const route = {
          steps: [
            { estimate: { executionDuration: 300 } },
            { estimate: { executionDuration: 600 } }
          ]
        };

        expect(lifiService.calculateTotalTime(route)).toBe(900);
      });
    });

    describe('calculateTotalFees', () => {
      it('should calculate total fees in USD', () => {
        const route = {
          steps: [
            {
              estimate: {
                feeCosts: [
                  { amountUSD: '5.50' },
                  { amountUSD: '2.30' }
                ]
              }
            },
            {
              estimate: {
                feeCosts: [
                  { amountUSD: '3.20' }
                ]
              }
            }
          ]
        };

        expect(lifiService.calculateTotalFees(route)).toBe(11);
      });
    });

    describe('extractBridgeNames', () => {
      it('should extract bridge names from cross steps', () => {
        const route = {
          steps: [
            { type: 'swap', tool: 'uniswap' },
            { type: 'cross', tool: 'across' },
            { type: 'cross', tool: 'stargate' },
            { type: 'swap', tool: '1inch' }
          ]
        };

        expect(lifiService.extractBridgeNames(route)).toEqual(['across', 'stargate']);
      });
    });

    describe('calculateRouteConfidence', () => {
      it('should calculate confidence based on route characteristics', () => {
        const fastInsuredRoute = {
          steps: [{ type: 'cross' }],
          insurance: true
        };

        const slowMultiHopRoute = {
          steps: [
            { type: 'cross', estimate: { executionDuration: 4000 } },
            { type: 'cross', estimate: { executionDuration: 2000 } }
          ],
          insurance: false
        };

        // Mock calculateTotalTime for these tests
        jest.spyOn(lifiService, 'calculateTotalTime')
          .mockReturnValueOnce(900) // Fast route
          .mockReturnValueOnce(6000); // Slow route

        const fastConfidence = lifiService.calculateRouteConfidence(fastInsuredRoute);
        const slowConfidence = lifiService.calculateRouteConfidence(slowMultiHopRoute);

        expect(fastConfidence).toBeGreaterThan(slowConfidence);
        expect(fastConfidence).toBe(110); // 100 + 10 (insurance)
        expect(slowConfidence).toBe(65); // 100 - 15 (multi-hop) - 20 (slow), min 50
      });
    });
  });
}); 