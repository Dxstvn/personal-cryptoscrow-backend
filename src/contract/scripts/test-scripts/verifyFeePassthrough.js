const hre = require("hardhat");

async function main() {
  console.log("\n=== VERIFY FEE PASSTHROUGH ===\n");
  
  const [deployer] = await hre.ethers.getSigners();
  
  // Let's test the OFT adapter directly to ensure it works
  const oftAdapter = await hre.ethers.getContractAt(
    "SimplePropertyOFTAdapter",
    "0xbaa46938E3110187ED6a55EE139312b28c943d00"
  );
  
  const weth = await hre.ethers.getContractAt("IERC20", "0x980B62Da83eFf3D4576C647993b0c1D7faf17c73");
  
  // Get some WETH
  const wethContract = await hre.ethers.getContractAt("contracts/UniversalEscrowServiceV3.sol:IWETH", weth.target);
  await wethContract.deposit({ value: hre.ethers.parseEther("0.001") });
  await weth.approve(oftAdapter.target, hre.ethers.parseEther("0.001"));
  
  // Prepare params
  const sendParam = {
    dstEid: 40161,
    to: hre.ethers.zeroPadValue(deployer.address, 32),
    amountLD: hre.ethers.parseEther("0.0001"),
    minAmountLD: hre.ethers.parseEther("0.00009"),
    extraOptions: "0x00030100110100000000000000000000000000030d40",
    composeMsg: "0x",
    oftCmd: "0x"
  };
  
  // Get quote
  const quote = await oftAdapter.quoteSend(sendParam, false);
  console.log("Quote structure:");
  console.log("- nativeFee:", quote.nativeFee);
  console.log("- nativeFee (formatted):", hre.ethers.formatEther(quote.nativeFee));
  console.log("- lzTokenFee:", quote.lzTokenFee);
  
  // Create fee object
  const fee = {
    nativeFee: quote.nativeFee,
    lzTokenFee: quote.lzTokenFee
  };
  
  // Test direct send
  console.log("\n1. Testing direct OFT send...");
  try {
    const tx = await oftAdapter.send(sendParam, fee, deployer.address, {
      value: fee.nativeFee  // Passing exact fee
    });
    console.log("✅ Direct send works! TX:", tx.hash);
    await tx.wait();
  } catch (error) {
    console.log("❌ Direct send failed:", error.message);
  }
  
  // Now let's check what happens in the escrow contract
  console.log("\n2. Checking escrow contract logic...");
  
  const escrowAddress = "0xE512E0C01707B5472c71DFeea555A079996fDdB8";
  const escrow = await hre.ethers.getContractAt("UniversalEscrowServiceV3", escrowAddress);
  
  // The issue might be that when the escrow calls quoteSend, it gets a different fee
  // Let's verify by calling quoteSend from the escrow's perspective
  
  console.log("\n3. Checking if quoteSend returns different values...");
  
  // Create a test escrow
  const seller = hre.ethers.Wallet.createRandom();
  const amount = hre.ethers.parseEther("0.0001");
  
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
  
  // Get the escrow data
  const escrowData = await escrow.escrows(escrowId);
  const netAmount = escrowData.netAmount;
  
  console.log("\nEscrow net amount:", hre.ethers.formatEther(netAmount));
  
  // Build params exactly as contract would
  const escrowSendParam = {
    dstEid: 40161,
    to: hre.ethers.zeroPadValue(seller.address, 32),
    amountLD: netAmount,
    minAmountLD: netAmount * 95n / 100n,
    extraOptions: "0x00030100110100000000000000000000000000030d40",
    composeMsg: "0x",
    oftCmd: "0x"
  };
  
  const escrowQuote = await oftAdapter.quoteSend(escrowSendParam, false);
  console.log("\nQuote for escrow amount:");
  console.log("- nativeFee:", hre.ethers.formatEther(escrowQuote.nativeFee));
  
  // Now let's see if we can manually complete the escrow flow
  console.log("\n4. Manual escrow completion test...");
  
  // First, ensure contract has ETH for WETH conversion
  const contractEthBalance = await hre.ethers.provider.getBalance(escrowAddress);
  console.log("Contract ETH balance:", hre.ethers.formatEther(contractEthBalance));
  
  if (contractEthBalance < netAmount) {
    console.log("Funding contract with ETH for WETH conversion...");
    await deployer.sendTransaction({
      to: escrowAddress,
      value: netAmount
    });
  }
  
  // Try release with exact fee
  console.log("\n5. Attempting release with exact fee:", hre.ethers.formatEther(escrowQuote.nativeFee));
  
  try {
    const releaseTx = await escrow.releaseEscrow(escrowId, {
      value: escrowQuote.nativeFee,
      gasLimit: 3000000
    });
    
    console.log("✅ SUCCESS! TX:", releaseTx.hash);
    const releaseReceipt = await releaseTx.wait();
    
    console.log("\n📋 Events:");
    for (const log of releaseReceipt.logs) {
      try {
        const parsed = escrow.interface.parseLog(log);
        if (parsed) {
          console.log("-", parsed.name);
        }
      } catch {}
    }
    
  } catch (error) {
    console.log("❌ Still failing:", error.message);
    
    // If it's still failing, the issue might be deeper
    console.log("\n💡 The issue persists even with correct fee passthrough");
    console.log("Possible remaining issues:");
    console.log("1. The OFT adapter might have additional validation");
    console.log("2. The escrow contract might not be properly authorized");
    console.log("3. There might be a reentrancy or state issue");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });