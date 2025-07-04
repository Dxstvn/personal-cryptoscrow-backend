const hre = require("hardhat");

async function main() {
  console.log("\n=== CROSS-CHAIN ESCROW TEST ===\n");
  
  const [deployer] = await hre.ethers.getSigners();
  const network = hre.network.name;
  
  console.log("Network:", network);
  console.log("Deployer:", deployer.address);
  
  // Get current balance
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Balance:", hre.ethers.formatEther(balance), "ETH\n");
  
  // Contract addresses
  const contracts = {
    "sepolia": {
      escrow: "0x2ee79369D7cCb53550F1Ca61A1a3bf60B3C92f1E",
      oftAdapter: "0xb3dd252bfc2c3d822f7F0f550Df576a9CC928Bf4"
    },
    "polygon-amoy": {
      escrow: "0x53E4b9A8f7b1185768cef74d9564cbeD052a9682",
      oftAdapter: "0x746EF3c4C9c3f779Bc3558A5FF55C3f34ae20725"
    },
    "arbitrum-sepolia": {
      escrow: "0xd3b5A13C113328C4F4F1AbF646a2be2AaC8815B5", 
      oftAdapter: "0xbaa46938E3110187ED6a55EE139312b28c943d00"
    }
  };
  
  const networkConfig = contracts[network];
  if (!networkConfig) {
    console.error("Unknown network");
    return;
  }
  
  // Target chains
  const targets = {
    "sepolia": { name: "polygon", id: 40267, weth: "0x360ad4f9a9A8EFe9A8DCB5f461c4Cc1047E1Dcf9" },
    "polygon-amoy": { name: "sepolia", id: 40161, weth: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14" },
    "arbitrum-sepolia": { name: "sepolia", id: 40161, weth: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14" }
  };
  
  const target = targets[network];
  if (!target) {
    console.error("No target configured");
    return;
  }
  
  console.log(`Target: ${target.name} (Chain ID: ${target.id})`);
  console.log(`Target WETH: ${target.weth}\n`);
  
  // Connect to contracts
  const UniversalEscrowService = await hre.ethers.getContractFactory("UniversalEscrowService");
  const escrow = UniversalEscrowService.attach(networkConfig.escrow);
  
  // Test parameters
  const seller = hre.ethers.Wallet.createRandom().connect(hre.ethers.provider);
  const amount = hre.ethers.parseEther("0.0001"); // 0.0001 ETH
  
  console.log("Test Amount:", hre.ethers.formatEther(amount), "ETH");
  console.log("Seller:", seller.address);
  
  try {
    // First, let's check if we need to set authorized caller for the escrow
    const oftAdapter = await escrow.oftAdapters(target.id);
    console.log("\nOFT Adapter for target chain:", oftAdapter);
    
    if (oftAdapter === "0x0000000000000000000000000000000000000000") {
      console.error("❌ No OFT adapter configured for target chain!");
      return;
    }
    
    // Get LayerZero fee quote from OFT adapter
    console.log("\n📊 Getting LayerZero fee quote...");
    const SimplePropertyOFTAdapter = await hre.ethers.getContractFactory("SimplePropertyOFTAdapter");
    const adapter = SimplePropertyOFTAdapter.attach(networkConfig.oftAdapter);
    
    const sendParam = {
      dstEid: target.id,
      to: hre.ethers.zeroPadValue(seller.address, 32),
      amountLD: amount * 98n / 100n, // 2% fee deducted
      minAmountLD: amount * 98n / 100n,
      extraOptions: hre.ethers.solidityPacked(
        ["uint16", "uint256"],
        [1, 200000] // Gas limit for receive
      ),
      composeMsg: "0x",
      oftCmd: "0x"
    };
    
    const quote = await adapter.quoteSend(sendParam, false);
    console.log("LayerZero fee:", hre.ethers.formatEther(quote.nativeFee), "ETH");
    
    console.log("Total needed for release:", hre.ethers.formatEther(quote.nativeFee), "ETH (paid later)");
    
    if (balance < amount + quote.nativeFee + hre.ethers.parseEther("0.001")) {
      console.error("\n❌ Insufficient balance!");
      return;
    }
    
    // Create escrow (only pay deposit amount now, LZ fee paid on release)
    console.log("\n🔐 Creating cross-chain escrow...");
    const tx = await escrow.createEscrow(
      seller.address,
      "0x0000000000000000000000000000000000000000", // ETH
      amount,
      target.weth, // Target WETH
      target.id,
      { value: amount } // Only the deposit amount
    );
    
    console.log("📤 Transaction:", tx.hash);
    const receipt = await tx.wait();
    console.log("✅ Escrow created in block", receipt.blockNumber);
    
    // Get escrow ID from event
    const event = receipt.logs.find(log => {
      try {
        const parsed = escrow.interface.parseLog(log);
        return parsed.name === "EscrowCreated";
      } catch {
        return false;
      }
    });
    
    if (!event) {
      console.error("❌ Could not find EscrowCreated event");
      return;
    }
    
    const parsedEvent = escrow.interface.parseLog(event);
    const escrowId = parsedEvent.args.escrowId;
    console.log("\n📋 Escrow ID:", escrowId);
    console.log("Service Fee:", hre.ethers.formatEther(parsedEvent.args.serviceFee), "ETH");
    console.log("Net Amount:", hre.ethers.formatEther(parsedEvent.args.netAmount), "ETH");
    
    // Update condition
    console.log("\n📝 Updating condition...");
    const updateTx = await escrow.updateCondition(escrowId, true);
    await updateTx.wait();
    console.log("✅ Condition updated");
    
    // Release escrow (need to send LZ fee with release)
    console.log("\n🚀 Releasing escrow cross-chain...");
    console.log("Sending LayerZero fee:", hre.ethers.formatEther(quote.nativeFee), "ETH");
    
    try {
      const releaseTx = await escrow.releaseEscrow(escrowId, { value: quote.nativeFee });
      console.log("📤 Release transaction:", releaseTx.hash);
      const releaseReceipt = await releaseTx.wait();
      console.log("✅ Released in block", releaseReceipt.blockNumber);
    } catch (releaseError) {
      console.error("Release failed:", releaseError.message);
      if (releaseError.data) {
        console.error("Error data:", releaseError.data);
      }
      // Try to understand why it failed
      const escrowData = await escrow.escrows(escrowId);
      console.log("\nEscrow state:");
      console.log("Released:", escrowData.released);
      console.log("Condition met:", escrowData.conditionMet);
      console.log("Target chain:", escrowData.targetChainId);
      return;
    }
    
    // Parse release event
    const releaseEvent = releaseReceipt.logs.find(log => {
      try {
        const parsed = escrow.interface.parseLog(log);
        return parsed.name === "EscrowReleased";
      } catch {
        return false;
      }
    });
    
    if (releaseEvent) {
      const parsedRelease = escrow.interface.parseLog(releaseEvent);
      console.log("\n📤 Release Details:");
      console.log("Method:", parsedRelease.args.method);
      console.log("With Compose:", parsedRelease.args.withCompose);
    }
    
    console.log("\n🌉 Cross-chain transfer initiated!");
    console.log(`Monitor ${target.name} for WETH arrival to:`, seller.address);
    console.log("\n✅ Test completed successfully!");
    
  } catch (error) {
    console.error("\n❌ Error:", error.message);
    if (error.data) {
      try {
        // Try to decode the error
        const errorInterface = new hre.ethers.Interface([
          "error InsufficientBalance()",
          "error InvalidAmount()", 
          "error UnauthorizedCaller()",
          "error EscrowNotFound()",
          "error ConditionNotMet()",
          "error AlreadyReleased()"
        ]);
        const decoded = errorInterface.parseError(error.data);
        if (decoded) {
          console.error("Decoded error:", decoded.name);
        }
      } catch {
        console.error("Error data:", error.data);
      }
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });