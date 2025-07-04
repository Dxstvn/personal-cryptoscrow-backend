import pkg from "hardhat";
const { ethers } = pkg;

async function main() {
    console.log("=== Testing OFT with Correct Decimal Handling ===\n");
    
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
         "function allowance(address, address) view returns (uint256)",
         "function decimals() view returns (uint8)"],
        await adapter.token()
    );
    
    // Get decimal information
    const tokenDecimals = await weth.decimals();
    const sharedDecimals = await adapter.sharedDecimals();
    
    console.log("Token decimals:", tokenDecimals);
    console.log("Shared decimals:", sharedDecimals);
    console.log("Decimal conversion factor:", 10n ** (tokenDecimals - sharedDecimals));
    
    // Calculate amounts properly
    // For OFT, amounts need to be in local decimals (18 for WETH)
    // But they must be divisible by the conversion factor
    const conversionFactor = 10n ** (tokenDecimals - sharedDecimals);
    
    // 0.1 WETH in shared decimals, then converted back to local
    const amountInSharedDecimals = 100000n; // 0.1 in 6 decimals
    const amountLD = amountInSharedDecimals * conversionFactor; // Convert to 18 decimals
    
    console.log("\nAmount calculations:");
    console.log("Amount in shared decimals:", amountInSharedDecimals);
    console.log("Amount in local decimals:", amountLD);
    console.log("Amount in WETH:", ethers.formatEther(amountLD));
    
    // Ensure we have WETH
    const balance = await weth.balanceOf(signer.address);
    if (balance < amountLD) {
        console.log("\nWrapping ETH...");
        await (await weth.deposit({ value: amountLD })).wait();
    }
    
    // Approve
    const allowance = await weth.allowance(signer.address, adapter.target);
    if (allowance < amountLD) {
        console.log("Approving...");
        await (await weth.approve(adapter.target, amountLD)).wait();
    }
    
    console.log("\nBalance:", ethers.formatEther(await weth.balanceOf(signer.address)));
    console.log("Allowance:", ethers.formatEther(await weth.allowance(signer.address, adapter.target)));
    
    // Try to get a quote with properly formatted amount
    console.log("\nTrying quoteSend with correct decimals...");
    
    const polygonEid = 40267;
    
    try {
        const sendParams = {
            dstEid: polygonEid,
            to: ethers.zeroPadValue(signer.address, 32),
            amountLD: amountLD, // Amount in local decimals (18)
            minAmountLD: amountLD, // No slippage for test
            extraOptions: "0x",
            composeMsg: "0x",
            oftCmd: "0x"
        };
        
        console.log("\nSend parameters:");
        console.log("  Amount (local decimals):", amountLD.toString());
        console.log("  Amount (WETH):", ethers.formatEther(amountLD));
        console.log("  Amount (shared decimals):", (amountLD / conversionFactor).toString());
        
        const [nativeFee, lzTokenFee] = await adapter.quoteSend(sendParams, false);
        console.log("\n✅ Quote successful!");
        console.log("Native fee:", ethers.formatEther(nativeFee), "ETH");
        console.log("LZ token fee:", lzTokenFee.toString());
        
        // Check ETH balance for fee
        const ethBalance = await ethers.provider.getBalance(signer.address);
        console.log("\nETH balance:", ethers.formatEther(ethBalance));
        
        if (ethBalance >= nativeFee) {
            console.log("\n🚀 Sending tokens cross-chain...");
            
            const tx = await adapter.send(
                sendParams,
                { nativeFee: nativeFee, lzTokenFee: 0 },
                signer.address, // Refund address
                { value: nativeFee }
            );
            
            console.log("✅ Transaction sent:", tx.hash);
            console.log("View on Sepolia:", `https://sepolia.etherscan.io/tx/${tx.hash}`);
            
            const receipt = await tx.wait();
            console.log("✅ Transaction confirmed!");
            
            // Find OFTSent event
            const oftSentEvent = receipt.logs.find(log => {
                try {
                    const parsed = adapter.interface.parseLog(log);
                    return parsed && parsed.name === "OFTSent";
                } catch {
                    return false;
                }
            });
            
            if (oftSentEvent) {
                const parsed = adapter.interface.parseLog(oftSentEvent);
                console.log("\n📤 OFTSent Event:");
                console.log("   GUID:", parsed.args.guid);
                console.log("   To EID:", parsed.args.dstEid);
                console.log("   Amount sent (LD):", ethers.formatEther(parsed.args.amountSentLD));
                console.log("   Amount received (LD):", ethers.formatEther(parsed.args.amountReceivedLD));
            }
            
            console.log("\n🎉 Cross-chain transfer initiated successfully!");
            console.log("Monitor on LayerZero Scan: https://testnet.layerzeroscan.com/");
        } else {
            console.log("❌ Insufficient ETH for fee");
        }
        
    } catch (e) {
        console.log("❌ Failed:", e.message);
        if (e.data) {
            console.log("Error data:", e.data);
        }
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("\n❌ Script failed:", error);
        process.exit(1);
    });