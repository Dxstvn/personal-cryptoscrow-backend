/**
 * Setup file for Hardhat tests with Vitest
 * Initializes Hardhat environment for testing
 */

import { beforeAll, afterAll } from 'vitest';
import { execSync } from 'child_process';
import { config as dotenvConfig } from 'dotenv';
import path from 'path';

// Load environment variables
dotenvConfig({ path: path.join(process.cwd(), '.env') });

// Set test environment
process.env.NODE_ENV = 'test';
process.env.HARDHAT_NETWORK = 'hardhat';

// Configure test wallets
process.env.BACKEND_WALLET_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
process.env.SERVICE_WALLET_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

let hardhatProcess;

beforeAll(async () => {
  console.log('🚀 Starting Hardhat node for tests...');
  
  // Start Hardhat node in the background
  try {
    // Check if Hardhat is already running
    try {
      execSync('curl -s http://localhost:8545', { stdio: 'ignore' });
      console.log('✅ Hardhat node already running');
    } catch (error) {
      // Start Hardhat if not running
      console.log('Starting new Hardhat node...');
      const { spawn } = await import('child_process');
      hardhatProcess = spawn('npx', ['hardhat', 'node'], {
        cwd: path.join(process.cwd(), 'src/contract'),
        detached: true,
        stdio: 'ignore'
      });
      
      // Wait for Hardhat to start
      await new Promise(resolve => setTimeout(resolve, 5000));
      console.log('✅ Hardhat node started');
    }
  } catch (error) {
    console.error('Failed to start Hardhat node:', error);
    throw error;
  }
});

afterAll(async () => {
  console.log('🛑 Cleaning up Hardhat node...');
  
  if (hardhatProcess) {
    try {
      // Kill the process group
      process.kill(-hardhatProcess.pid);
    } catch (error) {
      console.error('Error stopping Hardhat:', error);
    }
  }
});

// Global test utilities
global.testUtils = {
  // Generate a random address
  randomAddress: () => {
    const { ethers } = require('ethers');
    return ethers.Wallet.createRandom().address;
  },
  
  // Wait for transaction
  waitForTx: async (tx) => {
    const receipt = await tx.wait();
    return receipt;
  },
  
  // Mine blocks
  mineBlocks: async (numBlocks = 1) => {
    const { ethers } = require('hardhat');
    for (let i = 0; i < numBlocks; i++) {
      await ethers.provider.send('evm_mine');
    }
  },
  
  // Increase time
  increaseTime: async (seconds) => {
    const { ethers } = require('hardhat');
    await ethers.provider.send('evm_increaseTime', [seconds]);
    await ethers.provider.send('evm_mine');
  },
  
  // Get block timestamp
  getBlockTimestamp: async () => {
    const { ethers } = require('hardhat');
    const block = await ethers.provider.getBlock('latest');
    return block.timestamp;
  }
};