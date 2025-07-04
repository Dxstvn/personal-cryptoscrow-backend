import pkg from "hardhat";
const { ethers } = pkg;

async function main() {
    console.log("=== Initializing OFT Adapter ===\n");
    
    const [signer] = await ethers.getSigners();
    console.log("Account:", signer.address);
    
    const adapterAddress = "0x90653738e66A0fa93BF20b087e6A39A704FA39e1";
    const adapter = await ethers.getContractAt(
        "PropertyOFTAdapter",
        adapterAddress
    );
    
    const weth = await ethers.getContractAt(
        ["function deposit() payable",
         "function transfer(address, uint256) returns (bool)",
         "function balanceOf(address) view returns (uint256)",
         "function approve(address, uint256) returns (bool)"],
        await adapter.token()
    );
    
    console.log("Adapter:", adapter.target);
    console.log("Token:", await weth.getAddress());
    
    // Check current balances
    const adapterBalance = await weth.balanceOf(adapter.target);
    const userBalance = await weth.balanceOf(signer.address);
    
    console.log("\nCurrent balances:");
    console.log("Adapter WETH balance:", ethers.formatEther(adapterBalance));
    console.log("User WETH balance:", ethers.formatEther(userBalance));
    
    // Standard OFT adapters might not need initial liquidity
    // Let's check if this is actually the issue
    console.log("\n=== Testing Theory ===");
    console.log("Standard OFT adapters should lock tokens when sending");
    console.log("and unlock them when receiving.");
    
    // Let's look at the error more carefully
    console.log("\nAnalyzing the error 0x6780cfaf (InvalidAmount)...");
    
    // This error might be coming from a different check
    // Let's try to call the adapter's functions more directly
    
    console.log("\nChecking if we can access internal functions...");
    
    try {
        // Try to understand the credit system
        // OFT contracts track credits internally
        const credit = await adapter.credit(signer.address);
        console.log("User credit:", credit.toString());
    } catch {
        console.log("No credit function accessible");
    }
    
    // Let's try a different approach - check if the issue is with message encoding
    console.log("\nTrying with different message formats...");
    
    const polygonEid = 40267;
    const amount = ethers.parseEther("0.1");
    
    // Test 1: Try with compose message that might be expected
    const sendParams1 = {
        dstEid: polygonEid,
        to: ethers.zeroPadValue(signer.address, 32),
        amountLD: amount,
        minAmountLD: amount,
        extraOptions: "0x",
        composeMsg: "0x", // Empty compose message
        oftCmd: "0x"
    };
    
    console.log("\nTest 1: Standard parameters");
    try {
        const result = await adapter.quoteSend.staticCall(sendParams1, false);
        console.log("✅ Success! Fee:", ethers.formatEther(result[0]));
    } catch (e) {
        console.log("❌ Failed");
        
        // Let's check if the oftCmd is the issue
        console.log("\nTest 2: Without oftCmd");
        const sendParams2 = {
            dstEid: polygonEid,
            to: ethers.zeroPadValue(signer.address, 32),
            amountLD: amount,
            minAmountLD: amount,
            extraOptions: "0x",
            composeMsg: "0x"
            // No oftCmd
        };
        
        try {
            const result = await adapter.quoteSend.staticCall(sendParams2, false);
            console.log("✅ Success! Fee:", ethers.formatEther(result[0]));
        } catch (e2) {
            console.log("❌ Failed");
            
            // Maybe the issue is the decimal conversion
            console.log("\nTest 3: Checking decimal conversion");
            
            // Get the exact conversion
            const sharedDecimals = await adapter.sharedDecimals();
            const localDecimals = 18n;
            const decimalConversionRate = await adapter.decimalConversionRate();
            
            console.log("Decimal conversion rate:", decimalConversionRate.toString());
            console.log("Expected rate:", (10n ** (localDecimals - sharedDecimals)).toString());
            
            // The InvalidAmount error with data 0x00...00 suggests
            // the amount is becoming 0 after some calculation
            
            console.log("\nFinal analysis:");
            console.log("The error suggests the amount is invalid.");
            console.log("This could be because:");
            console.log("1. The decimal conversion is resulting in 0");
            console.log("2. There's a minimum amount requirement");
            console.log("3. The OFT adapter has additional validation");
            
            // Let's try one more thing - check if it's a configuration issue
            console.log("\nChecking endpoint configuration one more time...");
            
            const endpoint = await adapter.endpoint();
            console.log("Endpoint:", endpoint);
            
            // Check if the adapter is properly initialized with the endpoint
            const endpointContract = await ethers.getContractAt(
                ["function isValidSender(uint32 srcEid, bytes32 sender) view returns (bool)"],
                endpoint
            );
            
            try {
                const peer = await adapter.peers(polygonEid);
                const isValid = await endpointContract.isValidSender(polygonEid, peer);
                console.log("Is peer a valid sender:", isValid);
            } catch {
                console.log("Could not check valid sender");
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