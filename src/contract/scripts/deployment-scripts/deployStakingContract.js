const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("\n=== DEPLOYING UNIVERSAL ESCROW SERVICE V3 WITH STAKING ===\n");
  
  const [deployer] = await hre.ethers.getSigners();
  const network = hre.network.name;
  
  console.log("Network:", network);
  console.log("Deployer:", deployer.address);
  
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Balance:", hre.ethers.formatEther(balance), "ETH");
  
  // Deploy parameters
  const params = {
    serviceWallet: deployer.address, // Use deployer as service wallet for testing
    weth: "0x0000000000000000000000000000000000000000", // Will be replaced with mock
    uniswapRouter: "0x0000000000000000000000000000000000000000" // Will be replaced with mock
  };
  
  // Deploy mock WETH if on localhost
  if (network === "localhost" || network === "hardhat") {
    console.log("\n📦 Deploying Mock WETH...");
    const MockWETH = await hre.ethers.getContractFactory("MockWETH");
    const weth = await MockWETH.deploy();
    await weth.waitForDeployment();
    params.weth = weth.target;
    console.log("✅ Mock WETH deployed to:", weth.target);
    
    // Deploy mock Uniswap Router
    console.log("\n📦 Deploying Mock Uniswap Router...");
    const MockRouter = await hre.ethers.getContractFactory("MockUniswapV2Router");
    const router = await MockRouter.deploy(params.weth);
    await router.waitForDeployment();
    params.uniswapRouter = router.target;
    console.log("✅ Mock Router deployed to:", router.target);
  }
  
  // Deploy Staking Contract
  console.log("\n📦 Deploying UniversalEscrowServiceV3DisputesStaking...");
  const StakingContract = await hre.ethers.getContractFactory("UniversalEscrowServiceV3DisputesStaking");
  const escrow = await StakingContract.deploy(
    params.serviceWallet,
    params.weth,
    params.uniswapRouter
  );
  
  await escrow.waitForDeployment();
  console.log("✅ Staking contract deployed to:", escrow.target);
  
  // Save deployment
  const deployment = {
    network,
    address: escrow.target,
    version: "V3DisputesStaking",
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    parameters: params,
    mockContracts: network === "localhost" ? {
      weth: params.weth,
      uniswapRouter: params.uniswapRouter
    } : undefined
  };
  
  const deploymentPath = path.join(__dirname, "..", "..", "deployments", `staking-contract-${network}.json`);
  fs.writeFileSync(deploymentPath, JSON.stringify(deployment, null, 2));
  console.log("\n💾 Deployment saved to:", deploymentPath);
  
  console.log("\n✅ Staking Contract Deployment Complete!");
  console.log("Contract:", escrow.target);
  console.log("\nDeployment details:");
  console.log("- Service Wallet:", params.serviceWallet);
  console.log("- WETH:", params.weth);
  console.log("- Uniswap Router:", params.uniswapRouter);
  
  return deployment;
}

// Export the deployment function for use in tests
if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { main };