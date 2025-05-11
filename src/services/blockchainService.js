// src/services/blockchainService.js
import { ethers } from 'ethers';
import { createRequire } from 'module';

// --- Environment Variable Check ---
const RPC_URL = process.env.RPC_URL;
const BACKEND_PRIVATE_KEY = process.env.BACKEND_WALLET_PRIVATE_KEY;

if (!RPC_URL || !BACKEND_PRIVATE_KEY) {
  console.error(
    "CRITICAL ERROR: RPC_URL or BACKEND_WALLET_PRIVATE_KEY is not set in environment variables for blockchainService. Automated tasks will likely fail."
  );
  // Depending on your application's needs, you might want to throw an error here
  // or have a flag that disables automated tasks if these are missing.
}

// --- Initialize Provider and Wallet ---
// Ensure provider and wallet are initialized only if essential ENV VARS are set
let provider;
let wallet;

if (RPC_URL && BACKEND_PRIVATE_KEY) {
  try {
    provider = new ethers.JsonRpcProvider(RPC_URL);
    wallet = new ethers.Wallet(BACKEND_PRIVATE_KEY, provider);
    console.log(`[BlockchainService] Automation service initialized. Using wallet: ${wallet.address}`);
    // Test connectivity (optional, but good for startup)
    provider.getBlockNumber().then(blockNumber => {
      console.log(`[BlockchainService] Successfully connected to network. Current block: ${blockNumber}`);
    }).catch(err => {
      console.error(`[BlockchainService] CRITICAL: Failed to connect to network at ${RPC_URL}. Error: ${err.message}`);
    });
  } catch (error) {
    console.error(`[BlockchainService] CRITICAL: Error initializing provider or wallet: ${error.message}`);
    // Prevent service from being used if initialization fails
    provider = null;
    wallet = null;
  }
} else {
  console.warn("[BlockchainService] Service not fully initialized due to missing RPC_URL or BACKEND_PRIVATE_KEY.");
}


// --- Load Contract ABI ---
// Use createRequire for compatibility, especially if PropertyEscrow.json is not an ES module
const require = createRequire(import.meta.url);
let contractABI;
try {
  // Adjust the path to your PropertyEscrow.json artifact
  // This path assumes blockchainService.js is in src/services/
  // and PropertyEscrow.json is in src/contract/artifacts/contracts/PropertyEscrow.sol/
  const PropertyEscrowArtifact = require('../contract/artifacts/contracts/PropertyEscrow.sol/PropertyEscrow.json');
  contractABI = PropertyEscrowArtifact.abi;
  if (!contractABI || contractABI.length === 0) {
    throw new Error("ABI is empty or undefined.");
  }
  console.log("[BlockchainService] PropertyEscrow ABI loaded successfully.");
} catch (err) {
  console.error(`[BlockchainService] CRITICAL ERROR: Failed to load PropertyEscrow ABI. Automated tasks will fail. Error: ${err.message}`);
  contractABI = null; // Ensure ABI is null if loading fails
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
  const escrowContract = getContractInstance(contractAddress);
  if (!escrowContract) {
    return { success: false, error: new Error(`[Automation] Setup error for release, contract: ${contractAddress}, deal: ${dealId}`) };
  }

  console.log(`[Automation] Attempting to call releaseFundsAfterApprovalPeriod for contract: ${contractAddress} (Deal ID: ${dealId})`);
  try {
    // Optional: Add gas estimation and overrides if needed
    // const gasPrice = await provider.getGasPrice(); // For legacy transactions
    // const feeData = await provider.getFeeData(); // For EIP-1559 transactions

    const tx = await escrowContract.releaseFundsAfterApprovalPeriod({
      // Example gas overrides (use with caution, test thoroughly):
      // gasLimit: ethers.utils.hexlify(300000), // Example fixed gas limit
      // maxFeePerGas: feeData.maxFeePerGas,
      // maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
    });

    console.log(`[Automation] releaseFundsAfterApprovalPeriod tx sent: ${tx.hash} for contract ${contractAddress} (Deal ID: ${dealId})`);
    const receipt = await tx.wait(1); // Wait for 1 confirmation
    console.log(`[Automation] releaseFundsAfterApprovalPeriod tx CONFIRMED: ${receipt.transactionHash} for contract ${contractAddress} (Deal ID: ${dealId})`);
    return { success: true, receipt };
  } catch (error) {
    console.error(`[Automation] ERROR calling releaseFundsAfterApprovalPeriod for ${contractAddress} (Deal ID: ${dealId}):`, error.message);
    // Log more detailed error information if available
    if (error.data) console.error('[Automation] Error data:', error.data);
    if (error.transaction) console.error('[Automation] Error transaction:', error.transaction);
    if (error.receipt) console.error('[Automation] Error receipt (if tx was mined but reverted):', error.receipt);
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
  const escrowContract = getContractInstance(contractAddress);
  if (!escrowContract) {
    return { success: false, error: new Error(`[Automation] Setup error for cancellation, contract: ${contractAddress}, deal: ${dealId}`) };
  }

  console.log(`[Automation] Attempting to call cancelEscrowAndRefundBuyer for contract: ${contractAddress} (Deal ID: ${dealId})`);
  try {
    const tx = await escrowContract.cancelEscrowAndRefundBuyer({
      // Add gas overrides if needed, similar to triggerReleaseAfterApproval
    });
    console.log(`[Automation] cancelEscrowAndRefundBuyer tx sent: ${tx.hash} for contract ${contractAddress} (Deal ID: ${dealId})`);
    const receipt = await tx.wait(1);
    console.log(`[Automation] cancelEscrowAndRefundBuyer tx CONFIRMED: ${receipt.transactionHash} for contract ${contractAddress} (Deal ID: ${dealId})`);
    return { success: true, receipt };
  } catch (error) {
    console.error(`[Automation] ERROR calling cancelEscrowAndRefundBuyer for ${contractAddress} (Deal ID: ${dealId}):`, error.message);
    if (error.data) console.error('[Automation] Error data:', error.data);
    return { success: false, error };
  }
}
