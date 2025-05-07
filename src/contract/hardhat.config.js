// Import the hardhat-toolbox which bundles common plugins
require("@nomicfoundation/hardhat-toolbox");
// Import dotenv to load environment variables
require('dotenv/config');
require("hardhat-gas-reporter");


/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.28", // Matches your package.json, compatible with ^0.8.20
    settings: {
      optimizer: {
        enabled: true,
        runs: 200, // Standard optimization
      },
    },
  },
  networks: {
    hardhat: {
      // Configuration for the local Hardhat Network (used for testing)
      // No specific config needed for basic testing, but you can add options like forking here
    },
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL || "", // Get RPC URL from .env
      accounts: process.env.SEPOLIA_PRIVATE_KEY !== undefined
        ? [process.env.SEPOLIA_PRIVATE_KEY]
        : [], // Get private key from .env
      chainId: 11155111, // Sepolia's chain ID
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
    timeout: 40000 // Increase timeout for tests if needed (e.g., for forking tests)
  }
};
