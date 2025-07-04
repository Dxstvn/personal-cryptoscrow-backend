import pkg from "hardhat";
const { ethers } = pkg;

async function main() {
    console.log("=== Testing Simple OFT Send ===\n");
    
    const [signer] = await ethers.getSigners();
    console.log("Testing with account:", signer.address);
    
    // Get adapter
    const adapter = await ethers.getContractAt(
        "PropertyOFTAdapter",
        "0x90653738e66A0fa93BF20b087e6A39A704FA39e1"
    );
    
    // Get WETH
    const weth = await ethers.getContractAt(
        ["function deposit() payable",
         "function balanceOf(address) view returns (uint256)",
         "function approve(address, uint256) returns (bool)",
         "function allowance(address, address) view returns (uint256)"],
        await adapter.token()
    );
    
    const amount = ethers.parseEther("0.0001");
    
    // Ensure we have WETH
    const balance = await weth.balanceOf(signer.address);
    if (balance < amount) {
        console.log("Wrapping ETH...");
        await (await weth.deposit({ value: amount })).wait();
    }
    
    // Approve
    const allowance = await weth.allowance(signer.address, adapter.target);
    if (allowance < amount) {
        console.log("Approving...");
        await (await weth.approve(adapter.target, amount)).wait();
    }
    
    console.log("\nBalance:", ethers.formatEther(await weth.balanceOf(signer.address)));
    console.log("Allowance:", ethers.formatEther(await weth.allowance(signer.address, adapter.target)));
    
    // Try to get a quote with very simple parameters
    console.log("\nTrying quoteSend with different parameters...");
    
    const polygonEid = 40267;
    
    // Test 1: Minimal send params
    try {
        console.log("\n1. Minimal params:");
        const sendParams = {
            dstEid: polygonEid,
            to: ethers.zeroPadValue(signer.address, 32),
            amountLD: amount,
            minAmountLD: amount,
            extraOptions: "0x",
            composeMsg: "0x",
            oftCmd: "0x"
        };
        
        console.log("Params:", sendParams);
        const result = await adapter.quoteSend(sendParams, false);
        console.log("✅ Success! Fee:", ethers.formatEther(result[0]));
    } catch (e) {
        console.log("❌ Failed:", e.message);
        
        // Try to decode the error
        if (e.data) {
            console.log("Error data:", e.data);
            
            // Check if this is an OFT error
            const oftErrors = {
                "0x6780cfaf": "InvalidAmount",
                "0xf7c1b443": "InvalidOptions", 
                "0x1232c90f": "InvalidReceiver"
            };
            
            const errorSig = e.data.slice(0, 10);
            if (oftErrors[errorSig]) {
                console.log("OFT Error:", oftErrors[errorSig]);
            }
        }
    }
    
    // Test 2: Try with enforced options explicitly
    try {
        console.log("\n2. With enforced options:");
        
        // Get enforced options
        const enforcedOpts = await adapter.enforcedOptions(polygonEid, 1);
        console.log("Enforced options:", enforcedOpts);
        
        const sendParams = {
            dstEid: polygonEid,
            to: ethers.zeroPadValue(signer.address, 32),
            amountLD: amount,
            minAmountLD: amount,
            extraOptions: enforcedOpts,
            composeMsg: "0x",
            oftCmd: "0x"
        };
        
        const result = await adapter.quoteSend(sendParams, false);
        console.log("✅ Success! Fee:", ethers.formatEther(result[0]));
    } catch (e) {
        console.log("❌ Failed:", e.message);
    }
    
    // Test 3: Check if it's an amount issue
    try {
        console.log("\n3. With different amounts:");
        
        const amounts = [
            ethers.parseEther("1"),     // 1 WETH
            ethers.parseEther("0.1"),   // 0.1 WETH
            ethers.parseEther("0.01"),  // 0.01 WETH
            ethers.parseEther("0.001"), // 0.001 WETH
        ];
        
        for (const testAmount of amounts) {
            try {
                const sendParams = {
                    dstEid: polygonEid,
                    to: ethers.zeroPadValue(signer.address, 32),
                    amountLD: testAmount,
                    minAmountLD: testAmount,
                    extraOptions: "0x",
                    composeMsg: "0x",
                    oftCmd: "0x"
                };
                
                const result = await adapter.quoteSend(sendParams, false);
                console.log(`  ${ethers.formatEther(testAmount)} WETH: ✅ Fee = ${ethers.formatEther(result[0])} ETH`);
                break; // If one works, stop
            } catch (e) {
                console.log(`  ${ethers.formatEther(testAmount)} WETH: ❌`);
            }
        }
    } catch (e) {
        console.log("❌ All amounts failed");
    }
    
    // Test 4: Check adapter state
    console.log("\n4. Checking adapter state:");
    try {
        // Check if there's a minimum amount
        const decimals = await adapter.sharedDecimals();
        console.log("Shared decimals:", decimals);
        
        // Try to check credit
        const credit = await adapter.credit(signer.address);
        console.log("Credit:", credit);
    } catch (e) {
        console.log("State check error:", e.message);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("\n❌ Script failed:", error);
        process.exit(1);
    });