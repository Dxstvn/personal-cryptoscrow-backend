import pkg from "hardhat";
const { ethers } = pkg;

async function main() {
    console.log("=== Checking OFT Adapter Configuration ===\n");
    
    const network = await ethers.provider.getNetwork();
    const chainId = network.chainId.toString();
    const networkName = chainId === "11155111" ? "sepolia" :
                       chainId === "80002" ? "polygon-amoy" :
                       chainId === "421614" ? "arbitrum-sepolia" :
                       `unknown-${chainId}`;
    
    console.log(`Network: ${networkName} (${chainId})\n`);
    
    // OFT Adapter addresses
    const adapters = {
        "sepolia": "0x90653738e66A0fa93BF20b087e6A39A704FA39e1",
        "polygon-amoy": "0x12a9d0C6D06fEA1A584e98cd86aDC9EFdD7887df",
        "arbitrum-sepolia": "0x5661438B6C23dDFdC718591c3A85FeE1433Dab36"
    };
    
    const escrowAddresses = {
        "sepolia": "0x2ee79369D7cCb53550F1Ca61A1a3bf60B3C92f1E",
        "polygon-amoy": "0x53E4b9A8f7b1185768cef74d9564cbeD052a9682",
        "arbitrum-sepolia": "0xd3b5A13C113328C4F4F1AbF646a2be2AaC8815B5"
    };
    
    const currentAdapter = adapters[networkName];
    const currentEscrow = escrowAddresses[networkName];
    
    if (!currentAdapter || !currentEscrow) {
        console.log("No configuration for this network");
        return;
    }
    
    console.log("🔍 Checking OFT Adapter...");
    console.log(`Address: ${currentAdapter}`);
    
    try {
        const adapter = await ethers.getContractAt("SimplePropertyOFTAdapter", currentAdapter);
        
        // Check basic configuration
        const endpoint = await adapter.endpoint();
        const weth = await adapter.WETH();
        const oftEnabled = await adapter.oftEnabled();
        
        console.log(`\nBasic Configuration:`);
        console.log(`Endpoint: ${endpoint}`);
        console.log(`WETH: ${weth}`);
        console.log(`OFT Enabled: ${oftEnabled}`);
        
        // Check trusted remotes
        console.log(`\n🔗 Trusted Remotes:`);
        const remoteChains = {
            "sepolia": [
                { id: 40267, name: "Polygon Amoy" },
                { id: 40231, name: "Arbitrum Sepolia" }
            ],
            "polygon-amoy": [
                { id: 40161, name: "Sepolia" },
                { id: 40231, name: "Arbitrum Sepolia" }
            ],
            "arbitrum-sepolia": [
                { id: 40161, name: "Sepolia" },
                { id: 40267, name: "Polygon Amoy" }
            ]
        };
        
        for (const remote of remoteChains[networkName] || []) {
            try {
                const trustedRemote = await adapter.getTrustedRemoteAddress(remote.id);
                console.log(`${remote.name} (${remote.id}): ${trustedRemote !== "0x" ? '✅' : '❌'} ${trustedRemote}`);
            } catch (e) {
                console.log(`${remote.name} (${remote.id}): ❌ Not configured`);
            }
        }
        
    } catch (error) {
        console.log(`Error checking adapter: ${error.message}`);
    }
    
    console.log("\n🔍 Checking Escrow Service OFT Configuration...");
    try {
        const escrow = await ethers.getContractAt("UniversalEscrowService", currentEscrow);
        
        // Check OFT adapters in escrow
        console.log("\nOFT Adapters in Escrow:");
        const chainIds = {
            "sepolia": [40267, 40231],
            "polygon-amoy": [40161, 40231],
            "arbitrum-sepolia": [40161, 40267]
        };
        
        for (const remoteChainId of chainIds[networkName] || []) {
            try {
                const oftAdapter = await escrow.oftAdapters(remoteChainId);
                const chainName = remoteChainId === 40161 ? "Sepolia" :
                                 remoteChainId === 40267 ? "Polygon Amoy" :
                                 remoteChainId === 40231 ? "Arbitrum Sepolia" : 
                                 `Chain ${remoteChainId}`;
                console.log(`${chainName}: ${oftAdapter !== ethers.ZeroAddress ? '✅' : '❌'} ${oftAdapter}`);
            } catch (e) {
                console.log(`Chain ${remoteChainId}: ❌ Error`);
            }
        }
        
    } catch (error) {
        console.log(`Error checking escrow: ${error.message}`);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });