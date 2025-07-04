const { ethers } = require("hardhat");
const hre = require("hardhat");
require('dotenv').config();

async function main() {
  console.log("🚀 Deploying CrossChainPropertyEscrow to Tenderly Virtual TestNet...");

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

  // Generate example addresses for cross-chain escrow
  const sellerWallet = ethers.Wallet.createRandom();
  const buyerWallet = ethers.Wallet.createRandom();
  const sellerAddress = sellerWallet.address;
  const buyerAddress = buyerWallet.address;
  const escrowAmount = ethers.parseEther("2.5"); // 2.5 ETH for cross-chain deal
  const serviceWalletAddress = deployer.address; // Service wallet
  
  // ✅ FIXED: Add bridge contract address (using deployer as bridge for testing)
  const bridgeContractAddress = deployer.address; // For testing, use deployer as bridge
  
  const buyerSourceChain = "ethereum"; // Source chain for buyer
  const sellerTargetChain = "polygon"; // Target chain for seller
  const tokenAddress = ethers.ZeroAddress; // ETH (null address)
  const dealId = "test-cross-chain-deal-" + Date.now(); // Unique deal ID (for reference only)

  console.log("\n📋 Cross-Chain Deployment Parameters:");
  console.log(`   Seller: ${sellerAddress}`);
  console.log(`   Buyer: ${buyerAddress}`);
  console.log(`   Escrow Amount: ${ethers.formatEther(escrowAmount)} ETH`);
  console.log(`   Service Wallet: ${serviceWalletAddress}`);
  console.log(`   Bridge Contract: ${bridgeContractAddress}`);
  console.log(`   Buyer Source Chain: ${buyerSourceChain}`);
  console.log(`   Seller Target Chain: ${sellerTargetChain}`);
  console.log(`   Token Address: ${tokenAddress} (ETH)`);
  console.log(`   Deal ID (reference): ${dealId}`);

  try {
    // Deploy CrossChainPropertyEscrow contract
    console.log("\n🔨 Deploying CrossChainPropertyEscrow contract...");
    const CrossChainPropertyEscrow = await ethers.getContractFactory("CrossChainPropertyEscrow");
    
    // ✅ FIXED: Correct constructor parameters order matching the contract
    const crossChainEscrow = await CrossChainPropertyEscrow.deploy(
      sellerAddress,           // address _seller
      buyerAddress,            // address _buyer
      escrowAmount,            // uint256 _escrowAmount
      serviceWalletAddress,    // address _serviceWallet
      bridgeContractAddress,   // address _bridgeContract ← ADDED
      buyerSourceChain,        // string memory _buyerSourceChain
      sellerTargetChain,       // string memory _sellerTargetChain
      tokenAddress             // address _tokenAddress
      // ✅ REMOVED: dealId (not in constructor)
    );

    // Wait for deployment
    await crossChainEscrow.waitForDeployment();
    const contractAddress = await crossChainEscrow.getAddress();

    console.log("✅ CrossChainPropertyEscrow deployed successfully!");
    console.log(`📍 Contract Address: ${contractAddress}`);

    // Get deployment transaction details
    const deploymentTx = crossChainEscrow.deploymentTransaction();
    if (deploymentTx) {
      console.log(`🧾 Transaction Hash: ${deploymentTx.hash}`);
      console.log(`⛽ Gas Used: ${deploymentTx.gasLimit?.toString() || 'Unknown'}`);
      console.log(`💸 Gas Price: ${deploymentTx.gasPrice ? ethers.formatUnits(deploymentTx.gasPrice, 'gwei') + ' gwei' : 'Unknown'}`);
    }

    // Get initial contract state
    console.log("\n📊 Initial Contract State:");
    try {
      // ✅ FIXED: Use correct function names that exist in the contract
      const contractState = await crossChainEscrow.getContractState();
      const crossChainInfo = await crossChainEscrow.getCrossChainInfo();
      const balance = await crossChainEscrow.getBalance();
      const serviceFeePercentage = await crossChainEscrow.getServiceFeePercentage();
      
      console.log(`   Status: ${contractState} (${getStateString(contractState)})`);
      console.log(`   Escrow Amount: ${ethers.formatEther(escrowAmount)} ETH`);
      console.log(`   Current Balance: ${ethers.formatEther(balance)} ETH`);
      console.log(`   Cross-Chain Bridge Enabled: ${crossChainInfo[2]}`); // isCrossChainDeal
      console.log(`   Buyer Source Chain: ${crossChainInfo[0]}`); // buyerSourceChain
      console.log(`   Seller Target Chain: ${crossChainInfo[1]}`); // sellerTargetChain
      console.log(`   Token Address: ${crossChainInfo[3]}`); // tokenAddress
      console.log(`   Bridge Contract: ${crossChainInfo[4]}`); // bridgeContract
      console.log(`   Service Fee: ${serviceFeePercentage / 100}%`);
    } catch (stateError) {
      console.log("⚠️  Could not fetch initial contract state:", stateError.message);
      // Try basic contract interaction to verify deployment
      try {
        const seller = await crossChainEscrow.seller();
        const buyer = await crossChainEscrow.buyer();
        console.log(`   ✅ Contract verified - Seller: ${seller}, Buyer: ${buyer}`);
      } catch (basicError) {
        console.log("❌ Contract deployment may have failed:", basicError.message);
      }
    }

    // Verify contract on Tenderly (automatic with our setup)
    console.log("\n🔍 Contract verification will be handled automatically by Tenderly plugin...");

    // Try manual verification as well
    try {
      console.log("🔍 Attempting manual verification on Tenderly...");
      await hre.tenderly.verify({
        name: "CrossChainPropertyEscrow",
        address: contractAddress,
        constructorArguments: [
          sellerAddress,
          buyerAddress,
          escrowAmount,
          serviceWalletAddress,
          bridgeContractAddress,  // ✅ FIXED: Added bridge contract
          buyerSourceChain,
          sellerTargetChain,
          tokenAddress
          // ✅ REMOVED: dealId
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

    console.log("\n🌐 Cross-Chain Testing Guide:");
    console.log("🔗 This contract is designed for cross-chain escrow transactions");
    console.log("💡 You can test cross-chain scenarios by:");
    console.log("   1. Setting conditions: call setConditions() with condition IDs");
    console.log("   2. Depositing funds: depositFunds() for ETH or receiveCrossChainDeposit() for bridged funds");
    console.log("   3. Fulfilling conditions: buyerMarksConditionFulfilled() for each condition");
    console.log("   4. Starting final approval: startFinalApprovalPeriod()");
    console.log("   5. Releasing funds: releaseFundsAfterApprovalPeriod() or cross-chain release");
    console.log("   6. Monitor all transactions in Tenderly dashboard");

    console.log("\n🎉 Cross-Chain Deployment completed successfully!");
    console.log("💡 You can now view and interact with your cross-chain contract in the Tenderly dashboard");

    return {
      contractAddress,
      transactionHash: deploymentTx?.hash,
      network,
      chainId,
      crossChain: {
        buyerSourceChain,
        sellerTargetChain,
        tokenAddress,
        bridgeContract: bridgeContractAddress,
        dealId // Keep for reference
      }
    };

  } catch (error) {
    console.error("❌ Cross-Chain Deployment failed:");
    console.error(error);
    process.exit(1);
  }
}

// Helper function to convert state enum to string
function getStateString(state) {
  const states = [
    "AWAITING_CONDITION_SETUP",
    "AWAITING_DEPOSIT", 
    "AWAITING_CROSS_CHAIN_DEPOSIT",
    "AWAITING_FULFILLMENT",
    "READY_FOR_FINAL_APPROVAL",
    "IN_FINAL_APPROVAL",
    "IN_DISPUTE",
    "READY_FOR_CROSS_CHAIN_RELEASE",
    "AWAITING_CROSS_CHAIN_RELEASE",
    "COMPLETED",
    "CANCELLED"
  ];
  return states[state] || `Unknown(${state})`;
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then((result) => {
    console.log("\n✅ Cross-Chain Script completed successfully");
    console.log("📋 Deployment Summary:", result);
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Cross-Chain Script failed:");
    console.error(error);
    process.exit(1);
  }); 