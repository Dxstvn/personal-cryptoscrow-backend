const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("\n=== DEPLOY AND TEST V4 ===\n");
  
  const [deployer] = await hre.ethers.getSigners();
  
  // Deploy V4
  console.log("🚀 Deploying V4 with fee fix...");
  const EscrowV4 = await hre.ethers.getContractFactory("UniversalEscrowServiceV4");
  const escrow = await EscrowV4.deploy(
    "0x5aCbf4d8bb1aFF71fa49EaE2CCf686Fe534De039",
    "0x980B62Da83eFf3D4576C647993b0c1D7faf17c73",
    "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D"
  );
  
  await escrow.waitForDeployment();
  console.log("✅ V4 deployed to:", escrow.target);
  
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
        console.log("Escrow ID:", escrowId);
        break;
      }
    } catch {}
  }
  
  // Update condition
  await escrow.updateCondition(escrowId, true);
  
  // Get fee externally (caller's responsibility)
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
  console.log("\nLZ fee (from external quote):", hre.ethers.formatEther(quote.nativeFee));
  
  // Add a small buffer to handle gas price fluctuations
  const feeWithBuffer = quote.nativeFee * 110n / 100n; // 10% buffer
  console.log("Fee with 10% buffer:", hre.ethers.formatEther(feeWithBuffer));
  
  // Release
  console.log("\n🚀 Releasing escrow with buffered fee...");
  try {
    const releaseTx = await escrow.releaseEscrow(escrowId, {
      value: feeWithBuffer,
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
          }
        }
      } catch {
        try {
          const oftParsed = oftAdapter.interface.parseLog(log);
          if (oftParsed && oftParsed.name === "OFTSent") {
            console.log("- [OFT] OFTSent");
            console.log("  Amount:", hre.ethers.formatEther(oftParsed.args.amountSentLD));
          }
        } catch {}
      }
    }
    
    if (crossChainInitiated) {
      console.log("\n🎉 CROSS-CHAIN TRANSFER SUCCESSFUL WITH V4!");
      console.log("✅ Chain ID mapping works!");
      console.log("✅ Fee handling fixed by removing internal quote!");
      console.log("✅ All issues resolved!");
      console.log("\nMonitor Sepolia for WETH arrival to:", seller.address);
      
      // Save deployment
      const deployment = {
        network: "arbitrum-sepolia",
        address: escrow.target,
        version: "V4",
        deployedAt: new Date().toISOString(),
        deployer: deployer.address,
        fixes: [
          "Chain ID to endpoint ID mapping",
          "Fixed fee handling by using caller-provided fee",
          "Fixed parameter initialization",
          "Removed internal quoteSend to avoid quote mismatch"
        ]
      };
      
      const deploymentPath = path.join(__dirname, "..", "..", "deployments", "escrow-v4-arbitrum-sepolia.json");
      fs.writeFileSync(deploymentPath, JSON.stringify(deployment, null, 2));
      console.log("\n💾 Deployment saved to:", deploymentPath);
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