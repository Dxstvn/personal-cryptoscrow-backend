const hre = require("hardhat");
require('dotenv').config();

// Contract addresses from deployment
const CONTRACTS = {
  11155111: "0xc13aEB9510213DCC5f0C82a9deCf0F9f8607Dc61", // Sepolia
  421614: "0x706D2Eb63a1c9f4F89DFe6c36293b4253229f6F0"    // Arbitrum Sepolia
};

async function main() {
  console.log("Testing ETH to USDC swap on Sepolia...\n");
  
  const [deployer] = await hre.ethers.getSigners();
  const chainId = (await hre.ethers.provider.getNetwork()).chainId;
  
  if (chainId !== 11155111n) {
    console.log("This test must be run on Sepolia!");
    return;
  }
  
  const contractAddress = CONTRACTS[chainId];
  const escrow = await hre.ethers.getContractAt("UniversalEscrowServiceV3SimplifiedNoDisputes", contractAddress);
  
  // USDC address on Sepolia
  const usdcAddress = "0x97e5D10FB0fb3B07540dB36FA96673248896f1f8";
  const seller = "0x2223F51659fAcC662504dcEbD4735886285ABC96";
  const depositAmount = hre.ethers.parseEther("0.0005");
  
  console.log("Creating escrow for ETH -> USDC swap...");
  console.log("- Deposit: 0.0005 ETH");
  console.log("- Target: USDC on Sepolia");
  console.log("- Seller:", seller);
  
  try {
    // Create escrow
    const tx1 = await escrow.createEscrow(
      seller,
      hre.ethers.ZeroAddress, // ETH
      depositAmount,
      usdcAddress, // USDC
      chainId,
      { value: depositAmount, gasLimit: 300000 }
    );
    
    const receipt1 = await tx1.wait();
    console.log("\n✅ Escrow created:", receipt1.hash);
    
    // Get escrow ID
    const event = receipt1.logs.find(log => {
      try {
        const parsed = escrow.interface.parseLog(log);
        return parsed && parsed.name === "EscrowCreated";
      } catch (e) {
        return false;
      }
    });
    
    const escrowId = event ? escrow.interface.parseLog(event).args.escrowId : null;
    console.log("Escrow ID:", escrowId);
    
    // Update condition
    console.log("\nUpdating condition...");
    const tx2 = await escrow.updateCondition(escrowId, true, { gasLimit: 100000 });
    await tx2.wait();
    console.log("✅ Condition updated");
    
    // Release (will swap ETH to USDC)
    console.log("\nReleasing escrow (swapping ETH to USDC)...");
    const tx3 = await escrow.releaseEscrow(escrowId, { gasLimit: 400000 });
    const receipt3 = await tx3.wait();
    
    // Check for release event
    const releaseEvent = receipt3.logs.find(log => {
      try {
        const parsed = escrow.interface.parseLog(log);
        return parsed && parsed.name === "EscrowReleased";
      } catch (e) {
        return false;
      }
    });
    
    if (releaseEvent) {
      const parsed = escrow.interface.parseLog(releaseEvent);
      console.log("\n✅ ETH to USDC swap completed!");
      console.log("- Method:", parsed.args.method);
      console.log("- Final Token:", parsed.args.finalToken);
      console.log("- Transaction:", receipt3.hash);
    }
    
    console.log("\n📍 View on Sepolia Explorer:");
    console.log(`https://sepolia.etherscan.io/tx/${receipt3.hash}`);
    
    console.log("\n💰 Check seller's USDC balance:");
    console.log(`https://sepolia.etherscan.io/token/${usdcAddress}?a=${seller}`);
    
  } catch (error) {
    console.error("Error:", error.message);
    if (error.data) {
      console.error("Error data:", error.data);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });