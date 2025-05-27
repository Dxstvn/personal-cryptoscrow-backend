// src/utils/__tests__/contractDeployer.test.js

import { jest } from '@jest/globals';
import { ethers as actualEthers } from 'ethers'; 


const originalConsoleError = console.error;
const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;

// --- Mock instances that will be returned by constructors ---
const mockProviderInstance = {};
const mockDeployerWalletInstance = { address: 'mockDeployerAddress' };
const mockDeployedContractInstance = {
    waitForDeployment: jest.fn().mockResolvedValue(undefined), 
    getAddress: jest.fn().mockResolvedValue('mockDeployedContractAddress'),
    deploymentTransaction: jest.fn().mockReturnValue({ hash: 'mockTxHash' }),
};
const mockContractFactoryInstance = {
    deploy: jest.fn().mockResolvedValue(mockDeployedContractInstance),
};

let mockedEthersModule; // Will hold the freshly imported (and mocked) ethers module

jest.unstable_mockModule('ethers', () => {
    const MockJsonRpcProvider = jest.fn().mockReturnValue(mockProviderInstance);
    const MockWallet = jest.fn().mockReturnValue(mockDeployerWalletInstance);
    const MockContractFactory = jest.fn().mockReturnValue(mockContractFactoryInstance);
    const mockIsAddressFn = jest.fn((address) => actualEthers.isAddress(address)); 

    return {
        __esModule: true, 
        JsonRpcProvider: MockJsonRpcProvider,
        Wallet: MockWallet,
        ContractFactory: MockContractFactory,
        isAddress: mockIsAddressFn,
        parseUnits: actualEthers.parseUnits, 
    };
});


// --- Test Suite ---
describe('Contract Deployer Service (contractDeployer.js)', () => {
    let deployPropertyEscrowContract; 
    // serviceModuleForArtifactTest is not needed at this scope, will be defined inside the specific describe block

    const validSellerAddress = actualEthers.Wallet.createRandom().address;
    const validBuyerAddress = actualEthers.Wallet.createRandom().address;
    const validServiceWallet = actualEthers.Wallet.createRandom().address;
    const validEscrowAmountWei = '1000000000000000000'; 
    const validPrivateKey = '0x0123456789012345678901234567890123456789012345678901234567890123';
    const validRpcUrl = 'http://localhost:8545';

    beforeAll(() => {
        // You can keep these commented if you prefer Jest's default handling or uncomment to globally silence for all tests in this file.
        // console.error = jest.fn(); 
        // console.log = jest.fn();
        // console.warn = jest.fn();
    });

    beforeEach(async () => {
        jest.resetModules(); 

        mockedEthersModule = await import('ethers');

        mockDeployedContractInstance.waitForDeployment.mockClear().mockResolvedValue(undefined);
        mockDeployedContractInstance.getAddress.mockClear().mockResolvedValue('mockDeployedContractAddress');
        mockDeployedContractInstance.deploymentTransaction.mockClear().mockReturnValue({ hash: 'mockTxHash' });
        mockContractFactoryInstance.deploy.mockClear().mockResolvedValue(mockDeployedContractInstance);

        mockedEthersModule.isAddress.mockImplementation((address) => actualEthers.isAddress(address));
        
        mockedEthersModule.JsonRpcProvider.mockClear().mockReturnValue(mockProviderInstance);
        mockedEthersModule.Wallet.mockClear().mockReturnValue(mockDeployerWalletInstance);
        mockedEthersModule.ContractFactory.mockClear().mockReturnValue(mockContractFactoryInstance);

        // Spy on console methods, but allow them to call original for debugging if needed
        console.error = jest.fn(originalConsoleError); 
        console.log = jest.fn(originalConsoleLog);
        console.warn = jest.fn(originalConsoleWarn);

        // Import the main module for most tests
        const module = await import('../../contractDeployer.js'); // Adjust path if contractDeployer is in services
        deployPropertyEscrowContract = module.deployPropertyEscrowContract;
    });

    afterEach(() => {
        // No specific module unmock needed here as we are not using jest.doMock('module') anymore for artifact test
    });

    afterAll(() => {
        // Restore original console methods if they were globally spied on in beforeAll
        // console.error = originalConsoleError; 
        // console.log = originalConsoleLog;
        // console.warn = originalConsoleWarn;
    });

    it('should successfully deploy the PropertyEscrow contract with valid inputs', async () => {
        const result = await deployPropertyEscrowContract(
            validSellerAddress,
            validBuyerAddress,
            validEscrowAmountWei,
            validPrivateKey,
            validRpcUrl,
            validServiceWallet
        );

        expect(mockedEthersModule.JsonRpcProvider).toHaveBeenCalledWith(validRpcUrl);
        expect(mockedEthersModule.Wallet).toHaveBeenCalledWith(validPrivateKey, mockProviderInstance);
        expect(mockedEthersModule.ContractFactory).toHaveBeenCalledWith(
            expect.any(Array), 
            expect.any(String), 
            mockDeployerWalletInstance
        );
        expect(mockContractFactoryInstance.deploy).toHaveBeenCalledWith(
            validSellerAddress,
            validBuyerAddress,
            validEscrowAmountWei,
            validServiceWallet
        );
        expect(mockDeployedContractInstance.waitForDeployment).toHaveBeenCalledTimes(1);
        expect(mockDeployedContractInstance.getAddress).toHaveBeenCalledTimes(1);
        expect(mockDeployedContractInstance.deploymentTransaction).toHaveBeenCalledTimes(1);

        expect(result).toEqual({
            contractAddress: 'mockDeployedContractAddress',
            transactionHash: 'mockTxHash',
        });
        expect(console.log).toHaveBeenCalledWith('PropertyEscrow contract deployed successfully!');
    });

    describe('Input Validations', () => {
        it('should throw if sellerAddress is invalid', async () => {
            mockedEthersModule.isAddress.mockImplementationOnce((addr) => addr !== 'invalidSeller');
            await expect(
                deployPropertyEscrowContract('invalidSeller', validBuyerAddress, validEscrowAmountWei, validPrivateKey, validRpcUrl, validServiceWallet)
            ).rejects.toThrow('Invalid seller address provided for deployment.');
        });

        it('should throw if buyerAddress is invalid', async () => {
            mockedEthersModule.isAddress
                .mockImplementationOnce((addr) => addr === validSellerAddress) 
                .mockImplementationOnce((addr) => addr !== 'invalidBuyer'); 
            await expect(
                deployPropertyEscrowContract(validSellerAddress, 'invalidBuyer', validEscrowAmountWei, validPrivateKey, validRpcUrl, validServiceWallet)
            ).rejects.toThrow('Invalid buyer address provided for deployment.');
        });

        it('should throw if serviceWallet is invalid', async () => {
            mockedEthersModule.isAddress
                .mockImplementationOnce((addr) => addr === validSellerAddress) 
                .mockImplementationOnce((addr) => addr === validBuyerAddress)
                .mockImplementationOnce((addr) => addr !== 'invalidServiceWallet'); 
            await expect(
                deployPropertyEscrowContract(validSellerAddress, validBuyerAddress, validEscrowAmountWei, validPrivateKey, validRpcUrl, 'invalidServiceWallet')
            ).rejects.toThrow('Invalid service wallet address provided for deployment.');
        });

        it('should throw if escrowAmountWei is zero', async () => {
            await expect(
                deployPropertyEscrowContract(validSellerAddress, validBuyerAddress, '0', validPrivateKey, validRpcUrl, validServiceWallet)
            ).rejects.toThrow('Escrow amount must be positive.');
        });

        it('should throw if escrowAmountWei is negative', async () => {
            await expect(
                deployPropertyEscrowContract(validSellerAddress, validBuyerAddress, '-100', validPrivateKey, validRpcUrl, validServiceWallet)
            ).rejects.toThrow('Escrow amount must be positive.');
        });
        
        it('should throw if escrowAmountWei is not a valid number string', async () => {
            await expect(
                deployPropertyEscrowContract(validSellerAddress, validBuyerAddress, 'not-a-number', validPrivateKey, validRpcUrl, validServiceWallet)
            ).rejects.toThrow('Invalid escrow amount provided for deployment. Must be a valid number string representing Wei.');
        });

        it('should throw if privateKey is invalid (not hex)', async () => {
            await expect(
                deployPropertyEscrowContract(validSellerAddress, validBuyerAddress, validEscrowAmountWei, 'invalidPK', validRpcUrl, validServiceWallet)
            ).rejects.toThrow('Invalid private key provided for deployment. Must be a hex string.');
        });
        
        it('should throw if privateKey is missing prefix', async () => {
            await expect( 
                deployPropertyEscrowContract(validSellerAddress, validBuyerAddress, validEscrowAmountWei, '0123456789abcdef'.repeat(4), validRpcUrl, validServiceWallet)
            ).rejects.toThrow('Invalid private key provided for deployment. Must be a hex string.');
        });

        it('should throw if rpcUrl is not a string', async () => {
            await expect(
                deployPropertyEscrowContract(validSellerAddress, validBuyerAddress, validEscrowAmountWei, validPrivateKey, null, validServiceWallet)
            ).rejects.toThrow('Invalid RPC URL provided for deployment.');
        });
         it('should throw if rpcUrl is an empty string', async () => {
            await expect(
                deployPropertyEscrowContract(validSellerAddress, validBuyerAddress, validEscrowAmountWei, validPrivateKey, '', validServiceWallet)
            ).rejects.toThrow('Invalid RPC URL provided for deployment.');
        });
    });

    describe('Artifact Loading Failure', () => {
        let deployFnForArtifactTest;
        let consoleErrorSpy; // For the artifact loading error log in contractDeployer.js
        let consoleLogSpy;   // For the backdoor function log
    
        beforeEach(async () => {
            // Spy on console methods BEFORE resetting modules and importing the service
            consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
            consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

            jest.resetModules(); 
            mockedEthersModule = await import('ethers'); // Re-initialize ethers mocks for this scope
            
            // Set up env vars that contractDeployer.js might expect if it read them (it doesn't for PK/RPC)
            process.env.RPC_URL = 'http://mock-rpc-for-this-specific-test.invalid'; 
            // process.env.BACKEND_WALLET_PRIVATE_KEY = dummyUnitTestPrivateKey; // Not needed by contractDeployer.js

            const module = await import('../../contractDeployer.js'); // Path relative to this test file
            deployFnForArtifactTest = module.deployPropertyEscrowContract;
            
            // Call the backdoor function on this specific instance
            if (module.__TEST_ONLY_setArtifactToNull) {
                module.__TEST_ONLY_setArtifactToNull();
            } else {
                originalConsoleError("Warning: __TEST_ONLY_setArtifactToNull not found in imported module. Artifact loading failure test might not be accurate.");
            }
        });
    
        it('should throw if PropertyEscrow artifact is not loaded (simulated via backdoor)', async () => {
            await expect(
                deployFnForArtifactTest(validSellerAddress, validBuyerAddress, validEscrowAmountWei, validPrivateKey, validRpcUrl, validServiceWallet)
            ).rejects.toThrow('PropertyEscrow artifact (ABI or bytecode) not loaded. Check path and artifact integrity.');
            
            expect(consoleLogSpy).toHaveBeenCalledWith(
                '[ContractDeployer] __TEST_ONLY_setArtifactToNull called, setting PropertyEscrowArtifact to null'
            );
            // The console.error for "Failed to load PropertyEscrow.json artifact..." happens at module load time.
            // If the backdoor is used *after* module load, that specific log might not be re-triggered by this test's actions.
            // The key is that the deploy function itself throws the correct error.
        });
    
        afterEach(() => {
            if(consoleErrorSpy) consoleErrorSpy.mockRestore();
            if(consoleLogSpy) consoleLogSpy.mockRestore();
        });
    });
    

    describe('Ethers.js Interaction Failures', () => {
        it('should throw if JsonRpcProvider instantiation fails', async () => {
            mockedEthersModule.JsonRpcProvider.mockImplementationOnce(() => { 
                throw new Error('Mocked Provider Error');
            });
            await expect(
                deployPropertyEscrowContract(validSellerAddress, validBuyerAddress, validEscrowAmountWei, validPrivateKey, validRpcUrl, validServiceWallet)
            ).rejects.toThrow('Smart contract deployment failed: Mocked Provider Error');
        });

        it('should throw if Wallet instantiation fails', async () => {
            mockedEthersModule.Wallet.mockImplementationOnce(() => { 
                throw new Error('Mocked Wallet Error');
            });
            await expect(
                deployPropertyEscrowContract(validSellerAddress, validBuyerAddress, validEscrowAmountWei, validPrivateKey, validRpcUrl, validServiceWallet)
            ).rejects.toThrow('Smart contract deployment failed: Mocked Wallet Error');
        });
        
        it('should throw if ContractFactory instantiation fails', async () => {
            mockedEthersModule.ContractFactory.mockImplementationOnce(() => { 
                throw new Error('Mocked ContractFactory Error');
            });
            await expect(
                deployPropertyEscrowContract(validSellerAddress, validBuyerAddress, validEscrowAmountWei, validPrivateKey, validRpcUrl, validServiceWallet)
            ).rejects.toThrow('Smart contract deployment failed: Mocked ContractFactory Error');
        });

        it('should handle INSUFFICIENT_FUNDS error during deployment', async () => {
            const insufficientFundsError = { code: 'INSUFFICIENT_FUNDS', message: 'insufficient funds for intrinsic transaction cost' };
            mockContractFactoryInstance.deploy.mockRejectedValueOnce(insufficientFundsError);
            await expect(
                deployPropertyEscrowContract(validSellerAddress, validBuyerAddress, validEscrowAmountWei, validPrivateKey, validRpcUrl, validServiceWallet)
            ).rejects.toThrow(`Deployment failed: Insufficient funds in deployer account (${mockDeployerWalletInstance.address}). Error: ${insufficientFundsError.message}`);
        });

        it('should handle NETWORK_ERROR during deployment', async () => {
            const networkError = { code: 'NETWORK_ERROR', message: 'could not detect network' };
            mockContractFactoryInstance.deploy.mockRejectedValueOnce(networkError);
            await expect(
                deployPropertyEscrowContract(validSellerAddress, validBuyerAddress, validEscrowAmountWei, validPrivateKey, validRpcUrl, validServiceWallet)
            ).rejects.toThrow(`Deployment failed: Network error connecting to RPC URL (${validRpcUrl}). Error: ${networkError.message}`);
        });
        
        it('should handle UNPREDICTABLE_GAS_LIMIT error during deployment', async () => {
            const gasError = { code: 'UNPREDICTABLE_GAS_LIMIT', message: 'cannot estimate gas; transaction may fail or may require manual gas limit' };
            mockContractFactoryInstance.deploy.mockRejectedValueOnce(gasError);
            await expect(
                deployPropertyEscrowContract(validSellerAddress, validBuyerAddress, validEscrowAmountWei, validPrivateKey, validRpcUrl, validServiceWallet)
            ).rejects.toThrow(`Deployment failed: Unpredictable gas limit. This might be due to an error in the contract constructor or insufficient funds. Error: ${gasError.message}`);
        });

        it('should handle generic error during factory.deploy()', async () => {
            mockContractFactoryInstance.deploy.mockRejectedValueOnce(new Error('Generic Deploy Error'));
            await expect(
                deployPropertyEscrowContract(validSellerAddress, validBuyerAddress, validEscrowAmountWei, validPrivateKey, validRpcUrl, validServiceWallet)
            ).rejects.toThrow('Smart contract deployment failed: Generic Deploy Error');
        });

        it('should handle error during waitForDeployment()', async () => {
            mockDeployedContractInstance.waitForDeployment.mockRejectedValueOnce(new Error('Wait For Deployment Error'));
            await expect(
                deployPropertyEscrowContract(validSellerAddress, validBuyerAddress, validEscrowAmountWei, validPrivateKey, validRpcUrl, validServiceWallet)
            ).rejects.toThrow('Smart contract deployment failed: Wait For Deployment Error');
        });
        
        it('should handle error if getAddress() fails', async () => {
            mockDeployedContractInstance.getAddress.mockRejectedValueOnce(new Error('Get Address Error'));
            await expect(
                deployPropertyEscrowContract(validSellerAddress, validBuyerAddress, validEscrowAmountWei, validPrivateKey, validRpcUrl, validServiceWallet)
            ).rejects.toThrow('Smart contract deployment failed: Get Address Error');
        });

        it('should handle missing transaction hash gracefully', async () => {
            mockDeployedContractInstance.deploymentTransaction.mockReturnValueOnce(null);
            const result = await deployPropertyEscrowContract(
                validSellerAddress,
                validBuyerAddress,
                validEscrowAmountWei,
                validPrivateKey,
                validRpcUrl,
                validServiceWallet
            );
            expect(result.transactionHash).toBeNull();
            expect(console.warn).toHaveBeenCalledWith("Could not retrieve deployment transaction hash.");
        });
    });
}); 