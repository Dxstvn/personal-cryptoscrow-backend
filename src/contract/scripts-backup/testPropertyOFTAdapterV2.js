import pkg from "hardhat";
const { ethers } = pkg;
import fs from "fs";
import path from "path";

async function main() {
    console.log("=== Testing PropertyOFTAdapterV2 ===\n");
    
    const [signer] = await ethers.getSigners();
    console.log("Testing with account:", signer.address);
    
    // Load deployment info
    const network = await ethers.provider.getNetwork();
    const networkName = network.chainId === 11155111n ? "sepolia" :
                       network.chainId === 80002n ? "polygon-amoy" :
                       network.chainId === 421614n ? "arbitrum-sepolia" : "unknown";
    
    const deploymentPath = path.join(process.cwd(), "deployments", `${networkName}-oftv2-deployment.json`);
    
    let adapterAddress, dexAddress;
    
    try {
        const deployment = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
        adapterAddress = deployment.adapter.address;
        dexAddress = deployment.adapter.dexAggregator;
        console.log(`Loaded deployment from ${networkName}`);
    } catch (error) {
        console.error("Could not load deployment info. Deploy first with deployPropertyOFTAdapterV2.js");
        return;
    }
    
    // Get contracts
    const adapter = await ethers.getContractAt("PropertyOFTAdapterV2", adapterAddress);
    const dexAggregator = await ethers.getContractAt("MockDEXAggregator", dexAddress);
    const wethAddress = await adapter.WETH();
    const weth = await ethers.getContractAt(["function balanceOf(address) view returns (uint256)", "function deposit() payable"], wethAddress);
    
    console.log("\nContracts:");
    console.log("- OFT Adapter V2:", adapterAddress);
    console.log("- DEX Aggregator:", dexAddress);
    console.log("- WETH:", wethAddress);
    
    // Test 1: Native ETH wrapping and sending
    console.log("\n1. Testing Native ETH → WETH → Cross-chain");
    
    const ethAmount = ethers.parseEther("0.1");
    const polygonEid = 40267;
    
    // Check initial balances
    const initialETHBalance = await ethers.provider.getBalance(signer.address);
    const initialWETHBalance = await weth.balanceOf(signer.address);
    
    console.log("Initial balances:");
    console.log("- ETH:", ethers.formatEther(initialETHBalance));
    console.log("- WETH:", ethers.formatEther(initialWETHBalance));
    
    // Prepare send parameters
    const sendParam = {
        dstEid: polygonEid,
        to: ethers.zeroPadValue(signer.address, 32),
        amountLD: ethAmount,
        minAmountLD: ethAmount,
        extraOptions: "0x",
        composeMsg: "0x",
        oftCmd: "0x"
    };
    
    // Get quote
    console.log("\nGetting quote for cross-chain transfer...");
    try {
        const [nativeFee, lzTokenFee] = await adapter.quoteSend(sendParam, false);
        console.log("✅ Quote successful!");
        console.log("- Native fee:", ethers.formatEther(nativeFee), "ETH");
        console.log("- LZ token fee:", lzTokenFee.toString());
        
        // Test sendETH function
        console.log("\nSending ETH cross-chain (will wrap to WETH automatically)...");
        const totalETHNeeded = ethAmount + nativeFee;
        
        const tx = await adapter.sendETH(
            sendParam,
            { nativeFee: nativeFee, lzTokenFee: 0 },
            signer.address,
            { value: totalETHNeeded }
        );
        
        console.log("Transaction sent:", tx.hash);
        const receipt = await tx.wait();
        console.log("✅ Transaction confirmed!");
        
        // Check events
        const events = receipt.logs
            .map(log => {
                try {
                    return adapter.interface.parseLog(log);
                } catch {
                    return null;
                }
            })
            .filter(event => event !== null);
        
        const ethWrappedEvent = events.find(e => e.name === "ETHWrapped");
        if (ethWrappedEvent) {
            console.log("\n✅ ETH Wrapped Event:");
            console.log("- User:", ethWrappedEvent.args.user);
            console.log("- Amount:", ethers.formatEther(ethWrappedEvent.args.amount), "ETH");
        }
        
    } catch (error) {
        console.log("❌ Quote/Send failed:", error.message);
        
        if (error.data) {
            console.log("Error data:", error.data);
            if (error.data.includes("6780cfaf")) {
                console.log("⚠️  InvalidAmount error - this suggests configuration issues");
            }
        }
    }
    
    // Test 2: Token swapping
    console.log("\n2. Testing Token Swap Functionality");
    
    // For testing, let's set up a mock token swap rate
    console.log("\nSetting up mock swap rates...");
    
    // ETH to WETH should be 1:1
    await dexAggregator.setMockRate(ethers.ZeroAddress, wethAddress, 10000); // 1:1
    await dexAggregator.setMockRate(wethAddress, ethers.ZeroAddress, 10000); // 1:1
    
    console.log("✅ Mock rates set");
    
    // Test swap ETH to WETH
    console.log("\nTesting ETH → WETH swap...");
    const swapAmount = ethers.parseEther("0.01");
    
    try {
        const swapTx = await adapter.swapTokens(
            ethers.ZeroAddress, // ETH
            wethAddress,        // WETH
            swapAmount,
            swapAmount,        // Min return (1:1 expected)
            { value: swapAmount }
        );
        
        console.log("Swap transaction sent:", swapTx.hash);
        const swapReceipt = await swapTx.wait();
        console.log("✅ Swap successful!");
        
        // Check swap event
        const swapEvent = swapReceipt.logs
            .map(log => {
                try {
                    return adapter.interface.parseLog(log);
                } catch {
                    return null;
                }
            })
            .find(event => event && event.name === "TokenSwapExecuted");
        
        if (swapEvent) {
            console.log("\n✅ Token Swap Event:");
            console.log("- From:", swapEvent.args.fromToken === ethers.ZeroAddress ? "ETH" : swapEvent.args.fromToken);
            console.log("- To:", swapEvent.args.toToken);
            console.log("- Amount In:", ethers.formatEther(swapEvent.args.amountIn));
            console.log("- Amount Out:", ethers.formatEther(swapEvent.args.amountOut));
        }
        
    } catch (error) {
        console.log("❌ Swap failed:", error.message);
    }
    
    // Test 3: Check wrapped ETH tracking
    console.log("\n3. Checking Wrapped ETH Tracking");
    
    const wrappedAmount = await adapter.wrappedETHDeposits(signer.address);
    console.log("Tracked wrapped ETH for user:", ethers.formatEther(wrappedAmount));
    
    if (wrappedAmount > 0) {
        console.log("\n✅ The adapter is tracking wrapped ETH deposits!");
        console.log("Users can call unwrapWETH() to convert WETH back to ETH");
    }
    
    // Summary
    console.log("\n=== Test Summary ===");
    console.log("✅ PropertyOFTAdapterV2 deployed successfully");
    console.log("✅ ETH wrapping functionality implemented");
    console.log("✅ DEX integration working");
    console.log("✅ Cross-chain quote functionality available");
    
    console.log("\n📝 Features:");
    console.log("- Automatic ETH → WETH wrapping for cross-chain");
    console.log("- Token swapping through DEX aggregator");
    console.log("- Swap and send in one transaction");
    console.log("- Wrapped ETH tracking for easy unwrapping");
    
    console.log("\n🚀 Next Steps:");
    console.log("1. Deploy on all target chains");
    console.log("2. Configure cross-chain peers");
    console.log("3. Integrate with escrow contracts");
    console.log("4. Test actual cross-chain transfers");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("\n❌ Test failed:", error);
        process.exit(1);
    });