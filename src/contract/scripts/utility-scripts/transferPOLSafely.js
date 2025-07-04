import pkg from "hardhat";
const { ethers } = pkg;

async function main() {
    console.log("=== Safe POL Transfer ===\n");
    
    const BACKEND_WALLET = "0x2223F51659fAcC662504dcEbD4735886285ABC96";
    const DEPLOYER_WALLET = "0x28f9F5e0Ec9C6B8cdF1F3ad73847A094570c927D";
    
    // Get network info
    const network = await ethers.provider.getNetwork();
    const chainId = network.chainId.toString();
    const networkName = chainId === "80002" ? "polygon-amoy" : `unknown-${chainId}`;
    
    if (networkName !== "polygon-amoy") {
        console.log("❌ This script should only run on Polygon Amoy network!");
        console.log(`Current network: ${networkName}`);
        return;
    }
    
    console.log(`Network: ${networkName} (Chain ID: ${chainId})`);
    console.log(`From: ${BACKEND_WALLET}`);
    console.log(`To: ${DEPLOYER_WALLET}`);
    
    // Check if we have the backend wallet's private key
    const signers = await ethers.getSigners();
    let backendSigner = null;
    
    for (const signer of signers) {
        const address = await signer.getAddress();
        if (address.toLowerCase() === BACKEND_WALLET.toLowerCase()) {
            backendSigner = signer;
            break;
        }
    }
    
    if (!backendSigner) {
        console.log("\n❌ Backend wallet not found in signers!");
        console.log("Available signers:");
        for (const signer of signers) {
            console.log(`- ${await signer.getAddress()}`);
        }
        console.log("\nMake sure the backend wallet private key is configured in your .env file");
        return;
    }
    
    // Check balances
    console.log("\n📊 Checking balances...");
    
    const backendBalance = await ethers.provider.getBalance(BACKEND_WALLET);
    const deployerBalance = await ethers.provider.getBalance(DEPLOYER_WALLET);
    
    console.log(`Backend wallet balance: ${ethers.formatEther(backendBalance)} POL`);
    console.log(`Deployer wallet balance: ${ethers.formatEther(deployerBalance)} POL`);
    
    if (backendBalance === 0n) {
        console.log("\n❌ Backend wallet has no POL to transfer!");
        return;
    }
    
    // Estimate gas for transfer
    console.log("\n⛽ Estimating gas...");
    
    const gasPrice = await ethers.provider.getFeeData();
    const gasLimit = 21000n; // Standard transfer gas limit
    const gasCost = gasLimit * gasPrice.gasPrice;
    
    console.log(`Gas price: ${ethers.formatUnits(gasPrice.gasPrice, "gwei")} Gwei`);
    console.log(`Gas limit: ${gasLimit}`);
    console.log(`Estimated gas cost: ${ethers.formatEther(gasCost)} POL`);
    
    // Calculate transfer amount (leave some for gas)
    const buffer = ethers.parseEther("0.01"); // Leave 0.01 POL for safety
    const totalBuffer = gasCost + buffer;
    
    if (backendBalance <= totalBuffer) {
        console.log("\n⚠️ Backend wallet balance is too low to cover gas + buffer!");
        console.log(`Balance: ${ethers.formatEther(backendBalance)} POL`);
        console.log(`Needed for gas + buffer: ${ethers.formatEther(totalBuffer)} POL`);
        
        // Transfer smaller amount
        const transferAmount = backendBalance - gasCost - ethers.parseEther("0.005"); // Leave 0.005 POL
        if (transferAmount > 0n) {
            console.log(`\nWill transfer: ${ethers.formatEther(transferAmount)} POL`);
        } else {
            console.log("\n❌ Not enough balance to transfer after gas costs!");
            return;
        }
    }
    
    const transferAmount = backendBalance - totalBuffer;
    
    console.log("\n💰 Transfer details:");
    console.log(`Amount to transfer: ${ethers.formatEther(transferAmount)} POL`);
    console.log(`Gas cost: ${ethers.formatEther(gasCost)} POL`);
    console.log(`Remaining in backend: ${ethers.formatEther(totalBuffer)} POL`);
    
    // Confirm transfer
    console.log("\n🔐 Sending transaction...");
    
    try {
        const tx = await backendSigner.sendTransaction({
            to: DEPLOYER_WALLET,
            value: transferAmount,
            gasLimit: gasLimit,
            gasPrice: gasPrice.gasPrice
        });
        
        console.log(`\n📤 Transaction sent!`);
        console.log(`Hash: ${tx.hash}`);
        console.log(`View on explorer: https://amoy.polygonscan.com/tx/${tx.hash}`);
        
        console.log("\nWaiting for confirmation...");
        const receipt = await tx.wait();
        
        console.log(`\n✅ Transaction confirmed!`);
        console.log(`Block: ${receipt.blockNumber}`);
        console.log(`Gas used: ${receipt.gasUsed}`);
        console.log(`Actual gas cost: ${ethers.formatEther(receipt.gasUsed * gasPrice.gasPrice)} POL`);
        
        // Check final balances
        console.log("\n📊 Final balances:");
        const finalBackendBalance = await ethers.provider.getBalance(BACKEND_WALLET);
        const finalDeployerBalance = await ethers.provider.getBalance(DEPLOYER_WALLET);
        
        console.log(`Backend wallet: ${ethers.formatEther(finalBackendBalance)} POL`);
        console.log(`Deployer wallet: ${ethers.formatEther(finalDeployerBalance)} POL`);
        
        const actualTransferred = finalDeployerBalance - deployerBalance;
        console.log(`\n✅ Successfully transferred: ${ethers.formatEther(actualTransferred)} POL`);
        
    } catch (error) {
        console.error("\n❌ Transfer failed:", error.message);
        if (error.data) {
            console.error("Error data:", error.data);
        }
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("Script error:", error);
        process.exit(1);
    });