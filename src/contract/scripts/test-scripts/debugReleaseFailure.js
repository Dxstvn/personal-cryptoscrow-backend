const hre = require("hardhat");

async function main() {
  console.log("\n=== DEBUG RELEASE FAILURE ===\n");
  
  const [deployer] = await hre.ethers.getSigners();
  const network = hre.network.name;
  
  // Skip Sepolia due to provider issues
  if (network === "sepolia") {
    console.log("Please run on polygon-amoy or arbitrum-sepolia");
    return;
  }
  
  console.log("Network:", network);
  console.log("Deployer:", deployer.address);
  
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
  
  // First, let's check the contract's receive function
  console.log("\n🔍 Checking if escrow can receive ETH...");
  try {
    // Try sending a tiny amount of ETH to the contract
    const testTx = await deployer.sendTransaction({
      to: config.escrow,
      value: hre.ethers.parseEther("0.0001")
    });
    await testTx.wait();
    console.log("✅ Contract can receive ETH");
  } catch (error) {
    console.log("❌ Contract cannot receive ETH:", error.message);
  }
  
  // Check contract balances
  const ethBalance = await hre.ethers.provider.getBalance(config.escrow);
  console.log("\nContract ETH balance:", hre.ethers.formatEther(ethBalance));
  
  const weth = await hre.ethers.getContractAt("IERC20", config.weth);
  const wethBalance = await weth.balanceOf(config.escrow);
  console.log("Contract WETH balance:", hre.ethers.formatEther(wethBalance));
  
  // Create a simple test escrow
  console.log("\n📝 Creating test escrow...");
  const seller = hre.ethers.Wallet.createRandom();
  const amount = hre.ethers.parseEther("0.001");
  
  const createTx = await escrow.createEscrow(
    seller.address,
    hre.ethers.ZeroAddress,
    amount,
    config.weth, // Target WETH on Sepolia
    40161, // Sepolia chain ID
    { value: amount }
  );
  
  const receipt = await createTx.wait();
  console.log("✅ Escrow created");
  
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
  console.log("✅ Condition updated");
  
  // Now let's simulate what happens during release
  console.log("\n🔬 Simulating release process...");
  
  // Check the escrow data
  const escrowData = await escrow.escrows(escrowId);
  console.log("\nEscrow data:");
  console.log("- Net amount:", hre.ethers.formatEther(escrowData.netAmount));
  console.log("- Target chain:", escrowData.targetChainId);
  console.log("- Released:", escrowData.released);
  console.log("- Condition met:", escrowData.conditionMet);
  
  // Check OFT adapter configuration
  const configuredOft = await escrow.oftAdapters(40161);
  console.log("\nConfigured OFT for Sepolia:", configuredOft);
  
  // The contract should convert ETH to WETH during release
  console.log("\n💡 The contract needs to:");
  console.log("1. Convert ETH to WETH");
  console.log("2. Approve OFT adapter to spend WETH");
  console.log("3. Call OFT adapter to bridge");
  
  // Let's trace through the release call
  console.log("\n🚀 Attempting release with detailed error catching...");
  
  // Get LayerZero fee
  const oftAdapter = await hre.ethers.getContractAt("SimplePropertyOFTAdapter", config.oftAdapter);
  const sendParam = {
    dstEid: 40161,
    to: hre.ethers.zeroPadValue(seller.address, 32),
    amountLD: escrowData.netAmount,
    minAmountLD: escrowData.netAmount * 95n / 100n,
    extraOptions: "0x00030100110100000000000000000000000000030d40",
    composeMsg: "0x",
    oftCmd: "0x"
  };
  
  const quote = await oftAdapter.quoteSend(sendParam, false);
  console.log("LayerZero fee:", hre.ethers.formatEther(quote.nativeFee));
  
  try {
    // Try calling release
    const releaseTx = await escrow.releaseEscrow(escrowId, {
      value: quote.nativeFee,
      gasLimit: 2000000 // High gas limit
    });
    
    console.log("Release TX:", releaseTx.hash);
    const releaseReceipt = await releaseTx.wait();
    console.log("✅ Released!");
    
  } catch (error) {
    console.error("\n❌ Release failed");
    console.error("Error:", error.message);
    
    // Try to get more details
    if (error.transaction) {
      console.log("\nTransaction that failed:");
      console.log("- To:", error.transaction.to);
      console.log("- Value:", error.transaction.value);
      console.log("- Data length:", error.transaction.data?.length);
    }
    
    if (error.receipt) {
      console.log("\nReceipt:");
      console.log("- Status:", error.receipt.status);
      console.log("- Gas used:", error.receipt.gasUsed?.toString());
      console.log("- Logs:", error.receipt.logs?.length);
    }
    
    // Try static call to get revert reason
    console.log("\n🔍 Trying static call to get revert reason...");
    try {
      await escrow.releaseEscrow.staticCall(escrowId, {
        value: quote.nativeFee,
        from: deployer.address
      });
      console.log("Static call succeeded (this is unexpected)");
    } catch (staticError) {
      console.log("Static call error:", staticError.message);
      
      // Try to decode the error
      if (staticError.data) {
        console.log("\nError data:", staticError.data);
        
        // Try common error signatures
        const errorSigs = {
          "0x08c379a0": "Error(string)",
          "0x4e487b71": "Panic(uint256)",
          "0xb12d13eb": "UnauthorizedCaller()",
          "0x7c1f8113": "InvalidChainId()",
          "0xf4d678b8": "InsufficientBalance()"
        };
        
        const sig = staticError.data.slice(0, 10);
        if (errorSigs[sig]) {
          console.log("Error type:", errorSigs[sig]);
        }
        
        // Try to decode as string error
        if (sig === "0x08c379a0") {
          try {
            const decoded = hre.ethers.AbiCoder.defaultAbiCoder().decode(
              ["string"],
              "0x" + staticError.data.slice(138)
            );
            console.log("Revert reason:", decoded[0]);
          } catch {}
        }
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