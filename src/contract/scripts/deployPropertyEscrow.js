// scripts/deployPropertyEscrow.js
import { ethers, network, run } from "hardhat"; // Hardhat Runtime Environment

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying contracts with the account:", deployer.address);
  console.log("Account balance:", (await deployer.getBalance()).toString());

  // --- Define constructor arguments for PropertyEscrow ---
  // For manual deployment via Hardhat, these are usually fixed or taken from args/env for testing.
  // The backend will provide these dynamically for actual deals.
  const sellerAddress = deployer.address; // Example: Deployer is the seller for this test deployment
  const buyerAddress = "0x000000000000000000000000000000000000DEAD"; // Replace with a test buyer address
  const escrowAmountInEth = "0.001"; // Example: 0.001 ETH for test deployment
  const escrowAmountInWei = ethers.utils.parseEther(escrowAmountInEth);

  console.log(`Attempting to deploy PropertyEscrow with:`);
  console.log(`  Seller: ${sellerAddress}`);
  console.log(`  Buyer: ${buyerAddress}`);
  console.log(`  Escrow Amount: ${escrowAmountInEth} ETH (${escrowAmountInWei.toString()} wei)`);

  const PropertyEscrow = await ethers.getContractFactory("PropertyEscrow");

  const escrowContract = await PropertyEscrow.deploy(
    sellerAddress,
    buyerAddress,
    escrowAmountInWei
  );

  await escrowContract.deployed();

  console.log("PropertyEscrow contract deployed to:", escrowContract.address);
  console.log("Transaction hash:", escrowContract.deployTransaction.hash);

  if (network.name !== "hardhat" && network.name !== "localhost" && process.env.ETHERSCAN_API_KEY) {
    console.log("Waiting for 5 block confirmations before attempting verification...");
    await escrowContract.deployTransaction.wait(5);

    try {
      console.log("Attempting to verify contract on Etherscan...");
      await run("verify:verify", {
        address: escrowContract.address,
        constructorArguments: [
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

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
