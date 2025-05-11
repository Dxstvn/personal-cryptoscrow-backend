// src/services/blockchainService.js
import { ethers } from 'ethers';
import { createRequire } from 'module';

// --- Environment Variable Check ---
const RPC_URL = process.env.RPC_URL;
const BACKEND_PRIVATE_KEY = process.env.BACKEND_WALLET_PRIVATE_KEY;

// --- Lazy Initialization ---
let provider;
let wallet;
let contractABI;

// Function to initialize provider and wallet
function initializeService() {
  if (!RPC_URL || !BACKEND_PRIVATE_KEY) {
    console.warn("[BlockchainService] Missing RPC_URL or BACKEND_WALLET_PRIVATE_KEY. Automated tasks will be disabled.");
    return false;
  }
  try {
    provider = new ethers.JsonRpcProvider(RPC_URL);
    wallet = new ethers.Wallet(BACKEND_PRIVATE_KEY, provider);
    console.log(`[BlockchainService] Automation service initialized. Using wallet: ${wallet.address}`);
    // Test connectivity
    provider.getBlockNumber().then(blockNumber => {
      console.log(`[BlockchainService] Successfully connected to network. Current block: ${blockNumber}`);
    }).catch(err => {
      console.error(`[BlockchainService] Failed to connect to network at ${RPC_URL}. Error: ${err.message}`);
    });
    return true;
  } catch (error) {
    console.error(`[BlockchainService] Error initializing provider or wallet: ${error.message}`);
    provider = null;
    wallet = null;
    return false;
  }
}

// --- Load Contract ABI ---
try {
  const require = createRequire(import.meta.url);
  const PropertyEscrowArtifact = require('../contract/artifacts/contracts/PropertyEscrow.sol/PropertyEscrow.json');
  contractABI = PropertyEscrowArtifact.abi;
  if (!contractABI || contractABI.length === 0) {
    throw new Error("ABI is empty or undefined.");
  }
  console.log("[BlockchainService] PropertyEscrow ABI loaded successfully.");
} catch (err) {
  console.error(`[BlockchainService] Failed to load PropertyEscrow ABI. Automated tasks will fail. Error: ${err.message}`);
  contractABI = null;
}

/**
 * Helper to create a contract instance.
 * @param {string} contractAddress The address of the PropertyEscrow contract.
 * @returns {ethers.Contract | null} Contract instance or null if setup is incomplete.
 */
function getContractInstance(contractAddress) {
  if (!wallet || !contractABI) {
    console.error(`[BlockchainService] Cannot create contract instance for ${contractAddress}: Wallet or ABI not initialized.`);
    return null;
  }
  if (!ethers.isAddress(contractAddress)) {
    console.error(`[BlockchainService] Invalid contract address provided: ${contractAddress}`);
    return null;
  }
  return new ethers.Contract(contractAddress, contractABI, wallet);
}

/**
 * Calls releaseFundsAfterApprovalPeriod on a given escrow contract.
 * @param {string} contractAddress The address of the PropertyEscrow contract.
 * @param {string} dealId The ID of the deal for logging purposes.
 * @returns {Promise<{success: boolean, receipt?: ethers.TransactionReceipt, error?: any}>}
 */
export async function triggerReleaseAfterApproval(contractAddress, dealId) {
  if (!provider || !wallet) {
    if (!initializeService()) {
      return { success: false, error: new Error(`[Automation] Initialization failed for release, contract: ${contractAddress}, deal: ${dealId}`) };
    }
  }
  const escrowContract = getContractInstance(contractAddress);
  if (!escrowContract) {
    return { success: false, error: new Error(`[Automation] Setup error for release, contract: ${contractAddress}, deal: ${dealId}`) };
  }

  console.log(`[Automation] Attempting to call releaseFundsAfterApprovalPeriod for contract: ${contractAddress} (Deal ID: ${dealId})`);
  try {
    const tx = await escrowContract.releaseFundsAfterApprovalPeriod();
    console.log(`[Automation] releaseFundsAfterApprovalPeriod tx sent: ${tx.hash} for contract ${contractAddress} (Deal ID: ${dealId})`);
    const receipt = await tx.wait(1);
    console.log(`[Automation] releaseFundsAfterApprovalPeriod tx CONFIRMED: ${receipt.transactionHash} for contract ${contractAddress} (Deal ID: ${dealId})`);
    return { success: true, receipt };
  } catch (error) {
    console.error(`[Automation] ERROR calling releaseFundsAfterApprovalPeriod for ${contractAddress} (Deal ID: ${dealId}):`, error.message);
    return { success: false, error };
  }
}

/**
 * Calls cancelEscrowAndRefundBuyer on a given escrow contract.
 * @param {string} contractAddress The address of the PropertyEscrow contract.
 * @param {string} dealId The ID of the deal for logging purposes.
 * @returns {Promise<{success: boolean, receipt?: ethers.TransactionReceipt, error?: any}>}
 */
export async function triggerCancelAfterDisputeDeadline(contractAddress, dealId) {
  if (!provider || !wallet) {
    if (!initializeService()) {
      return { success: false, error: new Error(`[Automation] Initialization failed for cancellation, contract: ${contractAddress}, deal: ${dealId}`) };
    }
  }
  const escrowContract = getContractInstance(contractAddress);
  if (!escrowContract) {
    return { success: false, error: new Error(`[Automation] Setup error for cancellation, contract: ${contractAddress}, deal: ${dealId}`) };
  }

  console.log(`[Automation] Attempting to call cancelEscrowAndRefundBuyer for contract: ${contractAddress} (Deal ID: ${dealId})`);
  try {
    const tx = await escrowContract.cancelEscrowAndRefundBuyer();
    console.log(`[Automation] cancelEscrowAndRefundBuyer tx sent: ${tx.hash} for contract ${contractAddress} (Deal ID: ${dealId})`);
    const receipt = await tx.wait(1);
    console.log(`[Automation] cancelEscrowAndRefundBuyer tx CONFIRMED: ${receipt.transactionHash} for contract ${contractAddress} (Deal ID: ${dealId})`);
    return { success: true, receipt };
  } catch (error) {
    console.error(`[Automation] ERROR calling cancelEscrowAndRefundBuyer for ${contractAddress} (Deal ID: ${dealId}):`, error.message);
    return { success: false, error };
  }
}