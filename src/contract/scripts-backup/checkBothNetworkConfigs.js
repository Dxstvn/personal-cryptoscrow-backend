import pkg from "hardhat";
const { ethers } = pkg;

async function checkNetwork(networkName, adapterAddress, peerEid) {
    console.log(`\n=== ${networkName} Configuration ===`);
    
    const [signer] = await ethers.getSigners();
    const adapter = await ethers.getContractAt("PropertyOFTAdapter", adapterAddress);
    
    console.log("Adapter:", adapter.target);
    console.log("Token:", await adapter.token());
    console.log("Endpoint:", await adapter.endpoint());
    console.log("Owner:", await adapter.owner());
    console.log("Shared decimals:", await adapter.sharedDecimals());
    
    // Check peer
    const peer = await adapter.peers(peerEid);
    console.log(`Peer for EID ${peerEid}:`, peer);
    console.log("Is peer set:", peer !== ethers.ZeroAddress);
    
    // Check enforced options
    const enforcedOptions = await adapter.enforcedOptions(peerEid, 1);
    console.log("Enforced options:", enforcedOptions);
    
    // Check delegate
    const endpoint = await ethers.getContractAt(
        ["function delegates(address) view returns (address)"],
        await adapter.endpoint()
    );
    const delegate = await endpoint.delegates(adapter.target);
    console.log("Delegate:", delegate);
    
    // Try a simple amount check
    console.log("\nTesting amount conversions:");
    try {
        // Check if we can access toSD/toLD functions through the contract
        const testAmount = ethers.parseEther("1");
        console.log("1 ETH in wei:", testAmount.toString());
        
        // Try to understand the amount issue
        const sharedDecimals = await adapter.sharedDecimals();
        const localDecimals = 18n; // WETH decimals
        const decimalConversionRate = 10n ** (localDecimals - sharedDecimals);
        
        console.log("Decimal conversion rate:", decimalConversionRate.toString());
        console.log("1 ETH in shared decimals:", (testAmount / decimalConversionRate).toString());
        
    } catch (e) {
        console.log("Amount test error:", e.message);
    }
}

async function main() {
    console.log("=== Checking Both Network Configurations ===");
    
    const network = await ethers.provider.getNetwork();
    const networkName = network.chainId === 11155111n ? "Sepolia" :
                       network.chainId === 80002n ? "Polygon Amoy" : "Unknown";
    
    console.log(`\nCurrent network: ${networkName}`);
    
    const configs = {
        sepolia: {
            adapter: "0x90653738e66A0fa93BF20b087e6A39A704FA39e1",
            peerEid: 40267 // Polygon
        },
        polygonAmoy: {
            adapter: "0x12a9d0C6D06fEA1A584e98cd86aDC9EFdD7887df",
            peerEid: 40161 // Sepolia
        }
    };
    
    if (networkName === "Sepolia") {
        await checkNetwork("Sepolia", configs.sepolia.adapter, configs.sepolia.peerEid);
        console.log("\n\nTo check Polygon Amoy, run:");
        console.log("npx hardhat run scripts/checkBothNetworkConfigs.js --network polygon-amoy");
    } else if (networkName === "Polygon Amoy") {
        await checkNetwork("Polygon Amoy", configs.polygonAmoy.adapter, configs.polygonAmoy.peerEid);
        console.log("\n\nTo check Sepolia, run:");
        console.log("npx hardhat run scripts/checkBothNetworkConfigs.js --network sepolia");
    }
    
    // Additional debugging for the amount issue
    console.log("\n=== Debugging Amount Issue ===");
    console.log("The InvalidAmount error (0x6780cfaf) suggests:");
    console.log("1. The amount might be too small (dust amount)");
    console.log("2. The amount might not be properly aligned with decimal conversion");
    console.log("3. There might be a minimum transfer amount enforced");
    console.log("4. The OFT adapter might have additional validation");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("\n❌ Script failed:", error);
        process.exit(1);
    });