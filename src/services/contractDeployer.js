// src/utils/contractDeployer.js
import { JsonRpcProvider, Wallet, ContractFactory, isAddress, parseUnits as ethersParseUnits } from 'ethers';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Handle ES module __dirname and __filename
let __filename, __dirname;
try {
    __filename = fileURLToPath(import.meta.url);
    __dirname = path.dirname(__filename);
} catch (error) {
    // Fallback for test environments where import.meta.url might not be available
    console.warn('[ContractDeployer] Using fallback paths for test environment');
    __dirname = process.cwd() + '/src/services';
    __filename = __dirname + '/contractDeployer.js';
}

let PropertyEscrowArtifact;
try {
    // Try multiple paths to find the artifact
    const possiblePaths = [
        path.resolve(__dirname, '../contract/artifacts/contracts/PropertyEscrow.sol/PropertyEscrow.json'),
        path.resolve(process.cwd(), 'src/contract/artifacts/contracts/PropertyEscrow.sol/PropertyEscrow.json'),
        path.resolve(process.cwd(), 'contract/artifacts/contracts/PropertyEscrow.sol/PropertyEscrow.json')
    ];
    
    let artifactLoaded = false;
    for (const artifactPath of possiblePaths) {
        try {
            console.log(`[ContractDeployer] Trying to load artifact from: ${artifactPath}`);
            const artifactContent = readFileSync(artifactPath, 'utf8');
            PropertyEscrowArtifact = JSON.parse(artifactContent);
            console.log(`[ContractDeployer] Successfully loaded PropertyEscrow artifact from: ${artifactPath}`);
            artifactLoaded = true;
            break;
        } catch (pathError) {
            console.warn(`[ContractDeployer] Failed to load from ${artifactPath}: ${pathError.message}`);
        }
    }
    
    if (!artifactLoaded) {
        throw new Error('Could not load PropertyEscrow artifact from any known location');
    }
} catch (e) {
    console.error("[ContractDeployer] Failed to load PropertyEscrow.json artifact:", e);
    PropertyEscrowArtifact = null;
}

/**
 * @internal
 * TEST-ONLY backdoor function to simulate artifact loading failure.
 */
export function __TEST_ONLY_setArtifactToNull() {
    console.log('[ContractDeployer] __TEST_ONLY_setArtifactToNull called, setting PropertyEscrowArtifact to null');
    PropertyEscrowArtifact = null;
}


async function deployPropertyEscrowContract(sellerAddress, buyerAddress, escrowAmountWei, privateKey, rpcUrl, serviceWallet) {
    if (!PropertyEscrowArtifact || !PropertyEscrowArtifact.abi || !PropertyEscrowArtifact.bytecode) {
        throw new Error('PropertyEscrow artifact (ABI or bytecode) not loaded. Check path and artifact integrity.');
    }
    if (!sellerAddress || !isAddress(sellerAddress)) {
        throw new Error('Invalid seller address provided for deployment.');
    }
    if (!buyerAddress || !isAddress(buyerAddress)) {
        throw new Error('Invalid buyer address provided for deployment.');
    }
    if (!serviceWallet || !isAddress(serviceWallet)) {
        throw new Error('Invalid service wallet address provided for deployment.');
    }

    // Refined amount validation
    let amountBigInt;
    try {
        amountBigInt = BigInt(escrowAmountWei);
    } catch (e) {
        // This catch is for when BigInt() truly fails to parse (e.g., "abc")
        throw new Error('Invalid escrow amount provided for deployment. Must be a valid number string representing Wei.');
    }
    // Now check the value
    if (amountBigInt <= 0n) { // Explicitly compare with 0n
        throw new Error('Escrow amount must be positive.');
    }

    if (!privateKey || typeof privateKey !== 'string' || !privateKey.startsWith('0x')) {
        throw new Error('Invalid private key provided for deployment. Must be a hex string.');
    }
    if (!rpcUrl || typeof rpcUrl !== 'string' || rpcUrl.trim() === '') { // Added trim check for empty string
        throw new Error('Invalid RPC URL provided for deployment.');
    }

    console.log(`Attempting to deploy PropertyEscrow with service fee functionality (ethers.js v6):`);
    console.log(`- Seller: ${sellerAddress}`);
    console.log(`- Buyer: ${buyerAddress}`);
    console.log(`- Escrow Amount: ${escrowAmountWei} wei`);
    console.log(`- Service Wallet: ${serviceWallet}`);

    let deployerWallet;
    let provider; // Declare provider here to access in finally block

    try {
        provider = new JsonRpcProvider(rpcUrl);
        deployerWallet = new Wallet(privateKey, provider);
        console.log(`Deploying using account: ${deployerWallet.address}`);

        const PropertyEscrowFactory = new ContractFactory(
            PropertyEscrowArtifact.abi,
            PropertyEscrowArtifact.bytecode,
            deployerWallet
        );

        console.log('Deploying contract...');
        const escrowContractInstance = await PropertyEscrowFactory.deploy(
            sellerAddress,
            buyerAddress,
            escrowAmountWei,
            serviceWallet
        );

        await escrowContractInstance.waitForDeployment();
        
        const contractAddress = await escrowContractInstance.getAddress();
        const deploymentTransaction = escrowContractInstance.deploymentTransaction();
        const transactionHash = deploymentTransaction ? deploymentTransaction.hash : null;

        console.log("PropertyEscrow contract deployed successfully!");
        console.log("Contract address:", contractAddress);
        console.log("Service wallet configured:", serviceWallet);
        if (transactionHash) {
            console.log("Transaction hash:", transactionHash);
        } else {
            console.warn("Could not retrieve deployment transaction hash.");
        }
        
        return { contractAddress, transactionHash };

    } catch (error) {
        console.error("Error deploying PropertyEscrow contract:", error);
        let errorMessage = `Smart contract deployment failed: ${error.message}`;
        // ... (rest of the error handling)
        if (error.code) {
            switch (error.code) {
                case 'INSUFFICIENT_FUNDS':
                    const deployerAddress = deployerWallet ? deployerWallet.address : 'unknown';
                    errorMessage = `Deployment failed: Insufficient funds in deployer account (${deployerAddress}). Error: ${error.message}`;
                    break;
                case 'INVALID_ARGUMENT':
                    errorMessage = `Deployment failed: Invalid argument during deployment. Argument: ${error.argument}, Value: ${error.value}. Error: ${error.message}`;
                    break;
                case 'NETWORK_ERROR':
                    errorMessage = `Deployment failed: Network error connecting to RPC URL (${rpcUrl}). Error: ${error.message}`;
                    break;
                case 'UNPREDICTABLE_GAS_LIMIT':
                    errorMessage = `Deployment failed: Unpredictable gas limit. This might be due to an error in the contract constructor or insufficient funds. Error: ${error.message}`;
                    break;
            }
        } 
        // Note: The check for "invalid BigNumber value" is removed here as the new try/catch for BigInt handles parsing errors more directly.
        
        throw new Error(errorMessage);
    } finally {
        if (provider && typeof provider.destroy === 'function') {
            console.log('[ContractDeployer] Destroying internal provider.');
            try {
                await provider.destroy(); // Ethers v6 destroy is synchronous, but await won't hurt
            } catch (e) {
                console.error('[ContractDeployer] Error destroying internal provider:', e.message);
            }
        }
    }
}

export { deployPropertyEscrowContract };
