const hre = require("hardhat");

async function main() {
  console.log("\n=== TEST SAME-CHAIN RELEASE ===\n");
  
  const [deployer] = await hre.ethers.getSigners();
  const network = hre.network.name;
  
  if (network === "sepolia") {
    console.log("Please run on polygon-amoy or arbitrum-sepolia");
    return;
  }
  
  const configs = {
    "polygon-amoy": {
      escrow: "0x53E4b9A8f7b1185768cef74d9564cbeD052a9682",
      chainId: 80002
    },
    "arbitrum-sepolia": {
      escrow: "0xd3b5A13C113328C4F4F1AbF646a2be2AaC8815B5",
      chainId: 421614
    }
  };
  
  const config = configs[network];
  const escrow = await hre.ethers.getContractAt("UniversalEscrowService", config.escrow);
  
  console.log("Network:", network);
  console.log("Chain ID:", config.chainId);
  
  // Create a SAME-CHAIN escrow
  const seller = hre.ethers.Wallet.createRandom();
  const amount = hre.ethers.parseEther("0.001");
  
  console.log("\n📝 Creating SAME-CHAIN escrow...");
  console.log("Target chain: 0 (same chain)");
  
  const createTx = await escrow.createEscrow(
    seller.address,
    hre.ethers.ZeroAddress, // ETH
    amount,
    hre.ethers.ZeroAddress, // ETH (same token)
    0, // Same chain!
    { value: amount }
  );
  
  const receipt = await createTx.wait();
  console.log("✅ Escrow created");
  
  // Get escrow ID
  let escrowId;
  for (const log of receipt.logs) {
    try {
      const parsed = escrow.interface.parseLog(log);
      if (parsed && parsed.name === "EscrowCreated") {
        escrowId = parsed.args.escrowId;
        console.log("Escrow ID:", escrowId);
        break;
      }
    } catch {}
  }
  
  // Update condition
  await escrow.updateCondition(escrowId, true);
  console.log("✅ Condition updated");
  
  // Release - should work without issues
  console.log("\n🚀 Releasing SAME-CHAIN escrow...");
  try {
    const releaseTx = await escrow.releaseEscrow(escrowId);
    const releaseReceipt = await releaseTx.wait();
    console.log("✅ Released successfully!");
    console.log("Gas used:", releaseReceipt.gasUsed.toString());
    
    // Check events
    for (const log of releaseReceipt.logs) {
      try {
        const parsed = escrow.interface.parseLog(log);
        if (parsed && parsed.name === "EscrowReleased") {
          console.log("\nRelease event:");
          console.log("- Method:", parsed.args.method);
          console.log("- Amount:", hre.ethers.formatEther(parsed.args.finalAmount));
        }
      } catch {}
    }
    
  } catch (error) {
    console.log("❌ Failed:", error.message);
  }
  
  // Now test with actual cross-chain using real chain IDs
  console.log("\n\n=== TESTING WITH ACTUAL CHAIN IDs ===");
  console.log("\n⚠️  The contract uses LayerZero endpoint IDs, not chain IDs!");
  console.log("This is a design issue that needs to be fixed in the contract.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });