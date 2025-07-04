import pkg from "hardhat";
const { ethers } = pkg;

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Configuring with:", deployer.address);
    
    const network = await ethers.provider.getNetwork();
    const chainId = network.chainId.toString();
    const networkName = chainId === "11155111" ? "sepolia" :
                       chainId === "80002" ? "polygon-amoy" :
                       chainId === "421614" ? "arbitrum-sepolia" :
                       `unknown-${chainId}`;
    
    console.log(`Network: ${networkName}`);
    
    // Configuration
    const config = {
        "sepolia": {
            escrow: "0x2ee79369D7cCb53550F1Ca61A1a3bf60B3C92f1E", // New deployment with compose support
            targets: [
                { chainId: 40267, composer: "0xeE455345205F0Ab563f67307bF37E618180da05c", name: "polygon-amoy" },
                { chainId: 40231, composer: "0x8f65178A3281d72E1F50FA9E01D8B3884229ddC8", name: "arbitrum-sepolia" }
            ]
        },
        "polygon-amoy": {
            escrow: "0x53E4b9A8f7b1185768cef74d9564cbeD052a9682",
            targets: [
                { chainId: 40161, composer: "0x3e6d2247055683d53a16Fc935E24D30065a6DB05", name: "sepolia" },
                { chainId: 40231, composer: "0x8f65178A3281d72E1F50FA9E01D8B3884229ddC8", name: "arbitrum-sepolia" }
            ]
        },
        "arbitrum-sepolia": {
            escrow: "0xd3b5A13C113328C4F4F1AbF646a2be2AaC8815B5",
            targets: [
                { chainId: 40161, composer: "0x3e6d2247055683d53a16Fc935E24D30065a6DB05", name: "sepolia" },
                { chainId: 40267, composer: "0xeE455345205F0Ab563f67307bF37E618180da05c", name: "polygon-amoy" }
            ]
        }
    };
    
    const currentConfig = config[networkName];
    if (!currentConfig) {
        console.log("Network not configured");
        return;
    }
    
    const escrow = await ethers.getContractAt("UniversalEscrowService", currentConfig.escrow);
    
    console.log("\n⚙️ Configuring composers...");
    
    for (const target of currentConfig.targets) {
        try {
            console.log(`\nSetting composer for ${target.name} (${target.chainId})...`);
            console.log(`Composer address: ${target.composer}`);
            
            const tx = await escrow.setSwapComposer(target.chainId, target.composer, {
                gasLimit: 100000
            });
            
            console.log(`Transaction: ${tx.hash}`);
            const receipt = await tx.wait();
            console.log(`✅ Success! Gas used: ${receipt.gasUsed}`);
            
        } catch (error) {
            console.log(`❌ Failed: ${error.message}`);
            
            // Try to decode the error
            if (error.data) {
                try {
                    const iface = new ethers.Interface([
                        "error UnauthorizedCaller()",
                        "error InvalidChainId()"
                    ]);
                    const decoded = iface.parseError(error.data);
                    console.log(`Error type: ${decoded.name}`);
                } catch (e) {
                    console.log(`Raw error data: ${error.data}`);
                }
            }
        }
    }
    
    // Verify configuration
    console.log("\n🔍 Verifying configuration...");
    for (const target of currentConfig.targets) {
        try {
            const composer = await escrow.getSwapComposer(target.chainId);
            console.log(`${target.name}: ${composer === target.composer ? '✅' : '❌'} ${composer}`);
        } catch (e) {
            console.log(`${target.name}: ❌ Error checking`);
        }
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });