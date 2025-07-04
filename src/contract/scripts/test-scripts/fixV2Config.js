const hre = require("hardhat");

async function main() {
  console.log("\n=== FIX V2 CONFIGURATION ===\n");
  
  const [deployer] = await hre.ethers.getSigners();
  const escrowAddress = "0xF29A11B7c0856BAF925a63c1104F37b8A12204A2";
  const escrow = await hre.ethers.getContractAt("UniversalEscrowServiceV2", escrowAddress);
  
  // Current configuration
  console.log("Current OFT Adapters:");
  const sepoliaAdapter = await escrow.oftAdapters(40161);
  console.log("Sepolia (40161):", sepoliaAdapter);
  
  const amoyAdapter = await escrow.oftAdapters(40267);
  console.log("Polygon Amoy (40267):", amoyAdapter);
  
  // Correct OFT adapter addresses from our deployment
  const correctAdapters = {
    "arbitrum-sepolia": "0xbaa46938E3110187ED6a55EE139312b28c943d00",
    "sepolia": "0xb3dd252bfc2c3d822f7F0f550Df576a9CC928Bf4",
    "polygon-amoy": "0x746EF3c4C9c3f779Bc3558A5FF55C3f34ae20725"
  };
  
  console.log("\n🔧 Updating OFT adapter configuration...");
  
  // We're on Arbitrum Sepolia, so we need to configure the adapter for sending TO other chains
  // The adapter address should be the LOCAL adapter on Arbitrum Sepolia
  
  // Update Sepolia endpoint to use Arbitrum's adapter for sending to Sepolia
  console.log("\nSetting Sepolia endpoint (40161) to use Arbitrum adapter:", correctAdapters["arbitrum-sepolia"]);
  const tx1 = await escrow.setOFTAdapter(40161, correctAdapters["arbitrum-sepolia"], "Sepolia");
  await tx1.wait();
  console.log("✅ Updated");
  
  // Update Polygon endpoint to use Arbitrum's adapter for sending to Polygon
  console.log("\nSetting Polygon endpoint (40267) to use Arbitrum adapter:", correctAdapters["arbitrum-sepolia"]);
  const tx2 = await escrow.setOFTAdapter(40267, correctAdapters["arbitrum-sepolia"], "Polygon Amoy");
  await tx2.wait();
  console.log("✅ Updated");
  
  // Verify
  console.log("\n✅ New configuration:");
  const newSepoliaAdapter = await escrow.oftAdapters(40161);
  console.log("Sepolia (40161):", newSepoliaAdapter);
  
  const newAmoyAdapter = await escrow.oftAdapters(40267);
  console.log("Polygon Amoy (40267):", newAmoyAdapter);
  
  console.log("\n💡 OFT adapters updated to use the local Arbitrum adapter for all cross-chain transfers!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });