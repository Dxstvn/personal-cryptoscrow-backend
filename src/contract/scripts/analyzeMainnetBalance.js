const { ethers } = require("ethers");
require('dotenv').config();

async function main() {
  console.log("Analyzing mainnet balance and costs...\n");
  
  // Use Infura mainnet
  const provider = new ethers.JsonRpcProvider("https://mainnet.infura.io/v3/4af9a8307a914da58937e8da53c602f9");
  
  // Create wallet from private key
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY || process.env.SEPOLIA_PRIVATE_KEY;
  const wallet = new ethers.Wallet(privateKey, provider);
  
  console.log("Wallet Address:", wallet.address);
  
  // Get balance
  const balance = await provider.getBalance(wallet.address);
  console.log("Balance:", ethers.formatEther(balance), "ETH");
  console.log("Balance (wei):", balance.toString());
  
  // Get current gas price
  const feeData = await provider.getFeeData();
  const gasPrice = feeData.gasPrice;
  console.log("\nCurrent Gas Price:", ethers.formatUnits(gasPrice, "gwei"), "gwei");
  
  // Estimate costs for different operations
  const estimates = {
    "Contract Deployment": 3000000n,
    "Create Escrow": 250000n,
    "Update Condition": 100000n,
    "Release (Direct)": 200000n,
    "Release (With Swap)": 400000n,
    "Cross-chain Release": 500000n
  };
  
  console.log("\nEstimated Costs:");
  let totalGas = 0n;
  for (const [operation, gas] of Object.entries(estimates)) {
    const cost = gas * gasPrice;
    console.log(`${operation}: ${ethers.formatEther(cost)} ETH (${gas} gas)`);
    if (operation !== "Contract Deployment") {
      totalGas += gas;
    }
  }
  
  // Calculate test scenarios
  console.log("\n📊 Test Scenarios:");
  
  // Scenario 1: Direct transfer test
  const directTest = (estimates["Create Escrow"] + estimates["Update Condition"] + estimates["Release (Direct)"]) * gasPrice;
  console.log("1. Direct ETH Transfer: ", ethers.formatEther(directTest), "ETH");
  
  // Scenario 2: Token swap test
  const swapTest = (estimates["Create Escrow"] + estimates["Update Condition"] + estimates["Release (With Swap)"]) * gasPrice;
  console.log("2. ETH to USDC Swap: ", ethers.formatEther(swapTest), "ETH");
  
  // Scenario 3: Cross-chain test
  const crossChainTest = (estimates["Create Escrow"] + estimates["Update Condition"] + estimates["Cross-chain Release"]) * gasPrice;
  const stargateFee = ethers.parseEther("0.001"); // Estimated Stargate fee
  console.log("3. Cross-chain Transfer: ", ethers.formatEther(crossChainTest + stargateFee), "ETH (includes ~0.001 ETH Stargate fee)");
  
  // Total costs
  const deploymentCost = estimates["Contract Deployment"] * gasPrice;
  const allTestsCost = directTest + swapTest + crossChainTest + stargateFee;
  const testDeposits = ethers.parseEther("0.0003"); // 0.0001 ETH per test
  
  console.log("\n💰 Total Costs:");
  console.log("Deployment:", ethers.formatEther(deploymentCost), "ETH");
  console.log("All Tests:", ethers.formatEther(allTestsCost), "ETH");
  console.log("Test Deposits:", ethers.formatEther(testDeposits), "ETH");
  console.log("Grand Total:", ethers.formatEther(deploymentCost + allTestsCost + testDeposits), "ETH");
  
  // Check if balance is sufficient
  const totalNeeded = deploymentCost + allTestsCost + testDeposits;
  const buffer = totalNeeded / 5n; // 20% buffer
  const totalWithBuffer = totalNeeded + buffer;
  
  console.log("\n🎯 Feasibility:");
  console.log("Current Balance:", ethers.formatEther(balance), "ETH");
  console.log("Minimum Needed:", ethers.formatEther(totalNeeded), "ETH");
  console.log("With 20% Buffer:", ethers.formatEther(totalWithBuffer), "ETH");
  
  if (balance >= totalWithBuffer) {
    console.log("\n✅ You have enough ETH for full mainnet testing!");
  } else if (balance >= totalNeeded) {
    console.log("\n⚠️  You have just enough ETH, but no buffer for gas spikes");
  } else {
    const shortage = totalNeeded - balance;
    console.log("\n❌ Insufficient ETH. Short by:", ethers.formatEther(shortage), "ETH");
    
    // Check what we can do
    console.log("\n💡 What you CAN do with current balance:");
    if (balance >= directTest + ethers.parseEther("0.0001")) {
      console.log("✓ Direct ETH transfer test");
    }
    if (balance >= swapTest + ethers.parseEther("0.0001")) {
      console.log("✓ Token swap test (if no deployment needed)");
    }
    if (balance >= crossChainTest + stargateFee + ethers.parseEther("0.0001")) {
      console.log("✓ Cross-chain test (if no deployment needed)");
    }
  }
  
  // Mainnet contract addresses
  console.log("\n📍 Mainnet Addresses:");
  console.log("WETH:", "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2");
  console.log("USDC:", "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");
  console.log("Uniswap V2:", "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D");
  console.log("Stargate Router:", "0x8731d54E9D02c286767d56ac03e8037C07e01e98");
  console.log("Stargate ETH Router:", "0x150f94B44927F078737562f0fcF3C95c01Cc2376");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });