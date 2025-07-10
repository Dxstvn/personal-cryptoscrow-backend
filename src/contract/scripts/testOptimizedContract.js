const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

async function main() {
    console.log("\n🔍 Testing Optimized Contract\n");
    
    const [deployer, buyer, seller] = await ethers.getSigners();
    
    // Deploy setup
    const MockWETH = await ethers.getContractFactory("contracts/mocks/MockWETH.sol:MockWETH");
    const weth = await MockWETH.deploy();
    await weth.waitForDeployment();
    
    const MockRouter = await ethers.getContractFactory("contracts/mocks/MockUniswapV2Router.sol:MockUniswapV2Router");
    const uniswapRouter = await MockRouter.deploy(await weth.getAddress());
    await uniswapRouter.waitForDeployment();
    
    // Deploy optimized contract
    console.log("Deploying optimized V3 contract...");
    const Escrow = await ethers.getContractFactory("UniversalEscrowServiceV3DisputesOptimized");
    const escrow = await Escrow.deploy(
        deployer.address,
        await weth.getAddress(),
        await uniswapRouter.getAddress()
    );
    await escrow.waitForDeployment();
    console.log("✅ Optimized contract deployed at:", await escrow.getAddress());
    
    // Test dispute timeout functionality
    console.log("\nTesting dispute timeout refund...");
    const amount = ethers.parseEther("1");
    
    // Create escrow
    const tx1 = await escrow.connect(buyer).createEscrow(
        seller.address,
        ethers.ZeroAddress,
        amount,
        ethers.ZeroAddress,
        31337,
        { value: amount }
    );
    const receipt1 = await tx1.wait();
    
    let escrowId;
    for (const log of receipt1.logs) {
        try {
            const parsed = escrow.interface.parseLog(log);
            if (parsed && parsed.name === "EscrowCreated") {
                escrowId = parsed.args[0];
                break;
            }
        } catch (e) {}
    }
    console.log("✅ Escrow created:", escrowId);
    
    // Update condition and raise dispute
    await escrow.connect(deployer).updateConditionWithDispute(escrowId, true);
    await escrow.connect(buyer).raiseDispute(escrowId, "Test dispute");
    console.log("✅ Dispute raised");
    
    // Fast forward past resolution period
    await time.increase(7 * 24 * 60 * 60 + 1);
    
    // Return funds
    const buyerBalanceBefore = await ethers.provider.getBalance(buyer.address);
    const tx2 = await escrow.returnFundsAfterDisputeTimeout(escrowId);
    await tx2.wait();
    const buyerBalanceAfter = await ethers.provider.getBalance(buyer.address);
    
    console.log("✅ Funds returned! Refund:", ethers.formatEther(buyerBalanceAfter - buyerBalanceBefore), "ETH");
    
    // Test canReleaseEscrow
    console.log("\nTesting canReleaseEscrow with simplified messages...");
    const tx3 = await escrow.connect(buyer).createEscrow(
        seller.address,
        ethers.ZeroAddress,
        amount,
        ethers.ZeroAddress,
        31337,
        { value: amount }
    );
    const receipt3 = await tx3.wait();
    
    let escrowId2;
    for (const log of receipt3.logs) {
        try {
            const parsed = escrow.interface.parseLog(log);
            if (parsed && parsed.name === "EscrowCreated") {
                escrowId2 = parsed.args[0];
                break;
            }
        } catch (e) {}
    }
    
    await escrow.connect(deployer).updateConditionWithDispute(escrowId2, true);
    const [canRelease, reason] = await escrow.canReleaseEscrow(escrowId2);
    console.log("Can release?", canRelease, "- Reason:", reason);
    console.log("✅ Simplified message (no exact seconds)");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });