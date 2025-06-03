/**
 * Debug test for wallet context mocking issues
 */

// Mock services before importing anything else
jest.mock('@/services/wallet-detection', () => ({
  walletDetectionService: {
    detectAllWallets: jest.fn().mockResolvedValue({
      evmWallets: [{
        name: 'MetaMask',
        icon: 'https://metamask.io/favicon.ico',
        rdns: 'io.metamask',
        network: 'ethereum',
        provider: { isMetaMask: true },
        uuid: 'io.metamask'
      }],
      solanaWallets: [{
        adapter: {
          name: 'Phantom',
          icon: 'https://phantom.app/favicon.ico',
          url: 'https://phantom.app/',
          readyState: 'Installed',
          publicKey: null,
          connect: jest.fn(),
          disconnect: jest.fn(),
          signTransaction: jest.fn(),
          signAllTransactions: jest.fn()
        }
      }],
      bitcoinWallets: []
    })
  }
}));

jest.mock('@/services/wallet-api', () => ({
  walletApi: {
    sendWalletDetection: jest.fn().mockResolvedValue({ success: true }),
    registerWallet: jest.fn().mockResolvedValue({ success: true }),
    getConnectedWallets: jest.fn().mockResolvedValue([]),
    removeWallet: jest.fn().mockResolvedValue({ success: true }),
    setPrimaryWallet: jest.fn().mockResolvedValue({ success: true }),
    syncWalletBalance: jest.fn().mockResolvedValue({ success: true }),
    getWalletPreferences: jest.fn().mockResolvedValue({}),
    updateUserProfile: jest.fn().mockResolvedValue({ success: true })
  }
}));

import { renderHook, waitFor } from '@testing-library/react';
import { WalletProvider, useWallet } from '../context/wallet-context';
import { walletDetectionService } from '@/services/wallet-detection';
import { walletApi } from '@/services/wallet-api';

// Set up mock window objects
beforeAll(() => {
  (window as any).ethereum = { isMetaMask: true };
  (window as any).localStorage = {
    getItem: jest.fn(() => null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
    clear: jest.fn()
  };
});

describe('Wallet Context Debug', () => {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <WalletProvider>{children}</WalletProvider>
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should verify mocks are set up correctly', () => {
    expect(jest.isMockFunction(walletDetectionService.detectAllWallets)).toBe(true);
    expect(jest.isMockFunction(walletApi.sendWalletDetection)).toBe(true);
    
    console.log('walletDetectionService.detectAllWallets is mock:', jest.isMockFunction(walletDetectionService.detectAllWallets));
    console.log('walletApi.sendWalletDetection is mock:', jest.isMockFunction(walletApi.sendWalletDetection));
  });

  it('should call wallet detection on context mount', async () => {
    console.log('Rendering wallet provider...');
    
    const { result } = renderHook(() => useWallet(), { wrapper });
    
    console.log('Initial state:', result.current.detectedWallets);
    
    // Wait for detection to complete
    await waitFor(() => {
      console.log('Checking if detectAllWallets was called...');
      console.log('Mock calls:', (walletDetectionService.detectAllWallets as jest.Mock).mock.calls.length);
      expect(walletDetectionService.detectAllWallets).toHaveBeenCalled();
    }, { timeout: 5000 });

    // Check if state was updated
    await waitFor(() => {
      console.log('Detected wallets:', result.current.detectedWallets);
      expect(result.current.detectedWallets.evmWallets.length).toBeGreaterThan(0);
    }, { timeout: 5000 });

    expect(walletApi.sendWalletDetection).toHaveBeenCalled();
  });

  it('should test direct service call', async () => {
    console.log('Testing direct service call...');
    const result = await walletDetectionService.detectAllWallets();
    console.log('Direct call result:', result);
    
    expect(result.evmWallets).toHaveLength(1);
    expect(walletDetectionService.detectAllWallets).toHaveBeenCalled();
  });
}); 