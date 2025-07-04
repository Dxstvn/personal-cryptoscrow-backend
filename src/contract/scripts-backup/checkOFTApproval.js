import pkg from "hardhat";
const { ethers } = pkg;

async function main() {
    console.log("=== Checking OFT Approval Requirements ===\n");
    
    const [signer] = await ethers.getSigners();
    console.log("Account:", signer.address);
    
    const adapterAddress = "0x90653738e66A0fa93BF20b087e6A39A704FA39e1";
    const adapter = await ethers.getContractAt(
        "PropertyOFTAdapter",
        adapterAddress
    );
    
    console.log("Adapter:", adapter.target);
    console.log("Approval required:", await adapter.approvalRequired());
    
    // Check if there are any other approval-related functions
    console.log("\nChecking for approval functions...");
    
    try {
        // Check if there's a setApprovalRequired function
        const isApprovalRequired = await adapter.approvalRequired();
        console.log("Current approvalRequired:", isApprovalRequired);
        
        // OFT adapters might have additional setup requirements
        // Let's check the token and adapter interaction
        const token = await adapter.token();
        const weth = await ethers.getContractAt(
            ["function balanceOf(address) view returns (uint256)",
             "function allowance(address, address) view returns (uint256)"],
            token
        );
        
        console.log("\nToken checks:");
        console.log("Adapter's token balance:", ethers.formatEther(await weth.balanceOf(adapter.target)));
        console.log("User's token balance:", ethers.formatEther(await weth.balanceOf(signer.address)));
        console.log("User's allowance to adapter:", ethers.formatEther(await weth.allowance(signer.address, adapter.target)));
        
        // Check if there's a credit system
        console.log("\nChecking for credit/deposit system...");
        
        // Some OFT adapters require depositing tokens first
        // Let's see if we can find related functions
        const possibleFunctions = [
            "deposit",
            "credit", 
            "balanceOf",
            "totalSupply",
            "mint",
            "credits"
        ];
        
        for (const func of possibleFunctions) {
            try {
                const result = await adapter[func](signer.address);
                console.log(`${func}(user):`, result.toString());
            } catch {
                // Function doesn't exist
            }
        }
        
        // Check if we need to deposit tokens into the adapter first
        console.log("\n=== Potential Solution ===");
        console.log("The OFT adapter might require one of these:");
        console.log("1. Depositing tokens into the adapter first");
        console.log("2. Calling a specific initialization function");
        console.log("3. Having the adapter hold tokens as liquidity");
        
        // Let's check the contract ABI for any obvious functions
        console.log("\nChecking contract interface...");
        
        // Try to see if there's an obvious deposit or wrap function
        try {
            // Standard OFT adapters usually just need approval
            // But let's verify the flow
            console.log("\nTrying to understand the _debit flow...");
            
            // The error 0x6780cfaf is InvalidAmount
            // This could mean:
            // 1. Amount is 0 after conversion
            // 2. Amount doesn't meet minimum requirements
            // 3. Adapter doesn't have enough liquidity
            
            // Let's check shared decimals again
            const sharedDecimals = await adapter.sharedDecimals();
            console.log("Shared decimals:", sharedDecimals);
            
            // Test with exact shared decimal amounts
            const testAmounts = [
                1n * 10n**sharedDecimals,      // 1 unit in shared decimals
                10n * 10n**sharedDecimals,     // 10 units
                100n * 10n**sharedDecimals,    // 100 units
                1000n * 10n**sharedDecimals,   // 1000 units
            ];
            
            console.log("\nTesting with exact shared decimal amounts:");
            for (const amountSD of testAmounts) {
                // Convert to local decimals (18 for WETH)
                const amountLD = amountSD * 10n**(18n - sharedDecimals);
                console.log(`\nAmount SD: ${amountSD} (${amountSD / 10n**sharedDecimals} units)`);
                console.log(`Amount LD: ${amountLD} (${ethers.formatEther(amountLD)} WETH)`);
                
                const sendParams = {
                    dstEid: 40267,
                    to: ethers.zeroPadValue(signer.address, 32),
                    amountLD: amountLD,
                    minAmountLD: amountLD,
                    extraOptions: "0x",
                    composeMsg: "0x",
                    oftCmd: "0x"
                };
                
                try {
                    const [fee] = await adapter.quoteSend.staticCall(sendParams, false);
                    console.log(`✅ Success! Fee: ${ethers.formatEther(fee)} ETH`);
                    console.log("\nFound working amount! The issue was the amount format.");
                    break;
                } catch (e) {
                    console.log("❌ Failed");
                }
            }
            
        } catch (e) {
            console.log("Error during testing:", e.message);
        }
        
    } catch (error) {
        console.error("Error:", error.message);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("\n❌ Script failed:", error);
        process.exit(1);
    });