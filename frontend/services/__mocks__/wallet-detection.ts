import type { WalletDetectionResult } from '../../types/wallet';

// Create mock functions that can be imported and controlled from tests
export const mockDetectAllWallets = jest.fn() as jest.MockedFunction<() => Promise<WalletDetectionResult>>;
export const mockGetDetectedProviders = jest.fn(() => []);
export const mockIsWalletAvailable = jest.fn(() => true);
export const mockGetWallet = jest.fn();

// Mock wallet detection service
export const walletDetectionService = {
  detectAllWallets: mockDetectAllWallets,
  getDetectedProviders: mockGetDetectedProviders,
  isWalletAvailable: mockIsWalletAvailable,
  getWallet: mockGetWallet
};

// Mock class for factory exports
export class WalletDetectionService {
  detectAllWallets = mockDetectAllWallets;
  getDetectedProviders = mockGetDetectedProviders;
  isWalletAvailable = mockIsWalletAvailable;
  getWallet = mockGetWallet;
} 