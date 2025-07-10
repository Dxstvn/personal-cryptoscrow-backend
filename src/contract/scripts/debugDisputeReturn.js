const { ethers } = require("hardhat");

async function main() {
    console.log("Debugging returnFundsAfterDisputeTimeout issue...\n");
    
    const [deployer, buyer, seller] = await ethers.getSigners();
    
    // Deploy mock WETH and Uniswap router
    const MockWETH = await ethers.getContractFactory("MockWETH");
    const weth = await MockWETH.deploy();
    await weth.waitForDeployment();
    
    const MockRouter = await ethers.getContractFactory("MockUniswapV2Router");
    const router = await MockRouter.deploy(await weth.getAddress());
    await router.waitForDeployment();
    
    // Deploy the Disputes contract
    const DisputesContract = await ethers.getContractFactory("UniversalEscrowServiceV3Disputes");
    const escrow = await DisputesContract.deploy(
        deployer.address, // service wallet
        await weth.getAddress(),
        await router.getAddress()
    );
    await escrow.waitForDeployment();
    
    const escrowAddress = await escrow.getAddress();
    console.log("Escrow deployed to:", escrowAddress);
    
    // Create a simple same-chain escrow
    const depositAmount = ethers.parseEther("1.0");
    const serviceFee = ethers.parseEther("0.01");
    const totalAmount = depositAmount + serviceFee;
    
    console.log("\nCreating escrow deposit...");
    const tx = await escrow.connect(buyer).createEscrow(
        seller.address,
        depositAmount,
        ethers.ZeroAddress, // ETH
        31337, // Same chain (Hardhat network)
        seller.address, // Same seller address
        ethers.ZeroAddress, // ETH on target chain
        "Test escrow",
        { value: totalAmount }
    );
    
    const receipt = await tx.wait();
    const escrowId = receipt.logs[0].args[0];
    console.log("Escrow created with ID:", escrowId);
    
    // Mark condition as met
    console.log("\nMarking condition as met...");
    await escrow.connect(seller).markConditionMet(escrowId);
    
    // Raise a dispute
    console.log("\nRaising dispute...");
    await escrow.connect(buyer).raiseDispute(escrowId, "Test dispute");
    
    // Fast forward time past dispute resolution period
    console.log("\nFast forwarding time past dispute resolution period...");
    await ethers.provider.send("evm_increaseTime", [8 * 24 * 60 * 60]); // 8 days
    await ethers.provider.send("evm_mine");
    
    // Try to return funds
    console.log("\nAttempting to return funds after dispute timeout...");
    try {
        const returnTx = await escrow.connect(buyer).returnFundsAfterDisputeTimeout(escrowId);
        const returnReceipt = await returnTx.wait();
        console.log("✅ Funds returned successfully!");
        console.log("Gas used:", returnReceipt.gasUsed.toString());
    } catch (error) {
        console.error("❌ Error returning funds:");
        console.error("Error message:", error.message);
        
        // Try to decode the error
        if (error.data) {
            console.error("\nError data:", error.data);
            try {
                const decodedError = escrow.interface.parseError(error.data);
                console.error("Decoded error:", decodedError);
            } catch (e) {
                console.error("Could not decode error");
            }
        }
        
        // Print the stack trace
        console.error("\nStack trace:");
        console.error(error.stack);
    }
    
    // Check final state
    console.log("\nChecking final escrow state...");
    const escrowData = await escrow.getEscrowDetails(escrowId);
    console.log("Released:", escrowData.released);
    console.log("Buyer balance:", ethers.formatEther(await ethers.provider.getBalance(buyer.address)));
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });