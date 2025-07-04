const { ethers } = require("hardhat");
const hre = require("hardhat");
require('dotenv').config();

async function main() {
  console.log("🚀 Deploying PropertyEscrow to Tenderly Virtual TestNet...");

  // Get network info
  const network = hre.network.name;
  const chainId = hre.network.config.chainId;
  console.log(`📡 Network: ${network} (Chain ID: ${chainId})`);
  console.log(`🔗 RPC URL: ${hre.network.config.url}`);

  // Get deployer account
  const signers = await ethers.getSigners();
  if (signers.length === 0) {
    console.error("❌ No signers available. Please check your DEPLOYER_PRIVATE_KEY in .env");
    process.exit(1);
  }
  const deployer = signers[0];
  console.log(`🔑 Deployer address: ${deployer.address}`);
  
  // Check deployer balance
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`💰 Deployer balance: ${ethers.formatEther(balance)} ETH`);

  if (balance === 0n) {
    console.log("⚠️  WARNING: Deployer has 0 ETH balance!");
    console.log("💡 TIP: Fund the deployer address using Tenderly dashboard or faucet");
  }

  // Generate example addresses for the escrow contract
  const sellerWallet = ethers.Wallet.createRandom();
  const buyerWallet = ethers.Wallet.createRandom();
  const sellerAddress = sellerWallet.address; 
  const buyerAddress = buyerWallet.address;
  const escrowAmount = ethers.parseEther("1.0"); // 1 ETH
  const serviceWalletAddress = deployer.address; // Use deployer as service wallet

  console.log("\n📋 Deployment Parameters:");
  console.log(`   Seller: ${sellerAddress}`);
  console.log(`   Buyer: ${buyerAddress}`);
  console.log(`   Escrow Amount: ${ethers.formatEther(escrowAmount)} ETH`);
  console.log(`   Service Wallet: ${serviceWalletAddress}`);

  try {
    // Deploy PropertyEscrow contract
    console.log("\n🔨 Deploying PropertyEscrow contract...");
    const PropertyEscrow = await ethers.getContractFactory("PropertyEscrow");
    
    const propertyEscrow = await PropertyEscrow.deploy(
      sellerAddress,
      buyerAddress,
      escrowAmount,
      serviceWalletAddress
    );

    // Wait for deployment
    await propertyEscrow.waitForDeployment();
    const contractAddress = await propertyEscrow.getAddress();

    console.log("✅ PropertyEscrow deployed successfully!");
    console.log(`📍 Contract Address: ${contractAddress}`);

    // Get deployment transaction details
    const deploymentTx = propertyEscrow.deploymentTransaction();
    if (deploymentTx) {
      console.log(`🧾 Transaction Hash: ${deploymentTx.hash}`);
      console.log(`⛽ Gas Used: ${deploymentTx.gasLimit?.toString() || 'Unknown'}`);
      console.log(`💸 Gas Price: ${deploymentTx.gasPrice ? ethers.formatUnits(deploymentTx.gasPrice, 'gwei') + ' gwei' : 'Unknown'}`);
    }

    // Verify contract on Tenderly (automatic with our setup)
    console.log("\n🔍 Contract verification will be handled automatically by Tenderly plugin...");

    // Try manual verification as well
    try {
      console.log("🔍 Attempting manual verification on Tenderly...");
      await hre.tenderly.verify({
        name: "PropertyEscrow",
        address: contractAddress,
        constructorArguments: [
          sellerAddress,
          buyerAddress,
          escrowAmount,
          serviceWalletAddress
        ]
      });
      console.log("✅ Manual verification successful!");
    } catch (verifyError) {
      console.log("⚠️  Manual verification failed (automatic verification may still work):");
      console.log(verifyError.message);
    }

    // Display Tenderly Dashboard links
    console.log("\n🌐 Tenderly Dashboard Links:");
    const account = process.env.TENDERLY_ACCOUNT_SLUG || "Dusss";
    const project = process.env.TENDERLY_PROJECT_SLUG || "project";
    console.log(`📊 Dashboard: https://dashboard.tenderly.co/${account}/${project}`);
    console.log(`🔍 Contract: https://dashboard.tenderly.co/${account}/${project}/contracts/${contractAddress}`);
    
    // If we can extract testnet ID from RPC URL
    const rpcUrl = hre.network.config.url;
    const testnetIdMatch = rpcUrl.match(/\/([a-f0-9\-]+)$/);
    if (testnetIdMatch) {
      const testnetId = testnetIdMatch[1];
      console.log(`🧪 TestNet: https://dashboard.tenderly.co/${account}/${project}/testnet/${testnetId}`);
    }

    console.log("\n🎉 Deployment completed successfully!");
    console.log("💡 You can now view and interact with your contract in the Tenderly dashboard");

    return {
      contractAddress,
      transactionHash: deploymentTx?.hash,
      network,
      chainId
    };

  } catch (error) {
    console.error("❌ Deployment failed:");
    console.error(error);
    process.exit(1);
  }
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then((result) => {
    console.log("\n✅ Script completed successfully");
    console.log("📋 Deployment Summary:", result);
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Script failed:");
    console.error(error);
    process.exit(1);
  }); 