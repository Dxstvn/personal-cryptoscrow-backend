// src/services/__tests__/blockchainService.test.js

import { jest } from '@jest/globals';
import { ethers as actualEthers } from 'ethers';
import { createRequire } from 'module';

// Define require early
const require = createRequire(import.meta.url);

// Mock ethers using jest.unstable_mockModule for ESM compatibility
jest.unstable_mockModule('ethers', () => {
  const mockProvider = {
    getBlockNumber: jest.fn().mockResolvedValue(12345),
    getNetwork: jest.fn().mockResolvedValue({ chainId: 1337, name: 'mocknet' }),
    send: jest.fn().mockResolvedValue({}),
    _isProvider: true,
    on: jest.fn(),
    off: jest.fn(),
    removeAllListeners: jest.fn(),
    resolveName: jest.fn().mockImplementation(name => Promise.resolve(name)),
    getBalance: jest.fn().mockResolvedValue(actualEthers.parseEther('20')),
    detectNetwork: jest.fn().mockResolvedValue({ chainId: 1337, name: 'mocknet' }),
    _start: jest.fn(),
    _stop: jest.fn(),
    // Add these to prevent infinite network detection
    ready: Promise.resolve(),
    _network: { chainId: 1337, name: 'mocknet' },
    _lastBlockNumber: 12345,
    _emitted: { block: -2 },
    _pollingInterval: -1,
    _bootstrapPoll: jest.fn(),
    // Add cleanup method
    destroy: jest.fn().mockImplementation(() => {
      mockProvider._pollingInterval = -1;
      mockProvider._bootstrapPoll.mockClear();
      return Promise.resolve();
    }),
    // Add these to properly mimic provider behavior
    _getInternalBlockNumber: jest.fn().mockResolvedValue(12345),
    _setFastBlockNumber: jest.fn(),
    _setFastBlockNumberPromise: Promise.resolve(),
    _lastNetwork: { chainId: 1337, name: 'mocknet' },
    _networkPromise: Promise.resolve({ chainId: 1337, name: 'mocknet' }),
    _events: [],
    _emitted: { block: -2 },
    _pollingInterval: -1,
    _bootstrapPoll: jest.fn(),
    _poller: null,
    _lastBlockNumber: 12345,
    _fastBlockNumber: 12345,
    _fastQueryDate: 0,
    _maxInternalBlockNumber: 12345,
    _internalBlockNumber: 12345,
    _lastBlockNumber: 12345,
    _pollingInterval: -1,
    _bootstrapPoll: jest.fn(),
    _poller: null,
    _lastBlockNumber: 12345,
    _fastBlockNumber: 12345,
    _fastQueryDate: 0,
    _maxInternalBlockNumber: 12345,
    _internalBlockNumber: 12345,
  };

  const mockContractInstance = {
    releaseFundsAfterApprovalPeriod: jest.fn(),
    cancelEscrowAndRefundBuyer: jest.fn(),
  };

  const mockWallet = jest.fn((privateKey, provider) => ({
    ...actualEthers.Wallet.fromPhrase(actualEthers.Wallet.createRandom().mnemonic.phrase),
    connect: jest.fn(() => ({ provider })),
    privateKey,
    provider,
    address: actualEthers.Wallet.createRandom().address,
  }));

  return {
    ...jest.requireActual('ethers'),
    JsonRpcProvider: jest.fn(() => mockProvider),
    Contract: jest.fn((address, abi, wallet) => mockContractInstance),
    Wallet: mockWallet,
    isAddress: jest.requireActual('ethers').isAddress,
  };
});

// Import mocked ethers
const mockEthers = await import('ethers');
const mockProviderInstance = mockEthers.JsonRpcProvider();
const mockContractInstance = mockEthers.Contract();

// Load ABI
let contractABI;
try {
  const PropertyEscrowArtifact = require('../../contract/artifacts/contracts/PropertyEscrow.sol/PropertyEscrow.json');
  contractABI = PropertyEscrowArtifact.abi;
  if (!contractABI || contractABI.length === 0) throw new Error('ABI array is empty.');
} catch (e) {
  console.error('TEST SETUP ERROR: Failed to load PropertyEscrow ABI.', e.message);
  contractABI = [{ type: 'constructor', inputs: [] }];
}

describe('Blockchain Service - Unit Tests', () => {
  const mockDealId = 'deal-unit-test';
  const validContractAddress = actualEthers.Wallet.createRandom().address;
  const dummyUnitTestPrivateKey = actualEthers.Wallet.createRandom().privateKey;
  const originalProcessEnv = { ...process.env };

  beforeEach(async () => {
    jest.resetModules();
    process.env.RPC_URL = 'http://mock-rpc-for-this-specific-test.invalid';
    process.env.BACKEND_WALLET_PRIVATE_KEY = dummyUnitTestPrivateKey;
    
    // Reset all mocks
    mockEthers.JsonRpcProvider.mockClear();
    mockProviderInstance.getBlockNumber.mockClear();
    mockEthers.Contract.mockClear();
    mockContractInstance.releaseFundsAfterApprovalPeriod.mockClear();
    mockContractInstance.cancelEscrowAndRefundBuyer.mockClear();
    mockProviderInstance.on.mockClear();
    mockProviderInstance.off.mockClear();
    mockProviderInstance.removeAllListeners.mockClear();
    
    // Silence console output during tests
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(async () => {
    // Clean up provider
    await mockProviderInstance.destroy();
    
    // Reset environment
    process.env = { ...originalProcessEnv };
    
    // Reset all mocks
    mockProviderInstance.removeAllListeners.mockReset();
    mockProviderInstance.off.mockReset();
    jest.resetAllMocks();
    jest.restoreAllMocks();
    
    // Wait for any pending promises
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  describe('Service Initialization', () => {
    it('should initialize provider and wallet with valid environment variables', async () => {
      const { triggerReleaseAfterApproval } = await import('../blockchainService.js');
      await triggerReleaseAfterApproval(validContractAddress, mockDealId);
      
      expect(mockEthers.JsonRpcProvider).toHaveBeenCalledWith(process.env.RPC_URL);
      expect(mockProviderInstance.getBlockNumber).toHaveBeenCalled();
    });

    it('should fail initialization with missing RPC_URL', async () => {
      delete process.env.RPC_URL;
      const { triggerReleaseAfterApproval } = await import('../blockchainService.js');
      const result = await triggerReleaseAfterApproval(validContractAddress, mockDealId);
      
      expect(result.success).toBe(false);
      expect(result.error.message).toContain('Initialization failed');
    });

    it('should fail initialization with missing private key', async () => {
      delete process.env.BACKEND_WALLET_PRIVATE_KEY;
      const { triggerReleaseAfterApproval } = await import('../blockchainService.js');
      const result = await triggerReleaseAfterApproval(validContractAddress, mockDealId);
      
      expect(result.success).toBe(false);
      expect(result.error.message).toContain('Initialization failed');
    });
  });

  describe('triggerReleaseAfterApproval', () => {
    it('should successfully release funds after approval period', async () => {
      const mockTx = {
        hash: '0xmockhash_release',
        wait: jest.fn().mockResolvedValue({ transactionHash: '0xmockhash_release_receipt', status: 1 }),
      };
      mockContractInstance.releaseFundsAfterApprovalPeriod.mockResolvedValue(mockTx);

      const { triggerReleaseAfterApproval } = await import('../blockchainService.js');
      const result = await triggerReleaseAfterApproval(validContractAddress, mockDealId);

      expect(mockEthers.Contract).toHaveBeenCalledWith(validContractAddress, contractABI, expect.anything());
      expect(mockContractInstance.releaseFundsAfterApprovalPeriod).toHaveBeenCalled();
      expect(mockTx.wait).toHaveBeenCalledWith(1);
      expect(result.success).toBe(true);
      expect(result.receipt?.transactionHash).toBe('0xmockhash_release_receipt');
    });

    it('should handle contract revert errors', async () => {
      const revertError = new Error('VM Exception while processing transaction: revert');
      mockContractInstance.releaseFundsAfterApprovalPeriod.mockRejectedValue(revertError);

      const { triggerReleaseAfterApproval } = await import('../blockchainService.js');
      const result = await triggerReleaseAfterApproval(validContractAddress, mockDealId);

      expect(result.success).toBe(false);
      expect(result.error.message).toContain('VM Exception');
    });

    it('should handle invalid contract address', async () => {
      const { triggerReleaseAfterApproval } = await import('../blockchainService.js');
      const result = await triggerReleaseAfterApproval('invalid-address', mockDealId);

      expect(result.success).toBe(false);
      expect(result.error.message).toBe(`[Automation] Setup error for release, contract: invalid-address, deal: ${mockDealId}`);
      expect(mockEthers.Contract).not.toHaveBeenCalled();
    });

    it('should handle transaction timeout', async () => {
      const timeoutError = new Error('Transaction timeout');
      mockContractInstance.releaseFundsAfterApprovalPeriod.mockResolvedValue({
        hash: '0xmockhash',
        wait: jest.fn().mockRejectedValue(timeoutError)
      });

      const { triggerReleaseAfterApproval } = await import('../blockchainService.js');
      const result = await triggerReleaseAfterApproval(validContractAddress, mockDealId);

      expect(result.success).toBe(false);
      expect(result.error.message).toBe('Transaction timeout');
    });

    it('should handle network errors', async () => {
      const networkError = new Error('Network error');
      mockContractInstance.releaseFundsAfterApprovalPeriod.mockRejectedValue(networkError);

      const { triggerReleaseAfterApproval } = await import('../blockchainService.js');
      const result = await triggerReleaseAfterApproval(validContractAddress, mockDealId);

      expect(result.success).toBe(false);
      expect(result.error.message).toBe('Network error');
    });
  });

  describe('triggerCancelAfterDisputeDeadline', () => {
    it('should successfully cancel escrow and refund buyer', async () => {
      const mockTx = {
        hash: '0xmockhash_cancel',
        wait: jest.fn().mockResolvedValue({ transactionHash: '0xmockhash_cancel_receipt', status: 1 }),
      };
      mockContractInstance.cancelEscrowAndRefundBuyer.mockResolvedValue(mockTx);

      const { triggerCancelAfterDisputeDeadline } = await import('../blockchainService.js');
      const result = await triggerCancelAfterDisputeDeadline(validContractAddress, mockDealId);

      expect(mockEthers.Contract).toHaveBeenCalledWith(validContractAddress, contractABI, expect.anything());
      expect(mockContractInstance.cancelEscrowAndRefundBuyer).toHaveBeenCalled();
      expect(mockTx.wait).toHaveBeenCalledWith(1);
      expect(result.success).toBe(true);
      expect(result.receipt?.transactionHash).toBe('0xmockhash_cancel_receipt');
    });

    it('should handle contract revert errors', async () => {
      const revertError = new Error('Execution reverted: Dispute conditions not met');
      mockContractInstance.cancelEscrowAndRefundBuyer.mockRejectedValue(revertError);

      const { triggerCancelAfterDisputeDeadline } = await import('../blockchainService.js');
      const result = await triggerCancelAfterDisputeDeadline(validContractAddress, mockDealId);

      expect(result.success).toBe(false);
      expect(result.error.message).toContain('Execution reverted: Dispute conditions not met');
    });

    it('should handle invalid contract address', async () => {
      const { triggerCancelAfterDisputeDeadline } = await import('../blockchainService.js');
      const result = await triggerCancelAfterDisputeDeadline('invalid-address', mockDealId);

      expect(result.success).toBe(false);
      expect(result.error.message).toBe(`[Automation] Setup error for cancellation, contract: invalid-address, deal: ${mockDealId}`);
      expect(mockEthers.Contract).not.toHaveBeenCalled();
    });

    it('should handle transaction timeout', async () => {
      const timeoutError = new Error('Transaction timeout');
      mockContractInstance.cancelEscrowAndRefundBuyer.mockResolvedValue({
        hash: '0xmockhash',
        wait: jest.fn().mockRejectedValue(timeoutError)
      });

      const { triggerCancelAfterDisputeDeadline } = await import('../blockchainService.js');
      const result = await triggerCancelAfterDisputeDeadline(validContractAddress, mockDealId);

      expect(result.success).toBe(false);
      expect(result.error.message).toBe('Transaction timeout');
    });

    it('should handle network errors', async () => {
      const networkError = new Error('Network error');
      mockContractInstance.cancelEscrowAndRefundBuyer.mockRejectedValue(networkError);

      const { triggerCancelAfterDisputeDeadline } = await import('../blockchainService.js');
      const result = await triggerCancelAfterDisputeDeadline(validContractAddress, mockDealId);

      expect(result.success).toBe(false);
      expect(result.error.message).toBe('Network error');
    });
  });
});