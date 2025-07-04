const { ethers } = require("ethers");
require('dotenv').config();

const DEPLOYER_ADDRESS = "0xE616Dd4F04e4e174Db0C4106560D8352E7213baa";
const FUNDING_AMOUNT = "0x8AC7230489E80000"; // 10 ETH in wei

const networks = [
  { 
    name: "Ethereum Mainnet", 
    rpc: process.env.TENDERLY_ETHEREUM_MAINNET || "https://virtual.mainnet.rpc.tenderly.co/51eccaa8-2319-4c5d-8c94-10fff0684681"
  },
  { 
    name: "Polygon", 
    rpc: process.env.TENDERLY_POLYGON || "https://virtual.polygon.rpc.tenderly.co/7db9122c-d326-4504-a216-af8ff7e5f594"
  },
  { 
    name: "Arbitrum One", 
    rpc: process.env.TENDERLY_ARBITRUM_ONE || "https://virtual.arbitrum.rpc.tenderly.co/b6e5c91d-d735-4a0f-bd63-c5462e571517"
  },
  { 
    name: "Base", 
    rpc: process.env.TENDERLY_BASE || "https://virtual.base.rpc.tenderly.co/1132fce5-5e18-4ae6-b261-7142febed9db"
  },
  { 
    name: "Optimism", 
    rpc: process.env.TENDERLY_OPTIMISM || "https://virtual.optimism.rpc.tenderly.co/bc666715-d826-453b-a9a8-6f7c20ee7d8d"
  }
];

async function fundAddress(networkName, rpcUrl, address, amount) {
  try {
    console.log(`💰 Funding ${address} on ${networkName}...`);
    
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    
    // Use Tenderly's custom RPC method to set balance
    const result = await provider.send("tenderly_setBalance", [
      address,
      amount
    ]);
    
    // Verify the balance was set
    const balance = await provider.getBalance(address);
    const balanceInEth = ethers.formatEther(balance);
    
    console.log(`✅ Success! Balance on ${networkName}: ${balanceInEth} ETH`);
    
    return {
      network: networkName,
      success: true,
      balance: balanceInEth,
      txResult: result
    };
    
  } catch (error) {
    console.error(`❌ Failed to fund on ${networkName}:`, error.message);
    return {
      network: networkName,
      success: false,
      error: error.message
    };
  }
}

async function main() {
  console.log("🚀 Funding deployer address on all Tenderly Virtual TestNets...");
  console.log(`🔑 Deployer Address: ${DEPLOYER_ADDRESS}`);
  console.log(`💰 Funding Amount: ${ethers.formatEther(FUNDING_AMOUNT)} ETH per network`);
  
  const results = [];
  
  for (const network of networks) {
    const result = await fundAddress(network.name, network.rpc, DEPLOYER_ADDRESS, FUNDING_AMOUNT);
    results.push(result);
    
    // Add a small delay between requests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log("\n📊 Funding Summary:");
  console.log("==================");
  
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  
  if (successful.length > 0) {
    console.log("\n✅ Successfully funded networks:");
    successful.forEach(result => {
      console.log(`   ${result.network}: ${result.balance} ETH`);
    });
  }
  
  if (failed.length > 0) {
    console.log("\n❌ Failed to fund networks:");
    failed.forEach(result => {
      console.log(`   ${result.network}: ${result.error}`);
    });
  }
  
  console.log(`\n📈 Success Rate: ${successful.length}/${results.length} networks funded`);
  
  if (successful.length > 0) {
    console.log("\n🎉 Deployer is now funded and ready for deployments!");
    console.log("\n🚀 Next steps:");
    console.log("1. Run: npm run deploy:tenderly");
    console.log("2. Or: npm run deploy:tenderly:cross-chain");
    console.log("3. Check contracts in Tenderly Dashboard:");
    console.log("   https://dashboard.tenderly.co/Dusss/project");
  } else {
    console.log("\n⚠️  No networks were successfully funded. Please check:");
    console.log("1. Network connectivity");
    console.log("2. Tenderly Virtual TestNet URLs");
    console.log("3. Tenderly access permissions");
  }
  
  return {
    totalNetworks: results.length,
    successful: successful.length,
    failed: failed.length,
    results
  };
}

main()
  .then((summary) => {
    console.log(`\n✅ Funding process completed: ${summary.successful}/${summary.totalNetworks} successful`);
    process.exit(summary.failed === 0 ? 0 : 1);
  })
  .catch((error) => {
    console.error("❌ Funding process failed:");
    console.error(error);
    process.exit(1);
  }); 