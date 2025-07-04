const hre = require("hardhat");

async function main() {
  console.log("\n=== TEST UNISWAP SWAP ON SEPOLIA ===\n");
  
  const [deployer] = await hre.ethers.getSigners();
  
  // Sepolia deployment
  const escrowAddress = "0xBA10d8d3A09439eA5984F545C925d61958fa14E9";
  const wethAddress = "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14";
  const usdcAddress = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";
  const explorer = "https://sepolia.etherscan.io";
  
  console.log("📍 Contract Links:");
  console.log(`- Escrow: ${explorer}/address/${escrowAddress}`);
  console.log(`- WETH: ${explorer}/address/${wethAddress}`);
  console.log(`- USDC: ${explorer}/address/${usdcAddress}`);
  
  const escrow = await hre.ethers.getContractAt("UniversalEscrowServiceV3", escrowAddress);
  const weth = await hre.ethers.getContractAt("IERC20", wethAddress);
  const usdc = await hre.ethers.getContractAt("IERC20", usdcAddress);
  
  // Fund contract if needed
  const balance = await hre.ethers.provider.getBalance(escrowAddress);
  if (balance < hre.ethers.parseEther("0.01")) {
    console.log("\n💰 Funding contract...");
    await deployer.sendTransaction({
      to: escrowAddress,
      value: hre.ethers.parseEther("0.01")
    });
  }
  
  // Test 1: ETH → WETH (should work as direct conversion)
  console.log("\n\n🧪 TEST 1: ETH → WETH");
  const seller1 = hre.ethers.Wallet.createRandom();
  const amount1 = hre.ethers.parseEther("0.0001");
  
  console.log("Creating escrow...");
  console.log("- Seller:", seller1.address);
  console.log("- Amount:", hre.ethers.formatEther(amount1), "ETH");
  console.log("- Target: WETH");
  
  const wethBalanceBefore = await weth.balanceOf(seller1.address);
  
  const createTx1 = await escrow.createEscrow(
    seller1.address,
    hre.ethers.ZeroAddress,
    amount1,
    wethAddress,
    0,
    { value: amount1 }
  );
  
  const receipt1 = await createTx1.wait();
  console.log(`✅ Created: ${explorer}/tx/${createTx1.hash}`);
  
  let escrowId1;
  for (const log of receipt1.logs) {
    try {
      const parsed = escrow.interface.parseLog(log);
      if (parsed && parsed.name === "EscrowCreated") {
        escrowId1 = parsed.args.escrowId;
        break;
      }
    } catch {}
  }
  
  await escrow.updateCondition(escrowId1, true);
  
  const releaseTx1 = await escrow.releaseEscrow(escrowId1);
  const releaseReceipt1 = await releaseTx1.wait();
  console.log(`✅ Released: ${explorer}/tx/${releaseTx1.hash}`);
  
  // Check events
  let method1;
  for (const log of releaseReceipt1.logs) {
    try {
      const parsed = escrow.interface.parseLog(log);
      if (parsed && parsed.name === "EscrowReleased") {
        method1 = parsed.args.method;
        console.log("- Release method:", method1);
      } else if (parsed && parsed.name === "TokenSwapped") {
        console.log("- Swap detected!");
        console.log("  From:", hre.ethers.formatEther(parsed.args.fromAmount), "ETH");
        console.log("  To:", hre.ethers.formatEther(parsed.args.toAmount), "WETH");
      }
    } catch {}
  }
  
  const wethBalanceAfter = await weth.balanceOf(seller1.address);
  const wethReceived = wethBalanceAfter - wethBalanceBefore;
  
  console.log("\n💰 Results:");
  console.log("- WETH received:", hre.ethers.formatEther(wethReceived));
  console.log("- Expected:", hre.ethers.formatEther(amount1 * 98n / 100n));
  console.log("- Status:", wethReceived > 0 ? "✅ SUCCESS" : "❌ FAILED");
  console.log(`- Check: ${explorer}/address/${seller1.address}`);
  
  // Test 2: Try a different token if available
  console.log("\n\n🧪 TEST 2: Check Uniswap Router");
  
  const routerAddress = "0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E";
  console.log(`Router: ${explorer}/address/${routerAddress}`);
  
  // Note: Sepolia uses Uniswap V3 which has different interface
  console.log("\n📝 Note: Sepolia uses Uniswap V3");
  console.log("ETH → WETH conversions work via direct WETH.deposit()");
  console.log("Other token swaps would use V3 swap router");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });