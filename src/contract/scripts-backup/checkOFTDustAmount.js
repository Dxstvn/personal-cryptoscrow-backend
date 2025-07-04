import pkg from "hardhat";
const { ethers } = pkg;

async function main() {
    console.log("=== Checking OFT Dust Amount ===\n");
    
    const [signer] = await ethers.getSigners();
    const adapterAddress = "0x90653738e66A0fa93BF20b087e6A39A704FA39e1";
    
    // Get the adapter contract bytecode to look for dust amount
    const code = await ethers.provider.getCode(adapterAddress);
    console.log("Contract deployed:", code !== "0x");
    
    // The InvalidAmount error with data 0x000...000 suggests amount is 0
    // This could be due to dust protection
    
    // Let's check the LayerZero OFT implementation
    // According to docs, there might be a minimum amount based on shared decimals
    
    const adapter = await ethers.getContractAt(
        "PropertyOFTAdapter",
        adapterAddress
    );
    
    const sharedDecimals = await adapter.sharedDecimals();
    console.log("\nShared decimals:", sharedDecimals);
    
    // In LayerZero OFT, there's often a dust amount protection
    // The dust amount is typically 1 unit in shared decimals
    const dustInSharedDecimals = 1n;
    const decimalConversionRate = 10n ** (18n - sharedDecimals);
    const minAmountLD = dustInSharedDecimals * decimalConversionRate;
    
    console.log("\nPotential dust amount:");
    console.log("Dust in shared decimals:", dustInSharedDecimals);
    console.log("Minimum amount in local decimals:", minAmountLD.toString());
    console.log("Minimum amount in WETH:", ethers.formatEther(minAmountLD));
    
    // But wait - we've been trying with amounts much larger than this
    // Let's check if the issue is something else
    
    console.log("\n=== Checking Alternative Issues ===");
    
    // 1. Check if we need to use a different struct format
    console.log("\n1. Testing with different amounts above dust:");
    
    const testAmounts = [
        minAmountLD,                    // Minimum dust amount
        minAmountLD * 10n,              // 10x dust
        minAmountLD * 100n,             // 100x dust
        minAmountLD * 1000n,            // 1000x dust
        ethers.parseEther("0.000001"),  // 1 unit in shared decimals
        ethers.parseEther("0.00001"),   // 10 units
        ethers.parseEther("0.0001"),    // 100 units
        ethers.parseEther("0.001"),     // 1000 units
        ethers.parseEther("0.01"),      // 10000 units
        ethers.parseEther("0.1"),       // 100000 units
    ];
    
    for (const amount of testAmounts) {
        const amountSD = amount / decimalConversionRate;
        console.log(`\nTesting ${ethers.formatEther(amount)} WETH (${amountSD} in SD):`);
        
        const sendParam = {
            dstEid: 40267,
            to: ethers.zeroPadValue(signer.address, 32),
            amountLD: amount,
            minAmountLD: amount,
            extraOptions: "0x",
            composeMsg: "0x",
            oftCmd: "0x"
        };
        
        try {
            await adapter.quoteSend.staticCall(sendParam, false);
            console.log("✅ Success! This amount works.");
            console.log("The minimum working amount is:", ethers.formatEther(amount), "WETH");
            break;
        } catch (e) {
            if (e.data && e.data.includes("6780cfaf")) {
                // Check the error data
                const errorData = e.data.slice(10); // Remove function selector
                if (errorData === "0".repeat(64)) {
                    console.log("❌ Amount becomes 0 after processing");
                } else {
                    console.log("❌ InvalidAmount with data:", errorData);
                }
            } else {
                console.log("❌ Different error:", e.message.substring(0, 30) + "...");
            }
        }
    }
    
    // 2. Maybe the issue is with the token itself
    console.log("\n2. Checking if WETH needs special handling:");
    
    const weth = await ethers.getContractAt(
        ["function decimals() view returns (uint8)"],
        await adapter.token()
    );
    
    const wethDecimals = await weth.decimals();
    console.log("WETH decimals:", wethDecimals);
    console.log("Expected decimals: 18");
    console.log("Decimals match:", wethDecimals === 18n);
    
    // 3. Final theory - maybe we need to check the source code
    console.log("\n3. Understanding the error:");
    console.log("The InvalidAmount error with data 0x000...000 means:");
    console.log("- The amount after conversion/validation is 0");
    console.log("- This could happen if there's a calculation error");
    console.log("- Or if there's validation we're not aware of");
    
    console.log("\n=== Conclusion ===");
    console.log("The persistent InvalidAmount error suggests:");
    console.log("1. There might be an issue with the OFT adapter deployment");
    console.log("2. Or we're missing a critical initialization step");
    console.log("3. Or there's a bug in the adapter implementation");
    console.log("\nConsider using LayerZero's official OFT examples or support.");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("\n❌ Script failed:", error);
        process.exit(1);
    });