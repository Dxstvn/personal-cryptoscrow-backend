import pkg from "hardhat";
const { ethers } = pkg;

async function main() {
    console.log("=== Testing New Cross-Chain Setup ===\n");
    
    const [signer] = await ethers.getSigners();
    console.log("Testing with account:", signer.address);
    
    // Get network info
    const network = await ethers.provider.getNetwork();
    const chainId = network.chainId.toString();
    const networkName = chainId === "11155111" ? "sepolia" : 
                       chainId === "80002" ? "polygon-amoy" : `unknown-${chainId}`;
    
    console.log(`Network: ${networkName} (Chain ID: ${chainId})`);
    
    // Updated configurations
    const configs = {
        sepolia: {
            adapter: "0xabB44feF0521d1Fc5Df081A95D5D13FF2bD5b297", // New SimplePropertyOFTAdapter
            peerEid: 40267, // Polygon Amoy
            peer: "0x12a9d0C6D06fEA1A584e98cd86aDC9EFdD7887df", // Polygon adapter
            weth: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14"
        },
        "polygon-amoy": {
            adapter: "0x12a9d0C6D06fEA1A584e98cd86aDC9EFdD7887df", // Existing PropertyOFTAdapter
            peerEid: 40161, // Sepolia
            peer: "0xabB44feF0521d1Fc5Df081A95D5D13FF2bD5b297", // New Sepolia adapter
            wpol: "0x360ad4f9a9A8EFe9A8DCB5f461c4Cc1047E1Dcf9"
        }
    };
    
    const config = configs[networkName];
    if (!config) {
        console.log("❌ Unknown network");
        return;
    }
    
    console.log(`\n=== ${networkName.toUpperCase()} ADAPTER VERIFICATION ===`);
    console.log(`Adapter: ${config.adapter}`);
    console.log(`Peer EID: ${config.peerEid}`);
    console.log(`Expected Peer: ${config.peer}`);
    
    try {
        // Determine contract type and get appropriate interface
        let adapter;
        if (networkName === "sepolia") {
            adapter = await ethers.getContractAt("SimplePropertyOFTAdapter", config.adapter);
            console.log("Using SimplePropertyOFTAdapter interface");
        } else {
            adapter = await ethers.getContractAt("PropertyOFTAdapter", config.adapter);
            console.log("Using PropertyOFTAdapter interface");
        }
        
        // Basic configuration check
        console.log("\n📋 Basic Configuration:");
        const endpoint = await adapter.endpoint();
        const owner = await adapter.owner();
        const sharedDecimals = await adapter.sharedDecimals();
        
        console.log(`   Endpoint: ${endpoint}`);
        console.log(`   Owner: ${owner}`);
        console.log(`   Shared Decimals: ${sharedDecimals}`);
        
        // Check peer configuration
        console.log("\n🔗 Peer Configuration:");
        const actualPeer = await adapter.peers(config.peerEid);
        const expectedPeerBytes32 = ethers.zeroPadValue(config.peer, 32);
        console.log(`   Actual Peer: ${actualPeer}`);
        console.log(`   Expected Peer: ${expectedPeerBytes32}`);
        console.log(`   Peer Match: ${actualPeer === expectedPeerBytes32 ? '✅' : '❌'}`);
        
        // Check enforced options
        console.log("\n⚙️ Enforced Options:");
        const enforcedOptions = await adapter.enforcedOptions(config.peerEid, 1);
        console.log(`   Options: ${enforcedOptions}`);
        console.log(`   Options Set: ${enforcedOptions !== "0x" ? '✅' : '❌'}`);
        
        // Check delegate configuration
        console.log("\n👤 Delegate Configuration:");
        const endpointContract = await ethers.getContractAt(
            ["function delegates(address) view returns (address)"],
            endpoint
        );
        const delegate = await endpointContract.delegates(config.adapter);
        console.log(`   Delegate: ${delegate}`);
        console.log(`   Delegate Set: ${delegate !== ethers.ZeroAddress ? '✅' : '❌'}`);
        
        // Enhanced checks for SimplePropertyOFTAdapter
        if (networkName === "sepolia") {
            console.log("\n🔧 Enhanced Features (SimplePropertyOFTAdapter):");
            
            try {
                const weth = await adapter.WETH();
                const usdc = await adapter.USDC();
                const usdt = await adapter.USDT();
                const dexAggregator = await adapter.dexAggregator();
                const maxSlippage = await adapter.maxSlippageBps();
                
                console.log(`   WETH: ${weth}`);
                console.log(`   USDC: ${usdc}`);
                console.log(`   USDT: ${usdt}`);
                console.log(`   DEX Aggregator: ${dexAggregator}`);
                console.log(`   Max Slippage: ${maxSlippage / 100}%`);
                
                // Check bridge token priorities
                const usdcPriority = await adapter.bridgeTokenPriority(usdc);
                const usdtPriority = await adapter.bridgeTokenPriority(usdt);
                const wethPriority = await adapter.bridgeTokenPriority(weth);
                
                console.log(`   Bridge Priorities: USDC(${usdcPriority}), USDT(${usdtPriority}), WETH(${wethPriority})`);
                
            } catch (e) {
                console.log(`   Enhanced features check failed: ${e.message}`);
            }
        }
        
        // Try a quote estimation
        console.log("\n💰 Quote Test:");
        try {
            const testAmount = ethers.parseEther("0.001"); // Small test amount
            const toAddress = ethers.zeroPadValue(signer.address, 32);
            
            const sendParam = {
                dstEid: config.peerEid,
                to: toAddress,
                amountLD: testAmount,
                minAmountLD: testAmount,
                extraOptions: "0x",
                composeMsg: "0x",
                oftCmd: "0x"
            };
            
            const fee = await adapter.quoteSend(sendParam, false);
            console.log(`   Native Fee: ${ethers.formatEther(fee.nativeFee)} ETH`);
            console.log(`   LZ Token Fee: ${fee.lzTokenFee}`);
            console.log(`   Quote Success: ✅`);
            
        } catch (e) {
            console.log(`   Quote failed: ${e.message}`);
            if (e.data) {
                console.log(`   Error data: ${e.data}`);
            }
        }
        
        // Overall assessment
        console.log("\n📊 OVERALL ASSESSMENT:");
        const peerConfigured = actualPeer === expectedPeerBytes32;
        const optionsConfigured = enforcedOptions !== "0x";
        const delegateConfigured = delegate !== ethers.ZeroAddress;
        
        const isReady = peerConfigured && optionsConfigured && delegateConfigured;
        console.log(`   Peer Configured: ${peerConfigured ? '✅' : '❌'}`);
        console.log(`   Options Configured: ${optionsConfigured ? '✅' : '❌'}`);
        console.log(`   Delegate Configured: ${delegateConfigured ? '✅' : '❌'}`);
        console.log(`   Ready for Testing: ${isReady ? '✅' : '❌'}`);
        
        if (isReady) {
            console.log("\n🎉 SUCCESS: Cross-chain configuration is ready!");
            if (networkName === "sepolia") {
                console.log("✨ Enhanced SimplePropertyOFTAdapter features available:");
                console.log("  • Multi-token conversion (any ERC20 → bridge tokens)");
                console.log("  • Dynamic bridge selection (USDC priority)");
                console.log("  • Seller-side conversion upon release");
                console.log("  • No token restrictions");
            }
        } else {
            console.log("\n⚠️ Configuration issues found - see details above");
        }
        
    } catch (error) {
        console.log("❌ Verification failed:", error.message);
        if (error.data) {
            console.log("Error data:", error.data);
        }
    }
    
    console.log("\n📝 Next Steps:");
    console.log("1. Test on both networks to verify bilateral configuration");
    console.log("2. Perform actual cross-chain transfer test");
    console.log("3. Test enhanced features (multi-token conversion, etc.)");
    
    if (networkName === "sepolia") {
        console.log("\nTo test Polygon side:");
        console.log("npx hardhat run scripts/testNewCrossChainSetup.js --network polygon-amoy");
    } else {
        console.log("\nTo test Sepolia side:");
        console.log("npx hardhat run scripts/testNewCrossChainSetup.js --network sepolia");
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("\n❌ Test failed:", error);
        process.exit(1);
    });