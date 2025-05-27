import { deployPropertyEscrowContract } from '../../contractDeployer.js';
import { JsonRpcProvider, Wallet, Contract, isAddress } from 'ethers';
import { execSync, spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import os from 'os';
import kill from 'kill-port';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to the backend root assuming the test is in src/services/__tests__/integration
const findProjectRoot = (startPath) => {
    let currentPath = startPath;
    while (currentPath !== path.parse(currentPath).root) {
        if (fs.existsSync(path.join(currentPath, 'package.json'))) {
            return currentPath;
        }
        currentPath = path.dirname(currentPath);
    }
    throw new Error("Could not find project root containing package.json");
};

const projectRoot = findProjectRoot(__dirname);
const backendRoot = projectRoot; 
const contractArtifactPath = path.resolve(backendRoot, 'src/contract/artifacts/contracts/PropertyEscrow.sol/PropertyEscrow.json');
const hardhatDir = path.resolve(projectRoot, 'src/contract'); // Correct path to Hardhat project

const RPC_URL = 'http://127.0.0.1:8545';
const HARDHAT_PORT = 8545;

// Use Hardhat's default accounts
const TEST_SELLER_ADDRESS = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'; // HH Account 0
const TEST_BUYER_ADDRESS = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'; // HH Account 1
const TEST_SERVICE_WALLET = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC'; // HH Account 2
const DEPLOYER_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'; // HH Account 0 PK

describe('ContractDeployer Integration Tests', () => {
    let provider;
    let originalArtifactState = null; // To help restore state if needed

    beforeAll(async () => {
        try {
            // Dynamically import to get original state if needed for restoration.
            // This is a bit complex; simpler if contractDeployer had a reset function.
            const { PropertyEscrowArtifact: artifact } = await import('../../contractDeployer.js?bustcache=' + Date.now() + '_beforeAll');
            // originalArtifactState = artifact; // This won't work as expected for module-level var
            
            provider = new JsonRpcProvider(RPC_URL);
            await provider.getNetwork(); 
            console.log("Provider connected to Hardhat node for ContractDeployer tests.");
        } catch (error) {
            console.error("Critical failure in beforeAll (ContractDeployer tests):", error);
            if (provider && typeof provider.destroy === 'function') {
                await provider.destroy(); // Clean up provider if setup failed
            }
            throw error; 
        }
    }, 45000); 

    afterAll(async () => {
        if (provider && typeof provider.destroy === 'function') {
            console.log('[ContractDeployer Tests] Destroying test-suite provider in afterAll.');
            try {
                await provider.destroy(); 
                provider = null;
            } catch (e) {
                console.error('[ContractDeployer Tests] Error destroying test-suite provider:', e.message);
            }
        }
        console.log("Finished afterAll for ContractDeployer tests.");
        // Attempt to restore module state if __TEST_ONLY_setArtifactToNull was used and not reset
        // This is tricky with ES modules. The cache-busting import in tests is preferred.
    }, 20000); 

    // Test artifact loading failure
    it('should throw an error if PropertyEscrow artifact is not loaded', async () => {
        const { __TEST_ONLY_setArtifactToNull, deployPropertyEscrowContract: deployFn } = await import('../../contractDeployer.js?bustcache=' + Date.now() + '_artifactTest');
        
        __TEST_ONLY_setArtifactToNull(); // Mutate the state of this fresh import

        await expect(deployFn(
            TEST_SELLER_ADDRESS,
            TEST_BUYER_ADDRESS,
            "1000000000000000000", 
            DEPLOYER_PRIVATE_KEY,
            RPC_URL,
            TEST_SERVICE_WALLET
        )).rejects.toThrow('PropertyEscrow artifact (ABI or bytecode) not loaded.');
        
        // The next test will get its own fresh import due to cache busting.
    });

    it('should successfully deploy the PropertyEscrow contract with valid parameters', async () => {
        const escrowAmountWei = "1000000000000000000"; // 1 ETH in Wei
        const { deployPropertyEscrowContract: freshDeployFn } = await import('../../contractDeployer.js?bustcache=' + Date.now() + '_deploySuccess');

        const { contractAddress, transactionHash } = await freshDeployFn(
            TEST_SELLER_ADDRESS,
            TEST_BUYER_ADDRESS,
            escrowAmountWei,
            DEPLOYER_PRIVATE_KEY,
            RPC_URL,
            TEST_SERVICE_WALLET
        );

        expect(contractAddress).toBeDefined();
        expect(isAddress(contractAddress)).toBe(true);
        expect(transactionHash).toBeDefined();
        expect(transactionHash).toMatch(/^0x[a-fA-F0-9]{64}$/);

        const contractArtifact = JSON.parse(fs.readFileSync(contractArtifactPath, 'utf8'));
        const deployedContract = new Contract(contractAddress, contractArtifact.abi, provider);
        
        const seller = await deployedContract.seller();
        const buyer = await deployedContract.buyer();
        const serviceWallet = await deployedContract.serviceWallet();
        const escrowAmount = await deployedContract.escrowAmount();
        // Assuming 'State' enum exists and 0 is 'AwaitingPayment' or similar initial state.
        // If your contract doesn't have `currentState()`, remove this or adapt.
        const state = await deployedContract.currentState(); 

        expect(seller).toBe(TEST_SELLER_ADDRESS);
        expect(buyer).toBe(TEST_BUYER_ADDRESS);
        expect(serviceWallet).toBe(TEST_SERVICE_WALLET);
        expect(escrowAmount.toString()).toBe(escrowAmountWei);
        expect(state).toBe(0n); 
    }, 30000);

    it('should throw an error for invalid seller address', async () => {
        const { deployPropertyEscrowContract: freshDeployFn } = await import('../../contractDeployer.js?bustcache=' + Date.now() + '_invalidSeller');
        await expect(freshDeployFn(
            "0xInvalidAddress", TEST_BUYER_ADDRESS, "1000000000000000000", DEPLOYER_PRIVATE_KEY, RPC_URL, TEST_SERVICE_WALLET
        )).rejects.toThrow('Invalid seller address provided for deployment.');
    });

    it('should throw an error for invalid buyer address', async () => {
        const { deployPropertyEscrowContract: freshDeployFn } = await import('../../contractDeployer.js?bustcache=' + Date.now() + '_invalidBuyer');
        await expect(freshDeployFn(
            TEST_SELLER_ADDRESS, "0xInvalidAddress", "1000000000000000000", DEPLOYER_PRIVATE_KEY, RPC_URL, TEST_SERVICE_WALLET
        )).rejects.toThrow('Invalid buyer address provided for deployment.');
    });

    it('should throw an error for invalid service wallet address', async () => {
        const { deployPropertyEscrowContract: freshDeployFn } = await import('../../contractDeployer.js?bustcache=' + Date.now() + '_invalidServiceWallet');
        await expect(freshDeployFn(
            TEST_SELLER_ADDRESS, TEST_BUYER_ADDRESS, "1000000000000000000", DEPLOYER_PRIVATE_KEY, RPC_URL, "0xInvalidServiceWallet"
        )).rejects.toThrow('Invalid service wallet address provided for deployment.');
    });
    
    it('should throw an error for non-positive escrow amount', async () => {
        const { deployPropertyEscrowContract: freshDeployFn } = await import('../../contractDeployer.js?bustcache=' + Date.now() + '_zeroAmount');
        await expect(freshDeployFn(
            TEST_SELLER_ADDRESS, TEST_BUYER_ADDRESS, "0", DEPLOYER_PRIVATE_KEY, RPC_URL, TEST_SERVICE_WALLET
        )).rejects.toThrow('Escrow amount must be positive.');
    });

    it('should throw an error for invalid private key', async () => {
        const { deployPropertyEscrowContract: freshDeployFn } = await import('../../contractDeployer.js?bustcache=' + Date.now() + '_invalidPK');
        await expect(freshDeployFn(
            TEST_SELLER_ADDRESS, TEST_BUYER_ADDRESS, "1000000000000000000", "invalidPrivateKey", RPC_URL, TEST_SERVICE_WALLET
        )).rejects.toThrow('Invalid private key provided for deployment.');
    });

    it('should throw an error for invalid RPC URL (empty string)', async () => {
        const { deployPropertyEscrowContract: freshDeployFn } = await import('../../contractDeployer.js?bustcache=' + Date.now() + '_emptyRpc');
        await expect(freshDeployFn(
            TEST_SELLER_ADDRESS, TEST_BUYER_ADDRESS, "1000000000000000000", DEPLOYER_PRIVATE_KEY, "", TEST_SERVICE_WALLET
        )).rejects.toThrow('Invalid RPC URL provided for deployment.');
    });
    
    it('should handle deployment failure due to network error (non-existent RPC)', async () => {
        const { deployPropertyEscrowContract: freshDeployFn } = await import('../../contractDeployer.js?bustcache=' + Date.now() + '_networkError');
        const NON_EXISTENT_RPC_URL = 'http://127.0.0.1:12345'; 
        await expect(freshDeployFn(
            TEST_SELLER_ADDRESS, TEST_BUYER_ADDRESS, "1000000000000000000", DEPLOYER_PRIVATE_KEY, NON_EXISTENT_RPC_URL, TEST_SERVICE_WALLET
        )).rejects.toThrow(/NETWORK_ERROR|could not connect|ECONNREFUSED/i); 
    });

    it('should throw an error for unparseable escrow amount string', async () => {
        const { deployPropertyEscrowContract: freshDeployFn } = await import('../../contractDeployer.js?bustcache=' + Date.now() + '_unparseableAmount');
        await expect(freshDeployFn(
            TEST_SELLER_ADDRESS, TEST_BUYER_ADDRESS, "not-a-number", DEPLOYER_PRIVATE_KEY, RPC_URL, TEST_SERVICE_WALLET
        )).rejects.toThrow('Invalid escrow amount provided for deployment. Must be a valid number string representing Wei.');
    });

    it('should handle deployment failure if seller and buyer are the same (constructor revert)', async () => {
        const { deployPropertyEscrowContract: freshDeployFn } = await import('../../contractDeployer.js?bustcache=' + Date.now() + '_sameAddresses');
        await expect(freshDeployFn(
            TEST_SELLER_ADDRESS,
            TEST_SELLER_ADDRESS, // Buyer is same as seller
            "1000000000000000000",
            DEPLOYER_PRIVATE_KEY,
            RPC_URL,
            TEST_SERVICE_WALLET
        )).rejects.toThrow(/Smart contract deployment failed|UNPREDICTABLE_GAS_LIMIT|Seller and buyer cannot be the same/i); 
    });
}); 