const hre = require("hardhat");
require('dotenv').config();

async function main() {
  console.log("Checking mainnet testing feasibility...\n");
  
  const [deployer] = await hre.ethers.getSigners();
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  
  console.log("Deployer:", deployer.address);
  console.log("Balance:", hre.ethers.formatEther(balance), "ETH");
  
  // Current gas prices (approximate)
  const gasPrice = await hre.ethers.provider.getFeeData();
  console.log("\nCurrent Gas Price:", hre.ethers.formatUnits(gasPrice.gasPrice, "gwei"), "gwei");
  
  // Estimate costs
  const deployGas = 3000000n; // Contract deployment
  const createEscrowGas = 250000n; // Create escrow
  const updateConditionGas = 100000n; // Update condition
  const releaseGas = 200000n; // Release (direct transfer)
  const swapReleaseGas = 400000n; // Release with swap
  const crossChainGas = 500000n; // Cross-chain release
  
  // Calculate costs at current gas price
  const deploymentCost = deployGas * gasPrice.gasPrice;
  const directTransferCost = (createEscrowGas + updateConditionGas + releaseGas) * gasPrice.gasPrice;
  const swapCost = (createEscrowGas + updateConditionGas + swapReleaseGas) * gasPrice.gasPrice;
  const crossChainCost = (createEscrowGas + updateConditionGas + crossChainGas) * gasPrice.gasPrice;
  
  console.log("\nEstimated Costs:");
  console.log("1. Contract Deployment:", hre.ethers.formatEther(deploymentCost), "ETH");
  console.log("2. Direct Transfer Test:", hre.ethers.formatEther(directTransferCost), "ETH");
  console.log("3. Token Swap Test:", hre.ethers.formatEther(swapCost), "ETH");
  console.log("4. Cross-chain Test:", hre.ethers.formatEther(crossChainCost), "ETH");
  
  const totalForTests = directTransferCost + swapCost + crossChainCost;
  const totalWithDeployment = deploymentCost + totalForTests;
  
  console.log("\nTotal for Tests Only:", hre.ethers.formatEther(totalForTests), "ETH");
  console.log("Total with Deployment:", hre.ethers.formatEther(totalWithDeployment), "ETH");
  
  // Additional costs
  console.log("\nAdditional Costs to Consider:");
  console.log("- Stargate cross-chain fee: ~0.001-0.002 ETH");
  console.log("- Test deposit amounts: 0.0001 ETH per test");
  console.log("- Buffer for gas spikes: 20-30%");
  
  // Recommendation
  const balanceWei = BigInt(balance.toString());
  const minimumNeeded = totalWithDeployment + hre.ethers.parseEther("0.003"); // Add buffer
  
  console.log("\n📊 Recommendation:");
  console.log("Current Balance:", hre.ethers.formatEther(balance), "ETH");
  console.log("Minimum Needed:", hre.ethers.formatEther(minimumNeeded), "ETH");
  
  if (balanceWei >= minimumNeeded) {
    console.log("✅ You have enough ETH for testing!");
  } else {
    const shortage = minimumNeeded - balanceWei;
    console.log("❌ Insufficient ETH. Need", hre.ethers.formatEther(shortage), "more ETH");
    
    console.log("\n💡 Alternatives:");
    console.log("1. Test on existing testnet contracts (no deployment cost)");
    console.log("2. Use smaller test amounts (0.00001 ETH)");
    console.log("3. Skip cross-chain test (most expensive)");
    console.log("4. Test only direct transfer (cheapest)");
  }
  
  // Mainnet addresses
  console.log("\n📍 Mainnet Contract Addresses (if needed):");
  console.log("- WETH: 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2");
  console.log("- Uniswap V2 Router: 0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D");
  console.log("- USDC: 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");
  console.log("- Stargate Router: 0x8731d54E9D02c286767d56ac03e8037C07e01e98");
  console.log("- Stargate Router ETH: 0x150f94B44927F078737562f0fcF3C95c01Cc2376");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });