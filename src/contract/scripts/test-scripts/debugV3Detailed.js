const hre = require("hardhat");

async function main() {
  console.log("\n=== DEBUG V3 DETAILED ===\n");
  
  const [deployer] = await hre.ethers.getSigners();
  const escrowAddress = "0x3b885F31f003CAa6c7d924A3C309CB9489e9905D";
  const escrow = await hre.ethers.getContractAt("UniversalEscrowServiceV3", escrowAddress);
  
  // Create a simple escrow
  const seller = hre.ethers.Wallet.createRandom();
  const amount = hre.ethers.parseEther("0.001");
  
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
  
  // Check balances
  const ethBalance = await hre.ethers.provider.getBalance(escrowAddress);
  console.log("Contract ETH balance:", hre.ethers.formatEther(ethBalance));
  
  const weth = await hre.ethers.getContractAt("IERC20", "0x980B62Da83eFf3D4576C647993b0c1D7faf17c73");
  const wethBalance = await weth.balanceOf(escrowAddress);
  console.log("Contract WETH balance:", hre.ethers.formatEther(wethBalance));
  
  // Get the OFT adapter directly from contract
  const targetEndpoint = await escrow.chainIdToEndpointId(11155111);
  console.log("\nTarget endpoint:", targetEndpoint);
  
  const oftAdapterAddress = await escrow.oftAdapters(targetEndpoint);
  console.log("OFT adapter from contract:", oftAdapterAddress);
  
  // Try static call first
  console.log("\n🔍 Attempting static call to trace error...");
  
  const oftAdapter = await hre.ethers.getContractAt(
    "SimplePropertyOFTAdapter",
    oftAdapterAddress
  );
  
  const netAmount = amount * 98n / 100n;
  const sendParam = {
    dstEid: targetEndpoint,
    to: hre.ethers.zeroPadValue(seller.address, 32),
    amountLD: netAmount,
    minAmountLD: netAmount * 95n / 100n,
    extraOptions: "0x00030100110100000000000000000000000000030d40",
    composeMsg: "0x",
    oftCmd: "0x"
  };
  
  const quote = await oftAdapter.quoteSend(sendParam, false);
  console.log("LZ fee:", hre.ethers.formatEther(quote.nativeFee));
  
  try {
    await escrow.releaseEscrow.staticCall(escrowId, {
      value: quote.nativeFee
    });
    console.log("✅ Static call succeeded!");
  } catch (error) {
    console.log("❌ Static call failed:", error.message);
    
    // The error is still "Insufficient fee"
    // Let's check if the V3 OFT adapter is properly configured
    console.log("\n🔍 Checking OFT adapter delegate status...");
    
    // Since setDelegate succeeded during deployment, let's verify
    // by trying to send WETH directly through the adapter as the escrow
    console.log("\n🔍 Let me check if this is a different 'Insufficient fee' error...");
    
    // Maybe the error is from a different place
    // Let's try with more value
    console.log("\nTrying with 2x the fee...");
    try {
      await escrow.releaseEscrow.staticCall(escrowId, {
        value: quote.nativeFee * 2n
      });
      console.log("✅ Static call with 2x fee succeeded!");
    } catch (error2) {
      console.log("❌ Still failed with 2x fee:", error2.message);
      
      // If it still says insufficient fee with 2x, it's not about the amount
      // It might be that the OFT adapter itself is checking something else
    }
  }
  
  // Let's check the actual OFT adapter code to understand the error
  console.log("\n💡 The 'Insufficient fee' error could be from:");
  console.log("1. The OFT adapter's send() function checking msg.value");
  console.log("2. The LayerZero endpoint checking the fee");
  console.log("3. Some internal validation in the adapter");
  
  // Try to understand the exact call flow
  console.log("\n📊 Call flow:");
  console.log("1. Escrow calls quoteSend() -> gets fee");
  console.log("2. Escrow requires msg.value >= fee.nativeFee");
  console.log("3. Escrow calls send{value: msg.value}()");
  console.log("4. OFT adapter should forward the value to LZ endpoint");
  
  console.log("\n🤔 The issue might be:");
  console.log("- The escrow contract is not forwarding the full msg.value");
  console.log("- The OFT adapter has additional checks we're not aware of");
  console.log("- There's a mismatch in how the fee is calculated vs validated");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });