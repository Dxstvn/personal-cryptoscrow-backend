const hre = require("hardhat");
require('dotenv').config();

async function main() {
  console.log("🔍 Manual Contract Verification on Tenderly...");

  // Contract details from the latest deployment
  const contractAddress = "0xf4b15F65233e7AC9595fdF90BaB03E615dA17340"; // Latest deployment
  const contractName = "CrossChainPropertyEscrow";

  // Get network info
  const network = hre.network.name;
  const chainId = hre.network.config.chainId;
  console.log(`📡 Network: ${network} (Chain ID: ${chainId})`);
  console.log(`🔍 Verifying Contract: ${contractAddress}`);

  // Constructor arguments from deployment
  const sellerAddress = "0xB24fF7D8c26A74eD7B3c86a7740ad09968819e79";
  const buyerAddress = "0xC87Da35a078Dc4fbb7F63754d70Eb6EA069AD234";
  const escrowAmount = hre.ethers.parseEther("2.5");
  const serviceWalletAddress = "0xE616Dd4F04e4e174Db0C4106560D8352E7213baa";
  const bridgeContractAddress = "0xE616Dd4F04e4e174Db0C4106560D8352E7213baa";
  const buyerSourceChain = "ethereum";
  const sellerTargetChain = "polygon";
  const tokenAddress = hre.ethers.ZeroAddress;

  const constructorArguments = [
    sellerAddress,
    buyerAddress,
    escrowAmount,
    serviceWalletAddress,
    bridgeContractAddress,
    buyerSourceChain,
    sellerTargetChain,
    tokenAddress
  ];

  console.log("\n📋 Constructor Arguments:");
  console.log(`   Seller: ${sellerAddress}`);
  console.log(`   Buyer: ${buyerAddress}`);
  console.log(`   Escrow Amount: ${hre.ethers.formatEther(escrowAmount)} ETH`);
  console.log(`   Service Wallet: ${serviceWalletAddress}`);
  console.log(`   Bridge Contract: ${bridgeContractAddress}`);
  console.log(`   Buyer Source Chain: ${buyerSourceChain}`);
  console.log(`   Seller Target Chain: ${sellerTargetChain}`);
  console.log(`   Token Address: ${tokenAddress}`);

  try {
    console.log("\n🔍 Attempting Tenderly verification...");
    
    await hre.tenderly.verify({
      name: contractName,
      address: contractAddress,
      constructorArguments: constructorArguments,
    });

    console.log("✅ Contract verified successfully on Tenderly!");
    
    // Display useful links
    const account = process.env.TENDERLY_ACCOUNT_SLUG || "Dusss";
    const project = process.env.TENDERLY_PROJECT_SLUG || "project";
    console.log("\n🌐 Tenderly Dashboard Links:");
    console.log(`📊 Dashboard: https://dashboard.tenderly.co/${account}/${project}`);
    console.log(`🔍 Contract: https://dashboard.tenderly.co/${account}/${project}/contracts/${contractAddress}`);
    
    // Extract testnet ID from RPC URL if possible
    const rpcUrl = hre.network.config.url;
    const testnetIdMatch = rpcUrl.match(/\/([a-f0-9\-]+)$/);
    if (testnetIdMatch) {
      const testnetId = testnetIdMatch[1];
      console.log(`🧪 TestNet: https://dashboard.tenderly.co/${account}/${project}/testnet/${testnetId}`);
    }

  } catch (error) {
    console.error("❌ Manual verification failed:");
    console.error(error.message);
    
    if (error.message.includes('403') || error.message.includes('Forbidden')) {
      console.log("\n💡 Troubleshooting Tips:");
      console.log("   1. Check if your Tenderly access token has the correct permissions");
      console.log("   2. Verify that your account slug and project slug are correct");
      console.log("   3. Make sure you're the owner/member of the Tenderly project");
      console.log("   4. Try generating a new access token from Tenderly dashboard");
    }
    
    if (error.message.includes('404') || error.message.includes('Not Found')) {
      console.log("\n💡 Troubleshooting Tips:");
      console.log("   1. Check if the project name 'project' exists in your Tenderly account");
      console.log("   2. Verify the account slug 'Dusss' is correct");
      console.log("   3. Make sure you're using the correct network configuration");
    }

    console.log("\n📋 Current Configuration:");
    console.log(`   Account Slug: ${process.env.TENDERLY_ACCOUNT_SLUG}`);
    console.log(`   Project Slug: ${process.env.TENDERLY_PROJECT_SLUG}`);
    console.log(`   Access Key: ${process.env.TENDERLY_ACCESS_KEY ? '***' + process.env.TENDERLY_ACCESS_KEY.slice(-4) : 'Not Set'}`);
    
    process.exit(1);
  }
}

main()
  .then(() => {
    console.log("\n✅ Verification script completed successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Verification script failed:");
    console.error(error);
    process.exit(1);
  }); 