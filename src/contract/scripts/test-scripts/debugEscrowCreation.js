const hre = require("hardhat");

async function main() {
  console.log("\n=== DEBUG ESCROW CREATION ===\n");
  
  const [deployer] = await hre.ethers.getSigners();
  const network = hre.network.name;
  
  const escrowAddress = "0x2ee79369D7cCb53550F1Ca61A1a3bf60B3C92f1E";
  const UniversalEscrowService = await hre.ethers.getContractFactory("UniversalEscrowService");
  const escrow = UniversalEscrowService.attach(escrowAddress);
  
  // Check minimum deposit
  console.log("Checking contract state...");
  
  try {
    const minDeposit = await escrow.minDeposit();
    console.log("Minimum deposit:", hre.ethers.formatEther(minDeposit), "ETH");
  } catch (e) {
    console.log("No minDeposit function");
  }
  
  // Try different amounts
  const amounts = [
    hre.ethers.parseEther("0.0001"),
    hre.ethers.parseEther("0.001"),
    hre.ethers.parseEther("0.01")
  ];
  
  const seller = hre.ethers.Wallet.createRandom().connect(hre.ethers.provider);
  console.log("\nTest seller:", seller.address);
  
  for (const amount of amounts) {
    console.log(`\nTesting with ${hre.ethers.formatEther(amount)} ETH...`);
    
    try {
      // Try to create a simple same-chain escrow first
      const tx = await escrow.createEscrow(
        seller.address,
        "0x0000000000000000000000000000000000000000", // ETH
        amount,
        "0x0000000000000000000000000000000000000000", // ETH
        0, // Same chain
        { value: amount }
      );
      
      console.log("✅ Success! Transaction:", tx.hash);
      const receipt = await tx.wait();
      
      // Get event
      const event = receipt.logs.find(log => {
        try {
          const parsed = escrow.interface.parseLog(log);
          return parsed.name === "EscrowCreated";
        } catch {
          return false;
        }
      });
      
      if (event) {
        const parsed = escrow.interface.parseLog(event);
        console.log("Service fee:", hre.ethers.formatEther(parsed.args.serviceFee), "ETH");
        console.log("Net amount:", hre.ethers.formatEther(parsed.args.netAmount), "ETH");
      }
      
      break; // Found working amount
      
    } catch (error) {
      console.log("❌ Failed:", error.message);
      if (error.data) {
        try {
          const errorInterface = new hre.ethers.Interface([
            "error InvalidAmount()",
            "error InsufficientDeposit()"
          ]);
          const decoded = errorInterface.parseError(error.data);
          if (decoded) {
            console.log("Error type:", decoded.name);
          }
        } catch {}
      }
    }
  }
  
  // Check cross-chain specific requirements
  console.log("\n\nChecking cross-chain requirements...");
  
  // Check if there's a minimum for cross-chain
  const targetChainId = 40267; // Polygon
  const targetWeth = "0x360ad4f9a9A8ECB5f461c4Cc1047E1Dcf9";
  
  console.log("Target chain:", targetChainId);
  console.log("Target WETH:", targetWeth);
  
  // Check OFT adapter
  const oftAdapter = await escrow.oftAdapters(targetChainId);
  console.log("OFT Adapter:", oftAdapter);
  
  if (oftAdapter !== "0x0000000000000000000000000000000000000000") {
    console.log("\n✅ Cross-chain is configured for this route");
  } else {
    console.log("\n❌ No OFT adapter configured for this chain");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });