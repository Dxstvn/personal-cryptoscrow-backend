const { ethers } = require("ethers");

async function main() {
  console.log("🔑 Setting up deployer wallet for Tenderly Virtual TestNets...");

  // Generate a new random wallet
  const wallet = ethers.Wallet.createRandom();
  
  console.log("\n✨ Generated new deployer wallet:");
  console.log(`🔑 Address: ${wallet.address}`);
  console.log(`🔐 Private Key: ${wallet.privateKey}`);
  console.log(`🎲 Mnemonic: ${wallet.mnemonic.phrase}`);

  console.log("\n⚠️  IMPORTANT SECURITY NOTES:");
  console.log("🔒 Store the private key securely in your .env file");
  console.log("🚫 NEVER commit private keys to version control");
  console.log("🧪 This wallet is for TESTING ONLY - do not use in production");

  console.log("\n📝 Add this to your .env file:");
  console.log(`DEPLOYER_PRIVATE_KEY=${wallet.privateKey}`);

  console.log("\n💰 Funding instructions:");
  console.log("1. Copy the address above");
  console.log("2. Go to your Tenderly Dashboard:");
  console.log("   https://dashboard.tenderly.co/Dusss/project");
  console.log("3. Navigate to each Virtual TestNet");
  console.log("4. Use the faucet to fund this address with ETH");
  console.log("5. Repeat for all networks you want to deploy to");

  // Show funding commands for Tenderly RPC
  console.log("\n🧪 Or fund programmatically using Tenderly RPC:");
  
  const networks = [
    { name: "Ethereum Mainnet", rpc: process.env.TENDERLY_ETHEREUM_MAINNET },
    { name: "Polygon", rpc: process.env.TENDERLY_POLYGON },
    { name: "Arbitrum One", rpc: process.env.TENDERLY_ARBITRUM_ONE },
    { name: "Base", rpc: process.env.TENDERLY_BASE },
    { name: "Optimism", rpc: process.env.TENDERLY_OPTIMISM }
  ];

  for (const network of networks) {
    if (network.rpc) {
      console.log(`\n💰 Fund on ${network.name}:`);
      console.log(`curl -X POST ${network.rpc} \\`);
      console.log(`  -H "Content-Type: application/json" \\`);
      console.log(`  -d '{`);
      console.log(`    "jsonrpc": "2.0",`);
      console.log(`    "method": "tenderly_setBalance",`);
      console.log(`    "params": ["${wallet.address}", "0x8AC7230489E80000"],`);
      console.log(`    "id": 1`);
      console.log(`  }'`);
    }
  }

  console.log("\n✅ Setup complete! Now you can deploy contracts to Tenderly Virtual TestNets");
  console.log("\n🚀 Next steps:");
  console.log("1. Add the private key to your .env file");
  console.log("2. Fund the wallet on your desired networks");
  console.log("3. Run: npm run deploy:tenderly");
  console.log("4. Or: npm run deploy:tenderly:cross-chain");
}

main()
  .then(() => {
    console.log("\n✅ Deployer setup completed successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Setup failed:");
    console.error(error);
    process.exit(1);
  }); 