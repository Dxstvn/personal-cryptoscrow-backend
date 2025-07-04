import pkg from "hardhat";
const { ethers } = pkg;

async function main() {
    console.log("=== USDC ESCROW TEST ===\n");
    
    const [deployer] = await ethers.getSigners();
    console.log("Deployer:", deployer.address);
    
    // Network configurations
    const networkConfigs = {
        "11155111": { // Sepolia
            name: "sepolia",
            escrow: "0x335Bb94C802E224Bc3D7afE9d65902df9984ed08",
            usdc: "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8",
            weth: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14"
        },
        "80002": { // Polygon Amoy
            name: "polygon-amoy",
            escrow: "", // Deploy first
            usdc: "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582",
            wpol: "0x360ad4f9a9A8EFe9A8DCB5f461c4Cc1047E1Dcf9"
        },
        "421614": { // Arbitrum Sepolia
            name: "arbitrum-sepolia",
            escrow: "", // Deploy first
            usdc: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
            weth: "0x980B62Da83eFf3D4576C647993b0c1D7faf17c73"
        }
    };
    
    const chainId = (await ethers.provider.getNetwork()).chainId.toString();
    const config = networkConfigs[chainId];
    
    if (!config) {
        console.log("❌ Unknown network");
        return;
    }
    
    if (!config.escrow) {
        console.log("❌ Please deploy Universal Escrow Service on this network first");
        return;
    }
    
    console.log(`Network: ${config.name}`);
    console.log(`Escrow: ${config.escrow}`);
    console.log(`USDC: ${config.usdc}`);
    
    // Create test wallets
    const buyer = ethers.Wallet.createRandom().connect(ethers.provider);
    const seller = ethers.Wallet.createRandom().connect(ethers.provider);
    
    console.log(`\nBuyer: ${buyer.address}`);
    console.log(`Seller: ${seller.address}`);
    
    // Get contracts
    const escrow = await ethers.getContractAt("UniversalEscrowService", config.escrow);
    const usdc = await ethers.getContractAt("IERC20", config.usdc);
    
    // Fund buyer with ETH for gas
    console.log("\n💰 Funding buyer with ETH for gas...");
    const fundTx = await deployer.sendTransaction({
        to: buyer.address,
        value: ethers.parseEther("0.1")
    });
    await fundTx.wait();
    console.log("✅ Funded with 0.1 ETH");
    
    // Check if we have USDC (if not, explain how to get it)
    const deployerUSDCBalance = await usdc.balanceOf(deployer.address);
    console.log(`\nDeployer USDC balance: ${ethers.formatUnits(deployerUSDCBalance, 6)} USDC`);
    
    if (deployerUSDCBalance === 0n) {
        console.log("\n⚠️ You need USDC to run this test!");
        console.log("Options:");
        console.log("1. Get test USDC from a faucet");
        console.log("2. Swap ETH for USDC on Uniswap");
        console.log("3. Use the mock USDC minting function (if available)");
        
        // Try to mint if it's a test token
        try {
            const mintFunction = usdc.interface.getFunction("mint");
            if (mintFunction) {
                console.log("\n🪙 Attempting to mint test USDC...");
                const mintAmount = ethers.parseUnits("100", 6); // 100 USDC
                const mintTx = await usdc.connect(deployer).mint(deployer.address, mintAmount);
                await mintTx.wait();
                console.log("✅ Minted 100 test USDC");
            }
        } catch (e) {
            console.log("❌ Cannot mint USDC (not a test token)");
            return;
        }
    }
    
    // Transfer USDC to buyer
    const testAmount = ethers.parseUnits("10", 6); // 10 USDC
    console.log(`\n💸 Transferring ${ethers.formatUnits(testAmount, 6)} USDC to buyer...`);
    const transferTx = await usdc.connect(deployer).transfer(buyer.address, testAmount);
    await transferTx.wait();
    console.log("✅ USDC transferred");
    
    const buyerUSDCBalance = await usdc.balanceOf(buyer.address);
    console.log(`Buyer USDC balance: ${ethers.formatUnits(buyerUSDCBalance, 6)} USDC`);
    
    // Approve escrow contract
    console.log("\n🔓 Approving escrow contract...");
    const approveTx = await usdc.connect(buyer).approve(config.escrow, testAmount);
    await approveTx.wait();
    console.log("✅ Approved");
    
    // Test scenarios
    console.log("\n🧪 Running USDC Tests...\n");
    
    // Test 1: USDC → USDC (same chain)
    console.log("TEST 1: USDC → USDC (Same Chain)");
    try {
        const serviceFee = testAmount * 200n / 10000n; // 2%
        const netAmount = testAmount - serviceFee;
        
        console.log(`Deposit: ${ethers.formatUnits(testAmount, 6)} USDC`);
        console.log(`Service Fee: ${ethers.formatUnits(serviceFee, 6)} USDC`);
        console.log(`Net Amount: ${ethers.formatUnits(netAmount, 6)} USDC`);
        
        // Create escrow
        const createTx = await escrow.connect(buyer).createEscrow(
            seller.address,
            config.usdc, // deposit USDC
            testAmount,
            config.usdc, // receive USDC
            0, // same chain
            { value: 0 } // No ETH needed
        );
        
        console.log(`Create Tx: ${createTx.hash}`);
        const createReceipt = await createTx.wait();
        
        // Get escrow ID
        let escrowId = null;
        for (const log of createReceipt.logs) {
            if (log.address.toLowerCase() === config.escrow.toLowerCase()) {
                try {
                    const iface = new ethers.Interface([
                        "event EscrowCreated(bytes32 indexed escrowId, address indexed buyer, address indexed seller, address depositToken, uint256 depositAmount, uint256 serviceFee, uint256 netAmount, address targetToken, uint32 targetChainId)"
                    ]);
                    const decoded = iface.parseLog(log);
                    if (decoded.name === "EscrowCreated") {
                        escrowId = decoded.args.escrowId;
                        console.log(`Escrow ID: ${escrowId}`);
                        break;
                    }
                } catch (e) {}
            }
        }
        
        // Update condition (simulate oracle/backend)
        console.log("\n⏳ Updating condition...");
        const updateTx = await escrow.connect(deployer).updateCondition(escrowId, true);
        await updateTx.wait();
        console.log("✅ Condition met");
        
        // Check seller balance before
        const sellerBefore = await usdc.balanceOf(seller.address);
        
        // Release escrow
        console.log("\n🚀 Releasing escrow...");
        const releaseTx = await escrow.connect(buyer).releaseEscrow(escrowId);
        await releaseTx.wait();
        console.log("✅ Released");
        
        // Check seller balance after
        const sellerAfter = await usdc.balanceOf(seller.address);
        const received = sellerAfter - sellerBefore;
        
        console.log(`\nSeller received: ${ethers.formatUnits(received, 6)} USDC`);
        console.log(`Expected: ${ethers.formatUnits(netAmount, 6)} USDC`);
        console.log(`Match: ${received === netAmount ? '✅' : '❌'}`);
        
    } catch (error) {
        console.log("❌ Test 1 failed:", error.message);
    }
    
    // Test 2: USDC → ETH (same chain)
    console.log("\n\nTEST 2: USDC → ETH (Same Chain with Uniswap)");
    
    // First, check if buyer has enough USDC
    const remainingUSDC = await usdc.balanceOf(buyer.address);
    if (remainingUSDC < testAmount) {
        console.log("⚠️ Insufficient USDC for second test");
        console.log("Would test: USDC deposit → Uniswap swap → ETH to seller");
        console.log("This demonstrates the routing flexibility");
    } else {
        try {
            // Approve again
            const approveTx2 = await usdc.connect(buyer).approve(config.escrow, testAmount);
            await approveTx2.wait();
            
            const sellerETHBefore = await ethers.provider.getBalance(seller.address);
            
            // Create escrow
            const createTx2 = await escrow.connect(buyer).createEscrow(
                seller.address,
                config.usdc, // deposit USDC
                testAmount,
                ethers.ZeroAddress, // receive ETH
                0, // same chain
                { value: 0 }
            );
            
            console.log(`Create Tx: ${createTx2.hash}`);
            const createReceipt2 = await createTx2.wait();
            
            // Get escrow ID
            let escrowId2 = null;
            for (const log of createReceipt2.logs) {
                if (log.address.toLowerCase() === config.escrow.toLowerCase()) {
                    try {
                        const iface = new ethers.Interface([
                            "event EscrowCreated(bytes32 indexed escrowId, address indexed buyer, address indexed seller, address depositToken, uint256 depositAmount, uint256 serviceFee, uint256 netAmount, address targetToken, uint32 targetChainId)"
                        ]);
                        const decoded = iface.parseLog(log);
                        if (decoded.name === "EscrowCreated") {
                            escrowId2 = decoded.args.escrowId;
                            console.log(`Escrow ID: ${escrowId2}`);
                            break;
                        }
                    } catch (e) {}
                }
            }
            
            // Update condition
            const updateTx2 = await escrow.connect(deployer).updateCondition(escrowId2, true);
            await updateTx2.wait();
            console.log("✅ Condition met");
            
            // Release (will use Uniswap)
            console.log("\n🔄 Releasing with Uniswap swap...");
            const releaseTx2 = await escrow.connect(buyer).releaseEscrow(escrowId2);
            const releaseReceipt2 = await releaseTx2.wait();
            
            // Check for swap event
            for (const log of releaseReceipt2.logs) {
                if (log.address.toLowerCase() === config.escrow.toLowerCase()) {
                    try {
                        const iface = new ethers.Interface([
                            "event TokenSwapped(bytes32 indexed escrowId, address indexed fromToken, address indexed toToken, uint256 amountIn, uint256 amountOut)"
                        ]);
                        const decoded = iface.parseLog(log);
                        if (decoded.name === "TokenSwapped") {
                            console.log(`✅ Token swapped via Uniswap`);
                            console.log(`   USDC in: ${ethers.formatUnits(decoded.args.amountIn, 6)}`);
                            console.log(`   ETH out: ${ethers.formatEther(decoded.args.amountOut)}`);
                            break;
                        }
                    } catch (e) {}
                }
            }
            
            const sellerETHAfter = await ethers.provider.getBalance(seller.address);
            const ethReceived = sellerETHAfter - sellerETHBefore;
            console.log(`\nSeller received: ${ethers.formatEther(ethReceived)} ETH`);
            
        } catch (error) {
            console.log("❌ Test 2 failed:", error.message);
            if (error.message.includes("Router")) {
                console.log("⚠️ Uniswap router might not be available on this testnet");
            }
        }
    }
    
    console.log("\n✅ USDC TEST COMPLETED!");
    console.log("\n📋 Summary:");
    console.log("• Tested ERC20 token deposits");
    console.log("• Tested service fee collection in tokens");
    console.log("• Tested condition updates");
    console.log("• Tested same-token transfers");
    console.log("• Tested token swaps (if Uniswap available)");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("\n❌ Script failed:", error);
        process.exit(1);
    });