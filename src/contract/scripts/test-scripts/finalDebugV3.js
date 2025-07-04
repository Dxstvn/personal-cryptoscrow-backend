const hre = require("hardhat");

async function main() {
  console.log("\n=== FINAL DEBUG V3 ===\n");
  
  const [deployer] = await hre.ethers.getSigners();
  const escrowAddress = "0xE512E0C01707B5472c71DFeea555A079996fDdB8";
  
  // First, let's manually test the exact flow
  console.log("1. Getting WETH for testing...");
  const weth = await hre.ethers.getContractAt("contracts/UniversalEscrowServiceV3.sol:IWETH", "0x980B62Da83eFf3D4576C647993b0c1D7faf17c73");
  await weth.deposit({ value: hre.ethers.parseEther("0.001") });
  
  // Send WETH to escrow contract
  console.log("2. Sending WETH to escrow contract...");
  await weth.transfer(escrowAddress, hre.ethers.parseEther("0.00098"));
  
  const escrowWethBalance = await weth.balanceOf(escrowAddress);
  console.log("Escrow WETH balance:", hre.ethers.formatEther(escrowWethBalance));
  
  // Now let's see if the escrow can send through OFT
  console.log("\n3. Testing if escrow can use OFT adapter...");
  
  const escrow = await hre.ethers.getContractAt("UniversalEscrowServiceV3", escrowAddress);
  const oftAdapter = await hre.ethers.getContractAt(
    "SimplePropertyOFTAdapter",
    "0xbaa46938E3110187ED6a55EE139312b28c943d00"
  );
  
  // Impersonate the escrow contract
  console.log("\n4. Testing OFT send as escrow contract...");
  
  // First, let's check if the escrow has approved the OFT adapter
  const allowance = await weth.allowance(escrowAddress, oftAdapter.target);
  console.log("Current allowance:", hre.ethers.formatEther(allowance));
  
  // Let's trace through a minimal escrow release
  console.log("\n5. Creating minimal test escrow...");
  
  const seller = hre.ethers.Wallet.createRandom();
  const amount = hre.ethers.parseEther("0.0001"); // Very small amount
  
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
        break;
      }
    } catch {}
  }
  
  await escrow.updateCondition(escrowId, true);
  
  // Get quote
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
  
  // Try to trace the exact error
  console.log("\n6. Attempting release with exact fee...");
  
  try {
    // First check with static call
    await escrow.releaseEscrow.staticCall(escrowId, {
      value: quote.nativeFee
    });
    console.log("✅ Static call succeeded!");
    
    // If static call succeeds, try real call
    const releaseTx = await escrow.releaseEscrow(escrowId, {
      value: quote.nativeFee,
      gasLimit: 3000000
    });
    
    console.log("📤 TX:", releaseTx.hash);
    const releaseReceipt = await releaseTx.wait();
    console.log("✅ SUCCESS!");
    
  } catch (error) {
    console.log("❌ Error:", error.message);
    
    // Let's check the exact state when it fails
    console.log("\n🔍 Checking state at failure...");
    
    // Check ETH balance
    const ethBalance = await hre.ethers.provider.getBalance(escrowAddress);
    console.log("Contract ETH:", hre.ethers.formatEther(ethBalance));
    
    // Check WETH balance
    const wethBalance = await weth.balanceOf(escrowAddress);
    console.log("Contract WETH:", hre.ethers.formatEther(wethBalance));
    
    // Check if contract has enough ETH for WETH deposit
    console.log("Needs for WETH:", hre.ethers.formatEther(netAmount));
    console.log("Has ETH:", ethBalance >= netAmount ? "✅" : "❌");
    
    // The error might be that the contract doesn't have the escrow amount in ETH
    // It receives ETH but needs to convert to WETH
    console.log("\n💡 Insight: The contract might not have enough ETH to convert to WETH");
    console.log("The escrow was created with ETH, but the contract needs to have that ETH available");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });