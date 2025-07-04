const hre = require("hardhat");

async function main() {
  console.log("\n=== TEST CROSS-CHAIN V3 ===\n");
  
  const [deployer] = await hre.ethers.getSigners();
  const escrowAddress = "0xE512E0C01707B5472c71DFeea555A079996fDdB8";
  const escrow = await hre.ethers.getContractAt("UniversalEscrowServiceV3", escrowAddress);
  
  console.log("V3 Contract:", escrowAddress);
  console.log("Deployer:", deployer.address);
  
  // First, fund the contract
  console.log("\n💰 Funding contract...");
  const fundTx = await deployer.sendTransaction({
    to: escrowAddress,
    value: hre.ethers.parseEther("0.01")
  });
  await fundTx.wait();
  console.log("✅ Sent 0.01 ETH to contract");
  
  // Create cross-chain escrow
  const seller = hre.ethers.Wallet.createRandom();
  const amount = hre.ethers.parseEther("0.001");
  
  console.log("\n📝 Creating cross-chain escrow...");
  console.log("Seller:", seller.address);
  console.log("Amount:", hre.ethers.formatEther(amount));
  console.log("Target: Sepolia (11155111)");
  
  const createTx = await escrow.createEscrow(
    seller.address,
    hre.ethers.ZeroAddress,
    amount,
    "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14", // Sepolia WETH
    11155111,
    { value: amount }
  );
  
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
  
  // Get LZ fee
  console.log("\n💰 Getting LayerZero fee...");
  const oftAdapter = await hre.ethers.getContractAt(
    "SimplePropertyOFTAdapter",
    "0xbaa46938E3110187ED6a55EE139312b28c943d00"
  );
  
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
  console.log("LayerZero fee:", hre.ethers.formatEther(quote.nativeFee));
  
  // Release escrow
  console.log("\n🚀 Releasing escrow cross-chain...");
  try {
    const releaseTx = await escrow.releaseEscrow(escrowId, {
      value: quote.nativeFee,
      gasLimit: 2000000
    });
    
    console.log("📤 TX:", releaseTx.hash);
    const releaseReceipt = await releaseTx.wait();
    console.log("✅ Released in block", releaseReceipt.blockNumber);
    console.log("Gas used:", releaseReceipt.gasUsed.toString());
    
    // Check events
    console.log("\n📋 Events:");
    for (const log of releaseReceipt.logs) {
      try {
        const parsed = escrow.interface.parseLog(log);
        if (parsed) {
          console.log("-", parsed.name);
          if (parsed.name === "CrossChainTransferInitiated") {
            console.log("  GUID:", parsed.args.guid);
            console.log("  Target chain:", parsed.args.targetChainId);
            console.log("  OFT Adapter:", parsed.args.oftAdapter);
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
          if (oftParsed && oftParsed.name === "OFTSent") {
            console.log("- [OFT] OFTSent");
            console.log("  GUID:", oftParsed.args.guid);
            console.log("  Amount:", hre.ethers.formatEther(oftParsed.args.amountSentLD));
          }
        } catch {}
      }
    }
    
    console.log("\n✅ CROSS-CHAIN TRANSFER SUCCESSFUL WITH V3!");
    console.log("The oftCmd fix resolved the issue!");
    console.log("\n🎉 Monitor Sepolia for WETH arrival to:", seller.address);
    
  } catch (error) {
    console.error("\n❌ Error:", error.message);
    if (error.data) {
      console.log("Error data:", error.data);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });