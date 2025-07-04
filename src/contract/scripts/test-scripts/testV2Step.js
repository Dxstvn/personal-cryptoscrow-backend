const hre = require("hardhat");

async function main() {
  console.log("\n=== STEP BY STEP V2 TEST ===\n");
  
  const [deployer] = await hre.ethers.getSigners();
  const escrowAddress = "0xF29A11B7c0856BAF925a63c1104F37b8A12204A2";
  const escrow = await hre.ethers.getContractAt("UniversalEscrowServiceV2", escrowAddress);
  
  // First, let's create a simple same-chain escrow to verify basic functionality
  console.log("1️⃣ Testing same-chain escrow...");
  const seller = hre.ethers.Wallet.createRandom();
  const amount = hre.ethers.parseEther("0.001");
  
  try {
    const createTx = await escrow.createEscrow(
      seller.address,
      hre.ethers.ZeroAddress, // ETH
      amount,
      hre.ethers.ZeroAddress, // ETH 
      0, // Same chain
      { value: amount }
    );
    
    const receipt = await createTx.wait();
    console.log("✅ Same-chain escrow created");
    
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
    console.log("✅ Condition updated");
    
    // Release
    const releaseTx = await escrow.releaseEscrow(escrowId);
    await releaseTx.wait();
    console.log("✅ Same-chain release successful!");
    
  } catch (error) {
    console.log("❌ Same-chain test failed:", error.message);
  }
  
  // Now test cross-chain
  console.log("\n2️⃣ Testing cross-chain escrow...");
  
  try {
    // Get the OFT adapter on local chain
    const localOftAdapter = await escrow.oftAdapters(40231); // Arbitrum endpoint
    console.log("Local OFT adapter:", localOftAdapter);
    
    if (localOftAdapter === hre.ethers.ZeroAddress) {
      console.log("❌ No OFT adapter configured for local chain!");
      
      // Let's check what's configured
      console.log("\nChecking configuration:");
      const sepoliaAdapter = await escrow.oftAdapters(40161);
      console.log("Sepolia adapter (40161):", sepoliaAdapter);
      
      // The issue might be we're trying to use wrong adapter
      console.log("\n💡 The contract might be using the wrong OFT adapter!");
      console.log("We need to ensure it uses the Sepolia adapter for transfers TO Sepolia");
    }
    
    // Create cross-chain escrow
    const seller2 = hre.ethers.Wallet.createRandom();
    const createTx2 = await escrow.createEscrow(
      seller2.address,
      hre.ethers.ZeroAddress,
      amount,
      "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14", // Sepolia WETH
      11155111, // Sepolia chain ID
      { value: amount }
    );
    
    const receipt2 = await createTx2.wait();
    console.log("✅ Cross-chain escrow created");
    
    let escrowId2;
    for (const log of receipt2.logs) {
      try {
        const parsed = escrow.interface.parseLog(log);
        if (parsed && parsed.name === "EscrowCreated") {
          escrowId2 = parsed.args.escrowId;
          break;
        }
      } catch {}
    }
    
    // Check the escrow data
    const escrowData = await escrow.escrows(escrowId2);
    console.log("\nEscrow data:");
    console.log("- Target chain ID:", escrowData.targetChainId);
    console.log("- Net amount:", hre.ethers.formatEther(escrowData.netAmount));
    
    // Update condition
    await escrow.updateCondition(escrowId2, true);
    console.log("✅ Condition updated");
    
    // Get quote from the correct adapter
    const targetEndpoint = await escrow.chainIdToEndpointId(11155111);
    console.log("\nTarget endpoint for Sepolia:", targetEndpoint);
    
    const oftAdapterAddress = await escrow.oftAdapters(targetEndpoint);
    console.log("OFT adapter for target:", oftAdapterAddress);
    
    // Get quote
    const adapter = await hre.ethers.getContractAt("SimplePropertyOFTAdapter", oftAdapterAddress);
    const netAmount = escrowData.netAmount;
    
    const sendParam = {
      dstEid: targetEndpoint,
      to: hre.ethers.zeroPadValue(seller2.address, 32),
      amountLD: netAmount,
      minAmountLD: netAmount * 95n / 100n,
      extraOptions: "0x00030100110100000000000000000000000000030d40",
      composeMsg: "0x",
      oftCmd: "0x"
    };
    
    const quote = await adapter.quoteSend(sendParam, false);
    console.log("\nLayerZero fee:", hre.ethers.formatEther(quote.nativeFee));
    
    // Try release with exact fee
    console.log("\n🚀 Attempting cross-chain release...");
    const releaseTx2 = await escrow.releaseEscrow(escrowId2, {
      value: quote.nativeFee,
      gasLimit: 2000000
    });
    
    console.log("TX sent:", releaseTx2.hash);
    const releaseReceipt = await releaseTx2.wait();
    console.log("✅ Cross-chain release successful!");
    
    // Check events
    for (const log of releaseReceipt.logs) {
      try {
        const parsed = escrow.interface.parseLog(log);
        if (parsed && parsed.name === "CrossChainTransferInitiated") {
          console.log("\n🎉 Cross-chain transfer initiated!");
          console.log("GUID:", parsed.args.guid);
          console.log("Target chain:", parsed.args.targetChainId);
        }
      } catch {}
    }
    
  } catch (error) {
    console.log("❌ Cross-chain test failed:", error.message);
    
    if (error.data) {
      console.log("\nError data:", error.data);
    }
    
    if (error.transaction) {
      console.log("\nTransaction that failed:");
      console.log("- To:", error.transaction.to);
      console.log("- Value:", error.transaction.value);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });