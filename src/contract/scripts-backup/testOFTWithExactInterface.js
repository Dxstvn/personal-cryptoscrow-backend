import pkg from "hardhat";
const { ethers } = pkg;

async function main() {
    console.log("=== Testing OFT with Exact LayerZero V2 Interface ===\n");
    
    const [signer] = await ethers.getSigners();
    console.log("Account:", signer.address);
    
    // Define the exact interface we need
    const oftAdapterABI = [
        "function token() view returns (address)",
        "function approvalRequired() view returns (bool)",
        "function quoteSend(tuple(uint32 dstEid, bytes32 to, uint256 amountLD, uint256 minAmountLD, bytes extraOptions, bytes composeMsg, bytes oftCmd) sendParam, bool payInLzToken) view returns (tuple(uint256 nativeFee, uint256 lzTokenFee) msgFee)",
        "function send(tuple(uint32 dstEid, bytes32 to, uint256 amountLD, uint256 minAmountLD, bytes extraOptions, bytes composeMsg, bytes oftCmd) sendParam, tuple(uint256 nativeFee, uint256 lzTokenFee) fee, address refundAddress) payable returns (tuple(bytes32 guid, uint64 nonce, tuple(uint256 nativeFee, uint256 lzTokenFee) fee))",
        "function sharedDecimals() view returns (uint8)",
        "function peers(uint32 eid) view returns (bytes32)",
        "function endpoint() view returns (address)",
        "function owner() view returns (address)",
        "function decimalConversionRate() view returns (uint256)"
    ];
    
    const adapter = new ethers.Contract(
        "0x90653738e66A0fa93BF20b087e6A39A704FA39e1",
        oftAdapterABI,
        signer
    );
    
    // Get WETH
    const weth = await ethers.getContractAt(
        ["function balanceOf(address) view returns (uint256)",
         "function allowance(address, address) view returns (uint256)",
         "function approve(address, uint256) returns (bool)"],
        await adapter.token()
    );
    
    console.log("OFT Adapter:", adapter.target);
    console.log("Token:", await weth.getAddress());
    console.log("Approval Required:", await adapter.approvalRequired());
    
    // Check user balance and allowance
    const userBalance = await weth.balanceOf(signer.address);
    const allowance = await weth.allowance(signer.address, adapter.target);
    
    console.log("\nUser WETH balance:", ethers.formatEther(userBalance));
    console.log("Allowance to adapter:", ethers.formatEther(allowance));
    
    // Polygon endpoint ID
    const polygonEid = 40267;
    
    // Check peer
    const peer = await adapter.peers(polygonEid);
    console.log("\nPolygon peer:", peer);
    console.log("Is peer set:", peer !== ethers.zeroPadValue("0x", 32));
    
    // Get decimals info
    const sharedDecimals = await adapter.sharedDecimals();
    const decimalConversionRate = await adapter.decimalConversionRate();
    
    console.log("\nDecimals:");
    console.log("Shared decimals:", sharedDecimals);
    console.log("Decimal conversion rate:", decimalConversionRate.toString());
    
    // Try with a properly formatted amount
    // Make sure it's divisible by the conversion rate
    const amountInEther = "1"; // 1 WETH
    const amountLD = ethers.parseEther(amountInEther);
    
    // Ensure amount is properly aligned
    const amountSD = amountLD / decimalConversionRate;
    const alignedAmountLD = amountSD * decimalConversionRate;
    
    console.log("\nAmount calculations:");
    console.log("Original amount:", ethers.formatEther(amountLD), "WETH");
    console.log("Amount in shared decimals:", amountSD.toString());
    console.log("Aligned amount:", ethers.formatEther(alignedAmountLD), "WETH");
    
    // Ensure we have approval
    if (allowance < alignedAmountLD) {
        console.log("\nApproving tokens...");
        const approveTx = await weth.approve(adapter.target, alignedAmountLD);
        await approveTx.wait();
        console.log("✅ Approved");
    }
    
    // Build the SendParam struct exactly as expected
    const sendParam = {
        dstEid: polygonEid,                               // uint32
        to: ethers.zeroPadValue(signer.address, 32),     // bytes32
        amountLD: alignedAmountLD,                       // uint256
        minAmountLD: alignedAmountLD,                    // uint256 (no slippage)
        extraOptions: "0x",                              // bytes (empty)
        composeMsg: "0x",                                // bytes (empty)
        oftCmd: "0x"                                     // bytes (empty)
    };
    
    console.log("\nSendParam:");
    console.log(JSON.stringify(sendParam, (key, value) => 
        typeof value === 'bigint' ? value.toString() : value, 2));
    
    // Try quoteSend
    console.log("\nCalling quoteSend...");
    try {
        const msgFee = await adapter.quoteSend(sendParam, false);
        console.log("\n✅ Quote successful!");
        console.log("Native fee:", ethers.formatEther(msgFee.nativeFee), "ETH");
        console.log("LZ token fee:", msgFee.lzTokenFee.toString());
        
        // If quote works, try the actual send
        const ethBalance = await ethers.provider.getBalance(signer.address);
        if (ethBalance >= msgFee.nativeFee) {
            console.log("\n🚀 Sending tokens...");
            const sendTx = await adapter.send(
                sendParam,
                msgFee,
                signer.address,
                { value: msgFee.nativeFee }
            );
            
            console.log("Transaction sent:", sendTx.hash);
            const receipt = await sendTx.wait();
            console.log("✅ Transaction confirmed!");
        }
        
    } catch (error) {
        console.error("\n❌ Error:", error.message);
        
        if (error.data) {
            console.log("Error data:", error.data);
            
            // Try to decode the error
            const errorSigs = {
                "0x6780cfaf": "InvalidAmount",
                "0x6592671c": "InvalidEndpointCall",
                "0xf7c1b443": "InvalidOptions"
            };
            
            const sig = error.data.slice(0, 10);
            if (errorSigs[sig]) {
                console.log("Error type:", errorSigs[sig]);
            }
        }
        
        // Additional debugging
        console.log("\n=== Debugging ===");
        console.log("1. Check if the adapter is paused or has restrictions");
        console.log("2. Verify the endpoint accepts the adapter as an OApp");
        console.log("3. Ensure all LayerZero configurations are complete");
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("\n❌ Script failed:", error);
        process.exit(1);
    });