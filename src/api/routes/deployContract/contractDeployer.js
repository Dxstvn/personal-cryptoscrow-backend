// src/utils/contractDeployer.js
import { ethers } from 'ethers';
import { createRequire } from 'module'; // Import createRequire

// Use createRequire for compatibility with Jest's ESM environment
const require = createRequire(import.meta.url);
const PropertyEscrowArtifact = require('../../../contract/artifacts/contracts/PropertyEscrow.sol/PropertyEscrow.json'); // Adjust path as needed

/**
 * Deploys the PropertyEscrow smart contract.
 * @param {string} sellerAddress The address of the seller.
 * @param {string} buyerAddress The address of the buyer.
 * @param {string} escrowAmountWei The escrow amount in Wei.
 * @param {string} privateKey The private key of the deployer account.
 * @param {string} rpcUrl The RPC URL of the Ethereum network.
 * @returns {Promise<string>} The address of the deployed contract.
 * @throws {Error} If deployment fails.
 */
async function deployPropertyEscrowContract(sellerAddress, buyerAddress, escrowAmountWei, privateKey, rpcUrl) {
    // Input validations (ensure addresses are valid, amount > 0, keys/URLs exist)
    if (!sellerAddress || !ethers.utils.isAddress(sellerAddress)) {
        throw new Error('Invalid seller address provided for deployment.');
    }
    if (!buyerAddress || !ethers.utils.isAddress(buyerAddress)) {
        throw new Error('Invalid buyer address provided for deployment.');
    }
    if (!escrowAmountWei || BigInt(escrowAmountWei) <= 0) {
        throw new Error('Invalid escrow amount provided for deployment.');
    }
    if (!privateKey || typeof privateKey !== 'string' || !privateKey.startsWith('0x')) {
        throw new Error('Invalid private key provided for deployment. Must be a hex string.');
    }
    if (!rpcUrl || typeof rpcUrl !== 'string') {
        throw new Error('Invalid RPC URL provided for deployment.');
    }

    console.log(`Attempting to deploy PropertyEscrow with:`);
    console.log(`  RPC URL: ${rpcUrl}`);
    console.log(`  Seller: ${sellerAddress}`);
    console.log(`  Buyer: ${buyerAddress}`);
    console.log(`  Escrow Amount (Wei): ${escrowAmountWei}`);

    let wallet; // Define wallet outside try block for potential use in catch

    try {
        // 1. Connect to the Ethereum network
        const provider = new ethers.providers.JsonRpcProvider(rpcUrl);

        // 2. Create a wallet instance for the deployer
        wallet = new ethers.Wallet(privateKey, provider);
        console.log(`Deploying using account: ${wallet.address}`);

        // 3. Get the ContractFactory using ABI and bytecode from the imported artifact
        const PropertyEscrowFactory = new ethers.ContractFactory(
            PropertyEscrowArtifact.abi,
            PropertyEscrowArtifact.bytecode,
            wallet
        );

        // 4. Deploy the contract with constructor arguments
        console.log('Deploying contract...');
        const escrowContract = await PropertyEscrowFactory.deploy(
            sellerAddress,
            buyerAddress,
            escrowAmountWei // Ensure this is a BigNumberish value (string is fine)
        );

        // 5. Wait for the deployment transaction to be mined
        await escrowContract.deployed(); // Waits for the contract to be mined
        console.log("PropertyEscrow contract deployed successfully!");
        console.log("Contract address:", escrowContract.address);
        console.log("Transaction hash:", escrowContract.deployTransaction.hash);

        return escrowContract.address; // Return the address of the newly deployed contract

    } catch (error) {
        console.error("Error deploying PropertyEscrow contract:", error);
        // Provide more context in error messages
        if (error.code === 'INSUFFICIENT_FUNDS') {
            const deployerAddress = wallet ? wallet.address : 'unknown';
            throw new Error(`Deployment failed: Insufficient funds in deployer account (${deployerAddress}). Error: ${error.message}`);
        } else if (error.message.includes("invalid BigNumber value") || error.code === 'INVALID_ARGUMENT') {
             // Catch potential errors from invalid amount formatting
             throw new Error(`Deployment failed: Invalid numeric value for escrow amount. Ensure it's in Wei and passed as a string or BigNumber. Value: ${escrowAmountWei}. Error: ${error.message}`);
        } else if (error.code === 'NETWORK_ERROR') {
             throw new Error(`Deployment failed: Network error connecting to RPC URL (${rpcUrl}). Error: ${error.message}`);
        }
        // General fallback error
        throw new Error(`Smart contract deployment failed: ${error.message}`);
    }
}

export { deployPropertyEscrowContract };
