import pkg from "hardhat";
const { ethers } = pkg;
import fs from "fs";
import path from "path";

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Updating escrow OFT adapters with:", deployer.address);
    
    // Load OFT adapter deployments
    const deploymentsPath = path.join(process.cwd(), "deployments", "oft-adapters.json");
    const oftDeployments = JSON.parse(fs.readFileSync(deploymentsPath, 'utf8'));
    
    // Escrow service addresses
    const escrowAddresses = {
        "sepolia": "0x2ee79369D7cCb53550F1Ca61A1a3bf60B3C92f1E",
        "polygon-amoy": "0x53E4b9A8f7b1185768cef74d9564cbeD052a9682",
        "arbitrum-sepolia": "0xd3b5A13C113328C4F4F1AbF646a2be2AaC8815B5"
    };
    
    // LayerZero chain IDs
    const chainIds = {
        "sepolia": 40161,
        "polygon-amoy": 40267,
        "arbitrum-sepolia": 40231
    };
    
    const network = await ethers.provider.getNetwork();
    const chainId = network.chainId.toString();
    const networkName = chainId === "11155111" ? "sepolia" :
                       chainId === "80002" ? "polygon-amoy" :
                       chainId === "421614" ? "arbitrum-sepolia" :
                       `unknown-${chainId}`;
    
    console.log(`\nCurrent network: ${networkName} (${chainId})`);
    
    const escrowAddress = escrowAddresses[networkName];
    if (!escrowAddress) {
        console.log("❌ No escrow service found for current network");
        return;
    }
    
    const escrow = await ethers.getContractAt("UniversalEscrowService", escrowAddress);
    console.log(`Escrow Service: ${escrowAddress}`);
    
    // Get other networks
    const otherNetworks = Object.keys(oftDeployments).filter(n => n !== networkName);
    
    console.log("\n🔧 Updating OFT adapter configuration...");
    
    for (const remoteName of otherNetworks) {
        const remoteOFT = oftDeployments[remoteName];
        const remoteChainId = chainIds[remoteName];
        
        if (!remoteChainId) {
            console.log(`⚠️ No chain ID for ${remoteName}`);
            continue;
        }
        
        console.log(`\n📡 Setting ${remoteName} OFT adapter:`);
        console.log(`  Chain ID: ${remoteChainId}`);
        console.log(`  OFT Address: ${remoteOFT.address}`);
        
        try {
            // Check current configuration
            const currentOFT = await escrow.oftAdapters(remoteChainId);
            console.log(`  Current: ${currentOFT}`);
            
            if (currentOFT.toLowerCase() === remoteOFT.address.toLowerCase()) {
                console.log(`  ✅ Already configured correctly`);
                continue;
            }
            
            // Update OFT adapter
            const tx = await escrow.setOFTAdapter(remoteChainId, remoteOFT.address, remoteName);
            console.log(`  📤 Transaction: ${tx.hash}`);
            
            const receipt = await tx.wait();
            console.log(`  ✅ Success! Gas used: ${receipt.gasUsed}`);
            
            // Verify
            const newOFT = await escrow.oftAdapters(remoteChainId);
            console.log(`  🔍 Verified: ${newOFT}`);
            
        } catch (error) {
            console.log(`  ❌ Error: ${error.message}`);
        }
    }
    
    // Summary
    console.log("\n📊 OFT Adapter Configuration Summary:");
    for (const remoteName of otherNetworks) {
        const remoteChainId = chainIds[remoteName];
        if (!remoteChainId) continue;
        
        try {
            const oftAdapter = await escrow.oftAdapters(remoteChainId);
            const expected = oftDeployments[remoteName].address;
            const matches = oftAdapter.toLowerCase() === expected.toLowerCase();
            console.log(`${remoteName}: ${matches ? '✅' : '❌'} ${oftAdapter}`);
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