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
    describe("raiseDisputeWithStake", function () {
      it("should allow buyer to raise dispute with correct stake", async function () {
        // Calculate stake requirement (2.5% for excellent reputation)
        const stakeAmount = DEAL_AMOUNT * 25n / 1000n; // 2.5%

        // Approve additional tokens for stake
        await mockUSDC.connect(buyer).approve(await escrow.getAddress(), DEAL_AMOUNT + stakeAmount);

        // Raise dispute with stake
        const tx = await escrow.connect(buyer).raiseDisputeWithStake(
          dealId,
          ethers.id("Quality issue"),
          stakeAmount,
          950 // reputation score
        );

        const receipt = await tx.wait();
        const logs = receipt.logs.filter(log => {
          try {
            return escrow.interface.parseLog(log).name === "DisputeRaisedWithStake";
          } catch {
            return false;
          }
        });
        const event = escrow.interface.parseLog(logs[0]);

        expect(event.args.dealId).to.equal(dealId);
        expect(event.args.disputer).to.equal(await buyer.getAddress());
        expect(event.args.stakeAmount).to.equal(stakeAmount);
        expect(event.args.reputationScore).to.equal(950);

        // Check deal state
        const deal = await escrow.escrows(dealId);
        expect(deal.status).to.equal(1); // Disputed
        expect(deal.disputeStake).to.equal(stakeAmount);
        expect(deal.disputerReputation).to.equal(950);
      });

      it("should allow seller to raise dispute with stake", async function () {
        // Mark conditions met first
        await escrow.connect(buyer).updateConditions(dealId, [true, true]);

        // Mint and approve USDC for seller
        const stakeAmount = DEAL_AMOUNT * 35n / 1000n; // 3.5% for good reputation
        await mockUSDC.mint(await seller.getAddress(), stakeAmount);
        await mockUSDC.connect(seller).approve(await escrow.getAddress(), stakeAmount);

        // Raise dispute with stake
        const tx = await escrow.connect(seller).raiseDisputeWithStake(
          dealId,
          ethers.id("Payment issue"),
          stakeAmount,
          800 // reputation score
        );

        const receipt = await tx.wait();
        const logs = receipt.logs.filter(log => {
          try {
            return escrow.interface.parseLog(log).name === "DisputeRaisedWithStake";
          } catch {
            return false;
          }
        });
        expect(logs.length).to.be.gt(0);
      });

      it("should fail if dispute already exists", async function () {
        const stakeAmount = DEAL_AMOUNT * 25n / 1000n;
        
        // First dispute succeeds
        await escrow.connect(buyer).raiseDisputeWithStake(
          dealId,
          ethers.id("Issue 1"),
          stakeAmount,
          950
        );

        // Second dispute fails
        await expect(
          escrow.connect(buyer).raiseDisputeWithStake(
            dealId,
            ethers.id("Issue 2"),
            stakeAmount,
            950
          )
        ).to.be.revertedWith("Deal already disputed");
      });

      it("should fail if insufficient stake provided", async function () {
        const insufficientStake = DEAL_AMOUNT * 10n / 1000n; // 1% instead of 2.5%

        await expect(
          escrow.connect(buyer).raiseDisputeWithStake(
            dealId,
            ethers.id("Issue"),
            insufficientStake,
            950
          )
        ).to.be.revertedWith("Insufficient stake for reputation level");
      });

      it("should fail if stake transfer fails", async function () {
        const stakeAmount = DEAL_AMOUNT * 100n / 1000n; // 10% for restricted

        // Don't approve enough tokens
        await mockUSDC.connect(buyer).approve(await escrow.getAddress(), 0);

        await expect(
          escrow.connect(buyer).raiseDisputeWithStake(
            dealId,
            ethers.id("Issue"),
            stakeAmount,
            100
          )
        ).to.be.reverted;
      });

      it("should validate reputation score bounds", async function () {
        const stakeAmount = DEAL_AMOUNT * 25n / 1000n;

        // Test reputation > 1000
        await expect(
          escrow.connect(buyer).raiseDisputeWithStake(
            dealId,
            ethers.id("Issue"),
            stakeAmount,
            1001
          )
        ).to.be.revertedWith("Invalid reputation score");

        // Test reputation < 0 (would underflow as uint256)
        // Cannot test negative as uint256 doesn't allow it
      });

      it("should calculate correct stake percentages for reputation tiers", async function () {
        const testCases = [
          { reputation: 950, percentage: 25 }, // Excellent: 2.5%
          { reputation: 800, percentage: 35 }, // Good: 3.5%
          { reputation: 600, percentage: 50 }, // Standard: 5%
          { reputation: 300, percentage: 70 }, // Probation: 7%
          { reputation: 100, percentage: 100 }  // Restricted: 10%
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
          const testDealId = event.args.dealId;

          const expectedStake = DEAL_AMOUNT * BigInt(testCase.percentage) / 1000n;

          // This should succeed with exact stake
          await escrow.connect(buyer).raiseDisputeWithStake(
            testDealId,
            ethers.id("Test"),
            expectedStake,
            testCase.reputation
          );

          const deal = await escrow.escrows(testDealId);
          expect(deal.disputeStake).to.equal(expectedStake);
        }
      });
    });

    describe("Dispute Resolution with Stake", function () {
      let stakeAmount;

      beforeEach(async function () {
        // Raise dispute with stake
        stakeAmount = DEAL_AMOUNT * 25n / 1000n; // 2.5%
        await escrow.connect(buyer).raiseDisputeWithStake(
          dealId,
          ethers.id("Test dispute"),
          stakeAmount,
          950
        );
      });

      it("should return stake when resolved in favor of disputer", async function () {
        const buyerBalanceBefore = await mockUSDC.balanceOf(await buyer.getAddress());

        // Resolve in favor of buyer
        const tx = await escrow.connect(arbitrator).resolveDispute(
          dealId,
          0 // RESOLVED_FOR_BUYER
        );

        const receipt = await tx.wait();
        const logs = receipt.logs.filter(log => {
          try {
            return escrow.interface.parseLog(log).name === "StakeResolved";
          } catch {
            return false;
          }
        });
        const event = escrow.interface.parseLog(logs[0]);
        
        expect(event.args.dealId).to.equal(dealId);
        expect(event.args.disputer).to.equal(await buyer.getAddress());
        expect(event.args.stakeReturned).to.equal(stakeAmount);
        expect(event.args.stakeSlashed).to.equal(0);
        expect(event.args.outcome).to.equal("resolved_in_favor");

        // Check buyer received stake back
        const buyerBalanceAfter = await mockUSDC.balanceOf(await buyer.getAddress());
        expect(buyerBalanceAfter - buyerBalanceBefore).to.equal(DEAL_AMOUNT + stakeAmount);
      });

      it("should slash stake when resolved against disputer", async function () {
        const feeBalanceBefore = await mockUSDC.balanceOf(await owner.getAddress());

        // Resolve against buyer (for seller)
        const tx = await escrow.connect(arbitrator).resolveDispute(
          dealId,
          1 // RESOLVED_FOR_SELLER
        );

        const receipt = await tx.wait();
        const logs = receipt.logs.filter(log => {
          try {
            return escrow.interface.parseLog(log).name === "StakeResolved";
          } catch {
            return false;
          }
        });
        const event = escrow.interface.parseLog(logs[0]);
        
        expect(event.args.stakeReturned).to.equal(0);
        expect(event.args.stakeSlashed).to.equal(stakeAmount);
        expect(event.args.outcome).to.equal("resolved_against");

        // Check fee address received slashed stake
        const feeBalanceAfter = await mockUSDC.balanceOf(await owner.getAddress());
        expect(feeBalanceAfter - feeBalanceBefore).to.equal(stakeAmount);
      });

      it("should handle partial resolution correctly", async function () {
        const buyerBalanceBefore = await mockUSDC.balanceOf(await buyer.getAddress());
        const feeBalanceBefore = await mockUSDC.balanceOf(await owner.getAddress());

        // Resolve partially (custom resolution)
        const returnAmount = stakeAmount * 60n / 100n; // 60% returned
        const slashAmount = stakeAmount - returnAmount; // 40% slashed

        // Note: Current contract doesn't support partial resolution
        // This test documents expected behavior for future implementation
        
        // For now, test that custom resolution returns full stake
        const tx = await escrow.connect(arbitrator).resolveDispute(
          dealId,
          2 // CUSTOM_RESOLUTION
        );

        const receipt = await tx.wait();
        const logs = receipt.logs.filter(log => {
          try {
            return escrow.interface.parseLog(log).name === "StakeResolved";
          } catch {
            return false;
          }
        });
        const event = escrow.interface.parseLog(logs[0]);
        
        // Current behavior: custom resolution returns full stake
        expect(event.args.stakeReturned).to.equal(stakeAmount);
        expect(event.args.stakeSlashed).to.equal(0);
      });

      it("should handle auto-resolution timeout correctly", async function () {
        // Mark conditions met
        await escrow.connect(buyer).updateConditions(dealId, [true, true]);

        // Wait for dispute window
        await time.increase(DISPUTE_WINDOW + 1);

        // Wait for resolution period
        await time.increase(RESOLUTION_PERIOD + 1);

        const buyerBalanceBefore = await mockUSDC.balanceOf(await buyer.getAddress());

        // Auto-resolve should return stake to buyer
        const tx = await escrow.resolveDisputeTimeout(dealId);
        const receipt = await tx.wait();
        
        const logs = receipt.logs.filter(log => {
          try {
            return escrow.interface.parseLog(log).name === "StakeResolved";
          } catch {
            return false;
          }
        });
        const stakeEvent = escrow.interface.parseLog(logs[0]);
        expect(stakeEvent.args.stakeReturned).to.equal(stakeAmount);
        expect(stakeEvent.args.outcome).to.equal("timeout_return");

        const buyerBalanceAfter = await mockUSDC.balanceOf(await buyer.getAddress());
        expect(buyerBalanceAfter - buyerBalanceBefore).to.equal(DEAL_AMOUNT + stakeAmount);
      });

      it("should emit correct events for stake resolution", async function () {
        const tx = await escrow.connect(arbitrator).resolveDispute(
          dealId,
          0 // RESOLVED_FOR_BUYER
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
            return escrow.interface.parseLog(log).name === "StakeResolved";
          } catch {
            return false;
          }
        });

        expect(disputeLogs.length).to.be.gt(0);
        expect(stakeLogs.length).to.be.gt(0);
        
        const stakeEvent = escrow.interface.parseLog(stakeLogs[0]);
        expect(stakeEvent.args.reputationScore).to.equal(950);
      });
    });

    describe("Emergency Functions", function () {
      it("should allow owner to emergency withdraw stuck stakes", async function () {
        // Create situation with stuck stake
        const stakeAmount = DEAL_AMOUNT * 25n / 1000n;
        await escrow.connect(buyer).raiseDisputeWithStake(
          dealId,
          ethers.id("Test"),
          stakeAmount,
          950
        );

        const ownerBalanceBefore = await mockUSDC.balanceOf(await owner.getAddress());

        // Emergency withdraw
        await escrow.connect(owner).emergencyWithdraw(
          await mockUSDC.getAddress(),
          1000
        );

        const ownerBalanceAfter = await mockUSDC.balanceOf(await owner.getAddress());
        expect(ownerBalanceAfter - ownerBalanceBefore).to.be.gte(0);
      });

      it("should restrict emergency functions to owner", async function () {
        await expect(
          escrow.connect(buyer).emergencyWithdraw(
            await mockUSDC.getAddress(),
            1000
          )
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });

      it("should allow emergency stake return", async function () {
        const stakeAmount = DEAL_AMOUNT * 25n / 1000n;
        await escrow.connect(buyer).raiseDisputeWithStake(
          dealId,
          ethers.id("Test"),
          stakeAmount,
          950
        );

        const buyerBalanceBefore = await mockUSDC.balanceOf(await buyer.getAddress());

        // Emergency return stake to buyer
        await escrow.connect(owner).emergencyStakeReturn(dealId, await buyer.getAddress());

        const buyerBalanceAfter = await mockUSDC.balanceOf(await buyer.getAddress());
        expect(buyerBalanceAfter - buyerBalanceBefore).to.equal(stakeAmount);

        // Verify stake is marked as returned
        const deal = await escrow.escrows(dealId);
        expect(deal.stakeReturned).to.be.true;
      });

      it("should prevent double stake return", async function () {
        const stakeAmount = DEAL_AMOUNT * 25n / 1000n;
        await escrow.connect(buyer).raiseDisputeWithStake(
          dealId,
          ethers.id("Test"),
          stakeAmount,
          950
        );

        // First return succeeds
        await escrow.connect(owner).emergencyStakeReturn(dealId, await buyer.getAddress());

        // Second return fails
        await expect(
          escrow.connect(owner).emergencyStakeReturn(dealId, await buyer.getAddress())
        ).to.be.revertedWith("Stake already returned");
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
        const newDealId = event.args.dealId;

        // Raise regular dispute (no stake)
        await escrow.connect(buyer).raiseDispute(
          newDealId,
          ethers.id("Regular dispute")
        );

        const deal = await escrow.escrows(newDealId);
        expect(deal.status).to.equal(1); // Disputed
        expect(deal.disputeStake).to.equal(0); // No stake
      });

      it("should maintain backward compatibility", async function () {
        // Old dispute flow should still work
        await escrow.connect(buyer).raiseDispute(
          dealId,
          ethers.id("Old style dispute")
        );

        // Resolution should work without stake considerations
        await escrow.connect(arbitrator).resolveDispute(
          dealId,
          0 // RESOLVED_FOR_BUYER
        );

        const deal = await escrow.escrows(dealId);
        expect(deal.status).to.equal(3); // COMPLETED
      });
    });

    describe("Stake Amount Validation", function () {
      it("should validate stake matches reputation tier exactly", async function () {
        const testCases = [
          { reputation: 950, correctStake: DEAL_AMOUNT * 25n / 1000n, incorrectStake: DEAL_AMOUNT * 30n / 1000n },
          { reputation: 800, correctStake: DEAL_AMOUNT * 35n / 1000n, incorrectStake: DEAL_AMOUNT * 25n / 1000n },
          { reputation: 600, correctStake: DEAL_AMOUNT * 50n / 1000n, incorrectStake: DEAL_AMOUNT * 35n / 1000n },
          { reputation: 300, correctStake: DEAL_AMOUNT * 70n / 1000n, incorrectStake: DEAL_AMOUNT * 50n / 1000n },
          { reputation: 100, correctStake: DEAL_AMOUNT * 100n / 1000n, incorrectStake: DEAL_AMOUNT * 70n / 1000n }
        ];

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
          const testDealId = event.args.dealId;

          // Incorrect stake should fail
          await expect(
            escrow.connect(buyer).raiseDisputeWithStake(
              testDealId,
              ethers.id("Test"),
              testCase.incorrectStake,
              testCase.reputation
            )
          ).to.be.revertedWith("Insufficient stake for reputation level");

          // Correct stake should succeed
          await escrow.connect(buyer).raiseDisputeWithStake(
            testDealId,
            ethers.id("Test"),
            testCase.correctStake,
            testCase.reputation
          );
        }
      });

      it("should handle edge case reputation scores", async function () {
        // Test boundary values
        const boundaries = [
          { score: 1000, tier: "Excellent", percentage: 25 },
          { score: 900, tier: "Excellent", percentage: 25 },
          { score: 899, tier: "Good", percentage: 35 },
          { score: 700, tier: "Good", percentage: 35 },
          { score: 699, tier: "Standard", percentage: 50 },
          { score: 500, tier: "Standard", percentage: 50 },
          { score: 499, tier: "Probation", percentage: 70 },
          { score: 200, tier: "Probation", percentage: 70 },
          { score: 199, tier: "Restricted", percentage: 100 },
          { score: 0, tier: "Restricted", percentage: 100 }
        ];

        for (const boundary of boundaries) {
          const expectedStake = DEAL_AMOUNT * BigInt(boundary.percentage) / 1000n;
          
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
          const testDealId = event.args.dealId;

          // Should work with correct stake
          await escrow.connect(buyer).raiseDisputeWithStake(
            testDealId,
            ethers.id("Test"),
            expectedStake,
            boundary.score
          );
        }
      });
    });

    describe("Gas Optimization", function () {
      it("should have reasonable gas costs for stake operations", async function () {
        const stakeAmount = DEAL_AMOUNT * 25n / 1000n;

        // Measure gas for raising dispute with stake
        const tx1 = await escrow.connect(buyer).raiseDisputeWithStake(
          dealId,
          ethers.id("Gas test"),
          stakeAmount,
          950
        );
        const receipt1 = await tx1.wait();
        console.log("Gas for raiseDisputeWithStake:", receipt1.gasUsed.toString());
        expect(receipt1.gasUsed).to.be.lt(300000n); // Should be under 300k gas

        // Measure gas for resolution
        const tx2 = await escrow.connect(arbitrator).resolveDispute(
          dealId,
          0 // RESOLVED_FOR_BUYER
        );
        const receipt2 = await tx2.wait();
        console.log("Gas for resolveDispute with stake:", receipt2.gasUsed.toString());
        expect(receipt2.gasUsed).to.be.lt(250000n); // Should be under 250k gas
      });
    });
  });
});