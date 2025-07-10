// Import the hardhat-toolbox which bundles common plugins
require("@nomicfoundation/hardhat-toolbox");
// Import dotenv to load environment variables
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
require("hardhat-gas-reporter");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.28", // Matches your package.json, compatible with ^0.8.20
    settings: {
      optimizer: {
        enabled: true,
        runs: 1, // Maximum optimization for contract size
      },
      viaIR: true, // Enable IR-based optimization for better size reduction
    },
  },
  networks: {
    hardhat: {
      // Configuration for the local Hardhat Network (used for testing)
      // No specific config needed for basic testing, but you can add options like forking here
    },
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL || "", // Get RPC URL from .env
      accounts: process.env.DEPLOYER_PRIVATE_KEY !== undefined
        ? [process.env.DEPLOYER_PRIVATE_KEY]
        : [], // Get private key from .env
      chainId: 11155111, // Sepolia's chain ID
      timeout: 600000, // 10 minutes
    },
    "polygon-amoy": {
      url: process.env.POLYGON_AMOY_RPC_URL || "", // Get RPC URL from .env
      accounts: process.env.DEPLOYER_PRIVATE_KEY !== undefined
        ? [process.env.DEPLOYER_PRIVATE_KEY]
        : [], // Get private key from .env
      chainId: 80002, // Polygon Amoy's chain ID
      timeout: 600000, // 10 minutes
    },
    "arbitrum-sepolia": {
      url: process.env.ARBITRUM_SEPOLIA_RPC_URL || "", // Get RPC URL from .env
      accounts: process.env.DEPLOYER_PRIVATE_KEY !== undefined
        ? [process.env.DEPLOYER_PRIVATE_KEY]
        : [], // Get private key from .env
      chainId: 421614, // Arbitrum Sepolia's chain ID
      timeout: 600000, // 10 minutes
    },
    "arbitrum-one": {
      url: process.env.ARBITRUM_ONE_RPC_URL || "", // Get RPC URL from .env
      accounts: process.env.ARBITRUM_ONE_PRIVATE_KEY !== undefined
        ? [process.env.ARBITRUM_ONE_PRIVATE_KEY]
        : [], // Get private key from .env
      chainId: 42161, // Arbitrum One's chain ID
    },
    mainnet: {
      url: process.env.MAINNET_RPC_URL || "", // Get RPC URL from .env
      accounts: process.env.MAINNET_PRIVATE_KEY !== undefined
        ? [process.env.MAINNET_PRIVATE_KEY]
        : [], // Get private key from .env
      chainId: 1, // Ethereum Mainnet's chain ID
    },
  },
  etherscan: {
    // Your API key for Etherscan
    // Obtain one at https://etherscan.io/
    apiKey: process.env.ETHERSCAN_API_KEY || "", // Get Etherscan API key from .env
  },
  sourcify: {
    // Disabled by default
    // Doesn't need an API key
    enabled: false, // Set to true to enable automatic source code verification with Sourcify
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS !== undefined,
    currency: "USD",
    coinmarketcap: process.env.COINMARKETCAP_API_KEY, // Optional: for USD conversion
    // outputFile: "gas-report.txt", // Optional: to save report to a file
    // noColors: true, // Optional: if outputting to file
  },
  paths: {
    sources: "./contracts", // Where your .sol files are
    tests: "./test", // Where your test files are
    cache: "./cache",
    artifacts: "./artifacts" // Where compilation output goes
  },
  mocha: {
    timeout: 600000 // 10 minutes timeout for tests
  }
};
