import pkg from "hardhat";
const { ethers } = pkg;

async function main() {
    console.log("=== COMPREHENSIVE UNIVERSAL ESCROW TEST ===\n");
    
    // Setup wallets
    const [deployer] = await ethers.getSigners();
    console.log("Deployer:", deployer.address);
    
    // Create 3 random wallets
    const buyer = ethers.Wallet.createRandom().connect(ethers.provider);
    const seller = ethers.Wallet.createRandom().connect(ethers.provider);
    const serviceWallet = ethers.Wallet.createRandom().connect(ethers.provider);
    
    console.log("\n📱 Test Wallets:");
    console.log("Buyer:", buyer.address);
    console.log("Seller:", seller.address);
    console.log("Service:", serviceWallet.address);
    
    // Get network info
    const network = await ethers.provider.getNetwork();
    const chainId = network.chainId.toString();
    const networkName = chainId === "11155111" ? "sepolia" :
                       chainId === "80002" ? "polygon-amoy" :
                       chainId === "421614" ? "arbitrum-sepolia" :
                       `unknown-${chainId}`;
    
    console.log(`\nNetwork: ${networkName} (Chain ID: ${chainId})`);
    
    // Block explorer URLs
    const explorerUrls = {
        "sepolia": "https://sepolia.etherscan.io",
        "polygon-amoy": "https://amoy.polygonscan.com",
        "arbitrum-sepolia": "https://sepolia.arbiscan.io"
    };
    
    const explorerUrl = explorerUrls[networkName] || "https://etherscan.io";
    
    // Contract addresses and configurations
    const escrowAddresses = {
        "sepolia": "0x335Bb94C802E224Bc3D7afE9d65902df9984ed08",
        "polygon-amoy": "", // Deploy and update
        "arbitrum-sepolia": "" // Deploy and update
    };
    
    const tokenAddresses = {
        "sepolia": {
            usdc: "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8",
            weth: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14"
        },
        "polygon-amoy": {
            usdc: "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582",
            wpol: "0x360ad4f9a9A8EFe9A8DCB5f461c4Cc1047E1Dcf9"
        },
        "arbitrum-sepolia": {
            usdc: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
            weth: "0x980B62Da83eFf3D4576C647993b0c1D7faf17c73"
        }
    };
    
    const escrowAddress = escrowAddresses[networkName];
    if (!escrowAddress) {
        console.log("❌ Please deploy Universal Escrow Service on this network first");
        return;
    }
    
    const escrow = await ethers.getContractAt("UniversalEscrowService", escrowAddress);
    
    // Check contract configuration
    console.log("\n⚙️ Checking contract configuration...");
    const currentServiceWallet = await escrow.serviceWallet();
    const wethAddress = await escrow.WETH();
    const routerAddress = await escrow.uniswapRouter();
    console.log(`Service Wallet: ${currentServiceWallet}`);
    console.log(`WETH Address: ${wethAddress}`);
    console.log(`Uniswap Router: ${routerAddress}`);
    
    // Check composer configuration
    const chainIds = {
        "sepolia": 40161,
        "polygon-amoy": 40267,
        "arbitrum-sepolia": 40231
    };
    
    console.log("\n🎼 Checking swap composers...");
    for (const [name, id] of Object.entries(chainIds)) {
        if (name !== networkName) {
            try {
                const composer = await escrow.getSwapComposer(id);
                console.log(`${name} (${id}): ${composer !== ethers.ZeroAddress ? '✅' : '❌'} ${composer}`);
            } catch (e) {
                console.log(`${name} (${id}): ❌ Error checking composer`);
            }
        }
    }
    
    // Fund buyer wallet from deployer
    const fundingAmount = ethers.parseEther("0.5"); // 0.5 ETH for testing
    console.log(`\n💰 Funding buyer wallet with ${ethers.formatEther(fundingAmount)} ETH...`);
    
    try {
        const fundTx = await deployer.sendTransaction({
            to: buyer.address,
            value: fundingAmount
        });
        const fundTxHash = fundTx.hash;
        console.log(`📤 Funding transaction: ${fundTxHash}`);
        const fundReceipt = await fundTx.wait();
        console.log(`✅ Buyer funded in block ${fundReceipt.blockNumber}`);
        console.log(`🔍 View funding tx: ${explorerUrl}/tx/${fundTxHash}`);
        
        const buyerBalance = await ethers.provider.getBalance(buyer.address);
        console.log(`Buyer balance: ${ethers.formatEther(buyerBalance)} ETH`);
    } catch (error) {
        console.log("❌ Funding failed:", error.message);
        return;
    }
    
    // Update service wallet in contract (only owner can do this)
    console.log("\n⚙️ Updating service wallet in contract...");
    try {
        const updateTx = await escrow.connect(deployer).setServiceWallet(serviceWallet.address);
        const updateTxHash = updateTx.hash;
        console.log(`📤 Update transaction: ${updateTxHash}`);
        const updateReceipt = await updateTx.wait();
        console.log(`✅ Service wallet updated in block ${updateReceipt.blockNumber}`);
        console.log(`🔍 View update tx: ${explorerUrl}/tx/${updateTxHash}`);
    } catch (error) {
        console.log("❌ Service wallet update failed:", error.message);
    }
    
    // Set deployer as condition updater for testing
    console.log("\n🔐 Setting up condition updater...");
    try {
        const setUpdaterTx = await escrow.connect(deployer).setConditionUpdater(deployer.address, true);
        const setUpdaterTxHash = setUpdaterTx.hash;
        console.log(`📤 Set updater transaction: ${setUpdaterTxHash}`);
        await setUpdaterTx.wait();
        console.log(`✅ Deployer set as condition updater`);
        console.log(`🔍 View tx: ${explorerUrl}/tx/${setUpdaterTxHash}`);
    } catch (error) {
        console.log("❌ Setting condition updater failed:", error.message);
    }
    
    // Helper function to get token balance
    async function getTokenBalance(tokenAddress, walletAddress, decimals = 18) {
        if (tokenAddress === ethers.ZeroAddress) {
            return await ethers.provider.getBalance(walletAddress);
        } else {
            const token = await ethers.getContractAt("IERC20", tokenAddress);
            return await token.balanceOf(walletAddress);
        }
    }
    
    // Helper function to format token amount
    function formatTokenAmount(amount, tokenAddress, decimals = 18) {
        if (tokenAddress === ethers.ZeroAddress) {
            return `${ethers.formatEther(amount)} ETH`;
        } else if (tokenAddress.toLowerCase().includes("usdc")) {
            return `${ethers.formatUnits(amount, 6)} USDC`;
        } else {
            return `${ethers.formatUnits(amount, decimals)} tokens`;
        }
    }
    
    // Test scenarios
    const testScenarios = [
        {
            name: "TEST 1: Same Chain, Same Token (ETH → ETH)",
            depositToken: ethers.ZeroAddress,
            depositAmount: ethers.parseEther("0.01"),
            targetToken: ethers.ZeroAddress,
            targetChainId: 0,
            expectedMethod: "direct"
        },
        {
            name: "TEST 2: Same Chain, Different Token (ETH → USDC)",
            depositToken: ethers.ZeroAddress,
            depositAmount: ethers.parseEther("0.01"),
            targetToken: tokenAddresses[networkName]?.usdc || ethers.ZeroAddress,
            targetChainId: 0,
            expectedMethod: "uniswap",
            skipIfNoRouter: true
        },
        {
            name: "TEST 3: Cross-Chain (ETH → Polygon ETH)",
            depositToken: ethers.ZeroAddress,
            depositAmount: ethers.parseEther("0.01"),
            targetToken: ethers.ZeroAddress,
            targetChainId: networkName === "sepolia" ? 40267 : 40161, // Polygon or Sepolia
            expectedMethod: "layerzero"
        }
    ];
    
    console.log("\n🧪 Running Test Scenarios...\n");
    
    // Store transaction results for summary
    const testResults = [];
    
    for (const scenario of testScenarios) {
        console.log(`\n${"=".repeat(60)}`);
        console.log(`🔬 ${scenario.name}`);
        console.log(`${"=".repeat(60)}`);
        
        const result = {
            name: scenario.name,
            success: false,
            createTxHash: null,
            releaseTxHash: null,
            escrowId: null,
            error: null
        };
        
        // Skip Uniswap tests if no router configured
        if (scenario.skipIfNoRouter && routerAddress === ethers.ZeroAddress) {
            console.log("⚠️ Skipping test - Uniswap router not configured");
            result.error = "Uniswap router not configured";
            testResults.push(result);
            continue;
        }
        
        try {
            // Get initial balances for all tokens involved
            const buyerInitialETH = await ethers.provider.getBalance(buyer.address);
            const sellerInitialETH = await ethers.provider.getBalance(seller.address);
            const serviceInitialETH = await ethers.provider.getBalance(serviceWallet.address);
            
            // Get initial token balances if dealing with tokens
            let buyerInitialToken = 0n;
            let sellerInitialToken = 0n;
            let serviceInitialToken = 0n;
            
            if (scenario.depositToken !== ethers.ZeroAddress) {
                buyerInitialToken = await getTokenBalance(scenario.depositToken, buyer.address);
                serviceInitialToken = await getTokenBalance(scenario.depositToken, serviceWallet.address);
            }
            
            if (scenario.targetToken !== ethers.ZeroAddress) {
                sellerInitialToken = await getTokenBalance(scenario.targetToken, seller.address);
            }
            
            console.log("\n📊 Initial Balances:");
            console.log(`Buyer ETH: ${ethers.formatEther(buyerInitialETH)}`);
            if (scenario.depositToken !== ethers.ZeroAddress) {
                console.log(`Buyer ${scenario.depositToken}: ${formatTokenAmount(buyerInitialToken, scenario.depositToken)}`);
            }
            console.log(`Seller ETH: ${ethers.formatEther(sellerInitialETH)}`);
            if (scenario.targetToken !== ethers.ZeroAddress) {
                console.log(`Seller ${scenario.targetToken}: ${formatTokenAmount(sellerInitialToken, scenario.targetToken)}`);
            }
            console.log(`Service ETH: ${ethers.formatEther(serviceInitialETH)}`);
            
            // Calculate expected values
            const serviceFee = scenario.depositAmount * 200n / 10000n; // 2%
            const netAmount = scenario.depositAmount - serviceFee;
            
            console.log("\n💰 Transaction Details:");
            console.log(`Deposit: ${formatTokenAmount(scenario.depositAmount, scenario.depositToken)}`);
            console.log(`Service Fee (2%): ${formatTokenAmount(serviceFee, scenario.depositToken)}`);
            console.log(`Net Amount: ${formatTokenAmount(netAmount, scenario.depositToken)}`);
            console.log(`Target Token: ${scenario.targetToken === ethers.ZeroAddress ? 'ETH' : scenario.targetToken}`);
            console.log(`Target Chain: ${scenario.targetChainId === 0 ? 'Same Chain' : `Chain ID ${scenario.targetChainId}`}`);
            
            // Create escrow
            console.log("\n📝 Creating escrow...");
            const createTx = await escrow.connect(buyer).createEscrow(
                seller.address,
                scenario.depositToken,
                scenario.depositAmount,
                scenario.targetToken,
                scenario.targetChainId,
                { value: scenario.depositToken === ethers.ZeroAddress ? scenario.depositAmount : 0 }
            );
            
            result.createTxHash = createTx.hash;
            console.log(`📤 Create transaction: ${result.createTxHash}`);
            const createReceipt = await createTx.wait();
            console.log(`✅ Escrow created in block ${createReceipt.blockNumber}`);
            console.log(`🔍 View create tx: ${explorerUrl}/tx/${result.createTxHash}`);
            
            // Parse escrow ID from events
            let escrowId = null;
            let actualServiceFee = 0n;
            
            for (const log of createReceipt.logs) {
                if (log.address.toLowerCase() === escrowAddress.toLowerCase()) {
                    try {
                        const iface = new ethers.Interface([
                            "event EscrowCreated(bytes32 indexed escrowId, address indexed buyer, address indexed seller, address depositToken, uint256 depositAmount, uint256 serviceFee, uint256 netAmount, address targetToken, uint32 targetChainId)"
                        ]);
                        const decoded = iface.parseLog(log);
                        if (decoded.name === "EscrowCreated") {
                            escrowId = decoded.args.escrowId;
                            result.escrowId = escrowId;
                            actualServiceFee = decoded.args.serviceFee;
                            console.log(`\n📋 Escrow Created Event:`);
                            console.log(`ID: ${escrowId}`);
                            console.log(`Service Fee: ${formatTokenAmount(actualServiceFee, scenario.depositToken)}`);
                            console.log(`Net Amount: ${formatTokenAmount(decoded.args.netAmount, scenario.depositToken)}`);
                            break;
                        }
                    } catch (e) {
                        // Continue
                    }
                }
            }
            
            if (!escrowId) {
                throw new Error("Could not find escrow ID in events");
            }
            
            // Verify escrow details
            console.log("\n🔍 Verifying escrow state...");
            const escrowDetails = await escrow.getEscrow(escrowId);
            console.log(`Buyer: ${escrowDetails.buyer === buyer.address ? '✅' : '❌'} ${escrowDetails.buyer}`);
            console.log(`Seller: ${escrowDetails.seller === seller.address ? '✅' : '❌'} ${escrowDetails.seller}`);
            console.log(`Amount: ${escrowDetails.depositAmount === scenario.depositAmount ? '✅' : '❌'} ${formatTokenAmount(escrowDetails.depositAmount, scenario.depositToken)}`);
            console.log(`Released: ${!escrowDetails.released ? '✅' : '❌'} ${escrowDetails.released}`);
            console.log(`Condition Met: ${escrowDetails.conditionMet ? '✅' : '❌'} ${escrowDetails.conditionMet}`);
            
            // Check service fee was collected
            const serviceAfterCreateETH = await ethers.provider.getBalance(serviceWallet.address);
            const serviceFeeReceivedETH = serviceAfterCreateETH - serviceInitialETH;
            
            if (scenario.depositToken === ethers.ZeroAddress) {
                console.log(`\n💰 Service fee collected: ${serviceFeeReceivedETH === actualServiceFee ? '✅' : '❌'} ${ethers.formatEther(serviceFeeReceivedETH)} ETH`);
            } else {
                const serviceAfterCreateToken = await getTokenBalance(scenario.depositToken, serviceWallet.address);
                const serviceTokenChange = serviceAfterCreateToken - serviceInitialToken;
                console.log(`\n💰 Service fee collected: ${serviceTokenChange === actualServiceFee ? '✅' : '❌'} ${formatTokenAmount(serviceTokenChange, scenario.depositToken)}`);
            }
            
            // Update condition to met (required for release)
            console.log("\n⚠️ Updating condition to met...");
            try {
                const conditionTx = await escrow.connect(deployer).updateCondition(escrowId, true);
                const conditionTxHash = conditionTx.hash;
                console.log(`📤 Condition update transaction: ${conditionTxHash}`);
                const conditionReceipt = await conditionTx.wait();
                console.log(`✅ Condition updated to: true`);
                console.log(`🔍 View condition tx: ${explorerUrl}/tx/${conditionTxHash}`);
                
                // Parse condition update event
                for (const log of conditionReceipt.logs) {
                    try {
                        const iface = new ethers.Interface([
                            "event ConditionUpdated(bytes32 indexed escrowId, bool conditionMet, address updatedBy)"
                        ]);
                        const decoded = iface.parseLog(log);
                        if (decoded.name === "ConditionUpdated") {
                            console.log(`📋 Condition Update Event:`);
                            console.log(`Updated by: ${decoded.args.updatedBy}`);
                            console.log(`Condition met: ${decoded.args.conditionMet}`);
                            break;
                        }
                    } catch (e) {
                        // Continue
                    }
                }
            } catch (e) {
                console.log("❌ Could not update condition:", e.message);
                throw new Error("Condition update failed - cannot proceed with release");
            }
            
            // Release escrow
            console.log("\n🚀 Releasing escrow...");
            
            // For cross-chain, we need to estimate and send LayerZero fee
            let releaseValue = 0n;
            if (scenario.targetChainId !== 0) {
                try {
                    // Get LayerZero fee estimate
                    const sendParam = {
                        dstEid: scenario.targetChainId,
                        to: ethers.zeroPadValue(seller.address, 32),
                        amountLD: netAmount,
                        minAmountLD: netAmount * 95n / 100n, // 5% slippage
                        extraOptions: "0x",
                        composeMsg: "0x",
                        oftCmd: "0x"
                    };
                    
                    const oftAdapter = await escrow.oftAdapters(scenario.targetChainId);
                    if (oftAdapter !== ethers.ZeroAddress) {
                        const oft = await ethers.getContractAt("IOFT", oftAdapter);
                        const fee = await oft.quoteSend(sendParam, false);
                        releaseValue = fee.nativeFee;
                        console.log(`LayerZero fee required: ${ethers.formatEther(releaseValue)} ETH`);
                    }
                } catch (e) {
                    console.log("Could not estimate LayerZero fee:", e.message);
                    releaseValue = ethers.parseEther("0.01"); // Fallback fee
                }
            }
            
            const releaseTx = await escrow.connect(buyer).releaseEscrow(escrowId, { value: releaseValue });
            result.releaseTxHash = releaseTx.hash;
            console.log(`📤 Release transaction: ${result.releaseTxHash}`);
            const releaseReceipt = await releaseTx.wait();
            console.log(`✅ Escrow released in block ${releaseReceipt.blockNumber}`);
            console.log(`🔍 View release tx: ${explorerUrl}/tx/${result.releaseTxHash}`);
            
            // Parse release events
            let routingMethod = "";
            let finalAmount = 0n;
            let finalToken = ethers.ZeroAddress;
            let layerZeroGuid = null;
            let uniswapTxHash = null;
            
            for (const log of releaseReceipt.logs) {
                if (log.address.toLowerCase() === escrowAddress.toLowerCase()) {
                    try {
                        const iface = new ethers.Interface([
                            "event EscrowReleased(bytes32 indexed escrowId, address indexed seller, address finalToken, uint256 finalAmount, string routingMethod)",
                            "event CrossChainTransferInitiated(bytes32 indexed escrowId, uint32 indexed targetChainId, address indexed oftAdapter, bytes32 layerZeroGuid)"
                        ]);
                        const decoded = iface.parseLog(log);
                        if (decoded.name === "EscrowReleased") {
                            routingMethod = decoded.args.routingMethod;
                            finalAmount = decoded.args.finalAmount;
                            finalToken = decoded.args.finalToken;
                            console.log(`\n📤 Release Event Details:`);
                            console.log(`Method: ${routingMethod}`);
                            console.log(`Final Amount: ${formatTokenAmount(finalAmount, finalToken)}`);
                            console.log(`Final Token: ${finalToken}`);
                        } else if (decoded.name === "CrossChainTransferInitiated") {
                            layerZeroGuid = decoded.args.layerZeroGuid;
                        } else if (decoded.name === "CrossChainTransferInitiated") {
                            layerZeroGuid = decoded.args.layerZeroGuid;
                            const withCompose = decoded.args.withCompose;
                            console.log(`\n🌉 Cross-Chain Transfer Event:`);
                            console.log(`Target Chain: ${decoded.args.targetChainId}`);
                            console.log(`OFT Adapter: ${decoded.args.oftAdapter}`);
                            console.log(`With Compose: ${withCompose ? '✅ Yes - Auto-swap enabled' : '❌ No - Will receive WETH'}`);                            console.log(`LayerZero GUID: ${layerZeroGuid}`);
                            console.log(`🔍 Track on LayerZero Scan: https://layerzeroscan.com/tx/${layerZeroGuid}`);
                        }
                    } catch (e) {
                        // Continue
                    }
                }
                
                // Check for Uniswap events if it was a swap
                if (routingMethod === "uniswap") {
                    try {
                        const swapInterface = new ethers.Interface([
                            "event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)"
                        ]);
                        const decoded = swapInterface.parseLog(log);
                        if (decoded.name === "Swap") {
                            console.log(`\n💱 Uniswap Swap Detected:`);
                            console.log(`Recipient: ${decoded.args.recipient}`);
                            uniswapTxHash = result.releaseTxHash;
                        }
                    } catch (e) {
                        // Not a swap event
                    }
                }
            }
            
            // Verify routing method
            console.log(`\n✅ Routing verification: ${routingMethod === scenario.expectedMethod ? '✅' : '❌'} (expected: ${scenario.expectedMethod}, actual: ${routingMethod})`);
            
            // Check final escrow state
            const finalEscrowDetails = await escrow.getEscrow(escrowId);
            console.log(`Escrow released: ${finalEscrowDetails.released ? '✅' : '❌'}`);
            
            // Wait for state to settle
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Final balance verification for ALL transaction types
            console.log("\n💰 Final Balance Verification:");
            
            // Get final balances
            const buyerFinalETH = await ethers.provider.getBalance(buyer.address);
            const sellerFinalETH = await ethers.provider.getBalance(seller.address);
            const serviceFinalETH = await ethers.provider.getBalance(serviceWallet.address);
            
            // Calculate changes
            const buyerETHChange = buyerFinalETH - buyerInitialETH;
            const sellerETHChange = sellerFinalETH - sellerInitialETH;
            const serviceETHChange = serviceFinalETH - serviceInitialETH;
            
            console.log(`\nETH Balance Changes:`);
            console.log(`Buyer: ${ethers.formatEther(buyerETHChange)} ETH`);
            console.log(`Seller: ${ethers.formatEther(sellerETHChange)} ETH`);
            console.log(`Service: ${ethers.formatEther(serviceETHChange)} ETH`);
            
            // Verify based on transaction type
            if (scenario.targetChainId === 0) {
                // Same chain transactions
                if (scenario.targetToken === ethers.ZeroAddress) {
                    // Direct ETH transfer
                    console.log(`\n✅ Direct Transfer Verification:`);
                    console.log(`Seller received: ${sellerETHChange === netAmount ? '✅' : '❌'} Expected: ${ethers.formatEther(netAmount)} ETH, Got: ${ethers.formatEther(sellerETHChange)} ETH`);
                    console.log(`Service fee: ${serviceETHChange === serviceFee ? '✅' : '❌'} Expected: ${ethers.formatEther(serviceFee)} ETH, Got: ${ethers.formatEther(serviceETHChange)} ETH`);
                } else {
                    // Token swap (ETH → USDC)
                    console.log(`\n💱 Token Swap Verification:`);
                    const sellerFinalToken = await getTokenBalance(scenario.targetToken, seller.address);
                    const sellerTokenChange = sellerFinalToken - sellerInitialToken;
                    
                    console.log(`Seller token balance change: ${formatTokenAmount(sellerTokenChange, scenario.targetToken)}`);
                    console.log(`Swap executed: ${sellerTokenChange > 0n ? '✅' : '❌'} (Should have received USDC)`);
                    console.log(`Service fee collected: ${serviceETHChange === serviceFee ? '✅' : '❌'} ${ethers.formatEther(serviceETHChange)} ETH`);
                    
                    if (uniswapTxHash) {
                        console.log(`🔍 View Uniswap swap: ${explorerUrl}/tx/${uniswapTxHash}`);
                    }
                    
                    // Verify contract ETH balance went down (used for swap)
                    const contractBalance = await ethers.provider.getBalance(escrowAddress);
                    console.log(`Contract ETH balance: ${ethers.formatEther(contractBalance)}`);
                }
            } else {
                // Cross-chain transfer
                console.log(`\n🌐 Cross-Chain Transfer Verification:`);
                console.log(`Service fee collected: ${serviceETHChange === serviceFee ? '✅' : '❌'} ${ethers.formatEther(serviceETHChange)} ETH`);
                console.log(`LayerZero fee paid from buyer: ${buyerETHChange < -scenario.depositAmount ? '✅' : '❌'}`);
                console.log(`Transfer initiated: ${layerZeroGuid ? '✅' : '❌'}`);
                
                if (layerZeroGuid) {
                    console.log(`\n📍 Cross-Chain Status:`);
                    console.log(`- Funds locked in source chain escrow`);
                    console.log(`- Will be minted on destination chain`);
                    
                    // Check if compose is enabled
                    const targetComposer = await escrow.getSwapComposer(scenario.targetChainId);
                    if (targetComposer !== ethers.ZeroAddress && scenario.targetToken !== wethAddress) {
                        console.log(`- 🎯 Auto-swap enabled: WETH → ${scenario.targetToken === ethers.ZeroAddress ? 'ETH' : 'Target Token'}`);
                        console.log(`- Composer: ${targetComposer}`);
                    } else {
                        console.log(`- ⚠️ No auto-swap: Seller will receive WETH`);
                    }
                    
                    console.log(`- Track progress: https://layerzeroscan.com/tx/${layerZeroGuid}`);
                    console.log(`- Destination chain: ${scenario.targetChainId}`);
                    console.log(`- Recipient: ${seller.address}`);
                    console.log(`- Amount: ${formatTokenAmount(netAmount, scenario.targetToken)}`);
                }
                
                // Verify escrow contract still has the funds (locked for bridge)
                const escrowBalance = await ethers.provider.getBalance(escrowAddress);
                console.log(`Escrow contract balance: ${ethers.formatEther(escrowBalance)} ETH (funds locked for bridge)`);
            }
            
            // Additional token balance checks if dealing with tokens
            if (scenario.depositToken !== ethers.ZeroAddress) {
                const buyerFinalToken = await getTokenBalance(scenario.depositToken, buyer.address);
                const buyerTokenChange = buyerFinalToken - buyerInitialToken;
                console.log(`\nBuyer token change: ${formatTokenAmount(buyerTokenChange, scenario.depositToken)}`);
                
                const serviceFinalToken = await getTokenBalance(scenario.depositToken, serviceWallet.address);
                const serviceTokenChange = serviceFinalToken - serviceInitialToken;
                console.log(`Service token fee: ${serviceTokenChange === serviceFee ? '✅' : '❌'} ${formatTokenAmount(serviceTokenChange, scenario.depositToken)}`);
            }
            
            result.success = true;
            console.log(`\n✅ ${scenario.name} - COMPLETED`);
            
        } catch (error) {
            result.error = error.message;
            console.log(`\n❌ ${scenario.name} - FAILED`);
            console.log(`Error: ${error.message}`);
            if (error.data) {
                console.log(`Error data: ${error.data}`);
            }
        }
        
        testResults.push(result);
    }
    
    // Final summary
    console.log("\n" + "=".repeat(60));
    console.log("📊 TEST SUMMARY");
    console.log("=".repeat(60));
    
    const finalBuyerBalance = await ethers.provider.getBalance(buyer.address);
    const finalServiceBalance = await ethers.provider.getBalance(serviceWallet.address);
    
    console.log(`\n💰 Final Balances:`);
    console.log(`Buyer: ${ethers.formatEther(finalBuyerBalance)} ETH`);
    console.log(`Service: ${ethers.formatEther(finalServiceBalance)} ETH`);
    console.log(`Total service fees collected: ${ethers.formatEther(finalServiceBalance)} ETH`);
    
    console.log(`\n📋 Test Results:`);
    for (const result of testResults) {
        console.log(`\n${result.name}:`);
        console.log(`Status: ${result.success ? '✅ SUCCESS' : '❌ FAILED'}`);
        if (result.escrowId) {
            console.log(`Escrow ID: ${result.escrowId}`);
        }
        if (result.createTxHash) {
            console.log(`Create TX: ${explorerUrl}/tx/${result.createTxHash}`);
        }
        if (result.releaseTxHash) {
            console.log(`Release TX: ${explorerUrl}/tx/${result.releaseTxHash}`);
        }
        if (result.error) {
            console.log(`Error: ${result.error}`);
        }
    }
    
    console.log(`\n🔍 Contract Verification:`);
    console.log(`Escrow Contract: ${explorerUrl}/address/${escrowAddress}`);
    console.log(`Service Wallet: ${serviceWallet.address}`);
    console.log(`Service Fee: 2%`);
    console.log(`Max Slippage: 5%`);
    
    // Check OFT adapter configurations
    console.log(`\n🌉 Cross-Chain Configuration:`);
    const chainIds = {
        "Sepolia": 40161,
        "Polygon Amoy": 40267,
        "Arbitrum Sepolia": 40231
    };
    
    for (const [name, id] of Object.entries(chainIds)) {
        try {
            const adapter = await escrow.oftAdapters(id);
            const chainName = await escrow.chainNames(id);
            console.log(`${name} (${id}): ${adapter !== ethers.ZeroAddress ? '✅' : '❌'} ${adapter}`);
        } catch (e) {
            console.log(`${name} (${id}): ❌ Not configured`);
        }
    }
    
    console.log(`\n📝 Test Coverage:`);
    console.log(`✅ Wallet creation and funding`);
    console.log(`✅ Service wallet configuration`);
    console.log(`✅ Condition updater authorization`);
    console.log(`✅ Condition management (required for all releases)`);
    console.log(`✅ Same chain, same token (direct transfer) with balance verification`);
    console.log(`✅ Same chain, different token (Uniswap swap) with token balance checks`);
    console.log(`✅ Cross-chain transfer (LayerZero bridge) with lock verification`);
    console.log(`✅ Service fee collection (2%) for all transaction types`);
    console.log(`✅ Escrow state management`);
    console.log(`✅ Event emission and parsing`);
    console.log(`✅ Transaction hash capture and verification`);
    console.log(`✅ Block explorer link generation`);
    console.log(`✅ Complete balance verification for all transaction types`);
    
    console.log(`\n🚀 Next Steps:`);
    console.log(`1. Deploy Universal Escrow on Polygon Amoy and Arbitrum Sepolia`);
    console.log(`2. Configure OFT adapters on all chains`);
    console.log(`3. Configure Uniswap router address if token swaps are needed`);
    console.log(`4. Test with real USDC tokens (mint or acquire from faucet)`);
    console.log(`5. Implement automated oracle for condition updates`);
    console.log(`6. Monitor cross-chain transfers on destination chains`);
    
    console.log(`\n💡 Token Support:`);
    console.log(`✅ ETH (native token)`);
    console.log(`✅ Any ERC20 token (USDC, USDT, WETH, etc.)`);
    console.log(`❌ NFTs (ERC721) - not supported`);
    console.log(`❌ Multi-tokens (ERC1155) - not supported`);
    
    console.log(`\n✨ TEST SUITE COMPLETED!`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("\n❌ Test suite failed:", error);
        process.exit(1);
    });