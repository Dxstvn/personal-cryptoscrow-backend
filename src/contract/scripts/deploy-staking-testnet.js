const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  // Configuration
  const config = {
    sepolia: {
      minStakeAmount: hre.ethers.utils.parseEther("0.01"), // 0.01 ETH
      maxValidators: 5,
      confirmations: 5
    },
    "arbitrum-sepolia": {
      minStakeAmount: hre.ethers.utils.parseEther("0.01"),
      maxValidators: 5,
      confirmations: 3
    },
    "polygon-amoy": {
      minStakeAmount: hre.ethers.utils.parseEther("0.1"), // Higher for MATIC
      maxValidators: 5,
      confirmations: 3
    }
  };

  const network = hre.network.name;
  console.log(`\n🚀 Deploying StakingMechanism to ${network}...`);
  
  // Validate network
  if (!config[network]) {
    throw new Error(`Network ${network} not configured. Available: ${Object.keys(config).join(", ")}`);
  }
  
  const networkConfig = config[network];
  
  // Get deployer info
  const [deployer] = await hre.ethers.getSigners();
  const balance = await deployer.getBalance();
  
  console.log("\n📋 Deployment Information:");
  console.log("========================");
  console.log(`Network: ${network}`);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Balance: ${hre.ethers.utils.formatEther(balance)} ETH`);
  console.log(`Min Stake: ${hre.ethers.utils.formatEther(networkConfig.minStakeAmount)} ETH`);
  console.log(`Max Validators: ${networkConfig.maxValidators}`);
  console.log("========================\n");
  
  // Deploy contract
  console.log("⏳ Deploying contract...");
  const StakingMechanism = await hre.ethers.getContractFactory("StakingMechanism");
  const stakingMechanism = await StakingMechanism.deploy(
    networkConfig.minStakeAmount,
    networkConfig.maxValidators
  );
  
  console.log(`📝 Transaction hash: ${stakingMechanism.deployTransaction.hash}`);
  console.log("⏳ Waiting for confirmations...");
  
  await stakingMechanism.deployed();
  await stakingMechanism.deployTransaction.wait(networkConfig.confirmations);
  
  console.log(`✅ StakingMechanism deployed to: ${stakingMechanism.address}`);
  
  // Verify contract on Etherscan
  if (network !== "hardhat" && network !== "localhost") {
    console.log("\n🔍 Verifying contract on Etherscan...");
    
    // Wait a bit for Etherscan to index the contract
    console.log("⏳ Waiting 30 seconds for Etherscan to index...");
    await new Promise(resolve => setTimeout(resolve, 30000));
    
    try {
      await hre.run("verify:verify", {
        address: stakingMechanism.address,
        constructorArguments: [
          networkConfig.minStakeAmount,
          networkConfig.maxValidators
        ],
      });
      console.log("✅ Contract verified successfully!");
    } catch (error) {
      console.log("⚠️  Contract verification failed:", error.message);
      console.log("You can verify manually using:");
      console.log(`npx hardhat verify --network ${network} ${stakingMechanism.address} ${networkConfig.minStakeAmount} ${networkConfig.maxValidators}`);
    }
  }
  
  // Save deployment information
  const deploymentInfo = {
    network: network,
    contract: {
      name: "StakingMechanism",
      address: stakingMechanism.address,
      transactionHash: stakingMechanism.deployTransaction.hash,
      blockNumber: stakingMechanism.deployTransaction.blockNumber,
    },
    parameters: {
      minStakeAmount: networkConfig.minStakeAmount.toString(),
      maxValidators: networkConfig.maxValidators,
    },
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
  };
  
  // Create deployments directory if it doesn't exist
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }
  
  // Save deployment info
  const deploymentPath = path.join(deploymentsDir, `${network}-staking.json`);
  fs.writeFileSync(deploymentPath, JSON.stringify(deploymentInfo, null, 2));
  console.log(`\n💾 Deployment info saved to: ${deploymentPath}`);
  
  // Update addresses file for easy import
  const addressesPath = path.join(deploymentsDir, "addresses.json");
  let addresses = {};
  if (fs.existsSync(addressesPath)) {
    addresses = JSON.parse(fs.readFileSync(addressesPath, "utf8"));
  }
  
  addresses[network] = addresses[network] || {};
  addresses[network].StakingMechanism = stakingMechanism.address;
  
  fs.writeFileSync(addressesPath, JSON.stringify(addresses, null, 2));
  console.log(`📋 Address updated in: ${addressesPath}`);
  
  // Print summary
  console.log("\n🎉 Deployment Complete!");
  console.log("=====================");
  console.log(`Contract Address: ${stakingMechanism.address}`);
  console.log(`Explorer URL: ${getExplorerUrl(network, stakingMechanism.address)}`);
  console.log("\n📌 Next Steps:");
  console.log("1. Test the contract on the testnet");
  console.log("2. Run integration tests: npm run test:staking:testnet");
  console.log("3. Monitor the contract for any issues");
  console.log("4. Document the deployment in the project README");
  
  // Run initial tests
  console.log("\n🧪 Running basic validation...");
  try {
    const minStake = await stakingMechanism.minStakeAmount();
    const maxValidators = await stakingMechanism.maxValidators();
    const owner = await stakingMechanism.owner();
    
    console.log("✅ Contract state verified:");
    console.log(`   - Min stake: ${hre.ethers.utils.formatEther(minStake)} ETH`);
    console.log(`   - Max validators: ${maxValidators}`);
    console.log(`   - Owner: ${owner}`);
    
    if (owner.toLowerCase() !== deployer.address.toLowerCase()) {
      console.log("⚠️  Warning: Contract owner doesn't match deployer!");
    }
  } catch (error) {
    console.log("❌ Failed to validate contract state:", error.message);
  }
}

function getExplorerUrl(network, address) {
  const explorers = {
    sepolia: `https://sepolia.etherscan.io/address/${address}`,
    "arbitrum-sepolia": `https://sepolia.arbiscan.io/address/${address}`,
    "polygon-amoy": `https://amoy.polygonscan.com/address/${address}`,
  };
  
  return explorers[network] || `Explorer URL not configured for ${network}`;
}

// Execute deployment
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Deployment failed!");
    console.error(error);
    process.exit(1);
  });