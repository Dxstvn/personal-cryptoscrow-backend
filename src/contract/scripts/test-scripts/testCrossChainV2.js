const hre = require("hardhat");

async function main() {
  console.log("\n=== TEST CROSS-CHAIN V2 ===\n");
  
  const [deployer] = await hre.ethers.getSigners();
  const network = hre.network.name;
  
  console.log("Network:", network);
  console.log("Deployer:", deployer.address);
  
  // V2 contract addresses
  const v2Addresses = {
    "sepolia": "0x0000000000000000000000000000000000000000", // Not deployed yet
    "polygon-amoy": "0x0000000000000000000000000000000000000000", // Not deployed yet
    "arbitrum-sepolia": "0xF29A11B7c0856BAF925a63c1104F37b8A12204A2" // Latest deployment
  };
  
  const escrowAddress = v2Addresses[network];
  if (!escrowAddress || escrowAddress === hre.ethers.ZeroAddress) {
    console.error("V2 not deployed on this network yet");
    return;
  }
  
  const escrow = await hre.ethers.getContractAt("UniversalEscrowServiceV2", escrowAddress);
  
  // Test configuration
  const seller = hre.ethers.Wallet.createRandom();
  const amount = hre.ethers.parseEther("0.001");
  
  // Target configurations using actual chain IDs
  const targets = {
    "sepolia": { chainId: 80002, name: "Polygon Amoy" },
    "polygon-amoy": { chainId: 11155111, name: "Sepolia" },
    "arbitrum-sepolia": { chainId: 11155111, name: "Sepolia" }
  };
  
  const target = targets[network];
  
  console.log("\nTest Configuration:");
  console.log("Seller:", seller.address);
  console.log("Amount:", hre.ethers.formatEther(amount), "ETH");
  console.log("Target Chain:", target.name, `(${target.chainId})`);
  
  // Check chain mapping
  const endpointId = await escrow.chainIdToEndpointId(target.chainId);
  console.log("Mapped Endpoint ID:", endpointId);
  
  // Get WETH address for target
  const wethAddresses = {
    11155111: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14", // Sepolia
    80002: "0x360ad4f9a9A8ECB5f461c4Cc1047E1Dcf9", // Polygon
    421614: "0x980B62Da83eFf3D4576C647993b0c1D7faf17c73" // Arbitrum
  };
  
  const targetWeth = wethAddresses[target.chainId];
  console.log("Target WETH:", targetWeth);
  
  try {
    // Step 1: Create escrow with actual chain ID
    console.log("\n📝 Creating cross-chain escrow...");
    const createTx = await escrow.createEscrow(
      seller.address,
      hre.ethers.ZeroAddress, // ETH
      amount,
      targetWeth,
      target.chainId, // Using actual chain ID now!
      { value: amount }
    );
    
    const createReceipt = await createTx.wait();
    console.log("✅ Escrow created in block", createReceipt.blockNumber);
    
    // Get escrow ID
    let escrowId;
    for (const log of createReceipt.logs) {
      try {
        const parsed = escrow.interface.parseLog(log);
        if (parsed && parsed.name === "EscrowCreated") {
          escrowId = parsed.args.escrowId;
          console.log("Escrow ID:", escrowId);
          console.log("Service Fee:", hre.ethers.formatEther(parsed.args.serviceFee));
          console.log("Net Amount:", hre.ethers.formatEther(parsed.args.netAmount));
          break;
        }
      } catch {}
    }
    
    // Step 2: Update condition
    console.log("\n📝 Updating condition...");
    const updateTx = await escrow.updateCondition(escrowId, true);
    await updateTx.wait();
    console.log("✅ Condition updated");
    
    // Step 3: Get LayerZero fee quote
    console.log("\n📊 Getting LayerZero fee...");
    const oftAdapter = await hre.ethers.getContractAt(
      "SimplePropertyOFTAdapter",
      network === "arbitrum-sepolia" ? "0xbaa46938E3110187ED6a55EE139312b28c943d00" :
      network === "polygon-amoy" ? "0x746EF3c4C9c3f779Bc3558A5FF55C3f34ae20725" :
      "0xb3dd252bfc2c3d822f7F0f550Df576a9CC928Bf4"
    );
    
    const netAmount = amount * 98n / 100n;
    const sendParam = {
      dstEid: endpointId, // Using the mapped endpoint ID
      to: hre.ethers.zeroPadValue(seller.address, 32),
      amountLD: netAmount,
      minAmountLD: netAmount * 95n / 100n,
      extraOptions: "0x00030100110100000000000000000000000000030d40",
      composeMsg: "0x",
      oftCmd: "0x"
    };
    
    const quote = await oftAdapter.quoteSend(sendParam, false);
    console.log("LayerZero fee:", hre.ethers.formatEther(quote.nativeFee));
    
    // Step 4: Release with LayerZero fee
    console.log("\n🚀 Releasing escrow cross-chain...");
    const releaseTx = await escrow.releaseEscrow(escrowId, {
      value: quote.nativeFee,
      gasLimit: 1500000
    });
    
    console.log("📤 Release TX:", releaseTx.hash);
    const releaseReceipt = await releaseTx.wait();
    console.log("✅ Released in block", releaseReceipt.blockNumber);
    
    // Parse events
    console.log("\n📋 Events emitted:");
    let crossChainInitiated = false;
    
    for (const log of releaseReceipt.logs) {
      try {
        const parsed = escrow.interface.parseLog(log);
        if (parsed) {
          console.log("-", parsed.name);
          
          if (parsed.name === "CrossChainTransferInitiated") {
            crossChainInitiated = true;
            console.log("  Target Chain ID:", parsed.args.targetChainId);
            console.log("  OFT Adapter:", parsed.args.oftAdapter);
            console.log("  GUID:", parsed.args.guid);
            console.log("  With Compose:", parsed.args.withCompose);
          } else if (parsed.name === "EscrowReleased") {
            console.log("  Method:", parsed.args.method);
            console.log("  Amount:", hre.ethers.formatEther(parsed.args.finalAmount));
            console.log("  With Compose:", parsed.args.withCompose);
          }
        }
      } catch {}
    }
    
    if (crossChainInitiated) {
      console.log("\n✅ Cross-chain transfer successfully initiated!");
      console.log("The chain ID mapping solution works correctly!");
      console.log("\nMonitor the destination chain for WETH arrival:");
      console.log("- Chain:", target.name);
      console.log("- Seller:", seller.address);
      console.log("- Expected WETH:", hre.ethers.formatEther(netAmount));
    }
    
  } catch (error) {
    console.error("\n❌ Error:", error.message);
    if (error.data) {
      console.log("Error data:", error.data);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });