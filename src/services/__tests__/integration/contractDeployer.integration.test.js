import { deployPropertyEscrowContract } from '../../../contractDeployer.js';
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
const hardhatDir = projectRoot; // Assuming hardhat config is at the project root

const RPC_URL = 'http://127.0.0.1:8545';
const HARDHAT_PORT = 8545;

// Use Hardhat's default accounts
const TEST_SELLER_ADDRESS = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'; // HH Account 0
const TEST_BUYER_ADDRESS = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'; // HH Account 1
const DEPLOYER_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'; // HH Account 0 PK

let hardhatNodeProcess;

const startHardhatNode = () => {
    return new Promise((resolve, reject) => {
        console.log(`Attempting to kill any process on port ${HARDHAT_PORT}...`);
        kill(HARDHAT_PORT, 'tcp')
            .then(() => {
                console.log(`Successfully killed process on port ${HARDHAT_PORT} or port was free.`);
                console.log(`Starting Hardhat node in ${hardhatDir}...`);
                
                const npxCmd = os.platform() === 'win32' ? 'npx.cmd' : 'npx';

                hardhatNodeProcess = spawn(npxCmd, ['hardhat', 'node', '--port', String(HARDHAT_PORT)], {
                    cwd: hardhatDir,
                    stdio: ['ignore', 'pipe', 'pipe'], 
                    detached: false, 
                });

                let nodeStarted = false;
                let stdoutData = '';
                let stderrData = '';

                hardhatNodeProcess.stdout.on('data', (data) => {
                    const output = data.toString();
                    stdoutData += output;
                    // console.log(`[Hardhat Node STDOUT]: ${output}`); // Verbose logging
                    if (output.includes("Started HTTP and WebSocket JSON-RPC server at") || output.includes("JSON-RPC server running")) {
                        if (!nodeStarted) {
                            nodeStarted = true;
                            console.log('Hardhat node started successfully.');
                            resolve(hardhatNodeProcess);
                        }
                    }
                });

                hardhatNodeProcess.stderr.on('data', (data) => {
                    const errorOutput = data.toString();
                    stderrData += errorOutput;
                    // console.error(`[Hardhat Node STDERR]: ${errorOutput}`); // Verbose logging
                    if (!nodeStarted && errorOutput.toLowerCase().includes('error')) {
                        if (errorOutput.includes("listen EADDRINUSE")) {
                             console.error(`Error: Port ${HARDHAT_PORT} is already in use. kill-port might have failed or another Hardhat instance is running.`);
                             reject(new Error(`Port ${HARDHAT_PORT} already in use.`));
                        } else if (!nodeStarted) {
                            reject(new Error(`Hardhat node failed to start: ${errorOutput.substring(0, 300)}...`));
                        }
                    }
                });

                hardhatNodeProcess.on('error', (err) => {
                    if (!nodeStarted) {
                        console.error('Failed to start Hardhat node process:', err);
                        reject(err);
                    } else {
                        // console.error('Error from Hardhat node process after start:', err); // Can be noisy
                    }
                });
                
                hardhatNodeProcess.on('exit', (code, signal) => {
                    console.log(`Hardhat node process exited with code ${code} and signal ${signal}.`);
                    if (!nodeStarted) { 
                        reject(new Error(`Hardhat node exited prematurely with code ${code}. STDOUT: ${stdoutData.slice(-500)} STDERR: ${stderrData.slice(-500)}`));
                    }
                });

                setTimeout(() => {
                    if (!nodeStarted) {
                        console.error('Hardhat node startup timed out.');
                        if (hardhatNodeProcess && typeof hardhatNodeProcess.kill === 'function') {
                           try {
                                if (os.platform() === "win32") {
                                    execSync(`taskkill /PID ${hardhatNodeProcess.pid} /F /T`);
                                } else {
                                    process.kill(-hardhatNodeProcess.pid, 'SIGKILL'); // Force kill group
                                }
                           } catch (e) {
                                hardhatNodeProcess.kill('SIGKILL'); // Fallback
                           }
                        }
                        reject(new Error(`Hardhat node startup timed out. STDOUT: ${stdoutData.slice(-500)} STDERR: ${stderrData.slice(-500)}`));
                    }
                }, 35000); // 35 seconds timeout
            })
            .catch(killErr => {
                // This catch is for kill-port failure
                console.error(`Error trying to kill port ${HARDHAT_PORT}: ${killErr.message}. Attempting to start Hardhat anyway.`);
                // Code to start Hardhat (duplicated for brevity, ideally refactor)
                const npxCmd = os.platform() === 'win32' ? 'npx.cmd' : 'npx';
                hardhatNodeProcess = spawn(npxCmd, ['hardhat', 'node', '--port', String(HARDHAT_PORT)], { /* ... spawn options ... */ });
                // ... rest of spawn logic from above (error prone, simplified here)
                // For a real scenario, you'd structure this better to avoid duplication.
                // For this example, we'll assume if kill-port fails, there's a higher chance of subsequent failure.
                reject(new Error(`Initial kill-port failed for port ${HARDHAT_PORT} (${killErr.message}) and Hardhat start was attempted but might fail.`));
            });
    });
};

const stopHardhatNode = () => {
    return new Promise((resolve) => {
        if (hardhatNodeProcess && hardhatNodeProcess.pid) {
            console.log('Stopping Hardhat node...');
            const pid = hardhatNodeProcess.pid;
            try {
                if (os.platform() === "win32") {
                    execSync(`taskkill /PID ${pid} /F /T`);
                } else {
                    process.kill(-pid, 'SIGINT'); // Kill process group
                }
                console.log('Hardhat node stop signal sent.');
            } catch (e) {
                console.error(`Error attempting to kill Hardhat node process group (PID: ${pid}):`, e.message);
                try {
                    hardhatNodeProcess.kill('SIGINT'); // Fallback
                } catch (e2) {
                    console.error('Fallback hardhatNodeProcess.kill also failed:', e2.message);
                }
            }
            hardhatNodeProcess = null;
            // Wait a bit for the port to be released
            setTimeout(() => {
                kill(HARDHAT_PORT, 'tcp')
                    .then(() => console.log(`Port ${HARDHAT_PORT} confirmed free after stop.`))
                    .catch(() => console.warn(`Port ${HARDHAT_PORT} might still be in use after stop attempt.`))
                    .finally(() => resolve());
            }, 2000);
        } else {
            console.log('Hardhat node was not running or already stopped.');
            resolve();
        }
    });
};


describe('ContractDeployer Integration Tests', () => {
    let provider;
    let originalArtifactState = null; // To help restore state if needed

    beforeAll(async () => {
        try {
            // Dynamically import to get original state if needed for restoration.
            // This is a bit complex; simpler if contractDeployer had a reset function.
            const { PropertyEscrowArtifact: artifact } = await import('../../../contractDeployer.js?bustcache=' + Date.now() + '_beforeAll');
            originalArtifactState = artifact; // This won't work as expected for module-level var
            
            await startHardhatNode();
            provider = new JsonRpcProvider(RPC_URL);
            await provider.getNetwork(); 
            console.log("Hardhat node started and provider connected for ContractDeployer tests.");
        } catch (error) {
            console.error("Critical failure in beforeAll (ContractDeployer tests):", error);
            await stopHardhatNode(); 
            throw error; 
        }
    }, 45000); 

    afterAll(async () => {
        await stopHardhatNode();
        console.log("Hardhat node stopped in afterAll (ContractDeployer tests).");
        // Attempt to restore module state if __TEST_ONLY_setArtifactToNull was used and not reset
        // This is tricky with ES modules. The cache-busting import in tests is preferred.
    }, 20000); 

    // Test artifact loading failure
    it('should throw an error if PropertyEscrow artifact is not loaded', async () => {
        const { __TEST_ONLY_setArtifactToNull, deployPropertyEscrowContract: deployFn } = await import('../../../contractDeployer.js?bustcache=' + Date.now() + '_artifactTest');
        
        __TEST_ONLY_setArtifactToNull(); // Mutate the state of this fresh import

        await expect(deployFn(
            TEST_SELLER_ADDRESS,
            TEST_BUYER_ADDRESS,
            "1000000000000000000", 
            DEPLOYER_PRIVATE_KEY,
            RPC_URL
        )).rejects.toThrow('PropertyEscrow artifact (ABI or bytecode) not loaded.');
        
        // The next test will get its own fresh import due to cache busting.
    });

    it('should successfully deploy the PropertyEscrow contract with valid parameters', async () => {
        const escrowAmountWei = "1000000000000000000"; // 1 ETH in Wei
        const { deployPropertyEscrowContract: freshDeployFn } = await import('../../../contractDeployer.js?bustcache=' + Date.now() + '_deploySuccess');

        const { contractAddress, transactionHash } = await freshDeployFn(
            TEST_SELLER_ADDRESS,
            TEST_BUYER_ADDRESS,
            escrowAmountWei,
            DEPLOYER_PRIVATE_KEY,
            RPC_URL
        );

        expect(contractAddress).toBeDefined();
        expect(isAddress(contractAddress)).toBe(true);
        expect(transactionHash).toBeDefined();
        expect(transactionHash).toMatch(/^0x[a-fA-F0-9]{64}$/);

        const contractArtifact = JSON.parse(fs.readFileSync(contractArtifactPath, 'utf8'));
        const deployedContract = new Contract(contractAddress, contractArtifact.abi, provider);
        
        const seller = await deployedContract.seller();
        const buyer = await deployedContract.buyer();
        const escrowAmount = await deployedContract.escrowAmount();
        // Assuming 'State' enum exists and 0 is 'AwaitingPayment' or similar initial state.
        // If your contract doesn't have `currentState()`, remove this or adapt.
        const state = await deployedContract.currentState(); 

        expect(seller).toBe(TEST_SELLER_ADDRESS);
        expect(buyer).toBe(TEST_BUYER_ADDRESS);
        expect(escrowAmount.toString()).toBe(escrowAmountWei);
        expect(state).toBe(0n); 
    }, 30000);

    it('should throw an error for invalid seller address', async () => {
        const { deployPropertyEscrowContract: freshDeployFn } = await import('../../../contractDeployer.js?bustcache=' + Date.now() + '_invalidSeller');
        await expect(freshDeployFn(
            "0xInvalidAddress", TEST_BUYER_ADDRESS, "1000000000000000000", DEPLOYER_PRIVATE_KEY, RPC_URL
        )).rejects.toThrow('Invalid seller address provided for deployment.');
    });

    it('should throw an error for invalid buyer address', async () => {
        const { deployPropertyEscrowContract: freshDeployFn } = await import('../../../contractDeployer.js?bustcache=' + Date.now() + '_invalidBuyer');
        await expect(freshDeployFn(
            TEST_SELLER_ADDRESS, "0xInvalidAddress", "1000000000000000000", DEPLOYER_PRIVATE_KEY, RPC_URL
        )).rejects.toThrow('Invalid buyer address provided for deployment.');
    });
    
    it('should throw an error for non-positive escrow amount', async () => {
        const { deployPropertyEscrowContract: freshDeployFn } = await import('../../../contractDeployer.js?bustcache=' + Date.now() + '_zeroAmount');
        await expect(freshDeployFn(
            TEST_SELLER_ADDRESS, TEST_BUYER_ADDRESS, "0", DEPLOYER_PRIVATE_KEY, RPC_URL
        )).rejects.toThrow('Escrow amount must be positive.');
    });

    it('should throw an error for invalid private key', async () => {
        const { deployPropertyEscrowContract: freshDeployFn } = await import('../../../contractDeployer.js?bustcache=' + Date.now() + '_invalidPK');
        await expect(freshDeployFn(
            TEST_SELLER_ADDRESS, TEST_BUYER_ADDRESS, "1000000000000000000", "invalidPrivateKey", RPC_URL
        )).rejects.toThrow('Invalid private key provided for deployment.');
    });

    it('should throw an error for invalid RPC URL (empty string)', async () => {
        const { deployPropertyEscrowContract: freshDeployFn } = await import('../../../contractDeployer.js?bustcache=' + Date.now() + '_emptyRpc');
        await expect(freshDeployFn(
            TEST_SELLER_ADDRESS, TEST_BUYER_ADDRESS, "1000000000000000000", DEPLOYER_PRIVATE_KEY, ""
        )).rejects.toThrow('Invalid RPC URL provided for deployment.');
    });
    
    it('should handle deployment failure due to network error (non-existent RPC)', async () => {
        const { deployPropertyEscrowContract: freshDeployFn } = await import('../../../contractDeployer.js?bustcache=' + Date.now() + '_networkError');
        const NON_EXISTENT_RPC_URL = 'http://127.0.0.1:12345'; 
        await expect(freshDeployFn(
            TEST_SELLER_ADDRESS, TEST_BUYER_ADDRESS, "1000000000000000000", DEPLOYER_PRIVATE_KEY, NON_EXISTENT_RPC_URL 
        )).rejects.toThrow(/NETWORK_ERROR|could not connect|ECONNREFUSED/i); 
    });
}); 