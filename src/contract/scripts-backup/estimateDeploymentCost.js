import pkg from "hardhat";
const { ethers } = pkg;

async function main() {
    console.log("=== Estimating Deployment Cost ===\n");
    
    const [deployer] = await ethers.getSigners();
    console.log("Deploying with account:", deployer.address);
    
    // Check balance first
    const balance = await ethers.provider.getBalance(deployer.address);
    console.log("Balance:", ethers.formatEther(balance), "ETH");
    
    // Get network info
    const network = await ethers.provider.getNetwork();
    const chainId = network.chainId.toString();
    console.log(`Network: Chain ID ${chainId}`);
    
    // Get gas price
    const gasPrice = await ethers.provider.getFeeData();
    console.log("Gas price:", ethers.formatUnits(gasPrice.gasPrice || 0n, "gwei"), "gwei");
    console.log("Max fee per gas:", ethers.formatUnits(gasPrice.maxFeePerGas || 0n, "gwei"), "gwei");
    
    const configs = {
        "80002": { // Polygon Amoy
            weth: "0x360ad4f9a9A8EFe9A8DCB5f461c4Cc1047E1Dcf9", // WPOL
            usdc: "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582",
            usdt: "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582",
            endpoint: "0x6EDCE65403992e310A62460808c4b910D972f10f"
        }
    };
    
    const config = configs[chainId];
    if (!config) {
        console.error(`No configuration for chain ${chainId}`);
        return;
    }
    
    try {
        // Estimate MockDEXAggregator deployment
        console.log("\nEstimating MockDEXAggregator deployment...");
        const MockDEXAggregator = await ethers.getContractFactory("MockDEXAggregator");
        const dexGasEstimate = await MockDEXAggregator.getDeployTransaction(config.weth).estimateGas();
        const dexCost = dexGasEstimate * (gasPrice.gasPrice || 0n);
        console.log(`DEX Gas estimate: ${dexGasEstimate.toLocaleString()}`);
        console.log(`DEX Cost: ${ethers.formatEther(dexCost)} ETH`);
        
        // For OFT adapter, we need a placeholder DEX address
        const placeholderDex = "0x1234567890123456789012345678901234567890";
        
        // Estimate SimplePropertyOFTAdapter deployment  
        console.log("\nEstimating SimplePropertyOFTAdapter deployment...");
        const SimplePropertyOFTAdapter = await ethers.getContractFactory("SimplePropertyOFTAdapter");
        const adapterGasEstimate = await SimplePropertyOFTAdapter.getDeployTransaction(
            config.weth,
            config.usdc,
            config.usdt,
            config.endpoint,
            deployer.address,
            placeholderDex
        ).estimateGas();
        const adapterCost = adapterGasEstimate * (gasPrice.gasPrice || 0n);
        console.log(`Adapter Gas estimate: ${adapterGasEstimate.toLocaleString()}`);
        console.log(`Adapter Cost: ${ethers.formatEther(adapterCost)} ETH`);
        
        const totalCost = dexCost + adapterCost;
        console.log(`\n📊 SUMMARY:`);
        console.log(`Total gas: ${(dexGasEstimate + adapterGasEstimate).toLocaleString()}`);
        console.log(`Total cost: ${ethers.formatEther(totalCost)} ETH`);
        console.log(`Available: ${ethers.formatEther(balance)} ETH`);
        console.log(`Sufficient: ${balance > totalCost ? '✅' : '❌'}`);
        
        if (balance <= totalCost) {
            const needed = totalCost - balance;
            console.log(`Need additional: ${ethers.formatEther(needed)} ETH`);
        }
        
    } catch (error) {
        console.log("❌ Estimation failed:", error.message);
        
        // Try a simpler approach with fixed estimates
        console.log("\nUsing fallback estimates...");
        const estimatedGas = 6000000n; // Conservative estimate
        const estimatedCost = estimatedGas * (gasPrice.gasPrice || 30000000000n); // 30 gwei fallback
        console.log(`Fallback estimate: ${ethers.formatEther(estimatedCost)} ETH`);
        console.log(`Available: ${ethers.formatEther(balance)} ETH`);
        console.log(`Sufficient: ${balance > estimatedCost ? '✅' : '❌'}`);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("\n❌ Script failed:", error);
        process.exit(1);
    });