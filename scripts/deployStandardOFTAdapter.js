import pkg from "hardhat";
const { ethers } = pkg;
import fs from "fs";

async function main() {
    console.log("=== Deploying Standard OFT Adapter for WETH/USDC ===\n");
    
    const [deployer] = await ethers.getSigners();
    console.log("Deploying with account:", deployer.address);
    
    // Get current network
    const network = await ethers.provider.getNetwork();
    const networkName = network.chainId === 11155111n ? "sepolia" :
                       network.chainId === 80002n ? "polygon-amoy" :
                       network.chainId === 421614n ? "arbitrum-sepolia" : 
                       `unknown-${network.chainId}`;
    
    console.log("Network:", networkName);
    
    // Load deployments
    let deployments = {};
    try {
        deployments = JSON.parse(fs.readFileSync('./deployments/testnet-deployments.json', 'utf8'));
    } catch (e) {
        console.log("Creating new deployments file...");
    }
    
    if (!deployments[networkName]) {
        deployments[networkName] = {};
    }
    
    // Token addresses for each network
    const tokenConfigs = {
        "sepolia": {
            WETH: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14", // Sepolia WETH
            endpoint: "0x6EDCE65403992e310A62460808c4b910D972f10f"
        },
        "polygon-amoy": {
            WPOL: "0x0Fa8781a83E46826621b3BC094Ea2A0212e71B23", // Amoy WPOL/WMATIC
            endpoint: "0x6EDCE65403992e310A62460808c4b910D972f10f"
        },
        "arbitrum-sepolia": {
            WETH: "0x980B62Da83eFf3D4576C647993b0c1D7faf17c73", // Arbitrum Sepolia WETH
            endpoint: "0x6EDCE65403992e310A62460808c4b910D972f10f"
        }
    };
    
    const config = tokenConfigs[networkName];
    if (!config) {
        throw new Error(`No configuration for network ${networkName}`);
    }
    
    // Deploy standard OFT Adapter
    console.log("\nDeploying PropertyOFTAdapter...");
    const OFTAdapter = await ethers.getContractFactory("PropertyOFTAdapter");
    
    const tokenSymbol = Object.keys(config)[0]; // WETH or WPOL
    const tokenAddress = config[tokenSymbol];
    
    console.log(`Token: ${tokenSymbol} at ${tokenAddress}`);
    console.log(`Endpoint: ${config.endpoint}`);
    
    const oftAdapter = await OFTAdapter.deploy(
        tokenAddress,
        config.endpoint,
        deployer.address
    );
    
    await oftAdapter.waitForDeployment();
    const oftAdapterAddress = await oftAdapter.getAddress();
    
    console.log(`✅ OFT Adapter deployed: ${oftAdapterAddress}`);
    
    // Verify the adapter is properly configured
    const adaptedToken = await oftAdapter.token();
    const endpoint = await oftAdapter.endpoint();
    const owner = await oftAdapter.owner();
    
    console.log("\nVerifying configuration:");
    console.log(`  Token: ${adaptedToken}`);
    console.log(`  Endpoint: ${endpoint}`);
    console.log(`  Owner: ${owner}`);
    console.log(`  Requires approval: ${await oftAdapter.approvalRequired()}`);
    
    // Update deployments
    if (!deployments[networkName].standardOftAdapters) {
        deployments[networkName].standardOftAdapters = {};
    }
    
    deployments[networkName].standardOftAdapters[tokenSymbol] = {
        address: oftAdapterAddress,
        token: tokenAddress,
        deployedAt: new Date().toISOString()
    };
    
    fs.writeFileSync('./deployments/testnet-deployments.json', JSON.stringify(deployments, null, 2));
    console.log("\n✅ Deployments updated");
    
    console.log("\n=== Next Steps ===");
    console.log("1. Deploy on all networks (sepolia, polygon-amoy, arbitrum-sepolia)");
    console.log("2. Configure peers between adapters");
    console.log("3. Set delegates if needed");
    console.log("4. Configure enforced options");
    console.log("5. Test cross-chain transfers");
    
    // Show deployment summary
    console.log("\n📋 Deployment Summary:");
    console.log(`Network: ${networkName}`);
    console.log(`Token: ${tokenSymbol} (${tokenAddress})`);
    console.log(`OFT Adapter: ${oftAdapterAddress}`);
    console.log(`Endpoint: ${config.endpoint}`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("\n❌ Script failed:", error);
        process.exit(1);
    });