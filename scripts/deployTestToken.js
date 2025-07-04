import pkg from "hardhat";
const { ethers } = pkg;
import fs from "fs";

async function main() {
    console.log("=== Deploying Test Token with Mint/Burn Support ===\n");
    
    const [deployer] = await ethers.getSigners();
    console.log("Deploying with account:", deployer.address);
    
    // Get current network
    const network = await ethers.provider.getNetwork();
    const networkName = network.chainId === 11155111n ? "sepolia" :
                       network.chainId === 80002n ? "polygon-amoy" :
                       network.chainId === 421614n ? "arbitrum-sepolia" : 
                       `unknown-${network.chainId}`;
    
    console.log("Network:", networkName);
    
    // Deploy mintable/burnable token
    const MintableBurnableERC20 = await ethers.getContractFactory("MintableBurnableERC20");
    const tokenName = networkName === "polygon-amoy" ? "Test POL" : "Test ETH";
    const tokenSymbol = networkName === "polygon-amoy" ? "tPOL" : "tETH";
    
    console.log(`\nDeploying ${tokenName} (${tokenSymbol})...`);
    const token = await MintableBurnableERC20.deploy(tokenName, tokenSymbol, 18);
    await token.waitForDeployment();
    const tokenAddress = await token.getAddress();
    
    console.log(`✅ Token deployed: ${tokenAddress}`);
    
    // Deploy ElevatedMinterBurner
    console.log("\nDeploying ElevatedMinterBurner...");
    const ElevatedMinterBurner = await ethers.getContractFactory("ElevatedMinterBurner");
    const minterBurner = await ElevatedMinterBurner.deploy(tokenAddress);
    await minterBurner.waitForDeployment();
    const minterBurnerAddress = await minterBurner.getAddress();
    
    console.log(`✅ MinterBurner deployed: ${minterBurnerAddress}`);
    
    // Grant minter role to minterBurner
    console.log("\nGranting minter role...");
    await token.addMinter(minterBurnerAddress);
    console.log("✅ Minter role granted");
    
    // Deploy OFT Adapter
    console.log("\nDeploying OFT Adapter...");
    const OFTAdapter = await ethers.getContractFactory("PropertyMintBurnOFTAdapterV2");
    
    // Load deployments to get endpoint
    const deployments = JSON.parse(fs.readFileSync('./deployments/testnet-deployments.json', 'utf8'));
    const endpoint = deployments[networkName]?.endpoint || "0x6EDCE65403992e310A62460808c4b910D972f10f";
    
    const oftAdapter = await OFTAdapter.deploy(
        tokenAddress,
        minterBurnerAddress,
        endpoint,
        deployer.address,
        false // no transfer fees
    );
    await oftAdapter.waitForDeployment();
    const oftAdapterAddress = await oftAdapter.getAddress();
    
    console.log(`✅ OFT Adapter deployed: ${oftAdapterAddress}`);
    
    // Set OFT adapter as operator
    console.log("\nSetting OFT adapter as operator...");
    await minterBurner.setOperator(oftAdapterAddress, true);
    console.log("✅ Operator set");
    
    // Mint some test tokens to deployer
    console.log("\nMinting test tokens...");
    const mintAmount = ethers.parseEther("10");
    await token.mint(deployer.address, mintAmount);
    console.log(`✅ Minted ${ethers.formatEther(mintAmount)} ${tokenSymbol}`);
    
    // Update deployments
    console.log("\nUpdating deployments file...");
    if (!deployments[networkName]) {
        deployments[networkName] = {};
    }
    if (!deployments[networkName].testTokens) {
        deployments[networkName].testTokens = {};
    }
    
    deployments[networkName].testTokens[tokenSymbol] = {
        token: tokenAddress,
        minterBurner: minterBurnerAddress,
        oftAdapter: oftAdapterAddress,
        deployedAt: new Date().toISOString()
    };
    
    fs.writeFileSync('./deployments/testnet-deployments.json', JSON.stringify(deployments, null, 2));
    console.log("✅ Deployments updated");
    
    console.log("\n=== Deployment Summary ===");
    console.log(`Network: ${networkName}`);
    console.log(`Token: ${tokenAddress}`);
    console.log(`MinterBurner: ${minterBurnerAddress}`);
    console.log(`OFT Adapter: ${oftAdapterAddress}`);
    console.log(`Endpoint: ${endpoint}`);
    
    console.log("\n📝 Next steps:");
    console.log("1. Configure peers on the OFT adapter");
    console.log("2. Set delegate on the adapter");
    console.log("3. Configure enforced options");
    console.log("4. Test cross-chain transfers with the new token");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("\n❌ Script failed:", error);
        process.exit(1);
    });