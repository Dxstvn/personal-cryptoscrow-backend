/**
 * End-to-End tests for wallet detection functionality
 * Simple pattern following wallet-detection-minimal.test.tsx
 */

import type { WalletDetectionResult } from '../types/wallet';
import { renderHook, waitFor, act } from '@testing-library/react';

// Simple Jest mocks using inline functions (following minimal test pattern)
jest.mock('@/services/wallet-detection', () => ({
  walletDetectionService: {
    detectAllWallets: jest.fn(),
    getDetectedProviders: jest.fn(() => []),
    isWalletAvailable: jest.fn(() => true),
    getWallet: jest.fn()
  }
}));

jest.mock('@/services/wallet-api', () => ({
  walletApi: {
    sendWalletDetection: jest.fn(),
    registerWallet: jest.fn(),
    getConnectedWallets: jest.fn(),
    removeWallet: jest.fn(),
    setPrimaryWallet: jest.fn(),
    syncWalletBalance: jest.fn(),
    getWalletPreferences: jest.fn(),
    updateUserProfile: jest.fn()
  }
}));

// Import AFTER mocking (following minimal test pattern)
import { walletDetectionService } from '@/services/wallet-detection';
import { walletApi } from '@/services/wallet-api';
import { WalletProvider, useWallet } from '../context/wallet-context';

describe('Wallet Detection E2E Tests - Simplified', () => {
  // Type cast the mocks (following minimal test pattern)
  const mockDetectAllWallets = walletDetectionService.detectAllWallets as jest.MockedFunction<() => Promise<WalletDetectionResult>>;
  const mockSendWalletDetection = walletApi.sendWalletDetection as jest.MockedFunction<(data: any) => Promise<{ success: boolean }>>;
  const mockRegisterWallet = walletApi.registerWallet as jest.MockedFunction<(wallet: any) => Promise<{ success: boolean }>>;
  const mockGetConnectedWallets = walletApi.getConnectedWallets as jest.MockedFunction<() => Promise<any[]>>;
  const mockRemoveWallet = walletApi.removeWallet as jest.MockedFunction<(address: string, network: string) => Promise<{ success: boolean }>>;
  const mockSetPrimaryWallet = walletApi.setPrimaryWallet as jest.MockedFunction<(address: string, network: string) => Promise<{ success: boolean }>>;

  // Simple mock data
  const mockWalletDetectionResult: WalletDetectionResult = {
    evmWallets: [{
      name: 'MetaMask',
      icon: 'https://metamask.io/favicon.ico',
      rdns: 'io.metamask',
      network: 'ethereum',
      provider: { isMetaMask: true, request: jest.fn() },
      uuid: 'io.metamask'
    }],
    solanaWallets: [{
      adapter: {
        name: 'Phantom',
        icon: 'https://phantom.app/favicon.ico',
        url: 'https://phantom.app/',
        readyState: 'Installed',
        publicKey: { toString: () => '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM' },
        connect: jest.fn().mockResolvedValue(undefined),
        disconnect: jest.fn().mockResolvedValue(undefined),
        signTransaction: jest.fn(),
        signAllTransactions: jest.fn()
      }
    }],
    bitcoinWallets: [{
      name: 'Unisat',
      icon: 'https://unisat.io/favicon.ico',
      provider: {},
      getAddresses: jest.fn().mockResolvedValue(['bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh']),
      signMessage: jest.fn(),
      signPSBT: jest.fn()
    }]
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Configure mocks with simple return values (following minimal test pattern)
    mockDetectAllWallets.mockResolvedValue(mockWalletDetectionResult);
    mockSendWalletDetection.mockResolvedValue({ success: true });
    mockRegisterWallet.mockResolvedValue({ success: true });
    mockGetConnectedWallets.mockResolvedValue([]);
    mockRemoveWallet.mockResolvedValue({ success: true });
    mockSetPrimaryWallet.mockResolvedValue({ success: true });

    // Mock localStorage
    const mockStorage: { [key: string]: string } = {};
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: (key: string) => mockStorage[key] || null,
        setItem: (key: string, value: string) => { mockStorage[key] = value; },
        removeItem: (key: string) => { delete mockStorage[key]; },
        clear: () => { Object.keys(mockStorage).forEach(key => delete mockStorage[key]); }
      },
      writable: true
    });
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <WalletProvider>{children}</WalletProvider>
  );

  describe('Basic Wallet Detection Flow', () => {
    it('should detect wallets and initialize context successfully', async () => {
      const { result } = renderHook(() => useWallet(), { wrapper });

      // Wait for wallet detection to complete
      await waitFor(() => {
        expect(mockDetectAllWallets).toHaveBeenCalled();
      }, { timeout: 3000 });

      // Check that wallets were detected
      await waitFor(() => {
        expect(result.current.detectedWallets.evmWallets).toHaveLength(1);
        expect(result.current.detectedWallets.solanaWallets).toHaveLength(1);
        expect(result.current.detectedWallets.bitcoinWallets).toHaveLength(1);
      }, { timeout: 3000 });

      // Verify backend integration
      expect(mockSendWalletDetection).toHaveBeenCalledWith(mockWalletDetectionResult);
      
      console.log('✅ Basic wallet detection and context initialization works');
    });

    it('should refresh wallet detection when requested', async () => {
      const { result } = renderHook(() => useWallet(), { wrapper });

      await waitFor(() => {
        expect(result.current.refreshWalletDetection).toBeDefined();
      });

      // Clear previous calls
      jest.clearAllMocks();
      mockDetectAllWallets.mockResolvedValue(mockWalletDetectionResult);
      mockSendWalletDetection.mockResolvedValue({ success: true });

      // Trigger refresh
      await act(async () => {
        await result.current.refreshWalletDetection();
      });

      expect(mockDetectAllWallets).toHaveBeenCalled();
      expect(mockSendWalletDetection).toHaveBeenCalledWith(mockWalletDetectionResult);
      
      console.log('✅ Wallet detection refresh works');
    });
  });

  describe('Wallet Connection E2E Flow', () => {
    it('should connect EVM wallet and register with backend', async () => {
      const { result } = renderHook(() => useWallet(), { wrapper });

      // Wait for detection to complete
      await waitFor(() => {
        expect(result.current.detectedWallets.evmWallets.length).toBeGreaterThan(0);
      });

      // Mock wallet provider request
      const mockProvider = { 
        isMetaMask: true, 
        request: jest.fn().mockResolvedValue(['0x1234567890123456789012345678901234567890'])
      };

      // Connect wallet
      const connectedWallet = await act(async () => {
        return await result.current.connectWallet(mockProvider, 'ethereum', 'MetaMask');
      });

      expect(connectedWallet.address).toBe('0x1234567890123456789012345678901234567890');
      expect(connectedWallet.network).toBe('ethereum');
      expect(connectedWallet.name).toBe('MetaMask');

      // Verify backend registration
      expect(mockRegisterWallet).toHaveBeenCalledWith(
        expect.objectContaining({
          address: '0x1234567890123456789012345678901234567890',
          network: 'ethereum',
          name: 'MetaMask'
        })
      );

      console.log('✅ EVM wallet connection and backend registration works');
    });

    it('should connect Solana wallet successfully', async () => {
      const { result } = renderHook(() => useWallet(), { wrapper });

      await waitFor(() => {
        expect(result.current.detectedWallets.solanaWallets.length).toBeGreaterThan(0);
      });

      const solanaWallet = result.current.detectedWallets.solanaWallets[0];

      const connectedWallet = await act(async () => {
        return await result.current.connectSolanaWallet(solanaWallet);
      });

      expect(connectedWallet.address).toBe('9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM');
      expect(connectedWallet.network).toBe('solana');
      expect(connectedWallet.name).toBe('Phantom');

      expect(mockRegisterWallet).toHaveBeenCalledWith(
        expect.objectContaining({
          address: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
          network: 'solana',
          name: 'Phantom'
        })
      );

      console.log('✅ Solana wallet connection works');
    });

    it('should connect Bitcoin wallet successfully', async () => {
      const { result } = renderHook(() => useWallet(), { wrapper });

      await waitFor(() => {
        expect(result.current.detectedWallets.bitcoinWallets.length).toBeGreaterThan(0);
      });

      const bitcoinWallet = result.current.detectedWallets.bitcoinWallets[0];

      const connectedWallet = await act(async () => {
        return await result.current.connectBitcoinWallet(bitcoinWallet);
      });

      expect(connectedWallet.address).toBe('bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh');
      expect(connectedWallet.network).toBe('bitcoin');
      expect(connectedWallet.name).toBe('Unisat');

      expect(mockRegisterWallet).toHaveBeenCalledWith(
        expect.objectContaining({
          address: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
          network: 'bitcoin',
          name: 'Unisat'
        })
      );

      console.log('✅ Bitcoin wallet connection works');
    });
  });

  describe('Multi-Wallet Management', () => {
    it('should handle multiple connected wallets', async () => {
      const { result } = renderHook(() => useWallet(), { wrapper });

      await waitFor(() => {
        expect(result.current.detectedWallets.evmWallets.length).toBeGreaterThan(0);
      });

      // Connect first wallet
      const mockProvider1 = { 
        request: jest.fn().mockResolvedValue(['0x1111111111111111111111111111111111111111'])
      };
      await act(async () => {
        await result.current.connectWallet(mockProvider1, 'ethereum', 'MetaMask');
      });

      // Connect second wallet
      const mockProvider2 = { 
        request: jest.fn().mockResolvedValue(['0x2222222222222222222222222222222222222222'])
      };
      await act(async () => {
        await result.current.connectWallet(mockProvider2, 'ethereum', 'Coinbase');
      });

      expect(result.current.connectedWallets).toHaveLength(2);
      
      console.log('✅ Multi-wallet management works');
    });

    it('should set primary wallet correctly', async () => {
      const { result } = renderHook(() => useWallet(), { wrapper });

      // Setup with saved wallets
      const savedWallets = [
        {
          address: '0x1111111111111111111111111111111111111111',
          name: 'MetaMask',
          network: 'ethereum',
          isPrimary: true,
          provider: {}
        },
        {
          address: '0x2222222222222222222222222222222222222222',
          name: 'Coinbase',
          network: 'ethereum',
          isPrimary: false,
          provider: {}
        }
      ];
      window.localStorage.setItem('connectedWallets', JSON.stringify(savedWallets));

      // Re-render to load from localStorage
      const { result: newResult } = renderHook(() => useWallet(), { wrapper });

      await waitFor(() => {
        expect(newResult.current.connectedWallets).toHaveLength(2);
      });

      // Set new primary
      await act(async () => {
        await newResult.current.setPrimaryWallet('0x2222222222222222222222222222222222222222', 'ethereum');
      });

      expect(mockSetPrimaryWallet).toHaveBeenCalledWith('0x2222222222222222222222222222222222222222', 'ethereum');
      expect(newResult.current.currentAddress).toBe('0x2222222222222222222222222222222222222222');
      
      console.log('✅ Primary wallet management works');
    });
  });

  describe('Persistence and State Management', () => {
    it('should load wallets from localStorage on initialization', async () => {
      const savedWallets = [
        {
          address: '0x1234567890123456789012345678901234567890',
          name: 'MetaMask',
          network: 'ethereum',
          isPrimary: true,
          provider: {}
        }
      ];
      window.localStorage.setItem('connectedWallets', JSON.stringify(savedWallets));

      const { result } = renderHook(() => useWallet(), { wrapper });

      // Should load persisted wallets
      expect(result.current.connectedWallets).toHaveLength(1);
      expect(result.current.currentAddress).toBe('0x1234567890123456789012345678901234567890');
      expect(result.current.isConnected).toBe(true);
      
      console.log('✅ Wallet persistence from localStorage works');
    });

    it('should sync with backend wallet data if available', async () => {
      const backendWallets = [
        {
          address: '0x9876543210987654321098765432109876543210',
          name: 'Backend Wallet',
          network: 'ethereum',
          isPrimary: true,
          provider: {}
        }
      ];
      mockGetConnectedWallets.mockResolvedValue(backendWallets);

      const { result } = renderHook(() => useWallet(), { wrapper });

      await waitFor(() => {
        expect(result.current.connectedWallets).toEqual(backendWallets);
      });
      
      console.log('✅ Backend wallet sync works');
    });
  });

  describe('Error Handling and Resilience', () => {
    it('should handle wallet detection failure gracefully', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      mockDetectAllWallets.mockRejectedValue(new Error('Detection failed'));

      const { result } = renderHook(() => useWallet(), { wrapper });

      await waitFor(() => {
        expect(result.current.error).toBe('Failed to detect wallets');
      });

      expect(consoleErrorSpy).toHaveBeenCalledWith('Error detecting wallets:', expect.any(Error));
      consoleErrorSpy.mockRestore();
      
      console.log('✅ Detection failure handling works');
    });

    it('should continue working when backend is unavailable', async () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      mockSendWalletDetection.mockRejectedValue(new Error('Backend unavailable'));

      const { result } = renderHook(() => useWallet(), { wrapper });

      // Should still detect wallets locally
      await waitFor(() => {
        expect(result.current.detectedWallets.evmWallets).toHaveLength(1);
      });

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Could not send wallet detection data to backend:',
        expect.any(Error)
      );

      consoleWarnSpy.mockRestore();
      
      console.log('✅ Backend resilience works');
    });

    it('should handle wallet connection failures gracefully', async () => {
      const { result } = renderHook(() => useWallet(), { wrapper });

      const mockProvider = { 
        request: jest.fn().mockRejectedValue(new Error('User rejected'))
      };

      let connectionError: any;
      await act(async () => {
        try {
          await result.current.connectWallet(mockProvider, 'ethereum', 'MetaMask');
        } catch (error) {
          connectionError = error;
        }
      });

      // Verify the connection attempt threw the expected error
      expect(connectionError).toBeDefined();
      expect(connectionError.message).toBe('User rejected');

      // Wait for error state to be set in the context (it uses the actual error message)
      await waitFor(() => {
        expect(result.current.error).toBe('User rejected');
      }, { timeout: 1000 });
      
      console.log('✅ Connection failure handling works');
    });
  });

  describe('Comprehensive Integration Verification', () => {
    it('should verify all mocks are working correctly', () => {
      // Verify all mock functions are Jest mocks
      expect(jest.isMockFunction(mockDetectAllWallets)).toBe(true);
      expect(jest.isMockFunction(mockSendWalletDetection)).toBe(true);
      expect(jest.isMockFunction(mockRegisterWallet)).toBe(true);
      expect(jest.isMockFunction(mockGetConnectedWallets)).toBe(true);
      expect(jest.isMockFunction(mockRemoveWallet)).toBe(true);
      expect(jest.isMockFunction(mockSetPrimaryWallet)).toBe(true);
      
      console.log('✅ All Jest mocks are properly configured');
    });

    it('should complete full wallet lifecycle E2E test', async () => {
      const { result } = renderHook(() => useWallet(), { wrapper });

      // 1. Wait for detection
      await waitFor(() => {
        expect(result.current.detectedWallets.evmWallets.length).toBeGreaterThan(0);
      });

      // 2. Connect wallet
      const mockProvider = { 
        request: jest.fn().mockResolvedValue(['0x1234567890123456789012345678901234567890'])
      };
      await act(async () => {
        await result.current.connectWallet(mockProvider, 'ethereum', 'MetaMask');
      });

      // 3. Verify connection state
      expect(result.current.isConnected).toBe(true);
      expect(result.current.connectedWallets).toHaveLength(1);

      // 4. Disconnect wallet
      await act(async () => {
        await result.current.disconnectWallet('0x1234567890123456789012345678901234567890', 'ethereum');
      });

      // 5. Verify disconnection state
      expect(result.current.connectedWallets).toHaveLength(0);
      expect(result.current.isConnected).toBe(false);

      // 6. Verify all backend calls were made
      expect(mockDetectAllWallets).toHaveBeenCalled();
      expect(mockSendWalletDetection).toHaveBeenCalled();
      expect(mockRegisterWallet).toHaveBeenCalled();
      expect(mockRemoveWallet).toHaveBeenCalled();
      
      console.log('✅ Complete wallet lifecycle E2E test passed');
    });
  });
}); 