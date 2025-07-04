const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
    console.log("=== Deploying PropertyOFTAdapter (Standard OFT) ===\n");
    
    const [deployer] = await hre.ethers.getSigners();
    console.log("Deploying with account:", deployer.address);
    
    // Get network info
    const network = await hre.ethers.provider.getNetwork();
    const chainId = network.chainId.toString();
    
    const networkName = chainId === "11155111" ? "sepolia" :
                       chainId === "80002" ? "polygon-amoy" :
                       chainId === "421614" ? "arbitrum-sepolia" :
                       `unknown-${chainId}`;
    
    console.log(`Network: ${networkName} (Chain ID: ${chainId})`);
    
    // Load existing deployments
    const deploymentsPath = path.join(__dirname, "../../../deployments/testnet-deployments.json");
    let deployments = {};
    if (fs.existsSync(deploymentsPath)) {
        deployments = JSON.parse(fs.readFileSync(deploymentsPath, 'utf8'));
    }
    
    if (!deployments[networkName]) {
        console.error(`No deployment configuration for ${networkName}`);
        return;
    }
    
    // Token configurations
    const tokenConfigs = {
        "sepolia": {
            token: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14", // Sepolia WETH
            symbol: "WETH"
        },
        "polygon-amoy": {
            token: "0x360ad4f9a9A8EFe9A8DCB5f461c4Cc1047E1Dcf9", // Polygon Amoy WPOL
            symbol: "WPOL"
        },
        "arbitrum-sepolia": {
            token: "0x980B62Da83eFf3D4576C647993b0c1D7faf17c73", // Arbitrum Sepolia WETH
            symbol: "WETH"
        }
    };
    
    const config = tokenConfigs[networkName];
    if (!config) {
        console.error(`No token configuration for ${networkName}`);
        return;
    }
    
    // LayerZero V2 endpoint (same for all testnets)
    const lzEndpoint = "0x6EDCE65403992e310A62460808c4b910D972f10f";
    
    console.log(`\nDeploying PropertyOFTAdapter for ${config.symbol}...`);
    console.log(`Token: ${config.token}`);
    console.log(`Endpoint: ${lzEndpoint}`);
    console.log(`Delegate: ${deployer.address}`);
    
    // Deploy PropertyOFTAdapter
    const PropertyOFTAdapter = await hre.ethers.getContractFactory("PropertyOFTAdapter");
    const adapter = await PropertyOFTAdapter.deploy(
        config.token,
        lzEndpoint,
        deployer.address
    );
    
    await adapter.waitForDeployment();
    const adapterAddress = await adapter.getAddress();
    
    console.log(`\n✅ PropertyOFTAdapter deployed at: ${adapterAddress}`);
    
    // Verify configuration
    console.log("\nVerifying configuration...");
    try {
        const token = await adapter.token();
        const endpoint = await adapter.endpoint();
        const owner = await adapter.owner();
        const approvalRequired = await adapter.approvalRequired();
        
        console.log(`Token: ${token}`);
        console.log(`Endpoint: ${endpoint}`);
        console.log(`Owner: ${owner}`);
        console.log(`Approval Required: ${approvalRequired}`);
    } catch (error) {
        console.log("Note: Some verification functions may not be available immediately after deployment");
    }
    
    // Update deployments
    if (!deployments[networkName].standardOftAdapters) {
        deployments[networkName].standardOftAdapters = {};
    }
    
    deployments[networkName].standardOftAdapters[config.symbol] = {
        address: adapterAddress,
        token: config.token,
        deployedAt: new Date().toISOString(),
        deployTx: adapter.deploymentTransaction().hash,
        deployBlock: adapter.deploymentTransaction().blockNumber
    };
    
    // Save deployments
    fs.writeFileSync(deploymentsPath, JSON.stringify(deployments, null, 2));
    console.log("\n📝 Deployment info saved to testnet-deployments.json");
    
    console.log("\n=== Next Steps ===");
    console.log("1. Deploy on other networks (polygon-amoy, arbitrum-sepolia)");
    console.log("2. Configure peers using setPeer()");
    console.log("3. Set delegate if different from deployer");
    console.log("4. Configure enforced options if needed");
    console.log("5. Test cross-chain transfers");
    
    console.log("\n📋 Summary:");
    console.log(`Network: ${networkName}`);
    console.log(`Token: ${config.symbol} (${config.token})`);
    console.log(`Adapter: ${adapterAddress}`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });