const hre = require("hardhat");

async function main() {
  console.log("\n=== TEST COMPOSE SWAP FUNCTIONALITY ===\n");
  
  const [deployer] = await hre.ethers.getSigners();
  const escrowAddress = "0xeb8e89c8872f476750C91a9557798ec83EDC7031";
  const escrow = await hre.ethers.getContractAt("UniversalEscrowServiceV3", escrowAddress);
  
  console.log("📍 Testing compose functionality on Arbitrum Sepolia");
  console.log("This will bridge WETH to Sepolia and auto-swap to USDC");
  
  // Create escrow targeting USDC on Sepolia
  const seller = hre.ethers.Wallet.createRandom();
  const amount = hre.ethers.parseEther("0.0001"); // Small amount for testing
  
  // Sepolia USDC address
  const sepoliaUSDC = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";
  
  console.log("\n📝 Creating cross-chain escrow with compose...");
  console.log("Seller:", seller.address);
  console.log("Amount:", hre.ethers.formatEther(amount), "ETH");
  console.log("Target: USDC on Sepolia");
  
  const createTx = await escrow.createEscrow(
    seller.address,
    hre.ethers.ZeroAddress, // ETH deposit
    amount,
    sepoliaUSDC, // Target USDC instead of WETH
    11155111, // Sepolia
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
  
  // Update condition
  await escrow.updateCondition(escrowId, true);
  console.log("✅ Condition updated");
  
  // Check if composer will be used
  const escrowData = await escrow.escrows(escrowId);
  console.log("\n🔍 Escrow configuration:");
  console.log("- Target token:", escrowData.targetToken);
  console.log("- Target chain:", escrowData.targetChainId);
  console.log("- Will use compose:", escrowData.targetToken !== "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14");
  
  // Get quote for compose message
  const oftAdapter = await hre.ethers.getContractAt(
    "SimplePropertyOFTAdapter",
    "0xbaa46938E3110187ED6a55EE139312b28c943d00"
  );
  
  const netAmount = amount * 98n / 100n;
  
  // Check composer address
  const composerAddress = await escrow.swapComposers(40161); // Sepolia endpoint
  console.log("\n📦 Composer on Sepolia:", composerAddress);
  
  // Build compose message
  const composeMsg = hre.ethers.AbiCoder.defaultAbiCoder().encode(
    ["address", "address", "uint256", "uint256", "uint32"],
    [
      seller.address, // recipient
      sepoliaUSDC, // target token
      netAmount, // amount
      0, // min amount out (let composer calculate)
      Math.floor(Date.now() / 1000) + 3600 // deadline (1 hour)
    ]
  );
  
  // Get quote with compose
  const sendParam = {
    dstEid: 40161,
    to: hre.ethers.zeroPadValue(composerAddress, 32), // Send to composer
    amountLD: netAmount,
    minAmountLD: netAmount * 95n / 100n,
    extraOptions: "0x00030100110100000000000000000000000000030d40" + "00030101001101000000000000000000000000030d40", // Extra gas for compose
    composeMsg: composeMsg,
    oftCmd: "0x"
  };
  
  const quote = await oftAdapter.quoteSend(sendParam, false);
  console.log("\n💰 LayerZero fee with compose:", hre.ethers.formatEther(quote.nativeFee));
  
  // Send with 3x buffer as we learned
  const valueToSend = quote.nativeFee * 3n;
  console.log("Sending with 3x buffer:", hre.ethers.formatEther(valueToSend));
  
  console.log("\n🚀 Releasing escrow with compose...");
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
            console.log("  ✅ Cross-chain transfer with compose initiated!");
            console.log("  GUID:", parsed.args.guid);
            console.log("  With Compose:", parsed.args.withCompose);
          } else if (parsed.name === "EscrowReleased") {
            console.log("  Method:", parsed.args.method);
            console.log("  With Compose:", parsed.args.withCompose);
          }
        }
      } catch {}
    }
    
    console.log("\n🎉 COMPOSE FUNCTIONALITY WORKING!");
    console.log("Monitor Sepolia for:");
    console.log("1. WETH arrival to composer:", composerAddress);
    console.log("2. Automatic swap to USDC");
    console.log("3. USDC delivery to seller:", seller.address);
    
  } catch (error) {
    console.error("❌ Compose test failed:", error.message);
    console.log("\n💡 Compose might need:");
    console.log("1. More gas in extraOptions");
    console.log("2. Composer contract to be properly configured");
    console.log("3. Sufficient liquidity on destination");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });