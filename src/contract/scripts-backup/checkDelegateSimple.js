import pkg from "hardhat";
const { ethers } = pkg;

async function main() {
    console.log("=== Checking Standard OFT Adapter Delegate Configuration ===\n");
    
    const [signer] = await ethers.getSigners();
    console.log("Checking with account:", signer.address);
    
    // Hardcode the Sepolia adapter address we just found
    const adapterAddress = "0x90653738e66A0fa93BF20b087e6A39A704FA39e1";
    
    // Get adapter contract
    const adapter = await ethers.getContractAt(
        "PropertyOFTAdapter",
        adapterAddress
    );
    
    console.log("Standard OFT Adapter:", adapter.target);
    
    // Get endpoint
    const endpointAddress = await adapter.endpoint();
    console.log("Endpoint:", endpointAddress);
    
    // Check delegate on endpoint
    const endpointABI = [
        "function delegates(address oapp) view returns (address)"
    ];
    
    const endpoint = new ethers.Contract(endpointAddress, endpointABI, signer);
    
    try {
        const currentDelegate = await endpoint.delegates(adapter.target);
        console.log("\nCurrent delegate for adapter:", currentDelegate);
        console.log("Is delegate set:", currentDelegate !== ethers.ZeroAddress);
        console.log("Is signer the delegate:", currentDelegate.toLowerCase() === signer.address.toLowerCase());
        
        if (currentDelegate === ethers.ZeroAddress) {
            console.log("\n⚠️  No delegate set! This is likely why quoteSend is failing.");
            console.log("The adapter needs to set a delegate on the endpoint.");
            console.log("\nTo fix this, the adapter owner needs to call:");
            console.log(`adapter.setDelegate(signerAddress)`);
        }
        
    } catch (error) {
        console.log("Error checking delegate:", error.message);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("\n❌ Script failed:", error);
        process.exit(1);
    });