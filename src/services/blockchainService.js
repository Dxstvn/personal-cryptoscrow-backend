// src/services/blockchainService.js
import { JsonRpcProvider, Wallet, Contract, isAddress } from 'ethers';
import { createRequire } from 'module';
import path from 'path'; 
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let provider;
let wallet;
export let contractABI; // This will be null if ABI loading fails OR if __TEST_ONLY_simulateAbiLoadingFailure is called

// Function to initialize provider and wallet
function initializeService() {
  if (provider && wallet) {
    return true;
  }
  const currentRpcUrl = process.env.RPC_URL;
  const currentPrivateKey = process.env.BACKEND_WALLET_PRIVATE_KEY;
  if (!currentRpcUrl || !currentPrivateKey) {
    console.warn("[BlockchainService] Critical configuration missing: RPC_URL or BACKEND_WALLET_PRIVATE_KEY.");
    provider = null;
    wallet = null;
    return false;
  }
  try {
    provider = new JsonRpcProvider(currentRpcUrl); 
    wallet = new Wallet(currentPrivateKey, provider);
    console.log(`[BlockchainService] Automation service initialized. Using wallet: ${wallet.address}`);
    provider.getBlockNumber()
      .then(blockNumber => {
        console.log(`[BlockchainService] Network connectivity check successful. Block: ${blockNumber}`);
      })
      .catch(err => {
        console.error(`[BlockchainService] Network connectivity check failed for ${currentRpcUrl}. Error: ${err.message}`);
      });
    return true;
  } catch (error) {
    console.error(`[BlockchainService] Error initializing provider or wallet: ${error.message}. Raw error:`, error);
    provider = null; 
    wallet = null;   
    return false;
  }
}

// --- Load Contract ABI ---
try {
  const requireFn = createRequire(import.meta.url);
  const abiPath = path.resolve(__dirname, '../contract/artifacts/contracts/PropertyEscrow.sol/PropertyEscrow.json');
  const PropertyEscrowArtifact = requireFn(abiPath);
  if (!PropertyEscrowArtifact.abi || !Array.isArray(PropertyEscrowArtifact.abi) || PropertyEscrowArtifact.abi.length === 0) {
    throw new Error("Loaded ABI is empty, not an array, or undefined.");
  }
  contractABI = PropertyEscrowArtifact.abi;
  console.log("[BlockchainService] PropertyEscrow ABI loaded successfully.");
} catch (err) {
  console.error(`[BlockchainService] Failed to load PropertyEscrow ABI. Automated tasks will fail. Error: ${err.message}`);
  contractABI = null; 
}

/**
 * @internal TEST-ONLY backdoor function to simulate ABI loading failure.
 */
export function __TEST_ONLY_simulateAbiLoadingFailure() {
  console.log('[BlockchainService] __TEST_ONLY_simulateAbiLoadingFailure called, setting contractABI to null');
  contractABI = null;
}

/**
 * @internal TEST-ONLY function to check the internal state of contractABI.
 */
export function __TEST_ONLY_getInternalAbiState() {
  return contractABI;
}


function getContractInstance(contractAddress) {
  if (contractABI === null) { 
    console.error(`[BlockchainService] Cannot create contract instance for ${contractAddress}: ABI loading previously failed or was simulated as failed.`);
    return null;
  }
  if (!provider || !wallet) { 
    console.error(`[BlockchainService] Cannot create contract instance for ${contractAddress}: Provider or Wallet not initialized.`);
    return null;
  }
  if (!isAddress(contractAddress)) {
    console.error(`[BlockchainService] Invalid contract address provided for instance creation: ${contractAddress}`);
    return null;
  }
  return new Contract(contractAddress, contractABI, wallet);
}

export async function triggerReleaseAfterApproval(contractAddress, dealId) {
  if (contractABI === null) {
    return { 
      success: false, 
      error: new Error(`[Automation] ABI loading failed, cannot proceed with release. Contract: ${contractAddress}, Deal: ${dealId}. ABI loaded: false`) 
    };
  }

  if (!initializeService()) { 
    return { 
      success: false, 
      error: new Error(`[Automation] Initialization failed for release. Contract: ${contractAddress}, Deal: ${dealId}. Check RPC/Key.`) 
    };
  }

  if (!isAddress(contractAddress)) {
      return { 
        success: false, 
        error: new Error(`[Automation] Setup error for release, invalid contract address: ${contractAddress}, deal: ${dealId}`) 
      };
  }

  const escrowContract = getContractInstance(contractAddress);
  if (!escrowContract) { 
    return { 
      success: false, 
      error: new Error(`[Automation] Failed to get contract instance for release. Contract: ${contractAddress}, Deal: ${dealId}. ABI loaded: ${!!contractABI}`) 
    };
  }

  console.log(`[Automation] Attempting to call releaseFundsAfterApprovalPeriod for contract: ${contractAddress} (Deal ID: ${dealId})`);
  try {
    const tx = await escrowContract.releaseFundsAfterApprovalPeriod(); 
    const receipt = await tx.wait(1); 
    return { success: true, receipt };
  } catch (error) {
    console.error(`[Automation] ERROR calling releaseFundsAfterApprovalPeriod for ${contractAddress} (Deal ID: ${dealId}):`, error.message, error.stack);
    return { success: false, error };
  }
}

export async function triggerCancelAfterDisputeDeadline(contractAddress, dealId) {
  if (contractABI === null) {
    return { 
      success: false, 
      error: new Error(`[Automation] ABI loading failed, cannot proceed with cancellation. Contract: ${contractAddress}, Deal: ${dealId}. ABI loaded: false`) 
    };
  }

  if (!initializeService()) {
    return { 
      success: false, 
      error: new Error(`[Automation] Initialization failed for cancellation. Contract: ${contractAddress}, Deal: ${dealId}. Check RPC/Key.`) 
    };
  }
  
  if (!isAddress(contractAddress)) {
      return { 
        success: false, 
        error: new Error(`[Automation] Setup error for cancellation, invalid contract address: ${contractAddress}, deal: ${dealId}`) 
      };
  }

  const escrowContract = getContractInstance(contractAddress);
  if (!escrowContract) {
    return { 
      success: false, 
      error: new Error(`[Automation] Failed to get contract instance for cancellation. Contract: ${contractAddress}, Deal: ${dealId}. ABI loaded: ${!!contractABI}`) 
    };
  }

  console.log(`[Automation] Attempting to call cancelEscrowAndRefundBuyer for contract: ${contractAddress} (Deal ID: ${dealId})`);
  try {
    const tx = await escrowContract.cancelEscrowAndRefundBuyer();
    const receipt = await tx.wait(1);
    return { success: true, receipt };
  } catch (error) {
    console.error(`[Automation] ERROR calling cancelEscrowAndRefundBuyer for ${contractAddress} (Deal ID: ${dealId}):`, error.message, error.stack);
    return { success: false, error };
  }
}
