import pkg from "hardhat";
const { ethers } = pkg;

async function main() {
    console.log("=== Configuring Three-Way Peer Connections ===\n");
    
    const [signer] = await ethers.getSigners();
    console.log("Configuring with account:", signer.address);
    
    // Get current network
    const network = await ethers.provider.getNetwork();
    const chainId = network.chainId.toString();
    const networkName = chainId === "11155111" ? "sepolia" :
                       chainId === "80002" ? "polygon-amoy" :
                       chainId === "421614" ? "arbitrum-sepolia" :
                       `unknown-${chainId}`;
    
    console.log(`Current Network: ${networkName} (Chain ID: ${chainId})`);
    
    // Network configurations
    const networks = {
        "sepolia": {
            name: "Sepolia",
            eid: 40161,
            adapter: "0xabB44feF0521d1Fc5Df081A95D5D13FF2bD5b297",
            contractType: "SimplePropertyOFTAdapter"
        },
        "polygon-amoy": {
            name: "Polygon Amoy", 
            eid: 40267,
            adapter: "0x12a9d0C6D06fEA1A584e98cd86aDC9EFdD7887df",
            contractType: "PropertyOFTAdapter"
        },
        "arbitrum-sepolia": {
            name: "Arbitrum Sepolia",
            eid: 40231,
            adapter: "0xf829798145e7128c820CdeC5B1cB2Fa2A2008597",
            contractType: "SimplePropertyOFTAdapter"
        }
    };
    
    const currentNetwork = networks[networkName];
    if (!currentNetwork) {
        console.log("❌ Unknown network");
        return;
    }
    
    console.log(`\n=== CONFIGURING ${currentNetwork.name.toUpperCase()} ===`);
    console.log(`Adapter: ${currentNetwork.adapter}`);
    console.log(`Contract Type: ${currentNetwork.contractType}`);
    
    // Get the adapter contract
    const adapter = await ethers.getContractAt(currentNetwork.contractType, currentNetwork.adapter);
    
    // Standard enforced options for all networks
    const enforcedOptions = "0x00030100110100000000000000000000000000030d40";
    
    // Configure peers based on current network
    if (networkName === "sepolia") {
        console.log("\n🔧 Configuring Sepolia peers...");
        
        // Arbitrum Sepolia peer (missing)
        const arbAdapter = networks["arbitrum-sepolia"].adapter;
        const arbEid = networks["arbitrum-sepolia"].eid;
        const arbPeerBytes32 = ethers.zeroPadValue(arbAdapter, 32);
        
        console.log(`\nSetting Arbitrum Sepolia peer (EID ${arbEid}):`);
        console.log(`   Address: ${arbAdapter}`);
        console.log(`   Bytes32: ${arbPeerBytes32}`);
        
        const setPeerTx = await adapter.setPeer(arbEid, arbPeerBytes32);
        await setPeerTx.wait();
        console.log("✅ Arbitrum Sepolia peer set");
        
        console.log(`\nSetting enforced options for Arbitrum Sepolia...`);
        const setOptionsTx = await adapter.setEnforcedOptions([{
            eid: arbEid,
            msgType: 1,
            options: enforcedOptions
        }]);
        await setOptionsTx.wait();
        console.log("✅ Arbitrum Sepolia enforced options set");
        
    } else if (networkName === "polygon-amoy") {
        console.log("\n🔧 Updating Polygon Amoy peers...");
        
        // Update Arbitrum Sepolia peer (wrong address)
        const arbAdapter = networks["arbitrum-sepolia"].adapter;
        const arbEid = networks["arbitrum-sepolia"].eid;
        const arbPeerBytes32 = ethers.zeroPadValue(arbAdapter, 32);
        
        console.log(`\nUpdating Arbitrum Sepolia peer (EID ${arbEid}):`);
        console.log(`   New Address: ${arbAdapter}`);
        console.log(`   Bytes32: ${arbPeerBytes32}`);
        
        const setPeerTx = await adapter.setPeer(arbEid, arbPeerBytes32);
        await setPeerTx.wait();
        console.log("✅ Arbitrum Sepolia peer updated");
        
    } else if (networkName === "arbitrum-sepolia") {
        console.log("\n🔧 Configuring Arbitrum Sepolia peers...");
        
        // Set Sepolia peer
        const sepoliaAdapter = networks["sepolia"].adapter;
        const sepoliaEid = networks["sepolia"].eid;
        const sepoliaPeerBytes32 = ethers.zeroPadValue(sepoliaAdapter, 32);
        
        console.log(`\nSetting Sepolia peer (EID ${sepoliaEid}):`);
        console.log(`   Address: ${sepoliaAdapter}`);
        console.log(`   Bytes32: ${sepoliaPeerBytes32}`);
        
        const setSepoliaPeerTx = await adapter.setPeer(sepoliaEid, sepoliaPeerBytes32);
        await setSepoliaPeerTx.wait();
        console.log("✅ Sepolia peer set");
        
        // Set Polygon Amoy peer
        const polygonAdapter = networks["polygon-amoy"].adapter;
        const polygonEid = networks["polygon-amoy"].eid;
        const polygonPeerBytes32 = ethers.zeroPadValue(polygonAdapter, 32);
        
        console.log(`\nSetting Polygon Amoy peer (EID ${polygonEid}):`);
        console.log(`   Address: ${polygonAdapter}`);
        console.log(`   Bytes32: ${polygonPeerBytes32}`);
        
        const setPolygonPeerTx = await adapter.setPeer(polygonEid, polygonPeerBytes32);
        await setPolygonPeerTx.wait();
        console.log("✅ Polygon Amoy peer set");
        
        // Set enforced options for both peers
        console.log(`\nSetting enforced options for both peers...`);
        const setOptionsTx = await adapter.setEnforcedOptions([
            {
                eid: sepoliaEid,
                msgType: 1,
                options: enforcedOptions
            },
            {
                eid: polygonEid,
                msgType: 1,
                options: enforcedOptions
            }
        ]);
        await setOptionsTx.wait();
        console.log("✅ Enforced options set for both peers");
    }
    
    // Verify configuration
    console.log(`\n=== VERIFICATION ===`);
    const otherNetworks = Object.entries(networks).filter(([key]) => key !== networkName);
    
    for (const [otherNetworkKey, otherNetworkConfig] of otherNetworks) {
        const actualPeer = await adapter.peers(otherNetworkConfig.eid);
        const expectedPeerBytes32 = ethers.zeroPadValue(otherNetworkConfig.adapter, 32);
        const enforcedOpts = await adapter.enforcedOptions(otherNetworkConfig.eid, 1);
        
        console.log(`\n${otherNetworkConfig.name}:`);
        console.log(`   Expected: ${expectedPeerBytes32}`);
        console.log(`   Actual: ${actualPeer}`);
        console.log(`   Match: ${actualPeer === expectedPeerBytes32 ? '✅' : '❌'}`);
        console.log(`   Options: ${enforcedOpts !== "0x" ? '✅' : '❌'}`);
    }
    
    console.log(`\n✅ ${currentNetwork.name} configuration complete!`);
    
    // Next steps
    if (networkName === "sepolia") {
        console.log(`\n📝 Next: Configure Polygon Amoy`);
        console.log(`npx hardhat run scripts/configureThreeWayPeers.js --network polygon-amoy`);
    } else if (networkName === "polygon-amoy") {
        console.log(`\n📝 Next: Configure Arbitrum Sepolia`);
        console.log(`npx hardhat run scripts/configureThreeWayPeers.js --network arbitrum-sepolia`);
    } else if (networkName === "arbitrum-sepolia") {
        console.log(`\n🎉 All networks configured! Ready to test cross-chain functionality`);
        console.log(`\n📝 Verification commands:`);
        console.log(`npx hardhat run scripts/verifyThreeWayTrustedRemotes.js --network sepolia`);
        console.log(`npx hardhat run scripts/verifyThreeWayTrustedRemotes.js --network polygon-amoy`);
        console.log(`npx hardhat run scripts/verifyThreeWayTrustedRemotes.js --network arbitrum-sepolia`);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("\n❌ Configuration failed:", error);
        process.exit(1);
    });