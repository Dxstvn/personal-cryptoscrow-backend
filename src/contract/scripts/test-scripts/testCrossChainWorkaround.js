const hre = require("hardhat");

async function main() {
  console.log("\n=== CROSS-CHAIN TEST (WORKAROUND) ===\n");
  
  const [deployer] = await hre.ethers.getSigners();
  const network = hre.network.name;
  
  // Skip Sepolia due to provider issues
  if (network === "sepolia") {
    console.log("⚠️  Skipping Sepolia due to provider issues.");
    console.log("Run this test on polygon-amoy or arbitrum-sepolia instead.");
    return;
  }
  
  console.log("Network:", network);
  console.log("Deployer:", deployer.address);
  
  // Contract configurations
  const configs = {
    "polygon-amoy": {
      escrow: "0x53E4b9A8f7b1185768cef74d9564cbeD052a9682",
      oftAdapter: "0x746EF3c4C9c3f779Bc3558A5FF55C3f34ae20725",
      targetChain: 40161, // Sepolia
      targetWeth: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14"
    },
    "arbitrum-sepolia": {
      escrow: "0xd3b5A13C113328C4F4F1AbF646a2be2AaC8815B5",
      oftAdapter: "0xbaa46938E3110187ED6a55EE139312b28c943d00",
      targetChain: 40161, // Sepolia
      targetWeth: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14"
    }
  };
  
  const config = configs[network];
  if (!config) {
    console.error("Network not configured");
    return;
  }
  
  // Connect to contracts
  const escrow = await hre.ethers.getContractAt("UniversalEscrowService", config.escrow);
  const oftAdapter = await hre.ethers.getContractAt("SimplePropertyOFTAdapter", config.oftAdapter);
  
  // Create test escrow
  const seller = hre.ethers.Wallet.createRandom();
  const amount = hre.ethers.parseEther("0.001");
  
  console.log("\nTest Configuration:");
  console.log("Seller:", seller.address);
  console.log("Amount:", hre.ethers.formatEther(amount), network === "polygon-amoy" ? "POL" : "ETH");
  console.log("Target Chain:", config.targetChain);
  console.log("Target WETH:", config.targetWeth);
  
  try {
    // Check OFT configuration
    console.log("\n🔍 Checking OFT configuration...");
    const configuredOft = await escrow.oftAdapters(config.targetChain);
    console.log("Configured OFT for target chain:", configuredOft);
    
    if (configuredOft === hre.ethers.ZeroAddress) {
      console.error("❌ No OFT adapter configured for target chain!");
      return;
    }
    
    // Get LayerZero quote first
    console.log("\n📊 Getting LayerZero quote...");
    const netAmount = amount * 98n / 100n; // After 2% fee
    
    const sendParam = {
      dstEid: config.targetChain,
      to: hre.ethers.zeroPadValue(seller.address, 32),
      amountLD: netAmount,
      minAmountLD: netAmount * 95n / 100n,
      extraOptions: "0x00030100110100000000000000000000000000030d40",
      composeMsg: "0x",
      oftCmd: "0x"
    };
    
    const quote = await oftAdapter.quoteSend(sendParam, false);
    console.log("LayerZero fee:", hre.ethers.formatEther(quote.nativeFee), network === "polygon-amoy" ? "POL" : "ETH");
    
    // Create escrow
    console.log("\n📝 Creating cross-chain escrow...");
    const createTx = await escrow.createEscrow(
      seller.address,
      hre.ethers.ZeroAddress, // Native token
      amount,
      config.targetWeth,
      config.targetChain,
      { value: amount }
    );
    
    console.log("TX:", createTx.hash);
    const createReceipt = await createTx.wait();
    console.log("✅ Created in block", createReceipt.blockNumber);
    
    // Get escrow ID
    let escrowId;
    for (const log of createReceipt.logs) {
      try {
        const parsed = escrow.interface.parseLog(log);
        if (parsed && parsed.name === "EscrowCreated") {
          escrowId = parsed.args.escrowId;
          console.log("Escrow ID:", escrowId);
          console.log("Service Fee:", hre.ethers.formatEther(parsed.args.serviceFee));
          console.log("Net Amount:", hre.ethers.formatEther(parsed.args.netAmount));
          break;
        }
      } catch {}
    }
    
    // Update condition
    console.log("\n📝 Updating condition...");
    const updateTx = await escrow.updateCondition(escrowId, true);
    await updateTx.wait();
    console.log("✅ Condition updated");
    
    // Release with LayerZero fee
    console.log("\n🚀 Releasing escrow cross-chain...");
    console.log("Sending LZ fee:", hre.ethers.formatEther(quote.nativeFee));
    
    const releaseTx = await escrow.releaseEscrow(escrowId, {
      value: quote.nativeFee,
      gasLimit: 1000000
    });
    
    console.log("Release TX:", releaseTx.hash);
    const releaseReceipt = await releaseTx.wait();
    console.log("✅ Released in block", releaseReceipt.blockNumber);
    
    // Parse events
    console.log("\n📋 Events emitted:");
    let crossChainInitiated = false;
    
    for (const log of releaseReceipt.logs) {
      try {
        const parsed = escrow.interface.parseLog(log);
        if (parsed) {
          console.log("-", parsed.name);
          
          if (parsed.name === "CrossChainTransferInitiated") {
            crossChainInitiated = true;
            console.log("  Target Chain:", parsed.args.targetChainId);
            console.log("  OFT Adapter:", parsed.args.oftAdapter);
            console.log("  GUID:", parsed.args.guid);
            console.log("  With Compose:", parsed.args.withCompose);
          } else if (parsed.name === "EscrowReleased") {
            console.log("  Method:", parsed.args.method);
            console.log("  Amount:", hre.ethers.formatEther(parsed.args.finalAmount));
          }
        }
      } catch {
        // Try OFT events
        try {
          const oftParsed = oftAdapter.interface.parseLog(log);
          if (oftParsed) {
            console.log("- [OFT]", oftParsed.name);
          }
        } catch {}
      }
    }
    
    if (crossChainInitiated) {
      console.log("\n✅ Cross-chain transfer successfully initiated!");
      console.log("Monitor the destination chain (Sepolia) for the WETH arrival.");
      console.log("Seller address:", seller.address);
    } else {
      console.log("\n⚠️  No CrossChainTransferInitiated event found!");
    }
    
  } catch (error) {
    console.error("\n❌ Error:", error.message);
    
    if (error.reason) {
      console.log("Reason:", error.reason);
    }
    
    // Try to decode custom errors
    if (error.data && error.data.length > 10) {
      console.log("\nTrying to decode error...");
      try {
        const errorInterface = new hre.ethers.Interface([
          "error UnauthorizedCaller()",
          "error InvalidChainId()",
          "error InsufficientBalance()"
        ]);
        const decoded = errorInterface.parseError(error.data);
        if (decoded) {
          console.log("Decoded error:", decoded.name);
        }
      } catch {
        console.log("Could not decode error");
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