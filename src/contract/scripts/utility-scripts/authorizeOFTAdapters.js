import pkg from "hardhat";
const { ethers } = pkg;

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Authorizing with:", deployer.address);
    
    const network = await ethers.provider.getNetwork();
    const chainId = network.chainId.toString();
    const networkName = chainId === "11155111" ? "sepolia" :
                       chainId === "80002" ? "polygon-amoy" :
                       chainId === "421614" ? "arbitrum-sepolia" :
                       `unknown-${chainId}`;
    
    console.log(`Network: ${networkName}\n`);
    
    // Configuration
    const config = {
        "sepolia": {
            composer: "0x3e6d2247055683d53a16Fc935E24D30065a6DB05",
            oftAdapter: "0x90653738e66A0fa93BF20b087e6A39A704FA39e1"
        },
        "polygon-amoy": {
            composer: "0xeE455345205F0Ab563f67307bF37E618180da05c",
            oftAdapter: "0x12a9d0C6D06fEA1A584e98cd86aDC9EFdD7887df"
        },
        "arbitrum-sepolia": {
            composer: "0x8f65178A3281d72E1F50FA9E01D8B3884229ddC8",
            oftAdapter: "0x5661438B6C23dDFdC718591c3A85FeE1433Dab36"
        }
    };
    
    const currentConfig = config[networkName];
    if (!currentConfig) {
        console.log("Network not configured");
        return;
    }
    
    console.log("🔐 Authorizing OFT Adapter in Composer...");
    console.log(`Composer: ${currentConfig.composer}`);
    console.log(`OFT Adapter: ${currentConfig.oftAdapter}`);
    
    try {
        const composer = await ethers.getContractAt("EscrowSwapComposer", currentConfig.composer);
        
        // Check current authorization
        const isAuthorized = await composer.authorizedCallers(currentConfig.oftAdapter);
        console.log(`Current authorization: ${isAuthorized ? '✅ Authorized' : '❌ Not authorized'}`);
        
        if (!isAuthorized) {
            console.log("\n📝 Setting authorization...");
            const tx = await composer.setAuthorizedCaller(currentConfig.oftAdapter, true);
            console.log(`Transaction: ${tx.hash}`);
            
            const receipt = await tx.wait();
            console.log(`✅ Success! Gas used: ${receipt.gasUsed}`);
            
            // Verify
            const newAuth = await composer.authorizedCallers(currentConfig.oftAdapter);
            console.log(`New authorization: ${newAuth ? '✅ Authorized' : '❌ Failed'}`);
        } else {
            console.log("\n✅ Already authorized, no action needed");
        }
        
        // Check owner
        const owner = await composer.owner();
        console.log(`\nComposer owner: ${owner}`);
        
    } catch (error) {
        console.log(`❌ Error: ${error.message}`);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });