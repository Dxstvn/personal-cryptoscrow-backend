const hre = require("hardhat");

async function main() {
  console.log("\n=== DEBUG CROSS-CHAIN RELEASE ===\n");
  
  const [deployer] = await hre.ethers.getSigners();
  const network = hre.network.name;
  
  console.log("Network:", network);
  console.log("Deployer:", deployer.address);
  
  // Contract addresses
  const contracts = {
    "sepolia": {
      escrow: "0x2ee79369D7cCb53550F1Ca61A1a3bf60B3C92f1E",
      oftAdapter: "0xb3dd252bfc2c3d822f7F0f550Df576a9CC928Bf4",
      weth: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14"
    },
    "polygon-amoy": {
      escrow: "0x53E4b9A8f7b1185768cef74d9564cbeD052a9682",
      oftAdapter: "0x746EF3c4C9c3f779Bc3558A5FF55C3f34ae20725",
      weth: "0x360ad4f9a9A8EFe9A8DCB5f461c4Cc1047E1Dcf9"
    },
    "arbitrum-sepolia": {
      escrow: "0xd3b5A13C113328C4F4F1AbF646a2be2AaC8815B5",
      oftAdapter: "0xbaa46938E3110187ED6a55EE139312b28c943d00",
      weth: "0x980B62Da83eFf3D4576C647993b0c1D7faf17c73"
    }
  };
  
  const config = contracts[network];
  if (!config) {
    console.error("Unknown network");
    return;
  }
  
  // Connect to contracts
  const UniversalEscrowService = await hre.ethers.getContractFactory("UniversalEscrowService");
  const escrow = UniversalEscrowService.attach(config.escrow);
  
  const SimplePropertyOFTAdapter = await hre.ethers.getContractFactory("SimplePropertyOFTAdapter");
  const oftAdapter = SimplePropertyOFTAdapter.attach(config.oftAdapter);
  
  // Check escrow contract balance
  const escrowBalance = await hre.ethers.provider.getBalance(config.escrow);
  console.log("\nEscrow contract balance:", hre.ethers.formatEther(escrowBalance), "ETH");
  
  // Check WETH balance
  const WETH = await hre.ethers.getContractAt("IERC20", config.weth);
  const wethBalance = await WETH.balanceOf(config.escrow);
  console.log("Escrow WETH balance:", hre.ethers.formatEther(wethBalance), "WETH");
  
  // Check if escrow is authorized caller for OFT adapter
  console.log("\n🔍 Checking OFT adapter authorization...");
  try {
    const isAuthorized = await oftAdapter.authorizedCallers(config.escrow);
    console.log("Escrow authorized for OFT adapter:", isAuthorized);
    
    if (!isAuthorized) {
      console.log("\n⚠️  Escrow is NOT authorized! This could be the issue.");
      console.log("The escrow contract needs to be authorized to call the OFT adapter.");
    }
  } catch (e) {
    console.log("Could not check authorization:", e.message);
  }
  
  // Check OFT adapter WETH allowance
  const allowance = await WETH.allowance(config.escrow, config.oftAdapter);
  console.log("\nWETH allowance from escrow to OFT adapter:", hre.ethers.formatEther(allowance), "WETH");
  
  // Test creating and releasing a cross-chain escrow
  console.log("\n📝 Creating test escrow...");
  
  const seller = hre.ethers.Wallet.createRandom();
  const amount = hre.ethers.parseEther("0.001");
  
  // Target chain
  const targets = {
    "sepolia": { chainId: 40267, weth: "0x360ad4f9a9A8ECB5f461c4Cc1047E1Dcf9" },
    "polygon-amoy": { chainId: 40161, weth: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14" },
    "arbitrum-sepolia": { chainId: 40161, weth: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14" }
  };
  
  const target = targets[network];
  if (!target) {
    console.error("No target configured");
    return;
  }
  
  try {
    // Create escrow
    const createTx = await escrow.createEscrow(
      seller.address,
      "0x0000000000000000000000000000000000000000", // ETH
      amount,
      target.weth,
      target.chainId,
      { value: amount }
    );
    
    const receipt = await createTx.wait();
    console.log("✅ Escrow created");
    
    // Get escrow ID
    const event = receipt.logs.find(log => {
      try {
        const parsed = escrow.interface.parseLog(log);
        return parsed.name === "EscrowCreated";
      } catch {
        return false;
      }
    });
    
    const parsedEvent = escrow.interface.parseLog(event);
    const escrowId = parsedEvent.args.escrowId;
    console.log("Escrow ID:", escrowId);
    
    // Update condition
    const updateTx = await escrow.updateCondition(escrowId, true);
    await updateTx.wait();
    console.log("✅ Condition updated");
    
    // Get LayerZero fee quote
    console.log("\n📊 Getting LayerZero fee quote...");
    const netAmount = amount * 98n / 100n; // After 2% fee
    
    const sendParam = {
      dstEid: target.chainId,
      to: hre.ethers.zeroPadValue(seller.address, 32),
      amountLD: netAmount,
      minAmountLD: netAmount * 95n / 100n,
      extraOptions: hre.ethers.solidityPacked(
        ["uint16", "uint256"],
        [1, 200000]
      ),
      composeMsg: "0x",
      oftCmd: "0x"
    };
    
    const quote = await oftAdapter.quoteSend(sendParam, false);
    console.log("LayerZero fee:", hre.ethers.formatEther(quote.nativeFee), "ETH");
    
    // Try to simulate the release
    console.log("\n🔬 Simulating release transaction...");
    try {
      // First check if we can call it
      await escrow.releaseEscrow.staticCall(escrowId, { value: quote.nativeFee });
      console.log("✅ Static call succeeded");
      
      // Now actually do it
      console.log("\n🚀 Executing release...");
      const releaseTx = await escrow.releaseEscrow(escrowId, { 
        value: quote.nativeFee,
        gasLimit: 1000000 // High gas limit
      });
      
      console.log("📤 Release TX:", releaseTx.hash);
      const releaseReceipt = await releaseTx.wait();
      console.log("✅ Released in block", releaseReceipt.blockNumber);
      
      // Check events
      console.log("\n📋 Events emitted:");
      for (const log of releaseReceipt.logs) {
        try {
          const parsed = escrow.interface.parseLog(log);
          if (parsed) {
            console.log("-", parsed.name);
            if (parsed.name === "CrossChainTransferInitiated") {
              console.log("  Chain ID:", parsed.args.targetChainId);
              console.log("  OFT Adapter:", parsed.args.oftAdapter);
              console.log("  Message GUID:", parsed.args.guid);
            }
          }
        } catch {
          // Try OFT adapter events
          try {
            const oftParsed = oftAdapter.interface.parseLog(log);
            if (oftParsed) {
              console.log("- [OFT]", oftParsed.name);
            }
          } catch {}
        }
      }
      
    } catch (error) {
      console.error("\n❌ Release failed:", error.message);
      
      // Try to understand why
      console.log("\n🔍 Debugging the failure...");
      
      // Check escrow state
      const escrowData = await escrow.escrows(escrowId);
      console.log("\nEscrow state:");
      console.log("- Released:", escrowData.released);
      console.log("- Condition met:", escrowData.conditionMet);
      console.log("- Net amount:", hre.ethers.formatEther(escrowData.netAmount), "ETH");
      
      // Check if it's an authorization issue
      const isAuth = await oftAdapter.authorizedCallers(config.escrow);
      if (!isAuth) {
        console.log("\n❌ AUTHORIZATION ISSUE CONFIRMED!");
        console.log("The escrow contract is not authorized to call the OFT adapter.");
        console.log("\nTo fix this, run:");
        console.log(`npx hardhat run scripts/utility-scripts/authorizeOFTAdapters.js --network ${network}`);
      }
      
      // Try to decode error
      if (error.data && error.data.length > 10) {
        try {
          const errorInterface = new hre.ethers.Interface([
            "error UnauthorizedCaller()",
            "error InsufficientBalance()",
            "error InvalidChainId()"
          ]);
          const decoded = errorInterface.parseError(error.data);
          if (decoded) {
            console.log("\nDecoded error:", decoded.name);
          }
        } catch {}
      }
    }
    
  } catch (error) {
    console.error("\n❌ Test failed:", error.message);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });