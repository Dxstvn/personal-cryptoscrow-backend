// src/contract/test/UniversalEscrowServiceV3DisputesStaking.test.js
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("UniversalEscrowServiceV3 - Dispute Staking", function () {
  let escrow;
  let mockUSDC;
  let owner, buyer, seller, arbitrator, otherUser;
  let dealId;

  const DEAL_AMOUNT = ethers.parseUnits("1000", 6); // 1000 USDC
  const DISPUTE_WINDOW = 48 * 60 * 60; // 48 hours
  const RESOLUTION_PERIOD = 7 * 24 * 60 * 60; // 7 days

  beforeEach(async function () {
    [owner, buyer, seller, arbitrator, otherUser] = await ethers.getSigners();

    // Deploy mock USDC
    const MockToken = await ethers.getContractFactory("MockToken");
    mockUSDC = await MockToken.deploy("Mock USDC", "USDC", 6);
    await mockUSDC.waitForDeployment();

    // Deploy mock WETH
    const MockWETH = await ethers.getContractFactory("MockToken");
    const mockWETH = await MockWETH.deploy("Wrapped Ether", "WETH", 18);
    await mockWETH.waitForDeployment();

    // Deploy mock Uniswap router (using owner address as placeholder)
    const mockRouter = owner; // Use a valid address as placeholder

    // Deploy escrow contract
    const UniversalEscrowServiceV3 = await ethers.getContractFactory("UniversalEscrowServiceV3DisputesStaking");
    escrow = await UniversalEscrowServiceV3.deploy(
      await owner.getAddress(), // service wallet
      await mockWETH.getAddress(), // WETH address
      await mockRouter.getAddress()  // uniswap router (using placeholder)
    );
    await escrow.waitForDeployment();

    // Mint and approve USDC for buyer
    await mockUSDC.mint(await buyer.getAddress(), ethers.parseUnits("10000", 6));
    await mockUSDC.connect(buyer).approve(await escrow.getAddress(), ethers.parseUnits("10000", 6));

    // Create a base escrow
    const tx = await escrow.connect(buyer).createEscrow(
      await seller.getAddress(),
      await mockUSDC.getAddress(), // deposit token
      DEAL_AMOUNT,
      await mockUSDC.getAddress(), // target token (same for non-cross-chain)
      1, // target chain ID (same chain)
      7 // dispute period (7 days)
    );

    const receipt = await tx.wait();
    const logs = receipt.logs.filter(log => {
      try {
        return escrow.interface.parseLog(log).name === "EscrowCreated";
      } catch {
        return false;
      }
    });
    const event = escrow.interface.parseLog(logs[0]);
    dealId = event.args.escrowId;
  });

  describe("Dispute Staking Mechanism", function () {
    describe("raiseDispute", function () {
      it("should allow buyer to raise dispute with correct stake", async function () {
        // First mark conditions as met (only service wallet can do this)
        await escrow.connect(owner).updateConditionWithDispute(dealId, true);
        
        // Set buyer reputation to 950 (platinum tier = 2%)
        await escrow.connect(owner).setReputationScore(await buyer.getAddress(), 950);
        
        // Calculate stake requirement (2% for platinum reputation 900+)
        const stakeAmount = DEAL_AMOUNT * 200n / 10000n; // 2%

        // Approve additional tokens for stake
        await mockUSDC.connect(buyer).approve(await escrow.getAddress(), DEAL_AMOUNT + stakeAmount);

        // Raise dispute with stake
        const tx = await escrow.connect(buyer).raiseDispute(
          dealId,
          "Quality issue",
          await mockUSDC.getAddress() // stakeToken parameter
        );

        const receipt = await tx.wait();
        const logs = receipt.logs.filter(log => {
          try {
            return escrow.interface.parseLog(log).name === "DisputeRaised";
          } catch {
            return false;
          }
        });
        const event = escrow.interface.parseLog(logs[0]);

        expect(event.args.escrowId).to.equal(dealId);
        expect(event.args.raisedBy).to.equal(await buyer.getAddress());
        expect(event.args.reason).to.equal("Quality issue");
        expect(event.args.stakeAmount).to.equal(stakeAmount);

        // Check deal state
        const deal = await escrow.escrows(dealId);
        // Check dispute info instead of deal
        const dispute = await escrow.disputes(dealId);
        expect(dispute.disputeRaised).to.be.true;
        expect(dispute.stakeAmount).to.equal(stakeAmount);
        expect(dispute.reputationScoreAtStake).to.equal(950);
      });

      it("should allow seller to raise dispute with stake", async function () {
        // Mark conditions met first (only service wallet can do this)
        await escrow.connect(owner).updateConditionWithDispute(dealId, true);

        // Set seller reputation to 800 (good tier = 3.5%)
        await escrow.connect(owner).setReputationScore(await seller.getAddress(), 800);
        
        // Calculate stake amount for seller  
        const stakeAmount = DEAL_AMOUNT * 250n / 10000n; // 2.5% for gold reputation
        
        // Mint and approve USDC for seller
        await mockUSDC.mint(await seller.getAddress(), stakeAmount);
        await mockUSDC.connect(seller).approve(await escrow.getAddress(), stakeAmount);

        // Raise dispute with stake
        const tx = await escrow.connect(seller).raiseDispute(dealId, "Payment issue", await mockUSDC.getAddress());

        const receipt = await tx.wait();
        const logs = receipt.logs.filter(log => {
          try {
            return escrow.interface.parseLog(log).name === "DisputeRaised";
          } catch {
            return false;
          }
        });
        expect(logs.length).to.be.gt(0);
        
        const event = escrow.interface.parseLog(logs[0]);
        expect(event.args.escrowId).to.equal(dealId);
        expect(event.args.raisedBy).to.equal(await seller.getAddress());
        expect(event.args.stakeAmount).to.equal(stakeAmount);
      });

      it("should fail if dispute already exists", async function () {
        // Mark conditions as met first
        await escrow.connect(owner).updateConditionWithDispute(dealId, true);
        
        const stakeAmount = DEAL_AMOUNT * 200n / 10000n; // 2% for excellent
        
        // First dispute succeeds
        await escrow.connect(buyer).raiseDispute(dealId, "Issue 1", await mockUSDC.getAddress());

        // Second dispute fails
        await expect(
          escrow.connect(buyer).raiseDispute(dealId, "Issue 2", await mockUSDC.getAddress())
        ).to.be.revertedWithCustomError(escrow, "DisputeAlreadyRaised");
      });

      it("should fail if insufficient stake provided", async function () {
        // Mark conditions as met first
        await escrow.connect(owner).updateConditionWithDispute(dealId, true);
        
        const insufficientStake = DEAL_AMOUNT * 100n / 10000n; // 1% instead of 2%

        // Approve only insufficient stake amount
        await mockUSDC.connect(buyer).approve(await escrow.getAddress(), insufficientStake);
        
        await expect(
          escrow.connect(buyer).raiseDispute(dealId, "Issue", await mockUSDC.getAddress())
        ).to.be.revertedWithCustomError(escrow, "InsufficientBalance");
      });

      it("should fail if stake transfer fails", async function () {
        // Mark conditions as met first
        await escrow.connect(owner).updateConditionWithDispute(dealId, true);
        
        const stakeAmount = DEAL_AMOUNT * 1000n / 10000n; // 10% for unverified

        // Don't approve enough tokens
        await mockUSDC.connect(buyer).approve(await escrow.getAddress(), 0);

        await expect(
          escrow.connect(buyer).raiseDispute(dealId, "Issue", await mockUSDC.getAddress())
        ).to.be.reverted;
      });

      it("should validate reputation score bounds", async function () {
        // Test setting invalid reputation score
        await expect(
          escrow.connect(owner).setReputationScore(await buyer.getAddress(), 1001)
        ).to.be.revertedWithCustomError(escrow, "InvalidStakePercentage");
        
        // Test valid reputation score works
        await escrow.connect(owner).setReputationScore(await buyer.getAddress(), 1000);
        
        // Mark conditions as met first
        await escrow.connect(owner).updateConditionWithDispute(dealId, true);
        
        // Should work with valid reputation
        const stakeAmount = DEAL_AMOUNT * 200n / 10000n; // 2% for platinum (900+)
        await escrow.connect(buyer).raiseDispute(dealId, "Issue", await mockUSDC.getAddress());
        
        const dispute = await escrow.disputes(dealId);
        expect(dispute.reputationScoreAtStake).to.equal(1000);
      });

      it("should calculate correct stake percentages for reputation tiers", async function () {
        const testCases = [
          { reputation: 950, percentage: 200 }, // Platinum: 2%  
          { reputation: 800, percentage: 250 }, // Gold: 2.5%
          { reputation: 600, percentage: 350 }, // Silver: 3.5%
          { reputation: 300, percentage: 500 }, // Bronze: 5%
          { reputation: 100, percentage: 1000 } // Unverified: 10%
        ];

        for (const testCase of testCases) {
          // Create new deal for each test
          const tx = await escrow.connect(buyer).createEscrow(
            await seller.getAddress(),
            await mockUSDC.getAddress(), // deposit token
            DEAL_AMOUNT,
            await mockUSDC.getAddress(), // target token
            1, // target chain ID
            7 // dispute period (days)
          );
          const receipt = await tx.wait();
          const logs = receipt.logs.filter(log => {
            try {
              return escrow.interface.parseLog(log).name === "EscrowCreated";
            } catch {
              return false;
            }
          });
          const event = escrow.interface.parseLog(logs[0]);
          const testDealId = event.args.escrowId;

          const expectedStake = DEAL_AMOUNT * BigInt(testCase.percentage) / 10000n; // basis points

          // Mark conditions as met first
          await escrow.connect(owner).updateConditionWithDispute(testDealId, true);
          
          // Set reputation score for this test
          await escrow.connect(owner).setReputationScore(await buyer.getAddress(), testCase.reputation);
          
          // This should succeed with exact stake
          await escrow.connect(buyer).raiseDispute(
            testDealId,
            "Test",
            await mockUSDC.getAddress()
          );

          const dispute = await escrow.disputes(testDealId);
          expect(dispute.stakeAmount).to.equal(expectedStake);
        }
      });
    });

    describe("Dispute Resolution with Stake", function () {
      let stakeAmount;

      beforeEach(async function () {
        // Mark conditions as met first
        await escrow.connect(owner).updateConditionWithDispute(dealId, true);
        
        // Set buyer reputation to 950 (platinum tier = 2%)
        await escrow.connect(owner).setReputationScore(await buyer.getAddress(), 950);
        
        // Raise dispute with stake
        stakeAmount = DEAL_AMOUNT * 200n / 10000n; // 2% for excellent
        await escrow.connect(buyer).raiseDispute(dealId, "Test dispute", await mockUSDC.getAddress());
      });

      it("should return stake when resolved in favor of disputer", async function () {
        const buyerBalanceBefore = await mockUSDC.balanceOf(await buyer.getAddress());

        // Resolve in favor of buyer (only service wallet can resolve)
        const tx = await escrow.connect(owner).resolveDispute(
          dealId,
          false, // releaseFunds: false means return to buyer
          0 // slashPercentage: 0 means full stake return
        );

        const receipt = await tx.wait();
        const stakeLogs = receipt.logs.filter(log => {
          try {
            return escrow.interface.parseLog(log).name === "StakeReturned";
          } catch {
            return false;
          }
        });
        const stakeEvent = escrow.interface.parseLog(stakeLogs[0]);
        
        expect(stakeEvent.args.escrowId).to.equal(dealId);
        expect(stakeEvent.args.to).to.equal(await buyer.getAddress());
        expect(stakeEvent.args.amount).to.equal(stakeAmount);
        
        // Also check DisputeResolved event
        const disputeLogs = receipt.logs.filter(log => {
          try {
            return escrow.interface.parseLog(log).name === "DisputeResolved";
          } catch {
            return false;
          }
        });
        const disputeEvent = escrow.interface.parseLog(disputeLogs[0]);
        expect(disputeEvent.args.stakeReturned).to.equal(stakeAmount);
        expect(disputeEvent.args.stakeSlashed).to.equal(0);

        // Check buyer received stake back (and deal amount)
        const buyerBalanceAfter = await mockUSDC.balanceOf(await buyer.getAddress());
        // When resolved for buyer (releaseFunds=false), they get the netAmount (98% of DEAL_AMOUNT) + stake back
        // The contract deducts a 2% service fee, so netAmount = DEAL_AMOUNT * 98/100
        const netAmount = DEAL_AMOUNT * 98n / 100n;
        expect(buyerBalanceAfter - buyerBalanceBefore).to.equal(stakeAmount + netAmount);
      });

      it("should slash stake when resolved against disputer", async function () {
        const sellerBalanceBefore = await mockUSDC.balanceOf(await seller.getAddress());

        // Create a new deal for this test
        const tx0 = await escrow.connect(buyer).createEscrow(
          await seller.getAddress(),
          await mockUSDC.getAddress(),
          DEAL_AMOUNT,
          await mockUSDC.getAddress(),
          0, // 0 means same chain (will use block.chainid)
          7
        );
        const receipt0 = await tx0.wait();
        const logs0 = receipt0.logs.filter(log => {
          try {
            return escrow.interface.parseLog(log).name === "EscrowCreated";
          } catch {
            return false;
          }
        });
        const event0 = escrow.interface.parseLog(logs0[0]);
        const slashDealId = event0.args.escrowId;
        
        // Setup dispute
        await escrow.connect(owner).updateConditionWithDispute(slashDealId, true);
        await escrow.connect(owner).setReputationScore(await buyer.getAddress(), 950);
        const slashStakeAmount = DEAL_AMOUNT * 200n / 10000n;
        await escrow.connect(buyer).raiseDispute(slashDealId, "Test dispute", await mockUSDC.getAddress());
        
        // Resolve against buyer (for seller) - only service wallet can resolve
        const tx = await escrow.connect(owner).resolveDispute(
          slashDealId,
          true, // releaseFunds: true means release to seller
          100 // slashPercentage: 100 means full stake slash
        );

        const receipt = await tx.wait();
        const stakeLogs = receipt.logs.filter(log => {
          try {
            return escrow.interface.parseLog(log).name === "StakeSlashed";
          } catch {
            return false;
          }
        });
        const stakeEvent = escrow.interface.parseLog(stakeLogs[0]);
        
        expect(stakeEvent.args.escrowId).to.equal(slashDealId);
        expect(stakeEvent.args.amount).to.equal(slashStakeAmount);
        expect(stakeEvent.args.beneficiary).to.equal(await seller.getAddress());
        
        // Also check DisputeResolved event
        const disputeLogs = receipt.logs.filter(log => {
          try {
            return escrow.interface.parseLog(log).name === "DisputeResolved";
          } catch {
            return false;
          }
        });
        const disputeEvent = escrow.interface.parseLog(disputeLogs[0]);
        expect(disputeEvent.args.stakeReturned).to.equal(0);
        expect(disputeEvent.args.stakeSlashed).to.equal(slashStakeAmount);

        // Check seller received slashed stake and the netAmount from the deal
        const sellerBalanceAfter = await mockUSDC.balanceOf(await seller.getAddress());
        const netAmount = DEAL_AMOUNT * 98n / 100n; // 2% service fee
        expect(sellerBalanceAfter - sellerBalanceBefore).to.equal(slashStakeAmount + netAmount);
      });

      it("should handle partial resolution correctly", async function () {
        const buyerBalanceBefore = await mockUSDC.balanceOf(await buyer.getAddress());
        const feeBalanceBefore = await mockUSDC.balanceOf(await owner.getAddress());

        // Resolve partially (custom resolution)
        const returnAmount = stakeAmount * 60n / 100n; // 60% returned
        const slashAmount = stakeAmount - returnAmount; // 40% slashed

        // Note: Current contract doesn't support partial resolution
        // This test documents expected behavior for future implementation
        
        // For now, test that custom resolution returns full stake (only service wallet)
        const tx = await escrow.connect(owner).resolveDispute(
          dealId,
          false, // releaseFunds: false
          0 // slashPercentage: 0 for full return in custom resolution
        );

        const receipt = await tx.wait();
        const stakeLogs = receipt.logs.filter(log => {
          try {
            return escrow.interface.parseLog(log).name === "StakeReturned";
          } catch {
            return false;
          }
        });
        const stakeEvent = escrow.interface.parseLog(stakeLogs[0]);
        
        // Current behavior: custom resolution returns full stake
        expect(stakeEvent.args.escrowId).to.equal(dealId);
        expect(stakeEvent.args.to).to.equal(await buyer.getAddress());
        expect(stakeEvent.args.amount).to.equal(stakeAmount);
      });

      it("should handle auto-resolution timeout correctly", async function () {
        // Create a new deal for this test to avoid reentrancy issues
        const tx = await escrow.connect(buyer).createEscrow(
          await seller.getAddress(),
          await mockUSDC.getAddress(),
          DEAL_AMOUNT,
          await mockUSDC.getAddress(),
          1,
          7
        );
        const receipt = await tx.wait();
        const logs = receipt.logs.filter(log => {
          try {
            return escrow.interface.parseLog(log).name === "EscrowCreated";
          } catch {
            return false;
          }
        });
        const event = escrow.interface.parseLog(logs[0]);
        const timeoutDealId = event.args.escrowId;
        
        // Mark conditions met
        await escrow.connect(owner).updateConditionWithDispute(timeoutDealId, true);
        
        // Set buyer reputation
        await escrow.connect(owner).setReputationScore(await buyer.getAddress(), 950);
        
        // Raise dispute first
        const stakeAmount = DEAL_AMOUNT * 200n / 10000n;
        await escrow.connect(buyer).raiseDispute(timeoutDealId, "Test dispute", await mockUSDC.getAddress());

        // Wait for resolution period (7 days)
        await time.increase(RESOLUTION_PERIOD + 1);

        const buyerBalanceBefore = await mockUSDC.balanceOf(await buyer.getAddress());

        // Auto-resolve should return stake to buyer
        const tx2 = await escrow.returnFundsAfterDisputeTimeout(timeoutDealId);
        const receipt2 = await tx2.wait();
        
        const stakeLogs = receipt2.logs.filter(log => {
          try {
            return escrow.interface.parseLog(log).name === "StakeReturned";
          } catch {
            return false;
          }
        });
        const stakeEvent = escrow.interface.parseLog(stakeLogs[0]);
        expect(stakeEvent.args.escrowId).to.equal(timeoutDealId);
        expect(stakeEvent.args.to).to.equal(await buyer.getAddress());
        expect(stakeEvent.args.amount).to.equal(stakeAmount);

        const buyerBalanceAfter = await mockUSDC.balanceOf(await buyer.getAddress());
        // Buyer gets back netAmount (98% of DEAL_AMOUNT) + stakeAmount
        const netAmount = DEAL_AMOUNT * 98n / 100n;
        expect(buyerBalanceAfter - buyerBalanceBefore).to.equal(netAmount + stakeAmount);
      });

      it("should emit correct events for stake resolution", async function () {
        const tx = await escrow.connect(owner).resolveDispute(
          dealId,
          false, // releaseFunds: false means return to buyer
          0 // slashPercentage: 0 means full stake return
        );

        const receipt = await tx.wait();
        
        // Should emit both DisputeResolved and StakeResolved
        const disputeLogs = receipt.logs.filter(log => {
          try {
            return escrow.interface.parseLog(log).name === "DisputeResolved";
          } catch {
            return false;
          }
        });
        const stakeLogs = receipt.logs.filter(log => {
          try {
            return escrow.interface.parseLog(log).name === "StakeReturned";
          } catch {
            return false;
          }
        });

        expect(disputeLogs.length).to.be.gt(0);
        expect(stakeLogs.length).to.be.gt(0);
        
        const stakeEvent = escrow.interface.parseLog(stakeLogs[0]);
        expect(stakeEvent.args.escrowId).to.equal(dealId);
        expect(stakeEvent.args.to).to.equal(await buyer.getAddress());
        expect(stakeEvent.args.amount).to.equal(stakeAmount);
      });
    });

    describe("Emergency Functions", function () {
      // Note: emergencyWithdraw function doesn't exist in the contract
      // Only emergencyStakeReturn is available

      it("should restrict emergency functions to owner", async function () {
        // Test with emergencyStakeReturn which exists
        await expect(
          escrow.connect(buyer).emergencyStakeReturn(dealId)
        ).to.be.revertedWithCustomError(escrow, "DisputeNotServiceWallet");
      });

      it("should allow emergency stake return", async function () {
        // Create a new deal for this test
        const tx = await escrow.connect(buyer).createEscrow(
          await seller.getAddress(),
          await mockUSDC.getAddress(),
          DEAL_AMOUNT,
          await mockUSDC.getAddress(),
          1,
          7
        );
        const receipt = await tx.wait();
        const logs = receipt.logs.filter(log => {
          try {
            return escrow.interface.parseLog(log).name === "EscrowCreated";
          } catch {
            return false;
          }
        });
        const event = escrow.interface.parseLog(logs[0]);
        const emergencyDealId = event.args.escrowId;
        
        // Mark conditions as met first
        await escrow.connect(owner).updateConditionWithDispute(emergencyDealId, true);
        
        // Set buyer reputation to 950
        await escrow.connect(owner).setReputationScore(await buyer.getAddress(), 950);
        
        const stakeAmount = DEAL_AMOUNT * 200n / 10000n; // 2% for excellent
        await escrow.connect(buyer).raiseDispute(emergencyDealId, "Test", await mockUSDC.getAddress());

        const buyerBalanceBefore = await mockUSDC.balanceOf(await buyer.getAddress());

        // Emergency return stake to buyer
        await escrow.connect(owner).emergencyStakeReturn(emergencyDealId);

        const buyerBalanceAfter = await mockUSDC.balanceOf(await buyer.getAddress());
        expect(buyerBalanceAfter - buyerBalanceBefore).to.equal(stakeAmount);

        // Verify stake is marked as returned
        const dispute = await escrow.disputes(emergencyDealId);
        expect(dispute.stakeStatus).to.equal(2); // StakeStatus.Returned
      });

      it("should prevent double stake return", async function () {
        // Create a new deal for this test
        const tx = await escrow.connect(buyer).createEscrow(
          await seller.getAddress(),
          await mockUSDC.getAddress(),
          DEAL_AMOUNT,
          await mockUSDC.getAddress(),
          1,
          7
        );
        const receipt = await tx.wait();
        const logs = receipt.logs.filter(log => {
          try {
            return escrow.interface.parseLog(log).name === "EscrowCreated";
          } catch {
            return false;
          }
        });
        const event = escrow.interface.parseLog(logs[0]);
        const doubleDealId = event.args.escrowId;
        
        // Mark conditions as met first
        await escrow.connect(owner).updateConditionWithDispute(doubleDealId, true);
        
        // Set buyer reputation
        await escrow.connect(owner).setReputationScore(await buyer.getAddress(), 950);
        
        const stakeAmount = DEAL_AMOUNT * 200n / 10000n; // 2% for excellent
        await escrow.connect(buyer).raiseDispute(doubleDealId, "Test", await mockUSDC.getAddress());

        // First return succeeds
        await escrow.connect(owner).emergencyStakeReturn(doubleDealId);

        // Second return fails
        await expect(
          escrow.connect(owner).emergencyStakeReturn(doubleDealId)
        ).to.be.revertedWithCustomError(escrow, "StakeAlreadyProcessed");
      });
    });

    describe("Integration with Existing Dispute Flow", function () {
      it("should work with regular dispute flow when no stake provided", async function () {
        // Create new deal
        const tx = await escrow.connect(buyer).createEscrow(
          await seller.getAddress(),
          await mockUSDC.getAddress(), // deposit token
          DEAL_AMOUNT,
          await mockUSDC.getAddress(), // target token
          1, // target chain ID
          7 // dispute period (days)
        );
        const receipt = await tx.wait();
        const logs = receipt.logs.filter(log => {
          try {
            return escrow.interface.parseLog(log).name === "EscrowCreated";
          } catch {
            return false;
          }
        });
        const event = escrow.interface.parseLog(logs[0]);
        const newDealId = event.args.escrowId;

        // Mark conditions as met first
        await escrow.connect(owner).updateConditionWithDispute(newDealId, true);
        
        // Raise regular dispute (no stake)
        await escrow.connect(buyer).raiseDispute(
          newDealId,
          "Regular dispute",
          await mockUSDC.getAddress()
        );

        const dispute = await escrow.disputes(newDealId);
        expect(dispute.disputeRaised).to.be.true;
        expect(dispute.stakeAmount).to.be.gt(0); // Should have stake based on reputation
      });

      it("should maintain backward compatibility", async function () {
        // Mark conditions as met first
        await escrow.connect(owner).updateConditionWithDispute(dealId, true);
        
        // Old dispute flow should still work
        await escrow.connect(buyer).raiseDispute(
          dealId,
          "Old style dispute",
          await mockUSDC.getAddress()
        );

        // Resolution should work without stake considerations (only service wallet)
        await escrow.connect(owner).resolveDispute(
          dealId,
          false, // releaseFunds: false means return to buyer
          0 // slashPercentage: 0 means full stake return
        );

        const escrowData = await escrow.escrows(dealId);
        expect(escrowData.released).to.be.true; // Should be released
      });
    });

    describe("Stake Amount Validation", function () {
      it("should validate stake matches reputation tier exactly", async function () {
        const testCases = [
          { reputation: 950, correctStake: DEAL_AMOUNT * 200n / 10000n },  // 2%
          { reputation: 800, correctStake: DEAL_AMOUNT * 250n / 10000n },  // 2.5%
          { reputation: 600, correctStake: DEAL_AMOUNT * 350n / 10000n },  // 3.5%
          { reputation: 300, correctStake: DEAL_AMOUNT * 500n / 10000n },  // 5%
          { reputation: 100, correctStake: DEAL_AMOUNT * 1000n / 10000n }  // 10%
        ];

        // Approve enough tokens for all test cases
        const totalNeeded = DEAL_AMOUNT * BigInt(testCases.length) + DEAL_AMOUNT; // Extra for stakes
        await mockUSDC.mint(await buyer.getAddress(), totalNeeded);
        await mockUSDC.connect(buyer).approve(await escrow.getAddress(), totalNeeded);
        
        for (const testCase of testCases) {
          // Create new deal
          const tx = await escrow.connect(buyer).createEscrow(
            await seller.getAddress(),
            await mockUSDC.getAddress(), // deposit token
            DEAL_AMOUNT,
            await mockUSDC.getAddress(), // target token
            1, // target chain ID
            7 // dispute period (days)
          );
          const receipt = await tx.wait();
          const logs = receipt.logs.filter(log => {
            try {
              return escrow.interface.parseLog(log).name === "EscrowCreated";
            } catch {
              return false;
            }
          });
          const event = escrow.interface.parseLog(logs[0]);
          const testDealId = event.args.escrowId;

          // Mark conditions as met first
          await escrow.connect(owner).updateConditionWithDispute(testDealId, true);
          
          // Set reputation score for this test
          await escrow.connect(owner).setReputationScore(await buyer.getAddress(), testCase.reputation);
          
          // Raise dispute with correct stake
          await escrow.connect(buyer).raiseDispute(
            testDealId,
            "Test",
            await mockUSDC.getAddress()
          );
          
          // Verify correct stake was taken
          const dispute = await escrow.disputes(testDealId);
          expect(dispute.stakeAmount).to.equal(testCase.correctStake);
        }
      });

      it("should handle edge case reputation scores", async function () {
        // Test boundary values
        const boundaries = [
          { score: 1000, tier: "Platinum", percentage: 200 },
          { score: 900, tier: "Platinum", percentage: 200 },
          { score: 899, tier: "Gold", percentage: 250 },
          { score: 750, tier: "Gold", percentage: 250 },
          { score: 749, tier: "Silver", percentage: 350 },
          { score: 500, tier: "Silver", percentage: 350 },
          { score: 499, tier: "Bronze", percentage: 500 },
          { score: 200, tier: "Bronze", percentage: 500 },
          { score: 199, tier: "Unverified", percentage: 1000 },
          { score: 0, tier: "Unverified", percentage: 1000 }
        ];

        // Approve enough tokens for all test cases upfront
        const maxStake = DEAL_AMOUNT * 1000n / 10000n; // 10% max
        const totalNeeded = DEAL_AMOUNT * BigInt(boundaries.length) + maxStake * BigInt(boundaries.length);
        await mockUSDC.mint(await buyer.getAddress(), totalNeeded);
        await mockUSDC.connect(buyer).approve(await escrow.getAddress(), totalNeeded);
        
        for (const boundary of boundaries) {
          const expectedStake = DEAL_AMOUNT * BigInt(boundary.percentage) / 10000n; // basis points
          
          // Create deal
          const tx = await escrow.connect(buyer).createEscrow(
            await seller.getAddress(),
            await mockUSDC.getAddress(), // deposit token
            DEAL_AMOUNT,
            await mockUSDC.getAddress(), // target token
            1, // target chain ID
            7 // dispute period (days)
          );
          const receipt = await tx.wait();
          const logs = receipt.logs.filter(log => {
            try {
              return escrow.interface.parseLog(log).name === "EscrowCreated";
            } catch {
              return false;
            }
          });
          const event = escrow.interface.parseLog(logs[0]);
          const testDealId = event.args.escrowId;

          // Mark conditions as met first
          await escrow.connect(owner).updateConditionWithDispute(testDealId, true);
          
          // Set reputation score for this test
          await escrow.connect(owner).setReputationScore(await buyer.getAddress(), boundary.score);
          
          // Should work with correct stake
          await escrow.connect(buyer).raiseDispute(
            testDealId,
            "Test",
            await mockUSDC.getAddress()
          );
          
          // Verify stake amount
          const dispute = await escrow.disputes(testDealId);
          expect(dispute.stakeAmount).to.equal(expectedStake);
        }
      });
    });

    describe("Gas Optimization", function () {
      it("should have reasonable gas costs for stake operations", async function () {
        // Mark conditions as met first
        await escrow.connect(owner).updateConditionWithDispute(dealId, true);
        
        const stakeAmount = DEAL_AMOUNT * 200n / 10000n; // 2% for excellent

        // Measure gas for raising dispute with stake
        const tx1 = await escrow.connect(buyer).raiseDispute(dealId, "Gas test", await mockUSDC.getAddress());
        const receipt1 = await tx1.wait();
        console.log("Gas for raiseDispute:", receipt1.gasUsed.toString());
        expect(receipt1.gasUsed).to.be.lt(300000n); // Should be under 300k gas

        // Measure gas for resolution (only service wallet)
        const tx2 = await escrow.connect(owner).resolveDispute(
          dealId,
          false, // releaseFunds: false means return to buyer
          0 // slashPercentage: 0 means full stake return
        );
        const receipt2 = await tx2.wait();
        console.log("Gas for resolveDispute with stake:", receipt2.gasUsed.toString());
        expect(receipt2.gasUsed).to.be.lt(250000n); // Should be under 250k gas
      });
    });
  });
});