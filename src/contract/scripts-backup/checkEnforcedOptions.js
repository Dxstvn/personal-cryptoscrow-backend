import pkg from "hardhat";
const { ethers } = pkg;

async function main() {
    console.log("=== Checking Enforced Options ===\n");
    
    const [signer] = await ethers.getSigners();
    console.log("Checking with account:", signer.address);
    
    // Hardcode the Sepolia adapter address
    const adapterAddress = "0x90653738e66A0fa93BF20b087e6A39A704FA39e1";
    
    // Get adapter contract
    const adapter = await ethers.getContractAt(
        "PropertyOFTAdapter",
        adapterAddress
    );
    
    console.log("Standard OFT Adapter:", adapter.target);
    
    // Check enforced options for different chains
    const endpoints = {
        'Polygon Amoy': 40267,
        'Arbitrum Sepolia': 40231
    };
    
    console.log("\nChecking enforced options:");
    for (const [name, eid] of Object.entries(endpoints)) {
        try {
            const options = await adapter.enforcedOptions(eid, 1); // msgType 1 = SEND
            console.log(`${name} (${eid}): ${options || "Not set"}`);
        } catch (error) {
            console.log(`${name} (${eid}): Error - ${error.message}`);
        }
    }
    
    // Try to decode if options are set
    console.log("\nChecking combined enforced options:");
    try {
        // Try the combinedOptions getter if available
        const combinedOptions = await adapter.combineOptions(40267, 1, "0x");
        console.log("Combined options for Polygon:", combinedOptions);
    } catch (error) {
        console.log("Could not get combined options:", error.message);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("\n❌ Script failed:", error);
        process.exit(1);
    });