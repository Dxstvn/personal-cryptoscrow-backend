import pkg from "hardhat";
const { ethers } = pkg;

async function main() {
    const [signer] = await ethers.getSigners();
    console.log("Current signer:", signer.address);
    
    const network = await ethers.provider.getNetwork();
    const chainId = network.chainId.toString();
    const networkName = chainId === "11155111" ? "sepolia" :
                       chainId === "80002" ? "polygon-amoy" :
                       chainId === "421614" ? "arbitrum-sepolia" :
                       `unknown-${chainId}`;
    
    console.log(`Network: ${networkName}`);
    
    const escrowAddresses = {
        "sepolia": "0x335Bb94C802E224Bc3D7afE9d65902df9984ed08",
        "polygon-amoy": "0x53E4b9A8f7b1185768cef74d9564cbeD052a9682",
        "arbitrum-sepolia": "0xd3b5A13C113328C4F4F1AbF646a2be2AaC8815B5"
    };
    
    const escrowAddress = escrowAddresses[networkName];
    if (!escrowAddress) {
        console.log("No escrow address for this network");
        return;
    }
    
    try {
        const escrow = await ethers.getContractAt("UniversalEscrowService", escrowAddress);
        const owner = await escrow.owner();
        console.log("\nEscrow contract owner:", owner);
        console.log("Is current signer owner?", owner.toLowerCase() === signer.address.toLowerCase() ? "✅ Yes" : "❌ No");
        
        // Check if composers are already set
        const chainIds = {
            "sepolia": [40267, 40231],
            "polygon-amoy": [40161, 40231],
            "arbitrum-sepolia": [40161, 40267]
        };
        
        console.log("\nCurrent composer configuration:");
        for (const targetChainId of chainIds[networkName] || []) {
            try {
                const composer = await escrow.getSwapComposer(targetChainId);
                console.log(`Chain ${targetChainId}: ${composer !== ethers.ZeroAddress ? composer : "Not set"}`);
            } catch (e) {
                console.log(`Chain ${targetChainId}: Error checking`);
            }
        }
    } catch (error) {
        console.log("Error:", error.message);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });