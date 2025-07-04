import pkg from "hardhat";
const { ethers } = pkg;
import fs from "fs";
import path from "path";

async function main() {
    console.log("=== Configuring Peers for Standard OFT Adapters ===\n");
    
    const [signer] = await ethers.getSigners();
    console.log("Configuring with account:", signer.address);
    
    // Load deployments
    const deploymentPath = path.join(process.cwd(), '../../deployments/testnet-deployments.json');
    const deployments = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
    
    // Get current network
    const network = await ethers.provider.getNetwork();
    const currentNetwork = network.chainId === 11155111n ? 'sepolia' :
                          network.chainId === 80002n ? 'polygon-amoy' :
                          network.chainId === 421614n ? 'arbitrum-sepolia' : null;
    
    if (!currentNetwork) {
        throw new Error(`Unknown network with chainId ${network.chainId}`);
    }
    
    console.log(`Current network: ${currentNetwork}`);
    
    // Get the standard OFT adapter for current network
    const currentAdapter = deployments[currentNetwork]?.standardOftAdapters?.WETH || 
                          deployments[currentNetwork]?.standardOftAdapters?.WPOL;
    
    if (!currentAdapter) {
        throw new Error(`No standard OFT adapter found for ${currentNetwork}`);
    }
    
    console.log(`Adapter address: ${currentAdapter.address}\n`);
    
    // Connect to adapter
    const adapter = await ethers.getContractAt(
        "PropertyOFTAdapter",
        currentAdapter.address
    );
    
    // Network endpoint IDs
    const endpointIds = {
        'sepolia': 40161,
        'polygon-amoy': 40267,
        'arbitrum-sepolia': 40231
    };
    
    console.log("Setting peers for each network...\n");
    
    // Set peers for all other networks
    for (const [networkName, networkData] of Object.entries(deployments)) {
        if (networkName === currentNetwork || 
            networkName === 'deploymentDate' || 
            networkName === 'deployerAddress' ||
            networkName === 'polygonAmoyDeployer' ||
            networkName === 'lastUpdated') continue;
        
        const peerAdapter = networkData.standardOftAdapters?.WETH || 
                           networkData.standardOftAdapters?.WMATIC;
        
        if (!peerAdapter) {
            console.log(`⚠️  No standard adapter found for ${networkName}, skipping...`);
            continue;
        }
        
        const peerAddress = peerAdapter.address;
        const peerEid = endpointIds[networkName];
        
        if (!peerEid) {
            console.log(`⚠️  No endpoint ID found for ${networkName}, skipping...`);
            continue;
        }
        
        console.log(`Setting peer for ${networkName}:`);
        console.log(`  Endpoint ID: ${peerEid}`);
        console.log(`  Peer address: ${peerAddress}`);
        
        try {
            // Check if peer is already set
            const currentPeer = await adapter.peers(peerEid);
            const peerBytes32 = ethers.zeroPadValue(peerAddress, 32);
            
            if (currentPeer === peerBytes32) {
                console.log(`  ✅ Peer already set correctly`);
            } else {
                // Set the peer
                const tx = await adapter.setPeer(peerEid, peerBytes32);
                console.log(`  📤 Setting peer... (tx: ${tx.hash})`);
                await tx.wait();
                console.log(`  ✅ Peer set successfully`);
            }
            
        } catch (error) {
            console.error(`  ❌ Failed to set peer: ${error.message}`);
        }
    }
    
    console.log("\n=== Verifying Peer Configuration ===");
    
    // Verify all peers are set
    for (const [networkName, eid] of Object.entries(endpointIds)) {
        if (networkName === currentNetwork) continue;
        
        try {
            const peer = await adapter.peers(eid);
            console.log(`\n${networkName} (eid: ${eid}):`);
            console.log(`  Peer: ${peer}`);
            console.log(`  Is set: ${peer !== ethers.ZeroAddress}`);
        } catch (error) {
            console.error(`  ❌ Failed to verify: ${error.message}`);
        }
    }
    
    console.log("\n✅ Peer configuration complete!");
    console.log("\n📝 Next steps:");
    console.log("1. Run this script on all networks");
    console.log("2. Configure enforced options if needed");
    console.log("3. Test cross-chain transfers");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("\n❌ Script failed:", error);
        process.exit(1);
    });