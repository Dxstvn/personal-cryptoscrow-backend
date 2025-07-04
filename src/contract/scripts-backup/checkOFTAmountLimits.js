import pkg from "hardhat";
const { ethers } = pkg;

async function main() {
    console.log("=== Checking OFT Amount Limits ===\n");
    
    const [signer] = await ethers.getSigners();
    console.log("Checking with account:", signer.address);
    
    // Get adapter
    const adapter = await ethers.getContractAt(
        "PropertyOFTAdapter",
        "0x90653738e66A0fa93BF20b087e6A39A704FA39e1"
    );
    
    const polygonEid = 40267;
    
    // Check if there's a dust amount
    console.log("1. Checking for dust amount...");
    try {
        // OFT contracts often have a dust amount to prevent small transfers
        const dustAmount = await adapter.dust();
        console.log("Dust amount:", dustAmount.toString());
    } catch (e) {
        console.log("No dust getter - might be internal");
    }
    
    // Check decimal conversion
    const sharedDecimals = await adapter.sharedDecimals();
    const tokenDecimals = 18n; // WETH
    const conversionFactor = 10n ** (tokenDecimals - sharedDecimals);
    
    console.log("\n2. Decimal information:");
    console.log("Shared decimals:", sharedDecimals);
    console.log("Token decimals:", tokenDecimals);
    console.log("Conversion factor:", conversionFactor);
    
    // Try different amounts
    console.log("\n3. Testing different amounts:");
    
    const testAmounts = [
        { shared: 1n, name: "1 unit in shared decimals" },
        { shared: 10n, name: "10 units in shared decimals" },
        { shared: 100n, name: "100 units in shared decimals" },
        { shared: 1000n, name: "1,000 units in shared decimals" },
        { shared: 10000n, name: "10,000 units in shared decimals" },
        { shared: 100000n, name: "100,000 units in shared decimals (0.1)" },
        { shared: 1000000n, name: "1,000,000 units in shared decimals (1.0)" }
    ];
    
    for (const test of testAmounts) {
        const amountLD = test.shared * conversionFactor;
        console.log(`\n${test.name}:`);
        console.log(`  Shared: ${test.shared}`);
        console.log(`  Local: ${amountLD}`);
        console.log(`  WETH: ${ethers.formatEther(amountLD)}`);
        
        try {
            const sendParams = {
                dstEid: polygonEid,
                to: ethers.zeroPadValue(signer.address, 32),
                amountLD: amountLD,
                minAmountLD: amountLD,
                extraOptions: "0x",
                composeMsg: "0x",
                oftCmd: "0x"
            };
            
            const [fee] = await adapter.quoteSend(sendParams, false);
            console.log(`  ✅ Quote success! Fee: ${ethers.formatEther(fee)} ETH`);
            break; // Found working amount
        } catch (e) {
            if (e.data && e.data.includes("6780cfaf")) {
                console.log("  ❌ InvalidAmount");
            } else {
                console.log(`  ❌ Error: ${e.message.substring(0, 50)}...`);
            }
        }
    }
    
    // Check if amount needs to be checked differently
    console.log("\n4. Checking amount conversion functions:");
    try {
        // Try to convert amounts
        const testAmountLD = ethers.parseEther("1"); // 1 WETH
        
        // These functions might exist
        const toSD = await adapter.toSD(testAmountLD);
        console.log("1 WETH toSD:", toSD.toString());
        
        const toLD = await adapter.toLD(toSD);
        console.log("Back toLD:", toLD.toString());
        console.log("Matches:", toLD === testAmountLD);
    } catch (e) {
        console.log("Conversion functions not directly accessible");
    }
    
    // Try to understand the error better
    console.log("\n5. Detailed error analysis:");
    try {
        // Try an amount that should definitely work
        const oneWETH = ethers.parseEther("1");
        const sendParams = {
            dstEid: polygonEid,
            to: ethers.zeroPadValue(signer.address, 32),
            amountLD: oneWETH,
            minAmountLD: oneWETH,
            extraOptions: "0x",
            composeMsg: "0x",
            oftCmd: "0x"
        };
        
        await adapter.quoteSend.staticCall(sendParams, false);
    } catch (e) {
        console.log("Error message:", e.message);
        if (e.data) {
            console.log("Error data:", e.data);
            
            // Try to decode any additional data
            if (e.data.length > 10) {
                const errorData = "0x" + e.data.slice(10);
                try {
                    const decoded = ethers.AbiCoder.defaultAbiCoder().decode(
                        ["uint256"],
                        errorData
                    );
                    console.log("Decoded error data:", decoded[0].toString());
                } catch {
                    console.log("Could not decode error data");
                }
            }
        }
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("\n❌ Script failed:", error);
        process.exit(1);
    });