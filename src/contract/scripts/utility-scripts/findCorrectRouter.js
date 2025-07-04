const hre = require("hardhat");

async function main() {
  console.log("\n=== Finding Correct Router Addresses ===\n");
  
  const network = hre.network.name;
  console.log(`Network: ${network}`);
  
  // Known test network routers
  const testnetRouters = {
    sepolia: {
      // Uniswap V3 SwapRouter on Sepolia
      uniswapV3: "0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E",
      // Sepolia uses V3, not V2
      uniswapV2: null,
      // Alternative: Use a simple DEX or deploy our own
    },
    "polygon-amoy": {
      // Mumbai had this, Amoy might be different
      uniswapV2: "0x8954AfA98594b838bda56FE4C12a09D7739D179b",
      uniswapV3: null
    },
    "arbitrum-sepolia": {
      // Arbitrum Sepolia might use mainnet-like addresses
      uniswapV2: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
      uniswapV3: null
    }
  };
  
  const routers = testnetRouters[network];
  if (!routers) {
    console.error(`No known routers for ${network}`);
    return;
  }
  
  console.log("\nChecking routers:");
  
  for (const [name, address] of Object.entries(routers)) {
    if (!address) {
      console.log(`${name}: Not available on ${network}`);
      continue;
    }
    
    const code = await hre.ethers.provider.getCode(address);
    console.log(`${name} (${address}): ${code.length > 2 ? "✅ HAS CODE" : "❌ NO CODE"}`);
  }
  
  // For Sepolia, we need to use Uniswap V3
  if (network === "sepolia" && testnetRouters.sepolia.uniswapV3) {
    console.log("\n📝 Sepolia uses Uniswap V3, not V2");
    console.log("The EscrowSwapComposer needs to be updated to support V3 swaps");
    console.log("OR deploy a simple DEX contract for testing");
    
    // Check if V3 router exists
    const v3Address = testnetRouters.sepolia.uniswapV3;
    const v3Code = await hre.ethers.provider.getCode(v3Address);
    
    if (v3Code.length > 2) {
      console.log("\n✅ Uniswap V3 SwapRouter is deployed on Sepolia");
      console.log("Address:", v3Address);
      
      // Update composer to use V3
      const composers = {
        sepolia: "0x3e6d2247055683d53a16Fc935E24D30065a6DB05"
      };
      
      const composerAddress = composers[network];
      if (composerAddress) {
        console.log("\n🔧 Recommendation: Update composer to use V3 router");
        console.log(`Composer address: ${composerAddress}`);
        console.log(`V3 Router: ${v3Address}`);
      }
    }
  }
  
  // Alternative solution
  console.log("\n💡 Alternative Solutions:");
  console.log("1. Deploy a simple DEX contract for testing");
  console.log("2. Use only cross-chain transfers (no same-chain swaps)");
  console.log("3. Update EscrowSwapComposer to support V3 on Sepolia");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });