const { ethers } = require("hardhat");

async function main() {
    console.log("\n🔍 Debugging Swap Issue\n");
    
    // Deploy minimal setup
    const [deployer, buyer, seller] = await ethers.getSigners();
    
    // Deploy tokens
    const MockERC20 = await ethers.getContractFactory("contracts/mocks/MockERC20.sol:MockERC20");
    const weth = await MockERC20.deploy("Wrapped ETH", "WETH", 18);
    await weth.waitForDeployment();
    const usdc = await MockERC20.deploy("USD Coin", "USDC", 6);
    await usdc.waitForDeployment();
    
    // Deploy router
    const MockRouter = await ethers.getContractFactory("contracts/mocks/MockUniswapV2Router.sol:MockUniswapV2Router");
    const uniswapRouter = await MockRouter.deploy(await weth.getAddress());
    await uniswapRouter.waitForDeployment();
    
    // Add liquidity
    const routerAddress = await uniswapRouter.getAddress();
    await weth.mint(routerAddress, ethers.parseEther("1000"));
    await usdc.mint(routerAddress, ethers.parseUnits("1000000", 6));
    await buyer.sendTransaction({
        to: routerAddress,
        value: ethers.parseEther("100")
    });
    
    // Deploy escrow
    const Escrow = await ethers.getContractFactory("UniversalEscrowServiceV3Disputes");
    const escrow = await Escrow.deploy(
        deployer.address,
        await weth.getAddress(),
        await uniswapRouter.getAddress()
    );
    await escrow.waitForDeployment();
    console.log("Escrow deployed at:", await escrow.getAddress());
    
    // Create an ETH -> USDC escrow
    console.log("\nCreating ETH -> USDC escrow...");
    const amount = ethers.parseEther("1");
    
    const tx1 = await escrow.connect(buyer).createEscrow(
        seller.address,
        ethers.ZeroAddress, // ETH
        amount,
        await usdc.getAddress(), // USDC
        31337, // same chain
        { value: amount }
    );
    const receipt1 = await tx1.wait();
    
    // Get escrowId
    let escrowId;
    for (const log of receipt1.logs) {
        try {
            const parsed = escrow.interface.parseLog(log);
            if (parsed && parsed.name === "EscrowCreated") {
                escrowId = parsed.args[0];
                console.log("Escrow created with ID:", escrowId);
                break;
            }
        } catch (e) {}
    }
    
    // Check escrow data
    const escrowData = await escrow.escrows(escrowId);
    console.log("\nEscrow data:");
    console.log("- Deposit token:", escrowData.depositToken);
    console.log("- Target token:", escrowData.targetToken);
    console.log("- Target chain:", escrowData.targetChainId.toString());
    console.log("- Current chain:", 31337);
    console.log("- Same chain?", escrowData.targetChainId.toString() === "31337");
    
    // Update condition
    console.log("\nUpdating condition...");
    await escrow.connect(deployer).updateConditionWithDispute(escrowId, true);
    
    // Try to release immediately (should fail due to dispute window)
    console.log("\nTrying to release (should fail)...");
    try {
        await escrow.releaseEscrowWithDisputeCheck(escrowId);
        console.log("❌ Should have failed!");
    } catch (error) {
        console.log("✅ Correctly failed:", error.reason || error.message.slice(0, 100));
    }
    
    // Now let's check what happens when we call the contract directly
    console.log("\nChecking contract functions...");
    
    // Test getStargateQuote functions
    try {
        console.log("\nTesting getStargateQuote(uint256,uint256)...");
        const [fee1, min1] = await escrow.getStargateQuote(421614, ethers.parseEther("1"));
        console.log("✅ Works - Fee:", ethers.formatEther(fee1), "Min:", ethers.formatEther(min1));
    } catch (error) {
        console.log("❌ Error:", error.message.slice(0, 100));
    }
    
    try {
        console.log("\nTesting getStargateQuote(uint256,address,uint256)...");
        const [fee2, min2] = await escrow["getStargateQuote(uint256,address,uint256)"](
            421614, 
            ethers.ZeroAddress, 
            ethers.parseEther("1")
        );
        console.log("✅ Works - Fee:", ethers.formatEther(fee2), "Min:", ethers.formatEther(min2));
    } catch (error) {
        console.log("❌ Error:", error.message.slice(0, 100));
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });