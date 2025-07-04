import pkg from "hardhat";
const { ethers } = pkg;
import fs from "fs";
import path from "path";

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Configuring trusted remotes with:", deployer.address);
    
    // Load deployment addresses
    const deploymentsPath = path.join(process.cwd(), "deployments", "oft-adapters.json");
    const deployments = JSON.parse(fs.readFileSync(deploymentsPath, 'utf8'));
    
    // LayerZero chain IDs
    const chainConfigs = {
        "sepolia": { eid: 40161, name: "Sepolia" },
        "polygon-amoy": { eid: 40267, name: "Polygon Amoy" },
        "arbitrum-sepolia": { eid: 40231, name: "Arbitrum Sepolia" }
    };
    
    const network = await ethers.provider.getNetwork();
    const chainId = network.chainId.toString();
    const networkName = chainId === "11155111" ? "sepolia" :
                       chainId === "80002" ? "polygon-amoy" :
                       chainId === "421614" ? "arbitrum-sepolia" :
                       `unknown-${chainId}`;
    
    console.log(`\nCurrent network: ${networkName} (${chainId})`);
    
    const currentDeployment = deployments[networkName];
    if (!currentDeployment) {
        console.log("❌ No deployment found for current network");
        return;
    }
    
    const adapter = await ethers.getContractAt("SimplePropertyOFTAdapter", currentDeployment.address);
    console.log(`OFT Adapter: ${currentDeployment.address}`);
    
    // Get remote networks
    const remoteNetworks = Object.keys(deployments).filter(n => n !== networkName);
    
    console.log("\n🔗 Setting trusted remotes...");
    
    for (const remoteName of remoteNetworks) {
        const remoteDeployment = deployments[remoteName];
        const remoteConfig = chainConfigs[remoteName];
        
        if (!remoteConfig) {
            console.log(`⚠️ No chain config for ${remoteName}`);
            continue;
        }
        
        console.log(`\n📡 Configuring ${remoteName}:`);
        console.log(`  Chain EID: ${remoteConfig.eid}`);
        console.log(`  Remote address: ${remoteDeployment.address}`);
        
        try {
            // Check if already configured
            const currentPeer = await adapter.peers(remoteConfig.eid);
            
            if (currentPeer !== "0x" && currentPeer !== "0x0000000000000000000000000000000000000000000000000000000000000000") {
                console.log(`  ✅ Already configured: ${currentPeer}`);
                continue;
            }
            
            // Set the peer
            const peerBytes32 = ethers.zeroPadValue(remoteDeployment.address, 32);
            const tx = await adapter.setPeer(remoteConfig.eid, peerBytes32);
            console.log(`  📤 Transaction: ${tx.hash}`);
            
            const receipt = await tx.wait();
            console.log(`  ✅ Success! Gas used: ${receipt.gasUsed}`);
            
            // Verify
            const newPeer = await adapter.peers(remoteConfig.eid);
            console.log(`  🔍 Verified: ${newPeer}`);
            
        } catch (error) {
            console.log(`  ❌ Error: ${error.message}`);
        }
    }
    
    // Summary
    console.log("\n📊 Configuration Summary:");
    for (const remoteName of remoteNetworks) {
        const remoteConfig = chainConfigs[remoteName];
        if (!remoteConfig) continue;
        
        try {
            const peer = await adapter.peers(remoteConfig.eid);
            const configured = peer !== "0x" && peer !== "0x0000000000000000000000000000000000000000000000000000000000000000";
            console.log(`${remoteName}: ${configured ? '✅ Configured' : '❌ Not configured'}`);
        } catch (e) {
            console.log(`${remoteName}: ❌ Error checking`);
        }
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });