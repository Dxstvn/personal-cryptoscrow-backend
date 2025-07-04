const hre = require("hardhat");

async function main() {
  console.log("\n=== TEST WITH MASSIVE BUFFER ===\n");
  
  const [deployer] = await hre.ethers.getSigners();
  const escrow = await hre.ethers.getContractAt("UniversalEscrowServiceV3", "0xeb8e89c8872f476750C91a9557798ec83EDC7031");
  
  // Create tiny escrow
  const seller = hre.ethers.Wallet.createRandom();
  const amount = hre.ethers.parseEther("0.0001"); // Very small
  
  console.log("Creating tiny escrow...");
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
  
  // Try with 10x the fee
  const massiveValue = quote.nativeFee * 10n;
  console.log("Sending 10x fee:", hre.ethers.formatEther(massiveValue));
  
  console.log("\n🚀 Releasing with massive buffer...");
  try {
    const releaseTx = await escrow.releaseEscrow(escrowId, {
      value: massiveValue,
      gasLimit: 3000000
    });
    
    console.log("📤 TX:", releaseTx.hash);
    const releaseReceipt = await releaseTx.wait();
    
    console.log("✅ SUCCESS! Gas used:", releaseReceipt.gasUsed.toString());
    
    // Check actual fee used
    const ethSpent = massiveValue;
    const ethRefunded = await hre.ethers.provider.getBalance(deployer.address);
    console.log("\n💰 Fee analysis:");
    console.log("Sent:", hre.ethers.formatEther(massiveValue));
    console.log("If this works, we can see how much was actually used");
    
    // Check events
    for (const log of releaseReceipt.logs) {
      try {
        const parsed = escrow.interface.parseLog(log);
        if (parsed && parsed.name === "CrossChainTransferInitiated") {
          console.log("\n🎉 CROSS-CHAIN TRANSFER INITIATED!");
          console.log("GUID:", parsed.args.guid);
        }
      } catch {}
    }
    
  } catch (error) {
    console.error("❌ Still failed even with 10x fee!");
    console.log("\n🤔 This suggests the issue is NOT just about fee amount");
    console.log("There must be something else wrong");
    console.log("\n💡 Wait... what if the contract is reverting BEFORE the require?");
    console.log("What if there's an issue with the WETH deposit or approval?");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });