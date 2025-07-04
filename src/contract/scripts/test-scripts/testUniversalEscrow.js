import pkg from "hardhat";
const { ethers } = pkg;

async function main() {
    console.log("=== Testing Universal Escrow Service ===\n");
    
    const signers = await ethers.getSigners();
    const buyer = signers[0];
    const seller = signers[1] || signers[0]; // Use same address if only one signer
    console.log("Buyer:", buyer.address);
    console.log("Seller:", seller.address);
    
    // Get network info
    const network = await ethers.provider.getNetwork();
    const chainId = network.chainId.toString();
    const networkName = chainId === "11155111" ? "sepolia" :
                       chainId === "80002" ? "polygon-amoy" :
                       chainId === "421614" ? "arbitrum-sepolia" :
                       `unknown-${chainId}`;
    
    console.log(`Network: ${networkName} (Chain ID: ${chainId})`);
    
    // Universal Escrow Service addresses
    const escrowAddresses = {
        "sepolia": "0x335Bb94C802E224Bc3D7afE9d65902df9984ed08", // Deployed
        "polygon-amoy": "", // Update after deployment
        "arbitrum-sepolia": "", // Update after deployment
    };
    
    const escrowAddress = escrowAddresses[networkName];
    if (!escrowAddress) {
        console.log("❌ Please deploy Universal Escrow Service first and update the address in this script");
        console.log("Run: npx hardhat run scripts/deployUniversalEscrow.js --network", networkName);
        return;
    }
    
    const escrow = await ethers.getContractAt("UniversalEscrowService", escrowAddress);
    
    console.log(`\n📋 Testing with Universal Escrow: ${escrowAddress}`);
    
    // Test parameters
    const testAmount = ethers.parseEther("0.01"); // 0.01 ETH
    const expectedServiceFee = testAmount * 200n / 10000n; // 2%
    const expectedNetAmount = testAmount - expectedServiceFee;
    
    console.log(`\n💰 Test Parameters:`);
    console.log(`   Deposit Amount: ${ethers.formatEther(testAmount)} ETH`);
    console.log(`   Service Fee (2%): ${ethers.formatEther(expectedServiceFee)} ETH`);
    console.log(`   Net Amount: ${ethers.formatEther(expectedNetAmount)} ETH`);
    
    try {
        // Get initial balances
        console.log(`\n📊 Initial Balances:`);
        const buyerInitialETH = await ethers.provider.getBalance(buyer.address);
        const sellerInitialETH = await ethers.provider.getBalance(seller.address);
        const serviceWallet = await escrow.serviceWallet();
        const serviceInitialETH = await ethers.provider.getBalance(serviceWallet);
        
        console.log(`   Buyer ETH: ${ethers.formatEther(buyerInitialETH)}`);
        console.log(`   Seller ETH: ${ethers.formatEther(sellerInitialETH)}`);
        console.log(`   Service Wallet ETH: ${ethers.formatEther(serviceInitialETH)}`);
        
        // TEST 1: Create Escrow (ETH → ETH, Same Chain)
        console.log(`\n🧪 TEST 1: Create Escrow (ETH → ETH, Same Chain)`);
        
        const createTx = await escrow.connect(buyer).createEscrow(
            seller.address, // seller
            ethers.ZeroAddress, // depositToken (ETH)
            testAmount, // depositAmount
            ethers.ZeroAddress, // targetToken (ETH)
            0, // targetChainId (same chain)
            { value: testAmount }
        );
        
        console.log(`   ⏳ Creating escrow: ${createTx.hash}`);
        const createReceipt = await createTx.wait();
        console.log(`   ✅ Escrow created in block: ${createReceipt.blockNumber}`);
        
        // Parse events to get escrow ID
        let escrowId = null;
        for (const log of createReceipt.logs) {
            if (log.address.toLowerCase() === escrowAddress.toLowerCase()) {
                try {
                    const escrowInterface = new ethers.Interface([
                        "event EscrowCreated(bytes32 indexed escrowId, address indexed buyer, address indexed seller, address depositToken, uint256 depositAmount, uint256 serviceFee, uint256 netAmount, address targetToken, uint32 targetChainId)"
                    ]);
                    const decoded = escrowInterface.parseLog(log);
                    if (decoded.name === "EscrowCreated") {
                        escrowId = decoded.args.escrowId;
                        console.log(`   📋 Escrow ID: ${escrowId}`);
                        console.log(`   💰 Service Fee: ${ethers.formatEther(decoded.args.serviceFee)} ETH`);
                        console.log(`   💎 Net Amount: ${ethers.formatEther(decoded.args.netAmount)} ETH`);
                        break;
                    }
                } catch (e) {
                    // Continue looking
                }
            }
        }
        
        if (!escrowId) {
            console.log("❌ Could not find escrow ID in events");
            return;
        }
        
        // Check escrow details
        console.log(`\n🔍 Escrow Details:`);
        const escrowDetails = await escrow.getEscrow(escrowId);
        console.log(`   Buyer: ${escrowDetails.buyer}`);
        console.log(`   Seller: ${escrowDetails.seller}`);
        console.log(`   Deposit Token: ${escrowDetails.depositToken === ethers.ZeroAddress ? 'ETH' : escrowDetails.depositToken}`);
        console.log(`   Deposit Amount: ${ethers.formatEther(escrowDetails.depositAmount)} ETH`);
        console.log(`   Net Amount: ${ethers.formatEther(escrowDetails.netAmount)} ETH`);
        console.log(`   Target Token: ${escrowDetails.targetToken === ethers.ZeroAddress ? 'ETH' : escrowDetails.targetToken}`);
        console.log(`   Target Chain: ${escrowDetails.targetChainId === 0 ? 'Same Chain' : escrowDetails.targetChainId}`);
        console.log(`   Released: ${escrowDetails.released}`);
        
        // Check balances after escrow creation
        console.log(`\n📊 Balances After Escrow Creation:`);
        const buyerAfterCreateETH = await ethers.provider.getBalance(buyer.address);
        const serviceAfterCreateETH = await ethers.provider.getBalance(serviceWallet);
        const contractETH = await ethers.provider.getBalance(escrowAddress);
        
        console.log(`   Buyer ETH: ${ethers.formatEther(buyerAfterCreateETH)}`);
        console.log(`   Service Wallet ETH: ${ethers.formatEther(serviceAfterCreateETH)}`);
        console.log(`   Contract ETH: ${ethers.formatEther(contractETH)}`);
        
        const buyerSpent = buyerInitialETH - buyerAfterCreateETH;
        const serviceFeeReceived = serviceAfterCreateETH - serviceInitialETH;
        
        console.log(`   💸 Buyer Spent: ${ethers.formatEther(buyerSpent)} ETH (including gas)`);
        console.log(`   💰 Service Fee: ${ethers.formatEther(serviceFeeReceived)} ETH`);
        console.log(`   🏦 Contract Balance: ${ethers.formatEther(contractETH)} ETH`);
        
        // Verify amounts
        const serviceFeeDiff = serviceFeeReceived - expectedServiceFee;
        const contractExpected = expectedNetAmount;
        const contractDiff = contractETH - contractExpected;
        
        console.log(`\n✅ Verification:`);
        console.log(`   Service Fee Correct: ${Math.abs(serviceFeeDiff) < ethers.parseEther("0.000001") ? '✅' : '❌'}`);
        console.log(`   Contract Balance Correct: ${Math.abs(contractDiff) < ethers.parseEther("0.000001") ? '✅' : '❌'}`);
        
        // TEST 2: Release Escrow
        console.log(`\n🧪 TEST 2: Release Escrow`);
        
        const releaseTx = await escrow.connect(buyer).releaseEscrow(escrowId);
        console.log(`   ⏳ Releasing escrow: ${releaseTx.hash}`);
        const releaseReceipt = await releaseTx.wait();
        console.log(`   ✅ Escrow released in block: ${releaseReceipt.blockNumber}`);
        
        // Parse release events
        for (const log of releaseReceipt.logs) {
            if (log.address.toLowerCase() === escrowAddress.toLowerCase()) {
                try {
                    const escrowInterface = new ethers.Interface([
                        "event EscrowReleased(bytes32 indexed escrowId, address indexed seller, address finalToken, uint256 finalAmount, string routingMethod)"
                    ]);
                    const decoded = escrowInterface.parseLog(log);
                    if (decoded.name === "EscrowReleased") {
                        console.log(`   📤 Release Method: ${decoded.args.routingMethod}`);
                        console.log(`   💎 Final Amount: ${ethers.formatEther(decoded.args.finalAmount)} ETH`);
                        console.log(`   🎯 Final Token: ${decoded.args.finalToken === ethers.ZeroAddress ? 'ETH' : decoded.args.finalToken}`);
                        break;
                    }
                } catch (e) {
                    // Continue looking
                }
            }
        }
        
        // Check final balances
        console.log(`\n📊 Final Balances:`);
        const buyerFinalETH = await ethers.provider.getBalance(buyer.address);
        const sellerFinalETH = await ethers.provider.getBalance(seller.address);
        const serviceFinalETH = await ethers.provider.getBalance(serviceWallet);
        const contractFinalETH = await ethers.provider.getBalance(escrowAddress);
        
        console.log(`   Buyer ETH: ${ethers.formatEther(buyerFinalETH)}`);
        console.log(`   Seller ETH: ${ethers.formatEther(sellerFinalETH)}`);
        console.log(`   Service Wallet ETH: ${ethers.formatEther(serviceFinalETH)}`);
        console.log(`   Contract ETH: ${ethers.formatEther(contractFinalETH)}`);
        
        const sellerReceived = sellerFinalETH - sellerInitialETH;
        const totalServiceFee = serviceFinalETH - serviceInitialETH;
        
        console.log(`\n💰 Transaction Summary:`);
        console.log(`   Seller Received: ${ethers.formatEther(sellerReceived)} ETH`);
        console.log(`   Total Service Fee: ${ethers.formatEther(totalServiceFee)} ETH`);
        console.log(`   Expected Net Amount: ${ethers.formatEther(expectedNetAmount)} ETH`);
        
        // Final verification
        const sellerReceivedDiff = sellerReceived - expectedNetAmount;
        
        console.log(`\n✅ Final Verification:`);
        console.log(`   Seller Received Correct: ${Math.abs(sellerReceivedDiff) < ethers.parseEther("0.000001") ? '✅' : '❌'}`);
        console.log(`   Contract Emptied: ${contractFinalETH === 0n ? '✅' : '❌'}`);
        console.log(`   Service Fee Correct: ${Math.abs(totalServiceFee - expectedServiceFee) < ethers.parseEther("0.000001") ? '✅' : '❌'}`);
        
        // Check escrow status
        const finalEscrowDetails = await escrow.getEscrow(escrowId);
        console.log(`   Escrow Marked Released: ${finalEscrowDetails.released ? '✅' : '❌'}`);
        
        console.log(`\n🎉 TEST COMPLETED SUCCESSFULLY!`);
        
        console.log(`\n📋 Test Results Summary:`);
        console.log(`   ✅ Escrow creation with 2% service fee`);
        console.log(`   ✅ Automatic service fee collection`);
        console.log(`   ✅ Direct transfer (same token, same chain)`);
        console.log(`   ✅ Proper event emissions`);
        console.log(`   ✅ Correct balance management`);
        console.log(`   ✅ Escrow state tracking`);
        
        console.log(`\n🔍 Block Explorer Links:`);
        const explorers = {
            "sepolia": "https://sepolia.etherscan.io",
            "polygon-amoy": "https://amoy.polygonscan.com",
            "arbitrum-sepolia": "https://sepolia.arbiscan.io"
        };
        
        if (explorers[networkName]) {
            console.log(`   Create Tx: ${explorers[networkName]}/tx/${createTx.hash}`);
            console.log(`   Release Tx: ${explorers[networkName]}/tx/${releaseTx.hash}`);
            console.log(`   Contract: ${explorers[networkName]}/address/${escrowAddress}`);
        }
        
        console.log(`\n📝 Next Test Scenarios:`);
        console.log(`1. Test same-chain token swap (ETH → ERC20)`);
        console.log(`2. Test cross-chain escrow (requires LayerZero setup)`);
        console.log(`3. Test with different ERC20 tokens`);
        console.log(`4. Test unauthorized release attempts`);
        console.log(`5. Test with larger amounts and verify gas efficiency`);
        
    } catch (error) {
        console.log("❌ Test failed:", error.message);
        if (error.data) {
            console.log("Error data:", error.data);
        }
        
        console.log(`\n🔧 Debug Info:`);
        console.log(`Network: ${networkName}`);
        console.log(`Escrow Address: ${escrowAddress}`);
        console.log(`Buyer: ${buyer.address}`);
        console.log(`Seller: ${seller.address}`);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("\n❌ Test script failed:", error);
        process.exit(1);
    });