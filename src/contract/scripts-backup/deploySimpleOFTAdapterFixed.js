import pkg from "hardhat";
const { ethers } = pkg;

async function main() {
    console.log("=== Deploying SimplePropertyOFTAdapter (Fixed Gas) ===\n");
    
    const [deployer] = await ethers.getSigners();
    console.log("Deploying with account:", deployer.address);
    
    // Check balance first
    const balance = await ethers.provider.getBalance(deployer.address);
    console.log("Balance:", ethers.formatEther(balance), "ETH");
    
    // Get network info
    const network = await ethers.provider.getNetwork();
    const chainId = network.chainId.toString();
    
    const networkName = chainId === "11155111" ? "sepolia" :
                       chainId === "80002" ? "polygon-amoy" :
                       chainId === "421614" ? "arbitrum-sepolia" :
                       chainId === "42161" ? "arbitrum-one" :
                       chainId === "31337" ? "localhost" :
                       `unknown-${chainId}`;
    
    console.log(`Network: ${networkName} (Chain ID: ${chainId})`);
    
    // Network-specific configurations
    const configs = {
        "sepolia": {
            weth: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14",
            usdc: "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8",
            usdt: "0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0",
            endpoint: "0x6EDCE65403992e310A62460808c4b910D972f10f"
        },
        "polygon-amoy": {
            weth: "0x360ad4f9a9A8EFe9A8DCB5f461c4Cc1047E1Dcf9", // WPOL
            usdc: "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582",
            usdt: "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582",
            endpoint: "0x6EDCE65403992e310A62460808c4b910D972f10f"
        },
        "arbitrum-sepolia": {
            weth: "0x980B62Da83eFf3D4576C647993b0c1D7faf17c73",
            usdc: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
            usdt: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d", // Same as USDC for testing
            endpoint: "0x6EDCE65403992e310A62460808c4b910D972f10f"
        }
    };
    
    const config = configs[networkName];
    if (!config) {
        console.error(`No configuration for ${networkName}`);
        return;
    }
    
    // Set reasonable gas limits for Polygon
    const gasOverrides = networkName === "polygon-amoy" ? {
        gasLimit: 8000000,
        gasPrice: ethers.parseUnits("35", "gwei")
    } : {};
    
    // First deploy Mock DEX Aggregator
    console.log("\nDeploying Mock DEX Aggregator...");
    const MockDEXAggregator = await ethers.getContractFactory("MockDEXAggregator");
    const dexAggregator = await MockDEXAggregator.deploy(config.weth, gasOverrides);
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
        dexAddress,
        gasOverrides
    );
    
    await adapter.waitForDeployment();
    const adapterAddress = await adapter.getAddress();
    
    console.log(`\n✅ SimplePropertyOFTAdapter deployed at: ${adapterAddress}`);
    
    // Quick verification
    console.log("\nVerifying deployment...");
    try {
        const endpoint = await adapter.endpoint();
        const owner = await adapter.owner();
        console.log(`   Endpoint: ${endpoint}`);
        console.log(`   Owner: ${owner}`);
        console.log("\n✅ Deployment verification successful!");
    } catch (error) {
        console.log("❌ Verification error:", error.message);
    }
    
    console.log(`\n🚀 Addresses for ${networkName}:`);
    console.log(`   OFT Adapter: ${adapterAddress}`);
    console.log(`   DEX Aggregator: ${dexAddress}`);
    
    // Save addresses for cross-chain setup
    console.log(`\n📝 Save these for trusted remote setup:`);
    if (networkName === "sepolia") {
        console.log(`   Sepolia Adapter: ${adapterAddress}`);
        console.log("   Next: Deploy on Polygon Amoy and configure peers");
    } else if (networkName === "polygon-amoy") {
        console.log(`   Polygon Amoy Adapter: ${adapterAddress}`);
        console.log("   Next: Configure trusted remotes between chains");
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("\n❌ Deployment failed:", error);
        process.exit(1);
    });