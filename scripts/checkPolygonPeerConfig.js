import pkg from "hardhat";
const { ethers } = pkg;
import fs from "fs";

async function main() {
    console.log("=== Checking Polygon OFT Adapter Peer Configuration ===\n");
    
    // Note: This script should be run on polygon-amoy network
    const network = await ethers.provider.getNetwork();
    console.log("Current network:", network.name || `Chain ID ${network.chainId}`);
    
    if (network.chainId !== 80002n) {
        console.log("\n⚠️  WARNING: This script should be run on polygon-amoy network!");
        console.log("   Run with: npx hardhat run scripts/checkPolygonPeerConfig.js --network polygon-amoy");
        return;
    }
    
    const [signer] = await ethers.getSigners();
    console.log("Checking with account:", signer.address);
    
    // Load deployments
    const deployments = JSON.parse(fs.readFileSync('./deployments/testnet-deployments.json', 'utf8'));
    
    // Get Polygon adapter
    const polygonAdapter = await ethers.getContractAt(
        "PropertyMintBurnOFTAdapterV2",
        deployments["polygon-amoy"].oftAdapters.WPOL.address
    );
    
    console.log("\nPolygon OFT Adapter:", polygonAdapter.target);
    
    // Check peer configuration for Sepolia
    const sepoliaEid = 40161;
    const sepoliaPeer = await polygonAdapter.peers(sepoliaEid);
    
    console.log("\n📋 Peer Configuration:");
    console.log(`Sepolia (EID ${sepoliaEid}): ${sepoliaPeer}`);
    console.log(`Is configured: ${sepoliaPeer !== ethers.ZeroAddress}`);
    
    if (sepoliaPeer !== ethers.ZeroAddress) {
        // Compare with expected
        const expectedPeer = ethers.zeroPadValue(
            deployments.sepolia.oftAdapters.WETH.address,
            32
        );
        console.log(`Expected peer: ${expectedPeer}`);
        console.log(`Matches: ${sepoliaPeer.toLowerCase() === expectedPeer.toLowerCase()}`);
    }
    
    // Check owner
    const owner = await polygonAdapter.owner();
    console.log("\n👤 Owner:", owner);
    console.log(`Is signer the owner: ${owner.toLowerCase() === signer.address.toLowerCase()}`);
    
    // Check delegate
    const endpoint = await polygonAdapter.endpoint();
    console.log("\n🔗 Endpoint:", endpoint);
    
    try {
        // Check if delegate is set
        const delegateABI = ["function delegates(address) view returns (address)"];
        const endpointContract = new ethers.Contract(endpoint, delegateABI, signer);
        const delegate = await endpointContract.delegates(polygonAdapter.target);
        console.log("Delegate:", delegate);
    } catch (e) {
        console.log("Could not check delegate:", e.message);
    }
    
    // Check enforced options
    console.log("\n⚙️  Enforced Options:");
    try {
        const enforcedOption = await polygonAdapter.enforcedOptions(sepoliaEid, 1);
        console.log(`For Sepolia (msgType 1): ${enforcedOption}`);
        console.log(`Is configured: ${enforcedOption !== "0x"}`);
    } catch (e) {
        console.log("Could not check enforced options:", e.message);
    }
    
    console.log("\n💡 Next Steps:");
    if (sepoliaPeer === ethers.ZeroAddress) {
        console.log("1. Set peer for Sepolia on the Polygon adapter");
        console.log("2. Ensure delegate is set");
        console.log("3. Configure enforced options");
    } else {
        console.log("✅ Peer configuration looks good!");
        console.log("   Make sure enforced options and delegate are also configured");
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("\n❌ Script failed:", error);
        process.exit(1);
    });