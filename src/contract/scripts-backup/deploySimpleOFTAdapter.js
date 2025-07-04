import pkg from "hardhat";
const { ethers } = pkg;

async function main() {
    console.log("=== Deploying SimplePropertyOFTAdapter ===\n");
    
    const [deployer] = await ethers.getSigners();
    console.log("Deploying with account:", deployer.address);
    
    // Get network info
    const network = await ethers.provider.getNetwork();
    const chainId = network.chainId.toString();
    
    const networkName = chainId === "11155111" ? "sepolia" :
                       chainId === "80002" ? "polygon-amoy" :
                       chainId === "421614" ? "arbitrum-sepolia" :
                       chainId === "31337" ? "localhost" :
                       `unknown-${chainId}`;
    
    console.log(`Network: ${networkName} (Chain ID: ${chainId})`);
    
    // Network-specific configurations
    const configs = {
        "sepolia": {
            weth: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14",
            usdc: "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8", // Sepolia USDC
            usdt: "0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0", // Sepolia USDT
            endpoint: "0x6EDCE65403992e310A62460808c4b910D972f10f"
        },
        "polygon-amoy": {
            weth: "0x360ad4f9a9A8EFe9A8DCB5f461c4Cc1047E1Dcf9", // WPOL
            usdc: "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582", // Polygon Amoy USDC
            usdt: "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582", // Polygon Amoy USDT (same for testing)
            endpoint: "0x6EDCE65403992e310A62460808c4b910D972f10f"
        },
        "arbitrum-sepolia": {
            weth: "0x980B62Da83eFf3D4576C647993b0c1D7faf17c73",
            usdc: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d", // Arbitrum Sepolia USDC
            usdt: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d", // Arbitrum Sepolia USDT (same for testing)
            endpoint: "0x6EDCE65403992e310A62460808c4b910D972f10f"
        },
        "localhost": {
            weth: "0x5FbDB2315678afecb367f032d93F642f64180aa3", // Mock WETH for local testing
            usdc: "0x5FbDB2315678afecb367f032d93F642f64180aa3", // Mock USDC (using WETH for simplicity)
            usdt: "0x5FbDB2315678afecb367f032d93F642f64180aa3", // Mock USDT (using WETH for simplicity)
            endpoint: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512" // Mock endpoint for local testing
        }
    };
    
    const config = configs[networkName];
    if (!config) {
        console.error(`No configuration for ${networkName}`);
        return;
    }
    
    // First deploy Mock DEX Aggregator for enhanced functionality
    console.log("\nDeploying Mock DEX Aggregator...");
    const MockDEXAggregator = await ethers.getContractFactory("MockDEXAggregator");
    const dexAggregator = await MockDEXAggregator.deploy(config.weth);
    await dexAggregator.waitForDeployment();
    const dexAddress = await dexAggregator.getAddress();
    console.log(`✅ Mock DEX Aggregator deployed at: ${dexAddress}`);
    
    // Deploy SimplePropertyOFTAdapter
    console.log("\nDeploying Multi-Bridge SimplePropertyOFTAdapter...");
    console.log(`   WETH: ${config.weth}`);
    console.log(`   USDC: ${config.usdc}`);
    console.log(`   USDT: ${config.usdt}`);
    console.log(`   Endpoint: ${config.endpoint}`);
    console.log(`   Delegate: ${deployer.address}`);
    console.log(`   DEX Aggregator: ${dexAddress}`);
    
    const SimplePropertyOFTAdapter = await ethers.getContractFactory("SimplePropertyOFTAdapter");
    const adapter = await SimplePropertyOFTAdapter.deploy(
        config.weth,
        config.usdc,
        config.usdt,
        config.endpoint,
        deployer.address,
        dexAddress
    );
    
    await adapter.waitForDeployment();
    const adapterAddress = await adapter.getAddress();
    
    console.log(`\n✅ SimplePropertyOFTAdapter deployed at: ${adapterAddress}`);
    
    // Verify deployment
    console.log("\nVerifying deployment...");
    try {
        const weth = await adapter.WETH();
        const usdc = await adapter.USDC();
        const usdt = await adapter.USDT();
        const endpoint = await adapter.endpoint();
        const owner = await adapter.owner();
        const sharedDecimals = await adapter.sharedDecimals();
        const dex = await adapter.dexAggregator();
        const maxSlippage = await adapter.maxSlippageBps();
        
        // Check bridge token priorities
        const usdcPriority = await adapter.bridgeTokenPriority(usdc);
        const usdtPriority = await adapter.bridgeTokenPriority(usdt);
        const wethPriority = await adapter.bridgeTokenPriority(weth);
        
        console.log(`   WETH: ${weth} (Priority: ${wethPriority})`);
        console.log(`   USDC: ${usdc} (Priority: ${usdcPriority})`);
        console.log(`   USDT: ${usdt} (Priority: ${usdtPriority})`);
        console.log(`   Endpoint: ${endpoint}`);
        console.log(`   Owner: ${owner}`);
        console.log(`   Shared Decimals: ${sharedDecimals}`);
        console.log(`   DEX Aggregator: ${dex}`);
        console.log(`   Max Slippage: ${maxSlippage / 100}%`);
        
        console.log("\n✅ Multi-Bridge deployment verification successful!");
        
    } catch (error) {
        console.log("❌ Verification error:", error.message);
    }
    
    console.log("\n📝 Complete Dynamic Features Available:");
    console.log("🔄 BUYER SIDE:");
    console.log("  • Universal token support (any ERC20 + ETH)");
    console.log("  • Dynamic token conversion to WETH");
    console.log("  • Cross-chain transfers from any token");
    console.log("  • Automatic optimal routing (direct vs DEX)");
    
    console.log("\n🔄 SELLER SIDE:");
    console.log("  • WETH to any token conversion upon release");
    console.log("  • Batch processing for multiple sellers");
    console.log("  • Preview conversion rates");
    console.log("  • Authorized escrow contract integration");
    
    console.log("\n🛡️ SAFETY & FLEXIBILITY:");
    console.log("  • No token restrictions or allowlists");
    console.log("  • Slippage protection for all conversions");
    console.log("  • Access control for release functions");
    console.log("  • Same-chain token swapping");
    
    console.log("\n📝 Next Steps:");
    console.log("1. Configure peers on other chains");
    console.log("2. Set enforced options for gas limits");
    console.log("3. Authorize escrow contracts with setAuthorizedReleaseCaller()");
    console.log("4. Test buyer flow with convertAndSend()");
    console.log("5. Test seller flow with releaseAndConvert()");
    console.log("6. Test batch operations and previews");
    
    console.log(`\n🚀 Addresses:`);
    console.log(`   OFT Adapter: ${adapterAddress}`);
    console.log(`   DEX Aggregator: ${dexAddress}`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("\n❌ Deployment failed:", error);
        process.exit(1);
    });