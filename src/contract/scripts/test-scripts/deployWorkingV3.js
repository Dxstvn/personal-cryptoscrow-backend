const hre = require("hardhat");

async function main() {
  console.log("\n=== DEPLOY WORKING V3 ===\n");
  
  const [deployer] = await hre.ethers.getSigners();
  
  // We know the issue: quote changes between external and internal calls
  // Solution: Always send extra ETH (like 50% more) to cover any variance
  
  console.log("🚀 Using existing V3 at: 0xeb8e89c8872f476750C91a9557798ec83EDC7031");
  const escrow = await hre.ethers.getContractAt("UniversalEscrowServiceV3", "0xeb8e89c8872f476750C91a9557798ec83EDC7031");
  
  // Create escrow
  const seller = hre.ethers.Wallet.createRandom();
  const amount = hre.ethers.parseEther("0.001");
  
  console.log("\n📝 Creating escrow...");
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
  
  await escrow.updateCondition(escrowId, true);
  
  // Get quote
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
  console.log("\nExternal quote:", hre.ethers.formatEther(quote.nativeFee));
  
  // Send 50% extra to ensure we cover any quote increase
  const valueToSend = quote.nativeFee * 150n / 100n;
  console.log("Sending with 50% buffer:", hre.ethers.formatEther(valueToSend));
  
  console.log("\n🚀 Releasing with extra value...");
  try {
    const releaseTx = await escrow.releaseEscrow(escrowId, {
      value: valueToSend,
      gasLimit: 3000000
    });
    
    console.log("📤 TX:", releaseTx.hash);
    const releaseReceipt = await releaseTx.wait();
    
    console.log("✅ SUCCESS! Gas used:", releaseReceipt.gasUsed.toString());
    
    // Check events
    console.log("\n📋 Events:");
    for (const log of releaseReceipt.logs) {
      try {
        const parsed = escrow.interface.parseLog(log);
        if (parsed) {
          console.log("-", parsed.name);
          if (parsed.name === "CrossChainTransferInitiated") {
            console.log("  ✅ Cross-chain transfer initiated!");
            console.log("  GUID:", parsed.args.guid);
            console.log("  To Sepolia for:", seller.address);
          }
        }
      } catch {}
    }
    
    console.log("\n🎉 IT WORKS! The solution is to send extra ETH to cover quote variance!");
    console.log("\n📝 Summary of fixes:");
    console.log("1. ✅ Chain ID to endpoint ID mapping");
    console.log("2. ✅ Fixed parameter initialization (composeMsg, oftCmd)");
    console.log("3. ✅ Pass exact fee.nativeFee to OFT adapter");
    console.log("4. ✅ Send 50% extra ETH to cover quote increases");
    
  } catch (error) {
    console.error("❌ Failed:", error.message);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });