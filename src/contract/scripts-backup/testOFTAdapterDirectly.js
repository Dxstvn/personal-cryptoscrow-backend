import pkg from "hardhat";
const { ethers } = pkg;

async function main() {
    console.log("=== Testing OFT Adapter Directly ===\n");
    
    const [signer] = await ethers.getSigners();
    console.log("Account:", signer.address);
    
    // The deployed adapter address
    const adapterAddress = "0x90653738e66A0fa93BF20b087e6A39A704FA39e1";
    
    // Comprehensive ABI including internal functions exposed for testing
    const testABI = [
        // Basic info
        "function token() view returns (address)",
        "function endpoint() view returns (address)",
        "function owner() view returns (address)",
        "function approvalRequired() view returns (bool)",
        "function sharedDecimals() view returns (uint8)",
        "function decimalConversionRate() view returns (uint256)",
        
        // OFT Core functions that might be accessible
        "function oftVersion() view returns (bytes4 interfaceId, uint64 version)",
        "function token() view returns (address)",
        "function approvalRequired() view returns (bool)",
        
        // Peer management
        "function peers(uint32 eid) view returns (bytes32)",
        "function isPeer(uint32 _eid, bytes32 _peer) view returns (bool)",
        
        // Try to access credit functions
        "function credits(address) view returns (uint256)",
        
        // Main functions
        "function quoteSend(tuple(uint32 dstEid, bytes32 to, uint256 amountLD, uint256 minAmountLD, bytes extraOptions, bytes composeMsg, bytes oftCmd) sendParam, bool payInLzToken) view returns (tuple(uint256 nativeFee, uint256 lzTokenFee) msgFee)",
        "function send(tuple(uint32 dstEid, bytes32 to, uint256 amountLD, uint256 minAmountLD, bytes extraOptions, bytes composeMsg, bytes oftCmd) sendParam, tuple(uint256 nativeFee, uint256 lzTokenFee) fee, address refundAddress) payable returns (tuple(bytes32 guid, uint64 nonce, tuple(uint256 nativeFee, uint256 lzTokenFee) fee))",
        
        // Events to check
        "event OFTSent(bytes32 indexed guid, uint32 dstEid, address indexed fromAddress, uint256 amountSentLD, uint256 amountReceivedLD)",
        "event OFTReceived(bytes32 indexed guid, uint32 srcEid, address indexed toAddress, uint256 amountReceivedLD)"
    ];
    
    const adapter = new ethers.Contract(adapterAddress, testABI, signer);
    
    // Get WETH contract
    const wethAddress = await adapter.token();
    const wethABI = [
        "function balanceOf(address) view returns (uint256)",
        "function allowance(address, address) view returns (uint256)",
        "function approve(address, uint256) returns (bool)",
        "function deposit() payable",
        "function decimals() view returns (uint8)"
    ];
    const weth = new ethers.Contract(wethAddress, wethABI, signer);
    
    console.log("OFT Adapter:", adapter.target);
    console.log("WETH Token:", wethAddress);
    
    // Check basic configuration
    console.log("\n1. Basic Configuration:");
    try {
        const version = await adapter.oftVersion();
        console.log("OFT Version:", version);
    } catch (e) {
        console.log("OFT Version: Not accessible");
    }
    
    console.log("Shared Decimals:", await adapter.sharedDecimals());
    console.log("Decimal Conversion Rate:", await adapter.decimalConversionRate());
    console.log("Approval Required:", await adapter.approvalRequired());
    
    // Check if we have WETH and approval
    console.log("\n2. Token Setup:");
    const balance = await weth.balanceOf(signer.address);
    console.log("WETH Balance:", ethers.formatEther(balance));
    
    if (balance < ethers.parseEther("0.1")) {
        console.log("Wrapping ETH...");
        await weth.deposit({ value: ethers.parseEther("0.1") });
    }
    
    const allowance = await weth.allowance(signer.address, adapter.target);
    console.log("Current Allowance:", ethers.formatEther(allowance));
    
    if (allowance < ethers.parseEther("1")) {
        console.log("Approving adapter...");
        const tx = await weth.approve(adapter.target, ethers.parseEther("1"));
        await tx.wait();
        console.log("✅ Approved");
    }
    
    // Check credits
    console.log("\n3. Checking Credits:");
    try {
        const credits = await adapter.credits(signer.address);
        console.log("User credits:", credits.toString());
    } catch (e) {
        console.log("Credits not accessible - this might be the issue!");
    }
    
    // Test with a specific amount that should work
    console.log("\n4. Testing Specific Amount:");
    const polygonEid = 40267;
    
    // Check peer first
    const peer = await adapter.peers(polygonEid);
    console.log("Polygon Peer:", peer);
    
    // Try a large amount to rule out dust issues
    const testAmount = ethers.parseEther("1"); // 1 WETH = 1,000,000 in shared decimals
    
    console.log("\nTest amount: 1 WETH");
    console.log("In wei:", testAmount.toString());
    console.log("In shared decimals:", testAmount / 10n**12n);
    
    const sendParam = {
        dstEid: polygonEid,
        to: ethers.zeroPadValue(signer.address, 32),
        amountLD: testAmount,
        minAmountLD: testAmount * 99n / 100n, // 1% slippage
        extraOptions: "0x",
        composeMsg: "0x",
        oftCmd: "0x"
    };
    
    console.log("\n5. Attempting quoteSend:");
    try {
        const quote = await adapter.quoteSend(sendParam, false);
        console.log("✅ Quote successful!");
        console.log("Native Fee:", ethers.formatEther(quote.nativeFee));
        console.log("LZ Token Fee:", quote.lzTokenFee.toString());
    } catch (error) {
        console.log("❌ Quote failed");
        console.log("Error:", error.message);
        
        // Try to decode the error
        if (error.data) {
            console.log("Error data:", error.data);
            
            // Common OFT errors
            const errors = {
                "0x6780cfaf": "InvalidAmount",
                "0x650c2276": "InsufficientAllowance",
                "0x2c5211c6": "InvalidTo",
                "0x82b42900": "Unauthorized"
            };
            
            const errorSig = error.data.slice(0, 10);
            if (errors[errorSig]) {
                console.log("Error type:", errors[errorSig]);
            }
            
            // If InvalidAmount, the data after selector might tell us more
            if (errorSig === "0x6780cfaf") {
                console.log("\nInvalidAmount Details:");
                console.log("This error occurs when:");
                console.log("1. Amount converts to 0 in shared decimals");
                console.log("2. Amount is below dust threshold");
                console.log("3. _debit function validation fails");
                
                // The error data is all zeros, suggesting amount is 0
                const errorData = error.data.slice(10);
                console.log("Error parameter:", "0x" + errorData);
                
                if (errorData === "0".repeat(64)) {
                    console.log("⚠️  The amount parameter in the error is 0!");
                    console.log("This suggests the amount is becoming 0 during processing.");
                }
            }
        }
    }
    
    console.log("\n=== Diagnosis ===");
    console.log("The persistent InvalidAmount error with data 0x000...000 indicates:");
    console.log("1. The amount is becoming 0 during internal processing");
    console.log("2. This could be due to:");
    console.log("   - Credit system not initialized (adapter might use credits internally)");
    console.log("   - Token transfer failing silently");
    console.log("   - Adapter expecting a different token interface");
    console.log("   - Missing initialization step");
    
    console.log("\n=== Recommendations ===");
    console.log("1. The OFT adapter might need credits to be deposited first");
    console.log("2. Try using sendToken() or credit() functions if available");
    console.log("3. Check if the adapter needs a different initialization");
    console.log("4. Consider that WETH might not be compatible with this adapter");
    console.log("5. Use the advanced OFT adapter with better error handling");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("\n❌ Script failed:", error);
        process.exit(1);
    });