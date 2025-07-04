import pkg from "hardhat";
const { ethers } = pkg;
import fs from "fs";
import path from "path";

async function main() {
    console.log("=== Deploy Escrow Swap Composer ===\n");
    
    const [deployer] = await ethers.getSigners();
    console.log("Deploying with account:", deployer.address);
    
    // Get network info
    const network = await ethers.provider.getNetwork();
    const chainId = network.chainId.toString();
    const networkName = chainId === "11155111" ? "sepolia" :
                       chainId === "80002" ? "polygon-amoy" :
                       chainId === "421614" ? "arbitrum-sepolia" :
                       `unknown-${chainId}`;
    
    console.log(`Network: ${networkName} (Chain ID: ${chainId})`);
    
    // Configuration
    const config = {
        "sepolia": {
            endpoint: "0x6EDCE65403992e310A62460808c4b910D972f10f",
            weth: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14",
            uniswapV2: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D", // Uniswap V2 on Sepolia
            uniswapV3: "0xE592427A0AEce92De3Edee1F18E0157C05861564", // Swap Router
            escrow: "0x335Bb94C802E224Bc3D7afE9d65902df9984ed08"
        },
        "polygon-amoy": {
            endpoint: "0x6EDCE65403992e310A62460808c4b910D972f10f",
            weth: "0x360ad4f9a9A8EFe9A8DCB5f461c4Cc1047E1Dcf9", // WPOL on Amoy
            uniswapV2: "0xedf6066a2b290C185783862C7F4776A2C8077AD1", // QuickSwap on Polygon
            uniswapV3: "", // Add if available
            escrow: "" // Will be set if deployed
        },
        "arbitrum-sepolia": {
            endpoint: "0x6EDCE65403992e310A62460808c4b910D972f10f",
            weth: "0x980B62Da83eFf3D4576C647993b0c1D7faf17c73",
            uniswapV2: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D", // Uniswap V2 on Arbitrum
            uniswapV3: "", // Add if available
            escrow: "" // Will be set if deployed
        }
    };
    
    const networkConfig = config[networkName];
    if (!networkConfig) {
        console.log("❌ Network not configured");
        return;
    }
    
    console.log("\n📋 Configuration:");
    console.log(`Endpoint: ${networkConfig.endpoint}`);
    console.log(`WETH: ${networkConfig.weth}`);
    console.log(`UniswapV2: ${networkConfig.uniswapV2 || "Not configured"}`);
    console.log(`UniswapV3: ${networkConfig.uniswapV3 || "Not configured"}`);
    
    // Deploy Composer
    console.log("\n🚀 Deploying EscrowSwapComposer...");
    
    try {
        const EscrowSwapComposer = await ethers.getContractFactory("EscrowSwapComposer");
        const composer = await EscrowSwapComposer.deploy(
            networkConfig.endpoint,
            networkConfig.weth,
            networkConfig.uniswapV2 || ethers.ZeroAddress,
            networkConfig.uniswapV3 || ethers.ZeroAddress
        );
        
        await composer.waitForDeployment();
        const composerAddress = await composer.getAddress();
        
        console.log(`✅ EscrowSwapComposer deployed at: ${composerAddress}`);
        
        // Get OFT adapter from deployments
        const deploymentPath = path.join(process.cwd(), "deployments", "testnet-deployments.json");
        let deployments = {};
        
        if (fs.existsSync(deploymentPath)) {
            deployments = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
        }
        
        const oftAdapter = deployments[networkName]?.standardOftAdapters?.WETH?.address;
        
        if (oftAdapter) {
            console.log("\n🔐 Authorizing OFT adapter...");
            const authTx = await composer.setAuthorizedCaller(oftAdapter, true);
            await authTx.wait();
            console.log(`✅ Authorized OFT adapter: ${oftAdapter}`);
        }
        
        // If escrow exists, configure it
        if (networkConfig.escrow) {
            console.log("\n⚙️ Configuring escrow service...");
            
            const escrow = await ethers.getContractAt("UniversalEscrowService", networkConfig.escrow);
            
            // Get LayerZero chain IDs
            const chainIds = {
                "sepolia": 40161,
                "polygon-amoy": 40267,
                "arbitrum-sepolia": 40231
            };
            
            // Set this composer for OTHER chains (not current chain)
            for (const [targetNetwork, targetChainId] of Object.entries(chainIds)) {
                if (targetNetwork !== networkName) {
                    console.log(`\nSetting composer for ${targetNetwork}...`);
                    try {
                        const setComposerTx = await escrow.setSwapComposer(targetChainId, composerAddress);
                        await setComposerTx.wait();
                        console.log(`✅ Composer set for chain ${targetChainId}`);
                    } catch (error) {
                        console.log(`⚠️ Could not set composer: ${error.message}`);
                    }
                }
            }
        } else {
            console.log("\n⚠️ No escrow service configured on this network yet.");
            console.log("After deploying UniversalEscrowService, manually set composers:");
            console.log(`await escrow.setSwapComposer(CHAIN_ID, "${composerAddress}")`);
        }
        
        // Save deployment
        console.log("\n💾 Saving deployment...");
        
        if (!deployments[networkName]) {
            deployments[networkName] = {};
        }
        
        deployments[networkName].swapComposer = {
            address: composerAddress,
            endpoint: networkConfig.endpoint,
            weth: networkConfig.weth,
            deployedAt: new Date().toISOString(),
            deployer: deployer.address
        };
        
        fs.writeFileSync(deploymentPath, JSON.stringify(deployments, null, 2));
        console.log(`📁 Deployment saved to ${deploymentPath}`);
        
        // Display summary
        console.log("\n✅ Deployment Summary:");
        console.log(`Composer Address: ${composerAddress}`);
        console.log(`Network: ${networkName}`);
        console.log(`WETH Address: ${networkConfig.weth}`);
        
        console.log("\n📝 Next Steps:");
        console.log("1. Deploy this composer on all destination chains");
        console.log("2. Authorize OFT adapters to call the composer");
        console.log("3. Configure source chain escrow with composer addresses");
        console.log("4. Test cross-chain transfers with automatic swaps");
        
    } catch (error) {
        console.error("\n❌ Deployment failed:", error);
        throw error;
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });