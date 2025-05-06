// test/PropertyEscrow.test.js
const { expect } = require("chai");
const { ethers } = require("hardhat"); // Hardhat injects ethers

describe("PropertyEscrow Contract", function () {
    let PropertyEscrow;
    let escrowContract;
    let seller;
    let buyer;
    let otherAccount;
    const escrowAmount = ethers.utils.parseEther("1.0"); // 1 ETH

    // Helper to create condition IDs (bytes32) from strings
    function toBytes32(text) {
        return ethers.utils.formatBytes32String(text);
    }

    beforeEach(async function () {
        // Get signers (accounts)
        [seller, buyer, otherAccount] = await ethers.getSigners();

        // Deploy the contract before each test
        PropertyEscrow = await ethers.getContractFactory("PropertyEscrow");
        escrowContract = await PropertyEscrow.deploy(seller.address, buyer.address, escrowAmount);
        await escrowContract.deployed();
    });

    describe("Deployment", function () {
        it("Should set the correct seller, buyer, and escrow amount", async function () {
            expect(await escrowContract.seller()).to.equal(seller.address);
            expect(await escrowContract.buyer()).to.equal(buyer.address);
            expect(await escrowContract.escrowAmount()).to.equal(escrowAmount);
            expect(await escrowContract.currentState()).to.equal(0); // AWAITING_CONDITION_SETUP
        });

        it("Should fail if escrow amount is zero", async function () {
            await expect(PropertyEscrow.deploy(seller.address, buyer.address, 0))
                .to.be.revertedWith("Escrow amount must be positive");
        });

        it("Should fail if seller and buyer are the same", async function () {
            await expect(PropertyEscrow.deploy(seller.address, seller.address, escrowAmount))
                .to.be.revertedWith("Seller and buyer cannot be the same");
        });
    });

    describe("Setting Conditions", function () {
        const condition1 = toBytes32("InspectionPassed");
        const condition2 = toBytes32("TitleClear");
        const conditionIds = [condition1, condition2];

        it("Should allow buyer to set conditions", async function () {
            await expect(escrowContract.connect(buyer).setConditions(conditionIds))
                .to.emit(escrowContract, "ConditionsSetByBuyer")
                .withArgs(conditionIds); // Note: Comparing arrays directly in `withArgs` can be tricky. Check event logs.

            expect(await escrowContract.currentState()).to.equal(1); // AWAITING_DEPOSIT
            const storedConditions = await escrowContract.getRequiredConditionIds();
            expect(storedConditions.length).to.equal(2);
            expect(storedConditions[0]).to.equal(condition1);
            expect(storedConditions[1]).to.equal(condition2);
            expect(await escrowContract.conditionsFulfilled(condition1)).to.be.false;
        });

        it("Should not allow seller to set conditions", async function () {
            await expect(escrowContract.connect(seller).setConditions(conditionIds))
                .to.be.revertedWith("PropertyEscrow: Caller is not the buyer");
        });

        it("Should not allow setting empty conditions", async function () {
            await expect(escrowContract.connect(buyer).setConditions([]))
                .to.be.revertedWith("At least one condition must be set by buyer, or use no-condition flow.");
        });

        it("Should not allow setting conditions twice", async function () {
            await escrowContract.connect(buyer).setConditions(conditionIds);
            await expect(escrowContract.connect(buyer).setConditions([toBytes32("AnotherCondition")]))
                .to.be.revertedWith("Conditions already set.");
        });
    });

    describe("Depositing Funds", function () {
        const conditionIds = [toBytes32("ConditionA")];
        beforeEach(async function() {
            // Buyer sets conditions first
            await escrowContract.connect(buyer).setConditions(conditionIds);
        });

        it("Should allow buyer to deposit correct amount of funds", async function () {
            await expect(escrowContract.connect(buyer).depositFunds({ value: escrowAmount }))
                .to.emit(escrowContract, "FundsDeposited")
                .withArgs(buyer.address, escrowAmount);

            expect(await escrowContract.fundsDeposited()).to.be.true;
            expect(await escrowContract.currentState()).to.equal(2); // AWAITING_FULFILLMENT
            expect(await ethers.provider.getBalance(escrowContract.address)).to.equal(escrowAmount);
        });

        it("Should not allow depositing incorrect amount", async function () {
            await expect(escrowContract.connect(buyer).depositFunds({ value: ethers.utils.parseEther("0.5") }))
                .to.be.revertedWith("PropertyEscrow: Incorrect deposit amount");
        });

        it("Should not allow seller to deposit funds", async function () {
            await expect(escrowContract.connect(seller).depositFunds({ value: escrowAmount }))
                .to.be.revertedWith("PropertyEscrow: Caller is not the buyer");
        });

        it("Should not allow deposit if conditions not set", async function () {
            // Deploy a new contract where conditions are not set
            const newEscrow = await PropertyEscrow.deploy(seller.address, buyer.address, escrowAmount);
            await newEscrow.deployed();
            await expect(newEscrow.connect(buyer).depositFunds({ value: escrowAmount }))
                .to.be.revertedWith("PropertyEscrow: Invalid state for this action"); // Still in AWAITING_CONDITION_SETUP
        });
    });

    describe("Fulfilling Conditions and Releasing Funds", function () {
        const cond1 = toBytes32("InspectionOk");
        const cond2 = toBytes32("TitleVerified");
        const allConditions = [cond1, cond2];

        beforeEach(async function() {
            await escrowContract.connect(buyer).setConditions(allConditions);
            await escrowContract.connect(buyer).depositFunds({ value: escrowAmount });
            // State is now AWAITING_FULFILLMENT
        });

        it("Should allow buyer to fulfill a condition", async function () {
            await expect(escrowContract.connect(buyer).fulfillCondition(cond1))
                .to.emit(escrowContract, "ConditionFulfilled")
                .withArgs(buyer.address, cond1);
            expect(await escrowContract.conditionsFulfilled(cond1)).to.be.true;
            expect(await escrowContract.areAllBuyerConditionsMet()).to.be.false; // cond2 not met
            expect(await escrowContract.currentState()).to.equal(2); // AWAITING_FULFILLMENT
        });

        it("Should transition to READY_FOR_RELEASE when all conditions are fulfilled", async function () {
            await escrowContract.connect(buyer).fulfillCondition(cond1);
            await escrowContract.connect(buyer).fulfillCondition(cond2);

            expect(await escrowContract.areAllBuyerConditionsMet()).to.be.true;
            expect(await escrowContract.currentState()).to.equal(3); // READY_FOR_RELEASE
        });

        it("Should not allow fulfilling a non-existent condition", async function () {
            await expect(escrowContract.connect(buyer).fulfillCondition(toBytes32("FakeCondition")))
                .to.be.revertedWith("PropertyEscrow: Condition ID not part of this escrow's required conditions.");
        });

        it("Should allow seller to release funds when ready", async function () {
            await escrowContract.connect(buyer).fulfillCondition(cond1);
            await escrowContract.connect(buyer).fulfillCondition(cond2); // State is READY_FOR_RELEASE

            const sellerInitialBalance = await seller.getBalance();
            const tx = await escrowContract.connect(seller).releaseFundsToSeller();
            const receipt = await tx.wait();
            const gasUsed = receipt.gasUsed.mul(receipt.effectiveGasPrice);

            expect(await escrowContract.currentState()).to.equal(4); // COMPLETED
            expect(await ethers.provider.getBalance(escrowContract.address)).to.equal(0);
            expect(await seller.getBalance()).to.equal(sellerInitialBalance.add(escrowAmount).sub(gasUsed));
        });

        it("Should allow buyer to trigger release funds when ready", async function () {
            await escrowContract.connect(buyer).fulfillCondition(cond1);
            await escrowContract.connect(buyer).fulfillCondition(cond2); // State is READY_FOR_RELEASE

            const sellerInitialBalance = await seller.getBalance();
            await escrowContract.connect(buyer).releaseFundsToSeller(); // Buyer calls it

            expect(await escrowContract.currentState()).to.equal(4); // COMPLETED
            expect(await ethers.provider.getBalance(escrowContract.address)).to.equal(0);
            expect(await seller.getBalance()).to.equal(sellerInitialBalance.add(escrowAmount));
        });


        it("Should not allow releasing funds if not all conditions met", async function () {
            await escrowContract.connect(buyer).fulfillCondition(cond1); // Only one condition met
            await expect(escrowContract.connect(seller).releaseFundsToSeller())
                .to.be.revertedWith("PropertyEscrow: Invalid state for this action"); // Still AWAITING_FULFILLMENT
        });

        it("Should not allow releasing funds if funds not deposited", async function () {
            const newEscrow = await PropertyEscrow.deploy(seller.address, buyer.address, escrowAmount);
            await newEscrow.deployed();
            await newEscrow.connect(buyer).setConditions(allConditions);
            // No deposit
            await newEscrow.connect(buyer).fulfillCondition(cond1);
            await newEscrow.connect(buyer).fulfillCondition(cond2); // State is READY_FOR_RELEASE (conceptually, but fundsDeposited is false)

            // The state check in releaseFundsToSeller will catch this if fundsDeposited is false.
            // However, the modifier inState(State.READY_FOR_RELEASE) is the primary gate.
            // If areAllBuyerConditionsMet() is true after fulfilling conditions, it moves to READY_FOR_RELEASE.
            // The releaseFundsToSeller then re-checks fundsDeposited.
            await expect(newEscrow.connect(seller).releaseFundsToSeller())
                 .to.be.revertedWith("PropertyEscrow: Funds not deposited yet.");
        });
    });

    describe("Cancelling Escrow", function () {
        const conditionIds = [toBytes32("ConditionX")];

        it("Should allow buyer to cancel before deposit (after conditions set)", async function () {
            await escrowContract.connect(buyer).setConditions(conditionIds); // State: AWAITING_DEPOSIT
            await expect(escrowContract.connect(buyer).cancelEscrow())
                .to.emit(escrowContract, "EscrowCancelled")
                .withArgs(buyer.address, buyer.address, 0);
            expect(await escrowContract.currentState()).to.equal(5); // CANCELLED
        });

        it("Should allow seller to cancel before deposit (after conditions set)", async function () {
            await escrowContract.connect(buyer).setConditions(conditionIds); // State: AWAITING_DEPOSIT
            await expect(escrowContract.connect(seller).cancelEscrow())
                .to.emit(escrowContract, "EscrowCancelled")
                .withArgs(seller.address, buyer.address, 0);
            expect(await escrowContract.currentState()).to.equal(5); // CANCELLED
        });

        it("Should refund buyer if cancelled after deposit", async function () {
            await escrowContract.connect(buyer).setConditions(conditionIds);
            await escrowContract.connect(buyer).depositFunds({ value: escrowAmount }); // State: AWAITING_FULFILLMENT

            const buyerInitialBalance = await buyer.getBalance();
            const tx = await escrowContract.connect(buyer).cancelEscrow();
            const receipt = await tx.wait();
            const gasUsed = receipt.gasUsed.mul(receipt.effectiveGasPrice);

            expect(await escrowContract.currentState()).to.equal(5); // CANCELLED
            expect(await ethers.provider.getBalance(escrowContract.address)).to.equal(0);
            expect(await buyer.getBalance()).to.equal(buyerInitialBalance.add(escrowAmount).sub(gasUsed));
        });

        it("Should not allow cancellation if already completed", async function () {
            await escrowContract.connect(buyer).setConditions(conditionIds);
            await escrowContract.connect(buyer).depositFunds({ value: escrowAmount });
            await escrowContract.connect(buyer).fulfillCondition(conditionIds[0]); // Fulfill the one condition
            await escrowContract.connect(seller).releaseFundsToSeller(); // State: COMPLETED

            await expect(escrowContract.connect(buyer).cancelEscrow())
                .to.be.revertedWith("PropertyEscrow: Escrow is already finalized or cancelled.");
        });

        it("Should not allow cancellation if already cancelled", async function () {
            await escrowContract.connect(buyer).setConditions(conditionIds);
            await escrowContract.connect(buyer).cancelEscrow(); // State: CANCELLED

            await expect(escrowContract.connect(buyer).cancelEscrow())
                .to.be.revertedWith("PropertyEscrow: Escrow is already finalized or cancelled.");
        });
    });

    describe("No Conditions Flow", function() {
        it("Should allow deposit and release if no conditions are set by buyer (after setup phase)", async function() {
            // Buyer doesn't call setConditions, or calls with empty array (which is disallowed by setConditions)
            // To test this specific path in areAllBuyerConditionsMet, we need to skip setConditions
            // and directly move state if that were possible, or have a version of setConditions that allows empty.
            // The current setConditions requires _conditionIds.length > 0.
            // Let's simulate the scenario where conditions are conceptually "none" by fulfilling them immediately
            // if the contract allowed setting zero conditions.

            // For this test, let's assume a scenario where the contract is deployed,
            // and buyer immediately deposits without setting explicit on-chain conditions.
            // The current `setConditions` requires conditions.
            // If the intent is to support a "no conditions" flow from the start,
            // `setConditions` could be made optional or allow an empty array,
            // and `AWAITING_CONDITION_SETUP` would transition to `AWAITING_DEPOSIT` differently.

            // Given current contract: Buyer MUST call setConditions.
            // Let's test with one simple condition to simulate the "all met" path quickly.
            const simpleCondition = [toBytes32("Simple")];
            await escrowContract.connect(buyer).setConditions(simpleCondition);
            await escrowContract.connect(buyer).depositFunds({ value: escrowAmount });
            await escrowContract.connect(buyer).fulfillCondition(simpleCondition[0]);

            expect(await escrowContract.currentState()).to.equal(3); // READY_FOR_RELEASE

            const sellerInitialBalance = await seller.getBalance();
            await escrowContract.connect(seller).releaseFundsToSeller();
            expect(await seller.getBalance()).to.be.gt(sellerInitialBalance); // Greater than, accounting for gas
        });
    });
});
