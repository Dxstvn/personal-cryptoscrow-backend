const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

async function main() {
    console.log("\n🎯 Demonstrating UniversalEscrowServiceV3Disputes Capabilities\n");
    
    // Get signers
    const [deployer, buyer, seller, arbiter] = await ethers.getSigners();
    console.log("Deployer:", deployer.address);
    console.log("Buyer:", buyer.address);
    console.log("Seller:", seller.address);
    console.log("Service Wallet:", deployer.address);
    
    // Deploy mock tokens
    console.log("\n📦 Deploying mock tokens...");
    const MockWETH = await ethers.getContractFactory("contracts/mocks/MockWETH.sol:MockWETH");
    const weth = await MockWETH.deploy();
    await weth.waitForDeployment();
    const wethAddress = await weth.getAddress();
    
    const MockERC20 = await ethers.getContractFactory("contracts/mocks/MockERC20.sol:MockERC20");
    
    const usdc = await MockERC20.deploy("USD Coin", "USDC", 6);
    await usdc.waitForDeployment();
    const usdcAddress = await usdc.getAddress();
    
    const dai = await MockERC20.deploy("DAI Stablecoin", "DAI", 18);
    await dai.waitForDeployment();
    const daiAddress = await dai.getAddress();
    
    console.log("WETH:", wethAddress);
    console.log("USDC:", usdcAddress);
    console.log("DAI:", daiAddress);
    
    // Deploy mock Uniswap
    console.log("\n🔄 Deploying mock Uniswap router...");
    const MockRouter = await ethers.getContractFactory("contracts/mocks/MockUniswapV2Router.sol:MockUniswapV2Router");
    const uniswapRouter = await MockRouter.deploy(wethAddress);
    await uniswapRouter.waitForDeployment();
    const routerAddress = await uniswapRouter.getAddress();
    
    // Deposit ETH to get WETH for the router
    await weth.deposit({ value: ethers.parseEther("1000") });
    await weth.transfer(routerAddress, ethers.parseEther("1000"));
    await usdc.mint(routerAddress, ethers.parseUnits("1000000", 6));
    await dai.mint(routerAddress, ethers.parseEther("1000000"));
    
    // Also send ETH to router for ETH swaps
    await buyer.sendTransaction({
        to: routerAddress,
        value: ethers.parseEther("100")
    });
    console.log("Uniswap Router:", routerAddress);
    
    // Deploy V3 Disputes contract
    console.log("\n🚀 Deploying UniversalEscrowServiceV3Disputes...");
    const Escrow = await ethers.getContractFactory("UniversalEscrowServiceV3Disputes");
    const escrow = await Escrow.deploy(
        deployer.address, // service wallet
        wethAddress,
        routerAddress
    );
    await escrow.waitForDeployment();
    const escrowAddress = await escrow.getAddress();
    console.log("Escrow Contract:", escrowAddress);
    
    // Demo 1: Simple ETH Escrow
    console.log("\n\n═══════════════════════════════════════════");
    console.log("Demo 1: Simple ETH Escrow with Dispute Resolution");
    console.log("═══════════════════════════════════════════\n");
    
    const ethAmount = ethers.parseEther("1");
    console.log("Creating escrow for 1 ETH...");
    
    const tx1 = await escrow.connect(buyer).createEscrow(
        seller.address,
        ethers.ZeroAddress,
        ethAmount,
        ethers.ZeroAddress,
        31337,
        { value: ethAmount }
    );
    const receipt1 = await tx1.wait();
    
    // Get escrow ID from events
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
    console.log("✅ Escrow created with ID:", escrowId1);
    
    // Check initial state
    let [canRelease, reason] = await escrow.canReleaseEscrow(escrowId1);
    console.log(`Can release? ${canRelease} - Reason: ${reason}`);
    
    // Update condition
    console.log("\nService wallet updating condition to 'met'...");
    await escrow.connect(deployer).updateConditionWithDispute(escrowId1, true);
    console.log("✅ Condition updated");
    
    // Check dispute window
    [canRelease, reason] = await escrow.canReleaseEscrow(escrowId1);
    console.log(`Can release? ${canRelease} - Reason: ${reason}`);
    
    // Simulate dispute (Note: In production, the backend would handle this)
    console.log("\nBuyer raising dispute (in production, backend would do this)...");
    await escrow.connect(buyer).raiseDispute(escrowId1, "Product not as described");
    console.log("✅ Dispute raised");
    
    const disputeInfo = await escrow.getDisputeInfo(escrowId1);
    console.log("Dispute info retrieved");
    console.log("Dispute raised:", disputeInfo[0]); // disputeRaised
    console.log("Dispute raised by:", disputeInfo[1]); // disputeRaisedBy
    console.log("Dispute reason:", disputeInfo[4]); // disputeReason
    
    // Resolve dispute
    console.log("\nService wallet resolving dispute in favor of seller...");
    await escrow.connect(deployer).resolveDispute(escrowId1, true);
    console.log("✅ Dispute resolved - funds will be released to seller");
    
    // Demo 2: Token Swap Escrow
    console.log("\n\n═══════════════════════════════════════════");
    console.log("Demo 2: ETH to USDC Swap Escrow");
    console.log("═══════════════════════════════════════════\n");
    
    console.log("Creating escrow: Buyer deposits 1 ETH, Seller receives USDC...");
    
    const tx2 = await escrow.connect(buyer).createEscrow(
        seller.address,
        ethers.ZeroAddress, // deposit ETH
        ethAmount,
        usdcAddress, // target USDC
        31337,
        { value: ethAmount }
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
    console.log("✅ Swap escrow created with ID:", escrowId2);
    
    // Update condition and wait for dispute window
    console.log("\nMarking conditions as met and waiting for dispute window...");
    await escrow.connect(deployer).updateConditionWithDispute(escrowId2, true);
    
    // Fast forward time
    await time.increase(48 * 60 * 60 + 1); // 48 hours + 1 second
    console.log("⏰ Fast forwarded 48 hours");
    
    // Release with automatic swap
    console.log("\nReleasing escrow (will automatically swap ETH to USDC)...");
    const sellerUSDCBefore = await usdc.balanceOf(seller.address);
    
    await escrow.releaseEscrowWithDisputeCheck(escrowId2);
    console.log("✅ Escrow released with swap");
    
    const sellerUSDCAfter = await usdc.balanceOf(seller.address);
    const usdcReceived = sellerUSDCAfter - sellerUSDCBefore;
    console.log(`Seller received: ${ethers.formatUnits(usdcReceived, 6)} USDC`);
    
    // Demo 3: Cross-Chain Capabilities
    console.log("\n\n═══════════════════════════════════════════");
    console.log("Demo 3: Cross-Chain Capabilities (Simulated)");
    console.log("═══════════════════════════════════════════\n");
    
    // Configure mock Stargate
    const MockStargate = await ethers.getContractFactory("contracts/mocks/MockStargateRouter.sol:MockStargateRouter");
    const mockStargateRouter = await MockStargate.deploy();
    await mockStargateRouter.waitForDeployment();
    const stargateAddress = await mockStargateRouter.getAddress();
    
    await escrow.setStargateRouter(31337, stargateAddress, stargateAddress);
    await escrow.setStargateChainId(31337, 1);
    await escrow.setStargateChainId(421614, 10231); // Arbitrum
    await escrow.configureStargateToken(31337, ethers.ZeroAddress, 13, true);
    
    console.log("Creating cross-chain escrow: Sepolia → Arbitrum...");
    
    const tx3 = await escrow.connect(buyer).createEscrow(
        seller.address,
        ethers.ZeroAddress,
        ethAmount,
        ethers.ZeroAddress,
        421614, // Target chain: Arbitrum
        { value: ethAmount }
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
    console.log("✅ Cross-chain escrow created");
    
    // Get fee quote
    const [fee, minAmountOut] = await escrow.getStargateQuote(421614, ethAmount);
    console.log(`Cross-chain fee quote: ${ethers.formatEther(fee)} ETH`);
    console.log(`Minimum amount out: ${ethers.formatEther(minAmountOut)} ETH`);
    
    // Summary
    console.log("\n\n═══════════════════════════════════════════");
    console.log("📊 Contract Capabilities Summary");
    console.log("═══════════════════════════════════════════\n");
    
    console.log("✅ Core Features:");
    console.log("   - ETH and ERC-20 token escrows");
    console.log("   - 2% service fee automatically deducted");
    console.log("   - Condition-based release mechanism");
    
    console.log("\n✅ Dispute Resolution:");
    console.log("   - 48-hour dispute window after conditions met");
    console.log("   - 7-day resolution period");
    console.log("   - Automatic refund if unresolved");
    
    console.log("\n✅ Token Swaps:");
    console.log("   - Automatic swaps via Uniswap");
    console.log("   - Any ERC-20 to any ERC-20");
    console.log("   - Slippage protection");
    
    console.log("\n✅ Cross-Chain Support:");
    console.log("   - Stargate integration for ETH, USDC, USDT");
    console.log("   - LayerZero fallback for other tokens");
    console.log("   - Dynamic fee quotes");
    
    console.log("\n✅ Production Ready:");
    console.log("   - No hardcoded testnet fees");
    console.log("   - Standard 5% slippage (configurable)");
    console.log("   - Comprehensive error handling");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });