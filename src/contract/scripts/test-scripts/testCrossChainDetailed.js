const hre = require("hardhat");

async function main() {
  console.log("\n=== DETAILED CROSS-CHAIN TEST ===\n");
  
  const [deployer] = await hre.ethers.getSigners();
  const network = hre.network.name;
  
  // Use small test amount
  const amount = hre.ethers.parseEther("0.001"); // 0.001 ETH
  const seller = hre.ethers.Wallet.createRandom().connect(hre.ethers.provider);
  
  console.log("Network:", network);
  console.log("Deployer:", deployer.address);
  console.log("Seller:", seller.address);
  console.log("Amount:", hre.ethers.formatEther(amount), "ETH\n");
  
  // Contract setup
  const escrowAddress = "0x2ee79369D7cCb53550F1Ca61A1a3bf60B3C92f1E";
  const UniversalEscrowService = await hre.ethers.getContractFactory("UniversalEscrowService");
  const escrow = UniversalEscrowService.attach(escrowAddress);
  
  // Check contract balance
  const contractBalance = await hre.ethers.provider.getBalance(escrowAddress);
  console.log("Escrow contract balance:", hre.ethers.formatEther(contractBalance), "ETH");
  
  // Check if contract has receive function
  console.log("\nChecking contract capabilities...");
  
  // Target chain (Polygon)
  const targetChainId = 40267;
  const targetWeth = "0x360ad4f9a9A8ECB5f461c4Cc1047E1Dcf9";
  
  console.log("Target chain:", targetChainId);
  console.log("Target WETH:", targetWeth);
  
  // Check OFT configuration
  const oftAdapter = await escrow.oftAdapters(targetChainId);
  console.log("OFT Adapter:", oftAdapter);
  
  if (oftAdapter === "0x0000000000000000000000000000000000000000") {
    console.error("No OFT adapter!");
    return;
  }
  
  try {
    // Step 1: Create escrow
    console.log("\n📝 Step 1: Creating escrow...");
    const createTx = await escrow.createEscrow(
      seller.address,
      "0x0000000000000000000000000000000000000000", // ETH
      amount,
      targetWeth,
      targetChainId,
      { value: amount }
    );
    
    const createReceipt = await createTx.wait();
    console.log("✅ Created in block", createReceipt.blockNumber);
    
    // Get escrow ID
    const event = createReceipt.logs.find(log => {
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
    
    // Step 2: Update condition
    console.log("\n📝 Step 2: Updating condition...");
    const updateTx = await escrow.updateCondition(escrowId, true);
    await updateTx.wait();
    console.log("✅ Condition updated");
    
    // Step 3: Check what LayerZero fee the contract will need
    console.log("\n📝 Step 3: Checking LayerZero fee requirements...");
    
    // Get a fresh quote
    const SimplePropertyOFTAdapter = await hre.ethers.getContractFactory("SimplePropertyOFTAdapter");
    const adapter = SimplePropertyOFTAdapter.attach("0xb3dd252bfc2c3d822f7F0f550Df576a9CC928Bf4");
    
    const netAmount = amount * 98n / 100n; // After 2% fee
    const sendParam = {
      dstEid: targetChainId,
      to: hre.ethers.zeroPadValue(seller.address, 32),
      amountLD: netAmount,
      minAmountLD: netAmount * 95n / 100n, // 5% slippage
      extraOptions: hre.ethers.solidityPacked(
        ["uint16", "uint256"],
        [1, 200000]
      ),
      composeMsg: "0x",
      oftCmd: "0x"
    };
    
    const quote = await adapter.quoteSend(sendParam, false);
    console.log("LayerZero fee needed:", hre.ethers.formatEther(quote.nativeFee), "ETH");
    
    // Step 4: Try release with different fee amounts
    console.log("\n📝 Step 4: Attempting release...");
    
    // Try with exact fee
    console.log("\nTrying with exact fee:", hre.ethers.formatEther(quote.nativeFee));
    try {
      const releaseTx = await escrow.releaseEscrow(escrowId, { 
        value: quote.nativeFee,
        gasLimit: 500000 // Higher gas limit
      });
      console.log("📤 Release TX:", releaseTx.hash);
      const releaseReceipt = await releaseTx.wait();
      console.log("✅ Released in block", releaseReceipt.blockNumber);
      
      // Check for events
      console.log("\n📋 Release events:");
      for (const log of releaseReceipt.logs) {
        try {
          const parsed = escrow.interface.parseLog(log);
          if (parsed) {
            console.log("-", parsed.name);
          }
        } catch {}
      }
      
    } catch (error) {
      console.error("❌ Release failed:", error.message);
      
      // Try to get more info
      if (error.data) {
        console.log("\nTrying to decode error...");
        try {
          // Check if it's a string revert
          const errorString = hre.ethers.toUtf8String("0x" + error.data.slice(138));
          console.log("Revert reason:", errorString);
        } catch {
          console.log("Raw error data:", error.data);
        }
      }
      
      // Check if it's a gas issue
      console.log("\nEstimating gas...");
      try {
        const gasEstimate = await escrow.releaseEscrow.estimateGas(escrowId, {
          value: quote.nativeFee
        });
        console.log("Gas estimate:", gasEstimate.toString());
      } catch (gasError) {
        console.log("Gas estimation failed:", gasError.message);
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