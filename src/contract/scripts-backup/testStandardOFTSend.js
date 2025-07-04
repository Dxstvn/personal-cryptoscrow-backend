import pkg from "hardhat";
const { ethers } = pkg;
import fs from "fs";
import path from "path";

async function main() {
    console.log("=== Testing Standard OFT Adapter Cross-Chain Transfer ===\n");
    
    const [signer] = await ethers.getSigners();
    console.log("Testing with account:", signer.address);
    
    // Load deployments
    const deploymentPath = path.join(process.cwd(), '../../deployments/testnet-deployments.json');
    const deployments = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
    
    // Get Sepolia standard adapter
    const adapter = await ethers.getContractAt(
        "PropertyOFTAdapter",
        deployments.sepolia.standardOftAdapters.WETH.address
    );
    
    console.log("Standard OFT Adapter:", adapter.target);
    
    // Get WETH token using standard ERC20 + WETH ABI
    const wethABI = [
        "function deposit() payable",
        "function withdraw(uint256) external",
        "function balanceOf(address) view returns (uint256)",
        "function approve(address, uint256) returns (bool)",
        "function allowance(address, address) view returns (uint256)",
        "function transfer(address, uint256) returns (bool)"
    ];
    
    const weth = new ethers.Contract(await adapter.token(), wethABI, signer);
    
    console.log("WETH address:", await weth.getAddress());
    
    // Small test amount
    const testAmount = ethers.parseEther("0.0001");
    
    // Check balance
    const balance = await weth.balanceOf(signer.address);
    console.log("\nWETH balance:", ethers.formatEther(balance));
    
    if (balance < testAmount) {
        console.log("Wrapping ETH...");
        const tx = await weth.deposit({ value: testAmount });
        await tx.wait();
        console.log("✅ Wrapped ETH");
    }
    
    // Approve adapter - IMPORTANT: Standard OFT adapter requires approval
    const allowance = await weth.allowance(signer.address, adapter.target);
    if (allowance < testAmount) {
        console.log("\nApproving standard OFT adapter...");
        const tx = await weth.approve(adapter.target, testAmount);
        await tx.wait();
        console.log("✅ Approved");
    }
    
    console.log("\n📤 Preparing cross-chain transfer to Polygon...");
    
    const polygonEndpointId = 40267;
    const toAddress = signer.address; // Send to self for testing
    
    // Build send parameters for LayerZero V2
    const sendParam = {
        dstEid: polygonEndpointId,
        to: ethers.zeroPadValue(toAddress, 32),
        amountLD: testAmount,
        minAmountLD: testAmount * 99n / 100n, // 1% slippage
        extraOptions: "0x", // Empty, will use enforced options
        composeMsg: "0x",
        oftCmd: "0x"
    };
    
    console.log("\nSend parameters:", {
        ...sendParam,
        to: toAddress,
        amountLD: ethers.formatEther(sendParam.amountLD)
    });
    
    // Check peer configuration first
    console.log("\nChecking adapter configuration...");
    const polygonPeer = await adapter.peers(polygonEndpointId);
    console.log("Polygon peer:", polygonPeer);
    console.log("Is peer set:", polygonPeer !== ethers.ZeroAddress);
    
    // Get quote
    console.log("\nGetting fee quote...");
    let nativeFee;
    try {
        [nativeFee] = await adapter.quoteSend(sendParam, false);
        console.log("Native fee:", ethers.formatEther(nativeFee), "ETH");
    } catch (error) {
        console.error("❌ Failed to get quote:", error.message);
        console.log("\nPossible issues:");
        console.log("1. Check if enforced options are set correctly");
        console.log("2. Verify endpoint configuration");
        console.log("3. Check if delegate is set properly");
        return;
    }
    
    // Check ETH balance for fee
    const ethBalance = await ethers.provider.getBalance(signer.address);
    console.log("ETH balance:", ethers.formatEther(ethBalance));
    
    if (ethBalance < nativeFee) {
        console.error("❌ Insufficient ETH for LayerZero fee");
        return;
    }
    
    // Send tokens
    console.log("\n🚀 Sending tokens cross-chain...");
    try {
        const tx = await adapter.send(
            sendParam,
            { nativeFee: nativeFee, lzTokenFee: 0 },
            signer.address, // Refund address
            { value: nativeFee }
        );
        
        console.log("✅ Transaction sent:", tx.hash);
        console.log("   View on Sepolia:", `https://sepolia.etherscan.io/tx/${tx.hash}`);
        
        const receipt = await tx.wait();
        console.log("✅ Transaction confirmed!");
        console.log("   Gas used:", receipt.gasUsed.toString());
        
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
            console.log("   Amount:", ethers.formatEther(parsed.args.amountSentLD));
        }
        
        console.log("\n🎉 Cross-chain transfer initiated successfully!");
        console.log("\n📝 Monitor delivery:");
        console.log("   LayerZero Scan: https://testnet.layerzeroscan.com/");
        console.log("   Check balance on Polygon Amoy after ~2-3 minutes");
        
    } catch (error) {
        console.error("❌ Error:", error.message);
        if (error.data) {
            console.log("Error data:", error.data);
        }
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("\n❌ Script failed:", error);
        process.exit(1);
    });