import pkg from "hardhat";
const { ethers } = pkg;

async function main() {
    console.log("=== Debugging OFT Adapter InvalidAmount Issue ===\n");
    
    const [signer] = await ethers.getSigners();
    console.log("Account:", signer.address);
    
    // Get the deployed OFT adapter
    const adapterAddress = "0x90653738e66A0fa93BF20b087e6A39A704FA39e1";
    
    // First, let's understand the contract's state
    console.log("1. Checking Contract State...");
    
    // Use a comprehensive ABI to access all functions
    const oftABI = [
        // Core OFT functions
        "function token() view returns (address)",
        "function sharedDecimals() view returns (uint8)",
        "function decimalConversionRate() view returns (uint256)",
        "function approvalRequired() view returns (bool)",
        "function endpoint() view returns (address)",
        "function owner() view returns (address)",
        
        // OFT specific
        "function peers(uint32 eid) view returns (bytes32)",
        "function enforcedOptions(uint32 eid, uint16 msgType) view returns (bytes)",
        
        // Credit system (if available)
        "function isCreditsEnabled() view returns (bool)",
        "function credits(address account) view returns (uint256)",
        
        // Amount conversion
        "function toLD(uint64 amountSD) view returns (uint256)",
        "function toSD(uint256 amountLD) view returns (uint64)",
        
        // Quote function
        "function quoteSend(tuple(uint32 dstEid, bytes32 to, uint256 amountLD, uint256 minAmountLD, bytes extraOptions, bytes composeMsg, bytes oftCmd) sendParam, bool payInLzToken) view returns (tuple(uint256 nativeFee, uint256 lzTokenFee) msgFee)"
    ];
    
    const adapter = new ethers.Contract(adapterAddress, oftABI, signer);
    
    try {
        console.log("\nBasic Info:");
        console.log("- Token:", await adapter.token());
        console.log("- Endpoint:", await adapter.endpoint());
        console.log("- Owner:", await adapter.owner());
        console.log("- Shared Decimals:", await adapter.sharedDecimals());
        console.log("- Decimal Conversion Rate:", await adapter.decimalConversionRate());
        console.log("- Approval Required:", await adapter.approvalRequired());
    } catch (e) {
        console.log("Error getting basic info:", e.message);
    }
    
    // Check credit system
    console.log("\n2. Checking Credit System...");
    try {
        const creditsEnabled = await adapter.isCreditsEnabled();
        console.log("Credits enabled:", creditsEnabled);
        
        if (creditsEnabled) {
            const credits = await adapter.credits(signer.address);
            console.log("User credits:", credits.toString());
        }
    } catch (e) {
        console.log("Credit system not available or different interface");
    }
    
    // Test amount conversions
    console.log("\n3. Testing Amount Conversions...");
    const sharedDecimals = await adapter.sharedDecimals();
    const rate = await adapter.decimalConversionRate();
    
    console.log(`\nConversion Info:`);
    console.log(`- Token decimals: 18 (WETH)`);
    console.log(`- Shared decimals: ${sharedDecimals}`);
    console.log(`- Conversion rate: ${rate} (10^${18n - sharedDecimals})`);
    
    // Test specific amounts
    const testAmounts = [
        ethers.parseEther("0.000001"), // Minimum possible with 6 shared decimals
        ethers.parseEther("0.0001"),
        ethers.parseEther("0.01"),
        ethers.parseEther("0.1"),
        ethers.parseEther("1"),
    ];
    
    console.log("\n4. Testing toSD conversions:");
    for (const amount of testAmounts) {
        try {
            const amountSD = await adapter.toSD(amount);
            console.log(`${ethers.formatEther(amount)} WETH => ${amountSD} SD`);
        } catch (e) {
            console.log(`${ethers.formatEther(amount)} WETH => ERROR: ${e.message}`);
        }
    }
    
    // Check if there's a dust amount
    console.log("\n5. Checking for Dust Amount...");
    
    // OFT contracts often have a dust amount to prevent rounding issues
    // This is typically stored as an immutable variable
    // Let's try different amounts to find the threshold
    
    const polygonEid = 40267;
    
    // First check if peer is set
    const peer = await adapter.peers(polygonEid);
    console.log(`\nPolygon peer: ${peer}`);
    console.log(`Is peer set: ${peer !== ethers.zeroPadValue("0x", 32)}`);
    
    // Check enforced options
    try {
        const enforcedOptions = await adapter.enforcedOptions(polygonEid, 1); // 1 = SEND
        console.log(`Enforced options: ${enforcedOptions || "Not set"}`);
    } catch (e) {
        console.log("Enforced options error:", e.message);
    }
    
    // Now test quoteSend with different amounts
    console.log("\n6. Testing quoteSend with different amounts:");
    
    for (const amount of testAmounts) {
        const sendParam = {
            dstEid: polygonEid,
            to: ethers.zeroPadValue(signer.address, 32),
            amountLD: amount,
            minAmountLD: amount,
            extraOptions: "0x",
            composeMsg: "0x",
            oftCmd: "0x"
        };
        
        try {
            const fee = await adapter.quoteSend(sendParam, false);
            console.log(`✅ ${ethers.formatEther(amount)} WETH: Fee = ${ethers.formatEther(fee.nativeFee)} ETH`);
            
            // If this works, we found the minimum amount
            console.log("\n🎉 Found working amount!");
            console.log(`Minimum amount: ${ethers.formatEther(amount)} WETH`);
            break;
        } catch (e) {
            const errorData = e.data || "";
            if (errorData.includes("6780cfaf")) {
                console.log(`❌ ${ethers.formatEther(amount)} WETH: InvalidAmount`);
            } else {
                console.log(`❌ ${ethers.formatEther(amount)} WETH: ${e.message.substring(0, 50)}...`);
            }
        }
    }
    
    console.log("\n=== Analysis ===");
    console.log("The InvalidAmount error is likely due to:");
    console.log("1. Amount too small (dust protection)");
    console.log("2. Decimal conversion resulting in 0");
    console.log("3. Credit system not initialized");
    console.log("4. Missing contract initialization");
    
    console.log("\nRecommendations:");
    console.log("1. Try larger amounts (>= 0.01 WETH)");
    console.log("2. Check if contract needs initialization");
    console.log("3. Verify endpoint configuration");
    console.log("4. Consider using the advanced OFT adapter with better error handling");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("\n❌ Script failed:", error);
        process.exit(1);
    });