import pkg from "hardhat";
const { ethers } = pkg;
import fs from "fs";
import path from "path";

async function main() {
    console.log("=== Manual Composer Configuration ===\n");
    
    const [deployer] = await ethers.getSigners();
    console.log("Configuring with account:", deployer.address);
    
    // Load deployments
    const deploymentPath = path.join(process.cwd(), "deployments", "testnet-deployments.json");
    let deployments = {};
    if (fs.existsSync(deploymentPath)) {
        deployments = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
    }
    
    // Get all deployed addresses
    const networks = {
        "sepolia": {
            chainId: 40161,
            escrow: "0x335Bb94C802E224Bc3D7afE9d65902df9984ed08",
            composer: "0x3e6d2247055683d53a16Fc935E24D30065a6DB05"
        },
        "polygon-amoy": {
            chainId: 40267,
            escrow: "0x53E4b9A8f7b1185768cef74d9564cbeD052a9682",
            composer: "0xeE455345205F0Ab563f67307bF37E618180da05c"
        },
        "arbitrum-sepolia": {
            chainId: 40231,
            escrow: "0xd3b5A13C113328C4F4F1AbF646a2be2AaC8815B5",
            composer: "0x8f65178A3281d72E1F50FA9E01D8B3884229ddC8"
        }
    };
    
    console.log("📋 Current Deployments:");
    for (const [network, config] of Object.entries(networks)) {
        console.log(`\n${network}:`);
        console.log(`  Escrow: ${config.escrow || "Not deployed"}`);
        console.log(`  Composer: ${config.composer || "Not deployed"}`);
    }
    
    // Get current network
    const network = await ethers.provider.getNetwork();
    const chainId = network.chainId.toString();
    const networkName = chainId === "11155111" ? "sepolia" :
                       chainId === "80002" ? "polygon-amoy" :
                       chainId === "421614" ? "arbitrum-sepolia" :
                       `unknown-${chainId}`;
    
    console.log(`\n🌐 Current Network: ${networkName}`);
    
    const currentConfig = networks[networkName];
    if (!currentConfig?.escrow) {
        console.log("❌ No escrow service found on current network");
        return;
    }
    
    // Configure composers for other networks
    console.log("\n⚙️ Configuring composers for other networks...");
    
    const escrow = await ethers.getContractAt("UniversalEscrowService", currentConfig.escrow);
    
    for (const [targetNetwork, targetConfig] of Object.entries(networks)) {
        if (targetNetwork !== networkName && targetConfig.composer) {
            try {
                console.log(`\nSetting composer for ${targetNetwork}...`);
                
                // Check current setting
                const currentComposer = await escrow.getSwapComposer(targetConfig.chainId);
                console.log(`Current: ${currentComposer}`);
                console.log(`New: ${targetConfig.composer}`);
                
                if (currentComposer !== targetConfig.composer) {
                    const tx = await escrow.setSwapComposer(targetConfig.chainId, targetConfig.composer);
                    console.log(`Transaction: ${tx.hash}`);
                    await tx.wait();
                    console.log(`✅ Composer set for ${targetNetwork}`);
                } else {
                    console.log(`✅ Already configured correctly`);
                }
            } catch (error) {
                console.log(`❌ Failed to set composer for ${targetNetwork}: ${error.message}`);
            }
        }
    }
    
    // Verify final configuration
    console.log("\n🔍 Final Configuration:");
    for (const [targetNetwork, targetConfig] of Object.entries(networks)) {
        if (targetNetwork !== networkName) {
            try {
                const composer = await escrow.getSwapComposer(targetConfig.chainId);
                console.log(`${targetNetwork}: ${composer !== ethers.ZeroAddress ? '✅' : '❌'} ${composer}`);
            } catch (e) {
                console.log(`${targetNetwork}: ❌ Error checking`);
            }
        }
    }
    
    console.log("\n✨ Configuration complete!");
    console.log("\n📝 Manual Configuration Commands (if needed):");
    console.log("```javascript");
    console.log("const escrow = await ethers.getContractAt('UniversalEscrowService', ESCROW_ADDRESS);");
    for (const [targetNetwork, targetConfig] of Object.entries(networks)) {
        if (targetNetwork !== networkName && targetConfig.composer) {
            console.log(`await escrow.setSwapComposer(${targetConfig.chainId}, '${targetConfig.composer}'); // ${targetNetwork}`);
        }
    }
    console.log("```");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("\n❌ Configuration failed:", error);
        process.exit(1);
    });