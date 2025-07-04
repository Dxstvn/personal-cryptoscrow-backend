const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("\n=== DEPLOYING UNIVERSAL ESCROW SERVICE V3 ===\n");
  
  const [deployer] = await hre.ethers.getSigners();
  const network = hre.network.name;
  
  console.log("Network:", network);
  console.log("Deployer:", deployer.address);
  
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Balance:", hre.ethers.formatEther(balance), "ETH");
  
  // Network configurations
  const configs = {
    "arbitrum-sepolia": {
      weth: "0x980B62Da83eFf3D4576C647993b0c1D7faf17c73",
      uniswapRouter: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
      serviceWallet: "0x5aCbf4d8bb1aFF71fa49EaE2CCf686Fe534De039",
      oftAdapters: {
        40161: "0xbaa46938E3110187ED6a55EE139312b28c943d00", // To Sepolia
        40267: "0xbaa46938E3110187ED6a55EE139312b28c943d00"  // To Polygon
      },
      composers: {
        40161: "0x3e6d2247055683d53a16Fc935E24D30065a6DB05", // On Sepolia
        40267: "0xeE455345205F0Ab563f67307bF37E618180da05c"  // On Polygon
      }
    }
  };
  
  const config = configs[network];
  if (!config) {
    throw new Error(`No configuration for network: ${network}`);
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
  
  // Configure OFT adapters
  console.log("\n🔧 Configuring OFT adapters...");
  for (const [endpointId, adapter] of Object.entries(config.oftAdapters)) {
    const chainName = endpointId === "40161" ? "Sepolia" : "Polygon Amoy";
    const tx = await escrow.setOFTAdapter(endpointId, adapter, chainName);
    await tx.wait();
    console.log(`✅ Set ${chainName} adapter`);
  }
  
  // Configure composers
  console.log("\n🔧 Configuring composers...");
  for (const [endpointId, composer] of Object.entries(config.composers)) {
    const tx = await escrow.setSwapComposer(endpointId, composer);
    await tx.wait();
    console.log(`✅ Set composer for endpoint ${endpointId}`);
  }
  
  // Authorize escrow on OFT adapter
  console.log("\n🔐 Authorizing escrow on OFT adapter...");
  const oftAdapter = await hre.ethers.getContractAt(
    "SimplePropertyOFTAdapter",
    config.oftAdapters["40161"]
  );
  
  const authTx = await oftAdapter.setDelegate(escrow.target);
  await authTx.wait();
  console.log("✅ Escrow authorized as delegate");
  
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
    oftAdapters: config.oftAdapters,
    composers: config.composers,
    chainMappings: [
      { chain: 11155111, endpoint: 40161, name: "Sepolia" },
      { chain: 80002, endpoint: 40267, name: "Polygon Amoy" },
      { chain: 421614, endpoint: 40231, name: "Arbitrum Sepolia" }
    ],
    fixes: [
      "Fixed oftCmd parameter from empty string to '0x'",
      "Proper chain ID to endpoint ID mapping",
      "Correct fee handling for LayerZero"
    ]
  };
  
  const deploymentPath = path.join(__dirname, "..", "..", "deployments", `escrow-v3-${network}.json`);
  fs.writeFileSync(deploymentPath, JSON.stringify(deployment, null, 2));
  console.log("\n💾 Deployment saved to:", deploymentPath);
  
  console.log("\n✅ V3 Deployment Complete!");
  console.log("Contract:", escrow.target);
  console.log("\nNext steps:");
  console.log("1. Fund the contract with ETH for WETH conversions");
  console.log("2. Test cross-chain transfers with the fixed oftCmd parameter");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });