const hre = require("hardhat");
const deployments = require("../../deployments/universal-escrow-v3-summary.json");

// Explorer URLs for each network
const EXPLORERS = {
  "arbitrum-sepolia": "https://sepolia.arbiscan.io",
  "sepolia": "https://sepolia.etherscan.io",
  "polygon-amoy": "https://amoy.polygonscan.com"
};

// LayerZero Scan for cross-chain tracking
const LZ_SCAN = "https://testnet.layerzeroscan.com";

// Token addresses for testing
const TOKENS = {
  "arbitrum-sepolia": {
    WETH: "0x980B62Da83eFf3D4576C647993b0c1D7faf17c73",
    USDC: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d", // Testnet USDC if available
    DAI: "0x0000000000000000000000000000000000000000" // Add if available
  },
  "sepolia": {
    WETH: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14",
    USDC: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
    DAI: "0x0000000000000000000000000000000000000000" // Add if available
  },
  "polygon-amoy": {
    WETH: "0x360ad4f9a9A8EFe9A8DCB5f461c4Cc1047E1Dcf9",
    USDC: "0x0000000000000000000000000000000000000000", // Add if available
    DAI: "0x0000000000000000000000000000000000000000" // Add if available
  }
};

async function main() {
  const network = hre.network.name;
  console.log(`\n=== COMPREHENSIVE TEST ON ${network.toUpperCase()} ===\n`);
  
  const [deployer] = await hre.ethers.getSigners();
  const deployment = deployments.networks[network];
  const explorer = EXPLORERS[network];
  
  if (!deployment) {
    console.error("No deployment found for", network);
    return;
  }
  
  console.log("📍 Network Info:");
  console.log("- Chain ID:", deployment.chainId);
  console.log("- Escrow Contract:", deployment.address);
  console.log(`  ${explorer}/address/${deployment.address}`);
  console.log("- OFT Adapter:", deployment.oftAdapter);
  console.log(`  ${explorer}/address/${deployment.oftAdapter}`);
  
  const escrow = await hre.ethers.getContractAt("UniversalEscrowServiceV3", deployment.address);
  
  // Fund contract if needed
  const balance = await hre.ethers.provider.getBalance(deployment.address);
  if (balance < hre.ethers.parseEther("0.01")) {
    console.log("\n💰 Funding contract...");
    const fundTx = await deployer.sendTransaction({
      to: deployment.address,
      value: hre.ethers.parseEther("0.01")
    });
    await fundTx.wait();
    console.log(`✅ Funded: ${explorer}/tx/${fundTx.hash}`);
  }
  
  // Test 1: Same-chain ETH to ETH (simple release)
  console.log("\n\n🧪 TEST 1: Same-chain ETH → ETH");
  await testSameChainETH(escrow, explorer);
  
  // Test 2: Same-chain ETH to WETH (token swap)
  console.log("\n\n🧪 TEST 2: Same-chain ETH → WETH (Uniswap swap)");
  await testSameChainSwap(escrow, explorer, deployment);
  
  // Test 3: Cross-chain transfer
  console.log("\n\n🧪 TEST 3: Cross-chain ETH → WETH");
  await testCrossChain(escrow, explorer, deployment, deployments);
  
  // Test 4: Cross-chain with compose
  console.log("\n\n🧪 TEST 4: Cross-chain ETH → USDC (Compose)");
  await testCrossChainCompose(escrow, explorer, deployment, deployments);
}

async function testSameChainETH(escrow, explorer) {
  const seller = hre.ethers.Wallet.createRandom();
  const amount = hre.ethers.parseEther("0.0001");
  
  console.log("Creating escrow...");
  console.log("- Seller:", seller.address);
  console.log("- Amount:", hre.ethers.formatEther(amount), "ETH");
  
  // Record seller's initial balance
  const sellerBalanceBefore = await hre.ethers.provider.getBalance(seller.address);
  console.log("- Seller balance before:", hre.ethers.formatEther(sellerBalanceBefore), "ETH");
  
  // Create escrow
  const createTx = await escrow.createEscrow(
    seller.address,
    hre.ethers.ZeroAddress, // ETH
    amount,
    hre.ethers.ZeroAddress, // ETH
    0, // Same chain
    { value: amount }
  );
  
  const createReceipt = await createTx.wait();
  console.log(`✅ Created: ${explorer}/tx/${createTx.hash}`);
  
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
  
  // Update condition
  await escrow.updateCondition(escrowId, true);
  
  // Release
  const releaseTx = await escrow.releaseEscrow(escrowId);
  const releaseReceipt = await releaseTx.wait();
  console.log(`✅ Released: ${explorer}/tx/${releaseTx.hash}`);
  
  // Verify seller received funds
  const sellerBalanceAfter = await hre.ethers.provider.getBalance(seller.address);
  const received = sellerBalanceAfter - sellerBalanceBefore;
  const expectedAmount = amount * 98n / 100n; // 2% fee
  
  console.log("\n💰 Verification:");
  console.log("- Seller balance after:", hre.ethers.formatEther(sellerBalanceAfter), "ETH");
  console.log("- Amount received:", hre.ethers.formatEther(received), "ETH");
  console.log("- Expected (98%):", hre.ethers.formatEther(expectedAmount), "ETH");
  console.log("- Status:", received === expectedAmount ? "✅ VERIFIED" : "❌ MISMATCH");
}

async function testSameChainSwap(escrow, explorer, deployment) {
  const seller = hre.ethers.Wallet.createRandom();
  const amount = hre.ethers.parseEther("0.0001");
  const wethAddress = deployment.weth;
  
  console.log("Creating escrow for token swap...");
  console.log("- Seller:", seller.address);
  console.log("- Amount:", hre.ethers.formatEther(amount), "ETH");
  console.log("- Target: WETH");
  
  // Connect to WETH to check balance
  const weth = await hre.ethers.getContractAt("IERC20", wethAddress);
  const wethBalanceBefore = await weth.balanceOf(seller.address);
  console.log("- Seller WETH before:", hre.ethers.formatEther(wethBalanceBefore));
  
  // Create escrow
  const createTx = await escrow.createEscrow(
    seller.address,
    hre.ethers.ZeroAddress, // ETH
    amount,
    wethAddress, // Target WETH
    0, // Same chain
    { value: amount }
  );
  
  const createReceipt = await createTx.wait();
  console.log(`✅ Created: ${explorer}/tx/${createTx.hash}`);
  
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
  
  // Update condition
  await escrow.updateCondition(escrowId, true);
  
  // Release (should swap ETH to WETH)
  const releaseTx = await escrow.releaseEscrow(escrowId);
  const releaseReceipt = await releaseTx.wait();
  console.log(`✅ Released: ${explorer}/tx/${releaseTx.hash}`);
  
  // Check for swap event
  let swapDetected = false;
  for (const log of releaseReceipt.logs) {
    try {
      const parsed = escrow.interface.parseLog(log);
      if (parsed && parsed.name === "TokenSwapped") {
        swapDetected = true;
        console.log("\n🔄 Token Swap:");
        console.log("- From:", parsed.args.fromToken === hre.ethers.ZeroAddress ? "ETH" : parsed.args.fromToken);
        console.log("- To:", parsed.args.toToken);
        console.log("- Amount In:", hre.ethers.formatEther(parsed.args.fromAmount));
        console.log("- Amount Out:", hre.ethers.formatEther(parsed.args.toAmount));
      }
    } catch {}
  }
  
  // Verify seller received WETH
  const wethBalanceAfter = await weth.balanceOf(seller.address);
  const wethReceived = wethBalanceAfter - wethBalanceBefore;
  
  console.log("\n💰 Verification:");
  console.log("- Seller WETH after:", hre.ethers.formatEther(wethBalanceAfter));
  console.log("- WETH received:", hre.ethers.formatEther(wethReceived));
  console.log("- Swap executed:", swapDetected ? "✅ YES" : "❌ NO");
  console.log("- Status:", wethReceived > 0 ? "✅ VERIFIED" : "❌ FAILED");
}

async function testCrossChain(escrow, explorer, deployment, deployments) {
  // Determine target chain
  const targetChains = {
    "arbitrum-sepolia": "sepolia",
    "sepolia": "polygon-amoy",
    "polygon-amoy": "arbitrum-sepolia"
  };
  
  const targetNetwork = targetChains[hre.network.name];
  const targetDeployment = deployments.networks[targetNetwork];
  
  const seller = hre.ethers.Wallet.createRandom();
  const amount = hre.ethers.parseEther("0.0001");
  
  console.log("Creating cross-chain escrow...");
  console.log("- Seller:", seller.address);
  console.log("- Amount:", hre.ethers.formatEther(amount), "ETH");
  console.log("- Target chain:", targetNetwork);
  console.log("- Target WETH:", targetDeployment.weth);
  
  // Create escrow
  const createTx = await escrow.createEscrow(
    seller.address,
    hre.ethers.ZeroAddress,
    amount,
    targetDeployment.weth,
    targetDeployment.chainId,
    { value: amount }
  );
  
  const createReceipt = await createTx.wait();
  console.log(`✅ Created: ${explorer}/tx/${createTx.hash}`);
  
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
  
  // Update condition
  await escrow.updateCondition(escrowId, true);
  
  // Get quote
  const oftAdapter = await hre.ethers.getContractAt(
    "SimplePropertyOFTAdapter",
    deployment.oftAdapter
  );
  
  const netAmount = amount * 98n / 100n;
  const sendParam = {
    dstEid: targetDeployment.layerZeroEndpointId,
    to: hre.ethers.zeroPadValue(seller.address, 32),
    amountLD: netAmount,
    minAmountLD: netAmount * 95n / 100n,
    extraOptions: "0x00030100110100000000000000000000000000030d40",
    composeMsg: "0x",
    oftCmd: "0x"
  };
  
  const quote = await oftAdapter.quoteSend(sendParam, false);
  const feeWithBuffer = quote.nativeFee * 3n;
  
  console.log("\n💰 LayerZero Fee:");
  console.log("- Base:", hre.ethers.formatEther(quote.nativeFee));
  console.log("- With 3x buffer:", hre.ethers.formatEther(feeWithBuffer));
  
  // Release
  const releaseTx = await escrow.releaseEscrow(escrowId, {
    value: feeWithBuffer,
    gasLimit: 3000000
  });
  
  const releaseReceipt = await releaseTx.wait();
  console.log(`✅ Released: ${explorer}/tx/${releaseTx.hash}`);
  
  // Find LayerZero GUID
  let guid;
  for (const log of releaseReceipt.logs) {
    try {
      const parsed = escrow.interface.parseLog(log);
      if (parsed && parsed.name === "CrossChainTransferInitiated") {
        guid = parsed.args.guid;
        console.log("\n🌉 Cross-chain Transfer:");
        console.log("- GUID:", guid);
        console.log(`- Track on LayerZero: ${LZ_SCAN}/tx/${guid}`);
        console.log("- Destination:", targetNetwork);
        console.log("- Recipient:", seller.address);
        break;
      }
    } catch {}
  }
  
  console.log("\n⏳ Note: Check destination chain in ~1-3 minutes:");
  console.log(`- ${EXPLORERS[targetNetwork]}/address/${seller.address}`);
  console.log("- Expected: ~", hre.ethers.formatEther(netAmount), "WETH");
}

async function testCrossChainCompose(escrow, explorer, deployment, deployments) {
  // Only test if USDC is available on destination
  const targetNetwork = "sepolia"; // Sepolia has USDC
  const targetDeployment = deployments.networks[targetNetwork];
  const targetUSDC = TOKENS[targetNetwork].USDC;
  
  if (targetUSDC === hre.ethers.ZeroAddress || !targetDeployment.composer) {
    console.log("⚠️  Skipping: No USDC or composer on target chain");
    return;
  }
  
  const seller = hre.ethers.Wallet.createRandom();
  const amount = hre.ethers.parseEther("0.0001");
  
  console.log("Creating cross-chain escrow with compose...");
  console.log("- Seller:", seller.address);
  console.log("- Amount:", hre.ethers.formatEther(amount), "ETH");
  console.log("- Target chain:", targetNetwork);
  console.log("- Target token: USDC");
  console.log("- Composer:", targetDeployment.composer);
  
  // Create escrow targeting USDC
  const createTx = await escrow.createEscrow(
    seller.address,
    hre.ethers.ZeroAddress,
    amount,
    targetUSDC,
    targetDeployment.chainId,
    { value: amount }
  );
  
  const createReceipt = await createTx.wait();
  console.log(`✅ Created: ${explorer}/tx/${createTx.hash}`);
  
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
  
  // Update condition
  await escrow.updateCondition(escrowId, true);
  
  // Get quote (compose needs more gas)
  const oftAdapter = await hre.ethers.getContractAt(
    "SimplePropertyOFTAdapter",
    deployment.oftAdapter
  );
  
  const netAmount = amount * 98n / 100n;
  const sendParam = {
    dstEid: targetDeployment.layerZeroEndpointId,
    to: hre.ethers.zeroPadValue(seller.address, 32),
    amountLD: netAmount,
    minAmountLD: netAmount * 95n / 100n,
    extraOptions: "0x00030100110100000000000000000000000000030d40",
    composeMsg: "0x",
    oftCmd: "0x"
  };
  
  const quote = await oftAdapter.quoteSend(sendParam, false);
  const feeWithBuffer = quote.nativeFee * 5n; // 5x for compose
  
  console.log("\n💰 LayerZero Fee (with compose):");
  console.log("- Base:", hre.ethers.formatEther(quote.nativeFee));
  console.log("- With 5x buffer:", hre.ethers.formatEther(feeWithBuffer));
  
  // Release
  const releaseTx = await escrow.releaseEscrow(escrowId, {
    value: feeWithBuffer,
    gasLimit: 3000000
  });
  
  const releaseReceipt = await releaseTx.wait();
  console.log(`✅ Released: ${explorer}/tx/${releaseTx.hash}`);
  
  // Check events
  let guid, withCompose;
  for (const log of releaseReceipt.logs) {
    try {
      const parsed = escrow.interface.parseLog(log);
      if (parsed && parsed.name === "CrossChainTransferInitiated") {
        guid = parsed.args.guid;
        withCompose = parsed.args.withCompose;
        console.log("\n🌉 Cross-chain Transfer with Compose:");
        console.log("- GUID:", guid);
        console.log(`- Track on LayerZero: ${LZ_SCAN}/tx/${guid}`);
        console.log("- With Compose:", withCompose ? "✅ YES" : "❌ NO");
        console.log("- Flow: ETH → WETH → Bridge → Composer → USDC → Seller");
        break;
      }
    } catch {}
  }
  
  console.log("\n⏳ Note: Check destination chain in ~2-5 minutes:");
  console.log(`- ${EXPLORERS[targetNetwork]}/address/${seller.address}`);
  console.log("- Expected: USDC (amount depends on swap rate)");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });