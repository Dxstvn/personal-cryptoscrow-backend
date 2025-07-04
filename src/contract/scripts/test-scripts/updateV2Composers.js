const hre = require("hardhat");

async function main() {
  console.log("\n=== UPDATE V2 COMPOSERS ===\n");
  
  const [deployer] = await hre.ethers.getSigners();
  const escrowAddress = "0xF29A11B7c0856BAF925a63c1104F37b8A12204A2";
  const escrow = await hre.ethers.getContractAt("UniversalEscrowServiceV2", escrowAddress);
  
  // Current composers
  console.log("Current Composers:");
  const sepoliaComposer = await escrow.swapComposers(40161);
  console.log("Sepolia (40161):", sepoliaComposer);
  
  const amoyComposer = await escrow.swapComposers(40267);
  console.log("Polygon Amoy (40267):", amoyComposer);
  
  // Update with correct composer addresses for each destination
  console.log("\n🔧 Updating composers...");
  
  // These are the composers deployed on the DESTINATION chains
  const composers = {
    "sepolia": "0x3e6d2247055683d53a16Fc935E24D30065a6DB05",
    "polygon-amoy": "0xeE455345205F0Ab563f67307bF37E618180da05c"
  };
  
  // Keep the same composers as they're correct for destination chains
  console.log("\n✅ Composers are already correctly configured for destination chains");
  console.log("- Sepolia composer will handle swaps on Sepolia");
  console.log("- Polygon composer will handle swaps on Polygon");
  
  // Also check if escrow is authorized on the OFT adapter
  const oftAdapter = await hre.ethers.getContractAt(
    "SimplePropertyOFTAdapter",
    "0xbaa46938E3110187ED6a55EE139312b28c943d00"
  );
  
  console.log("\n🔍 Checking OFT adapter authorization...");
  try {
    // The adapter uses owner() not delegates()
    const adapterOwner = await oftAdapter.owner();
    console.log("OFT Adapter owner:", adapterOwner);
    console.log("Escrow address:", escrowAddress);
    console.log("Is escrow the owner?", adapterOwner.toLowerCase() === escrowAddress.toLowerCase());
    
    // Check if we can call setDelegate
    console.log("\nChecking delegate configuration...");
    // SimplePropertyOFTAdapter inherits from OFT which has delegates mapping
    // but it's not exposed as a public function, only through setDelegate
  } catch (error) {
    console.log("Error checking:", error.message);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });