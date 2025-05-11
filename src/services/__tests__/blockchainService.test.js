// src/services/__tests__/blockchainService.test.js

// STEP 1: Set mock ENV VARS at the VERY TOP, before any other code.
// This influences the first time Jest's module loader might see blockchainService.js.
// Use a valid format for the private key, even if it's a dummy for this initial load.
const initialDummyPrivateKey = '0x0123456789012345678901234567890123456789012345678901234567890123';
process.env.RPC_URL = 'http://jest-initial-mock-rpc.invalid'; // Invalid TLD to prevent actual attempts
process.env.BACKEND_WALLET_PRIVATE_KEY = initialDummyPrivateKey;

// STEP 2: Import Jest functions and actualEthers for test utilities
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { ethers as actualEthers } from 'ethers';
import { createRequire } from 'module';

// STEP 3: Define mock functions that will be used by jest.mock
const mockEthersContractConstructor = jest.fn();
const mockJsonRpcProviderInstance = {
  getBlockNumber: jest.fn(),
  getBalance: jest.fn(),
  detectNetwork: jest.fn(),
  // Add any other methods that ethers.Wallet might call on a provider instance during its construction or use
  _isProvider: true, // Some internal checks might look for this
  resolveName: jest.fn(name => Promise.resolve(name)), // If wallet tries to resolve ENS names
  getNetwork: jest.fn(() => Promise.resolve({ name: 'mocknet', chainId: 1337 })) // Mimic getNetwork - Corrected
};
const mockEthersJsonRpcProviderConstructor = jest.fn(() => mockJsonRpcProviderInstance);
let mockContractInstance; // Will hold the instance returned by mockEthersContractConstructor

// STEP 4: Mock the 'ethers' module. This is hoisted by Jest.
jest.mock('ethers', () => {
  const originalEthersModule = jest.requireActual('ethers');
  return {
    ...originalEthersModule, // Keep other ethers utilities real (Wallet, utils, etc.)
    JsonRpcProvider: mockEthersJsonRpcProviderConstructor, // Crucially mock the constructor
    Contract: mockEthersContractConstructor,
  };
});

// --- Dynamically Imported Service Variables ---
// These will be assigned in beforeEach after the service is dynamically imported
let triggerReleaseAfterApproval;
let triggerCancelAfterDisputeDeadline;

// --- Static Test Setup (like ABI loading) ---
const require = createRequire(import.meta.url);
let contractABI;
try {
    const PropertyEscrowArtifact = require('../../contract/artifacts/contracts/PropertyEscrow.sol/PropertyEscrow.json');
    contractABI = PropertyEscrowArtifact.abi;
    if (!contractABI || contractABI.length === 0) throw new Error("ABI array is empty.");
} catch (e) {
    console.error("TEST SETUP ERROR: Failed to load PropertyEscrow ABI. This is critical for tests.", e.message);
    contractABI = [{ "type": "constructor", "inputs": [] }]; // Minimal valid ABI to prevent crashes
}

describe('Blockchain Service - Unit Tests', () => {
  const mockDealId = 'deal-unit-test';
  const validContractAddress = actualEthers.Wallet.createRandom().address;
  const dummyUnitTestPrivateKey = actualEthers.Wallet.createRandom().privateKey;
  const originalProcessEnv = { ...process.env }; // Store to restore after each test

  beforeEach(async () => {
    // Reset modules to ensure blockchainService.js is re-evaluated with current mocks/env
    jest.resetModules();

    // Set specific environment variables for this test run *before* dynamic import
    process.env.RPC_URL = 'http://mock-rpc-for-this-specific-test.invalid';
    process.env.BACKEND_WALLET_PRIVATE_KEY = dummyUnitTestPrivateKey;

    // Clear all mock call history and reset implementations if they were changed
    mockEthersContractConstructor.mockClear();
    mockEthersJsonRpcProviderConstructor.mockClear();
    
    // Configure default resolved values for mocked provider methods for this test
    mockJsonRpcProviderInstance.getBlockNumber.mockClear().mockResolvedValue(12345);
    mockJsonRpcProviderInstance.getBalance.mockClear().mockResolvedValue(actualEthers.parseEther('20'));
    mockJsonRpcProviderInstance.detectNetwork.mockClear().mockResolvedValue({ name: 'testnet', chainId: 1337 });
    mockJsonRpcProviderInstance.resolveName.mockClear().mockImplementation(name => Promise.resolve(name));
    mockJsonRpcProviderInstance.getNetwork.mockClear().mockResolvedValue({ name: 'testnet_mock', chainId: 1337000 }); // Corrected


    // Dynamically import the service *after* resetting modules and setting env/mocks
    const serviceModule = await import('../blockchainService.js');
    triggerReleaseAfterApproval = serviceModule.triggerReleaseAfterApproval;
    triggerCancelAfterDisputeDeadline = serviceModule.triggerCancelAfterDisputeDeadline;

    // Setup the mock contract instance that our mocked ethers.Contract constructor will return
    mockContractInstance = {
      releaseFundsAfterApprovalPeriod: jest.fn(),
      cancelEscrowAndRefundBuyer: jest.fn(),
    };
    mockEthersContractConstructor.mockImplementation(() => mockContractInstance);
    
    // Suppress console output during tests
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = { ...originalProcessEnv }; // Restore original environment
    jest.restoreAllMocks(); // Restore spied console methods, etc.
  });

  it('service initialization should use mocked JsonRpcProvider and call its methods', async () => {
    // blockchainService.js is imported in beforeEach, which triggers its initialization.
    // Verify that the mocked JsonRpcProvider constructor was called with the RPC_URL set in beforeEach.
    expect(mockEthersJsonRpcProviderConstructor).toHaveBeenCalledWith(process.env.RPC_URL);
    
    // Allow any microtasks from the service's initialization (like .then() blocks) to complete.
    await new Promise(process.nextTick); 
    
    // Verify that getBlockNumber on the *instance* returned by the mocked constructor was called.
    expect(mockJsonRpcProviderInstance.getBlockNumber).toHaveBeenCalled();
  });

  describe('triggerReleaseAfterApproval', () => {
    it('should call releaseFundsAfterApprovalPeriod on the contract and return success', async () => {
      const mockTx = { 
        hash: '0xmockhash_release', 
        wait: jest.fn().mockResolvedValue({ transactionHash: '0xmockhash_release_receipt', status: 1 }) 
      };
      mockContractInstance.releaseFundsAfterApprovalPeriod.mockResolvedValue(mockTx);

      const result = await triggerReleaseAfterApproval(validContractAddress, mockDealId);

      expect(mockEthersContractConstructor).toHaveBeenCalledWith(
        validContractAddress,
        contractABI, 
        expect.any(actualEthers.Wallet) // Wallet from blockchainService
      );
      expect(mockContractInstance.releaseFundsAfterApprovalPeriod).toHaveBeenCalled();
      expect(mockTx.wait).toHaveBeenCalledWith(1);
      expect(result.success).toBe(true);
      expect(result.receipt?.transactionHash).toBe('0xmockhash_release_receipt');
    });

    it('should return failure if contract call reverts', async () => {
      const revertError = new Error('VM Exception while processing transaction: revert');
      mockContractInstance.releaseFundsAfterApprovalPeriod.mockRejectedValue(revertError);
      
      const result = await triggerReleaseAfterApproval(validContractAddress, mockDealId);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe(revertError); // Check for the specific error instance
      expect(result.error.message).toContain('VM Exception');
    });

    it('should return failure for an invalid contract address', async () => {
      const result = await triggerReleaseAfterApproval('invalid-address', mockDealId);
      
      expect(result.success).toBe(false);
      expect(result.error.message).toBe(`[Automation] Setup error for release, contract: invalid-address, deal: ${mockDealId}`);
      expect(mockEthersContractConstructor).not.toHaveBeenCalled();
    });

    it('should return failure if wallet is not initialized (e.g. missing private key)', async () => {
        jest.resetModules();
        process.env.RPC_URL = 'http://mock-rpc-for-this-test.invalid';
        delete process.env.BACKEND_WALLET_PRIVATE_KEY; // Simulate missing key for this specific import

        const serviceModule = await import('../blockchainService.js');
        const { triggerReleaseAfterApproval: newTrigger } = serviceModule;
        
        const result = await newTrigger(validContractAddress, mockDealId);
        expect(result.success).toBe(false);
        // The error comes from getContractInstance because `wallet` will be null in the service
        expect(result.error.message).toContain('Wallet or ABI not initialized');
    });

    it('should return failure if contractABI in service is null (simulating load failure)', async () => {
        jest.resetModules();
        process.env.RPC_URL = 'http://mock-rpc-for-this-test.invalid';
        process.env.BACKEND_WALLET_PRIVATE_KEY = dummyUnitTestPrivateKey;

        const originalCreateRequire = module.constructor.prototype.require;
        module.constructor.prototype.require = jest.fn((path) => {
            if (path.includes('PropertyEscrow.sol/PropertyEscrow.json')) {
                throw new Error("Simulated ABI load failure via require mock");
            }
            return originalCreateRequire(path);
        });


        const serviceModule = await import('../blockchainService.js');
        const { triggerReleaseAfterApproval: newTrigger } = serviceModule;

        const result = await newTrigger(validContractAddress, mockDealId);
        expect(result.success).toBe(false);
        expect(result.error.message).toContain('Wallet or ABI not initialized');
        
        module.constructor.prototype.require = originalCreateRequire; 
    });
  });

  describe('triggerCancelAfterDisputeDeadline', () => {
    it('should call cancelEscrowAndRefundBuyer on the contract and return success', async () => {
      const mockTx = { 
        hash: '0xmockhash_cancel', 
        wait: jest.fn().mockResolvedValue({ transactionHash: '0xmockhash_cancel_receipt', status: 1 }) 
      };
      mockContractInstance.cancelEscrowAndRefundBuyer.mockResolvedValue(mockTx);

      const result = await triggerCancelAfterDisputeDeadline(validContractAddress, mockDealId);
      
      expect(mockEthersContractConstructor).toHaveBeenCalledWith(validContractAddress, contractABI, expect.any(actualEthers.Wallet));
      expect(mockContractInstance.cancelEscrowAndRefundBuyer).toHaveBeenCalled();
      expect(mockTx.wait).toHaveBeenCalledWith(1);
      expect(result.success).toBe(true);
      expect(result.receipt?.transactionHash).toBe('0xmockhash_cancel_receipt');
    });

    it('should return failure if contract call reverts', async () => {
      const revertError = new Error('Execution reverted: Dispute conditions not met');
      mockContractInstance.cancelEscrowAndRefundBuyer.mockRejectedValue(revertError);
      
      const result = await triggerCancelAfterDisputeDeadline(validContractAddress, mockDealId);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe(revertError);
      expect(result.error.message).toContain('Execution reverted: Dispute conditions not met');
    });
  });
});
