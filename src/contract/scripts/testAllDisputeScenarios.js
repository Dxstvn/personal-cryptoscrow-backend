const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

async function main() {
    console.log("\n🔍 Testing All Dispute Resolution Scenarios\n");
    
    const [deployer, buyer, seller] = await ethers.getSigners();
    
    // Deploy infrastructure
    const MockWETH = await ethers.getContractFactory("contracts/mocks/MockWETH.sol:MockWETH");
    const weth = await MockWETH.deploy();
    await weth.waitForDeployment();
    
    const MockERC20 = await ethers.getContractFactory("contracts/mocks/MockERC20.sol:MockERC20");
    const usdc = await MockERC20.deploy("USD Coin", "USDC", 6);
    await usdc.waitForDeployment();
    
    const MockRouter = await ethers.getContractFactory("contracts/mocks/MockUniswapV2Router.sol:MockUniswapV2Router");
    const uniswapRouter = await MockRouter.deploy(await weth.getAddress());
    await uniswapRouter.waitForDeployment();
    
    // Add liquidity
    await weth.deposit({ value: ethers.parseEther("1000") });
    await weth.transfer(await uniswapRouter.getAddress(), ethers.parseEther("1000"));
    await usdc.mint(await uniswapRouter.getAddress(), ethers.parseUnits("1000000", 6));
    
    // Deploy V3 contract
    const Escrow = await ethers.getContractFactory("UniversalEscrowServiceV3Disputes");
    const escrow = await Escrow.deploy(
        deployer.address,
        await weth.getAddress(),
        await uniswapRouter.getAddress()
    );
    await escrow.waitForDeployment();
    console.log("✅ V3 Escrow deployed at:", await escrow.getAddress());
    
    // Scenario 1: Normal release (no dispute)
    console.log("\n═══════════════════════════════════════════");
    console.log("Scenario 1: Normal Release (No Dispute)");
    console.log("═══════════════════════════════════════════\n");
    
    const amount = ethers.parseEther("1");
    const tx1 = await escrow.connect(buyer).createEscrow(
        seller.address,
        ethers.ZeroAddress,
        amount,
        ethers.ZeroAddress,
        31337,
        { value: amount }
    );
    const receipt1 = await tx1.wait();
    
    let escrowId1;
    for (const log of receipt1.logs) {
        try {
            const parsed = escrow.interface.parseLog(log);
            if (parsed && parsed.name === "EscrowCreated") {
                escrowId1 = parsed.args[0];
                break;
            }
        } catch (e) {}
    }
    
    await escrow.connect(deployer).updateConditionWithDispute(escrowId1, true);
    console.log("✅ Conditions met, 48-hour dispute window started");
    
    await time.increase(48 * 60 * 60 + 1);
    console.log("✅ Dispute window passed without dispute");
    
    await escrow.releaseEscrowWithDisputeCheck(escrowId1);
    console.log("✅ Funds released to seller");
    
    // Scenario 2: Dispute raised and resolved in seller's favor
    console.log("\n═══════════════════════════════════════════");
    console.log("Scenario 2: Dispute Resolved - Seller Wins");
    console.log("═══════════════════════════════════════════\n");
    
    const tx2 = await escrow.connect(buyer).createEscrow(
        seller.address,
        ethers.ZeroAddress,
        amount,
        ethers.ZeroAddress,
        31337,
        { value: amount }
    );
    const receipt2 = await tx2.wait();
    
    let escrowId2;
    for (const log of receipt2.logs) {
        try {
            const parsed = escrow.interface.parseLog(log);
            if (parsed && parsed.name === "EscrowCreated") {
                escrowId2 = parsed.args[0];
                break;
            }
        } catch (e) {}
    }
    
    await escrow.connect(deployer).updateConditionWithDispute(escrowId2, true);
    await escrow.connect(buyer).raiseDispute(escrowId2, "Item not as described");
    console.log("✅ Dispute raised by buyer");
    
    await escrow.connect(deployer).resolveDispute(escrowId2, true);
    console.log("✅ Service wallet resolved dispute in seller's favor");
    
    const escrowData2 = await escrow.escrows(escrowId2);
    console.log("✅ Escrow released:", escrowData2.released);
    
    // Scenario 3: Dispute resolved in buyer's favor
    console.log("\n═══════════════════════════════════════════");
    console.log("Scenario 3: Dispute Resolved - Buyer Wins");
    console.log("═══════════════════════════════════════════\n");
    
    const tx3 = await escrow.connect(buyer).createEscrow(
        seller.address,
        ethers.ZeroAddress,
        amount,
        ethers.ZeroAddress,
        31337,
        { value: amount }
    );
    const receipt3 = await tx3.wait();
    
    let escrowId3;
    for (const log of receipt3.logs) {
        try {
            const parsed = escrow.interface.parseLog(log);
            if (parsed && parsed.name === "EscrowCreated") {
                escrowId3 = parsed.args[0];
                break;
            }
        } catch (e) {}
    }
    
    await escrow.connect(deployer).updateConditionWithDispute(escrowId3, true);
    await escrow.connect(seller).raiseDispute(escrowId3, "Buyer provided wrong address");
    console.log("✅ Dispute raised by seller");
    
    const buyerBalanceBefore = await ethers.provider.getBalance(buyer.address);
    await escrow.connect(deployer).resolveDispute(escrowId3, false);
    const buyerBalanceAfter = await ethers.provider.getBalance(buyer.address);
    
    console.log("✅ Service wallet resolved dispute in buyer's favor");
    console.log("✅ Refund amount:", ethers.formatEther(buyerBalanceAfter - buyerBalanceBefore), "ETH");
    
    // Scenario 4: Dispute window edge cases
    console.log("\n═══════════════════════════════════════════");
    console.log("Scenario 4: Dispute Window Edge Cases");
    console.log("═══════════════════════════════════════════\n");
    
    const tx4 = await escrow.connect(buyer).createEscrow(
        seller.address,
        ethers.ZeroAddress,
        amount,
        ethers.ZeroAddress,
        31337,
        { value: amount }
    );
    const receipt4 = await tx4.wait();
    
    let escrowId4;
    for (const log of receipt4.logs) {
        try {
            const parsed = escrow.interface.parseLog(log);
            if (parsed && parsed.name === "EscrowCreated") {
                escrowId4 = parsed.args[0];
                break;
            }
        } catch (e) {}
    }
    
    await escrow.connect(deployer).updateConditionWithDispute(escrowId4, true);
    
    // Try to release during dispute window
    try {
        await escrow.releaseEscrowWithDisputeCheck(escrowId4);
        console.log("❌ Should not allow release during dispute window");
    } catch (error) {
        console.log("✅ Correctly prevented release during dispute window");
    }
    
    // Fast forward to near end of dispute window
    await time.increase(48 * 60 * 60 - 60); // 1 minute before end
    
    // Raise dispute just before window closes
    await escrow.connect(buyer).raiseDispute(escrowId4, "Last minute dispute");
    console.log("✅ Dispute raised 1 minute before window closes");
    
    // Try to raise another dispute after window
    await time.increase(120); // 2 minutes later
    try {
        await escrow.connect(seller).raiseDispute(escrowId4, "Too late");
        console.log("❌ Should not allow dispute after window");
    } catch (error) {
        console.log("✅ Correctly prevented dispute after window closed");
    }
    
    // Scenario 5: Token escrow with dispute
    console.log("\n═══════════════════════════════════════════");
    console.log("Scenario 5: Token Escrow with Dispute");
    console.log("═══════════════════════════════════════════\n");
    
    await usdc.mint(buyer.address, ethers.parseUnits("1000", 6));
    await usdc.connect(buyer).approve(await escrow.getAddress(), ethers.parseUnits("1000", 6));
    
    const tx5 = await escrow.connect(buyer).createEscrow(
        seller.address,
        await usdc.getAddress(),
        ethers.parseUnits("1000", 6),
        await usdc.getAddress(),
        31337,
        { value: 0 }
    );
    const receipt5 = await tx5.wait();
    
    let escrowId5;
    for (const log of receipt5.logs) {
        try {
            const parsed = escrow.interface.parseLog(log);
            if (parsed && parsed.name === "EscrowCreated") {
                escrowId5 = parsed.args[0];
                break;
            }
        } catch (e) {}
    }
    
    await escrow.connect(deployer).updateConditionWithDispute(escrowId5, true);
    await escrow.connect(buyer).raiseDispute(escrowId5, "Token quality issue");
    console.log("✅ Token escrow dispute raised");
    
    const buyerUSDCBefore = await usdc.balanceOf(buyer.address);
    await escrow.connect(deployer).resolveDispute(escrowId5, false);
    const buyerUSDCAfter = await usdc.balanceOf(buyer.address);
    
    console.log("✅ Tokens returned to buyer:", ethers.formatUnits(buyerUSDCAfter - buyerUSDCBefore, 6), "USDC");
    
    // Summary
    console.log("\n═══════════════════════════════════════════");
    console.log("📊 Dispute Resolution Summary");
    console.log("═══════════════════════════════════════════\n");
    
    console.log("✅ All dispute scenarios tested successfully:");
    console.log("   1. Normal release without dispute");
    console.log("   2. Dispute resolved in seller's favor");
    console.log("   3. Dispute resolved in buyer's favor");
    console.log("   4. Dispute window timing validation");
    console.log("   5. Token escrow dispute handling");
    console.log("\n✅ The automated dispute monitor can use resolveDispute(escrowId, false)");
    console.log("   to automatically refund buyers after 7 days if disputes are unresolved");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });