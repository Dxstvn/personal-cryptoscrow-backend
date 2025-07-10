const hre = require("hardhat");
require('dotenv').config();

// Contract addresses from deployment
const CONTRACTS = {
  11155111: "0xc13aEB9510213DCC5f0C82a9deCf0F9f8607Dc61", // Sepolia
  421614: "0x706D2Eb63a1c9f4F89DFe6c36293b4253229f6F0"    // Arbitrum Sepolia
};

async function main() {
  console.log("Testing basic ETH transfer on simplified escrow...\n");
  
  const [deployer] = await hre.ethers.getSigners();
  const chainId = (await hre.ethers.provider.getNetwork()).chainId;
  const contractAddress = CONTRACTS[chainId];
  
  console.log("Network:", chainId === 11155111n ? "Sepolia" : "Arbitrum Sepolia");
  console.log("Contract:", contractAddress);
  console.log("Deployer:", deployer.address);
  
  const escrow = await hre.ethers.getContractAt("UniversalEscrowServiceV3SimplifiedNoDisputes", contractAddress);
  
  // Create escrow
  console.log("\nCreating escrow...");
  const depositAmount = hre.ethers.parseEther("0.0005"); // Small amount
  const seller = "0x2223F51659fAcC662504dcEbD4735886285ABC96";
  
  const tx = await escrow.createEscrow(
    seller,
    hre.ethers.ZeroAddress, // ETH
    depositAmount,
    hre.ethers.ZeroAddress, // ETH
    chainId,
    { value: depositAmount, gasLimit: 300000 }
  );
  
  console.log("Transaction sent:", tx.hash);
  const receipt = await tx.wait();
  console.log("✅ Escrow created!");
  console.log("Gas used:", receipt.gasUsed.toString());
  
  // Get escrow ID from events
  const event = receipt.logs.find(log => {
    try {
      const parsed = escrow.interface.parseLog(log);
      return parsed && parsed.name === "EscrowCreated";
    } catch (e) {
      return false;
    }
  });
  
  if (event) {
    const parsed = escrow.interface.parseLog(event);
    console.log("\nEscrow Details:");
    console.log("- ID:", parsed.args.escrowId);
    console.log("- Deposit:", hre.ethers.formatEther(parsed.args.depositAmount), "ETH");
    console.log("- Service Fee:", hre.ethers.formatEther(parsed.args.serviceFee), "ETH");
    console.log("- Net Amount:", hre.ethers.formatEther(parsed.args.netAmount), "ETH");
    
    // Now update condition
    console.log("\nUpdating condition...");
    const tx2 = await escrow.updateCondition(parsed.args.escrowId, true, { gasLimit: 100000 });
    await tx2.wait();
    console.log("✅ Condition updated!");
    
    // Release escrow
    console.log("\nReleasing escrow...");
    const tx3 = await escrow.releaseEscrow(parsed.args.escrowId, { gasLimit: 200000 });
    const receipt3 = await tx3.wait();
    console.log("✅ Escrow released!");
    console.log("Transaction:", receipt3.hash);
    console.log(`\nView on Explorer: https://${chainId === 11155111n ? 'sepolia' : 'sepolia.arbiscan'}.etherscan.io/tx/${receipt3.hash}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });