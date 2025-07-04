import pkg from "hardhat";
const { ethers } = pkg;

async function main() {
    console.log("=== Debug quoteSend Issue ===\n");
    
    const [signer] = await ethers.getSigners();
    console.log("Debugging with account:", signer.address);
    
    // Hardcode the Sepolia adapter address
    const adapterAddress = "0x90653738e66A0fa93BF20b087e6A39A704FA39e1";
    
    // Get adapter contract
    const adapter = await ethers.getContractAt(
        "PropertyOFTAdapter",
        adapterAddress
    );
    
    console.log("Standard OFT Adapter:", adapter.target);
    
    // Test amount
    const testAmount = ethers.parseEther("0.0001");
    const polygonEndpointId = 40267;
    
    // Try different send parameter variations
    console.log("\n1. Testing with minimal parameters:");
    try {
        const sendParam1 = {
            dstEid: polygonEndpointId,
            to: ethers.zeroPadValue(signer.address, 32),
            amountLD: testAmount,
            minAmountLD: testAmount, // No slippage
            extraOptions: "0x",
            composeMsg: "0x",
            oftCmd: "0x"
        };
        
        const [nativeFee1] = await adapter.quoteSend(sendParam1, false);
        console.log("✅ Success! Native fee:", ethers.formatEther(nativeFee1), "ETH");
    } catch (error) {
        console.log("❌ Failed:", error.message);
        if (error.data) {
            try {
                // Try to decode the error
                const decoded = adapter.interface.parseError(error.data);
                console.log("   Decoded error:", decoded);
            } catch {
                console.log("   Error data:", error.data);
            }
        }
    }
    
    console.log("\n2. Testing with empty extraOptions:");
    try {
        const sendParam2 = {
            dstEid: polygonEndpointId,
            to: ethers.zeroPadValue(signer.address, 32),
            amountLD: testAmount,
            minAmountLD: testAmount,
            extraOptions: "0x", // Empty options to use enforced
            composeMsg: "0x",
            oftCmd: "0x"
        };
        
        // Try calling the internal _quote function if available
        const messagingFee = await adapter.quote(
            sendParam2.dstEid,
            "", // Empty message for OFT
            sendParam2.extraOptions,
            false // payInLzToken
        );
        console.log("✅ Messaging fee:", ethers.formatEther(messagingFee.nativeFee), "ETH");
    } catch (error) {
        console.log("❌ Failed:", error.message);
    }
    
    console.log("\n3. Checking endpoint quote directly:");
    try {
        const endpoint = await ethers.getContractAt(
            "ILayerZeroEndpointV2",
            await adapter.endpoint()
        );
        
        // Build a simple message
        const message = ethers.AbiCoder.defaultAbiCoder().encode(
            ["address", "uint256"],
            [signer.address, testAmount]
        );
        
        const options = await adapter.combineOptions(polygonEndpointId, 1, "0x");
        
        const quoteFee = await endpoint.quote({
            dstEid: polygonEndpointId,
            receiver: ethers.zeroPadValue(adapter.target, 32),
            message: message,
            options: options,
            payInLzToken: false
        }, adapter.target);
        
        console.log("✅ Endpoint quote:", ethers.formatEther(quoteFee.nativeFee), "ETH");
    } catch (error) {
        console.log("❌ Failed:", error.message);
    }
    
    // Check allowance
    console.log("\n4. Checking token configuration:");
    const token = await ethers.getContractAt("IERC20", await adapter.token());
    const allowance = await token.allowance(signer.address, adapter.target);
    console.log("Token allowance:", ethers.formatEther(allowance));
    
    const balance = await token.balanceOf(signer.address);
    console.log("Token balance:", ethers.formatEther(balance));
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("\n❌ Script failed:", error);
        process.exit(1);
    });