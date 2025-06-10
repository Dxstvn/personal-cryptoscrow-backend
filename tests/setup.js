// tests/setup.js
import { jest } from '@jest/globals';

// Set up test environment
process.env.NODE_ENV = 'test';

// Extend Jest matchers for better assertions
expect.extend({
  toBeValidAddress(received) {
    const addressRegex = /^0x[a-fA-F0-9]{40}$/;
    const pass = addressRegex.test(received);
    if (pass) {
      return {
        message: () => `expected ${received} not to be a valid Ethereum address`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be a valid Ethereum address`,
        pass: false,
      };
    }
  },

  toBeValidTransactionHash(received) {
    const txHashRegex = /^0x[a-fA-F0-9]{64}$/;
    const pass = txHashRegex.test(received);
    if (pass) {
      return {
        message: () => `expected ${received} not to be a valid transaction hash`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be a valid transaction hash`,
        pass: false,
      };
    }
  },

  toBeValidChainId(received) {
    const pass = typeof received === 'number' && received > 0;
    if (pass) {
      return {
        message: () => `expected ${received} not to be a valid chain ID`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be a valid chain ID`,
        pass: false,
      };
    }
  },

  toHaveBridgeRoute(received) {
    const pass = received && 
                 received.route && 
                 received.bridgesUsed && 
                 received.estimatedTime &&
                 received.totalFees !== undefined;
    if (pass) {
      return {
        message: () => `expected route not to have valid bridge route structure`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected route to have valid bridge route structure`,
        pass: false,
      };
    }
  },

  toHaveValidCrossChainTransaction(received) {
    const pass = received &&
                 received.id &&
                 received.dealId &&
                 received.fromAddress &&
                 received.toAddress &&
                 received.amount &&
                 received.sourceNetwork &&
                 received.targetNetwork &&
                 received.status &&
                 Array.isArray(received.steps);
    if (pass) {
      return {
        message: () => `expected transaction not to have valid cross-chain transaction structure`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected transaction to have valid cross-chain transaction structure`,
        pass: false,
      };
    }
  }
});

// Mock console methods to reduce noise in tests
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

beforeEach(() => {
  // Only mock in test environment if NODE_ENV is 'test' and not debugging
  if (process.env.NODE_ENV === 'test' && !process.env.DEBUG_TESTS) {
    console.log = jest.fn();
    console.error = jest.fn();
    console.warn = jest.fn();
  }
});

afterEach(() => {
  // Restore console methods
  if (process.env.NODE_ENV === 'test' && !process.env.DEBUG_TESTS) {
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
    console.warn = originalConsoleWarn;
  }
  
  // Clear all mocks
  jest.clearAllMocks();
});

// Global test utilities
global.testUtils = {
  // Generate valid test addresses with enhanced validation
  generateTestAddress: () => {
    const randomHex = Math.random().toString(16).substring(2, 42).padStart(40, '0');
    return '0x' + randomHex;
  },

  // Generate valid transaction hash
  generateTestTxHash: () => {
    const randomHex = Math.random().toString(16).substring(2, 66).padStart(64, '0');
    return '0x' + randomHex;
  },

  // Wait for a specified time (useful for async tests)
  wait: (ms) => new Promise(resolve => setTimeout(resolve, ms)),

  // Enhanced mock LI.FI route response with realistic data
  createMockLiFiRoute: (overrides = {}) => ({
    route: {
      id: overrides.routeId || `route-${Date.now()}`,
      steps: overrides.steps || [
        {
          type: 'cross',
          tool: 'across',
          toolDetails: { name: 'Across Protocol' },
          estimate: {
            executionDuration: 900,
            feeCosts: [{ amountUSD: '5.50', amount: '5.50' }],
            gasCosts: [{ amount: '21000' }]
          }
        }
      ],
      ...overrides.route
    },
    estimatedTime: overrides.estimatedTime || 900,
    totalFees: overrides.totalFees || 5.5,
    bridgesUsed: overrides.bridgesUsed || ['across'],
    confidence: overrides.confidence || 85,
    gasEstimate: overrides.gasEstimate || 21000,
    fromChain: overrides.fromChain || 'ethereum',
    toChain: overrides.toChain || 'polygon',
    validatedTokens: overrides.validatedTokens || {
      from: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      to: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619'
    },
    ...overrides
  }),

  // Enhanced mock wallet data with network-specific details
  createMockWallet: (overrides = {}) => ({
    address: overrides.address || globalThis.testUtils.generateTestAddress(),
    network: overrides.network || 'ethereum',
    name: overrides.name || 'Test Wallet',
    isPrimary: overrides.isPrimary || false,
    balance: overrides.balance || '0',
    nativeCurrency: overrides.nativeCurrency || 'ETH',
    ...overrides
  }),

  // Enhanced mock deal data with cross-chain specific fields
  createMockDeal: (overrides = {}) => ({
    dealId: overrides.dealId || 'deal-' + Math.random().toString(36).substring(7),
    buyerWallet: overrides.buyerWallet || globalThis.testUtils.createMockWallet({ network: 'ethereum' }),
    sellerWallet: overrides.sellerWallet || globalThis.testUtils.createMockWallet({ network: 'polygon' }),
    amount: overrides.amount || '1000000000000000000', // 1 ETH
    tokenAddress: overrides.tokenAddress || '0x0000000000000000000000000000000000000000',
    propertyAddress: overrides.propertyAddress || 'property-test-123',
    escrowContract: overrides.escrowContract || globalThis.testUtils.generateTestAddress(),
    crossChainEnabled: overrides.crossChainEnabled !== undefined ? overrides.crossChainEnabled : true,
    ...overrides
  }),

  // Validation helpers for testing
  validators: {
    isValidEthereumAddress: (address) => /^0x[a-fA-F0-9]{40}$/.test(address),
    isValidTransactionHash: (hash) => /^0x[a-fA-F0-9]{64}$/.test(hash),
    isValidChainId: (chainId) => typeof chainId === 'number' && chainId > 0,
    isValidAmount: (amount) => /^\d+$/.test(amount) && BigInt(amount) > 0n,
    isValidNetwork: (network) => ['ethereum', 'polygon', 'bsc', 'arbitrum', 'optimism', 'avalanche'].includes(network)
  }
};

// Set up error handling for unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit the process in tests, just log
});

// Environment configuration based on test type
if (process.env.TEST_TYPE === 'integration') {
  // Configuration for integration tests
  console.log('🔄 Setting up integration test environment...');
  
  // Check if Tenderly credentials are available
  if (process.env.TENDERLY_ACCESS_KEY) {
    console.log('✅ Tenderly credentials found - simulation tests enabled');
  } else {
    console.warn('⚠️  Tenderly credentials not found - using mocked simulations');
  }
  
  // Check if LI.FI API key is available
  if (process.env.LIFI_API_KEY) {
    console.log('✅ LI.FI API key found - real API tests enabled');
  } else {
    console.warn('⚠️  LI.FI API key not found - using mocked responses');
  }
  
} else if (process.env.TEST_TYPE === 'unit') {
  // Configuration for unit tests
  console.log('🧪 Setting up unit test environment...');
  
} else {
  // Default configuration
  console.log('🔧 Setting up default test environment...');
}

// Enhanced test data constants with real-world addresses and amounts
globalThis.TEST_CONSTANTS = {
  ADDRESSES: {
    BUYER: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',      // Vitalik's address
    SELLER: '0x742d35Cc6634C0532925a3b8D51d9bB98A42b4B2',     // Random valid address
    ESCROW_TEMPLATE: '0x1234567890123456789012345678901234567890', // Mock template
    WETH_ETHEREUM: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',  // Mainnet WETH
    WETH_POLYGON: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',   // Polygon WETH
    USDC_ETHEREUM: '0xA0b86a33E6441b5c52E6F2c1ecAa63e4d1B28d37',  // Mainnet USDC
    USDC_POLYGON: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',   // Polygon USDC
    LIFI_ROUTER: '0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE'     // LI.FI router
  },
  AMOUNTS: {
    SMALL: '100000000000000000',    // 0.1 ETH
    MEDIUM: '1000000000000000000',  // 1 ETH
    LARGE: '5000000000000000000',   // 5 ETH
    EXTRA_LARGE: '10000000000000000000' // 10 ETH
  },
  NETWORKS: {
    ETHEREUM: 'ethereum',
    POLYGON: 'polygon',
    BSC: 'bsc',
    ARBITRUM: 'arbitrum',
    OPTIMISM: 'optimism',
    AVALANCHE: 'avalanche'
  },
  CHAIN_IDS: {
    ETHEREUM: 1,
    POLYGON: 137,
    BSC: 56,
    ARBITRUM: 42161,
    OPTIMISM: 10,
    AVALANCHE: 43114
  },
  TOKENS: {
    NATIVE: '0x0000000000000000000000000000000000000000',
    WETH_ETHEREUM: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    WETH_POLYGON: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619'
  },
  BRIDGE_PROTOCOLS: {
    ACROSS: 'across',
    STARGATE: 'stargate',
    HOP: 'hop',
    CONNEXT: 'connext',
    POLYGON_BRIDGE: 'polygon',
    ARBITRUM_BRIDGE: 'arbitrum'
  },
  TENDERLY: {
    SIMULATION_DELAY: 100, // ms
    MAX_SIMULATIONS_PER_TEST: 10,
    DEFAULT_GAS_LIMIT: '300000',
    DEFAULT_GAS_PRICE: '20000000000' // 20 gwei
  }
};

export default {}; 