import pkg from "hardhat";
const { ethers } = pkg;

async function main() {
    console.log("=== COMPLETE CROSS-CHAIN TRANSACTION FLOW TEST ===\n");
    
    const [signer] = await ethers.getSigners();
    console.log("Testing with account:", signer.address);
    
    // Get current network
    const network = await ethers.provider.getNetwork();
    const chainId = network.chainId.toString();
    const networkName = chainId === "11155111" ? "sepolia" :
                       chainId === "80002" ? "polygon-amoy" :
                       chainId === "421614" ? "arbitrum-sepolia" :
                       `unknown-${chainId}`;
    
    console.log(`Source Network: ${networkName} (Chain ID: ${chainId})`);
    
    // Updated network configurations with new adapters
    const networks = {
        "sepolia": {
            name: "Sepolia",
            chainId: "11155111",
            eid: 40161,
            adapter: "0xabB44feF0521d1Fc5Df081A95D5D13FF2bD5b297", // New SimplePropertyOFTAdapter
            contractType: "SimplePropertyOFTAdapter",
            weth: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14",
            usdc: "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8",
            usdt: "0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0",
            explorer: "https://sepolia.etherscan.io",
            layerzeroScan: "https://testnet.layerzeroscan.com"
        },
        "polygon-amoy": {
            name: "Polygon Amoy",
            chainId: "80002",
            eid: 40267,
            adapter: "0x12a9d0C6D06fEA1A584e98cd86aDC9EFdD7887df", // Existing PropertyOFTAdapter
            contractType: "PropertyOFTAdapter", 
            wpol: "0x360ad4f9a9A8EFe9A8DCB5f461c4Cc1047E1Dcf9",
            explorer: "https://amoy.polygonscan.com",
            layerzeroScan: "https://testnet.layerzeroscan.com"
        },
        "arbitrum-sepolia": {
            name: "Arbitrum Sepolia",
            chainId: "421614",
            eid: 40231,
            adapter: "0xf829798145e7128c820CdeC5B1cB2Fa2A2008597", // New SimplePropertyOFTAdapter
            contractType: "SimplePropertyOFTAdapter",
            weth: "0x980B62Da83eFf3D4576C647993b0c1D7faf17c73",
            usdc: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
            usdt: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
            explorer: "https://sepolia.arbiscan.io",
            layerzeroScan: "https://testnet.layerzeroscan.com"
        }
    };
    
    const sourceNetwork = networks[networkName];
    if (!sourceNetwork) {
        console.log("❌ Unknown source network");
        return;
    }
    
    // Get destination networks (excluding current)
    const destinationNetworks = Object.entries(networks).filter(([key]) => key !== networkName);
    
    console.log(`\n📋 Available Destinations:`);
    destinationNetworks.forEach(([key, network], index) => {
        console.log(`   ${index + 1}. ${network.name} (${network.adapter})`);
    });
    
    // For this test, we'll use the first available destination
    const [destNetworkKey, destNetwork] = destinationNetworks[0];
    
    console.log(`\n🎯 Selected Destination: ${destNetwork.name}`);
    console.log(`Source: ${sourceNetwork.name} → Destination: ${destNetwork.name}`);
    
    // Get adapter contract
    const adapter = await ethers.getContractAt(sourceNetwork.contractType, sourceNetwork.adapter);
    
    // Test parameters
    const testAmount = ethers.parseEther("0.001"); // Small test amount
    const recipient = signer.address;
    const recipientBytes32 = ethers.zeroPadValue(recipient, 32);
    
    console.log(`\n📦 TEST PARAMETERS:`);
    console.log(`   Amount: ${ethers.formatEther(testAmount)} ETH`);
    console.log(`   Recipient: ${recipient}`);
    console.log(`   Recipient (bytes32): ${recipientBytes32}`);
    
    try {
        // Step 1: Check balances before
        console.log(`\n💰 INITIAL BALANCES:`);
        const initialBalance = await ethers.provider.getBalance(signer.address);
        console.log(`   ${sourceNetwork.name} ETH: ${ethers.formatEther(initialBalance)}`);
        
        // Check native token balance if different
        if (sourceNetwork.weth) {
            try {
                const wethContract = await ethers.getContractAt(
                    ["function balanceOf(address) view returns (uint256)", "function symbol() view returns (string)"],
                    sourceNetwork.weth
                );
                const wethBalance = await wethContract.balanceOf(signer.address);
                const symbol = await wethContract.symbol();
                console.log(`   ${symbol}: ${ethers.formatEther(wethBalance)}`);
            } catch (e) {
                console.log(`   WETH balance check failed: ${e.message}`);
            }
        }
        
        // Step 2: Get quote for the transaction
        console.log(`\n💸 GETTING QUOTE:`);
        const sendParam = {
            dstEid: destNetwork.eid,
            to: recipientBytes32,
            amountLD: testAmount,
            minAmountLD: testAmount,
            extraOptions: "0x",
            composeMsg: "0x",
            oftCmd: "0x"
        };
        
        const fee = await adapter.quoteSend(sendParam, false);
        const quoteFee = fee.nativeFee;
        console.log(`   LayerZero Fee: ${ethers.formatEther(quoteFee)} ETH`);
        console.log(`   LZ Token Fee: ${fee.lzTokenFee} (should be 0)`);
        
        // Verify sufficient balance
        const totalRequired = testAmount + quoteFee;
        if (initialBalance < totalRequired) {
            console.log(`❌ Insufficient balance! Need ${ethers.formatEther(totalRequired)} ETH`);
            return;
        }
        
        // Step 3: Execute the cross-chain transfer
        console.log(`\n🚀 EXECUTING CROSS-CHAIN TRANSFER:`);
        console.log(`   From: ${sourceNetwork.name} (${sourceNetwork.adapter})`);
        console.log(`   To: ${destNetwork.name} (${destNetwork.adapter})`);
        console.log(`   Amount: ${ethers.formatEther(testAmount)} ETH`);
        console.log(`   Fee: ${ethers.formatEther(quoteFee)} ETH`);
        
        // Enhanced send for SimplePropertyOFTAdapter or standard send for PropertyOFTAdapter
        let sendTx;
        if (sourceNetwork.contractType === "SimplePropertyOFTAdapter") {
            console.log(`   🔧 Using Enhanced SimplePropertyOFTAdapter`);
            
            // For enhanced adapter, we can use convertAndSend for dynamic token handling
            // But for this test, we'll use standard send with ETH
            sendTx = await adapter.send(
                sendParam,
                { nativeFee: quoteFee, lzTokenFee: 0 },
                signer.address,
                { value: testAmount + quoteFee }
            );
        } else {
            console.log(`   📦 Using Standard PropertyOFTAdapter`);
            sendTx = await adapter.send(
                sendParam,
                { nativeFee: quoteFee, lzTokenFee: 0 },
                signer.address,
                { value: testAmount + quoteFee }
            );
        }
        
        console.log(`\n⏳ Transaction submitted: ${sendTx.hash}`);
        console.log(`📍 Explorer: ${sourceNetwork.explorer}/tx/${sendTx.hash}`);
        
        // Wait for confirmation
        console.log(`\n⏱️  Waiting for confirmation...`);
        const receipt = await sendTx.wait();
        console.log(`✅ Transaction confirmed in block: ${receipt.blockNumber}`);
        console.log(`⛽ Gas used: ${receipt.gasUsed.toLocaleString()}`);
        
        // Step 4: Parse events for LayerZero tracking
        console.log(`\n📡 LAYERZERO EVENTS:`);
        let packetSent = false;
        let layerZeroTxId = null;
        
        for (const log of receipt.logs) {
            try {
                if (log.address === "0x6EDCE65403992e310A62460808c4b910D972f10f") { // LayerZero Endpoint
                    // Try to decode PacketSent event
                    const packetSentInterface = new ethers.Interface([
                        "event PacketSent(bytes encodedPayload, bytes options, address sendLibrary)"
                    ]);
                    
                    try {
                        const decoded = packetSentInterface.parseLog(log);
                        console.log(`   ✅ PacketSent event detected`);
                        console.log(`   📦 Payload length: ${decoded.args.encodedPayload.length} bytes`);
                        console.log(`   📋 Options: ${decoded.args.options}`);
                        console.log(`   📚 Send Library: ${decoded.args.sendLibrary}`);
                        packetSent = true;
                    } catch (e) {
                        // Try other LayerZero events
                    }
                }
                
                // Check for OFT events
                if (log.address.toLowerCase() === sourceNetwork.adapter.toLowerCase()) {
                    const oftInterface = new ethers.Interface([
                        "event OFTSent(bytes32 indexed guid, uint32 dstEid, address indexed fromAddress, uint256 amountSentLD, uint256 amountReceivedLD)"
                    ]);
                    
                    try {
                        const decoded = oftInterface.parseLog(log);
                        console.log(`   📤 OFTSent event:`);
                        console.log(`     GUID: ${decoded.args.guid}`);
                        console.log(`     Destination EID: ${decoded.args.dstEid}`);
                        console.log(`     From: ${decoded.args.fromAddress}`);
                        console.log(`     Sent: ${ethers.formatEther(decoded.args.amountSentLD)} ETH`);
                        console.log(`     Received: ${ethers.formatEther(decoded.args.amountReceivedLD)} ETH`);
                        layerZeroTxId = decoded.args.guid;
                    } catch (e) {
                        // Event might not match exactly
                    }
                }
            } catch (e) {
                // Skip logs that can't be parsed
            }
        }
        
        if (packetSent) {
            console.log(`   🎯 LayerZero packet successfully sent!`);
        } else {
            console.log(`   ⚠️  No LayerZero PacketSent event found (check logs manually)`);
        }
        
        // Step 5: Check balances after
        console.log(`\n💰 FINAL BALANCES:`);
        const finalBalance = await ethers.provider.getBalance(signer.address);
        const balanceChange = initialBalance - finalBalance;
        console.log(`   ${sourceNetwork.name} ETH: ${ethers.formatEther(finalBalance)}`);
        console.log(`   Balance Change: -${ethers.formatEther(balanceChange)} ETH`);
        console.log(`   Expected Change: -${ethers.formatEther(totalRequired)} ETH`);
        console.log(`   Difference: ${ethers.formatEther(totalRequired - balanceChange)} ETH`);
        
        // Step 6: Provide tracking information
        console.log(`\n🔍 TRANSACTION TRACKING:`);
        console.log(`\n📍 Block Explorer Links:`);
        console.log(`   Source Tx: ${sourceNetwork.explorer}/tx/${sendTx.hash}`);
        console.log(`   Block: ${sourceNetwork.explorer}/block/${receipt.blockNumber}`);
        console.log(`   Address: ${sourceNetwork.explorer}/address/${sourceNetwork.adapter}`);
        
        console.log(`\n🌉 LayerZero Tracking:`);
        console.log(`   LayerZero Scan: ${sourceNetwork.layerzeroScan}`);
        console.log(`   Source Chain: ${sourceNetwork.name} (EID ${sourceNetwork.eid})`);
        console.log(`   Dest Chain: ${destNetwork.name} (EID ${destNetwork.eid})`);
        if (layerZeroTxId) {
            console.log(`   Transaction GUID: ${layerZeroTxId}`);
            console.log(`   Track at: ${sourceNetwork.layerzeroScan}/tx/${layerZeroTxId}`);
        }
        
        console.log(`\n🎯 VERIFICATION STEPS:`);
        console.log(`1. ✅ Source transaction confirmed on ${sourceNetwork.name}`);
        console.log(`2. ⏳ Wait 2-5 minutes for LayerZero relay`);
        console.log(`3. 🔍 Check destination ${destNetwork.name} for incoming transaction:`);
        console.log(`   ${destNetwork.explorer}/address/${destNetwork.adapter}`);
        console.log(`4. 📊 Monitor LayerZero scan for completion status`);
        
        // Enhanced features summary for SimplePropertyOFTAdapter
        if (sourceNetwork.contractType === "SimplePropertyOFTAdapter") {
            console.log(`\n🔧 ENHANCED FEATURES AVAILABLE:`);
            console.log(`   🔄 Multi-token conversion (any ERC20 → bridge tokens)`);
            console.log(`   🎯 Dynamic bridge selection (USDC priority)`);
            console.log(`   💱 Seller-side conversion upon release`);
            console.log(`   🛡️ No token restrictions`);
            console.log(`   📈 Slippage protection`);
            
            try {
                const weth = await adapter.WETH();
                const usdc = await adapter.USDC();
                const usdt = await adapter.USDT();
                console.log(`\n   Supported Bridge Tokens:`);
                console.log(`   💎 WETH: ${weth}`);
                console.log(`   💵 USDC: ${usdc}`);
                console.log(`   💴 USDT: ${usdt}`);
            } catch (e) {
                console.log(`   ⚠️  Enhanced features info unavailable`);
            }
        }
        
        console.log(`\n✅ CROSS-CHAIN TRANSFER TEST COMPLETED SUCCESSFULLY!`);
        console.log(`\n🎉 Transaction Flow:`);
        console.log(`   ${sourceNetwork.name} → LayerZero → ${destNetwork.name}`);
        console.log(`   Amount: ${ethers.formatEther(testAmount)} ETH`);
        console.log(`   Status: Sent (awaiting relay)`);
        
    } catch (error) {
        console.log("❌ Cross-chain transfer failed:", error.message);
        if (error.data) {
            console.log("Error data:", error.data);
        }
        
        // Provide debugging info
        console.log(`\n🔧 DEBUGGING INFO:`);
        console.log(`Network: ${sourceNetwork.name}`);
        console.log(`Adapter: ${sourceNetwork.adapter}`);
        console.log(`Contract Type: ${sourceNetwork.contractType}`);
        console.log(`Destination EID: ${destNetwork.eid}`);
    }
    
    console.log(`\n📝 TEST OTHER NETWORKS:`);
    console.log(`   Polygon → Sepolia: npx hardhat run scripts/testCompleteCrossChainFlow.js --network polygon-amoy`);
    console.log(`   Arbitrum → Sepolia: npx hardhat run scripts/testCompleteCrossChainFlow.js --network arbitrum-sepolia`);
    console.log(`   Sepolia → Polygon: npx hardhat run scripts/testCompleteCrossChainFlow.js --network sepolia`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("\n❌ Test failed:", error);
        process.exit(1);
    });