const hre = require("hardhat");
require('dotenv').config();

// Contract addresses from deployment
const CONTRACTS = {
  11155111: "0xc13aEB9510213DCC5f0C82a9deCf0F9f8607Dc61", // Sepolia
  421614: "0x706D2Eb63a1c9f4F89DFe6c36293b4253229f6F0"    // Arbitrum Sepolia
};

async function main() {
  console.log("Testing cross-chain transfer Sepolia -> Arbitrum...\n");
  
  const [deployer] = await hre.ethers.getSigners();
  const chainId = (await hre.ethers.provider.getNetwork()).chainId;
  
  if (chainId !== 11155111n) {
    console.log("This test must be run on Sepolia!");
    return;
  }
  
  const contractAddress = CONTRACTS[chainId];
  const escrow = await hre.ethers.getContractAt("UniversalEscrowServiceV3SimplifiedNoDisputes", contractAddress);
  
  // Test cross-chain transfer
  const depositAmount = hre.ethers.parseEther("0.001");
  const targetChainId = 421614; // Arbitrum Sepolia
  const seller = "0x2223F51659fAcC662504dcEbD4735886285ABC96";
  
  // Get fee quote
  console.log("Getting Stargate fee quote...");
  try {
    const quote = await escrow.getStargateQuote(
      targetChainId,
      hre.ethers.ZeroAddress, // ETH
      depositAmount
    );
    console.log("Cross-chain fee:", hre.ethers.formatEther(quote.fee), "ETH");
    console.log("Min amount out:", hre.ethers.formatEther(quote.minAmountOut), "ETH");
    
    // Create cross-chain escrow
    console.log("\nCreating cross-chain escrow...");
    const tx1 = await escrow.createEscrow(
      seller,
      hre.ethers.ZeroAddress, // ETH
      depositAmount,
      hre.ethers.ZeroAddress, // ETH on Arbitrum
      targetChainId,
      { value: depositAmount, gasLimit: 300000 }
    );
    
    const receipt1 = await tx1.wait();
    console.log("✅ Escrow created:", receipt1.hash);
    
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
    
    // Release with cross-chain fee
    console.log("\nReleasing cross-chain (includes Stargate fee)...");
    const tx3 = await escrow.releaseEscrow(escrowId, { 
      value: quote.fee,
      gasLimit: 500000 
    });
    const receipt3 = await tx3.wait();
    
    // Check for Stargate event
    const stargateEvent = receipt3.logs.find(log => {
      try {
        const parsed = escrow.interface.parseLog(log);
        return parsed && parsed.name === "StargateTransferInitiated";
      } catch (e) {
        return false;
      }
    });
    
    if (stargateEvent) {
      const parsed = escrow.interface.parseLog(stargateEvent);
      console.log("\n✅ Cross-chain transfer initiated!");
      console.log("- Destination Chain ID:", parsed.args.dstChainId.toString());
      console.log("- Amount:", hre.ethers.formatEther(parsed.args.amount), "ETH");
      console.log("- Transaction:", receipt3.hash);
    }
    
    console.log("\n📍 View on Sepolia Explorer:");
    console.log(`https://sepolia.etherscan.io/tx/${receipt3.hash}`);
    
    console.log("\n⏳ Funds will arrive on Arbitrum in ~1-2 minutes");
    console.log("📍 Check destination on Arbitrum:");
    console.log(`https://sepolia.arbiscan.io/address/${seller}`);
    
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