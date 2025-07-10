const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

async function main() {
    console.log("\n🔄 Demonstrating Dispute Timeout Refund\n");
    
    // Get signers
    const [deployer, buyer, seller] = await ethers.getSigners();
    console.log("Service Wallet:", deployer.address);
    console.log("Buyer:", buyer.address);
    console.log("Seller:", seller.address);
    
    // Deploy minimal infrastructure
    console.log("\n📦 Deploying contracts...");
    
    // Deploy mock WETH
    const MockERC20 = await ethers.getContractFactory("contracts/mocks/MockERC20.sol:MockERC20");
    const weth = await MockERC20.deploy("Wrapped ETH", "WETH", 18);
    await weth.waitForDeployment();
    
    // Deploy mock router
    const MockRouter = await ethers.getContractFactory("contracts/mocks/MockUniswapV2Router.sol:MockUniswapV2Router");
    const uniswapRouter = await MockRouter.deploy(await weth.getAddress());
    await uniswapRouter.waitForDeployment();
    
    // Deploy V3 Disputes contract
    const Escrow = await ethers.getContractFactory("UniversalEscrowServiceV3Disputes");
    const escrow = await Escrow.deploy(
        deployer.address,
        await weth.getAddress(),
        await uniswapRouter.getAddress()
    );
    await escrow.waitForDeployment();
    console.log("✅ V3 Escrow deployed at:", await escrow.getAddress());
    
    console.log("\n═══════════════════════════════════════════");
    console.log("Dispute Timeout Scenario");
    console.log("═══════════════════════════════════════════\n");
    
    // Create escrow
    const amount = ethers.parseEther("1");
    console.log("1. Creating escrow for 1 ETH...");
    
    const tx1 = await escrow.connect(buyer).createEscrow(
        seller.address,
        ethers.ZeroAddress,
        amount,
        ethers.ZeroAddress,
        31337,
        { value: amount }
    );
    const receipt1 = await tx1.wait();
    
    // Extract escrowId
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
    console.log("✅ Escrow created with ID:", escrowId);
    
    // Update condition
    console.log("\n2. Service wallet marks conditions as met...");
    await escrow.connect(deployer).updateConditionWithDispute(escrowId, true);
    console.log("✅ 48-hour dispute window started");
    
    // Raise dispute
    console.log("\n3. Buyer raises dispute...");
    await escrow.connect(buyer).raiseDispute(escrowId, "Product defective");
    console.log("✅ 7-day resolution period started");
    
    // Fast forward past resolution period
    console.log("\n4. Fast forwarding 7+ days...");
    await time.increase(7 * 24 * 60 * 60 + 1);
    console.log("✅ Resolution period expired");
    
    // Check buyer balance before
    const buyerBalanceBefore = await ethers.provider.getBalance(buyer.address);
    console.log("Buyer balance before:", ethers.formatEther(buyerBalanceBefore), "ETH");
    
    // Return funds
    console.log("\n5. Calling returnFundsAfterDisputeTimeout...");
    const tx2 = await escrow.returnFundsAfterDisputeTimeout(escrowId);
    const receipt2 = await tx2.wait();
    console.log("✅ Funds returned to buyer");
    
    // Check buyer balance after
    const buyerBalanceAfter = await ethers.provider.getBalance(buyer.address);
    console.log("Buyer balance after:", ethers.formatEther(buyerBalanceAfter), "ETH");
    console.log("Refund received:", ethers.formatEther(buyerBalanceAfter - buyerBalanceBefore), "ETH");
    
    // Check escrow state
    const escrowData = await escrow.escrows(escrowId);
    console.log("\nFinal escrow state:");
    console.log("└─ Released:", escrowData.released);
    
    console.log("\n✅ Successfully demonstrated automatic refund after dispute timeout!");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });