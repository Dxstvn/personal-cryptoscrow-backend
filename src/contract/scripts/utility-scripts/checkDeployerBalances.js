import pkg from "hardhat";
const { ethers } = pkg;

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Deployer:", deployer.address);
    
    const network = await ethers.provider.getNetwork();
    const chainId = network.chainId.toString();
    const networkName = chainId === "11155111" ? "sepolia" :
                       chainId === "80002" ? "polygon-amoy" :
                       chainId === "421614" ? "arbitrum-sepolia" :
                       `unknown-${chainId}`;
    
    const balance = await ethers.provider.getBalance(deployer.address);
    const symbol = networkName === "polygon-amoy" ? "POL" : "ETH";
    
    console.log(`Network: ${networkName}`);
    console.log(`Balance: ${ethers.formatEther(balance)} ${symbol}`);
    
    if (balance === 0n) {
        console.log("\n❌ No funds available for deployment!");
        console.log("Please fund the deployer address with test tokens from a faucet:");
        
        if (networkName === "sepolia") {
            console.log("https://sepoliafaucet.com/");
        } else if (networkName === "polygon-amoy") {
            console.log("https://faucet.polygon.technology/");
        } else if (networkName === "arbitrum-sepolia") {
            console.log("https://faucet.triangleplatform.com/arbitrum/sepolia");
        }
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });