const hre = require("hardhat");

async function main() {
  console.log("\n=== TEST COMPOSE SIMPLE ===\n");
  
  const [deployer] = await hre.ethers.getSigners();
  const escrowAddress = "0xeb8e89c8872f476750C91a9557798ec83EDC7031";
  const escrow = await hre.ethers.getContractAt("UniversalEscrowServiceV3", escrowAddress);
  
  console.log("📍 Testing compose with contract's internal logic");
  
  // Create escrow targeting USDC on Sepolia
  const seller = hre.ethers.Wallet.createRandom();
  const amount = hre.ethers.parseEther("0.0001");
  
  // Sepolia USDC address
  const sepoliaUSDC = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";
  
  console.log("\n📝 Creating cross-chain escrow targeting USDC...");
  console.log("Seller:", seller.address);
  console.log("Amount:", hre.ethers.formatEther(amount), "ETH");
  console.log("Target: USDC on Sepolia");
  
  const createTx = await escrow.createEscrow(
    seller.address,
    hre.ethers.ZeroAddress,
    amount,
    sepoliaUSDC,
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
        console.log("✅ Escrow created:", escrowId);
        break;
      }
    } catch {}
  }
  
  await escrow.updateCondition(escrowId, true);
  
  // Get a regular quote first to estimate
  const oftAdapter = await hre.ethers.getContractAt(
    "SimplePropertyOFTAdapter",
    "0xbaa46938E3110187ED6a55EE139312b28c943d00"
  );
  
  const netAmount = amount * 98n / 100n;
  const simpleParam = {
    dstEid: 40161,
    to: hre.ethers.zeroPadValue(seller.address, 32),
    amountLD: netAmount,
    minAmountLD: netAmount * 95n / 100n,
    extraOptions: "0x00030100110100000000000000000000000000030d40",
    composeMsg: "0x",
    oftCmd: "0x"
  };
  
  const simpleQuote = await oftAdapter.quoteSend(simpleParam, false);
  console.log("\n💰 Base LZ fee:", hre.ethers.formatEther(simpleQuote.nativeFee));
  
  // The contract will handle compose internally, so we just need to send enough
  // Compose typically needs 2-3x more gas
  const valueToSend = simpleQuote.nativeFee * 5n; // 5x for compose + buffer
  console.log("Sending with 5x buffer for compose:", hre.ethers.formatEther(valueToSend));
  
  console.log("\n🚀 Releasing escrow (compose handled internally)...");
  try {
    const releaseTx = await escrow.releaseEscrow(escrowId, {
      value: valueToSend,
      gasLimit: 3000000
    });
    
    console.log("📤 TX:", releaseTx.hash);
    const releaseReceipt = await releaseTx.wait();
    
    console.log("✅ Transaction completed! Gas used:", releaseReceipt.gasUsed.toString());
    
    // Check events
    console.log("\n📋 Events:");
    let composeUsed = false;
    for (const log of releaseReceipt.logs) {
      try {
        const parsed = escrow.interface.parseLog(log);
        if (parsed) {
          console.log("-", parsed.name);
          if (parsed.name === "CrossChainTransferInitiated") {
            composeUsed = parsed.args.withCompose;
            console.log("  GUID:", parsed.args.guid);
            console.log("  Target chain:", parsed.args.targetChainId);
            console.log("  With Compose:", parsed.args.withCompose);
            console.log("  OFT Adapter:", parsed.args.oftAdapter);
          } else if (parsed.name === "EscrowReleased") {
            console.log("  Method:", parsed.args.method);
            console.log("  With Compose:", parsed.args.withCompose);
          }
        }
      } catch {}
    }
    
    if (composeUsed) {
      console.log("\n🎉 COMPOSE FUNCTIONALITY ACTIVATED!");
      console.log("The transaction will:");
      console.log("1. Bridge WETH to Sepolia");
      console.log("2. Send to composer:", await escrow.swapComposers(40161));
      console.log("3. Composer swaps WETH -> USDC");
      console.log("4. Deliver USDC to seller:", seller.address);
    } else {
      console.log("\n⚠️  Compose was not activated");
      console.log("Check if composer is properly configured");
    }
    
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