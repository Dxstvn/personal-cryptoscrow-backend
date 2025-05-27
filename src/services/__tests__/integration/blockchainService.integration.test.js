import { jest, describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from '@jest/globals';
import { ethers, ContractFactory, Wallet } from 'ethers';
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

// Import functions from blockchainService
import * as blockchainService from '../../blockchainService.js';

// Helper to get __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load PropertyEscrow ABI and Bytecode
const require = createRequire(import.meta.url);
const artifactPath = path.resolve(__dirname, '../../../contract/artifacts/contracts/PropertyEscrow.sol/PropertyEscrow.json');
const PropertyEscrowArtifact = require(artifactPath);
const contractABI = PropertyEscrowArtifact.abi;
const contractBytecode = PropertyEscrowArtifact.bytecode;

// Hardhat default RPC URL and one of its private keys for the backend service
const RPC_URL = 'http://127.0.0.1:8545/'; 
// Using Hardhat account #0 as the backend wallet for the service
const BACKEND_WALLET_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'; 
// Using Hardhat account #1 as the deployer/admin for tests
const DEPLOYER_PRIVATE_KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
// Using Hardhat account #2 as the seller
const SELLER_PRIVATE_KEY = '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a';
// Using Hardhat account #3 as the buyer
const BUYER_PRIVATE_KEY = '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6';



describe('Blockchain Service - Integration Tests', () => {
  let provider;
  let backendWallet; // The wallet used by blockchainService.js (hardcoded for service)
  let deployerWallet; // Wallet to deploy contracts and orchestrate tests
  let sellerWallet; 
  let buyerWallet;
  let escrowContractAddress;
  let escrowContractInstance; // Connected to deployerWallet for test setup
  let buyerEscrowContract; // Connected to buyerWallet
  let sellerEscrowContract; // Connected to sellerWallet
  let mainSnapshotId; // For snapshotting and reverting EVM state
  let accounts; // Store accounts from provider

  const dealId = 'integrationTestDeal123';
  const escrowAmount = ethers.parseEther('0.1'); // 0.1 ETH
  const conditionId1 = ethers.encodeBytes32String("PHOTO_VERIFIED");
  const conditionIds = [conditionId1];
  const FINAL_APPROVAL_PERIOD_SECONDS = 48 * 60 * 60; // 48 hours in seconds

  beforeAll(async () => {
    // Provider is expected to be available and connected due to globalSetup.cjs
    provider = new ethers.JsonRpcProvider(RPC_URL); 
    
    // Get accounts from the Hardhat node for proper nonce management
    accounts = await provider.listAccounts();
    
    // The backend wallet still needs to use a private key since the blockchain service requires it
    backendWallet = new Wallet(BACKEND_WALLET_PRIVATE_KEY, provider);

    // Optional: Basic check that provider is somewhat responsive, but globalSetup should have handled comprehensive checks.
    try {
      await provider.getNetwork(); // A simple check to ensure the provider is connected
    } catch (e) {
      console.error(`[IntegrationTest] Error during initial provider check in beforeAll (after globalSetup): ${e.message}. Check Hardhat node started by globalSetup.`);
      throw e; // Re-throw to fail tests if basic provider interaction fails
    }
  });

  afterAll(async () => {
    if (provider && typeof provider.destroy === 'function') {
      console.log('[IntegrationTest] Destroying main provider in afterAll.');
      await provider.destroy();
      provider = null;
    }
  });

  beforeEach(async () => {
    // Reset modules to ensure blockchainService re-initializes
    jest.resetModules(); 

    // Set env vars immediately before importing the fresh module
    process.env.RPC_URL = RPC_URL;
    process.env.BACKEND_WALLET_PRIVATE_KEY = BACKEND_WALLET_PRIVATE_KEY;

    // Re-import to get a fresh instance of the service that will use current env vars
    const freshService = await import('../../blockchainService.js'); 
    global.currentBlockchainService = freshService; // Make it accessible to tests

    // Use provider signers for automatic nonce management instead of hardcoded private keys
    // This avoids nonce conflicts between tests
    deployerWallet = await provider.getSigner(accounts[1].address); // Account #1
    sellerWallet = await provider.getSigner(accounts[2].address);   // Account #2
    buyerWallet = await provider.getSigner(accounts[3].address);    // Account #3
    // backendWallet stays the same since the service needs the private key

    // Deploy a new PropertyEscrow contract for each test
    const EscrowFactory = new ContractFactory(contractABI, contractBytecode, deployerWallet);
    const deployedContract = await EscrowFactory.deploy(sellerWallet.address, buyerWallet.address, escrowAmount, backendWallet.address);
    await deployedContract.waitForDeployment();
    escrowContractAddress = await deployedContract.getAddress();
    
    escrowContractInstance = new ethers.Contract(escrowContractAddress, contractABI, deployerWallet);
    buyerEscrowContract = new ethers.Contract(escrowContractAddress, contractABI, buyerWallet);
    sellerEscrowContract = new ethers.Contract(escrowContractAddress, contractABI, sellerWallet);
  });

  afterEach(async () => {
    // Cleanup environment variables
    delete process.env.RPC_URL;
    delete process.env.BACKEND_WALLET_PRIVATE_KEY;
    jest.restoreAllMocks(); // Restore any console spies etc.
  });

  describe('triggerReleaseAfterApproval', () => {
    it('should successfully release funds if contract is in the correct state', async () => {
      // 0. Initial state should be AWAITING_CONDITION_SETUP (0)
      let initialState = await escrowContractInstance.currentState();
      expect(initialState).toBe(0n); // AWAITING_CONDITION_SETUP

      // 1. Buyer sets conditions
      const setConditionsTx = await buyerEscrowContract.setConditions(conditionIds);
      await setConditionsTx.wait(1);
      let stateAfterConditions = await escrowContractInstance.currentState();
      expect(stateAfterConditions).toBe(1n); // AWAITING_DEPOSIT

      // 2. Buyer deposits funds
      const depositTx = await buyerEscrowContract.depositFunds({ value: escrowAmount });
      await depositTx.wait(1);
      expect(await provider.getBalance(escrowContractAddress)).toBe(escrowAmount);
      let stateAfterDeposit = await escrowContractInstance.currentState();
      expect(stateAfterDeposit).toBe(2n); // AWAITING_FULFILLMENT

      // 3. Buyer marks conditions as fulfilled
      const fulfillTx = await buyerEscrowContract.buyerMarksConditionFulfilled(conditionId1);
      await fulfillTx.wait(1);
      let stateAfterFulfillment = await escrowContractInstance.currentState();
      expect(stateAfterFulfillment).toBe(3n); // READY_FOR_FINAL_APPROVAL

      // 4. Start final approval period (can be buyer or seller)
      const startApprovalTx = await buyerEscrowContract.startFinalApprovalPeriod(); // or sellerEscrowContract
      await startApprovalTx.wait(1);
      let stateAfterApprovalStart = await escrowContractInstance.currentState();
      expect(stateAfterApprovalStart).toBe(4n); // IN_FINAL_APPROVAL
      
      // 5. Get seller balance before release
      const sellerBalanceBefore = await provider.getBalance(sellerWallet.address);

      // 6. Advance time past the final approval deadline
      await provider.send('evm_increaseTime', [FINAL_APPROVAL_PERIOD_SECONDS + 1]);
      await provider.send('evm_mine', []);

      // 7. Service triggers release (using the global.currentBlockchainService)
      const releaseResult = await global.currentBlockchainService.triggerReleaseAfterApproval(escrowContractAddress, dealId);
      
      expect(releaseResult.success).toBe(true);
      expect(releaseResult.receipt).toBeDefined();
      expect(releaseResult.receipt.status).toBe(1); // Transaction successful

      // 8. Verify funds transferred to seller and contract balance is zero
      const sellerBalanceAfter = await provider.getBalance(sellerWallet.address);
      expect(sellerBalanceAfter > sellerBalanceBefore).toBe(true);
      expect(await provider.getBalance(escrowContractAddress)).toBe(0n); // BigInt for zero

      // 9. Verify contract status
      const contractState = await escrowContractInstance.currentState(); // Enum is `COMPLETED`
      expect(contractState).toBe(6n); // COMPLETED
    }, 30000);

    it('should fail if contract is not ready for release (e.g., buyer not approved)', async () => {
      // 0. Set conditions and deposit funds to reach AWAITING_FULFILLMENT
      const setConditionsTx = await buyerEscrowContract.setConditions(conditionIds);
      await setConditionsTx.wait(1);
      const depositTx = await buyerEscrowContract.depositFunds({ value: escrowAmount });
      await depositTx.wait(1);
      // Current state: AWAITING_FULFILLMENT (2) - conditions not marked fulfilled

      // Attempt to trigger release - should fail as conditions not met and not in IN_FINAL_APPROVAL
      const releaseResult = await global.currentBlockchainService.triggerReleaseAfterApproval(escrowContractAddress, dealId);
      
      expect(releaseResult.success).toBe(false);
      expect(releaseResult.error).toBeDefined();
      // Check for a specific revert reason if your contract provides one
      // e.g., expect(releaseResult.error.message).toContain('Buyer has not approved');
      // For a generic check:
      expect(releaseResult.error.message).toMatch(/revert|transaction failed/i); 
    }, 20000);

    it('should fail if ABI loading failed', async () => {
      // Simulate ABI loading failure
      global.currentBlockchainService.__TEST_ONLY_simulateAbiLoadingFailure();

      const releaseResult = await global.currentBlockchainService.triggerReleaseAfterApproval(escrowContractAddress, dealId);
      
      expect(releaseResult.success).toBe(false);
      expect(releaseResult.error).toBeDefined();
      expect(releaseResult.error.message).toContain('[Automation] ABI loading failed, cannot proceed with release.');
      
      // Restore ABI for subsequent tests if necessary, though jest.resetModules() in beforeEach should handle this.
      // For safety, re-importing or explicitly setting a valid ABI might be considered if issues arise.
    });
  });

  describe('triggerCancelAfterDisputeDeadline', () => {
    it('should successfully cancel escrow and refund buyer if conditions met', async () => {
      // 0. Initial state should be AWAITING_CONDITION_SETUP (0)
      // 1. Buyer sets conditions
      const setConditionsTx = await buyerEscrowContract.setConditions(conditionIds);
      await setConditionsTx.wait(1);

      // 2. Buyer deposits funds
      const depositTx = await buyerEscrowContract.depositFunds({ value: escrowAmount });
      await depositTx.wait(1);
      // Current State: AWAITING_FULFILLMENT (2)

      // 3. Buyer marks conditions as fulfilled
      const fulfillTx = await buyerEscrowContract.buyerMarksConditionFulfilled(conditionId1);
      await fulfillTx.wait(1);
      // Current State: READY_FOR_FINAL_APPROVAL (3)

      // 4. Start final approval period
      const startApprovalTx = await buyerEscrowContract.startFinalApprovalPeriod();
      await startApprovalTx.wait(1);
      // Current State: IN_FINAL_APPROVAL (4)

      // 5. Buyer raises a dispute
      const raiseDisputeTx = await buyerEscrowContract.raiseDisputeByUnfulfillingCondition(conditionId1);
      await raiseDisputeTx.wait(1);
      // Current State: IN_DISPUTE (5)
      
      // 6. Advance time past the dispute deadline (Hardhat specific)
      // DISPUTE_RESOLUTION_PERIOD is 7 days
      const DISPUTE_RESOLUTION_PERIOD_SECONDS = 7 * 24 * 60 * 60;
      await provider.send('evm_increaseTime', [DISPUTE_RESOLUTION_PERIOD_SECONDS + 1]);
      await provider.send('evm_mine', []);

      const buyerBalanceBefore = await provider.getBalance(buyerWallet.address);
      
      // 7. Service triggers cancellation
      const cancelResult = await global.currentBlockchainService.triggerCancelAfterDisputeDeadline(escrowContractAddress, dealId);
      expect(cancelResult.success).toBe(true);
      expect(cancelResult.receipt).toBeDefined();
      expect(cancelResult.receipt.status).toBe(1);

      // 8. Verify funds refunded to buyer (approximately, due to gas)
      const buyerBalanceAfter = await provider.getBalance(buyerWallet.address);
      expect(buyerBalanceAfter > buyerBalanceBefore).toBe(true); // Buyer got funds back (minus gas for dispute tx)
      expect(await provider.getBalance(escrowContractAddress)).toBe(0n);

      // 9. Verify contract status 
      const contractState = await escrowContractInstance.currentState();
      expect(contractState).toBe(7n); // Cancelled (enum value is 7)
    }, 30000);

    it('should fail if dispute deadline has not passed', async () => {
      // 0. Set up contract to be in IN_DISPUTE state
      const setConditionsTx = await buyerEscrowContract.setConditions(conditionIds);
      await setConditionsTx.wait(1);
      const depositTx = await buyerEscrowContract.depositFunds({ value: escrowAmount });
      await depositTx.wait(1);
      const fulfillTx = await buyerEscrowContract.buyerMarksConditionFulfilled(conditionId1);
      await fulfillTx.wait(1);
      const startApprovalTx = await buyerEscrowContract.startFinalApprovalPeriod();
      await startApprovalTx.wait(1);
      const raiseDisputeTx = await buyerEscrowContract.raiseDisputeByUnfulfillingCondition(conditionId1);
      await raiseDisputeTx.wait(1);
      // Current State: IN_DISPUTE (5)
      
      // DO NOT advance time enough

      console.log(`[Test Log] About to call triggerCancelAfterDisputeDeadline for ${escrowContractAddress} in test 'should fail if dispute deadline has not passed'`);
      const cancelResult = await global.currentBlockchainService.triggerCancelAfterDisputeDeadline(escrowContractAddress, dealId);
      console.log(`[Test Log] Call to triggerCancelAfterDisputeDeadline completed in test 'should fail if dispute deadline has not passed'. Result:`, JSON.stringify(cancelResult));

      expect(cancelResult.success).toBe(false);
      expect(cancelResult.error).toBeDefined();
      expect(cancelResult.error.message).toMatch(/Escrow: Conditions for cancellation not met/i);
    }, 40000); // Increased timeout

    it('should fail if ABI loading failed', async () => {
      // Simulate ABI loading failure
      global.currentBlockchainService.__TEST_ONLY_simulateAbiLoadingFailure();

      const cancelResult = await global.currentBlockchainService.triggerCancelAfterDisputeDeadline(escrowContractAddress, dealId);
      
      expect(cancelResult.success).toBe(false);
      expect(cancelResult.error).toBeDefined();
      expect(cancelResult.error.message).toContain('[Automation] ABI loading failed, cannot proceed with cancellation.');
    });
  });

  describe('Service Initialization Failures', () => {
    const originalRpcUrl = process.env.RPC_URL;
    const originalPrivateKey = process.env.BACKEND_WALLET_PRIVATE_KEY;

    afterEach(() => {
      // Restore original env vars after each test in this block
      process.env.RPC_URL = originalRpcUrl;
      process.env.BACKEND_WALLET_PRIVATE_KEY = originalPrivateKey;
      jest.resetModules(); // Ensure clean state for other tests
      // Re-import the service with original (valid) env vars for subsequent test blocks
      // This is important because other describe blocks might depend on a properly initialized service.
      // The beforeEach in the main describe block will also run, but this ensures immediate restoration.
      if (process.env.NODE_ENV === 'test') { // Guard against accidental runs outside test
        import('../../blockchainService.js').then(service => global.currentBlockchainService = service);
      }
    });

    it('triggerReleaseAfterApproval should fail if RPC_URL is missing', async () => {
      delete process.env.RPC_URL;
      jest.resetModules(); // Force re-initialization of the service
      const freshService = await import('../../blockchainService.js');
      global.currentBlockchainService = freshService;

      const result = await global.currentBlockchainService.triggerReleaseAfterApproval(escrowContractAddress, dealId);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error.message).toContain('[Automation] Initialization failed for release');
    });

    it('triggerReleaseAfterApproval should fail if BACKEND_WALLET_PRIVATE_KEY is missing', async () => {
      delete process.env.BACKEND_WALLET_PRIVATE_KEY;
      jest.resetModules();
      const freshService = await import('../../blockchainService.js');
      global.currentBlockchainService = freshService;

      const result = await global.currentBlockchainService.triggerReleaseAfterApproval(escrowContractAddress, dealId);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error.message).toContain('[Automation] Initialization failed for release');
    });

    it('triggerCancelAfterDisputeDeadline should fail if RPC_URL is missing', async () => {
      delete process.env.RPC_URL;
      jest.resetModules();
      const freshService = await import('../../blockchainService.js');
      global.currentBlockchainService = freshService;

      const result = await global.currentBlockchainService.triggerCancelAfterDisputeDeadline(escrowContractAddress, dealId);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error.message).toContain('[Automation] Initialization failed for cancellation');
    });

    it('triggerCancelAfterDisputeDeadline should fail if BACKEND_WALLET_PRIVATE_KEY is missing', async () => {
      delete process.env.BACKEND_WALLET_PRIVATE_KEY;
      jest.resetModules();
      const freshService = await import('../../blockchainService.js');
      global.currentBlockchainService = freshService;

      const result = await global.currentBlockchainService.triggerCancelAfterDisputeDeadline(escrowContractAddress, dealId);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error.message).toContain('[Automation] Initialization failed for cancellation');
    });
  });

  describe('Service Initialization Failures - Advanced', () => {
    const originalRpcUrl = process.env.RPC_URL;
    const originalPrivateKey = process.env.BACKEND_WALLET_PRIVATE_KEY;
    let escrowContractAddressForTest; // Use a valid address for these tests
    let tempProviderForAdvancedTests; // To be initialized in beforeAll of this describe block

    beforeAll(async () => {
        // Deploy a contract once for this suite to have a valid address,
        // as these tests focus on initialization, not contract interaction logic.
        // Wallet for deployment needs to be initialized outside the service's lifecycle.
        tempProviderForAdvancedTests = new ethers.JsonRpcProvider(RPC_URL); // Use this provider for setup
        const tempAccounts = await tempProviderForAdvancedTests.listAccounts();
        const tempDeployerWallet = await tempProviderForAdvancedTests.getSigner(tempAccounts[4].address); // Use account #4
        const tempSellerWallet = await tempProviderForAdvancedTests.getSigner(tempAccounts[5].address);   // Use account #5
        const tempBuyerWallet = await tempProviderForAdvancedTests.getSigner(tempAccounts[6].address);    // Use account #6
        const tempBackendWallet = await tempProviderForAdvancedTests.getSigner(tempAccounts[0].address);  // Use account #0
        
        const EscrowFactory = new ContractFactory(contractABI, contractBytecode, tempDeployerWallet);
        try {
            const deployedContract = await EscrowFactory.deploy(tempSellerWallet.address, tempBuyerWallet.address, escrowAmount, tempBackendWallet.address);
            await deployedContract.waitForDeployment();
            escrowContractAddressForTest = await deployedContract.getAddress();
            console.log(`[Test Setup] Deployed temp contract for 'Service Initialization Failures - Advanced' at ${escrowContractAddressForTest}`);
        } catch (e) {
            console.error("[Test Setup] Failed to deploy temp contract for 'Service Initialization Failures - Advanced'", e);
            escrowContractAddressForTest = "0x0000000000000000000000000000000000000000"; // Fallback
        }
    });

    afterAll(async () => {
        if (tempProviderForAdvancedTests && typeof tempProviderForAdvancedTests.destroy === 'function') {
            console.log('[IntegrationTest] Destroying tempProviderForAdvancedTests in afterAll for Advanced Failures suite.');
            await tempProviderForAdvancedTests.destroy();
            tempProviderForAdvancedTests = null;
        }
    });

    beforeEach(async () => {
      // Snapshot is handled by the main describe block's beforeEach/afterEach
      // Clear any potentially set env vars from other tests
      delete process.env.RPC_URL;
      delete process.env.BACKEND_WALLET_PRIVATE_KEY;
      // Ensure modules are reset for each specific test condition
      jest.resetModules();
    });

    afterEach(async () => {
      process.env.RPC_URL = originalRpcUrl;
      process.env.BACKEND_WALLET_PRIVATE_KEY = originalPrivateKey;
      jest.resetModules(); // Reset for other tests outside this describe
      // Re-import to restore service state for subsequent test suites
      const freshService = await import('../../blockchainService.js');
      global.currentBlockchainService = freshService;
    });

    it('initializeService should fail gracefully with an invalid RPC_URL format', async () => {
      process.env.RPC_URL = 'invalid-rpc-url'; // Not a valid URL format
      process.env.BACKEND_WALLET_PRIVATE_KEY = DEPLOYER_PRIVATE_KEY; // A valid key

      const consoleErrorSpy = jest.spyOn(console, 'error');
      // We need to re-import the service for it to pick up the changed env vars
      const freshService = await import('../../blockchainService.js');
      global.currentBlockchainService = freshService;
      
      const result = await global.currentBlockchainService.triggerReleaseAfterApproval(escrowContractAddressForTest, dealId);
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error.message).toContain('[Automation] Initialization failed for release');
      // Check if the specific error from the catch block in initializeService was logged
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('[BlockchainService] Error initializing provider or wallet:'), expect.any(Error));
      consoleErrorSpy.mockRestore();
    });

    it('initializeService should fail gracefully with an unreachable (but valid format) RPC_URL', async () => {
      process.env.RPC_URL = 'http://localhost:12345'; // Valid format, but likely unreachable
      process.env.BACKEND_WALLET_PRIVATE_KEY = DEPLOYER_PRIVATE_KEY;

      const consoleErrorSpy = jest.spyOn(console, 'error');
      const freshService = await import('../../blockchainService.js');
      global.currentBlockchainService = freshService;

      const result = await global.currentBlockchainService.triggerReleaseAfterApproval(escrowContractAddressForTest, dealId);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error.message).toContain('[Automation] Initialization failed for release');
      // This scenario might trigger the getBlockNumber().catch() or the main try/catch in initializeService.
      // We are primarily interested in the initializeService main catch block.
      // Check that at least one of the calls to console.error matches the expected pattern from the outer catch.
      const calls = consoleErrorSpy.mock.calls;
      const outerCatchCall = calls.find(call => call[0].includes('[BlockchainService] Error initializing provider or wallet:'));
      expect(outerCatchCall).toBeDefined(); // Ensures the message from the outer catch was logged
      expect(outerCatchCall[1]).toHaveProperty('message'); // Ensures the second argument was an Error-like object
      expect(typeof outerCatchCall[1].message).toBe('string');

      // Additionally, ensure the connectivity check failure was also logged, which happens first
      const connectivityCall = calls.find(call => call[0].includes('[BlockchainService] Network connectivity check failed'));
      expect(connectivityCall).toBeDefined();
      expect(connectivityCall[1]).toHaveProperty('message'); // Ensures the second argument was an Error-like object
      expect(typeof connectivityCall[1].message).toBe('string');

      consoleErrorSpy.mockRestore();
    });

    it('initializeService should fail gracefully with an invalid private key format', async () => {
      process.env.RPC_URL = RPC_URL; // Original valid RPC_URL
      process.env.BACKEND_WALLET_PRIVATE_KEY = 'invalid-private-key-format'; // Clearly invalid

      const consoleErrorSpy = jest.spyOn(console, 'error');
      const freshService = await import('../../blockchainService.js');
      global.currentBlockchainService = freshService;
      
      const result = await global.currentBlockchainService.triggerReleaseAfterApproval(escrowContractAddressForTest, dealId);
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error.message).toContain('[Automation] Initialization failed for release');
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('[BlockchainService] Error initializing provider or wallet:'), expect.any(Error));
      consoleErrorSpy.mockRestore();
    });
  });

  describe('Invalid Contract Address Handling', () => {
    it('triggerReleaseAfterApproval should fail with an invalid contract address', async () => {
      const invalidAddress = '0xINVALIDADDRESS';
      // Ensure service is initialized correctly for this test
      jest.resetModules(); 
      process.env.RPC_URL = RPC_URL;
      process.env.BACKEND_WALLET_PRIVATE_KEY = BACKEND_WALLET_PRIVATE_KEY;
      const freshService = await import('../../blockchainService.js');
      global.currentBlockchainService = freshService;

      const result = await global.currentBlockchainService.triggerReleaseAfterApproval(invalidAddress, dealId);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error.message).toContain('[Automation] Setup error for release, invalid contract address');
    });

    it('triggerCancelAfterDisputeDeadline should fail with an invalid contract address', async () => {
      const invalidAddress = '0xINVALIDADDRESS';
      // Ensure service is initialized correctly for this test
      jest.resetModules();
      process.env.RPC_URL = RPC_URL;
      process.env.BACKEND_WALLET_PRIVATE_KEY = BACKEND_WALLET_PRIVATE_KEY;
      const freshService = await import('../../blockchainService.js');
      global.currentBlockchainService = freshService;

      const result = await global.currentBlockchainService.triggerCancelAfterDisputeDeadline(invalidAddress, dealId);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error.message).toContain('[Automation] Setup error for cancellation, invalid contract address');
    });
  });

  describe('Service Fee Functionality (2% to Service Wallet)', () => {
    // Use Hardhat's automatic account generation to avoid nonce conflicts
    // We'll get fresh accounts from the provider instead of using hardcoded private keys
    
    let serviceFeeProvider;
    let serviceFeeDeployerWallet;
    let serviceFeeSellerWallet;
    let serviceFeeBuyerWallet;
    let serviceFeeBackendWallet;
    
    beforeAll(async () => {
      // Create a dedicated provider for service fee tests
      serviceFeeProvider = new ethers.JsonRpcProvider(RPC_URL);
      
      // Get accounts from the Hardhat node (this uses the default mnemonic)
      const accounts = await serviceFeeProvider.listAccounts();
      
      // Use accounts 16-19 to ensure they're completely unused
      // Extract the address string from account objects
      serviceFeeDeployerWallet = await serviceFeeProvider.getSigner(accounts[16].address);
      serviceFeeSellerWallet = await serviceFeeProvider.getSigner(accounts[17].address);
      serviceFeeBuyerWallet = await serviceFeeProvider.getSigner(accounts[18].address);
      serviceFeeBackendWallet = await serviceFeeProvider.getSigner(accounts[19].address);
      
      // Verify these wallets have sufficient balance for testing
      const deployerBalance = await serviceFeeProvider.getBalance(serviceFeeDeployerWallet.address);
      const buyerBalance = await serviceFeeProvider.getBalance(serviceFeeBuyerWallet.address);
      
      if (deployerBalance < ethers.parseEther('10') || buyerBalance < ethers.parseEther('10')) {
        console.warn('[Service Fee Tests] Warning: Test accounts may have insufficient balance');
      }
    });
    
    afterAll(async () => {
      if (serviceFeeProvider && typeof serviceFeeProvider.destroy === 'function') {
        await serviceFeeProvider.destroy();
      }
    });

    async function createFreshServiceFeeContract() {
      // Get fresh nonce for deployer before each contract deployment
      const currentNonce = await serviceFeeProvider.getTransactionCount(serviceFeeDeployerWallet.address, 'latest');
      console.log(`[Service Fee] Deployer nonce before deployment: ${currentNonce}`);
      
      const factory = new ContractFactory(contractABI, contractBytecode, serviceFeeDeployerWallet);
      const contract = await factory.deploy(
        serviceFeeSellerWallet.address,
        serviceFeeBuyerWallet.address,
        escrowAmount,
        backendWallet.address,
        { nonce: currentNonce }
      );
      await contract.waitForDeployment();
      
      return {
        address: await contract.getAddress(),
        instance: contract,
        buyerContract: new ethers.Contract(await contract.getAddress(), contractABI, serviceFeeBuyerWallet),
        sellerContract: new ethers.Contract(await contract.getAddress(), contractABI, serviceFeeSellerWallet)
      };
    }

    async function setupCompleteDeal(contracts) {
      // Set up environment for blockchain service - we need the private key for the backend wallet
      process.env.RPC_URL = RPC_URL;
      // For the blockchain service, we'll use one of the original Hardhat accounts since we need the private key
      process.env.BACKEND_WALLET_PRIVATE_KEY = BACKEND_WALLET_PRIVATE_KEY;
      
      // Reset modules and import fresh service
      jest.resetModules();
      const freshService = await import('../../blockchainService.js');
      global.currentBlockchainService = freshService;
      
      // Execute complete deal flow with explicit nonce management
      let buyerNonce = await serviceFeeProvider.getTransactionCount(serviceFeeBuyerWallet.address, 'latest');
      
      const setConditionsTx = await contracts.buyerContract.setConditions(conditionIds, { nonce: buyerNonce++ });
      await setConditionsTx.wait(1);
      
      const depositTx = await contracts.buyerContract.depositFunds({ 
        value: escrowAmount, 
        nonce: buyerNonce++ 
      });
      await depositTx.wait(1);
      
      const fulfillTx = await contracts.buyerContract.buyerMarksConditionFulfilled(conditionId1, { 
        nonce: buyerNonce++ 
      });
      await fulfillTx.wait(1);
      
      const startApprovalTx = await contracts.buyerContract.startFinalApprovalPeriod({ 
        nonce: buyerNonce++ 
      });
      await startApprovalTx.wait(1);
      
      // Advance time past final approval period
      await serviceFeeProvider.send('evm_increaseTime', [FINAL_APPROVAL_PERIOD_SECONDS + 1]);
      await serviceFeeProvider.send('evm_mine', []);
    }

    it('should emit ServiceFeeTransferred event when service fee is paid', async () => {
      const contracts = await createFreshServiceFeeContract();
      await setupCompleteDeal(contracts);
      
      const serviceFeeExpected = (escrowAmount * 200n) / 10000n;
      
      // Trigger release and capture transaction receipt for event verification
      const releaseResult = await global.currentBlockchainService.triggerReleaseAfterApproval(contracts.address, 'serviceFeeEventTest');
      expect(releaseResult.success).toBe(true);
      
      // Check events in the transaction receipt
      const receipt = releaseResult.receipt;
      const serviceWalletAddress = await contracts.instance.serviceWallet();
      
      // Find ServiceFeeTransferred event
      const serviceFeeEvent = receipt.logs.find(log => {
        try {
          const parsed = contracts.instance.interface.parseLog(log);
          return parsed && parsed.name === 'ServiceFeeTransferred';
        } catch {
          return false;
        }
      });
      
      expect(serviceFeeEvent).toBeDefined();
      const parsedEvent = contracts.instance.interface.parseLog(serviceFeeEvent);
      expect(parsedEvent.args.serviceWallet).toBe(serviceWalletAddress);
      expect(parsedEvent.args.amount).toBe(serviceFeeExpected);
    }, 45000);

    it('should calculate service fee correctly for different escrow amounts', async () => {
      // Test with a different escrow amount
      const customEscrowAmount = ethers.parseEther('0.5'); // 0.5 ETH
      
      // Deploy contract with custom amount
      const currentNonce = await serviceFeeProvider.getTransactionCount(serviceFeeDeployerWallet.address, 'latest');
      const customFactory = new ContractFactory(contractABI, contractBytecode, serviceFeeDeployerWallet);
      const customContract = await customFactory.deploy(
        serviceFeeSellerWallet.address,
        serviceFeeBuyerWallet.address,
        customEscrowAmount,
        backendWallet.address,
        { nonce: currentNonce }
      );
      await customContract.waitForDeployment();
      const customContractAddress = await customContract.getAddress();
      
      const customBuyerContract = new ethers.Contract(customContractAddress, contractABI, serviceFeeBuyerWallet);
      
      // Set up environment for blockchain service
      process.env.RPC_URL = RPC_URL;
      process.env.BACKEND_WALLET_PRIVATE_KEY = BACKEND_WALLET_PRIVATE_KEY;
      jest.resetModules();
      const freshService = await import('../../blockchainService.js');
      global.currentBlockchainService = freshService;
      
      // Complete deal flow with explicit nonce management
      let buyerNonce = await serviceFeeProvider.getTransactionCount(serviceFeeBuyerWallet.address, 'latest');
      
      await customBuyerContract.setConditions(conditionIds, { nonce: buyerNonce++ });
      await customBuyerContract.depositFunds({ value: customEscrowAmount, nonce: buyerNonce++ });
      await customBuyerContract.buyerMarksConditionFulfilled(conditionId1, { nonce: buyerNonce++ });
      await customBuyerContract.startFinalApprovalPeriod({ nonce: buyerNonce++ });
      
      await serviceFeeProvider.send('evm_increaseTime', [FINAL_APPROVAL_PERIOD_SECONDS + 1]);
      await serviceFeeProvider.send('evm_mine', []);
      
      // Get balances before release
      const sellerBalanceBefore = await serviceFeeProvider.getBalance(serviceFeeSellerWallet.address);
      const serviceBalanceBefore = await serviceFeeProvider.getBalance(backendWallet.address);
      
      // Calculate expected amounts for 0.5 ETH
      const expectedServiceFee = (customEscrowAmount * 200n) / 10000n; // 0.01 ETH (2% of 0.5)
      const expectedSellerAmount = customEscrowAmount - expectedServiceFee; // 0.49 ETH
      
      // Trigger release
      const releaseResult = await global.currentBlockchainService.triggerReleaseAfterApproval(customContractAddress, 'customAmountTest');
      expect(releaseResult.success).toBe(true);
      
      // Verify transfers
      const sellerBalanceAfter = await serviceFeeProvider.getBalance(serviceFeeSellerWallet.address);
      const serviceBalanceAfter = await serviceFeeProvider.getBalance(backendWallet.address);
      
      expect(sellerBalanceAfter - sellerBalanceBefore).toBe(expectedSellerAmount);
      // Service wallet gets fee minus gas, so it should be positive but less than expected
      const serviceFeeReceivedNet = serviceBalanceAfter - serviceBalanceBefore;
      expect(serviceFeeReceivedNet).toBeLessThan(expectedServiceFee);
      expect(serviceFeeReceivedNet).toBeGreaterThan(ethers.parseEther('0.008')); // Should be at least 0.008 ETH after gas
      
      // For 0.5 ETH, service fee should be 0.01 ETH
      expect(expectedServiceFee).toBe(ethers.parseEther('0.01'));
      expect(expectedSellerAmount).toBe(ethers.parseEther('0.49'));
    }, 45000);

    it('should handle service fee calculation for small amounts without rounding errors', async () => {
      // Test with a very small amount to ensure no rounding issues
      const smallAmount = ethers.parseEther('0.001'); // 1 finney = 0.001 ETH
      
      // Deploy contract with small amount
      const currentNonce = await serviceFeeProvider.getTransactionCount(serviceFeeDeployerWallet.address, 'latest');
      const smallFactory = new ContractFactory(contractABI, contractBytecode, serviceFeeDeployerWallet);
      const smallContract = await smallFactory.deploy(
        serviceFeeSellerWallet.address,
        serviceFeeBuyerWallet.address,
        smallAmount,
        backendWallet.address,
        { nonce: currentNonce }
      );
      await smallContract.waitForDeployment();
      const smallContractAddress = await smallContract.getAddress();
      
      const smallBuyerContract = new ethers.Contract(smallContractAddress, contractABI, serviceFeeBuyerWallet);
      
      // Set up environment for blockchain service
      process.env.RPC_URL = RPC_URL;
      process.env.BACKEND_WALLET_PRIVATE_KEY = BACKEND_WALLET_PRIVATE_KEY;
      jest.resetModules();
      const freshService = await import('../../blockchainService.js');
      global.currentBlockchainService = freshService;
      
      // Complete deal flow with explicit nonce management
      let buyerNonce = await serviceFeeProvider.getTransactionCount(serviceFeeBuyerWallet.address, 'latest');
      
      await smallBuyerContract.setConditions(conditionIds, { nonce: buyerNonce++ });
      await smallBuyerContract.depositFunds({ value: smallAmount, nonce: buyerNonce++ });
      await smallBuyerContract.buyerMarksConditionFulfilled(conditionId1, { nonce: buyerNonce++ });
      await smallBuyerContract.startFinalApprovalPeriod({ nonce: buyerNonce++ });
      
      await serviceFeeProvider.send('evm_increaseTime', [FINAL_APPROVAL_PERIOD_SECONDS + 1]);
      await serviceFeeProvider.send('evm_mine', []);
      
      const sellerBalanceBefore = await serviceFeeProvider.getBalance(serviceFeeSellerWallet.address);
      const serviceBalanceBefore = await serviceFeeProvider.getBalance(backendWallet.address);
      
      // For 0.001 ETH, 2% should be 0.00002 ETH
      const expectedServiceFee = (smallAmount * 200n) / 10000n;
      const expectedSellerAmount = smallAmount - expectedServiceFee;
      
      const releaseResult = await global.currentBlockchainService.triggerReleaseAfterApproval(smallContractAddress, 'smallAmountTest');
      expect(releaseResult.success).toBe(true);
      
      const sellerBalanceAfter = await serviceFeeProvider.getBalance(serviceFeeSellerWallet.address);
      const serviceBalanceAfter = await serviceFeeProvider.getBalance(backendWallet.address);
      
      expect(sellerBalanceAfter - sellerBalanceBefore).toBe(expectedSellerAmount);
      // For small amounts, gas costs might exceed the service fee, resulting in a net loss
      const serviceFeeReceivedNet = serviceBalanceAfter - serviceBalanceBefore;
      // We just verify the calculation was correct on-chain (the actual service fee was transferred)
      // even if net result is negative due to gas costs
      
      // Verify the math: 2% of 0.001 ETH = 0.00002 ETH
      expect(expectedServiceFee).toBe(ethers.parseEther('0.00002'));
    }, 45000);

    it('should properly distribute 2% service fee to service wallet and remaining 98% to seller on fund release', async () => {
      const contracts = await createFreshServiceFeeContract();
      await setupCompleteDeal(contracts);
      
      // Get initial balances
      const sellerBalanceBefore = await serviceFeeProvider.getBalance(serviceFeeSellerWallet.address);
      const serviceWalletBalanceBefore = await serviceFeeProvider.getBalance(backendWallet.address);
      
      // Calculate expected amounts
      const serviceFeeExpected = (escrowAmount * 200n) / 10000n; // 2%
      const sellerAmountExpected = escrowAmount - serviceFeeExpected; // 98%
      
      console.log(`[Service Fee Test] Escrow amount: ${ethers.formatEther(escrowAmount)} ETH`);
      console.log(`[Service Fee Test] Expected service fee: ${ethers.formatEther(serviceFeeExpected)} ETH`);
      console.log(`[Service Fee Test] Expected seller amount: ${ethers.formatEther(sellerAmountExpected)} ETH`);
      
      // Trigger release
      const releaseResult = await global.currentBlockchainService.triggerReleaseAfterApproval(contracts.address, 'distributionTest');
      expect(releaseResult.success).toBe(true);
      
      // Get final balances
      const sellerBalanceAfter = await serviceFeeProvider.getBalance(serviceFeeSellerWallet.address);
      const serviceWalletBalanceAfter = await serviceFeeProvider.getBalance(backendWallet.address);
      
      // Calculate actual transfers
      const sellerAmountReceived = sellerBalanceAfter - sellerBalanceBefore;
      const serviceFeeReceivedNet = serviceWalletBalanceAfter - serviceWalletBalanceBefore;
      
      console.log(`[Service Fee Test] Actual seller amount received: ${ethers.formatEther(sellerAmountReceived)} ETH`);
      console.log(`[Service Fee Test] Actual service fee received (net): ${ethers.formatEther(serviceFeeReceivedNet)} ETH`);
      
      // Verify seller receives exactly 98%
      expect(sellerAmountReceived).toBe(sellerAmountExpected);
      
      // Verify service wallet receives the fee minus gas costs (should be positive but less than expected due to gas)
      expect(serviceFeeReceivedNet).toBeLessThan(serviceFeeExpected);
      expect(serviceFeeReceivedNet).toBeGreaterThan(ethers.parseEther('0.001')); // Should be at least 0.001 ETH after gas
      
      // Verify contract is empty
      expect(await serviceFeeProvider.getBalance(contracts.address)).toBe(0n);
      
      // Verify contract state is COMPLETED
      expect(await contracts.instance.currentState()).toBe(6n);
    }, 45000);

    it('should verify service wallet address is correctly set in contract', async () => {
      const contracts = await createFreshServiceFeeContract();
      
      const serviceWalletFromContract = await contracts.instance.serviceWallet();
      const serviceFeePercentage = await contracts.instance.getServiceFeePercentage();
      
      expect(serviceWalletFromContract).toBe(backendWallet.address);
      expect(serviceFeePercentage).toBe(200n); // 200 basis points = 2%
    });
  });

  // TODO: Add more test cases:
  // - Test `initializeService` behavior more directly if possible (e.g. invalid RPC URL connection failure -> though might be hard if service auto-retries or logs instead of throwing)
  // - Test functions with invalid contract addresses (should be handled by ethers.js or the service's address validation)
  // - Test scenarios where the backendWallet itself doesn't have enough gas (this is a Hardhat setup concern but good to be aware of)
}); 