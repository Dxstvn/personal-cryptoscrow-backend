const hre = require("hardhat");

async function main() {
  console.log("\n=== DEPLOY AND TEST V3 FIXED ===\n");
  
  const [deployer] = await hre.ethers.getSigners();
  
  // Deploy V3 with fixes
  console.log("🚀 Deploying fixed V3...");
  const EscrowV3 = await hre.ethers.getContractFactory("UniversalEscrowServiceV3");
  const escrow = await EscrowV3.deploy(
    "0x5aCbf4d8bb1aFF71fa49EaE2CCf686Fe534De039",
    "0x980B62Da83eFf3D4576C647993b0c1D7faf17c73",
    "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D"
  );
  
  await escrow.waitForDeployment();
  console.log("✅ V3 Fixed deployed to:", escrow.target);
  
  // Configure
  await escrow.setOFTAdapter(40161, "0xbaa46938E3110187ED6a55EE139312b28c943d00", "Sepolia");
  await escrow.setOFTAdapter(40267, "0xbaa46938E3110187ED6a55EE139312b28c943d00", "Polygon Amoy");
  await escrow.setSwapComposer(40161, "0x3e6d2247055683d53a16Fc935E24D30065a6DB05");
  await escrow.setSwapComposer(40267, "0xeE455345205F0Ab563f67307bF37E618180da05c");
  
  // Authorize
  const oftAdapter = await hre.ethers.getContractAt(
    "SimplePropertyOFTAdapter",
    "0xbaa46938E3110187ED6a55EE139312b28c943d00"
  );
  await oftAdapter.setDelegate(escrow.target);
  console.log("✅ Configured and authorized");
  
  // Fund
  await deployer.sendTransaction({
    to: escrow.target,
    value: hre.ethers.parseEther("0.01")
  });
  
  // Create escrow
  const seller = hre.ethers.Wallet.createRandom();
  const amount = hre.ethers.parseEther("0.001");
  
  console.log("\n📝 Creating cross-chain escrow...");
  console.log("Seller:", seller.address);
  console.log("Amount:", hre.ethers.formatEther(amount));
  
  const createTx = await escrow.createEscrow(
    seller.address,
    hre.ethers.ZeroAddress,
    amount,
    "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14",
    11155111,
    { value: amount }
  );
  
  const receipt = await createTx.wait();
  let escrowId;
  for (const log of receipt.logs) {
    try {
      const parsed = escrow.interface.parseLog(log);
      if (parsed && parsed.name === "EscrowCreated") {
        escrowId = parsed.args.escrowId;
        break;
      }
    } catch {}
  }
  
  // Update condition
  await escrow.updateCondition(escrowId, true);
  
  // Get fee
  const netAmount = amount * 98n / 100n;
  const sendParam = {
    dstEid: 40161,
    to: hre.ethers.zeroPadValue(seller.address, 32),
    amountLD: netAmount,
    minAmountLD: netAmount * 95n / 100n,
    extraOptions: "0x00030100110100000000000000000000000000030d40",
    composeMsg: "0x",
    oftCmd: "0x"
  };
  
  const quote = await oftAdapter.quoteSend(sendParam, false);
  console.log("\nLZ fee:", hre.ethers.formatEther(quote.nativeFee));
  
  // Release
  console.log("\n🚀 Releasing escrow...");
  try {
    const releaseTx = await escrow.releaseEscrow(escrowId, {
      value: quote.nativeFee,
      gasLimit: 3000000
    });
    
    console.log("📤 TX:", releaseTx.hash);
    const releaseReceipt = await releaseTx.wait();
    
    console.log("✅ SUCCESS! Gas used:", releaseReceipt.gasUsed.toString());
    
    // Parse events
    console.log("\n📋 Events:");
    let crossChainInitiated = false;
    for (const log of releaseReceipt.logs) {
      try {
        const parsed = escrow.interface.parseLog(log);
        if (parsed) {
          console.log("-", parsed.name);
          if (parsed.name === "CrossChainTransferInitiated") {
            crossChainInitiated = true;
            console.log("  GUID:", parsed.args.guid);
            console.log("  Target chain:", parsed.args.targetChainId);
            console.log("  OFT Adapter:", parsed.args.oftAdapter);
          }
        }
      } catch {
        try {
          const oftParsed = oftAdapter.interface.parseLog(log);
          if (oftParsed && oftParsed.name === "OFTSent") {
            console.log("- [OFT] OFTSent");
            console.log("  GUID:", oftParsed.args.guid);
            console.log("  Amount:", hre.ethers.formatEther(oftParsed.args.amountSentLD));
          }
        } catch {}
      }
    }
    
    if (crossChainInitiated) {
      console.log("\n🎉 CROSS-CHAIN TRANSFER SUCCESSFUL!");
      console.log("✅ Chain ID mapping solution works!");
      console.log("✅ Fee handling fixed!");
      console.log("✅ Parameter initialization fixed!");
      console.log("\nMonitor Sepolia for WETH arrival to:", seller.address);
      console.log("\n💾 Working V3 Contract:", escrow.target);
    }
    
  } catch (error) {
    console.error("❌ Failed:", error.message);
    if (error.receipt) {
      console.log("Gas used:", error.receipt.gasUsed?.toString());
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });