import pkg from "hardhat";
const { ethers } = pkg;
import fs from "fs";
import path from "path";

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Deploying SimplePropertyOFTAdapter with:", deployer.address);
    
    const network = await ethers.provider.getNetwork();
    const chainId = network.chainId.toString();
    const networkName = chainId === "11155111" ? "sepolia" :
                       chainId === "80002" ? "polygon-amoy" :
                       chainId === "421614" ? "arbitrum-sepolia" :
                       `unknown-${chainId}`;
    
    console.log(`Network: ${networkName} (${chainId})\n`);
    
    // Network-specific configurations
    const configs = {
        "sepolia": {
            weth: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14",
            usdc: "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8",
            usdt: "0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0",
            endpoint: "0x6EDCE65403992e310A62460808c4b910D972f10f",
            dexAggregator: "0x0000000000000000000000000000000000000000" // No DEX aggregator for now
        },
        "polygon-amoy": {
            weth: "0x360ad4f9a9A8EFe9A8DCB5f461c4Cc1047E1Dcf9", // WPOL on Polygon
            usdc: "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582",
            usdt: "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582", // Using USDC address as placeholder
            endpoint: "0x6EDCE65403992e310A62460808c4b910D972f10f",
            dexAggregator: "0x0000000000000000000000000000000000000000"
        },
        "arbitrum-sepolia": {
            weth: "0x980B62Da83eFf3D4576C647993b0c1D7faf17c73",
            usdc: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
            usdt: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d", // Using USDC address as placeholder
            endpoint: "0x6EDCE65403992e310A62460808c4b910D972f10f",
            dexAggregator: "0x0000000000000000000000000000000000000000"
        }
    };
    
    const config = configs[networkName];
    if (!config) {
        console.log("❌ Network not configured");
        return;
    }
    
    console.log("📋 Configuration:");
    console.log(`WETH: ${config.weth}`);
    console.log(`USDC: ${config.usdc}`);
    console.log(`USDT: ${config.usdt}`);
    console.log(`Endpoint: ${config.endpoint}`);
    console.log(`Delegate: ${deployer.address}`);
    console.log(`DEX Aggregator: ${config.dexAggregator}`);
    
    // Deploy the contract
    console.log("\n🚀 Deploying SimplePropertyOFTAdapter...");
    
    const SimplePropertyOFTAdapter = await ethers.getContractFactory("SimplePropertyOFTAdapter");
    const adapter = await SimplePropertyOFTAdapter.deploy(
        config.weth,
        config.usdc,
        config.usdt,
        config.endpoint,
        deployer.address, // delegate
        config.dexAggregator
    );
    
    await adapter.waitForDeployment();
    const adapterAddress = await adapter.getAddress();
    
    console.log(`\n✅ SimplePropertyOFTAdapter deployed to: ${adapterAddress}`);
    
    // Save deployment info
    const deploymentInfo = {
        network: networkName,
        chainId: chainId,
        address: adapterAddress,
        weth: config.weth,
        usdc: config.usdc,
        usdt: config.usdt,
        endpoint: config.endpoint,
        deployedAt: new Date().toISOString(),
        deployer: deployer.address,
        tx: adapter.deploymentTransaction().hash
    };
    
    // Save to deployments file
    const deploymentsPath = path.join(process.cwd(), "deployments", "oft-adapters.json");
    let deployments = {};
    
    if (fs.existsSync(deploymentsPath)) {
        deployments = JSON.parse(fs.readFileSync(deploymentsPath, 'utf8'));
    }
    
    deployments[networkName] = deploymentInfo;
    
    fs.mkdirSync(path.dirname(deploymentsPath), { recursive: true });
    fs.writeFileSync(deploymentsPath, JSON.stringify(deployments, null, 2));
    
    console.log(`\n📝 Deployment info saved to: ${deploymentsPath}`);
    
    // Verify basic functionality
    console.log("\n🔍 Verifying deployment...");
    const weth = await adapter.WETH();
    const usdc = await adapter.USDC();
    const endpoint = await adapter.endpoint();
    
    console.log(`WETH: ${weth}`);
    console.log(`USDC: ${usdc}`);
    console.log(`Endpoint: ${endpoint}`);
    
    console.log("\n✅ Deployment complete!");
    return adapterAddress;
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });