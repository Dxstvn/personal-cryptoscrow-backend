const hre = require("hardhat");
require('dotenv').config();

// Contract addresses from deployment
const CONTRACTS = {
  11155111: "0xc13aEB9510213DCC5f0C82a9deCf0F9f8607Dc61", // Sepolia
  421614: "0x706D2Eb63a1c9f4F89DFe6c36293b4253229f6F0"    // Arbitrum Sepolia
};

async function main() {
  console.log("Starting transaction tests on simplified escrow contract...\n");
  
  const [deployer] = await hre.ethers.getSigners();
  const buyer = deployer; // Using deployer as buyer
  const seller = "0x2223F51659fAcC662504dcEbD4735886285ABC96"; // Backend wallet as seller
  
  const chainId = (await hre.ethers.provider.getNetwork()).chainId;
  const contractAddress = CONTRACTS[chainId];
  
  if (!contractAddress) {
    throw new Error(`No contract deployed on chain ${chainId}`);
  }
  
  console.log("Network:", chainId === 11155111n ? "Sepolia" : "Arbitrum Sepolia");
  console.log("Contract:", contractAddress);
  console.log("Buyer:", buyer.address);
  console.log("Seller:", seller);
  console.log("Balance:", hre.ethers.formatEther(await hre.ethers.provider.getBalance(buyer.address)), "ETH\n");
  
  const escrow = await hre.ethers.getContractAt("UniversalEscrowServiceV3SimplifiedNoDisputes", contractAddress);
  
  // Test 1: Direct ETH Transfer (same chain, same token)
  console.log("=== Test 1: Direct ETH Transfer ===");
  try {
    const depositAmount = hre.ethers.parseEther("0.001");
    
    console.log("Creating escrow for 0.001 ETH...");
    const tx1 = await escrow.createEscrow(
      seller,
      hre.ethers.ZeroAddress, // ETH
      depositAmount,
      hre.ethers.ZeroAddress, // ETH
      chainId,
      { value: depositAmount }
    );
    
    const receipt1 = await tx1.wait();
    console.log("✅ Escrow created:", receipt1.hash);
    
    // Get escrow ID from events
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
    
    // Update condition (simulating backend approval)
    console.log("\nUpdating condition to met...");
    const tx2 = await escrow.updateCondition(escrowId, true);
    await tx2.wait();
    console.log("✅ Condition updated");
    
    // Release escrow
    console.log("\nReleasing escrow...");
    const sellerBalanceBefore = await hre.ethers.provider.getBalance(seller);
    const tx3 = await escrow.releaseEscrow(escrowId);
    const receipt3 = await tx3.wait();
    const sellerBalanceAfter = await hre.ethers.provider.getBalance(seller);
    
    console.log("✅ Escrow released:", receipt3.hash);
    console.log("Seller received:", hre.ethers.formatEther(sellerBalanceAfter - sellerBalanceBefore), "ETH");
    console.log("View on Explorer: https://sepolia.etherscan.io/tx/" + receipt3.hash);
    
  } catch (error) {
    console.error("❌ Test 1 failed:", error.message);
  }
  
  // Test 2: Token Swap (ETH to USDC) - Only on Sepolia
  if (chainId === 11155111n) {
    console.log("\n=== Test 2: Token Swap (ETH to USDC) ===");
    try {
      const depositAmount = hre.ethers.parseEther("0.001");
      const usdcAddress = "0x97e5D10FB0fb3B07540dB36FA96673248896f1f8";
      
      console.log("Creating escrow for ETH -> USDC swap...");
      const tx1 = await escrow.createEscrow(
        seller,
        hre.ethers.ZeroAddress, // ETH
        depositAmount,
        usdcAddress, // USDC
        chainId,
        { value: depositAmount }
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
      
      // Update condition and release
      console.log("\nUpdating condition and releasing...");
      await escrow.updateCondition(escrowId, true);
      
      const tx3 = await escrow.releaseEscrow(escrowId);
      const receipt3 = await tx3.wait();
      
      console.log("✅ Swap completed:", receipt3.hash);
      console.log("View on Explorer: https://sepolia.etherscan.io/tx/" + receipt3.hash);
      
    } catch (error) {
      console.error("❌ Test 2 failed:", error.message);
    }
  }
  
  // Test 3: Cross-chain Transfer (Sepolia to Arbitrum)
  if (chainId === 11155111n) {
    console.log("\n=== Test 3: Cross-chain Transfer (Sepolia to Arbitrum) ===");
    try {
      const depositAmount = hre.ethers.parseEther("0.001");
      const targetChainId = 421614; // Arbitrum Sepolia
      
      // First get fee quote
      console.log("Getting Stargate fee quote...");
      const quote = await escrow.getStargateQuote(
        targetChainId,
        hre.ethers.ZeroAddress, // ETH
        depositAmount
      );
      console.log("Cross-chain fee:", hre.ethers.formatEther(quote.fee), "ETH");
      
      console.log("\nCreating cross-chain escrow...");
      const tx1 = await escrow.createEscrow(
        seller,
        hre.ethers.ZeroAddress, // ETH
        depositAmount,
        hre.ethers.ZeroAddress, // ETH on Arbitrum
        targetChainId,
        { value: depositAmount }
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
      
      // Update condition and release with fee
      console.log("\nUpdating condition and releasing cross-chain...");
      await escrow.updateCondition(escrowId, true);
      
      const tx3 = await escrow.releaseEscrow(escrowId, { value: quote.fee });
      const receipt3 = await tx3.wait();
      
      // Find Stargate event
      const stargateEvent = receipt3.logs.find(log => {
        try {
          const parsed = escrow.interface.parseLog(log);
          return parsed && parsed.name === "StargateTransferInitiated";
        } catch (e) {
          return false;
        }
      });
      
      if (stargateEvent) {
        console.log("✅ Cross-chain transfer initiated:", receipt3.hash);
        console.log("View on Explorer: https://sepolia.etherscan.io/tx/" + receipt3.hash);
        console.log("\n⏳ Funds will arrive on Arbitrum in ~1-2 minutes");
        console.log("Check destination: https://sepolia.arbiscan.io/address/" + seller);
      }
      
    } catch (error) {
      console.error("❌ Test 3 failed:", error.message);
    }
  }
  
  console.log("\n✅ All tests completed!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });