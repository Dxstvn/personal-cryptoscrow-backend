import pkg from "hardhat";
const { ethers } = pkg;

async function main() {
    console.log("=== Deploying Simple OFT (Not Adapter) ===\n");
    
    const [deployer] = await ethers.getSigners();
    console.log("Deploying with account:", deployer.address);
    
    // For testing, let's deploy a simple OFT token instead of an adapter
    // This will help us understand if the issue is with the adapter or our setup
    
    const lzEndpoint = "0x6EDCE65403992e310A62460808c4b910D972f10f";
    
    console.log("\nDeploying OFT token (not adapter)...");
    
    // First, let's create a simple OFT implementation
    const OFTFactory = await ethers.getContractFactory("contracts/SimpleOFT.sol:SimpleOFT");
    
    console.log("Note: This requires creating a SimpleOFT contract.");
    console.log("Since we're using an adapter, let's check what might be wrong.");
    
    // Instead, let's verify our adapter setup more thoroughly
    console.log("\n=== Checking OFT Adapter Requirements ===");
    
    const adapterAddress = "0x90653738e66A0fa93BF20b087e6A39A704FA39e1";
    const adapter = await ethers.getContractAt(
        "PropertyOFTAdapter",
        adapterAddress
    );
    
    // Check all the basics
    console.log("\n1. Basic Configuration:");
    console.log("Adapter:", adapter.target);
    console.log("Token:", await adapter.token());
    console.log("Endpoint:", await adapter.endpoint());
    console.log("Owner:", await adapter.owner());
    
    // Check if we need to set additional configuration
    console.log("\n2. Checking for missing setup:");
    
    try {
        // Some OFT implementations need explicit setup
        const isSetup = await adapter.isInitialized?.();
        console.log("Is initialized:", isSetup);
    } catch {
        console.log("No initialization check available");
    }
    
    // The InvalidAmount error suggests the amount validation is failing
    // This could be due to:
    console.log("\n3. Possible causes of InvalidAmount:");
    console.log("a) Dust amount protection - amount too small");
    console.log("b) Decimal conversion issues");
    console.log("c) Missing configuration on the adapter");
    console.log("d) The adapter expects a different token standard");
    
    // Let's check if WETH is the issue
    console.log("\n4. WETH Compatibility:");
    console.log("WETH is an ERC20 but with special deposit/withdraw");
    console.log("Standard OFT adapter should work with any ERC20");
    
    // Alternative approach
    console.log("\n=== Alternative Solution ===");
    console.log("Instead of using PropertyOFTAdapter, we could:");
    console.log("1. Deploy a wrapped version of WETH that's OFT-native");
    console.log("2. Use LayerZero's official WETH OFT if available");
    console.log("3. Debug the exact validation that's failing");
    
    // Let's try to understand the exact error
    console.log("\n5. Understanding InvalidAmount (0x6780cfaf):");
    
    // The error data is all zeros, which suggests:
    console.log("The error data (0x000...000) suggests the amount is 0");
    console.log("This could mean:");
    console.log("- The decimal conversion is causing truncation");
    console.log("- There's a minimum dust amount we're not meeting");
    console.log("- The adapter has additional validation we're not aware of");
    
    // Final check - maybe we need to use the OFT Core instead
    console.log("\n6. OFT Core vs Adapter:");
    console.log("OFT Core: For new tokens that are OFT-native");
    console.log("OFT Adapter: For existing ERC20s (like WETH)");
    console.log("We're using the right type (Adapter)");
    
    console.log("\n=== Next Steps ===");
    console.log("1. Check LayerZero's official examples for WETH");
    console.log("2. Try with a different token (USDC) to isolate the issue");
    console.log("3. Contact LayerZero support or check their Discord");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("\n❌ Script failed:", error);
        process.exit(1);
    });