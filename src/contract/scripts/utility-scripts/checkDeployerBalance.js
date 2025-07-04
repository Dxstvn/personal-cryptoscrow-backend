import pkg from "hardhat";
const { ethers } = pkg;

async function main() {
    const [deployer] = await ethers.getSigners();
    const balance = await ethers.provider.getBalance(deployer.address);
    
    console.log("Deployer address:", deployer.address);
    console.log("Balance:", ethers.formatEther(balance), "ETH");
    console.log("Balance (wei):", balance.toString());
    
    // Check if enough for test
    const requiredForTest = ethers.parseEther("0.2");
    console.log("\nRequired for test:", ethers.formatEther(requiredForTest), "ETH");
    console.log("Has enough:", balance >= requiredForTest ? "✅ Yes" : "❌ No");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });