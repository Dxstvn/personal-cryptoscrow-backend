import pkg from "hardhat";
const { ethers } = pkg;

async function main() {
    console.log("=== Deploying SimplePropertyOFTAdapter to Arbitrum Sepolia ===\n");
    
    const [deployer] = await ethers.getSigners();
    console.log("Deploying with account:", deployer.address);
    
    // Check balance first
    const balance = await ethers.provider.getBalance(deployer.address);
    console.log("Balance:", ethers.formatEther(balance), "ETH");
    
    // Arbitrum Sepolia configuration
    const config = {
        weth: "0x980B62Da83eFf3D4576C647993b0c1D7faf17c73",
        usdc: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
        usdt: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
        endpoint: "0x6EDCE65403992e310A62460808c4b910D972f10f"
    };
    
    console.log("Configuration:");
    console.log(`   WETH: ${config.weth}`);
    console.log(`   USDC: ${config.usdc}`);
    console.log(`   USDT: ${config.usdt}`);
    console.log(`   Endpoint: ${config.endpoint}`);
    
    // Check if DEX aggregator is already deployed from previous attempt
    const dexAddress = "0xe5e0253c541dC4A7D8C62ED92820E3Ad14988176";
    
    let dex;
    try {
        dex = await ethers.getContractAt("MockDEXAggregator", dexAddress);
        const wethAddress = await dex.weth();
        console.log(`\n✅ Found existing DEX Aggregator at: ${dexAddress}`);
        console.log(`   WETH configured: ${wethAddress}`);
    } catch (e) {
        console.log("\nDeploying new Mock DEX Aggregator...");
        const MockDEXAggregator = await ethers.getContractFactory("MockDEXAggregator");
        dex = await MockDEXAggregator.deploy(config.weth);
        await dex.waitForDeployment();
        const newDexAddress = await dex.getAddress();
        console.log(`✅ Mock DEX Aggregator deployed at: ${newDexAddress}`);
    }
    
    const finalDexAddress = await dex.getAddress();
    
    // Deploy SimplePropertyOFTAdapter
    console.log("\nDeploying SimplePropertyOFTAdapter...");
    
    const SimplePropertyOFTAdapter = await ethers.getContractFactory("SimplePropertyOFTAdapter");
    const adapter = await SimplePropertyOFTAdapter.deploy(
        config.weth,
        config.usdc,
        config.usdt,
        config.endpoint,
        deployer.address,
        finalDexAddress
    );
    
    console.log("Waiting for deployment confirmation...");
    await adapter.waitForDeployment();
    const adapterAddress = await adapter.getAddress();
    
    console.log(`\n✅ SimplePropertyOFTAdapter deployed at: ${adapterAddress}`);
    
    // Quick verification
    console.log("\nVerifying deployment...");
    try {
        const endpoint = await adapter.endpoint();
        const owner = await adapter.owner();
        const weth = await adapter.WETH();
        console.log(`   Endpoint: ${endpoint}`);
        console.log(`   Owner: ${owner}`);
        console.log(`   WETH: ${weth}`);
        console.log("\n✅ Deployment verification successful!");
    } catch (error) {
        console.log("❌ Verification error:", error.message);
    }
    
    console.log(`\n🚀 Arbitrum Sepolia Addresses:`);
    console.log(`   OFT Adapter: ${adapterAddress}`);
    console.log(`   DEX Aggregator: ${finalDexAddress}`);
    
    console.log(`\n📝 Next Steps:`);
    console.log(`1. Configure trusted remotes for multi-chain setup`);
    console.log(`2. Set up peer connections with Sepolia and Polygon`);
    console.log(`3. Test cross-chain functionality`);
    
    // LayerZero Endpoint IDs for reference
    console.log(`\n📋 LayerZero Endpoint IDs for peer setup:`);
    console.log(`   Sepolia: 40161`);
    console.log(`   Polygon Amoy: 40267`);
    console.log(`   Arbitrum Sepolia: 40231`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("\n❌ Deployment failed:", error);
        process.exit(1);
    });