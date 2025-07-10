const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

async function main() {
    console.log("\n🏭 Demonstrating Production Flow with Backend Service\n");
    
    // In production:
    // - deployer = backend service wallet
    // - buyer/seller = user wallets (they don't interact with contract directly)
    const [backendService, buyer, seller, ...others] = await ethers.getSigners();
    
    console.log("Backend Service Wallet:", backendService.address);
    console.log("Buyer Wallet:", buyer.address);
    console.log("Seller Wallet:", seller.address);
    
    // Deploy infrastructure
    console.log("\n📦 Setting up test infrastructure...");
    
    try {
        // Deploy mock tokens
        const MockWETH = await ethers.getContractFactory("contracts/mocks/MockWETH.sol:MockWETH");
        const weth = await MockWETH.deploy();
        await weth.waitForDeployment();
        console.log("WETH deployed to:", await weth.getAddress());
        
        const MockERC20 = await ethers.getContractFactory("contracts/mocks/MockERC20.sol:MockERC20");
        
        const usdc = await MockERC20.deploy("USD Coin", "USDC", 6);
        await usdc.waitForDeployment();
        console.log("USDC deployed to:", await usdc.getAddress());
        
        // Deploy mock Uniswap router
        const MockRouter = await ethers.getContractFactory("contracts/mocks/MockUniswapV2Router.sol:MockUniswapV2Router");
        const uniswapRouter = await MockRouter.deploy(await weth.getAddress());
        await uniswapRouter.waitForDeployment();
        console.log("Uniswap Router deployed to:", await uniswapRouter.getAddress());
        
        // Add liquidity
        await weth.mint(await uniswapRouter.getAddress(), ethers.parseEther("1000"));
        await usdc.mint(await uniswapRouter.getAddress(), ethers.parseUnits("1000000", 6));
        console.log("Liquidity added to router");
        
        // Deploy V3 contract with backend as service wallet
        console.log("\n🚀 Deploying UniversalEscrowServiceV3Disputes...");
        const Escrow = await ethers.getContractFactory("UniversalEscrowServiceV3Disputes");
        const escrow = await Escrow.deploy(
            backendService.address,
            await weth.getAddress(),
            await uniswapRouter.getAddress()
        );
        await escrow.waitForDeployment();
        console.log("✅ V3 Escrow deployed at:", await escrow.getAddress());
        
        console.log("\n\n═══════════════════════════════════════════");
        console.log("🔄 Production Flow Simulation");
        console.log("═══════════════════════════════════════════\n");
        
        // Step 1: User creates deal through frontend
        console.log("Step 1: Buyer creates escrow through API");
        console.log("└─ Frontend sends request to backend API");
        console.log("└─ Backend validates and creates escrow on buyer's behalf");
        console.log("   (Demo: buyer creates directly for simplicity)");
        
        const amount = ethers.parseEther("1");
        
        // In production: The contract would be modified to allow backend to specify buyer
        // For this demo, we'll have buyer create directly to show the flow
        const tx1 = await escrow.connect(buyer).createEscrow(
            seller.address,
            ethers.ZeroAddress,
            amount,
            ethers.ZeroAddress,
            31337,
            { value: amount }
        );
        const receipt1 = await tx1.wait();
        
        // Parse logs to find the event
        const logs = receipt1.logs;
        let escrowId;
        
        // Find EscrowCreated event
        for (const log of logs) {
            try {
                const parsed = escrow.interface.parseLog(log);
                if (parsed && parsed.name === "EscrowCreated") {
                    escrowId = parsed.args[0]; // escrowId is first argument
                    break;
                }
            } catch (e) {
                // Not this event, continue
            }
        }
        
        if (!escrowId) {
            throw new Error("EscrowCreated event not found");
        }
        
        console.log("✅ Escrow created with ID:", escrowId);
        console.log("   Service fee (2%) sent to backend wallet");
        
        // Step 2: Seller marks condition as met
        console.log("\nStep 2: Seller marks condition as met through frontend");
        console.log("└─ Frontend sends request to backend API");
        console.log("└─ Backend validates seller identity");
        console.log("└─ Backend updates condition on-chain");
        
        const tx2 = await escrow.connect(backendService).updateConditionWithDispute(escrowId, true);
        await tx2.wait();
        console.log("✅ Condition marked as met - 48hr dispute window started");
        
        // Step 3: Show dispute window status
        const [canRelease, reason] = await escrow.canReleaseEscrow(escrowId);
        console.log(`\nCan release escrow? ${canRelease}`);
        console.log(`Reason: ${reason}`);
        
        // Step 4: Buyer raises dispute
        console.log("\nStep 3: Buyer raises dispute through frontend");
        console.log("└─ Frontend sends dispute request to backend API");
        console.log("└─ Backend validates buyer identity and dispute window");
        console.log("└─ Backend raises dispute on-chain");
        
        // In production, backend would raise dispute on behalf of buyer
        // For demo, using buyer directly since escrow was created by buyer
        const tx3 = await escrow.connect(buyer).raiseDispute(escrowId, "Product quality issue");
        await tx3.wait();
        console.log("✅ Dispute raised - 7 day resolution period started");
        
        // Step 5: Backend resolves dispute
        console.log("\nStep 4: Backend admin resolves dispute");
        console.log("└─ Admin reviews evidence off-chain");
        console.log("└─ Admin decides outcome");
        console.log("└─ Backend executes resolution on-chain");
        
        const tx4 = await escrow.connect(backendService).resolveDispute(escrowId, true);
        await tx4.wait();
        console.log("✅ Dispute resolved in favor of seller");
        
        // Show final state
        const escrowData = await escrow.escrows(escrowId);
        console.log("\nFinal escrow state:");
        console.log("└─ Released:", escrowData.released);
        console.log("└─ Amount:", ethers.formatEther(escrowData.netAmount), "ETH (after 2% fee)");
        
        console.log("\n\n═══════════════════════════════════════════");
        console.log("📊 Key Architecture Points");
        console.log("═══════════════════════════════════════════\n");
        
        console.log("1. Access Control:");
        console.log("   - Users NEVER interact with contract directly");
        console.log("   - Backend service wallet has privileged access");
        console.log("   - All actions go through backend API validation");
        
        console.log("\n2. Security Benefits:");
        console.log("   - Additional validation layer");
        console.log("   - Rate limiting and fraud detection");
        console.log("   - Identity verification before contract calls");
        console.log("   - Protection against direct contract exploits");
        
        console.log("\n3. User Experience Benefits:");
        console.log("   - No need for users to manage gas");
        console.log("   - Simplified error handling");
        console.log("   - Transaction batching possible");
        console.log("   - Off-chain features (notifications, etc.)");
        
        console.log("\n4. Contract Design:");
        console.log("   - Service wallet can update conditions");
        console.log("   - Service wallet can resolve disputes");
        console.log("   - Buyer/seller can raise disputes (flexibility)");
        console.log("   - Automatic refunds after 7 days (trustless fallback)");
        
    } catch (error) {
        console.error("\n❌ Error during demonstration:");
        console.error(error);
        throw error;
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });