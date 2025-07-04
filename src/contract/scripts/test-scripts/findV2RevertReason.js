const hre = require("hardhat");

async function main() {
  console.log("\n=== FIND V2 REVERT REASON ===\n");
  
  const escrowV2 = "0x85D3a74D19E1135fC295fFBB483403c064e47B71";
  const escrow = await hre.ethers.getContractAt("UniversalEscrowServiceV2", escrowV2);
  
  // Create a cross-chain escrow
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
  
  console.log("Escrow ID:", escrowId);
  
  // Update condition
  await escrow.updateCondition(escrowId, true);
  
  // Check escrow data
  const escrowData = await escrow.escrows(escrowId);
  console.log("\nEscrow data:");
  console.log("- Target chain ID:", escrowData.targetChainId);
  console.log("- Released:", escrowData.released);
  console.log("- Condition met:", escrowData.conditionMet);
  console.log("- Net amount:", hre.ethers.formatEther(escrowData.netAmount));
  
  // Check chain mapping
  const endpointId = await escrow.chainIdToEndpointId(11155111);
  console.log("\nChain mapping:");
  console.log("- Chain 11155111 -> Endpoint", endpointId);
  
  // Check OFT adapter
  const oftAdapter = await escrow.oftAdapters(endpointId);
  console.log("- OFT adapter for endpoint", endpointId, ":", oftAdapter);
  
  // Get the release function data
  const releaseData = escrow.interface.encodeFunctionData("releaseEscrow", [escrowId]);
  
  // Get LZ fee
  const adapter = await hre.ethers.getContractAt("SimplePropertyOFTAdapter", "0xbaa46938E3110187ED6a55EE139312b28c943d00");
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
  
  const quote = await adapter.quoteSend(sendParam, false);
  const lzFee = quote.nativeFee;
  
  console.log("\nLZ fee:", hre.ethers.formatEther(lzFee));
  
  // Try to trace the call
  console.log("\n🔍 Attempting to trace the revert...");
  
  try {
    // Try calling through the contract to see where it fails
    const [deployer] = await hre.ethers.getSigners();
    
    // Send the transaction but don't wait
    const tx = await deployer.sendTransaction({
      to: escrowV2,
      data: releaseData,
      value: lzFee,
      gasLimit: 3000000
    });
    
    console.log("TX hash:", tx.hash);
    
    try {
      await tx.wait();
      console.log("✅ Success!");
    } catch (error) {
      console.log("❌ Failed");
      
      // Try to get more info
      if (error.receipt) {
        console.log("Gas used:", error.receipt.gasUsed?.toString());
        console.log("Status:", error.receipt.status);
        
        // The transaction used gas but failed, so it's reverting somewhere
        console.log("\n💡 The transaction is reverting inside the contract");
        console.log("Possible causes:");
        console.log("1. The contract doesn't have enough ETH to pay LZ fee internally");
        console.log("2. WETH deposit is failing");
        console.log("3. OFT adapter call is failing");
        
        // Check contract balance
        const contractBalance = await hre.ethers.provider.getBalance(escrowV2);
        console.log("\nContract ETH balance:", hre.ethers.formatEther(contractBalance));
        console.log("Needs for WETH deposit:", hre.ethers.formatEther(netAmount));
        console.log("Needs for LZ fee:", hre.ethers.formatEther(lzFee));
        console.log("Total needed:", hre.ethers.formatEther(netAmount + lzFee));
        
        if (contractBalance < netAmount) {
          console.log("\n❌ CONTRACT DOESN'T HAVE ENOUGH ETH!");
          console.log("The contract needs ETH to convert to WETH");
        }
      }
    }
    
  } catch (error) {
    console.error("Error:", error.message);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });