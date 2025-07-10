const hre = require("hardhat");
require('dotenv').config();

async function main() {
  console.log("Deploying UniversalEscrowServiceV3SimplifiedNoDisputes...");
  
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with account:", deployer.address);
  
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", hre.ethers.formatEther(balance), "ETH");
  
  // Network-specific configurations
  const networkConfig = {
    11155111: { // Sepolia
      name: "Sepolia",
      weth: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14",
      uniswapRouter: "0xC532a74256D3Db42D0Bf7a0400fEFDbad7694008",
      serviceWallet: process.env.BACKEND_WALLET_ADDRESS || deployer.address
    },
    421614: { // Arbitrum Sepolia
      name: "Arbitrum Sepolia",
      weth: "0x980B62Da83eFf3D4576C647993b0c1D7faf17c73",
      uniswapRouter: "0x101F443B4d1b059569D643917553c771E1b9663E",
      serviceWallet: process.env.BACKEND_WALLET_ADDRESS || deployer.address
    }
  };
  
  const chainId = (await hre.ethers.provider.getNetwork()).chainId;
  const config = networkConfig[chainId];
  
  if (!config) {
    throw new Error(`Unsupported network: ${chainId}`);
  }
  
  console.log(`\nDeploying on ${config.name} (Chain ID: ${chainId})`);
  console.log("Configuration:");
  console.log("- WETH:", config.weth);
  console.log("- Uniswap Router:", config.uniswapRouter);
  console.log("- Service Wallet:", config.serviceWallet);
  
  // Deploy contract
  const UniversalEscrowServiceV3SimplifiedNoDisputes = await hre.ethers.getContractFactory("UniversalEscrowServiceV3SimplifiedNoDisputes");
  const escrow = await UniversalEscrowServiceV3SimplifiedNoDisputes.deploy(
    config.serviceWallet,
    config.weth,
    config.uniswapRouter
  );
  
  await escrow.waitForDeployment();
  const escrowAddress = await escrow.getAddress();
  
  console.log("\n✅ UniversalEscrowServiceV3SimplifiedNoDisputes deployed to:", escrowAddress);
  
  // Set backend wallet as condition updater
  console.log("\nSetting up roles...");
  const backendWallet = process.env.BACKEND_WALLET_ADDRESS;
  if (backendWallet && backendWallet !== deployer.address) {
    await escrow.setConditionUpdater(backendWallet, true);
    console.log("✅ Backend wallet set as condition updater:", backendWallet);
  }
  
  // Verify Stargate configuration
  console.log("\nVerifying Stargate configuration...");
  const stargateChainId = await escrow.chainIdToStargateId(chainId);
  const stargateRouter = await escrow.stargateRouters(chainId);
  const stargateRouterETH = await escrow.stargateRouterETHs(chainId);
  
  console.log("- Stargate Chain ID:", stargateChainId.toString());
  console.log("- Stargate Router:", stargateRouter);
  console.log("- Stargate RouterETH:", stargateRouterETH);
  
  // Check ETH configuration
  const ethConfig = await escrow.tokenConfigs(chainId, hre.ethers.ZeroAddress);
  console.log("\nETH Configuration:");
  console.log("- Pool ID:", ethConfig.poolId.toString());
  console.log("- Is Native:", ethConfig.isNative);
  console.log("- Supported:", ethConfig.supported);
  
  // Check USDC configuration
  const usdcAddress = chainId === 11155111 
    ? "0x97e5D10Fb0Fb3B07540DB36FA96673248896f1F8"
    : "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d";
    
  const usdcConfig = await escrow.tokenConfigs(chainId, usdcAddress);
  console.log("\nUSDC Configuration:");
  console.log("- Address:", usdcAddress);
  console.log("- Pool ID:", usdcConfig.poolId.toString());
  console.log("- Is Native:", usdcConfig.isNative);
  console.log("- Supported:", usdcConfig.supported);
  
  console.log("\n🎉 Deployment complete!");
  console.log("\nContract Address:", escrowAddress);
  console.log(`View on Explorer: https://${chainId === 11155111 ? 'sepolia.' : 'sepolia.arbiscan.'}etherscan.io/address/${escrowAddress}`);
  
  // Save deployment info
  const fs = require('fs');
  const deploymentInfo = {
    network: config.name,
    chainId: chainId.toString(),
    contractAddress: escrowAddress,
    deployedAt: new Date().toISOString(),
    configuration: {
      serviceWallet: config.serviceWallet,
      weth: config.weth,
      uniswapRouter: config.uniswapRouter,
      stargateChainId: stargateChainId.toString(),
      stargateRouter: stargateRouter,
      stargateRouterETH: stargateRouterETH
    }
  };
  
  const filename = `deployment-${config.name.toLowerCase().replace(' ', '-')}-${Date.now()}.json`;
  fs.writeFileSync(filename, JSON.stringify(deploymentInfo, null, 2));
  console.log(`\nDeployment info saved to: ${filename}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });