const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("\n=== DEPLOYING UNIVERSAL ESCROW SERVICE V2 ===\n");
  
  const [deployer] = await hre.ethers.getSigners();
  const network = hre.network.name;
  
  console.log("Network:", network);
  console.log("Deployer:", deployer.address);
  
  // Get current balance
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Balance:", hre.ethers.formatEther(balance), "\n");
  
  // Network configurations
  const configs = {
    "sepolia": {
      serviceWallet: "0x5aCbf4d8bb1aFF71fa49EaE2CCf686Fe534De039",
      weth: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14",
      uniswapRouter: "0x0000000000000000000000000000000000000000", // No V2 on Sepolia
      oftAdapters: {
        40267: "0x746EF3c4C9c3f779Bc3558A5FF55C3f34ae20725", // Polygon
        40231: "0xbaa46938E3110187ED6a55EE139312b28c943d00"  // Arbitrum
      },
      composers: {
        40267: "0xeE455345205F0Ab563f67307bF37E618180da05c", // Polygon
        40231: "0x8f65178A3281d72E1F50FA9E01D8B3884229ddC8"  // Arbitrum
      }
    },
    "polygon-amoy": {
      serviceWallet: "0x5aCbf4d8bb1aFF71fa49EaE2CCf686Fe534De039",
      weth: "0x360ad4f9a9A8ECB5f461c4Cc1047E1Dcf9",
      uniswapRouter: "0x8954AfA98594b838bda56FE4C12a09D7739D179b",
      oftAdapters: {
        40161: "0xb3dd252bfc2c3d822f7F0f550Df576a9CC928Bf4", // Sepolia
        40231: "0xbaa46938E3110187ED6a55EE139312b28c943d00"  // Arbitrum
      },
      composers: {
        40161: "0x3e6d2247055683d53a16Fc935E24D30065a6DB05", // Sepolia
        40231: "0x8f65178A3281d72E1F50FA9E01D8B3884229ddC8"  // Arbitrum
      }
    },
    "arbitrum-sepolia": {
      serviceWallet: "0x5aCbf4d8bb1aFF71fa49EaE2CCf686Fe534De039",
      weth: "0x980B62Da83eFf3D4576C647993b0c1D7faf17c73",
      uniswapRouter: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
      oftAdapters: {
        40161: "0xb3dd252bfc2c3d822f7F0f550Df576a9CC928Bf4", // Sepolia
        40267: "0x746EF3c4C9c3f779Bc3558A5FF55C3f34ae20725"  // Polygon
      },
      composers: {
        40161: "0x3e6d2247055683d53a16Fc935E24D30065a6DB05", // Sepolia
        40267: "0xeE455345205F0Ab563f67307bF37E618180da05c"  // Polygon
      }
    }
  };
  
  const config = configs[network];
  if (!config) {
    console.error("Network not configured");
    return;
  }
  
  // Deploy the contract
  console.log("📝 Deploying UniversalEscrowServiceV2...");
  console.log("Service Wallet:", config.serviceWallet);
  console.log("WETH:", config.weth);
  console.log("Router:", config.uniswapRouter || "Not configured");
  
  const UniversalEscrowServiceV2 = await hre.ethers.getContractFactory("UniversalEscrowServiceV2");
  const escrow = await UniversalEscrowServiceV2.deploy(
    config.serviceWallet,
    config.weth,
    config.uniswapRouter || hre.ethers.ZeroAddress
  );
  
  await escrow.waitForDeployment();
  const escrowAddress = await escrow.getAddress();
  
  console.log("✅ Deployed to:", escrowAddress);
  
  // Configure OFT adapters
  console.log("\n🔧 Configuring OFT adapters...");
  for (const [endpointId, adapter] of Object.entries(config.oftAdapters)) {
    const chainName = endpointId === "40161" ? "Sepolia" : 
                     endpointId === "40267" ? "Polygon" : 
                     endpointId === "40231" ? "Arbitrum" : "Unknown";
    
    const tx = await escrow.setOFTAdapter(endpointId, adapter, chainName);
    await tx.wait();
    console.log(`✅ Set ${chainName} OFT adapter:`, adapter);
  }
  
  // Configure swap composers
  console.log("\n🔧 Configuring swap composers...");
  for (const [endpointId, composer] of Object.entries(config.composers)) {
    const tx = await escrow.setSwapComposer(endpointId, composer);
    await tx.wait();
    console.log(`✅ Set composer for endpoint ${endpointId}:`, composer);
  }
  
  // Set deployer as condition updater
  console.log("\n🔧 Setting condition updater...");
  const updateTx = await escrow.setConditionUpdater(deployer.address, true);
  await updateTx.wait();
  console.log("✅ Deployer set as condition updater");
  
  // Verify chain mappings
  console.log("\n📊 Verifying chain mappings...");
  const mappings = [
    { chain: 11155111, endpoint: 40161, name: "Sepolia" },
    { chain: 80002, endpoint: 40267, name: "Polygon Amoy" },
    { chain: 421614, endpoint: 40231, name: "Arbitrum Sepolia" }
  ];
  
  for (const mapping of mappings) {
    const endpointId = await escrow.chainIdToEndpointId(mapping.chain);
    const chainId = await escrow.endpointIdToChainId(mapping.endpoint);
    console.log(`${mapping.name}: Chain ${mapping.chain} ↔️ Endpoint ${endpointId} ✅`);
  }
  
  // Save deployment info
  const deploymentInfo = {
    network,
    address: escrowAddress,
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    serviceWallet: config.serviceWallet,
    weth: config.weth,
    uniswapRouter: config.uniswapRouter || "0x0000000000000000000000000000000000000000",
    oftAdapters: config.oftAdapters,
    composers: config.composers,
    chainMappings: mappings
  };
  
  // Save to file
  const deploymentsPath = path.join(__dirname, "../../deployments");
  if (!fs.existsSync(deploymentsPath)) {
    fs.mkdirSync(deploymentsPath, { recursive: true });
  }
  
  const fileName = path.join(deploymentsPath, `escrow-v2-${network}.json`);
  fs.writeFileSync(fileName, JSON.stringify(deploymentInfo, null, 2));
  
  console.log("\n✅ Deployment complete!");
  console.log(`Deployment info saved to: ${fileName}`);
  
  // Authorize OFT adapters
  console.log("\n🔐 Authorizing escrow on OFT adapters...");
  for (const [endpointId, adapterAddress] of Object.entries(config.oftAdapters)) {
    try {
      const adapter = await hre.ethers.getContractAt("SimplePropertyOFTAdapter", adapterAddress);
      const setDelegateTx = await adapter.setDelegate(escrowAddress);
      await setDelegateTx.wait();
      console.log(`✅ Authorized on adapter for endpoint ${endpointId}`);
    } catch (error) {
      console.log(`⚠️  Could not authorize on adapter ${adapterAddress}:`, error.message);
    }
  }
  
  console.log("\n🎉 UniversalEscrowServiceV2 deployed and configured!");
  console.log("Contract address:", escrowAddress);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });