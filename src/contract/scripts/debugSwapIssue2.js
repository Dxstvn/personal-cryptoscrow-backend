const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

async function main() {
    console.log("\n🔍 Debugging Swap Issue - Part 2\n");
    
    // Deploy minimal setup
    const [deployer, buyer, seller] = await ethers.getSigners();
    
    // Deploy tokens
    const MockWETH = await ethers.getContractFactory("contracts/mocks/MockWETH.sol:MockWETH");
    const weth = await MockWETH.deploy();
    await weth.waitForDeployment();
    
    const MockERC20 = await ethers.getContractFactory("contracts/mocks/MockERC20.sol:MockERC20");
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
    const escrowAddress = await escrow.getAddress();
    console.log("Escrow deployed at:", escrowAddress);
    
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
                console.log("✅ Escrow created with ID:", escrowId);
                break;
            }
        } catch (e) {}
    }
    
    // Check balances
    const escrowBalance = await ethers.provider.getBalance(escrowAddress);
    console.log("\nEscrow contract ETH balance:", ethers.formatEther(escrowBalance), "ETH");
    
    const escrowData = await escrow.escrows(escrowId);
    console.log("Escrow netAmount:", ethers.formatEther(escrowData.netAmount), "ETH");
    console.log("Service fee (2%):", ethers.formatEther(escrowData.depositAmount - escrowData.netAmount), "ETH");
    
    // Update condition and wait
    console.log("\nUpdating condition and waiting for dispute window...");
    await escrow.connect(deployer).updateConditionWithDispute(escrowId, true);
    await time.increase(48 * 60 * 60 + 1); // 48 hours + 1 second
    
    // Check that we can now release
    const [canRelease, reason] = await escrow.canReleaseEscrow(escrowId);
    console.log("Can release?", canRelease, "- Reason:", reason);
    
    // Check router balance
    const routerBalance = await ethers.provider.getBalance(routerAddress);
    console.log("\nRouter ETH balance:", ethers.formatEther(routerBalance), "ETH");
    
    // Try to release
    console.log("\nAttempting to release and swap ETH to USDC...");
    try {
        const tx2 = await escrow.releaseEscrowWithDisputeCheck(escrowId);
        const receipt2 = await tx2.wait();
        console.log("✅ Release successful!");
        
        // Check seller USDC balance
        const sellerUSDC = await usdc.balanceOf(seller.address);
        console.log("Seller USDC balance:", ethers.formatUnits(sellerUSDC, 6), "USDC");
    } catch (error) {
        console.log("❌ Release failed:", error.message);
        
        // Try to understand the error better
        if (error.message.includes("getStargateQuote")) {
            console.log("\n⚠️  Error involves getStargateQuote, but this is a same-chain transfer!");
            console.log("Target chain ID:", escrowData.targetChainId.toString());
            console.log("Current chain ID:", await ethers.provider.getNetwork().then(n => n.chainId.toString()));
        }
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });