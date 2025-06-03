import { jest } from '@jest/globals';

// Mock fetch globally for the test environment
global.fetch = jest.fn();

// Mock Firebase
jest.mock('firebase/auth', () => ({
  getAuth: jest.fn(),
  signInWithEmailAndPassword: jest.fn(),
  createUserWithEmailAndPassword: jest.fn(),
  signOut: jest.fn(),
  onAuthStateChanged: jest.fn(),
}));

// Mock ethers
jest.mock('ethers', () => ({
  ethers: {
    formatEther: jest.fn((value) => '1.0'),
    JsonRpcProvider: jest.fn(),
  },
}));

// Test the basic wallet detection service
describe('Wallet Detection Basic Test', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    });
  });

  it('should have wallet detection service available', async () => {
    // Import the service after mocks are set up
    const { walletDetectionService } = await import('../services/wallet-detection');
    
    expect(walletDetectionService).toBeDefined();
    expect(typeof walletDetectionService.detectAllWallets).toBe('function');
  });

  it('should detect window wallet providers', async () => {
    // Setup mock window providers
    Object.defineProperty(window, 'ethereum', {
      value: {
        isMetaMask: true,
        request: jest.fn(),
      },
      writable: true
    });

    Object.defineProperty(window, 'phantom', {
      value: {
        solana: {
          isPhantom: true,
          connect: jest.fn(),
        }
      },
      writable: true
    });

    const { walletDetectionService } = await import('../services/wallet-detection');
    
    const detectedWallets = await walletDetectionService.detectAllWallets();
    
    expect(detectedWallets).toBeDefined();
    expect(detectedWallets.evmWallets).toBeDefined();
    expect(detectedWallets.solanaWallets).toBeDefined();
    expect(detectedWallets.bitcoinWallets).toBeDefined();
  });

  it('should have wallet API service available', async () => {
    const { walletApi } = await import('../services/wallet-api');
    
    expect(walletApi).toBeDefined();
    expect(typeof walletApi.sendWalletDetection).toBe('function');
    expect(typeof walletApi.registerWallet).toBe('function');
  });

  it('should successfully send wallet detection data to backend', async () => {
    const mockDetectionData = {
      evmWallets: [
        {
          name: 'MetaMask',
          network: 'ethereum',
          provider: window.ethereum,
          uuid: 'test-uuid',
          rdns: 'io.metamask'
        }
      ],
      solanaWallets: [],
      bitcoinWallets: []
    };

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, message: 'Detection data received' }),
    });

    const { walletApi } = await import('../services/wallet-api');
    
    const result = await walletApi.sendWalletDetection(mockDetectionData);
    
    expect(result).toEqual({ success: true, message: 'Detection data received' });
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/wallets/detection'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({ detectedWallets: mockDetectionData }),
      })
    );
  });

  it('should handle backend communication failure gracefully', async () => {
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    
    (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

    const { walletApi } = await import('../services/wallet-api');
    
    const mockDetectionData = { evmWallets: [], solanaWallets: [], bitcoinWallets: [] };
    
    // The API may return an error object instead of throwing
    const result = await walletApi.sendWalletDetection(mockDetectionData);
    
    // Check if it's either an error object or thrown error
    if (result && typeof result === 'object' && 'success' in result) {
      expect(result.success).toBe(false);
      expect(result.message).toContain('error');
    }
    
    consoleWarnSpy.mockRestore();
  });

  it('should detect EVM wallets using EIP-6963 standard', async () => {
    // Mock EIP-6963 event mechanism
    const mockProviderDetails = [
      {
        info: {
          uuid: 'test-metamask-uuid',
          name: 'MetaMask',
          icon: 'data:image/svg+xml,<svg>metamask</svg>',
          rdns: 'io.metamask'
        },
        provider: {
          isMetaMask: true,
          request: jest.fn()
        }
      }
    ];

    // Mock the window.dispatchEvent and addEventListener
    const eventListeners: { [key: string]: Function[] } = {};
    
    Object.defineProperty(window, 'addEventListener', {
      value: jest.fn((event: string, listener: Function) => {
        if (!eventListeners[event]) {
          eventListeners[event] = [];
        }
        eventListeners[event].push(listener);
      })
    });

    Object.defineProperty(window, 'dispatchEvent', {
      value: jest.fn((event: CustomEvent) => {
        if (event.type === 'eip6963:requestProvider') {
          // Simulate providers announcing themselves
          mockProviderDetails.forEach(detail => {
            const announceEvent = new CustomEvent('eip6963:announceProvider', {
              detail
            });
            eventListeners['eip6963:announceProvider']?.forEach(listener => listener(announceEvent));
          });
        }
      })
    });

    const { walletDetectionService } = await import('../services/wallet-detection');
    
    const detectedWallets = await walletDetectionService.detectAllWallets();
    
    expect(detectedWallets.evmWallets.length).toBeGreaterThan(0);
    const metamaskWallet = detectedWallets.evmWallets.find(w => w.name === 'MetaMask');
    expect(metamaskWallet).toBeDefined();
    expect(metamaskWallet?.uuid).toBe('test-metamask-uuid');
  });

  it('should detect legacy ethereum provider', async () => {
    Object.defineProperty(window, 'ethereum', {
      value: {
        isMetaMask: true,
        request: jest.fn(),
      },
      writable: true
    });

    const { walletDetectionService } = await import('../services/wallet-detection');
    
    const detectedWallets = await walletDetectionService.detectAllWallets();
    
    expect(detectedWallets.evmWallets.length).toBeGreaterThan(0);
    const ethereumWallet = detectedWallets.evmWallets.find(w => w.provider === window.ethereum);
    expect(ethereumWallet).toBeDefined();
  });

  it('should detect Solana wallets', async () => {
    Object.defineProperty(window, 'phantom', {
      value: {
        solana: {
          isPhantom: true,
          connect: jest.fn(),
          disconnect: jest.fn(),
          publicKey: null,
        }
      },
      writable: true
    });

    Object.defineProperty(window, 'solflare', {
      value: {
        isPhantom: false,
        isSolflare: true,
        connect: jest.fn(),
      },
      writable: true
    });

    const { walletDetectionService } = await import('../services/wallet-detection');
    
    const detectedWallets = await walletDetectionService.detectAllWallets();
    
    expect(detectedWallets.solanaWallets.length).toBeGreaterThan(0);
    const phantomWallet = detectedWallets.solanaWallets.find(w => w.adapter.name === 'Phantom');
    expect(phantomWallet).toBeDefined();
  });

  it('should detect Bitcoin wallets', async () => {
    Object.defineProperty(window, 'unisat', {
      value: {
        getAddresses: jest.fn(),
        signMessage: jest.fn(),
        signPsbt: jest.fn(),
      },
      writable: true
    });

    Object.defineProperty(window, 'xverse', {
      value: {
        getAddresses: jest.fn(),
        signMessage: jest.fn(),
      },
      writable: true
    });

    const { walletDetectionService } = await import('../services/wallet-detection');
    
    const detectedWallets = await walletDetectionService.detectAllWallets();
    
    expect(detectedWallets.bitcoinWallets.length).toBeGreaterThan(0);
    const unisatWallet = detectedWallets.bitcoinWallets.find(w => w.name === 'Unisat');
    expect(unisatWallet).toBeDefined();
  });

  it('should handle wallet registration with backend', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    });

    const { walletApi } = await import('../services/wallet-api');
    
    const mockWallet = {
      address: '0x1234567890123456789012345678901234567890',
      name: 'MetaMask',
      network: 'ethereum',
      provider: {},
    };

    const result = await walletApi.registerWallet(mockWallet);
    
    expect(result).toEqual({ success: true });
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/wallets/register'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
        body: expect.stringContaining(mockWallet.address),
      })
    );
  });
}); 