const hre = require("hardhat");

async function main() {
  const network = hre.network.name;
  console.log(`\nChecking Uniswap router configuration on ${network}...`);

  // Get all deployed composer addresses
  const composers = {
    sepolia: "0x3e6d2247055683d53a16Fc935E24D30065a6DB05",
    "polygon-amoy": "0xeE455345205F0Ab563f67307bF37E618180da05c",
    "arbitrum-sepolia": "0x8f65178A3281d72E1F50FA9E01D8B3884229ddC8"
  };

  const composerAddress = composers[network];
  if (!composerAddress) {
    console.error(`No composer deployed on ${network}`);
    return;
  }

  // Connect to composer contract
  const EscrowSwapComposer = await hre.ethers.getContractFactory("EscrowSwapComposer");
  const composer = EscrowSwapComposer.attach(composerAddress);

  // Get current router
  try {
    const currentRouter = await composer.uniswapV2Router();
    console.log(`\nCurrent Uniswap V2 Router: ${currentRouter}`);

    // Known Uniswap V2 routers
    const knownRouters = {
      sepolia: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
      "polygon-amoy": "0x8954AfA98594b838bda56FE4C12a09D7739D179b", // Mumbai V2 router (Amoy might use same)
      "arbitrum-sepolia": "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D" // Same as mainnet pattern
    };

    const expectedRouter = knownRouters[network];
    if (expectedRouter) {
      console.log(`Expected Uniswap V2 Router: ${expectedRouter}`);
      
      if (currentRouter.toLowerCase() !== expectedRouter.toLowerCase()) {
        console.log("\n⚠️  Router mismatch detected!");
        console.log("The current router does not match the expected V2 router.");
      } else {
        console.log("\n✅ Router configuration is correct!");
      }
    }

    // Check WETH address
    const weth = await composer.WETH();
    console.log(`\nWETH address: ${weth}`);

  } catch (error) {
    console.error("Error reading composer configuration:", error.message);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });