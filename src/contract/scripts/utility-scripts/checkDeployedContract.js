import pkg from "hardhat";
const { ethers } = pkg;

async function main() {
    console.log("=== Checking Deployed Contracts ===\n");
    
    const addresses = {
        "Sepolia OFT": "0x90653738e66A0fa93BF20b087e6A39A704FA39e1",
        "Polygon OFT": "0x12a9d0C6D06fEA1A584e98cd86aDC9EFdD7887df",
        "Arbitrum OFT": "0x5661438B6C23dDFdC718591c3A85FeE1433Dab36"
    };
    
    for (const [name, address] of Object.entries(addresses)) {
        console.log(`\n🔍 ${name}: ${address}`);
        
        try {
            // Check if contract exists
            const code = await ethers.provider.getCode(address);
            if (code === '0x') {
                console.log("❌ No contract deployed at this address");
                continue;
            }
            
            console.log("✅ Contract exists");
            
            // Try to get basic info
            try {
                // Try PropertyOFTAdapter interface
                const adapter = await ethers.getContractAt("PropertyOFTAdapter", address);
                const endpoint = await adapter.endpoint();
                console.log(`Endpoint: ${endpoint}`);
                
                // Check if it has oftEnabled
                try {
                    const oftEnabled = await adapter.oftEnabled();
                    console.log(`OFT Enabled: ${oftEnabled}`);
                } catch (e) {
                    console.log("No oftEnabled function");
                }
                
                // Check if it has WETH
                try {
                    const weth = await adapter.WETH();
                    console.log(`WETH: ${weth}`);
                } catch (e) {
                    console.log("No WETH function");
                }
                
            } catch (error) {
                console.log("Could not read as PropertyOFTAdapter");
                
                // Try OFTAdapter interface
                try {
                    const adapter = await ethers.getContractAt("OFTAdapter", address);
                    const token = await adapter.token();
                    console.log(`Token: ${token}`);
                } catch (e) {
                    console.log("Could not read as OFTAdapter");
                }
            }
            
        } catch (error) {
            console.log(`Error: ${error.message}`);
        }
    }
    
    console.log("\n\n🎯 Recommendation:");
    console.log("The Sepolia OFT adapter appears to be an older PropertyOFTAdapter");
    console.log("that doesn't support LayerZero V2's quoteSend interface.");
    console.log("\nTo fix this, we need to deploy new SimplePropertyOFTAdapter contracts");
    console.log("that support the latest LayerZero V2 interfaces.");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });