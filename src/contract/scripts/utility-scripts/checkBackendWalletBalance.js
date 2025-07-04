import pkg from "hardhat";
const { ethers } = pkg;

async function main() {
    const BACKEND_WALLET = "0x2223F51659fAcC662504dcEbD4735886285ABC96";
    const DEPLOYER_WALLET = "0x28f9F5e0Ec9C6B8cdF1F3ad73847A094570c927D";
    
    console.log("=== Checking Wallet Balances ===\n");
    
    const network = await ethers.provider.getNetwork();
    const chainId = network.chainId.toString();
    const networkName = chainId === "80002" ? "polygon-amoy" : `unknown-${chainId}`;
    
    console.log(`Network: ${networkName} (Chain ID: ${chainId})`);
    
    const backendBalance = await ethers.provider.getBalance(BACKEND_WALLET);
    const deployerBalance = await ethers.provider.getBalance(DEPLOYER_WALLET);
    
    console.log("\n📊 Wallet Balances:");
    console.log(`Backend wallet (${BACKEND_WALLET}):`);
    console.log(`  Balance: ${ethers.formatEther(backendBalance)} POL`);
    
    console.log(`\nDeployer wallet (${DEPLOYER_WALLET}):`);
    console.log(`  Balance: ${ethers.formatEther(deployerBalance)} POL`);
    
    const totalBalance = backendBalance + deployerBalance;
    console.log(`\nTotal POL available: ${ethers.formatEther(totalBalance)} POL`);
    
    if (backendBalance > 0n) {
        console.log("\n💡 To transfer POL from backend to deployer wallet:");
        console.log("1. Add the backend wallet private key to your .env file");
        console.log("2. Update hardhat.config.js to include the backend wallet in accounts");
        console.log("3. Run: npx hardhat run scripts/transferPOLSafely.js --network polygon-amoy");
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });