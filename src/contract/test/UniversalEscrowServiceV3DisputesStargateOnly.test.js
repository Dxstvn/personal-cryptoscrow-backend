const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("UniversalEscrowServiceV3DisputesStargateOnly", function () {
  let escrow;
  let owner, buyer, seller, serviceWallet, buyer2, seller2, attacker;
  let weth, usdc, usdt;
  let uniswapRouter;
  let mockStargateRouter, mockStargateRouterETH;
  
  const SERVICE_FEE_BPS = 200; // 2%
  const DISPUTE_WINDOW = 48 * 60 * 60; // 48 hours
  const DISPUTE_RESOLUTION_PERIOD = 7 * 24 * 60 * 60; // 7 days
  
  beforeEach(async function () {
    [owner, buyer, seller, serviceWallet, buyer2, seller2, attacker] = await ethers.getSigners();
    
    // Deploy mock tokens
    const MockWETH = await ethers.getContractFactory("contracts/mocks/MockWETH.sol:MockWETH");
    weth = await MockWETH.deploy();
    await weth.waitForDeployment();
    
    const MockERC20 = await ethers.getContractFactory("contracts/mocks/MockERC20.sol:MockERC20");
    usdc = await MockERC20.deploy("USD Coin", "USDC", 6);
    await usdc.waitForDeployment();
    usdt = await MockERC20.deploy("Tether", "USDT", 6);
    await usdt.waitForDeployment();
    
    // Deploy mock Uniswap router
    const MockRouter = await ethers.getContractFactory("contracts/mocks/MockUniswapV2Router.sol:MockUniswapV2Router");
    uniswapRouter = await MockRouter.deploy(await weth.getAddress());
    await uniswapRouter.waitForDeployment();
    
    // Add liquidity to mock router
    const routerAddress = await uniswapRouter.getAddress();
    await weth.deposit({ value: ethers.parseEther("100") });
    await weth.transfer(routerAddress, ethers.parseEther("100"));
    await usdc.mint(routerAddress, ethers.parseUnits("100000", 6));
    await usdt.mint(routerAddress, ethers.parseUnits("100000", 6));
    
    // Send ETH to router for ETH swaps
    await owner.sendTransaction({
      to: routerAddress,
      value: ethers.parseEther("50")
    });
    
    // Deploy mock Stargate routers
    const MockStargateRouter = await ethers.getContractFactory("contracts/mocks/MockStargateRouter.sol:MockStargateRouter");
    mockStargateRouter = await MockStargateRouter.deploy();
    await mockStargateRouter.waitForDeployment();
    
    mockStargateRouterETH = await MockStargateRouter.deploy();
    await mockStargateRouterETH.waitForDeployment();
    
    // Deploy escrow contract
    const Escrow = await ethers.getContractFactory("UniversalEscrowServiceV3DisputesStargateOnly");
    escrow = await Escrow.deploy(
      await serviceWallet.getAddress(),
      await weth.getAddress(),
      await uniswapRouter.getAddress()
    );
    await escrow.waitForDeployment();
    
    // Configure Stargate routers
    await escrow.setStargateRouter(31337, await mockStargateRouter.getAddress(), await mockStargateRouterETH.getAddress());
    await escrow.setStargateChainId(31337, 1); // Local chain as chain ID 1 for Stargate
    await escrow.setStargateChainId(11155111, 10161); // Sepolia
    await escrow.setStargateChainId(421614, 10231); // Arbitrum Sepolia
    
    // Configure supported tokens
    await escrow.configureToken(31337, ethers.ZeroAddress, 13, true); // ETH
    await escrow.configureToken(31337, await usdc.getAddress(), 1, false); // USDC
    await escrow.configureToken(31337, await usdt.getAddress(), 2, false); // USDT
    
    await escrow.configureToken(11155111, ethers.ZeroAddress, 13, true); // ETH on Sepolia
    await escrow.configureToken(11155111, "0x2F6F07CDcf3588944Bf4C42aC74ff24bF56e7590", 1, false); // USDC on Sepolia
    
    await escrow.configureToken(421614, ethers.ZeroAddress, 13, true); // ETH on Arbitrum
    await escrow.configureToken(421614, "0x3253a335E7bFfB4790Aa4C25C4250d206E9b9773", 1, false); // USDC on Arbitrum
    
    // Setup test tokens for buyers
    await usdc.mint(await buyer.getAddress(), ethers.parseUnits("10000", 6));
    await usdt.mint(await buyer.getAddress(), ethers.parseUnits("10000", 6));
    await usdc.mint(await buyer2.getAddress(), ethers.parseUnits("10000", 6));
  });
  
  describe("Deployment and Configuration", function () {
    it("Should deploy with correct parameters", async function () {
      expect(await escrow.serviceWallet()).to.equal(await serviceWallet.getAddress());
      expect(await escrow.WETH()).to.equal(await weth.getAddress());
      expect(await escrow.uniswapRouter()).to.equal(await uniswapRouter.getAddress());
      expect(await escrow.SERVICE_FEE_BPS()).to.equal(SERVICE_FEE_BPS);
    });
    
    it("Should NOT have LayerZero OFT functions", async function () {
      // These functions should not exist
      expect(escrow.oftAdapters).to.be.undefined;
      expect(escrow.swapComposers).to.be.undefined;
      expect(escrow.setOFTAdapter).to.be.undefined;
      expect(escrow.setSwapComposer).to.be.undefined;
    });
  });
  
  describe("Same Chain Transactions", function () {
    it("Should handle same token transfer (ETH → ETH)", async function () {
      const depositAmount = ethers.parseEther("1");
      const serviceFee = depositAmount * BigInt(SERVICE_FEE_BPS) / 10000n;
      const netAmount = depositAmount - serviceFee;
      
      const sellerInitialBalance = await ethers.provider.getBalance(await seller.getAddress());
      
      // Create escrow
      const tx = await escrow.connect(buyer).createEscrow(
        await seller.getAddress(),
        ethers.ZeroAddress,
        depositAmount,
        ethers.ZeroAddress,
        31337,
        { value: depositAmount }
      );
      
      const receipt = await tx.wait();
      const escrowId = receipt.logs[0].args.escrowId;
      
      // Update condition
      await escrow.connect(serviceWallet).updateConditionWithDispute(escrowId, true);
      
      // Skip dispute window
      await time.increase(DISPUTE_WINDOW + 1);
      
      // Release escrow
      await escrow.connect(buyer).releaseEscrowWithDisputeCheck(escrowId);
      
      // Check seller received funds
      const sellerFinalBalance = await ethers.provider.getBalance(await seller.getAddress());
      expect(sellerFinalBalance - sellerInitialBalance).to.equal(netAmount);
    });
    
    it("Should handle token swap (ETH → USDC)", async function () {
      const depositAmount = ethers.parseEther("1");
      const serviceFee = depositAmount * BigInt(SERVICE_FEE_BPS) / 10000n;
      
      // Create escrow
      const tx = await escrow.connect(buyer).createEscrow(
        await seller.getAddress(),
        ethers.ZeroAddress,
        depositAmount,
        await usdc.getAddress(),
        31337,
        { value: depositAmount }
      );
      
      const receipt = await tx.wait();
      const escrowId = receipt.logs[0].args.escrowId;
      
      // Update condition
      await escrow.connect(serviceWallet).updateConditionWithDispute(escrowId, true);
      
      // Skip dispute window
      await time.increase(DISPUTE_WINDOW + 1);
      
      // Release escrow
      await escrow.connect(buyer).releaseEscrowWithDisputeCheck(escrowId);
      
      // Check seller received USDC
      const sellerUsdcBalance = await usdc.balanceOf(await seller.getAddress());
      expect(sellerUsdcBalance).to.be.gt(0);
    });
  });
  
  describe("Cross-Chain Validation", function () {
    it("Should accept supported cross-chain transfers", async function () {
      const depositAmount = ethers.parseEther("1");
      
      // ETH to Sepolia should work (configured)
      await expect(
        escrow.connect(buyer).createEscrow(
          await seller.getAddress(),
          ethers.ZeroAddress,
          depositAmount,
          ethers.ZeroAddress,
          11155111, // Sepolia
          { value: depositAmount }
        )
      ).to.not.be.reverted;
    });
    
    it("Should reject unsupported chains", async function () {
      const depositAmount = ethers.parseEther("1");
      
      // Mainnet not configured
      await expect(
        escrow.connect(buyer).createEscrow(
          await seller.getAddress(),
          ethers.ZeroAddress,
          depositAmount,
          ethers.ZeroAddress,
          1, // Mainnet - not configured
          { value: depositAmount }
        )
      ).to.be.revertedWithCustomError(escrow, "CrossChainNotSupported");
    });
    
    it("Should reject unsupported tokens on target chain", async function () {
      const depositAmount = ethers.parseEther("1");
      
      // DAI not configured on Sepolia
      await expect(
        escrow.connect(buyer).createEscrow(
          await seller.getAddress(),
          ethers.ZeroAddress,
          depositAmount,
          "0x6B175474E89094C44Da98b954EedeAC495271d0F", // Random DAI address
          11155111, // Sepolia
          { value: depositAmount }
        )
      ).to.be.revertedWithCustomError(escrow, "TokenNotSupported");
    });
  });
  
  describe("Dispute Resolution", function () {
    let escrowId;
    const depositAmount = ethers.parseEther("1");
    
    beforeEach(async function () {
      // Create escrow
      const tx = await escrow.connect(buyer).createEscrow(
        await seller.getAddress(),
        ethers.ZeroAddress,
        depositAmount,
        ethers.ZeroAddress,
        31337,
        { value: depositAmount }
      );
      
      const receipt = await tx.wait();
      escrowId = receipt.logs[0].args.escrowId;
      
      // Update condition to start dispute window
      await escrow.connect(serviceWallet).updateConditionWithDispute(escrowId, true);
    });
    
    it("Should allow dispute within window", async function () {
      // Buyer raises dispute
      await expect(
        escrow.connect(buyer).raiseDispute(escrowId, "Item not as described")
      ).to.emit(escrow, "DisputeRaised");
      
      // Check dispute info
      const disputeInfo = await escrow.getDisputeInfo(escrowId);
      expect(disputeInfo[0]).to.be.true; // disputeRaised
      expect(disputeInfo[1]).to.equal(await buyer.getAddress()); // disputeRaisedBy
    });
    
    it("Should reject dispute after window", async function () {
      // Skip past dispute window
      await time.increase(DISPUTE_WINDOW + 1);
      
      await expect(
        escrow.connect(buyer).raiseDispute(escrowId, "Too late")
      ).to.be.revertedWithCustomError(escrow, "DisputeWindowPassed");
    });
    
    it("Should allow service wallet to resolve dispute", async function () {
      // Raise dispute
      await escrow.connect(buyer).raiseDispute(escrowId, "Test dispute");
      
      // Service wallet resolves in favor of seller
      await expect(
        escrow.connect(serviceWallet).resolveDispute(escrowId, true)
      ).to.emit(escrow, "DisputeResolved").withArgs(escrowId, true);
      
      // Check funds went to seller
      const escrowData = await escrow.getEscrow(escrowId);
      expect(escrowData.released).to.be.true;
    });
    
    it("Should return funds to buyer if dispute not resolved in time", async function () {
      // Raise dispute
      await escrow.connect(buyer).raiseDispute(escrowId, "Test dispute");
      
      const buyerInitialBalance = await ethers.provider.getBalance(await buyer.getAddress());
      
      // Skip past resolution period
      await time.increase(DISPUTE_RESOLUTION_PERIOD + 1);
      
      // Anyone can trigger return
      await escrow.connect(seller).returnFundsAfterDisputeTimeout(escrowId);
      
      // Check buyer got funds back (net amount after service fee)
      const buyerFinalBalance = await ethers.provider.getBalance(await buyer.getAddress());
      const serviceFee = depositAmount * BigInt(SERVICE_FEE_BPS) / 10000n;
      const netAmount = depositAmount - serviceFee;
      expect(buyerFinalBalance - buyerInitialBalance).to.be.closeTo(netAmount, ethers.parseEther("0.01"));
    });
    
    it("Should prevent release during dispute window", async function () {
      // Try to release immediately
      await expect(
        escrow.connect(buyer).releaseEscrowWithDisputeCheck(escrowId)
      ).to.be.revertedWithCustomError(escrow, "DisputeWindowActive");
    });
  });
  
  describe("Cross-Chain Quote", function () {
    it("Should provide quotes for supported chains", async function () {
      const amount = ethers.parseEther("1");
      
      // Get quote for ETH to Sepolia
      const [fee, supported] = await escrow.getCrossChainQuote(11155111, ethers.ZeroAddress, amount);
      
      expect(supported).to.be.true;
      expect(fee).to.be.gt(0); // Should have some fee
    });
    
    it("Should reject quotes for unsupported chains", async function () {
      const amount = ethers.parseEther("1");
      
      // Get quote for unsupported chain
      const [fee, supported] = await escrow.getCrossChainQuote(1, ethers.ZeroAddress, amount);
      
      expect(supported).to.be.false;
      expect(fee).to.equal(0);
    });
  });
  
  describe("Access Control", function () {
    it("Should only allow service wallet to update conditions with dispute", async function () {
      const depositAmount = ethers.parseEther("1");
      
      const tx = await escrow.connect(buyer).createEscrow(
        await seller.getAddress(),
        ethers.ZeroAddress,
        depositAmount,
        ethers.ZeroAddress,
        31337,
        { value: depositAmount }
      );
      
      const receipt = await tx.wait();
      const escrowId = receipt.logs[0].args.escrowId;
      
      // Attacker tries to update condition
      await expect(
        escrow.connect(attacker).updateConditionWithDispute(escrowId, true)
      ).to.be.revertedWithCustomError(escrow, "DisputeNotServiceWallet");
      
      // Service wallet succeeds
      await expect(
        escrow.connect(serviceWallet).updateConditionWithDispute(escrowId, true)
      ).to.not.be.reverted;
    });
  });
});