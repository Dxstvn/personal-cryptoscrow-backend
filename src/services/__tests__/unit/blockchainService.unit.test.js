import { jest } from '@jest/globals';
import { ethers as actualEthers } from 'ethers'; 
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const originalConsoleError = console.error; 
const originalConsoleLog = console.log; 

const topLevelRequire = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Mock Singleton Instances ---
const mockProviderSingleton = {
  getBlockNumber: jest.fn(),
  getNetwork: jest.fn().mockResolvedValue({ chainId: 1337, name: 'mocknet' }),
  send: jest.fn().mockResolvedValue({}),
  resolveName: jest.fn(name => Promise.resolve(name)),
  getBalance: jest.fn().mockResolvedValue(actualEthers.parseEther('100')),
  ready: Promise.resolve({ chainId: 1337, name: 'mocknet' }),
  _isProvider: true, _network: { chainId: 1337, name: 'mocknet' }, _events: [],
  _emitted: { block: -2 }, _pollingInterval: -1, _poller: null, _bootstrapPoll: jest.fn(),
  on: jest.fn((eventName, listener) => mockProviderSingleton),
  off: jest.fn((eventName, listener) => mockProviderSingleton),
  once: jest.fn((eventName, listener) => mockProviderSingleton),
  removeAllListeners: jest.fn((eventName) => mockProviderSingleton),
  destroy: jest.fn().mockImplementation(async () => { 
    mockProviderSingleton.getBlockNumber.mockClear();
    mockProviderSingleton.getNetwork.mockClear();
    return Promise.resolve(); 
  }),
  detectNetwork: jest.fn().mockResolvedValue({ chainId: 1337, name: 'mocknet' }),
  _getInternalBlockNumber: jest.fn().mockResolvedValue(12345),
};
const mockContractSingleton = {
  releaseFundsAfterApprovalPeriod: jest.fn(), cancelEscrowAndRefundBuyer: jest.fn(),
  getAddress: jest.fn(), runner: null, target: null,
  interface: { 
    getFunction: jest.fn(nameOrSignature => ({ name: nameOrSignature, type: 'function' })), 
    getEvent: jest.fn(nameOrSignature => ({ name: nameOrSignature, type: 'event' })), 
    format: jest.fn().mockReturnValue([]) 
  },
};
const mockWalletBase = {
  provider: mockProviderSingleton, connect: jest.fn(function(p) { this.provider = p; return this; }),
  signTransaction: jest.fn().mockResolvedValue('0xsignedMockTransaction'), getAddress: jest.fn(), 
};

let mockEthers; 

jest.unstable_mockModule('ethers', () => {
  const actualEthersLib = jest.requireActual('ethers');
  const MockJsonRpcProviderConstructor = jest.fn((url, network, options) => mockProviderSingleton);
  const MockContractConstructor = jest.fn((address, abi, runner) => { 
    mockContractSingleton.target = address;
    mockContractSingleton.runner = runner;
    return mockContractSingleton; 
  });
  const MockWalletConstructor = jest.fn((privateKey, providerInstanceWallet) => {
    if (typeof privateKey !== 'string' || !privateKey.startsWith('0x') || privateKey.length !== 66) {
        const error = new Error(`invalid arrayify value (argument="value", value="${privateKey}", code=INVALID_ARGUMENT, version=6.x.x)`);
        error.code = 'INVALID_ARGUMENT'; error.argument = 'value'; error.value = privateKey;
        throw error;
    }
    const newWalletMock = { ...mockWalletBase }; 
    newWalletMock.privateKey = privateKey;
    newWalletMock.address = actualEthersLib.computeAddress(privateKey);
    newWalletMock.provider = providerInstanceWallet || mockProviderSingleton;
    newWalletMock.getAddress = jest.fn().mockResolvedValue(newWalletMock.address);
    return newWalletMock;
  });
  return {
    JsonRpcProvider: MockJsonRpcProviderConstructor, Contract: MockContractConstructor,
    Wallet: MockWalletConstructor, isAddress: actualEthersLib.isAddress,
    computeAddress: actualEthersLib.computeAddress,
  };
});

let contractABI;
const validAbiPath = path.resolve(__dirname, '../../contract/artifacts/contracts/PropertyEscrow.sol/PropertyEscrow.json');
try {
  const PropertyEscrowArtifact = topLevelRequire(validAbiPath);
  contractABI = PropertyEscrowArtifact.abi;
  if (!contractABI || !Array.isArray(contractABI) || contractABI.length === 0) {
    throw new Error('Test setup: ABI array is empty, not an array, or undefined from valid path.');
  }
} catch (e) {
  originalConsoleError(`CRITICAL TEST SETUP ERROR: Failed to load PropertyEscrow ABI from ${validAbiPath}. Error:`, e.message);
  contractABI = [ 
    { type: 'function', name: 'releaseFundsAfterApprovalPeriod', inputs: [], outputs: [], stateMutability: 'nonpayable' },
    { type: 'function', name: 'cancelEscrowAndRefundBuyer', inputs: [], outputs: [], stateMutability: 'nonpayable' }
  ];
}

describe('Blockchain Service - Unit Tests', () => {
  const mockDealId = 'deal-unit-test';
  const validContractAddress = actualEthers.Wallet.createRandom().address;
  const dummyUnitTestPrivateKey = '0x0123456789012345678901234567890123456789012345678901234567890123';
  const expectedBackendWalletAddress = actualEthers.computeAddress(dummyUnitTestPrivateKey);
  
  let blockchainService; 
  let originalProcessEnv;

  beforeEach(async () => {
    originalProcessEnv = { ...process.env };
    jest.resetModules(); 
    mockEthers = await import('ethers'); 
    process.env.RPC_URL = 'http://mock-rpc-for-this-specific-test.invalid';
    process.env.BACKEND_WALLET_PRIVATE_KEY = dummyUnitTestPrivateKey;
    process.env.NODE_ENV = 'test';
    
    const serviceModule = await import('../blockchainService.js');
    blockchainService = serviceModule;

    mockEthers.JsonRpcProvider.mockClear(); 
    mockEthers.Contract.mockClear();
    mockEthers.Wallet.mockClear();
    mockProviderSingleton.getBlockNumber.mockClear().mockResolvedValue(12345);
    mockProviderSingleton.getNetwork.mockClear().mockResolvedValue({ chainId: 1337, name: 'mocknet' });
    mockProviderSingleton.destroy.mockClear();
    mockContractSingleton.releaseFundsAfterApprovalPeriod.mockClear();
    mockContractSingleton.cancelEscrowAndRefundBuyer.mockClear();
    mockContractSingleton.getAddress.mockClear().mockResolvedValue(validContractAddress);
    
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {}); 
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(async () => {
    process.env = originalProcessEnv; 
    if (mockProviderSingleton.destroy) await mockProviderSingleton.destroy();
    jest.clearAllMocks();   
    jest.restoreAllMocks(); 
  });

  describe('Service Initialization (initializeService)', () => {
    it('should call mocked JsonRpcProvider and Wallet only once, even if service functions are called multiple times', async () => {
      mockContractSingleton.releaseFundsAfterApprovalPeriod.mockResolvedValue({
        hash: '0xmocktx_init_check',
        wait: jest.fn().mockResolvedValue({ transactionHash: '0xmockreceipt_init_check', status: 1 }),
      });
      await blockchainService.triggerReleaseAfterApproval(validContractAddress, mockDealId); 
      await blockchainService.triggerReleaseAfterApproval(validContractAddress, mockDealId); 
      expect(mockEthers.JsonRpcProvider).toHaveBeenCalledTimes(1);
      expect(mockEthers.Wallet).toHaveBeenCalledTimes(1); 
    });

    it('should return custom initialization error if RPC_URL is missing', async () => {
      delete process.env.RPC_URL;
      const result = await blockchainService.triggerReleaseAfterApproval(validContractAddress, mockDealId);
      expect(result.success).toBe(false);
      expect(result.error.message).toContain('[Automation] Initialization failed for release.');
    });

    it('should return custom initialization error if BACKEND_WALLET_PRIVATE_KEY is missing', async () => {
      delete process.env.BACKEND_WALLET_PRIVATE_KEY;
      const result = await blockchainService.triggerReleaseAfterApproval(validContractAddress, mockDealId);
      expect(result.success).toBe(false);
      expect(result.error.message).toContain('[Automation] Initialization failed for release.');
    });

    it('should fail initialization if BACKEND_WALLET_PRIVATE_KEY is invalid format', async () => {
      process.env.BACKEND_WALLET_PRIVATE_KEY = 'invalid-key-format'; 
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const result = await blockchainService.triggerReleaseAfterApproval(validContractAddress, mockDealId);
      expect(result.success).toBe(false); 
      expect(result.error.message).toContain('[Automation] Initialization failed for release.');
      expect(mockEthers.Wallet).toHaveBeenCalledTimes(1); 
      expect(consoleErrorSpy).toHaveBeenCalledWith(
          "[BlockchainService] Error initializing provider or wallet: invalid arrayify value (argument=\"value\", value=\"invalid-key-format\", code=INVALID_ARGUMENT, version=6.x.x). Raw error:", 
          expect.objectContaining({ message: 'invalid arrayify value (argument="value", value="invalid-key-format", code=INVALID_ARGUMENT, version=6.x.x)' })
      );
      consoleErrorSpy.mockRestore();
    });

     it('should handle provider connectivity failure (getBlockNumber rejects during init)', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      mockProviderSingleton.getBlockNumber.mockRejectedValueOnce(new Error('Mock getBlockNumber connection error'));
      mockContractSingleton.releaseFundsAfterApprovalPeriod.mockResolvedValue({
        hash: '0xmocktx_conn_fail',
        wait: jest.fn().mockResolvedValue({ transactionHash: '0xmockreceipt_conn_fail', status: 1 }),
      });
      await blockchainService.triggerReleaseAfterApproval(validContractAddress, mockDealId);
      expect(mockEthers.JsonRpcProvider).toHaveBeenCalledTimes(1);
      expect(mockProviderSingleton.getBlockNumber).toHaveBeenCalledTimes(1); 
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        `[BlockchainService] Network connectivity check failed for ${process.env.RPC_URL}. Error: Mock getBlockNumber connection error`
      );
      expect(mockContractSingleton.releaseFundsAfterApprovalPeriod).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });
  });
  
  describe('ABI Loading Failure in blockchainService.js (using backdoor)', () => {
    let serviceInstanceForAbiTest;
    let consoleLogSpyForBackdoor; 

    beforeEach(async () => {
      jest.resetModules();
      mockEthers = await import('ethers'); 

      process.env.RPC_URL = 'http://mock-rpc-for-this-specific-test.invalid';
      process.env.BACKEND_WALLET_PRIVATE_KEY = dummyUnitTestPrivateKey;
      process.env.NODE_ENV = 'test';
      
      // Spy on console.log BEFORE importing the service and calling the backdoor
      consoleLogSpyForBackdoor = jest.spyOn(console, 'log').mockImplementation(() => {});
      // Also spy on console.error if the service logs errors during this path
      // const consoleErrorSpyForAbi = jest.spyOn(console, 'error').mockImplementation(() => {});


      const serviceModule = await import('../blockchainService.js');
      serviceInstanceForAbiTest = serviceModule;
      
      serviceInstanceForAbiTest.__TEST_ONLY_simulateAbiLoadingFailure();
    });
  
    it('should handle ABI loading failure gracefully when simulated via backdoor', async () => {
      const internalAbiState = serviceInstanceForAbiTest.__TEST_ONLY_getInternalAbiState();
      // Use originalConsoleLog for this specific diagnostic to ensure it's visible
      originalConsoleLog('DEBUG_TEST_ABI_STATE: Internal ABI state after backdoor:', internalAbiState === null ? 'null' : 'NOT NULL - Problem!');
      expect(internalAbiState).toBeNull(); // CRITICAL: Verify the backdoor worked as expected

      const result = await serviceInstanceForAbiTest.triggerReleaseAfterApproval(validContractAddress, mockDealId);
      
      expect(result.success).toBe(false); 
      expect(result.error.message).toContain('[Automation] ABI loading failed, cannot proceed with release.');
      expect(result.error.message).toContain('ABI loaded: false'); 
      
      expect(consoleLogSpyForBackdoor).toHaveBeenCalledWith('[BlockchainService] __TEST_ONLY_simulateAbiLoadingFailure called, setting contractABI to null');
      
      // If ABI is null, initializeService() should NOT be called by triggerReleaseAfterApproval's early exit.
      expect(mockEthers.JsonRpcProvider).not.toHaveBeenCalled(); 
      expect(mockEthers.Wallet).not.toHaveBeenCalled();         
      expect(mockEthers.Contract).not.toHaveBeenCalled(); 
    });

    afterEach(() => {
      if (consoleLogSpyForBackdoor) consoleLogSpyForBackdoor.mockRestore();
      // if (consoleErrorSpyForAbi) consoleErrorSpyForAbi.mockRestore();
    });
  });

  describe('triggerReleaseAfterApproval (Normal ABI Load)', () => {
    it('should successfully call releaseFundsAfterApprovalPeriod on mock contract', async () => {
      const mockTxResponse = {
        hash: '0xmockhash_release',
        wait: jest.fn().mockResolvedValue({ transactionHash: '0xmockhash_release_receipt', status: 1 }),
      };
      mockContractSingleton.releaseFundsAfterApprovalPeriod.mockResolvedValue(mockTxResponse);
      const result = await blockchainService.triggerReleaseAfterApproval(validContractAddress, mockDealId);
      expect(mockEthers.JsonRpcProvider).toHaveBeenCalledTimes(1); 
      expect(mockEthers.Wallet).toHaveBeenCalledTimes(1);       
      expect(mockEthers.Contract).toHaveBeenCalledTimes(1);
      expect(mockEthers.Contract).toHaveBeenCalledWith(
        validContractAddress,
        contractABI, 
        expect.objectContaining({ address: expectedBackendWalletAddress }) 
      );
      expect(mockContractSingleton.releaseFundsAfterApprovalPeriod).toHaveBeenCalledTimes(1);
      expect(mockTxResponse.wait).toHaveBeenCalledWith(1); 
      expect(result.success).toBe(true);
      expect(result.receipt?.transactionHash).toBe('0xmockhash_release_receipt');
    });

    it('should handle specific contract revert reason: "Not approved"', async () => {
      const revertError = new Error('VM Exception while processing transaction: revert Not approved by seller');
      revertError.reason = "Not approved by seller"; 
      mockContractSingleton.releaseFundsAfterApprovalPeriod.mockRejectedValue(revertError);
      const result = await blockchainService.triggerReleaseAfterApproval(validContractAddress, mockDealId);
      expect(result.success).toBe(false);
      expect(result.error.message).toContain('Not approved by seller'); 
      expect(mockEthers.Contract).toHaveBeenCalledTimes(1); 
      expect(mockContractSingleton.releaseFundsAfterApprovalPeriod).toHaveBeenCalledTimes(1);
    });
    
    it('should handle specific contract revert reason: "Already processed"', async () => {
        const revertError = new Error('VM Exception while processing transaction: revert Already processed');
        revertError.reason = "Already processed";
        mockContractSingleton.releaseFundsAfterApprovalPeriod.mockRejectedValue(revertError);
        const result = await blockchainService.triggerReleaseAfterApproval(validContractAddress, mockDealId);
        expect(result.success).toBe(false);
        expect(result.error.message).toContain('Already processed');
    });

    it('should handle pre-wait transaction sending failure (e.g., gas estimation error)', async () => {
      const sendError = new Error('transaction failed (e.g., insufficient funds for gas)');
      mockContractSingleton.releaseFundsAfterApprovalPeriod.mockRejectedValue(sendError);
      const result = await blockchainService.triggerReleaseAfterApproval(validContractAddress, mockDealId);
      expect(result.success).toBe(false);
      expect(result.error).toBe(sendError); 
      expect(mockEthers.Contract).toHaveBeenCalledTimes(1);
      expect(mockContractSingleton.releaseFundsAfterApprovalPeriod).toHaveBeenCalledTimes(1);
    });

    it('should handle invalid contract address (service logic)', async () => {
      const result = await blockchainService.triggerReleaseAfterApproval('invalid-address', mockDealId);
      expect(result.success).toBe(false);
      expect(result.error.message).toBe(`[Automation] Setup error for release, invalid contract address: invalid-address, deal: ${mockDealId}`);
      expect(mockEthers.Contract).not.toHaveBeenCalledWith('invalid-address', expect.anything(), expect.anything());
    });

    it('should handle missing dealId parameter by logging undefined but succeeding', async () => {
        mockContractSingleton.releaseFundsAfterApprovalPeriod.mockResolvedValue({
            hash: '0xmockhash_missing_dealid',
            wait: jest.fn().mockResolvedValue({ transactionHash: '0xmockreceipt_missing_dealid', status: 1 }),
        });
        const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        const result = await blockchainService.triggerReleaseAfterApproval(validContractAddress, undefined); 
        expect(result.success).toBe(true); 
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining(`(Deal ID: undefined)`));
        consoleLogSpy.mockRestore(); 
    });

    it('should handle transaction timeout (mocked wait rejection)', async () => {
      const timeoutError = new Error('Transaction timeout');
      mockContractSingleton.releaseFundsAfterApprovalPeriod.mockResolvedValue({
        hash: '0xmockhash_timeout',
        wait: jest.fn().mockRejectedValue(timeoutError) 
      });
      const result = await blockchainService.triggerReleaseAfterApproval(validContractAddress, mockDealId);
      expect(result.success).toBe(false);
      expect(result.error.message).toBe('Transaction timeout');
      expect(mockEthers.Contract).toHaveBeenCalledTimes(1);
      expect(mockContractSingleton.releaseFundsAfterApprovalPeriod).toHaveBeenCalledTimes(1);
    });
  });

  describe('triggerCancelAfterDisputeDeadline', () => {
    it('should successfully call cancelEscrowAndRefundBuyer on mock contract', async () => {
      const mockTxResponse = {
        hash: '0xmockhash_cancel',
        wait: jest.fn().mockResolvedValue({ transactionHash: '0xmockhash_cancel_receipt', status: 1 }),
      };
      mockContractSingleton.cancelEscrowAndRefundBuyer.mockResolvedValue(mockTxResponse);
      const result = await blockchainService.triggerCancelAfterDisputeDeadline(validContractAddress, mockDealId);
      expect(mockEthers.JsonRpcProvider).toHaveBeenCalledTimes(1);
      expect(mockEthers.Wallet).toHaveBeenCalledTimes(1);
      expect(mockEthers.Contract).toHaveBeenCalledTimes(1);
      expect(mockEthers.Contract).toHaveBeenCalledWith(validContractAddress, contractABI, expect.objectContaining({ address: expectedBackendWalletAddress }));
      expect(mockContractSingleton.cancelEscrowAndRefundBuyer).toHaveBeenCalledTimes(1);
      expect(mockTxResponse.wait).toHaveBeenCalledWith(1);
      expect(result.success).toBe(true);
      expect(result.receipt?.transactionHash).toBe('0xmockhash_cancel_receipt');
    });

    it('should handle specific contract revert reason: "Dispute not active"', async () => {
      const revertError = new Error('Execution reverted: Dispute not active or deadline not passed');
      revertError.reason = "Dispute not active or deadline not passed";
      mockContractSingleton.cancelEscrowAndRefundBuyer.mockRejectedValue(revertError);
      const result = await blockchainService.triggerCancelAfterDisputeDeadline(validContractAddress, mockDealId);
      expect(result.success).toBe(false);
      expect(result.error.message).toContain('Dispute not active or deadline not passed');
      expect(mockEthers.Contract).toHaveBeenCalledTimes(1);
      expect(mockContractSingleton.cancelEscrowAndRefundBuyer).toHaveBeenCalledTimes(1);
    });

    it('should handle pre-wait transaction sending failure for cancellation', async () => {
        const sendError = new Error('cancellation transaction failed');
        mockContractSingleton.cancelEscrowAndRefundBuyer.mockRejectedValue(sendError);
        const result = await blockchainService.triggerCancelAfterDisputeDeadline(validContractAddress, mockDealId);
        expect(result.success).toBe(false);
        expect(result.error).toBe(sendError);
        expect(mockEthers.Contract).toHaveBeenCalledTimes(1);
        expect(mockContractSingleton.cancelEscrowAndRefundBuyer).toHaveBeenCalledTimes(1);
      });
    
    it('should handle invalid contract address for cancellation (service logic)', async () => {
      const result = await blockchainService.triggerCancelAfterDisputeDeadline('invalid-address-cancel', mockDealId);
      expect(result.success).toBe(false);
      expect(result.error.message).toBe(`[Automation] Setup error for cancellation, invalid contract address: invalid-address-cancel, deal: ${mockDealId}`);
      expect(mockEthers.Contract).not.toHaveBeenCalledWith('invalid-address-cancel', expect.anything(), expect.anything());
    });
  });
}); 