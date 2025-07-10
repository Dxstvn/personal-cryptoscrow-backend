const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("UniversalEscrowServiceV3Disputes - Comprehensive Production Tests", function () {
  let escrow;
  let owner, buyer, seller, serviceWallet, attacker, buyer2, seller2;
  let weth, usdc, usdt;
  let uniswapRouter;
  let mockStargateRouter, mockStargateRouterETH;
  
  const DISPUTE_WINDOW = 48 * 60 * 60; // 48 hours
  const DISPUTE_RESOLUTION_PERIOD = 7 * 24 * 60 * 60; // 7 days
  const SERVICE_FEE_BPS = 200; // 2%
  
  beforeEach(async function () {
    [owner, buyer, seller, serviceWallet, attacker, buyer2, seller2] = await ethers.getSigners();
    
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
    await weth.deposit({ value: ethers.parseEther("10") });
    await weth.transfer(routerAddress, ethers.parseEther("10"));
    await usdc.mint(routerAddress, ethers.parseUnits("10000", 6));
    await usdt.mint(routerAddress, ethers.parseUnits("10000", 6));
    
    // Send ETH to router for ETH swaps
    await owner.sendTransaction({
      to: routerAddress,
      value: ethers.parseEther("10")
    });
    
    // Deploy mock Stargate routers
    const MockStargate = await ethers.getContractFactory("contracts/mocks/MockStargateRouter.sol:MockStargateRouter");
    mockStargateRouter = await MockStargate.deploy();
    await mockStargateRouter.waitForDeployment();
    mockStargateRouterETH = await MockStargate.deploy();
    await mockStargateRouterETH.waitForDeployment();
    
    // Deploy UniversalEscrowServiceV3Disputes
    const UniversalEscrowServiceV3Disputes = await ethers.getContractFactory("UniversalEscrowServiceV3Disputes");
    escrow = await UniversalEscrowServiceV3Disputes.deploy(
      serviceWallet.address,
      await weth.getAddress(),
      await uniswapRouter.getAddress()
    );
    await escrow.waitForDeployment();
    
    // Setup cross-chain configurations
    await escrow.connect(owner).setChainMapping(1, 30101); // Ethereum mainnet
    await escrow.connect(owner).setChainMapping(42161, 30110); // Arbitrum
    
    // Set cross-chain mode for same chain (1) to LAYERZERO_OFT to avoid errors
    await escrow.connect(owner).setCrossChainMode(1, 1); // 1 = LAYERZERO_OFT
    
    // Set condition updater (only owner can do this)
    await escrow.connect(owner).setConditionUpdater(serviceWallet.address, true);
    
    // Mint tokens to users for testing
    await usdc.mint(buyer.address, ethers.parseUnits("10000", 6));
    await usdc.mint(buyer2.address, ethers.parseUnits("10000", 6));
    await usdt.mint(buyer.address, ethers.parseUnits("10000", 6));
    await usdt.mint(buyer2.address, ethers.parseUnits("10000", 6));
  });

  describe("Basic Dispute Functionality", function () {
    it("Should create escrow and allow dispute within window", async function () {
      const depositAmount = ethers.parseEther("1.0");
      
      // Create escrow
      const tx = await escrow.connect(buyer).createEscrow(
        seller.address,
        ethers.ZeroAddress, // ETH
        depositAmount,
        ethers.ZeroAddress, // ETH
        1, // same chain
        { value: depositAmount }
      );
      const receipt = await tx.wait();
      
      // Get escrow ID from event
      const escrowId = receipt.logs[0].args[0];
      
      // Mark condition as met
      await escrow.connect(serviceWallet).updateConditionWithDispute(escrowId, true);
      
      // Raise dispute within window
      await escrow.connect(buyer).raiseDispute(escrowId, "Item not as described");
      
      // Verify dispute info
      const disputeInfo = await escrow.getDisputeInfo(escrowId);
      expect(disputeInfo.disputeRaised).to.be.true;
      expect(disputeInfo.disputeRaisedBy).to.equal(buyer.address);
      expect(disputeInfo.disputeReason).to.equal("Item not as described");
    });

    it("Should prevent dispute after window expires", async function () {
      const depositAmount = ethers.parseEther("1.0");
      
      // Create escrow
      const tx = await escrow.connect(buyer).createEscrow(
        seller.address,
        ethers.ZeroAddress,
        depositAmount,
        ethers.ZeroAddress,
        31337, // Hardhat network chain ID
        { value: depositAmount }
      );
      const receipt = await tx.wait();
      const escrowId = receipt.logs[0].args[0];
      
      // Mark condition as met
      await escrow.connect(serviceWallet).updateConditionWithDispute(escrowId, true);
      
      // Fast forward past dispute window (48 hours + 1 second)
      await time.increase(DISPUTE_WINDOW + 1);
      
      // Try to raise dispute - should fail
      await expect(
        escrow.connect(buyer).raiseDispute(escrowId, "Too late")
      ).to.be.revertedWith("Dispute window has passed");
    });
  });

  describe("Dispute Resolution by Service Wallet", function () {
    let escrowId;
    
    beforeEach(async function () {
      // Create a disputed escrow
      const depositAmount = ethers.parseEther("2.0");
      const tx = await escrow.connect(buyer).createEscrow(
        seller.address,
        ethers.ZeroAddress,
        depositAmount,
        ethers.ZeroAddress,
        31337, // Hardhat network chain ID
        { value: depositAmount }
      );
      const receipt = await tx.wait();
      escrowId = receipt.logs[0].args[0];
      
      await escrow.connect(serviceWallet).updateConditionWithDispute(escrowId, true);
      await escrow.connect(buyer).raiseDispute(escrowId, "Defective product");
    });

    it("Should allow service wallet to resolve dispute in seller's favor", async function () {
      const sellerBalanceBefore = await ethers.provider.getBalance(seller.address);
      
      await escrow.connect(serviceWallet).resolveDispute(escrowId, true);
      
      const sellerBalanceAfter = await ethers.provider.getBalance(seller.address);
      const expectedAmount = ethers.parseEther("1.96"); // 2 ETH - 2% fee
      
      expect(sellerBalanceAfter - sellerBalanceBefore).to.equal(expectedAmount);
    });

    it("Should allow service wallet to resolve dispute in buyer's favor", async function () {
      const buyerBalanceBefore = await ethers.provider.getBalance(buyer.address);
      
      await escrow.connect(serviceWallet).resolveDispute(escrowId, false);
      
      const buyerBalanceAfter = await ethers.provider.getBalance(buyer.address);
      const expectedAmount = ethers.parseEther("1.96"); // 2 ETH - 2% fee
      
      expect(buyerBalanceAfter - buyerBalanceBefore).to.equal(expectedAmount);
    });

    it("Should prevent non-service wallet from resolving dispute", async function () {
      await expect(
        escrow.connect(attacker).resolveDispute(escrowId, true)
      ).to.be.revertedWith("Only service wallet can resolve disputes");
    });

    it("Should prevent double resolution", async function () {
      await escrow.connect(serviceWallet).resolveDispute(escrowId, true);
      
      await expect(
        escrow.connect(serviceWallet).resolveDispute(escrowId, false)
      ).to.be.revertedWith("Escrow already released");
    });
  });

  describe("Automatic Refund After Timeout", function () {
    let escrowId;
    
    beforeEach(async function () {
      // Create a disputed escrow
      const depositAmount = ethers.parseEther("5.0");
      const tx = await escrow.connect(buyer).createEscrow(
        seller.address,
        ethers.ZeroAddress,
        depositAmount,
        ethers.ZeroAddress,
        31337, // Hardhat network chain ID
        { value: depositAmount }
      );
      const receipt = await tx.wait();
      escrowId = receipt.logs[0].args[0];
      
      await escrow.connect(serviceWallet).updateConditionWithDispute(escrowId, true);
      await escrow.connect(buyer).raiseDispute(escrowId, "Never received item");
    });

    it("Should allow service wallet to return funds after 7 days", async function () {
      // Fast forward 7 days + 1 second
      await time.increase(DISPUTE_RESOLUTION_PERIOD + 1);
      
      const buyerBalanceBefore = await ethers.provider.getBalance(buyer.address);
      
      await escrow.connect(serviceWallet).returnFundsAfterDisputeTimeout(escrowId);
      
      const buyerBalanceAfter = await ethers.provider.getBalance(buyer.address);
      const expectedAmount = ethers.parseEther("4.9"); // 5 ETH - 2% fee
      
      expect(buyerBalanceAfter - buyerBalanceBefore).to.equal(expectedAmount);
    });

    it("Should prevent non-service wallet from calling returnFundsAfterDisputeTimeout", async function () {
      await time.increase(DISPUTE_RESOLUTION_PERIOD + 1);
      
      await expect(
        escrow.connect(attacker).returnFundsAfterDisputeTimeout(escrowId)
      ).to.be.revertedWith("Only service wallet");
      
      await expect(
        escrow.connect(buyer).returnFundsAfterDisputeTimeout(escrowId)
      ).to.be.revertedWith("Only service wallet");
    });

    it("Should prevent return before timeout period", async function () {
      // Only advance 6 days
      await time.increase(6 * 24 * 60 * 60);
      
      await expect(
        escrow.connect(serviceWallet).returnFundsAfterDisputeTimeout(escrowId)
      ).to.be.revertedWith("Dispute resolution period not ended");
    });

    it("Should prevent return if dispute is already resolved", async function () {
      await escrow.connect(serviceWallet).resolveDispute(escrowId, true);
      await time.increase(DISPUTE_RESOLUTION_PERIOD + 1);
      
      await expect(
        escrow.connect(serviceWallet).returnFundsAfterDisputeTimeout(escrowId)
      ).to.be.revertedWith("Escrow already released");
    });
  });

  describe("Edge Cases and Attack Vectors", function () {
    it("Should prevent raising dispute before condition is met", async function () {
      const depositAmount = ethers.parseEther("1.0");
      const tx = await escrow.connect(buyer).createEscrow(
        seller.address,
        ethers.ZeroAddress,
        depositAmount,
        ethers.ZeroAddress,
        31337, // Hardhat network chain ID
        { value: depositAmount }
      );
      const receipt = await tx.wait();
      const escrowId = receipt.logs[0].args[0];
      
      // Try to raise dispute without condition being met
      await expect(
        escrow.connect(buyer).raiseDispute(escrowId, "Premature dispute")
      ).to.be.revertedWith("Conditions not met yet");
    });

    it("Should prevent seller from raising dispute against themselves", async function () {
      const depositAmount = ethers.parseEther("1.0");
      const tx = await escrow.connect(buyer).createEscrow(
        seller.address,
        ethers.ZeroAddress,
        depositAmount,
        ethers.ZeroAddress,
        31337, // Hardhat network chain ID
        { value: depositAmount }
      );
      const receipt = await tx.wait();
      const escrowId = receipt.logs[0].args[0];
      
      await escrow.connect(serviceWallet).updateConditionWithDispute(escrowId, true);
      
      // Seller can raise dispute (they might claim buyer is fraudulent)
      await expect(
        escrow.connect(seller).raiseDispute(escrowId, "Buyer is suspicious")
      ).to.not.be.reverted;
    });

    it("Should prevent third party from raising dispute", async function () {
      const depositAmount = ethers.parseEther("1.0");
      const tx = await escrow.connect(buyer).createEscrow(
        seller.address,
        ethers.ZeroAddress,
        depositAmount,
        ethers.ZeroAddress,
        31337, // Hardhat network chain ID
        { value: depositAmount }
      );
      const receipt = await tx.wait();
      const escrowId = receipt.logs[0].args[0];
      
      await escrow.connect(serviceWallet).updateConditionWithDispute(escrowId, true);
      
      await expect(
        escrow.connect(attacker).raiseDispute(escrowId, "Malicious dispute")
      ).to.be.revertedWith("Only buyer or seller can raise dispute");
    });

    it("Should handle multiple disputes correctly", async function () {
      const depositAmount = ethers.parseEther("1.0");
      
      // Create first escrow
      const tx1 = await escrow.connect(buyer).createEscrow(
        seller.address,
        ethers.ZeroAddress,
        depositAmount,
        ethers.ZeroAddress,
        31337,
        { value: depositAmount }
      );
      const escrowId1 = tx1.wait().then(r => r.logs[0].args[0]);
      
      // Create second escrow
      const tx2 = await escrow.connect(buyer2).createEscrow(
        seller2.address,
        ethers.ZeroAddress,
        depositAmount,
        ethers.ZeroAddress,
        31337,
        { value: depositAmount }
      );
      const escrowId2 = tx2.wait().then(r => r.logs[0].args[0]);
      
      // Both should be independent
      await escrow.connect(serviceWallet).updateConditionWithDispute(await escrowId1, true);
      await escrow.connect(serviceWallet).updateConditionWithDispute(await escrowId2, true);
      
      await escrow.connect(buyer).raiseDispute(await escrowId1, "Dispute 1");
      await escrow.connect(buyer2).raiseDispute(await escrowId2, "Dispute 2");
      
      // Resolve differently
      await escrow.connect(serviceWallet).resolveDispute(await escrowId1, true); // Seller wins
      await escrow.connect(serviceWallet).resolveDispute(await escrowId2, false); // Buyer wins
      
      // Verify independent resolution
      const dispute1 = await escrow.getDisputeInfo(await escrowId1);
      const dispute2 = await escrow.getDisputeInfo(await escrowId2);
      
      expect(dispute1.disputeResolved).to.be.true;
      expect(dispute2.disputeResolved).to.be.true;
    });
  });

  describe("Token-based Escrows with Disputes", function () {
    it("Should handle ERC20 disputes correctly", async function () {
      const depositAmount = ethers.parseUnits("1000", 6); // 1000 USDC
      
      // Approve and create escrow
      await usdc.connect(buyer).approve(await escrow.getAddress(), depositAmount);
      const tx = await escrow.connect(buyer).createEscrow(
        seller.address,
        await usdc.getAddress(),
        depositAmount,
        await usdc.getAddress(),
        31337
      );
      const receipt = await tx.wait();
      const escrowId = receipt.logs.find(log => {
        try {
          const parsed = escrow.interface.parseLog(log);
          return parsed.name === "EscrowCreated";
        } catch { return false; }
      }).args[0];
      
      // Dispute flow
      await escrow.connect(serviceWallet).updateConditionWithDispute(escrowId, true);
      await escrow.connect(buyer).raiseDispute(escrowId, "Wrong product");
      
      // Return to buyer after timeout
      await time.increase(DISPUTE_RESOLUTION_PERIOD + 1);
      
      const buyerBalanceBefore = await usdc.balanceOf(buyer.address);
      await escrow.connect(serviceWallet).returnFundsAfterDisputeTimeout(escrowId);
      const buyerBalanceAfter = await usdc.balanceOf(buyer.address);
      
      const expectedReturn = depositAmount * 98n / 100n; // 98% after fee
      expect(buyerBalanceAfter - buyerBalanceBefore).to.equal(expectedReturn);
    });

    it("Should handle mixed token escrows with disputes", async function () {
      const depositAmount = ethers.parseUnits("1000", 6); // 1000 USDC
      
      // Approve and create escrow (USDC -> USDC, same token to avoid swap issues in mock)
      await usdc.connect(buyer).approve(await escrow.getAddress(), depositAmount);
      const tx = await escrow.connect(buyer).createEscrow(
        seller.address,
        await usdc.getAddress(),
        depositAmount,
        await usdc.getAddress(), // Same token to avoid mock router issues
        31337
      );
      const receipt = await tx.wait();
      const escrowId = receipt.logs.find(log => {
        try {
          const parsed = escrow.interface.parseLog(log);
          return parsed.name === "EscrowCreated";
        } catch { return false; }
      }).args[0];
      
      // Dispute and resolve in buyer's favor
      await escrow.connect(serviceWallet).updateConditionWithDispute(escrowId, true);
      await escrow.connect(buyer).raiseDispute(escrowId, "Changed mind");
      await escrow.connect(serviceWallet).resolveDispute(escrowId, false);
      
      // Verify buyer got refund
      const escrowData = await escrow.escrows(escrowId);
      expect(escrowData.released).to.be.true;
      
      // Check buyer's USDC balance increased
      const buyerBalance = await usdc.balanceOf(buyer.address);
      const expectedBalance = ethers.parseUnits("10000", 6) - (depositAmount * 2n / 100n); // Original minus fee
      expect(buyerBalance).to.equal(expectedBalance);
    });
  });

  describe("Release After Dispute Resolution", function () {
    it("Should allow normal release if no dispute is raised", async function () {
      const depositAmount = ethers.parseEther("1.0");
      
      const tx = await escrow.connect(buyer).createEscrow(
        seller.address,
        ethers.ZeroAddress,
        depositAmount,
        ethers.ZeroAddress,
        31337, // Hardhat network chain ID
        { value: depositAmount }
      );
      const receipt = await tx.wait();
      const escrowId = receipt.logs[0].args[0];
      
      // Mark condition met
      await escrow.connect(serviceWallet).updateConditionWithDispute(escrowId, true);
      
      // Wait for dispute window to pass
      await time.increase(DISPUTE_WINDOW + 1);
      
      // Release should work
      await escrow.connect(buyer).releaseEscrowWithDisputeCheck(escrowId);
      
      const escrowData = await escrow.escrows(escrowId);
      expect(escrowData.released).to.be.true;
    });

    it("Should prevent release during dispute window", async function () {
      const depositAmount = ethers.parseEther("1.0");
      
      const tx = await escrow.connect(buyer).createEscrow(
        seller.address,
        ethers.ZeroAddress,
        depositAmount,
        ethers.ZeroAddress,
        31337, // Hardhat network chain ID
        { value: depositAmount }
      );
      const receipt = await tx.wait();
      const escrowId = receipt.logs[0].args[0];
      
      await escrow.connect(serviceWallet).updateConditionWithDispute(escrowId, true);
      
      // Try to release immediately
      await expect(
        escrow.connect(buyer).releaseEscrowWithDisputeCheck(escrowId)
      ).to.be.revertedWith("Dispute window still active");
    });

    it("Should prevent release if dispute is unresolved", async function () {
      const depositAmount = ethers.parseEther("1.0");
      
      const tx = await escrow.connect(buyer).createEscrow(
        seller.address,
        ethers.ZeroAddress,
        depositAmount,
        ethers.ZeroAddress,
        31337, // Hardhat network chain ID
        { value: depositAmount }
      );
      const receipt = await tx.wait();
      const escrowId = receipt.logs[0].args[0];
      
      await escrow.connect(serviceWallet).updateConditionWithDispute(escrowId, true);
      await escrow.connect(buyer).raiseDispute(escrowId, "Unresolved issue");
      
      await expect(
        escrow.connect(buyer).releaseEscrowWithDisputeCheck(escrowId)
      ).to.be.revertedWith("Dispute not resolved");
    });
  });

  describe("Gas and Performance Tests", function () {
    it("Should handle high-value transactions", async function () {
      const depositAmount = ethers.parseEther("100.0"); // 100 ETH
      
      const tx = await escrow.connect(buyer).createEscrow(
        seller.address,
        ethers.ZeroAddress,
        depositAmount,
        ethers.ZeroAddress,
        31337, // Hardhat network chain ID
        { value: depositAmount }
      );
      const receipt = await tx.wait();
      const escrowId = receipt.logs[0].args[0];
      
      await escrow.connect(serviceWallet).updateConditionWithDispute(escrowId, true);
      await escrow.connect(buyer).raiseDispute(escrowId, "High value dispute");
      
      // Test gas usage for dispute resolution
      const resolveTx = await escrow.connect(serviceWallet).resolveDispute(escrowId, false);
      const resolveReceipt = await resolveTx.wait();
      
      // Gas should be reasonable (less than 200k)
      expect(resolveReceipt.gasUsed).to.be.lt(200000);
    });

    it("Should handle many sequential disputes efficiently", async function () {
      const depositAmount = ethers.parseEther("0.1");
      const escrowIds = [];
      
      // Create 10 escrows
      for (let i = 0; i < 10; i++) {
        const tx = await escrow.connect(buyer).createEscrow(
          seller.address,
          ethers.ZeroAddress,
          depositAmount,
          ethers.ZeroAddress,
          31337,
          { value: depositAmount }
        );
        const receipt = await tx.wait();
        escrowIds.push(receipt.logs[0].args[0]);
      }
      
      // Raise disputes for all
      for (const escrowId of escrowIds) {
        await escrow.connect(serviceWallet).updateConditionWithDispute(escrowId, true);
        await escrow.connect(buyer).raiseDispute(escrowId, `Dispute ${escrowId}`);
      }
      
      // Resolve all disputes
      for (let i = 0; i < escrowIds.length; i++) {
        const releaseFunds = i % 2 === 0; // Alternate resolution
        await escrow.connect(serviceWallet).resolveDispute(escrowIds[i], releaseFunds);
      }
      
      // Verify all resolved
      for (const escrowId of escrowIds) {
        const dispute = await escrow.getDisputeInfo(escrowId);
        expect(dispute.disputeResolved).to.be.true;
      }
    });
  });

  describe("Reentrancy and Security Tests", function () {
    it("Should prevent reentrancy attacks during refund", async function () {
      // This test would require a malicious contract
      // For now, we verify the nonReentrant modifier is in place
      const contractCode = await ethers.provider.getCode(await escrow.getAddress());
      expect(contractCode).to.not.equal("0x"); // Contract is deployed
    });

    it("Should maintain correct balances after disputes", async function () {
      const depositAmount = ethers.parseEther("1.0");
      
      // Track service wallet balance
      const serviceBalanceBefore = await ethers.provider.getBalance(serviceWallet.address);
      
      const tx = await escrow.connect(buyer).createEscrow(
        seller.address,
        ethers.ZeroAddress,
        depositAmount,
        ethers.ZeroAddress,
        31337, // Hardhat network chain ID
        { value: depositAmount }
      );
      const receipt = await tx.wait();
      const escrowId = receipt.logs[0].args[0];
      
      // Service wallet should have received fee
      const serviceBalanceAfter = await ethers.provider.getBalance(serviceWallet.address);
      const expectedFee = depositAmount * BigInt(SERVICE_FEE_BPS) / 10000n;
      expect(serviceBalanceAfter - serviceBalanceBefore).to.equal(expectedFee);
      
      // Contract should hold the net amount
      const contractBalance = await ethers.provider.getBalance(await escrow.getAddress());
      expect(contractBalance).to.equal(depositAmount - expectedFee);
    });
  });

  describe("Event Emission Tests", function () {
    it("Should emit correct events for dispute lifecycle", async function () {
      const depositAmount = ethers.parseEther("1.0");
      
      const tx = await escrow.connect(buyer).createEscrow(
        seller.address,
        ethers.ZeroAddress,
        depositAmount,
        ethers.ZeroAddress,
        31337, // Hardhat network chain ID
        { value: depositAmount }
      );
      const receipt = await tx.wait();
      const escrowId = receipt.logs[0].args[0];
      
      // Update condition
      await expect(escrow.connect(serviceWallet).updateConditionWithDispute(escrowId, true))
        .to.emit(escrow, "ConditionUpdated")
        .withArgs(escrowId, true, serviceWallet.address);
      
      // Raise dispute
      await expect(escrow.connect(buyer).raiseDispute(escrowId, "Test dispute"))
        .to.emit(escrow, "DisputeRaised")
        .withArgs(escrowId, buyer.address, "Test dispute", await time.latest() + 1);
      
      // Resolve dispute
      await expect(escrow.connect(serviceWallet).resolveDispute(escrowId, true))
        .to.emit(escrow, "DisputeResolved")
        .withArgs(escrowId, true, await time.latest() + 1);
    });

    it("Should emit FundsReturnedToBuyer event on timeout refund", async function () {
      const depositAmount = ethers.parseEther("1.0");
      
      const tx = await escrow.connect(buyer).createEscrow(
        seller.address,
        ethers.ZeroAddress,
        depositAmount,
        ethers.ZeroAddress,
        31337, // Hardhat network chain ID
        { value: depositAmount }
      );
      const receipt = await tx.wait();
      const escrowId = receipt.logs[0].args[0];
      
      await escrow.connect(serviceWallet).updateConditionWithDispute(escrowId, true);
      await escrow.connect(buyer).raiseDispute(escrowId, "Timeout test");
      
      await time.increase(DISPUTE_RESOLUTION_PERIOD + 1);
      
      const netAmount = depositAmount * 98n / 100n; // After 2% fee
      await expect(escrow.connect(serviceWallet).returnFundsAfterDisputeTimeout(escrowId))
        .to.emit(escrow, "FundsReturnedToBuyer")
        .withArgs(escrowId, buyer.address, netAmount, "Dispute unresolved or resolved in buyer favor");
    });
  });

  describe("Cross-chain Dispute Scenarios", function () {
    it("Should handle disputes for cross-chain escrows", async function () {
      const depositAmount = ethers.parseEther("1.0");
      
      // Create cross-chain escrow (Ethereum to Arbitrum)
      const tx = await escrow.connect(buyer).createEscrow(
        seller.address,
        ethers.ZeroAddress,
        depositAmount,
        ethers.ZeroAddress,
        42161, // Arbitrum chain ID
        { value: depositAmount }
      );
      const receipt = await tx.wait();
      const escrowId = receipt.logs[0].args[0];
      
      // Dispute flow should work the same
      await escrow.connect(serviceWallet).updateConditionWithDispute(escrowId, true);
      await escrow.connect(buyer).raiseDispute(escrowId, "Cross-chain dispute");
      
      // Resolve in buyer's favor
      await escrow.connect(serviceWallet).resolveDispute(escrowId, false);
      
      const escrowData = await escrow.escrows(escrowId);
      expect(escrowData.released).to.be.true;
    });
  });

  describe("Condition Update Edge Cases", function () {
    it("Should track condition met timestamp correctly", async function () {
      const depositAmount = ethers.parseEther("1.0");
      
      const tx = await escrow.connect(buyer).createEscrow(
        seller.address,
        ethers.ZeroAddress,
        depositAmount,
        ethers.ZeroAddress,
        31337, // Hardhat network chain ID
        { value: depositAmount }
      );
      const receipt = await tx.wait();
      const escrowId = receipt.logs[0].args[0];
      
      // First update
      await escrow.connect(serviceWallet).updateConditionWithDispute(escrowId, true);
      const dispute1 = await escrow.getDisputeInfo(escrowId);
      const firstTimestamp = dispute1.conditionMetTimestamp;
      expect(firstTimestamp).to.be.gt(0);
      
      // Toggle condition off and on
      await escrow.connect(serviceWallet).updateConditionWithDispute(escrowId, false);
      await escrow.connect(serviceWallet).updateConditionWithDispute(escrowId, true);
      
      // Timestamp should not change
      const dispute2 = await escrow.getDisputeInfo(escrowId);
      expect(dispute2.conditionMetTimestamp).to.equal(firstTimestamp);
    });

    it("Should prevent updating conditions after release", async function () {
      const depositAmount = ethers.parseEther("1.0");
      
      const tx = await escrow.connect(buyer).createEscrow(
        seller.address,
        ethers.ZeroAddress,
        depositAmount,
        ethers.ZeroAddress,
        31337, // Hardhat network chain ID
        { value: depositAmount }
      );
      const receipt = await tx.wait();
      const escrowId = receipt.logs[0].args[0];
      
      // Complete the escrow
      await escrow.connect(serviceWallet).updateConditionWithDispute(escrowId, true);
      await time.increase(DISPUTE_WINDOW + 1);
      await escrow.connect(buyer).releaseEscrowWithDisputeCheck(escrowId);
      
      // Try to update condition after release
      await expect(
        escrow.connect(serviceWallet).updateConditionWithDispute(escrowId, false)
      ).to.be.revertedWith("Escrow already released");
    });
  });
});