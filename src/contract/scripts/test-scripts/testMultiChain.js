const hre = require("hardhat");
const deployments = require("../../deployments/universal-escrow-v3-summary.json");

async function main() {
  const network = hre.network.name;
  console.log(`\n=== MULTI-CHAIN TEST ON ${network.toUpperCase()} ===\n`);
  
  const [deployer] = await hre.ethers.getSigners();
  const deployment = deployments.networks[network];
  
  if (!deployment) {
    console.error("No deployment found for", network);
    return;
  }
  
  console.log("📍 Network Info:");
  console.log("- Chain ID:", deployment.chainId);
  console.log("- Escrow:", deployment.address);
  console.log("- OFT Adapter:", deployment.oftAdapter);
  console.log("- Composer:", deployment.composer || "None");
  
  const escrow = await hre.ethers.getContractAt("UniversalEscrowServiceV3", deployment.address);
  
  // Fund contract if needed
  const balance = await hre.ethers.provider.getBalance(deployment.address);
  if (balance < hre.ethers.parseEther("0.01")) {
    console.log("\n💰 Funding contract...");
    await deployer.sendTransaction({
      to: deployment.address,
      value: hre.ethers.parseEther("0.01")
    });
  }
  
  // Test configurations for each network
  const testConfigs = {
    "arbitrum-sepolia": {
      targetChain: "sepolia",
      targetChainId: 11155111,
      targetToken: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14" // Sepolia WETH
    },
    "sepolia": {
      targetChain: "polygon-amoy",
      targetChainId: 80002,
      targetToken: "0x360ad4f9a9A8EFe9A8DCB5f461c4Cc1047E1Dcf9" // Polygon WETH
    },
    "polygon-amoy": {
      targetChain: "arbitrum-sepolia",
      targetChainId: 421614,
      targetToken: "0x980B62Da83eFf3D4576C647993b0c1D7faf17c73" // Arbitrum WETH
    }
  };
  
  const testConfig = testConfigs[network];
  console.log(`\n🧪 Testing transfer to ${testConfig.targetChain}`);
  
  // Create escrow
  const seller = hre.ethers.Wallet.createRandom();
  const amount = hre.ethers.parseEther("0.0001");
  
  console.log("\n📝 Creating cross-chain escrow...");
  console.log("Seller:", seller.address);
  console.log("Amount:", hre.ethers.formatEther(amount));
  console.log("Target:", testConfig.targetChain);
  
  const createTx = await escrow.createEscrow(
    seller.address,
    hre.ethers.ZeroAddress,
    amount,
    testConfig.targetToken,
    testConfig.targetChainId,
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
  
  console.log("✅ Escrow created:", escrowId);
  
  // Update condition
  await escrow.updateCondition(escrowId, true);
  
  // Get quote
  const oftAdapter = await hre.ethers.getContractAt(
    "SimplePropertyOFTAdapter",
    deployment.oftAdapter
  );
  
  const targetEndpointId = deployments.networks[testConfig.targetChain].layerZeroEndpointId;
  const netAmount = amount * 98n / 100n;
  
  const sendParam = {
    dstEid: targetEndpointId,
    to: hre.ethers.zeroPadValue(seller.address, 32),
    amountLD: netAmount,
    minAmountLD: netAmount * 95n / 100n,
    extraOptions: "0x00030100110100000000000000000000000000030d40",
    composeMsg: "0x",
    oftCmd: "0x"
  };
  
  const quote = await oftAdapter.quoteSend(sendParam, false);
  const feeWithBuffer = quote.nativeFee * 3n;
  
  console.log("\n💰 Fees:");
  console.log("- Base quote:", hre.ethers.formatEther(quote.nativeFee));
  console.log("- With 3x buffer:", hre.ethers.formatEther(feeWithBuffer));
  
  // Release
  console.log("\n🚀 Initiating cross-chain transfer...");
  try {
    const releaseTx = await escrow.releaseEscrow(escrowId, {
      value: feeWithBuffer,
      gasLimit: 3000000
    });
    
    console.log("📤 TX:", releaseTx.hash);
    const releaseReceipt = await releaseTx.wait();
    
    console.log("✅ SUCCESS! Gas used:", releaseReceipt.gasUsed.toString());
    
    // Check events
    for (const log of releaseReceipt.logs) {
      try {
        const parsed = escrow.interface.parseLog(log);
        if (parsed && parsed.name === "CrossChainTransferInitiated") {
          console.log("\n🎉 Cross-chain transfer initiated!");
          console.log("- GUID:", parsed.args.guid);
          console.log("- From:", network);
          console.log("- To:", testConfig.targetChain);
          console.log("- Recipient:", seller.address);
        }
      } catch {}
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