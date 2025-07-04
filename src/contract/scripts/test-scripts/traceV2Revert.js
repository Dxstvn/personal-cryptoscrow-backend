const hre = require("hardhat");

async function main() {
  console.log("\n=== TRACE V2 REVERT ===\n");
  
  const [deployer] = await hre.ethers.getSigners();
  const escrowAddress = "0xF29A11B7c0856BAF925a63c1104F37b8A12204A2";
  const escrow = await hre.ethers.getContractAt("UniversalEscrowServiceV2", escrowAddress);
  
  // Create a test escrow
  const seller = hre.ethers.Wallet.createRandom();
  const amount = hre.ethers.parseEther("0.001");
  
  console.log("Creating escrow...");
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
  
  // Get escrow data
  const escrowData = await escrow.escrows(escrowId);
  console.log("\nEscrow state:");
  console.log("- Released:", escrowData.released);
  console.log("- Condition met:", escrowData.conditionMet);
  console.log("- Net amount:", hre.ethers.formatEther(escrowData.netAmount));
  console.log("- Target chain:", escrowData.targetChainId);
  
  // Check balances
  const contractEthBalance = await hre.ethers.provider.getBalance(escrowAddress);
  console.log("\nContract ETH balance:", hre.ethers.formatEther(contractEthBalance));
  
  const weth = await hre.ethers.getContractAt("IERC20", "0x980B62Da83eFf3D4576C647993b0c1D7faf17c73");
  const contractWethBalance = await weth.balanceOf(escrowAddress);
  console.log("Contract WETH balance:", hre.ethers.formatEther(contractWethBalance));
  
  // Get the OFT adapter
  const oftAdapter = await hre.ethers.getContractAt(
    "SimplePropertyOFTAdapter",
    "0xbaa46938E3110187ED6a55EE139312b28c943d00"
  );
  
  // Get quote
  const netAmount = escrowData.netAmount;
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
  console.log("\nLayerZero fee required:", hre.ethers.formatEther(quote.nativeFee));
  
  // Try to simulate the release without actually sending
  console.log("\n🔍 Checking potential failure points...");
  
  // 1. Check if contract can pay for WETH conversion
  if (contractEthBalance < netAmount) {
    console.log("❌ Contract doesn't have enough ETH for WETH conversion!");
    console.log("   Needs:", hre.ethers.formatEther(netAmount));
    console.log("   Has:", hre.ethers.formatEther(contractEthBalance));
  }
  
  // 2. Check WETH allowance
  const currentAllowance = await weth.allowance(escrowAddress, oftAdapter.target);
  console.log("\nCurrent WETH allowance:", hre.ethers.formatEther(currentAllowance));
  
  // 3. Try to estimate gas for the release
  console.log("\n📊 Estimating gas for release...");
  try {
    const estimatedGas = await escrow.releaseEscrow.estimateGas(escrowId, {
      value: quote.nativeFee
    });
    console.log("Estimated gas:", estimatedGas.toString());
  } catch (error) {
    console.log("❌ Gas estimation failed:", error.message);
    
    // Try static call to get more info
    console.log("\n🔍 Attempting static call...");
    try {
      await escrow.releaseEscrow.staticCall(escrowId, {
        value: quote.nativeFee
      });
      console.log("✅ Static call succeeded");
    } catch (staticError) {
      console.log("❌ Static call failed:", staticError.message);
      
      // The error might give us a clue
      if (staticError.data) {
        console.log("Error data:", staticError.data);
        
        // Try to decode common error signatures
        const errorSignatures = {
          "0x8c379a0": "Error(string)",
          "0x4e487b71": "Panic(uint256)",
          "0xb12d13eb": "InvalidAmount()",
          "0x2c5211c6": "InvalidRecipient()",
          "0xe58bfaa8": "EscrowNotFound()",
          "0x3c2779e7": "EscrowAlreadyReleased()",
          "0xbef7bb7d": "ConditionNotMet()",
          "0x2eef310a": "UnauthorizedCaller()",
          "0x5b549182": "InvalidChainId()",
          "0x47533d03": "InsufficientBalance()",
          "0x90b8ec18": "TransferFailed()",
          "0x6fafeb08": "SwapFailed()",
          "0x5f98112f": "InvalidConfiguration()"
        };
        
        const errorSig = staticError.data.slice(0, 10);
        if (errorSignatures[errorSig]) {
          console.log("🔥 Error type:", errorSignatures[errorSig]);
        }
      }
    }
  }
  
  // 4. Check if it's an authorization issue with the OFT adapter
  console.log("\n🔐 Checking OFT adapter...");
  try {
    // Try to check if escrow can send through adapter
    const escrowAsSigner = await hre.ethers.getImpersonatedSigner(escrowAddress);
    
    // Fund the impersonated account
    await deployer.sendTransaction({
      to: escrowAddress,
      value: hre.ethers.parseEther("0.1")
    });
    
    // Try to approve WETH
    const wethAsEscrow = weth.connect(escrowAsSigner);
    await wethAsEscrow.approve(oftAdapter.target, netAmount);
    console.log("✅ WETH approval succeeded");
    
    // Try to call OFT adapter
    const adapterAsEscrow = oftAdapter.connect(escrowAsSigner);
    
    // First deposit ETH to get WETH
    const wethContract = await hre.ethers.getContractAt("IWETH", weth.target);
    const wethAsEscrowSigner = wethContract.connect(escrowAsSigner);
    await wethAsEscrowSigner.deposit({ value: netAmount });
    console.log("✅ WETH deposit succeeded");
    
    // Now try the actual send
    console.log("\n🚀 Testing OFT send directly...");
    try {
      const sendTx = await adapterAsEscrow.send(sendParam, quote, escrowAsSigner.address, {
        value: quote.nativeFee
      });
      console.log("✅ OFT send succeeded! TX:", sendTx.hash);
      await sendTx.wait();
      console.log("✅ Transfer completed!");
    } catch (oftError) {
      console.log("❌ OFT send failed:", oftError.message);
    }
    
  } catch (impersonateError) {
    console.log("Impersonation test error:", impersonateError.message);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });