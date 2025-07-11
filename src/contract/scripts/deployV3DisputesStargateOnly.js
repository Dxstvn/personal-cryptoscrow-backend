const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying UniversalEscrowServiceV3DisputesStargateOnly with account:", deployer.address);

  // Get network config
  const networkName = hre.network.name;
  const chainId = await hre.ethers.provider.getNetwork().then(n => n.chainId);
  console.log(`Deploying to ${networkName} (chainId: ${chainId})`);

  // Network-specific configurations
  const config = {
    sepolia: {
      serviceWallet: "0x28f9F5e0Ec9C6B8cdF1F3ad73847A094570c927D",
      weth: "0x097D90c9d3E0B50Ca60e1ae45F6A81010f9FB534",
      uniswapRouter: "0xC532a74256D3Db42D0Bf7a0400fEFDbad7694008",
      stargateRouter: "0x1715e8C2dD04e7Ad5Ef7Ef39148EED93DcAd85Ab",
      stargateRouterETH: "0x1715e8C2dD04e7Ad5Ef7Ef39148EED93DcAd85Ab"
    },
    arbitrumSepolia: {
      serviceWallet: "0x28f9F5e0Ec9C6B8cdF1F3ad73847A094570c927D",
      weth: "0xc556bAe1e86B2aE9c22eA5E036b07E55E7596074",
      uniswapRouter: "0x101F443B4d1b059569D643917553c771E1b9663E",
      stargateRouter: "0x3a0f940d031267AaA7f831E32ED583106c8C646B",
      stargateRouterETH: "0x3a0f940d031267AaA7f831E32ED583106c8C646B"
    },
    // Add mainnet configs when ready
    mainnet: {
      serviceWallet: process.env.SERVICE_WALLET_MAINNET,
      weth: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
      uniswapRouter: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
      stargateRouter: "0xFC38E5d27194530B6c6C6Efcce956B509046C2C1",
      stargateRouterETH: "0x2F6F07CDcf3588944Bf4C42aC74ff24bF56e7590"
    },
    arbitrumOne: {
      serviceWallet: process.env.SERVICE_WALLET_MAINNET,
      weth: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
      uniswapRouter: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
      stargateRouter: "0xFc7D8077C6d47d8BcfCa43cBd19C4ED09587CDb3",
      stargateRouterETH: "0x9D8D2f7f1e8F0c7f5a4b5C6D7E8F9A0B1C2D3E4F5"
    }
  };

  const currentConfig = config[networkName];
  if (!currentConfig) {
    throw new Error(`No configuration for network: ${networkName}`);
  }

  // Deploy the contract
  const UniversalEscrowServiceV3DisputesStargateOnly = await hre.ethers.getContractFactory("UniversalEscrowServiceV3DisputesStargateOnly");
  const escrow = await UniversalEscrowServiceV3DisputesStargateOnly.deploy(
    currentConfig.serviceWallet,
    currentConfig.weth,
    currentConfig.uniswapRouter,
    currentConfig.stargateRouter,
    currentConfig.stargateRouterETH
  );

  await escrow.waitForDeployment();
  const escrowAddress = await escrow.getAddress();

  console.log("\n✅ UniversalEscrowServiceV3DisputesStargateOnly deployed to:", escrowAddress);
  console.log("\nConfiguration:");
  console.log("- Service Wallet:", currentConfig.serviceWallet);
  console.log("- WETH:", currentConfig.weth);
  console.log("- Uniswap Router:", currentConfig.uniswapRouter);
  console.log("- Stargate Router:", currentConfig.stargateRouter);
  console.log("- Stargate Router ETH:", currentConfig.stargateRouterETH);

  // Configure supported chains and tokens
  console.log("\nConfiguring supported chains and tokens...");
  
  if (networkName === "sepolia" || networkName === "arbitrumSepolia") {
    // Configure Sepolia <-> Arbitrum Sepolia
    const SEPOLIA_CHAIN_ID = 11155111;
    const ARBITRUM_SEPOLIA_CHAIN_ID = 421614;
    const USDC_SEPOLIA = "0x6f14C02Fc1F78322cFd7d707aB90f18baD3B54f5";
    const USDC_ARBITRUM = "0x460b97BD498E1157530AEb3086301d5225b91216";

    if (chainId === BigInt(SEPOLIA_CHAIN_ID)) {
      // On Sepolia, configure Arbitrum as target
      await escrow.configureStargateChain(ARBITRUM_SEPOLIA_CHAIN_ID, 10267);
      await escrow.configureToken(ARBITRUM_SEPOLIA_CHAIN_ID, USDC_ARBITRUM, 1, true); // Pool ID 1 for USDC
      console.log("✅ Configured Arbitrum Sepolia as target chain");
    } else if (chainId === BigInt(ARBITRUM_SEPOLIA_CHAIN_ID)) {
      // On Arbitrum, configure Sepolia as target
      await escrow.configureStargateChain(SEPOLIA_CHAIN_ID, 10161);
      await escrow.configureToken(SEPOLIA_CHAIN_ID, USDC_SEPOLIA, 1, true); // Pool ID 1 for USDC
      console.log("✅ Configured Sepolia as target chain");
    }
  }

  console.log("\n🎉 Deployment complete!");
  console.log("\nTo verify the contract, run:");
  console.log(`npx hardhat verify --network ${networkName} ${escrowAddress} ${currentConfig.serviceWallet} ${currentConfig.weth} ${currentConfig.uniswapRouter} ${currentConfig.stargateRouter} ${currentConfig.stargateRouterETH}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });