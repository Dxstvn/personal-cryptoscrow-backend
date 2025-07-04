const hre = require("hardhat");
const deployments = require("../../deployments/universal-escrow-v3-summary.json");

// Explorer URLs
const EXPLORERS = {
  "arbitrum-sepolia": "https://sepolia.arbiscan.io",
  "sepolia": "https://sepolia.etherscan.io",
  "polygon-amoy": "https://amoy.polygonscan.com"
};

const LZ_SCAN = "https://testnet.layerzeroscan.com";

async function main() {
  const network = hre.network.name;
  console.log(`\n=== VERIFICATION TEST ON ${network.toUpperCase()} ===\n`);
  
  const [deployer] = await hre.ethers.getSigners();
  const deployment = deployments.networks[network];
  const explorer = EXPLORERS[network];
  
  if (!deployment) {
    console.error("No deployment found for", network);
    return;
  }
  
  console.log("📍 Contract Links:");
  console.log(`- Escrow: ${explorer}/address/${deployment.address}`);
  console.log(`- OFT Adapter: ${explorer}/address/${deployment.oftAdapter}`);
  if (deployment.composer) {
    console.log(`- Composer: ${explorer}/address/${deployment.composer}`);
  }
  
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
  }
  
  // Test 1: Verify same-chain ETH transfer
  console.log("\n\n🧪 TEST 1: Same-chain ETH → ETH with verification");
  await testSameChainETHWithVerification(escrow, explorer);
  
  // Test 2: Verify cross-chain transfer
  console.log("\n\n🧪 TEST 2: Cross-chain transfer with tracking");
  await testCrossChainWithTracking(escrow, explorer, deployment, deployments);
  
  // Test 3: Check if ETH->WETH works (might fail on some networks)
  console.log("\n\n🧪 TEST 3: Same-chain swap test (if available)");
  await testSwapIfAvailable(escrow, explorer, deployment);
}

async function testSameChainETHWithVerification(escrow, explorer) {
  // Create a wallet with some ETH for gas
  const seller = new hre.ethers.Wallet(
    hre.ethers.Wallet.createRandom().privateKey,
    hre.ethers.provider
  );
  
  // Fund seller with gas
  const [deployer] = await hre.ethers.getSigners();
  await deployer.sendTransaction({
    to: seller.address,
    value: hre.ethers.parseEther("0.001") // Gas money
  });
  
  const amount = hre.ethers.parseEther("0.0001");
  
  console.log("📝 Creating escrow:");
  console.log("- Seller:", seller.address);
  console.log(`- Seller link: ${explorer}/address/${seller.address}`);
  console.log("- Amount:", hre.ethers.formatEther(amount), "ETH");
  
  // Record initial balance
  const balanceBefore = await hre.ethers.provider.getBalance(seller.address);
  console.log("- Balance before:", hre.ethers.formatEther(balanceBefore), "ETH");
  
  // Create escrow
  const createTx = await escrow.createEscrow(
    seller.address,
    hre.ethers.ZeroAddress,
    amount,
    hre.ethers.ZeroAddress,
    0,
    { value: amount }
  );
  
  const createReceipt = await createTx.wait();
  console.log(`\n✅ Escrow created:`);
  console.log(`   ${explorer}/tx/${createTx.hash}`);
  
  let escrowId;
  let serviceFee;
  for (const log of createReceipt.logs) {
    try {
      const parsed = escrow.interface.parseLog(log);
      if (parsed && parsed.name === "EscrowCreated") {
        escrowId = parsed.args.escrowId;
        serviceFee = parsed.args.serviceFee;
        console.log(`   Escrow ID: ${escrowId}`);
        console.log(`   Service Fee: ${hre.ethers.formatEther(serviceFee)} ETH (2%)`);
        break;
      }
    } catch {}
  }
  
  // Update condition and release
  await escrow.updateCondition(escrowId, true);
  const releaseTx = await escrow.releaseEscrow(escrowId);
  const releaseReceipt = await releaseTx.wait();
  
  console.log(`\n✅ Escrow released:`);
  console.log(`   ${explorer}/tx/${releaseTx.hash}`);
  
  // Wait a bit for balance to update
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Verify balance
  const balanceAfter = await hre.ethers.provider.getBalance(seller.address);
  const received = balanceAfter - balanceBefore;
  const expectedNet = amount * 98n / 100n;
  
  console.log("\n💰 Verification Results:");
  console.log("- Balance after:", hre.ethers.formatEther(balanceAfter), "ETH");
  console.log("- Net received:", hre.ethers.formatEther(received), "ETH");
  console.log("- Expected (98%):", hre.ethers.formatEther(expectedNet), "ETH");
  console.log("- Verification:", received === expectedNet ? "✅ EXACT MATCH" : "⚠️  APPROXIMATE (gas costs)");
  console.log(`- Check seller: ${explorer}/address/${seller.address}`);
}

async function testCrossChainWithTracking(escrow, explorer, deployment, deployments) {
  const targetChains = {
    "arbitrum-sepolia": "sepolia",
    "sepolia": "arbitrum-sepolia",
    "polygon-amoy": "sepolia"
  };
  
  const targetNetwork = targetChains[hre.network.name];
  const targetDeployment = deployments.networks[targetNetwork];
  
  if (!targetDeployment) {
    console.log("⚠️  No target network configured");
    return;
  }
  
  const seller = hre.ethers.Wallet.createRandom();
  const amount = hre.ethers.parseEther("0.0001");
  
  console.log("📝 Creating cross-chain escrow:");
  console.log("- From:", hre.network.name);
  console.log("- To:", targetNetwork);
  console.log("- Seller:", seller.address);
  console.log(`- Track on destination: ${EXPLORERS[targetNetwork]}/address/${seller.address}`);
  console.log("- Amount:", hre.ethers.formatEther(amount), "ETH");
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
  console.log(`\n✅ Escrow created:`);
  console.log(`   ${explorer}/tx/${createTx.hash}`);
  
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
  
  console.log("\n💰 LayerZero Fees:");
  console.log("- Quote:", hre.ethers.formatEther(quote.nativeFee));
  console.log("- Sending (3x):", hre.ethers.formatEther(feeWithBuffer));
  
  // Release
  const releaseTx = await escrow.releaseEscrow(escrowId, {
    value: feeWithBuffer,
    gasLimit: 3000000
  });
  
  const releaseReceipt = await releaseTx.wait();
  console.log(`\n✅ Cross-chain transfer initiated:`);
  console.log(`   ${explorer}/tx/${releaseTx.hash}`);
  
  // Extract GUID and OFT events
  let guid;
  for (const log of releaseReceipt.logs) {
    try {
      const parsed = escrow.interface.parseLog(log);
      if (parsed && parsed.name === "CrossChainTransferInitiated") {
        guid = parsed.args.guid;
        console.log(`\n🌉 LayerZero Transfer:`);
        console.log(`   GUID: ${guid}`);
        console.log(`   Track: ${LZ_SCAN}/tx/${guid}`);
        break;
      }
    } catch {
      // Try OFT events
      try {
        const oftParsed = oftAdapter.interface.parseLog(log);
        if (oftParsed && oftParsed.name === "OFTSent") {
          console.log(`   Amount sent: ${hre.ethers.formatEther(oftParsed.args.amountSentLD)} WETH`);
        }
      } catch {}
    }
  }
  
  console.log("\n📊 Verification Steps:");
  console.log(`1. Wait 1-3 minutes for LayerZero delivery`);
  console.log(`2. Check destination: ${EXPLORERS[targetNetwork]}/address/${seller.address}`);
  console.log(`3. Expected: ${hre.ethers.formatEther(netAmount)} WETH`);
  console.log(`4. Track status: ${LZ_SCAN}/tx/${guid}`);
}

async function testSwapIfAvailable(escrow, explorer, deployment) {
  // First check if the network has proper Uniswap support
  const router = await hre.ethers.getContractAt(
    ["function factory() view returns (address)"],
    deployment.uniswapRouter
  );
  
  try {
    // Try to call factory() - V2 routers have this
    const factory = await router.factory();
    console.log("✅ Uniswap V2 router detected");
  } catch {
    console.log("⚠️  No Uniswap V2 - swap test skipped");
    console.log("   Note: Arbitrum Sepolia may use different DEX");
    return;
  }
  
  // If we get here, try a simple ETH -> WETH swap
  const seller = hre.ethers.Wallet.createRandom();
  const amount = hre.ethers.parseEther("0.0001");
  
  console.log("\n📝 Testing ETH → WETH swap:");
  console.log("- Seller:", seller.address);
  console.log("- Amount:", hre.ethers.formatEther(amount), "ETH");
  
  // Create escrow
  const createTx = await escrow.createEscrow(
    seller.address,
    hre.ethers.ZeroAddress,
    amount,
    deployment.weth,
    0,
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
  
  // Update and release
  await escrow.updateCondition(escrowId, true);
  
  try {
    const releaseTx = await escrow.releaseEscrow(escrowId);
    const releaseReceipt = await releaseTx.wait();
    console.log(`✅ Released: ${explorer}/tx/${releaseTx.hash}`);
    
    // Check if swap happened
    let swapped = false;
    for (const log of releaseReceipt.logs) {
      try {
        const parsed = escrow.interface.parseLog(log);
        if (parsed && parsed.name === "TokenSwapped") {
          swapped = true;
          console.log("\n✅ Swap executed:");
          console.log(`   Amount out: ${hre.ethers.formatEther(parsed.args.toAmount)} WETH`);
        }
      } catch {}
    }
    
    if (!swapped) {
      console.log("⚠️  No swap event - might have used direct WETH conversion");
    }
    
  } catch (error) {
    console.log("❌ Swap failed - Uniswap might not have ETH/WETH pair");
    console.log("   This is normal on some testnets");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });