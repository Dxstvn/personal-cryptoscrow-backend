const hre = require("hardhat");

async function main() {
  console.log("\n=== DEBUG CHAIN ID ===\n");
  
  const network = hre.network.name;
  console.log("Network name:", network);
  
  // Get chain ID from provider
  const chainId = (await hre.ethers.provider.getNetwork()).chainId;
  console.log("Chain ID from provider:", chainId);
  
  // Get block.chainid from contract
  const testContract = await hre.ethers.deployContract("UniversalEscrowService", [
    "0x0000000000000000000000000000000000000001", // dummy service wallet
    "0x0000000000000000000000000000000000000002", // dummy WETH
    "0x0000000000000000000000000000000000000003"  // dummy router
  ]);
  
  // Deploy a simple test contract to check block.chainid
  const TestChainId = await hre.ethers.getContractFactory("UniversalEscrowService");
  
  console.log("\n🔍 Checking chain ID handling...");
  
  // Check if the issue is with chain ID comparison
  console.log("\nTarget chain ID we're using: 40161 (Sepolia LZ)");
  console.log("Current chain ID:", chainId);
  console.log("Are they different?", 40161 != chainId);
  
  // The issue might be that Arbitrum Sepolia's chain ID is 421614
  // but we're comparing with LayerZero's endpoint ID (40231)
  
  console.log("\n💡 Chain ID mapping:");
  console.log("Ethereum Sepolia: Chain 11155111 -> LZ 40161");
  console.log("Polygon Amoy: Chain 80002 -> LZ 40267");
  console.log("Arbitrum Sepolia: Chain 421614 -> LZ 40231");
  
  console.log("\n⚠️  The issue might be:");
  console.log("We're storing LayerZero endpoint IDs in targetChainId");
  console.log("But comparing with block.chainid which is the actual chain ID");
  console.log("So 40161 != 421614, triggering cross-chain logic on same chain!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });