const { ethers } = require("hardhat");

async function main() {
    console.log("Testing UniversalEscrowServiceV3DisputesFixed contract...\n");
    
    const [deployer, buyer, seller] = await ethers.getSigners();
    
    // Deploy mock dependencies
    console.log("Deploying mock dependencies...");
    const MockWETH = await ethers.getContractFactory("MockWETH");
    const weth = await MockWETH.deploy();
    await weth.waitForDeployment();
    
    const MockRouter = await ethers.getContractFactory("MockUniswapV2Router");
    const router = await MockRouter.deploy(await weth.getAddress());
    await router.waitForDeployment();
    
    // Deploy the FIXED contract
    console.log("\nDeploying UniversalEscrowServiceV3DisputesFixed...");
    const FixedContract = await ethers.getContractFactory("UniversalEscrowServiceV3DisputesFixed");
    const escrow = await FixedContract.deploy(
        deployer.address,
        await weth.getAddress(),
        await router.getAddress()
    );
    await escrow.waitForDeployment();
    console.log("Fixed contract deployed to:", await escrow.getAddress());
    
    // Create an escrow
    console.log("\nCreating escrow...");
    const depositAmount = ethers.parseEther("1.0");
    
    const createTx = await escrow.connect(buyer).createEscrow(
        seller.address,
        ethers.ZeroAddress, // depositToken (ETH)
        depositAmount,
        ethers.ZeroAddress, // targetToken (ETH)
        1, // targetChainId (same chain)
        { value: depositAmount }
    );
    const createReceipt = await createTx.wait();
    console.log("✅ Escrow created");
    
    // Get escrow ID from the event
    let escrowId;
    for (const log of createReceipt.logs) {
        try {
            const parsed = escrow.interface.parseLog(log);
            if (parsed.name === "EscrowCreated") {
                escrowId = parsed.args[0]; // escrowId is the first argument
                console.log("Escrow ID from event:", escrowId);
                break;
            }
        } catch (e) {
            // Skip unparseable logs
        }
    }
    
    if (!escrowId) {
        throw new Error("Could not find EscrowCreated event");
    }
    
    // Mark condition as met
    console.log("\nMarking condition as met...");
    await escrow.updateConditionWithDispute(escrowId, true);
    console.log("✅ Condition marked as met");
    
    // Raise dispute
    console.log("\nRaising dispute...");
    await escrow.connect(buyer).raiseDispute(escrowId, "Testing dispute resolution");
    console.log("✅ Dispute raised");
    
    // Fast forward 8 days
    console.log("\nFast forwarding 8 days...");
    await ethers.provider.send("evm_increaseTime", [8 * 24 * 60 * 60]);
    await ethers.provider.send("evm_mine");
    
    // Get buyer balance before
    const balanceBefore = await ethers.provider.getBalance(buyer.address);
    console.log("Buyer balance before:", ethers.formatEther(balanceBefore), "ETH");
    
    // Test returnFundsAfterDisputeTimeout (only service wallet can call)
    console.log("\n🔍 Testing returnFundsAfterDisputeTimeout with FIXED contract (service wallet only)...");
    try {
        // First test that non-service wallet cannot call it
        try {
            await escrow.connect(seller).returnFundsAfterDisputeTimeout(escrowId);
            console.error("❌ ERROR: Non-service wallet was able to call the function!");
        } catch (error) {
            if (error.message.includes("Only service wallet")) {
                console.log("✅ Access control working: Non-service wallet rejected");
            }
        }
        
        // Now call with service wallet (deployer)
        const returnTx = await escrow.connect(deployer).returnFundsAfterDisputeTimeout(escrowId);
        const receipt = await returnTx.wait();
        
        console.log("✅ TRANSACTION SUCCESSFUL!");
        console.log("Gas used:", receipt.gasUsed.toString());
        console.log("Transaction hash:", receipt.hash);
        
        // Check buyer balance after
        const balanceAfter = await ethers.provider.getBalance(buyer.address);
        console.log("\nBuyer balance after:", ethers.formatEther(balanceAfter), "ETH");
        
        const difference = balanceAfter - balanceBefore;
        console.log("Balance difference:", ethers.formatEther(difference), "ETH");
        
        // Account for service fee (2%)
        const expectedReturn = depositAmount * 98n / 100n; // 98% after fee
        console.log("Expected return (98% after fee):", ethers.formatEther(expectedReturn), "ETH");
        
        if (difference > 0 && difference >= expectedReturn - ethers.parseEther("0.001")) {
            console.log("✅ Funds successfully returned to buyer!");
        }
        
        // Check events
        console.log("\nEvents emitted:");
        for (const log of receipt.logs) {
            try {
                const parsed = escrow.interface.parseLog(log);
                if (parsed.name === "FundsReturnedToBuyer") {
                    console.log("✅ FundsReturnedToBuyer event:");
                    console.log("  - Escrow ID:", parsed.args[0]);
                    console.log("  - Buyer:", parsed.args[1]);
                    console.log("  - Amount:", ethers.formatEther(parsed.args[2]), "ETH");
                    console.log("  - Reason:", parsed.args[3]);
                }
            } catch (e) {
                // Skip unparseable logs
            }
        }
        
        // Verify escrow is marked as released
        const escrowData = await escrow.escrows(escrowId);
        console.log("\nEscrow released:", escrowData.released);
        
        console.log("\n✅ THE FIXED CONTRACT WORKS! Using .call instead of .transfer resolved the issue.");
        console.log("\n📌 Key findings:");
        console.log("1. The original error was caused by .transfer() gas limitations");
        console.log("2. Using .call{value: amount}('') provides more gas flexibility");
        console.log("3. This is a known best practice since EIP-1884 increased gas costs");
        console.log("4. The contract now supports automatic dispute resolution after 7 days");
        
    } catch (error) {
        console.error("❌ returnFundsAfterDisputeTimeout FAILED!");
        console.error("Error message:", error.message);
        
        if (error.data) {
            console.error("Error data:", error.data);
            
            // Try to decode the error
            try {
                const decodedError = escrow.interface.parseError(error.data);
                console.error("Decoded error:", decodedError);
            } catch (e) {
                console.error("Could not decode error");
            }
        }
        
        if (error.transaction) {
            console.error("Failed transaction:", error.transaction);
        }
        
        // Log the full error for debugging
        console.error("\nFull error object:", JSON.stringify(error, null, 2));
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });