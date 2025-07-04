const hre = require("hardhat");

async function main() {
  const network = hre.network.name;
  console.log(`\nUpdating Uniswap router configuration on ${network}...`);

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

  // Known correct Uniswap V2 routers
  const correctRouters = {
    sepolia: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
    "polygon-amoy": "0x8954AfA98594b838bda56FE4C12a09D7739D179b",
    "arbitrum-sepolia": "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D"
  };

  const newRouter = correctRouters[network];
  if (!newRouter) {
    console.error(`No known router for ${network}`);
    return;
  }

  // Connect to composer contract
  const EscrowSwapComposer = await hre.ethers.getContractFactory("EscrowSwapComposer");
  const composer = EscrowSwapComposer.attach(composerAddress);

  // Check current router
  const currentRouter = await composer.uniswapV2Router();
  console.log(`\nCurrent router: ${currentRouter}`);
  console.log(`New router:     ${newRouter}`);

  if (currentRouter.toLowerCase() === newRouter.toLowerCase()) {
    console.log("\n✅ Router is already correct!");
    return;
  }

  // Check if we're the owner
  try {
    const owner = await composer.owner();
    if (owner.toLowerCase() !== deployer.address.toLowerCase()) {
      console.error(`\n❌ Not the owner! Owner is: ${owner}`);
      return;
    }
  } catch (error) {
    console.log("No owner function found, attempting update anyway...");
  }

  // Get current V3 router (keep it the same)
  const currentV3Router = await composer.uniswapV3Router();
  
  // Update the routers
  console.log("\n📝 Updating router...");
  try {
    const tx = await composer.setRouters(newRouter, currentV3Router);
    console.log(`Transaction sent: ${tx.hash}`);
    
    const receipt = await tx.wait();
    console.log(`\n✅ Router updated successfully!`);
    console.log(`Gas used: ${receipt.gasUsed.toString()}`);
    
    // Verify the update
    const updatedRouter = await composer.uniswapV2Router();
    console.log(`\nVerified new router: ${updatedRouter}`);
    
  } catch (error) {
    console.error("\n❌ Failed to update router:", error.message);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });