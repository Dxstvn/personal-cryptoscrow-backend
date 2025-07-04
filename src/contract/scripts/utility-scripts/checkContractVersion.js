import pkg from "hardhat";
const { ethers } = pkg;

async function main() {
    console.log("=== Checking Contract Versions ===\n");
    
    const contracts = {
        "sepolia": {
            escrow: "0x335Bb94C802E224Bc3D7afE9d65902df9984ed08",
            composer: "0x3e6d2247055683d53a16Fc935E24D30065a6DB05"
        },
        "polygon-amoy": {
            escrow: "0x53E4b9A8f7b1185768cef74d9564cbeD052a9682",
            composer: "0xeE455345205F0Ab563f67307bF37E618180da05c"
        },
        "arbitrum-sepolia": {
            escrow: "0xd3b5A13C113328C4F4F1AbF646a2be2AaC8815B5",
            composer: "0x8f65178A3281d72E1F50FA9E01D8B3884229ddC8"
        }
    };
    
    const network = await ethers.provider.getNetwork();
    const chainId = network.chainId.toString();
    const networkName = chainId === "11155111" ? "sepolia" :
                       chainId === "80002" ? "polygon-amoy" :
                       chainId === "421614" ? "arbitrum-sepolia" :
                       `unknown-${chainId}`;
    
    console.log(`Current network: ${networkName}\n`);
    
    const config = contracts[networkName];
    
    // Check escrow contract
    console.log("🔍 Checking UniversalEscrowService...");
    try {
        const escrow = await ethers.getContractAt("UniversalEscrowService", config.escrow);
        
        // Try to call functions that exist in the new version
        console.log(`Address: ${config.escrow}`);
        console.log(`Owner: ${await escrow.owner()}`);
        
        // Check for compose-related functions
        try {
            const receiveGas = await escrow.lzReceiveGas();
            const composeGas = await escrow.lzComposeGas();
            console.log(`✅ Has compose support (receive: ${receiveGas}, compose: ${composeGas})`);
            
            // Try to get a swap composer
            try {
                const composer = await escrow.getSwapComposer(40267);
                console.log(`✅ getSwapComposer works`);
            } catch (e) {
                console.log(`❌ getSwapComposer failed: ${e.message}`);
            }
        } catch (e) {
            console.log(`❌ No compose support - this is an old version!`);
            console.log(`   This contract needs to be redeployed to support compose functionality`);
        }
        
    } catch (error) {
        console.log(`Error checking escrow: ${error.message}`);
    }
    
    // Check composer contract
    console.log("\n🔍 Checking EscrowSwapComposer...");
    try {
        const composer = await ethers.getContractAt("EscrowSwapComposer", config.composer);
        console.log(`Address: ${config.composer}`);
        
        // Check basic functions
        const endpoint = await composer.oApp();
        const weth = await composer.WETH();
        console.log(`Endpoint: ${endpoint}`);
        console.log(`WETH: ${weth}`);
        
    } catch (error) {
        console.log(`Error checking composer: ${error.message}`);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });