const hre = require("hardhat");

async function main() {
  console.log("\n=== FINAL TEST CROSS-CHAIN V2 ===\n");
  
  const [deployer] = await hre.ethers.getSigners();
  const network = hre.network.name;
  
  console.log("Network:", network);
  console.log("Deployer:", deployer.address);
  
  const escrowAddress = "0xF29A11B7c0856BAF925a63c1104F37b8A12204A2";
  const escrow = await hre.ethers.getContractAt("UniversalEscrowServiceV2", escrowAddress);
  
  // First, send some ETH to the contract for WETH conversion
  console.log("\n💰 Funding escrow contract...");
  const fundTx = await deployer.sendTransaction({
    to: escrowAddress,
    value: hre.ethers.parseEther("0.01")
  });
  await fundTx.wait();
  console.log("✅ Sent 0.01 ETH to escrow");
  
  const contractBalance = await hre.ethers.provider.getBalance(escrowAddress);
  console.log("Contract balance:", hre.ethers.formatEther(contractBalance));
  
  // Create test escrow
  const seller = hre.ethers.Wallet.createRandom();
  const amount = hre.ethers.parseEther("0.001");
  
  console.log("\nTest Configuration:");
  console.log("Seller:", seller.address);
  console.log("Amount:", hre.ethers.formatEther(amount), "ETH");
  console.log("Target: Sepolia (11155111)");
  
  try {
    // Create escrow
    console.log("\n📝 Creating escrow...");
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
    
    let escrowId;
    for (const log of createReceipt.logs) {
      try {
        const parsed = escrow.interface.parseLog(log);
        if (parsed && parsed.name === "EscrowCreated") {
          escrowId = parsed.args.escrowId;
          break;
        }
      } catch {}
    }
    
    console.log("Escrow ID:", escrowId);
    
    // Update condition
    await escrow.updateCondition(escrowId, true);
    console.log("✅ Condition updated");
    
    // Get LZ fee
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
    console.log("\nLayerZero fee:", hre.ethers.formatEther(quote.nativeFee));
    
    // Check WETH allowance before release
    const weth = await hre.ethers.getContractAt("IERC20", "0x980B62Da83eFf3D4576C647993b0c1D7faf17c73");
    const allowanceBefore = await weth.allowance(escrowAddress, oftAdapter.target);
    console.log("WETH allowance before:", hre.ethers.formatEther(allowanceBefore));
    
    // Release
    console.log("\n🚀 Releasing with fee:", hre.ethers.formatEther(quote.nativeFee));
    const releaseTx = await escrow.releaseEscrow(escrowId, {
      value: quote.nativeFee,
      gasLimit: 2000000
    });
    
    console.log("📤 TX:", releaseTx.hash);
    const releaseReceipt = await releaseTx.wait();
    console.log("✅ Success! Gas used:", releaseReceipt.gasUsed.toString());
    
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
          }
        }
      } catch {
        // Check OFT events
        try {
          const oftParsed = oftAdapter.interface.parseLog(log);
          if (oftParsed) {
            console.log("- [OFT]", oftParsed.name);
          }
        } catch {}
      }
    }
    
    // Check final state
    const wethBalanceAfter = await weth.balanceOf(escrowAddress);
    console.log("\n💰 Final WETH balance:", hre.ethers.formatEther(wethBalanceAfter));
    
    console.log("\n✅ CROSS-CHAIN TRANSFER INITIATED SUCCESSFULLY!");
    console.log("Monitor Sepolia for WETH arrival to:", seller.address);
    
  } catch (error) {
    console.error("\n❌ Error:", error.message);
    
    // More detailed error info
    if (error.transaction) {
      console.log("\nTransaction:");
      console.log("- Data length:", error.transaction.data?.length);
      console.log("- Value:", error.transaction.value);
    }
    
    if (error.receipt) {
      console.log("\nReceipt:");
      console.log("- Status:", error.receipt.status);
      console.log("- Gas used:", error.receipt.gasUsed?.toString());
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });