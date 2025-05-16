import { jest, describe, it, expect, beforeEach, afterEach, beforeAll } from '@jest/globals';
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
  let backendWallet; // The wallet used by blockchainService.js
  let deployerWallet; // Wallet to deploy contracts and orchestrate tests
  let sellerWallet; 
  let buyerWallet;
  let escrowContractAddress;
  let escrowContractInstance; // Connected to deployerWallet for test setup
  let buyerEscrowContract; // Connected to buyerWallet
  let sellerEscrowContract; // Connected to sellerWallet

  const dealId = 'integrationTestDeal123';
  const escrowAmount = ethers.parseEther('0.1'); // 0.1 ETH

  beforeAll(async () => {
    provider = new ethers.JsonRpcProvider(RPC_URL);
    
    // Setup wallets for the test
    deployerWallet = new Wallet(DEPLOYER_PRIVATE_KEY, provider);
    sellerWallet = new Wallet(SELLER_PRIVATE_KEY, provider);
    buyerWallet = new Wallet(BUYER_PRIVATE_KEY, provider);

    // Set env vars for the blockchainService
    process.env.RPC_URL = RPC_URL;
    process.env.BACKEND_WALLET_PRIVATE_KEY = BACKEND_WALLET_PRIVATE_KEY;
    
    // Initialize the service (it will pick up the env vars)
    // We need to re-import or ensure the service initializes with these env vars.
    // For simplicity in this structure, we assume blockchainService initializes internally 
    // or we can explicitly call an init function if it had one.
    // The current blockchainService initializes its provider/wallet on first function call.
    backendWallet = new Wallet(BACKEND_WALLET_PRIVATE_KEY, provider); // For balance checks etc.

    // Check if Hardhat node is running and accounts have balance
    try {
      await provider.getBlockNumber();
      const deployerBalance = await provider.getBalance(deployerWallet.address);
      if (deployerBalance < ethers.parseEther('1')) {
        console.warn(`Warning: Deployer account ${deployerWallet.address} has low balance on Hardhat node.`);
      }
      const backendServiceWalletBalance = await provider.getBalance(backendWallet.address);
      if (backendServiceWalletBalance < ethers.parseEther('0.5')) { // Backend wallet also needs some ETH
         console.warn(`Warning: Backend service wallet ${backendWallet.address} has low balance for gas fees.`);
      }
    } catch (e) {
      throw new Error(`Failed to connect to Hardhat node at ${RPC_URL}. Please ensure it is running. Error: ${e.message}`);
    }
  });

  beforeEach(async () => {
    // Deploy a new PropertyEscrow contract for each test
    const EscrowFactory = new ContractFactory(contractABI, contractBytecode, deployerWallet);
    const deployedContract = await EscrowFactory.deploy(sellerWallet.address, buyerWallet.address, escrowAmount);
    await deployedContract.waitForDeployment();
    escrowContractAddress = await deployedContract.getAddress();
    
    escrowContractInstance = new ethers.Contract(escrowContractAddress, contractABI, deployerWallet);
    buyerEscrowContract = new ethers.Contract(escrowContractAddress, contractABI, buyerWallet);
    sellerEscrowContract = new ethers.Contract(escrowContractAddress, contractABI, sellerWallet);

    // Reset modules to ensure blockchainService re-initializes with potentially changed env vars (if any in future)
    // And to clear its internal provider/wallet state if it caches them strictly.
    jest.resetModules(); 
    // Re-import to get a fresh instance of the service that will use current env vars
    const freshService = await import('../../blockchainService.js'); 
    global.currentBlockchainService = freshService; // Make it accessible to tests
  });

  afterEach(async () => {
    // Cleanup if necessary, though Hardhat node reset is usually done between test suite runs
    delete process.env.RPC_URL;
    delete process.env.BACKEND_WALLET_PRIVATE_KEY;
    jest.restoreAllMocks(); // Restore any console spies etc.
  });

  describe('triggerReleaseAfterApproval', () => {
    it('should successfully release funds if contract is in the correct state', async () => {
      // 1. Buyer deposits funds
      const depositTx = await buyerEscrowContract.depositFundsAsBuyer({ value: escrowAmount });
      await depositTx.wait(1);
      expect(await provider.getBalance(escrowContractAddress)).toBe(escrowAmount);

      // 2. Buyer approves release
      const buyerApproveTx = await buyerEscrowContract.approveReleaseByBuyer();
      await buyerApproveTx.wait(1);

      // 3. Seller approves release
      const sellerApproveTx = await sellerEscrowContract.approveReleaseBySeller();
      await sellerApproveTx.wait(1);
      
      // 4. Get seller balance before release
      const sellerBalanceBefore = await provider.getBalance(sellerWallet.address);

      // 5. Service triggers release (using the global.currentBlockchainService)
      // The actual blockchainService.contractABI will be used by the service itself.
      const releaseResult = await global.currentBlockchainService.triggerReleaseAfterApproval(escrowContractAddress, dealId);
      
      expect(releaseResult.success).toBe(true);
      expect(releaseResult.receipt).toBeDefined();
      expect(releaseResult.receipt.status).toBe(1); // Transaction successful

      // 6. Verify funds transferred to seller and contract balance is zero
      const sellerBalanceAfter = await provider.getBalance(sellerWallet.address);
      // Check that seller balance increased by approximately escrowAmount (minus gas for their approval tx)
      // This is a bit tricky due to gas costs, so we check if it increased significantly.
      expect(sellerBalanceAfter > sellerBalanceBefore).toBe(true);
      expect(await provider.getBalance(escrowContractAddress)).toBe(0n); // BigInt for zero

      // 7. Verify contract status (assuming 'status' enum: 0=AwaitingDeposit, 1=AwaitingFulfillment, 2=InFinalApproval, 3=FundsReleased, 4=Cancelled, 5=InDispute)
      const contractState = await escrowContractInstance.currentStatus();
      expect(contractState).toBe(3n); // FundsReleased
    }, 30000); // Increased timeout for blockchain interactions

    it('should fail if contract is not ready for release (e.g., buyer not approved)', async () => {
      // 1. Buyer deposits funds
      const depositTx = await buyerEscrowContract.depositFundsAsBuyer({ value: escrowAmount });
      await depositTx.wait(1);

      // 2. Seller approves (but buyer hasn't)
      const sellerApproveTx = await sellerEscrowContract.approveReleaseBySeller();
      await sellerApproveTx.wait(1);

      const releaseResult = await global.currentBlockchainService.triggerReleaseAfterApproval(escrowContractAddress, dealId);
      
      expect(releaseResult.success).toBe(false);
      expect(releaseResult.error).toBeDefined();
      // Check for a specific revert reason if your contract provides one
      // e.g., expect(releaseResult.error.message).toContain('Buyer has not approved');
      // For a generic check:
      expect(releaseResult.error.message).toMatch(/revert|transaction failed/i); 
    }, 20000);
  });

  describe('triggerCancelAfterDisputeDeadline', () => {
    it('should successfully cancel escrow and refund buyer if conditions met', async () => {
      // 1. Buyer deposits funds
      const depositTx = await buyerEscrowContract.depositFundsAsBuyer({ value: escrowAmount });
      await depositTx.wait(1);

      // 2. Buyer raises a dispute
      const disputeReason = "Item not as described";
      const raiseDisputeTx = await buyerEscrowContract.raiseDispute(disputeReason, Math.floor(Date.now() / 1000) + 3600); // Deadline 1 hour in future
      await raiseDisputeTx.wait(1);
      
      // 3. Advance time past the dispute deadline (Hardhat specific)
      await provider.send('evm_increaseTime', [3601]); // Increase time by 1 hour + 1 sec
      await provider.send('evm_mine', []); // Mine a new block

      const buyerBalanceBefore = await provider.getBalance(buyerWallet.address);
      
      // 4. Service triggers cancellation
      const cancelResult = await global.currentBlockchainService.triggerCancelAfterDisputeDeadline(escrowContractAddress, dealId);
      expect(cancelResult.success).toBe(true);
      expect(cancelResult.receipt).toBeDefined();
      expect(cancelResult.receipt.status).toBe(1);

      // 5. Verify funds refunded to buyer (approximately, due to gas)
      const buyerBalanceAfter = await provider.getBalance(buyerWallet.address);
      expect(buyerBalanceAfter > buyerBalanceBefore).toBe(true); // Buyer got funds back (minus gas for dispute tx)
      expect(await provider.getBalance(escrowContractAddress)).toBe(0n);

      // 6. Verify contract status 
      const contractState = await escrowContractInstance.currentStatus();
      expect(contractState).toBe(4n); // Cancelled
    }, 30000);

    it('should fail if dispute deadline has not passed', async () => {
      // 1. Buyer deposits funds
      const depositTx = await buyerEscrowContract.depositFundsAsBuyer({ value: escrowAmount });
      await depositTx.wait(1);

      // 2. Buyer raises a dispute with a future deadline
      const disputeReason = "Item not as described";
      const raiseDisputeTx = await buyerEscrowContract.raiseDispute(disputeReason, Math.floor(Date.now() / 1000) + 7200); // Deadline 2 hours in future
      await raiseDisputeTx.wait(1);
      
      // DO NOT advance time enough

      const cancelResult = await global.currentBlockchainService.triggerCancelAfterDisputeDeadline(escrowContractAddress, dealId);
      expect(cancelResult.success).toBe(false);
      expect(cancelResult.error).toBeDefined();
      expect(cancelResult.error.message).toMatch(/Dispute resolution period not over/i);
    }, 20000);
  });

  // TODO: Add more test cases:
  // - Test `initializeService` behavior more directly if possible (e.g. invalid RPC URL connection failure -> though might be hard if service auto-retries or logs instead of throwing)
  // - Test functions with invalid contract addresses (should be handled by ethers.js or the service's address validation)
  // - Test scenarios where the backendWallet itself doesn't have enough gas (this is a Hardhat setup concern but good to be aware of)
}); 