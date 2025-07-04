import pkg from "hardhat";
const { ethers } = pkg;

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Fixing configuration with:", deployer.address);
    
    const escrowAddress = "0x2ee79369D7cCb53550F1Ca61A1a3bf60B3C92f1E";
    const escrow = await ethers.getContractAt("UniversalEscrowService", escrowAddress);
    
    console.log("\n🔧 Fixing OFT Adapter Configuration...");
    
    // OFT Adapters from deployments
    const adapters = [
        { chainId: 40267, address: "0x12a9d0C6D06fEA1A584e98cd86aDC9EFdD7887df", name: "Polygon Amoy" },
        { chainId: 40231, address: "0x5661438B6C23dDFdC718591c3A85FeE1433Dab36", name: "Arbitrum Sepolia" }
    ];
    
    for (const adapter of adapters) {
        try {
            console.log(`\nSetting OFT adapter for ${adapter.name}...`);
            const tx = await escrow.setOFTAdapter(adapter.chainId, adapter.address, adapter.name);
            console.log(`Transaction: ${tx.hash}`);
            await tx.wait();
            console.log(`✅ Success!`);
        } catch (error) {
            console.log(`❌ Failed: ${error.message}`);
        }
    }
    
    // Verify configuration
    console.log("\n🔍 Verifying OFT Adapters...");
    for (const adapter of adapters) {
        try {
            const configured = await escrow.oftAdapters(adapter.chainId);
            console.log(`${adapter.name}: ${configured === adapter.address ? '✅' : '❌'} ${configured}`);
        } catch (e) {
            console.log(`${adapter.name}: ❌ Error`);
        }
    }
    
    // Update Uniswap router to V2 on Sepolia
    console.log("\n🔧 Updating Uniswap Router...");
    const newRouter = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D"; // Uniswap V2 Router
    try {
        // Check if we can update router (might not have setter function)
        console.log(`Current router: ${await escrow.uniswapRouter()}`);
        console.log(`New router would be: ${newRouter}`);
    } catch (e) {
        console.log("Cannot check router");
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });