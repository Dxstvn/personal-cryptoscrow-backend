const hre = require("hardhat");

async function main() {
  console.log("\n=== SIMPLE CROSS-CHAIN TEST ===\n");
  
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer:", deployer.address);
  
  const network = hre.network.name;
  console.log(`Network: ${network}`);
  
  // Contract addresses
  const escrowAddresses = {
    "sepolia": "0x2ee79369D7cCb53550F1Ca61A1a3bf60B3C92f1E",
    "polygon-amoy": "0x53E4b9A8f7b1185768cef74d9564cbeD052a9682",
    "arbitrum-sepolia": "0xd3b5A13C113328C4F4F1AbF646a2be2AaC8815B5"
  };
  
  const escrowAddress = escrowAddresses[network];
  if (!escrowAddress) {
    console.error("No escrow contract for this network");
    return;
  }
  
  // OFT adapter addresses
  const oftAdapters = {
    "sepolia": "0xb3dd252bfc2c3d822f7F0f550Df576a9CC928Bf4",
    "polygon-amoy": "0x746EF3c4C9c3f779Bc3558A5FF55C3f34ae20725",
    "arbitrum-sepolia": "0xbaa46938E3110187ED6a55EE139312b28c943d00"
  };
  
  const oftAdapter = oftAdapters[network];
  console.log(`OFT Adapter: ${oftAdapter}`);
  
  // Connect to contracts
  const UniversalEscrowService = await hre.ethers.getContractFactory("UniversalEscrowService");
  const escrow = UniversalEscrowService.attach(escrowAddress);
  
  // Check current balance
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log(`\nDeployer balance: ${hre.ethers.formatEther(balance)} ETH`);
  
  // Create test wallets
  const buyer = deployer; // Use deployer as buyer to save gas
  const seller = hre.ethers.Wallet.createRandom();
  console.log(`\nBuyer: ${buyer.address}`);
  console.log(`Seller: ${seller.address}`);
  
  // Target chains
  const targetChains = {
    "sepolia": {
      polygon: 40267,
      arbitrum: 40231
    },
    "polygon-amoy": {
      sepolia: 40161,
      arbitrum: 40231
    },
    "arbitrum-sepolia": {
      sepolia: 40161,
      polygon: 40267
    }
  };
  
  const targets = targetChains[network];
  if (!targets) {
    console.error("No target chains configured");
    return;
  }
  
  // Test amount (very small to conserve funds)
  const testAmount = hre.ethers.parseEther("0.0001"); // 0.0001 ETH
  const serviceFee = testAmount * 2n / 100n; // 2%
  const netAmount = testAmount - serviceFee;
  
  console.log(`\n💰 Test Configuration:`);
  console.log(`Deposit: ${hre.ethers.formatEther(testAmount)} ETH`);
  console.log(`Service Fee (2%): ${hre.ethers.formatEther(serviceFee)} ETH`);
  console.log(`Net Amount: ${hre.ethers.formatEther(netAmount)} ETH`);
  
  // Get OFT adapter to quote fees
  const SimplePropertyOFTAdapter = await hre.ethers.getContractFactory("SimplePropertyOFTAdapter");
  const adapter = SimplePropertyOFTAdapter.attach(oftAdapter);
  
  // Quote LayerZero fee
  console.log(`\n📊 Getting LayerZero fee quotes...`);
  
  for (const [chainName, chainId] of Object.entries(targets)) {
    try {
      // Build SendParam for quote
      const sendParam = {
        dstEid: chainId,
        to: hre.ethers.zeroPadValue(seller.address, 32),
        amountLD: netAmount,
        minAmountLD: netAmount,
        extraOptions: "0x00030100110100000000000000000000000000030d40", // Standard options
        composeMsg: "0x", // No compose
        oftCmd: "0x" // No OFT command
      };
      
      const quote = await adapter.quoteSend(sendParam, false);
      
      console.log(`\n${chainName} (${chainId}):`);
      console.log(`  LayerZero fee: ${hre.ethers.formatEther(quote.nativeFee)} ETH`);
      console.log(`  Total needed: ${hre.ethers.formatEther(testAmount + quote.nativeFee)} ETH`);
      
      // Only test if we have enough balance
      if (balance >= testAmount + quote.nativeFee + hre.ethers.parseEther("0.001")) { // Extra for gas
        console.log(`  ✅ Sufficient balance for test`);
        
        // Create escrow
        console.log(`\n🔐 Creating cross-chain escrow to ${chainName}...`);
        
        // We'll get the escrow ID from the event
        
        // Get WETH address for target chain
        const wethAddress = chainName === "polygon" ? 
          "0x360ad4f9a9A8EFe9A8DCB5f461c4Cc1047E1Dcf9" : 
          "0x980B62Da83eFf3D4576C647993b0c1D7faf17c73";
        
        try {
          const tx = await escrow.createEscrow(
            seller.address,
            "0x0000000000000000000000000000000000000000", // ETH deposit
            testAmount,
            wethAddress, // Target token (WETH on destination)
            chainId, // Target chain
            { value: testAmount + quote.nativeFee }
          );
          
          console.log(`📤 Transaction: ${tx.hash}`);
          const receipt = await tx.wait();
          console.log(`✅ Escrow created in block ${receipt.blockNumber}`);
          
          // Get escrow ID from event
          const escrowCreatedEvent = receipt.logs.find(log => {
            try {
              const parsed = escrow.interface.parseLog(log);
              return parsed.name === "EscrowCreated";
            } catch {
              return false;
            }
          });
          
          if (!escrowCreatedEvent) {
            console.error("❌ Could not find EscrowCreated event");
            continue;
          }
          
          const parsedEvent = escrow.interface.parseLog(escrowCreatedEvent);
          const escrowId = parsedEvent.args.escrowId;
          console.log(`📋 Escrow ID: ${escrowId}`);
          
          // Update condition
          console.log(`\n📝 Updating condition...`);
          const conditionTx = await escrow.updateCondition(escrowId, true);
          await conditionTx.wait();
          console.log(`✅ Condition updated`);
          
          // Release
          console.log(`\n🚀 Releasing escrow...`);
          const releaseTx = await escrow.releaseEscrow(escrowId);
          console.log(`📤 Release transaction: ${releaseTx.hash}`);
          const releaseReceipt = await releaseTx.wait();
          console.log(`✅ Released in block ${releaseReceipt.blockNumber}`);
          
          // Check for LayerZero message
          console.log(`\n🌉 Cross-chain transfer initiated!`);
          console.log(`Monitor the destination chain (${chainName}) for the WETH arrival`);
          console.log(`Seller wallet: ${seller.address}`);
          
          break; // Only do one test to conserve funds
          
        } catch (error) {
          console.error(`❌ Failed: ${error.message}`);
          if (error.data) {
            console.error(`Error data: ${error.data}`);
          }
        }
        
      } else {
        console.log(`  ❌ Insufficient balance (need ${hre.ethers.formatEther(testAmount + quote.nativeFee + hre.ethers.parseEther("0.001"))} ETH)`);
      }
      
    } catch (error) {
      console.error(`Failed to quote ${chainName}: ${error.message}`);
    }
  }
  
  console.log("\n✅ Test complete!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });