const hre = require("hardhat");

async function main() {
  console.log("\n=== TRACE RELEASE CALL ===\n");
  
  const [deployer] = await hre.ethers.getSigners();
  const network = hre.network.name;
  
  if (network === "sepolia") {
    console.log("Please run on polygon-amoy or arbitrum-sepolia");
    return;
  }
  
  const configs = {
    "polygon-amoy": {
      escrow: "0x53E4b9A8f7b1185768cef74d9564cbeD052a9682",
      oftAdapter: "0x746EF3c4C9c3f779Bc3558A5FF55C3f34ae20725",
      weth: "0x360ad4f9a9A8ECB5f461c4Cc1047E1Dcf9"
    },
    "arbitrum-sepolia": {
      escrow: "0xd3b5A13C113328C4F4F1AbF646a2be2AaC8815B5",
      oftAdapter: "0xbaa46938E3110187ED6a55EE139312b28c943d00",
      weth: "0x980B62Da83eFf3D4576C647993b0c1D7faf17c73"
    }
  };
  
  const config = configs[network];
  const escrow = await hre.ethers.getContractAt("UniversalEscrowService", config.escrow);
  
  // Create escrow
  const seller = "0x" + "1".repeat(40);
  const amount = hre.ethers.parseEther("0.001");
  
  console.log("Creating escrow...");
  const createTx = await escrow.createEscrow(
    seller,
    hre.ethers.ZeroAddress,
    amount,
    config.weth,
    40161,
    { value: amount }
  );
  
  const receipt = await createTx.wait();
  
  // Get escrow ID
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
  
  console.log("Escrow ID:", escrowId);
  
  // Update condition
  await escrow.updateCondition(escrowId, true);
  console.log("Condition updated");
  
  // Now trace the release
  console.log("\n🔍 Tracing release call...");
  
  // Get the function data
  const releaseData = escrow.interface.encodeFunctionData("releaseEscrow", [escrowId]);
  console.log("\nFunction data:");
  console.log("- Selector:", releaseData.slice(0, 10));
  console.log("- Full data:", releaseData);
  
  // Get LZ fee
  const oftAdapter = await hre.ethers.getContractAt("SimplePropertyOFTAdapter", config.oftAdapter);
  const netAmount = amount * 98n / 100n;
  const sendParam = {
    dstEid: 40161,
    to: hre.ethers.zeroPadValue(seller, 32),
    amountLD: netAmount,
    minAmountLD: netAmount * 95n / 100n,
    extraOptions: "0x00030100110100000000000000000000000000030d40",
    composeMsg: "0x",
    oftCmd: "0x"
  };
  
  const quote = await oftAdapter.quoteSend(sendParam, false);
  const lzFee = quote.nativeFee;
  console.log("\nLayerZero fee:", hre.ethers.formatEther(lzFee));
  
  // Try eth_call first
  console.log("\n📞 Trying eth_call...");
  try {
    const callResult = await hre.ethers.provider.call({
      to: config.escrow,
      data: releaseData,
      value: lzFee
    });
    console.log("Call result:", callResult);
  } catch (error) {
    console.log("eth_call failed:", error.message);
    
    if (error.data) {
      console.log("Error data:", error.data);
      
      // Try to decode
      try {
        // Check if it's a require string
        if (error.data.startsWith("0x08c379a0")) {
          const reason = hre.ethers.AbiCoder.defaultAbiCoder().decode(
            ["string"],
            "0x" + error.data.slice(138)
          );
          console.log("Revert reason:", reason[0]);
        }
      } catch {}
    }
  }
  
  // Try estimateGas
  console.log("\n⛽ Trying estimateGas...");
  try {
    const gasEstimate = await hre.ethers.provider.estimateGas({
      from: deployer.address,
      to: config.escrow,
      data: releaseData,
      value: lzFee
    });
    console.log("Gas estimate:", gasEstimate.toString());
  } catch (error) {
    console.log("estimateGas failed:", error.message);
  }
  
  // Try the actual transaction with specific gas
  console.log("\n🚀 Trying actual transaction...");
  try {
    const tx = await deployer.sendTransaction({
      to: config.escrow,
      data: releaseData,
      value: lzFee,
      gasLimit: 3000000
    });
    
    console.log("TX sent:", tx.hash);
    const txReceipt = await tx.wait();
    console.log("Success! Gas used:", txReceipt.gasUsed.toString());
    
  } catch (error) {
    console.log("Transaction failed");
    
    // Get the debug trace
    if (error.receipt && error.receipt.hash) {
      console.log("\n🔬 Getting debug trace...");
      try {
        const trace = await hre.ethers.provider.send("debug_traceTransaction", [
          error.receipt.hash,
          { tracer: "callTracer" }
        ]);
        console.log("Trace:", JSON.stringify(trace, null, 2));
      } catch (traceError) {
        console.log("Could not get trace:", traceError.message);
      }
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });