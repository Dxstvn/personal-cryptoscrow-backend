import pkg from "hardhat";
const { ethers } = pkg;

async function main() {
    console.log("=== Direct OFT Debugging ===\n");
    
    const [signer] = await ethers.getSigners();
    console.log("Account:", signer.address);
    
    // Get adapter
    const adapter = await ethers.getContractAt(
        "PropertyOFTAdapter",
        "0x90653738e66A0fa93BF20b087e6A39A704FA39e1"
    );
    
    // Get token
    const weth = await ethers.getContractAt(
        ["function balanceOf(address) view returns (uint256)",
         "function allowance(address, address) view returns (uint256)"],
        await adapter.token()
    );
    
    console.log("Adapter balance:", ethers.formatEther(await weth.balanceOf(adapter.target)));
    console.log("User balance:", ethers.formatEther(await weth.balanceOf(signer.address)));
    console.log("Allowance:", ethers.formatEther(await weth.allowance(signer.address, adapter.target)));
    
    // Try to understand the credit system
    console.log("\nChecking OFT internals:");
    
    try {
        // Check if there's a balance in the adapter
        const adapterBalance = await adapter.balanceOf(signer.address);
        console.log("OFT balance of user:", adapterBalance.toString());
    } catch (e) {
        console.log("No balanceOf function");
    }
    
    // Let's try the _debit function indirectly by attempting a send
    console.log("\nTrying minimal send...");
    
    const polygonEid = 40267;
    const amount = ethers.parseEther("0.1"); // 0.1 WETH
    
    // First, let's see if we can simulate the _debit
    console.log("Amount to send:", ethers.formatEther(amount));
    console.log("Amount in shared decimals:", amount / 10n**12n);
    
    // Build send params
    const sendParams = {
        dstEid: polygonEid,
        to: ethers.zeroPadValue(signer.address, 32),
        amountLD: amount,
        minAmountLD: amount,
        extraOptions: "0x",
        composeMsg: "0x",
        oftCmd: "0x"
    };
    
    // Try different approaches
    console.log("\n1. Checking if it's a rounding issue:");
    
    // Make sure amount is divisible by decimal conversion rate
    const sharedDecimals = 6n;
    const localDecimals = 18n;
    const conversionRate = 10n ** (localDecimals - sharedDecimals);
    
    // Round to nearest shared decimal
    const amountSD = amount / conversionRate;
    const amountLDRounded = amountSD * conversionRate;
    
    console.log("Original amount:", amount.toString());
    console.log("Rounded amount:", amountLDRounded.toString());
    console.log("Difference:", (amount - amountLDRounded).toString());
    
    if (amount !== amountLDRounded) {
        console.log("Amount was not properly aligned! Trying with rounded amount...");
        sendParams.amountLD = amountLDRounded;
        sendParams.minAmountLD = amountLDRounded;
    }
    
    try {
        const [fee] = await adapter.quoteSend(sendParams, false);
        console.log("✅ Success with rounded amount! Fee:", ethers.formatEther(fee));
    } catch (e) {
        console.log("❌ Still failing with rounded amount");
        
        // Try to understand if it's a different issue
        console.log("\n2. Checking if adapter needs initialization:");
        
        // Some OFT adapters need to have tokens deposited first
        // or have a specific initialization
        
        console.log("\n3. Let's try with compose message:");
        sendParams.composeMsg = ethers.AbiCoder.defaultAbiCoder().encode(
            ["uint256"],
            [0]
        );
        
        try {
            const [fee] = await adapter.quoteSend(sendParams, false);
            console.log("✅ Success with compose message! Fee:", ethers.formatEther(fee));
        } catch (e2) {
            console.log("❌ Still failing");
            
            // Final attempt - check if it's expecting a different message format
            console.log("\n4. Checking error details:");
            if (e2.data) {
                console.log("Error data:", e2.data);
                
                // The error 0x6780cfaf with data 0x00...00 suggests
                // the amount after conversion is 0
                console.log("\nThis suggests the amount is becoming 0 after conversion.");
                console.log("Let's try a much larger amount:");
                
                const largeAmount = ethers.parseEther("10"); // 10 WETH
                sendParams.amountLD = largeAmount;
                sendParams.minAmountLD = largeAmount;
                
                try {
                    const [fee] = await adapter.quoteSend(sendParams, false);
                    console.log("✅ Success with 10 WETH! Fee:", ethers.formatEther(fee));
                } catch (e3) {
                    console.log("❌ Even 10 WETH fails");
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