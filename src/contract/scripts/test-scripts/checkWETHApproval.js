const hre = require("hardhat");

async function main() {
  console.log("\n=== CHECK WETH APPROVAL ISSUE ===\n");
  
  const [deployer] = await hre.ethers.getSigners();
  const escrowAddress = "0xE512E0C01707B5472c71DFeea555A079996fDdB8";
  const oftAdapterAddress = "0xbaa46938E3110187ED6a55EE139312b28c943d00";
  
  const escrow = await hre.ethers.getContractAt("UniversalEscrowServiceV3", escrowAddress);
  const weth = await hre.ethers.getContractAt("IERC20", "0x980B62Da83eFf3D4576C647993b0c1D7faf17c73");
  const oftAdapter = await hre.ethers.getContractAt("SimplePropertyOFTAdapter", oftAdapterAddress);
  
  // Create a test escrow
  const seller = hre.ethers.Wallet.createRandom();
  const amount = hre.ethers.parseEther("0.0001");
  
  console.log("Creating test escrow...");
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
  
  // Check initial state
  console.log("\n📊 Initial State:");
  console.log("Contract ETH:", hre.ethers.formatEther(await hre.ethers.provider.getBalance(escrowAddress)));
  console.log("Contract WETH:", hre.ethers.formatEther(await weth.balanceOf(escrowAddress)));
  console.log("WETH Allowance to OFT:", hre.ethers.formatEther(await weth.allowance(escrowAddress, oftAdapterAddress)));
  
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
  console.log("\nLZ Fee:", hre.ethers.formatEther(quote.nativeFee));
  
  // Try to trace through the contract execution
  console.log("\n🔍 Tracing contract execution...");
  
  // The contract should:
  // 1. Convert ETH to WETH
  // 2. Approve OFT adapter
  // 3. Call OFT adapter send
  
  // Let's check if the issue is with WETH conversion
  console.log("\n1. Testing WETH deposit capability...");
  const wethContract = await hre.ethers.getContractAt("contracts/UniversalEscrowServiceV3.sol:IWETH", weth.target);
  
  // Send ETH to escrow to ensure it has funds
  await deployer.sendTransaction({
    to: escrowAddress,
    value: hre.ethers.parseEther("0.001")
  });
  
  console.log("Contract ETH after funding:", hre.ethers.formatEther(await hre.ethers.provider.getBalance(escrowAddress)));
  
  // Now try the release
  console.log("\n2. Attempting release...");
  
  try {
    // First try static call to get better error info
    await escrow.releaseEscrow.staticCall(escrowId, {
      value: quote.nativeFee
    });
    console.log("✅ Static call succeeded!");
    
  } catch (staticError) {
    console.log("❌ Static call failed:", staticError.message);
    
    // The error is still "Insufficient fee"
    // But we know the fee is correct because direct OFT send works
    
    console.log("\n💡 Debugging the Insufficient fee error:");
    console.log("This error is coming from the OFT adapter's _payNative function");
    console.log("It checks: if (msg.value != _nativeFee) revert NotEnoughNative(msg.value)");
    
    // The issue might be that the escrow contract is calling the OFT adapter
    // but the msg.value at that point is not what we expect
    
    console.log("\n🔍 Checking the exact call sequence:");
    console.log("1. User calls escrow.releaseEscrow{value: X}");
    console.log("2. Escrow calls oftAdapter.send{value: fee.nativeFee}");
    console.log("3. OFT adapter checks if msg.value == fee.nativeFee");
    
    // Let's verify our fix is actually in the deployed contract
    console.log("\n📝 Verifying deployed contract has the fix...");
    
    // We can't easily verify the bytecode, but we can check if the behavior matches
    // The fact that gas usage changed suggests the contract is different
    
    console.log("\n🤔 Alternative hypothesis:");
    console.log("The quoteSend might return a different fee when called from within the contract");
    console.log("vs when called externally due to gas price changes or other factors");
  }
  
  // Let's try one more thing - use a higher gas limit
  console.log("\n3. Trying with higher gas limit and exact fee...");
  
  try {
    const releaseTx = await escrow.releaseEscrow(escrowId, {
      value: quote.nativeFee,
      gasLimit: 5000000
    });
    
    console.log("📤 TX sent:", releaseTx.hash);
    const releaseReceipt = await releaseTx.wait();
    console.log("✅ SUCCESS with high gas limit!");
    
  } catch (error) {
    console.log("❌ Still failed:", error.message);
    
    // At this point, we need to look at the actual revert reason
    console.log("\n🔥 The persistent 'Insufficient fee' error suggests:");
    console.log("1. The contract might not be passing fee.nativeFee correctly");
    console.log("2. There might be a compiler optimization issue");
    console.log("3. The deployed bytecode might not match our source");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });