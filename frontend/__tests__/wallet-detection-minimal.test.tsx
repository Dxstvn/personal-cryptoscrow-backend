/**
 * Minimal wallet detection mocking test
 * To demonstrate the basic mocking approach that works
 */

import type { WalletDetectionResult } from '../types/wallet';
import { renderHook, waitFor } from '@testing-library/react';

// Mock the wallet detection service with proper Jest mocking
jest.mock('@/services/wallet-detection', () => ({
  walletDetectionService: {
    detectAllWallets: jest.fn(),
  }
}));

jest.mock('@/services/wallet-api', () => ({
  walletApi: {
    sendWalletDetection: jest.fn(),
    registerWallet: jest.fn(),
    getConnectedWallets: jest.fn(() => Promise.resolve([])),
    removeWallet: jest.fn(),
    setPrimaryWallet: jest.fn(),
    syncWalletBalance: jest.fn(),
    getWalletPreferences: jest.fn(),
    updateUserProfile: jest.fn()
  }
}));

// Import the services AFTER mocking
import { walletDetectionService } from '@/services/wallet-detection';
import { walletApi } from '@/services/wallet-api';
import { WalletProvider, useWallet } from '../context/wallet-context';

describe('Minimal Wallet Detection Mocking', () => {
  const mockDetectAllWallets = walletDetectionService.detectAllWallets as jest.MockedFunction<() => Promise<WalletDetectionResult>>;
  const mockSendWalletDetection = walletApi.sendWalletDetection as jest.MockedFunction<(data: any) => Promise<{ success: boolean }>>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Configure the mock to return a simple result
    mockDetectAllWallets.mockResolvedValue({
      evmWallets: [{
        name: 'MetaMask',
        icon: 'https://metamask.io/favicon.ico',
        rdns: 'io.metamask',
        network: 'ethereum',
        provider: { isMetaMask: true },
        uuid: 'io.metamask'
      }],
      solanaWallets: [],
      bitcoinWallets: []
    });

    mockSendWalletDetection.mockResolvedValue({ success: true });
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <WalletProvider>{children}</WalletProvider>
  );

  it('should verify that Jest mocking is working', () => {
    // Verify that our functions are indeed Jest mocks
    expect(jest.isMockFunction(mockDetectAllWallets)).toBe(true);
    expect(jest.isMockFunction(mockSendWalletDetection)).toBe(true);
    
    console.log('✅ Jest mocking is working correctly');
  });

  it('should call wallet detection service when wallet context initializes', async () => {
    const { result } = renderHook(() => useWallet(), { wrapper });

    // Wait for the wallet detection to be called
    await waitFor(() => {
      expect(mockDetectAllWallets).toHaveBeenCalled();
    }, { timeout: 3000 });

    // Check that wallets were detected
    await waitFor(() => {
      expect(result.current.detectedWallets.evmWallets.length).toBeGreaterThan(0);
    }, { timeout: 3000 });

    console.log('✅ Wallet detection service was called');
    console.log('✅ Detected wallets:', result.current.detectedWallets);
    
    // Verify the backend API was also called
    expect(mockSendWalletDetection).toHaveBeenCalled();
    console.log('✅ Backend API was called');
  });

  it('should return mocked wallet data', async () => {
    const { result } = renderHook(() => useWallet(), { wrapper });

    await waitFor(() => {
      expect(result.current.detectedWallets.evmWallets).toHaveLength(1);
      expect(result.current.detectedWallets.evmWallets[0].name).toBe('MetaMask');
    }, { timeout: 3000 });

    console.log('✅ Mocked wallet data is returned correctly');
  });
}); 