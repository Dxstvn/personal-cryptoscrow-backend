const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const network = hre.network.name;
  console.log(`\n=== DEPLOYING V3 ON ${network.toUpperCase()} ===\n`);
  
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer:", deployer.address);
  
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Balance:", hre.ethers.formatEther(balance), "ETH");
  
  // Network configurations
  const configs = {
    "sepolia": {
      weth: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14",
      uniswapRouter: "0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E", // V3 router
      serviceWallet: "0x5aCbf4d8bb1aFF71fa49EaE2CCf686Fe534De039",
      oftAdapter: "0xb3dd252bfc2c3d822f7F0f550Df576a9CC928Bf4",
      composer: "0x3e6d2247055683d53a16Fc935E24D30065a6DB05",
      chainMappings: [
        { chain: 11155111, endpoint: 40161, name: "Sepolia" },
        { chain: 80002, endpoint: 40267, name: "Polygon Amoy" },
        { chain: 421614, endpoint: 40231, name: "Arbitrum Sepolia" }
      ]
    },
    "polygon-amoy": {
      weth: "0x360ad4f9a9A8EFe9A8DCB5f461c4Cc1047E1Dcf9", // WPOL on Polygon
      uniswapRouter: "0x8954AfA98594b838bda56FE4C12a09D7739D179b",
      serviceWallet: "0x5aCbf4d8bb1aFF71fa49EaE2CCf686Fe534De039",
      oftAdapter: "0x746EF3c4C9c3f779Bc3558A5FF55C3f34ae20725",
      composer: "0xeE455345205F0Ab563f67307bF37E618180da05c",
      chainMappings: [
        { chain: 11155111, endpoint: 40161, name: "Sepolia" },
        { chain: 80002, endpoint: 40267, name: "Polygon Amoy" },
        { chain: 421614, endpoint: 40231, name: "Arbitrum Sepolia" }
      ]
    }
  };
  
  const config = configs[network];
  if (!config) {
    console.error(`No configuration for network: ${network}`);
    console.log("Available networks:", Object.keys(configs).join(", "));
    return;
  }
  
  // Deploy V3
  console.log("\n📦 Deploying UniversalEscrowServiceV3...");
  const EscrowV3 = await hre.ethers.getContractFactory("UniversalEscrowServiceV3");
  const escrow = await EscrowV3.deploy(
    config.serviceWallet,
    config.weth,
    config.uniswapRouter
  );
  
  await escrow.waitForDeployment();
  console.log("✅ V3 deployed to:", escrow.target);
  
  // Configure OFT adapters for all chains
  console.log("\n🔧 Configuring OFT adapters...");
  
  // Configure based on current network
  if (network === "sepolia") {
    // On Sepolia, configure adapters for other chains
    await escrow.setOFTAdapter(40267, config.oftAdapter, "Polygon Amoy"); // Use local adapter
    await escrow.setOFTAdapter(40231, config.oftAdapter, "Arbitrum Sepolia"); // Use local adapter
    console.log("✅ Configured for sending to Polygon and Arbitrum");
  } else if (network === "polygon-amoy") {
    // On Polygon, configure adapters for other chains
    await escrow.setOFTAdapter(40161, config.oftAdapter, "Sepolia"); // Use local adapter
    await escrow.setOFTAdapter(40231, config.oftAdapter, "Arbitrum Sepolia"); // Use local adapter
    console.log("✅ Configured for sending to Sepolia and Arbitrum");
  }
  
  // Configure composers (these are on destination chains)
  console.log("\n🔧 Configuring composers...");
  await escrow.setSwapComposer(40161, "0x3e6d2247055683d53a16Fc935E24D30065a6DB05"); // Sepolia composer
  await escrow.setSwapComposer(40267, "0xeE455345205F0Ab563f67307bF37E618180da05c"); // Polygon composer
  await escrow.setSwapComposer(40231, "0x0000000000000000000000000000000000000000"); // No composer on Arbitrum yet
  console.log("✅ Composers configured");
  
  // Authorize escrow on OFT adapter
  console.log("\n🔐 Authorizing escrow on OFT adapter...");
  try {
    const oftAdapter = await hre.ethers.getContractAt(
      "SimplePropertyOFTAdapter",
      config.oftAdapter
    );
    
    const authTx = await oftAdapter.setDelegate(escrow.target);
    await authTx.wait();
    console.log("✅ Escrow authorized as delegate");
  } catch (error) {
    console.log("⚠️  Could not authorize (might not be owner):", error.message);
  }
  
  // Save deployment
  const deployment = {
    network,
    address: escrow.target,
    version: "V3",
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    serviceWallet: config.serviceWallet,
    weth: config.weth,
    uniswapRouter: config.uniswapRouter,
    oftAdapter: config.oftAdapter,
    composer: config.composer,
    chainMappings: config.chainMappings,
    notes: [
      "Chain ID to endpoint ID mapping implemented",
      "Fixed parameter initialization (composeMsg, oftCmd)",
      "Pass exact fee.nativeFee to OFT adapter",
      "Requires 2-3x fee buffer for quote variance"
    ]
  };
  
  const deploymentPath = path.join(__dirname, "..", "..", "deployments", `escrow-v3-${network}.json`);
  fs.writeFileSync(deploymentPath, JSON.stringify(deployment, null, 2));
  console.log("\n💾 Deployment saved to:", deploymentPath);
  
  console.log("\n✅ V3 Deployment Complete on", network);
  console.log("Contract:", escrow.target);
  
  console.log("\n📋 Summary:");
  console.log("- Service wallet:", config.serviceWallet);
  console.log("- WETH:", config.weth);
  console.log("- Router:", config.uniswapRouter);
  console.log("- OFT Adapter:", config.oftAdapter);
  console.log("- Composer:", config.composer);
  
  console.log("\n🚀 Next steps:");
  console.log("1. Fund the contract with native token for gas");
  console.log("2. Test cross-chain transfers with 3x fee buffer");
  console.log("3. Test compose functionality for auto-swaps");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });