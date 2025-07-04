const hre = require("hardhat");

async function main() {
  const network = hre.network.name;
  console.log(`\nUpdating Uniswap V3 router configuration on ${network}...`);

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer:", deployer.address);

  // Get composer addresses
  const composers = {
    sepolia: "0x3e6d2247055683d53a16Fc935E24D30065a6DB05",
    "polygon-amoy": "0xeE455345205F0Ab563f67307bF37E618180da05c",
    "arbitrum-sepolia": "0x8f65178A3281d72E1F50FA9E01D8B3884229ddC8"
  };

  const composerAddress = composers[network];
  if (!composerAddress) {
    console.error(`No composer deployed on ${network}`);
    return;
  }

  // Known V3 routers
  const v3Routers = {
    sepolia: "0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E",
    // Keep others null for now
    "polygon-amoy": null,
    "arbitrum-sepolia": null
  };

  const newV3Router = v3Routers[network];
  
  // Connect to composer contract
  const EscrowSwapComposer = await hre.ethers.getContractFactory("EscrowSwapComposer");
  const composer = EscrowSwapComposer.attach(composerAddress);

  // Get current routers
  const currentV2Router = await composer.uniswapV2Router();
  const currentV3Router = await composer.uniswapV3Router();
  
  console.log(`\nCurrent V2 router: ${currentV2Router}`);
  console.log(`Current V3 router: ${currentV3Router}`);
  
  if (network === "sepolia") {
    // For Sepolia, set V3 router and clear V2
    console.log(`\nNew V2 router: 0x0000000000000000000000000000000000000000 (disabled)`);
    console.log(`New V3 router: ${newV3Router}`);
    
    // Update both routers
    console.log("\n📝 Updating routers...");
    try {
      const tx = await composer.setRouters(
        "0x0000000000000000000000000000000000000000", // Disable V2 on Sepolia
        newV3Router
      );
      console.log(`Transaction sent: ${tx.hash}`);
      
      const receipt = await tx.wait();
      console.log(`\n✅ Routers updated successfully!`);
      console.log(`Gas used: ${receipt.gasUsed.toString()}`);
      
      // Verify the update
      const updatedV2Router = await composer.uniswapV2Router();
      const updatedV3Router = await composer.uniswapV3Router();
      console.log(`\nVerified V2 router: ${updatedV2Router}`);
      console.log(`Verified V3 router: ${updatedV3Router}`);
      
    } catch (error) {
      console.error("\n❌ Failed to update routers:", error.message);
    }
  } else {
    console.log("\nNo V3 router update needed for", network);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });