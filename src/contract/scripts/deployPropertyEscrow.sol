// scripts/deployPropertyEscrow.js
const hre = require("hardhat"); // Hardhat Runtime Environment

async function main() {
  // Get the signers (the account that will deploy the contract)
  const [deployer] = await hre.ethers.getSigners();

  console.log("Deploying contracts with the account:", deployer.address);
  console.log("Account balance:", (await deployer.getBalance()).toString());

  // --- Define constructor arguments for PropertyEscrow ---
  // These would typically come from your application logic or configuration
  // For this example, we'll use placeholder addresses and an amount.
  // In a real scenario, the seller might be the deployer, or you might have a dedicated deployer account.
  const sellerAddress = deployer.address; // Example: Deployer is the seller
  const buyerAddress = "0x000000000000000000000000000000000000DEAD"; // Replace with actual buyer address
  const escrowAmountInEth = "0.01"; // Example: 0.01 ETH
  const escrowAmountInWei = hre.ethers.utils.parseEther(escrowAmountInEth);

  console.log(`Attempting to deploy PropertyEscrow with:`);
  console.log(`  Seller: ${sellerAddress}`);
  console.log(`  Buyer: ${buyerAddress}`);
  console.log(`  Escrow Amount: ${escrowAmountInEth} ETH (${escrowAmountInWei.toString()} wei)`);

  // Get the ContractFactory
  const PropertyEscrow = await hre.ethers.getContractFactory("PropertyEscrow");

  // Deploy the contract
  // Pass constructor arguments here
  const escrowContract = await PropertyEscrow.deploy(
    sellerAddress,
    buyerAddress,
    escrowAmountInWei
  );

  // Wait for the contract to be deployed
  await escrowContract.deployed();

  console.log("PropertyEscrow contract deployed to:", escrowContract.address);
  console.log("Transaction hash:", escrowContract.deployTransaction.hash);

  // --- Optional: Verify on Etherscan (if network is not hardhat) ---
  if (hre.network.name !== "hardhat" && hre.network.name !== "localhost" && process.env.ETHERSCAN_API_KEY) {
    console.log("Waiting for 5 block confirmations before attempting verification...");
    await escrowContract.deployTransaction.wait(5); // Wait for 5 confirmations

    try {
      console.log("Attempting to verify contract on Etherscan...");
      await hre.run("verify:verify", {
        address: escrowContract.address,
        constructorArguments: [ // Must match the order and types in your constructor
          sellerAddress,
          buyerAddress,
          escrowAmountInWei,
        ],
      });
      console.log("Contract verified on Etherscan successfully!");
    } catch (error) {
      console.error("Etherscan verification failed:", error);
      if (error.message.toLowerCase().includes("already verified")) {
        console.log("Contract might already be verified.");
      }
    }
  }
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
