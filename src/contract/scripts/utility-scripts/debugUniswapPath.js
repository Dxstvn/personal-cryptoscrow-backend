const hre = require("hardhat");

async function main() {
  console.log("\n=== Debugging Uniswap Path Issue ===\n");
  
  const network = hre.network.name;
  console.log(`Network: ${network}`);
  
  // Known token addresses
  const tokens = {
    sepolia: {
      weth: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14",
      usdc: "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8"
    },
    "polygon-amoy": {
      weth: "0x360ad4f9a9A8EFe9A8DCB5f461c4Cc1047E1Dcf9",
      usdc: "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582"
    },
    "arbitrum-sepolia": {
      weth: "0x980B62Da83eFf3D4576C647993b0c1D7faf17c73",
      usdc: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d"
    }
  };
  
  const networkTokens = tokens[network];
  if (!networkTokens) {
    console.error(`No tokens configured for ${network}`);
    return;
  }
  
  console.log("\nToken Addresses:");
  console.log(`WETH: ${networkTokens.weth}`);
  console.log(`USDC: ${networkTokens.usdc}`);
  
  // Get Uniswap router
  const composers = {
    sepolia: "0x3e6d2247055683d53a16Fc935E24D30065a6DB05",
    "polygon-amoy": "0xeE455345205F0Ab563f67307bF37E618180da05c",
    "arbitrum-sepolia": "0x8f65178A3281d72E1F50FA9E01D8B3884229ddC8"
  };
  
  const composerAddress = composers[network];
  const EscrowSwapComposer = await hre.ethers.getContractFactory("EscrowSwapComposer");
  const composer = EscrowSwapComposer.attach(composerAddress);
  
  const router = await composer.uniswapV2Router();
  console.log(`\nUniswap V2 Router: ${router}`);
  
  // Check if router contract exists
  const routerCode = await hre.ethers.provider.getCode(router);
  console.log(`Router has code: ${routerCode.length > 2 ? "YES" : "NO"}`);
  
  // Try to check if tokens exist
  console.log("\nChecking token contracts:");
  
  for (const [name, address] of Object.entries(networkTokens)) {
    const code = await hre.ethers.provider.getCode(address);
    console.log(`${name.toUpperCase()} (${address}): ${code.length > 2 ? "✅ EXISTS" : "❌ NO CODE"}`);
    
    if (code.length > 2) {
      try {
        const token = await hre.ethers.getContractAt("IERC20", address);
        const symbol = await token.symbol();
        const decimals = await token.decimals();
        console.log(`  Symbol: ${symbol}, Decimals: ${decimals}`);
      } catch (e) {
        console.log(`  Could not read token info: ${e.message}`);
      }
    }
  }
  
  // Check if it's actually a Uniswap V2 router
  console.log("\nChecking router functions:");
  try {
    const IUniswapV2Router = await hre.ethers.getContractAt(
      ["function factory() view returns (address)", "function WETH() view returns (address)"],
      router
    );
    
    const factory = await IUniswapV2Router.factory();
    const weth = await IUniswapV2Router.WETH();
    
    console.log(`Factory: ${factory}`);
    console.log(`WETH: ${weth}`);
    
    if (weth.toLowerCase() !== networkTokens.weth.toLowerCase()) {
      console.log("\n⚠️  WARNING: Router WETH doesn't match expected WETH!");
      console.log(`Expected: ${networkTokens.weth}`);
      console.log(`Got: ${weth}`);
    }
  } catch (e) {
    console.log(`Could not read router info: ${e.message}`);
  }
  
  // Try to get a quote
  console.log("\n\nTrying to get swap quote for 0.001 ETH -> USDC:");
  try {
    const amountIn = hre.ethers.parseEther("0.001");
    const path = [networkTokens.weth, networkTokens.usdc];
    
    const IUniswapV2Router = await hre.ethers.getContractAt(
      ["function getAmountsOut(uint amountIn, address[] calldata path) external view returns (uint[] memory amounts)"],
      router
    );
    
    const amounts = await IUniswapV2Router.getAmountsOut(amountIn, path);
    console.log(`Expected output: ${amounts[1]} USDC`);
  } catch (e) {
    console.log(`❌ Failed to get quote: ${e.message}`);
    
    // Try to decode the error
    if (e.data) {
      try {
        const errorInterface = new hre.ethers.Interface([
          "error InsufficientLiquidity()",
          "error InvalidPath()"
        ]);
        const decodedError = errorInterface.parseError(e.data);
        console.log(`Decoded error: ${decodedError?.name || "Unknown"}`);
      } catch {}
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });