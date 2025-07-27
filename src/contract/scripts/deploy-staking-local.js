const hre = require("hardhat");

async function main() {
  console.log("Deploying UniversalEscrowServiceV3DisputesStaking to local Hardhat network...");

  // Get deployer account
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying contracts with the account:", deployer.address);

  // Deploy mock tokens first
  const MockERC20 = await hre.ethers.getContractFactory("MockERC20");
  const mockUSDC = await MockERC20.deploy("Mock USDC", "USDC", 6);
  await mockUSDC.waitForDeployment();
  const mockUSDCAddress = await mockUSDC.getAddress();
  console.log("Mock USDC deployed to:", mockUSDCAddress);

  const mockWETH = await MockERC20.deploy("Wrapped Ether", "WETH", 18);
  await mockWETH.waitForDeployment();
  const mockWETHAddress = await mockWETH.getAddress();
  console.log("Mock WETH deployed to:", mockWETHAddress);

  // Deploy mock Uniswap router
  const MockUniswapRouter = await hre.ethers.getContractFactory("MockUniswapV2Router");
  const mockRouter = await MockUniswapRouter.deploy(mockWETHAddress);
  await mockRouter.waitForDeployment();
  const mockRouterAddress = await mockRouter.getAddress();
  console.log("Mock Uniswap Router deployed to:", mockRouterAddress);

  // Deploy the staking contract
  const UniversalEscrowServiceV3DisputesStaking = await hre.ethers.getContractFactory("UniversalEscrowServiceV3DisputesStaking");
  const escrowContract = await UniversalEscrowServiceV3DisputesStaking.deploy(
    deployer.address, // service wallet
    mockWETHAddress, // WETH address
    mockRouterAddress // Uniswap router address
  );

  await escrowContract.waitForDeployment();
  const escrowContractAddress = await escrowContract.getAddress();

  console.log("UniversalEscrowServiceV3DisputesStaking deployed to:", escrowContractAddress);

  // Save deployment info
  const deploymentInfo = {
    network: "localhost",
    contracts: {
      escrowStaking: escrowContractAddress,
      mockUSDC: mockUSDCAddress,
      mockWETH: mockWETHAddress,
      mockRouter: mockRouterAddress
    },
    deployer: deployer.address,
    timestamp: new Date().toISOString()
  };

  const fs = require("fs");
  fs.writeFileSync(
    "deployment-localhost-staking.json",
    JSON.stringify(deploymentInfo, null, 2)
  );

  console.log("\nDeployment complete! Info saved to deployment-localhost-staking.json");
  console.log("\nContract addresses:");
  console.log("- Escrow Staking:", escrowContractAddress);
  console.log("- Mock USDC:", mockUSDCAddress);
  console.log("- Mock WETH:", mockWETHAddress);
  console.log("- Mock Router:", mockRouterAddress);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });