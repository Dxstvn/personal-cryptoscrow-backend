import pkg from "hardhat";
const { ethers } = pkg;

async function main() {
    console.log("=== Configuring New Adapter Peer Connections ===\n");
    
    const [signer] = await ethers.getSigners();
    console.log("Configuring with account:", signer.address);
    
    // Get network info
    const network = await ethers.provider.getNetwork();
    const chainId = network.chainId.toString();
    const networkName = chainId === "11155111" ? "sepolia" : 
                       chainId === "80002" ? "polygon-amoy" : `unknown-${chainId}`;
    
    console.log(`Network: ${networkName} (Chain ID: ${chainId})`);
    
    // Adapter addresses
    const adapters = {
        sepolia: {
            new: "0xabB44feF0521d1Fc5Df081A95D5D13FF2bD5b297", // New SimplePropertyOFTAdapter
            old: "0x90653738e66A0fa93BF20b087e6A39A704FA39e1", // Previous PropertyOFTAdapter
            peerEid: 40267, // Polygon Amoy
            peer: "0x12a9d0C6D06fEA1A584e98cd86aDC9EFdD7887df" // Polygon adapter
        },
        "polygon-amoy": {
            current: "0x12a9d0C6D06fEA1A584e98cd86aDC9EFdD7887df", // Current PropertyOFTAdapter
            peerEid: 40161, // Sepolia
            oldPeer: "0x90653738e66A0fa93BF20b087e6A39A704FA39e1", // Previous Sepolia adapter
            newPeer: "0xabB44feF0521d1Fc5Df081A95D5D13FF2bD5b297"  // New Sepolia adapter
        }
    };
    
    if (networkName === "sepolia") {
        console.log("\\nConfiguring new Sepolia adapter...");
        console.log(`New adapter: ${adapters.sepolia.new}`);
        console.log(`Polygon peer: ${adapters.sepolia.peer}`);
        
        // Get the new adapter contract
        const adapter = await ethers.getContractAt("SimplePropertyOFTAdapter", adapters.sepolia.new);
        
        // Set peer - convert address to bytes32 with padding
        const peerBytes32 = ethers.zeroPadValue(adapters.sepolia.peer, 32);
        console.log(`\\nSetting peer for EID ${adapters.sepolia.peerEid}...`);
        console.log(`Peer address: ${adapters.sepolia.peer}`);
        console.log(`Peer bytes32: ${peerBytes32}`);
        
        const setPeerTx = await adapter.setPeer(adapters.sepolia.peerEid, peerBytes32);
        await setPeerTx.wait();
        console.log("✅ Peer set successfully");
        
        // Set enforced options for gas limits
        console.log("\\nSetting enforced options...");
        const enforcedOptions = "0x00030100110100000000000000000000000000030d40"; // Standard gas settings
        const setOptionsTx = await adapter.setEnforcedOptions([{
            eid: adapters.sepolia.peerEid,
            msgType: 1,
            options: enforcedOptions
        }]);
        await setOptionsTx.wait();
        console.log("✅ Enforced options set successfully");
        
        // Verify configuration
        console.log("\\n=== Verification ===");
        const setPeer = await adapter.peers(adapters.sepolia.peerEid);
        const setOptions = await adapter.enforcedOptions(adapters.sepolia.peerEid, 1);
        console.log(`Peer: ${setPeer}`);
        console.log(`Options: ${setOptions}`);
        console.log(`Peer configured: ${setPeer === peerBytes32 ? '✅' : '❌'}`);
        console.log(`Options configured: ${setOptions === enforcedOptions ? '✅' : '❌'}`);
        
        console.log("\\n📝 Next step: Update Polygon adapter to point to new Sepolia adapter");
        console.log("Run: npx hardhat run scripts/configureNewAdapterPeers.js --network polygon-amoy");
        
    } else if (networkName === "polygon-amoy") {
        console.log("\\nUpdating Polygon adapter to point to new Sepolia adapter...");
        console.log(`Polygon adapter: ${adapters["polygon-amoy"].current}`);
        console.log(`Old Sepolia peer: ${adapters["polygon-amoy"].oldPeer}`);
        console.log(`New Sepolia peer: ${adapters["polygon-amoy"].newPeer}`);
        
        // Get the existing adapter contract
        const adapter = await ethers.getContractAt("PropertyOFTAdapter", adapters["polygon-amoy"].current);
        
        // Update peer to point to new Sepolia adapter
        const newPeerBytes32 = ethers.zeroPadValue(adapters["polygon-amoy"].newPeer, 32);
        console.log(`\\nUpdating peer for EID ${adapters["polygon-amoy"].peerEid}...`);
        console.log(`New peer: ${adapters["polygon-amoy"].newPeer}`);
        console.log(`New peer bytes32: ${newPeerBytes32}`);
        
        const setPeerTx = await adapter.setPeer(adapters["polygon-amoy"].peerEid, newPeerBytes32);
        await setPeerTx.wait();
        console.log("✅ Polygon adapter updated to point to new Sepolia adapter");
        
        // Verify the update
        console.log("\\n=== Verification ===");
        const updatedPeer = await adapter.peers(adapters["polygon-amoy"].peerEid);
        console.log(`Updated peer: ${updatedPeer}`);
        console.log(`Correctly updated: ${updatedPeer === newPeerBytes32 ? '✅' : '❌'}`);
        
        console.log("\\n✅ Cross-chain peer configuration complete!");
        console.log("Both adapters are now properly connected for testing");
        
    } else {
        console.log("❌ Unknown network. Run on either sepolia or polygon-amoy");
        return;
    }
    
    console.log("\\n🚀 Ready for cross-chain testing!");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("\\n❌ Configuration failed:", error);
        process.exit(1);
    });