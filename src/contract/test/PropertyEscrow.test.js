// test/PropertyEscrow.test.js
import { expect } from "chai";
import { ethers, network } from "hardhat"; // Hardhat injects ethers

describe("PropertyEscrow Contract V2 (with Review/Dispute)", function () {
    let PropertyEscrow;
    let escrowContract;
    let seller;
    let buyer;
    let otherAccount;
    const escrowAmount = ethers.utils.parseEther("1.0"); // 1 ETH
    const fortyEightHours = 48 * 60 * 60;
    const sevenDays = 7 * 24 * 60 * 60;


    // Helper to create condition IDs (bytes32) from strings
    function toBytes32(text) {
        return ethers.utils.formatBytes32String(text);
    }

    async function advanceTime(time) {
        await network.provider.send("evm_increaseTime", [time]);
        await network.provider.send("evm_mine");
    }
     async function setNextBlockTimestamp(timestamp) {
        await network.provider.send("evm_setNextBlockTimestamp", [timestamp]);
        await network.provider.send("evm_mine");
    }


    beforeEach(async function () {
        [seller, buyer, otherAccount] = await ethers.getSigners();
        PropertyEscrow = await ethers.getContractFactory("PropertyEscrow");
        escrowContract = await PropertyEscrow.deploy(seller.address, buyer.address, escrowAmount);
        await escrowContract.deployed();
    });

    // --- Previous tests for Deployment, Setting Conditions, Depositing Funds can be reused ---
    // (Assuming they are largely compatible or with minor tweaks for state names if needed)
    // For brevity, I'll focus on new/modified functionality tests.

    describe("Deployment", function () {
        it("Should set the correct seller, buyer, and escrow amount", async function () {
            expect(await escrowContract.seller()).to.equal(seller.address);
            expect(await escrowContract.buyer()).to.equal(buyer.address);
            expect(await escrowContract.escrowAmount()).to.equal(escrowAmount);
            expect(await escrowContract.currentState()).to.equal(0); // AWAITING_CONDITION_SETUP
        });
    });

    describe("Setting Conditions", function () {
        const condition1 = toBytes32("InspectionPassed");
        const conditionIds = [condition1];

        it("Should allow buyer to set conditions", async function () {
            await escrowContract.connect(buyer).setConditions(conditionIds);
            expect(await escrowContract.currentState()).to.equal(1); // AWAITING_DEPOSIT
        });
    });

    describe("Depositing Funds", function () {
        const conditionIds = [toBytes32("ConditionA")];
        beforeEach(async function() {
            await escrowContract.connect(buyer).setConditions(conditionIds);
        });

        it("Should allow buyer to deposit correct amount of funds", async function () {
            await escrowContract.connect(buyer).depositFunds({ value: escrowAmount });
            expect(await escrowContract.currentState()).to.equal(2); // AWAITING_FULFILLMENT
        });
    });


    describe("Fulfilling Conditions and Entering Final Approval", function () {
        const cond1 = toBytes32("InspectionOk");
        const allConditions = [cond1];

        beforeEach(async function() {
            await escrowContract.connect(buyer).setConditions(allConditions);
            await escrowContract.connect(buyer).depositFunds({ value: escrowAmount });
        });

        it("Should transition to READY_FOR_FINAL_APPROVAL when all conditions are fulfilled", async function () {
            await escrowContract.connect(buyer).fulfillCondition(cond1);
            expect(await escrowContract.areAllBuyerConditionsMet()).to.be.true;
            expect(await escrowContract.currentState()).to.equal(3); // READY_FOR_FINAL_APPROVAL
        });

        it("Should allow starting final approval period", async function() {
            await escrowContract.connect(buyer).fulfillCondition(cond1); // State: READY_FOR_FINAL_APPROVAL
            const blockNumBefore = await ethers.provider.getBlockNumber();
            const blockBefore = await ethers.provider.getBlock(blockNumBefore);
            const timestampBefore = blockBefore.timestamp;

            await expect(escrowContract.connect(buyer).startFinalApprovalPeriod())
                .to.emit(escrowContract, "FinalApprovalPeriodStarted");

            expect(await escrowContract.currentState()).to.equal(4); // IN_FINAL_APPROVAL
            expect(await escrowContract.finalApprovalDeadline()).to.equal(timestampBefore + 1 + fortyEightHours); // +1 for next block
        });
    });

    describe("Final Approval Period and Dispute Mechanism", function () {
        const cond1 = toBytes32("Cond1");
        const cond2 = toBytes32("Cond2");
        const allConditions = [cond1, cond2];

        beforeEach(async function() {
            await escrowContract.connect(buyer).setConditions(allConditions);
            await escrowContract.connect(buyer).depositFunds({ value: escrowAmount });
            await escrowContract.connect(buyer).fulfillCondition(cond1);
            await escrowContract.connect(buyer).fulfillCondition(cond2); // All conditions met
            await escrowContract.connect(seller).startFinalApprovalPeriod(); // Enters IN_FINAL_APPROVAL
        });

        it("Should allow buyer to withdraw condition approval, entering IN_DISPUTE", async function() {
            const blockNumBefore = await ethers.provider.getBlockNumber();
            const blockBefore = await ethers.provider.getBlock(blockNumBefore);
            const timestampBefore = blockBefore.timestamp;

            await expect(escrowContract.connect(buyer).buyerWithdrawConditionApproval(cond1))
                .to.emit(escrowContract, "DisputeRaised");

            expect(await escrowContract.currentState()).to.equal(5); // IN_DISPUTE
            expect(await escrowContract.conditionsFulfilled(cond1)).to.be.false;
            expect(await escrowContract.disputeResolutionDeadline()).to.equal(timestampBefore + 1 + sevenDays);
        });

        it("Should not allow withdrawing approval for a non-fulfilled or non-existent condition", async function() {
            await escrowContract.connect(buyer).buyerWithdrawConditionApproval(cond1); // cond1 is now false
            await expect(escrowContract.connect(buyer).buyerWithdrawConditionApproval(cond1))
                .to.be.revertedWith("Condition not currently marked as fulfilled.");
            await expect(escrowContract.connect(buyer).buyerWithdrawConditionApproval(toBytes32("NonExistent")))
                .to.be.revertedWith("Condition ID not part of this escrow.");
        });

        it("Should allow buyer to re-fulfill a condition during dispute, potentially resolving it", async function() {
            await escrowContract.connect(buyer).buyerWithdrawConditionApproval(cond1); // Now IN_DISPUTE
            expect(await escrowContract.currentState()).to.equal(5); // IN_DISPUTE

            await escrowContract.connect(buyer).buyerReFulfillCondition(cond1);
            expect(await escrowContract.conditionsFulfilled(cond1)).to.be.true;
            // Since cond2 was still true, all conditions are met again
            expect(await escrowContract.areAllBuyerConditionsMet()).to.be.true;
            expect(await escrowContract.currentState()).to.equal(3); // READY_FOR_FINAL_APPROVAL
        });


        it("Should allow release by mutual confirmation during IN_FINAL_APPROVAL", async function() {
            await escrowContract.connect(buyer).confirmAndReleaseFunds();
            expect(await escrowContract.hasApprovedFinalRelease(buyer.address)).to.be.true;
            expect(await escrowContract.currentState()).to.equal(4); // Still IN_FINAL_APPROVAL

            const sellerInitialBalance = await seller.getBalance();
            await expect(escrowContract.connect(seller).confirmAndReleaseFunds())
                .to.emit(escrowContract, "FundsReleasedToSeller");

            expect(await escrowContract.currentState()).to.equal(6); // COMPLETED
            expect(await ethers.provider.getBalance(escrowContract.address)).to.equal(0);
            expect(await seller.getBalance()).to.be.gt(sellerInitialBalance);
        });

        it("Should allow release after final approval deadline if no dispute", async function() {
            const deadline = (await escrowContract.finalApprovalDeadline()).toNumber();
            await setNextBlockTimestamp(deadline + 1); // Advance time past deadline

            const sellerInitialBalance = await seller.getBalance();
            // Any party (or a third party if function was public) could call this
            await expect(escrowContract.connect(otherAccount).confirmAndReleaseFunds()) // Using otherAccount to show anyone can trigger if conditions met
                 .to.emit(escrowContract, "FundsReleasedToSeller");

            expect(await escrowContract.currentState()).to.equal(6); // COMPLETED
            expect(await ethers.provider.getBalance(escrowContract.address)).to.equal(0);
            expect(await seller.getBalance()).to.be.gt(sellerInitialBalance);
        });


        it("Should allow release by mutual confirmation during IN_DISPUTE if all conditions become met again", async function() {
            await escrowContract.connect(buyer).buyerWithdrawConditionApproval(cond1); // Enters IN_DISPUTE
            expect(await escrowContract.currentState()).to.equal(5); // IN_DISPUTE

            // Buyer re-fulfills the condition
            await escrowContract.connect(buyer).buyerReFulfillCondition(cond1);
            expect(await escrowContract.currentState()).to.equal(3); // READY_FOR_FINAL_APPROVAL

            // Restart final approval
            await escrowContract.connect(buyer).startFinalApprovalPeriod();
            expect(await escrowContract.currentState()).to.equal(4); // IN_FINAL_APPROVAL

            // Now confirm release
            await escrowContract.connect(buyer).confirmAndReleaseFunds();
            const sellerInitialBalance = await seller.getBalance();
            await expect(escrowContract.connect(seller).confirmAndReleaseFunds())
                .to.emit(escrowContract, "FundsReleasedToSeller");

            expect(await escrowContract.currentState()).to.equal(6); // COMPLETED
            expect(await seller.getBalance()).to.be.gt(sellerInitialBalance);
        });


        it("Should allow buyer to cancel and get refund if dispute resolution deadline passes", async function() {
            await escrowContract.connect(buyer).buyerWithdrawConditionApproval(cond1); // IN_DISPUTE
            const disputeDeadline = (await escrowContract.disputeResolutionDeadline()).toNumber();
            await setNextBlockTimestamp(disputeDeadline + 1); // Advance time

            const buyerInitialBalance = await buyer.getBalance();
            const tx = await escrowContract.connect(buyer).cancelEscrow();
            const receipt = await tx.wait();
            const gasUsed = receipt.gasUsed.mul(receipt.effectiveGasPrice);

            expect(await escrowContract.currentState()).to.equal(7); // CANCELLED
            expect(await ethers.provider.getBalance(escrowContract.address)).to.equal(0);
            expect(await buyer.getBalance()).to.equal(buyerInitialBalance.add(escrowAmount).sub(gasUsed));
        });

        it("Should NOT release funds if dispute raised and deadline not passed, nor mutual agreement", async function() {
            await escrowContract.connect(buyer).buyerWithdrawConditionApproval(cond1); // IN_DISPUTE
            // Time has not passed
            await expect(escrowContract.connect(seller).confirmAndReleaseFunds())
                .to.be.revertedWith("Not all conditions are met."); // Because cond1 is false
        });

         it("Should NOT allow seller to cancel and get refund if dispute resolution deadline passes", async function() {
            await escrowContract.connect(buyer).buyerWithdrawConditionApproval(cond1); // IN_DISPUTE
            const disputeDeadline = (await escrowContract.disputeResolutionDeadline()).toNumber();
            await setNextBlockTimestamp(disputeDeadline + 1); // Advance time

            await expect(escrowContract.connect(seller).cancelEscrow())
                .to.be.revertedWith("Cannot cancel in current state or conditions not met for cancellation.");
        });
    });
});
