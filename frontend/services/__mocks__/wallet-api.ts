// Create mock functions that can be imported and controlled from tests
export const mockSendWalletDetection = jest.fn() as jest.MockedFunction<(data: any) => Promise<{ success: boolean }>>;
export const mockRegisterWallet = jest.fn() as jest.MockedFunction<(wallet: any) => Promise<{ success: boolean }>>;
export const mockGetConnectedWallets = jest.fn() as jest.MockedFunction<() => Promise<any[]>>;
export const mockRemoveWallet = jest.fn() as jest.MockedFunction<(address: string, network: string) => Promise<{ success: boolean }>>;
export const mockSetPrimaryWallet = jest.fn() as jest.MockedFunction<(address: string, network: string) => Promise<{ success: boolean }>>;
export const mockSyncWalletBalance = jest.fn() as jest.MockedFunction<(address: string, network: string, balance: string) => Promise<{ success: boolean }>>;
export const mockGetWalletPreferences = jest.fn() as jest.MockedFunction<() => Promise<any>>;
export const mockUpdateUserProfile = jest.fn() as jest.MockedFunction<(updates: any) => Promise<{ success: boolean }>>;

// Mock wallet API service
export const walletApi = {
  sendWalletDetection: mockSendWalletDetection,
  registerWallet: mockRegisterWallet,
  getConnectedWallets: mockGetConnectedWallets,
  removeWallet: mockRemoveWallet,
  setPrimaryWallet: mockSetPrimaryWallet,
  syncWalletBalance: mockSyncWalletBalance,
  getWalletPreferences: mockGetWalletPreferences,
  updateUserProfile: mockUpdateUserProfile
};

// Mock class for factory exports
export class WalletApiService {
  sendWalletDetection = mockSendWalletDetection;
  registerWallet = mockRegisterWallet;
  getConnectedWallets = mockGetConnectedWallets;
  removeWallet = mockRemoveWallet;
  setPrimaryWallet = mockSetPrimaryWallet;
  syncWalletBalance = mockSyncWalletBalance;
  getWalletPreferences = mockGetWalletPreferences;
  updateUserProfile = mockUpdateUserProfile;
}

// Default export for backward compatibility
export default {
  registerWallet: mockRegisterWallet,
  getConnectedWallets: mockGetConnectedWallets,
  removeWallet: mockRemoveWallet
}; 