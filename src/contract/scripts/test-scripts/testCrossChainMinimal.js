const hre = require("hardhat");

async function main() {
  console.log("\n=== MINIMAL CROSS-CHAIN TEST ===\n");
  
  const [deployer] = await hre.ethers.getSigners();
  
  // Fixed addresses to avoid provider issues
  const ESCROW_ADDRESS = "0x2ee79369D7cCb53550F1Ca61A1a3bf60B3C92f1E";
  const OFT_ADAPTER = "0xb3dd252bfc2c3d822f7F0f550Df576a9CC928Bf4";
  const SELLER = "0x" + "1".repeat(40); // Simple test address
  
  console.log("Deployer:", deployer.address);
  console.log("Escrow:", ESCROW_ADDRESS);
  console.log("OFT Adapter:", OFT_ADAPTER);
  console.log("Test Seller:", SELLER);
  
  // Connect to contracts
  const escrow = await hre.ethers.getContractAt("UniversalEscrowService", ESCROW_ADDRESS);
  const oftAdapter = await hre.ethers.getContractAt("SimplePropertyOFTAdapter", OFT_ADAPTER);
  
  // Check if escrow can call OFT adapter
  console.log("\n🔍 Checking authorization...");
  
  // First check who owns the OFT adapter
  try {
    const oftOwner = await oftAdapter.owner();
    console.log("OFT Adapter owner:", oftOwner);
  } catch (e) {
    console.log("Could not get OFT owner");
  }
  
  // Check if there's an authorized callers mapping
  try {
    // Try to read the storage slot for authorized callers
    // This is a workaround since the function might not be exposed
    const isAuthorized = await oftAdapter.authorizedCallers(ESCROW_ADDRESS);
    console.log("Escrow authorized:", isAuthorized);
  } catch (e) {
    console.log("Could not check authorization directly");
    
    // Try calling delegates function instead
    try {
      const delegates = await oftAdapter.delegates();
      console.log("OFT Delegates:", delegates);
    } catch (e2) {
      console.log("No delegates function either");
    }
  }
  
  // Create a minimal escrow
  const amount = hre.ethers.parseEther("0.001");
  console.log("\n📝 Creating escrow for", hre.ethers.formatEther(amount), "ETH");
  
  try {
    const tx = await escrow.createEscrow(
      SELLER,
      hre.ethers.ZeroAddress, // ETH
      amount,
      "0x360ad4f9a9A8ECB5f461c4Cc1047E1Dcf9", // Polygon WETH
      40267, // Polygon chain ID
      { value: amount }
    );
    
    console.log("TX hash:", tx.hash);
    const receipt = await tx.wait();
    console.log("✅ Created in block", receipt.blockNumber);
    
    // Get escrow ID
    let escrowId;
    for (const log of receipt.logs) {
      try {
        const parsed = escrow.interface.parseLog(log);
        if (parsed && parsed.name === "EscrowCreated") {
          escrowId = parsed.args.escrowId;
          console.log("Escrow ID:", escrowId);
          break;
        }
      } catch {}
    }
    
    if (!escrowId) {
      console.error("Could not find escrow ID");
      return;
    }
    
    // Update condition
    console.log("\n📝 Updating condition...");
    const updateTx = await escrow.updateCondition(escrowId, true);
    await updateTx.wait();
    console.log("✅ Condition updated");
    
    // Get quote for release
    console.log("\n📊 Getting LayerZero quote...");
    const netAmount = amount * 98n / 100n;
    
    // Build send params
    const sendParam = {
      dstEid: 40267,
      to: "0x" + SELLER.slice(2).padStart(64, '0'),
      amountLD: netAmount,
      minAmountLD: netAmount * 95n / 100n,
      extraOptions: hre.ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint16", "uint256"],
        [1, 200000]
      ),
      composeMsg: "0x",
      oftCmd: "0x"
    };
    
    try {
      const quote = await oftAdapter.quoteSend(sendParam, false);
      console.log("LZ Fee:", hre.ethers.formatEther(quote.nativeFee), "ETH");
      
      // Try release
      console.log("\n🚀 Attempting release...");
      const releaseTx = await escrow.releaseEscrow(escrowId, {
        value: quote.nativeFee,
        gasLimit: 800000
      });
      
      console.log("Release TX:", releaseTx.hash);
      const releaseReceipt = await releaseTx.wait();
      console.log("✅ Released in block", releaseReceipt.blockNumber);
      
      // Check events
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
      console.error("\n❌ Failed:", error.message);
      
      // Check if it's auth issue by looking at the escrow's OFT config
      const configuredOft = await escrow.oftAdapters(40267);
      console.log("\nEscrow's configured OFT for Polygon:", configuredOft);
      
      if (configuredOft !== OFT_ADAPTER) {
        console.log("⚠️  OFT adapter mismatch!");
        console.log("Expected:", OFT_ADAPTER);
        console.log("Configured:", configuredOft);
      }
      
      // Try to understand the error
      if (error.reason) {
        console.log("Reason:", error.reason);
      }
      if (error.code) {
        console.log("Code:", error.code);
      }
    }
    
  } catch (error) {
    console.error("Failed to create escrow:", error.message);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });