import pkg from "hardhat";
const { ethers } = pkg;
import fs from "fs";
import path from "path";

async function main() {
    console.log("=== Complete Infrastructure Deployment ===\n");
    
    const [deployer] = await ethers.getSigners();
    console.log("Deployer:", deployer.address);
    
    // Get network info
    const network = await ethers.provider.getNetwork();
    const chainId = network.chainId.toString();
    const networkName = chainId === "11155111" ? "sepolia" :
                       chainId === "80002" ? "polygon-amoy" :
                       chainId === "421614" ? "arbitrum-sepolia" :
                       `unknown-${chainId}`;
    
    console.log(`Network: ${networkName} (Chain ID: ${chainId})`);
    
    // Load existing deployments
    const deploymentPath = path.join(process.cwd(), "deployments", "testnet-deployments.json");
    let deployments = {};
    if (fs.existsSync(deploymentPath)) {
        deployments = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
    }
    
    // Check what's already deployed
    const escrowDeployed = deployments[networkName]?.universalEscrowService?.address;
    const composerDeployed = deployments[networkName]?.swapComposer?.address;
    
    console.log("\n📋 Current Status:");
    console.log(`UniversalEscrowService: ${escrowDeployed || "Not deployed"}`);
    console.log(`EscrowSwapComposer: ${composerDeployed || "Not deployed"}`);
    
    // Known addresses from other networks
    const knownAddresses = {
        "sepolia": {
            escrow: "0x335Bb94C802E224Bc3D7afE9d65902df9984ed08",
            oftAdapter: "0x90653738e66A0fa93BF20b087e6A39A704FA39e1"
        },
        "polygon-amoy": {
            escrow: deployments["polygon-amoy"]?.universalEscrowService?.address,
            oftAdapter: "0x12a9d0C6D06fEA1A584e98cd86aDC9EFdD7887df"
        },
        "arbitrum-sepolia": {
            escrow: deployments["arbitrum-sepolia"]?.universalEscrowService?.address,
            oftAdapter: "0x5661438B6C23dDFdC718591c3A85FeE1433Dab36"
        }
    };
    
    // LayerZero chain IDs
    const lzChainIds = {
        "sepolia": 40161,
        "polygon-amoy": 40267,
        "arbitrum-sepolia": 40231
    };
    
    let escrowAddress = escrowDeployed || knownAddresses[networkName]?.escrow;
    
    // Step 1: Deploy UniversalEscrowService if needed
    if (!escrowAddress) {
        console.log("\n🚀 Deploying UniversalEscrowService...");
        
        const configs = {
            "sepolia": {
                weth: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14",
                uniswapRouter: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
                serviceWallet: deployer.address
            },
            "polygon-amoy": {
                weth: "0x360ad4f9a9A8EFe9A8DCB5f461c4Cc1047E1Dcf9",
                uniswapRouter: "0xedf6066a2b290C185783862C7F4776A2C8077AD1",
                serviceWallet: deployer.address
            },
            "arbitrum-sepolia": {
                weth: "0x980B62Da83eFf3D4576C647993b0c1D7faf17c73",
                uniswapRouter: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
                serviceWallet: deployer.address
            }
        };
        
        const config = configs[networkName];
        if (!config) {
            console.log("❌ Network configuration not found");
            return;
        }
        
        const UniversalEscrowService = await ethers.getContractFactory("UniversalEscrowService");
        const escrow = await UniversalEscrowService.deploy(
            config.serviceWallet,
            config.weth,
            config.uniswapRouter,
            { gasLimit: 5000000 }
        );
        
        await escrow.waitForDeployment();
        escrowAddress = await escrow.getAddress();
        console.log(`✅ UniversalEscrowService deployed at: ${escrowAddress}`);
        
        // Save deployment
        if (!deployments[networkName]) {
            deployments[networkName] = {};
        }
        deployments[networkName].universalEscrowService = {
            address: escrowAddress,
            deployedAt: new Date().toISOString(),
            deployer: deployer.address
        };
        fs.writeFileSync(deploymentPath, JSON.stringify(deployments, null, 2));
        
        // Configure OFT adapters
        console.log("\n⚙️ Configuring OFT adapters...");
        for (const [targetNetwork, targetChainId] of Object.entries(lzChainIds)) {
            if (targetNetwork !== networkName) {
                const oftAdapter = knownAddresses[targetNetwork]?.oftAdapter;
                if (oftAdapter) {
                    try {
                        const tx = await escrow.setOFTAdapter(targetChainId, oftAdapter, targetNetwork);
                        await tx.wait();
                        console.log(`✅ Set OFT adapter for ${targetNetwork}: ${oftAdapter}`);
                    } catch (error) {
                        console.log(`⚠️ Failed to set OFT adapter for ${targetNetwork}: ${error.message}`);
                    }
                }
            }
        }
    } else {
        console.log(`\n✅ UniversalEscrowService already deployed at: ${escrowAddress}`);
    }
    
    // Step 2: Deploy EscrowSwapComposer if needed
    if (!composerDeployed) {
        console.log("\n🚀 Deploying EscrowSwapComposer...");
        
        const composerConfigs = {
            "sepolia": {
                endpoint: "0x6EDCE65403992e310A62460808c4b910D972f10f",
                weth: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14",
                uniswapV2: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
                uniswapV3: "0xE592427A0AEce92De3Edee1F18E0157C05861564"
            },
            "polygon-amoy": {
                endpoint: "0x6EDCE65403992e310A62460808c4b910D972f10f",
                weth: "0x360ad4f9a9A8EFe9A8DCB5f461c4Cc1047E1Dcf9",
                uniswapV2: "0xedf6066a2b290C185783862C7F4776A2C8077AD1",
                uniswapV3: ethers.ZeroAddress
            },
            "arbitrum-sepolia": {
                endpoint: "0x6EDCE65403992e310A62460808c4b910D972f10f",
                weth: "0x980B62Da83eFf3D4576C647993b0c1D7faf17c73",
                uniswapV2: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
                uniswapV3: ethers.ZeroAddress
            }
        };
        
        const composerConfig = composerConfigs[networkName];
        if (!composerConfig) {
            console.log("❌ Composer configuration not found");
            return;
        }
        
        const EscrowSwapComposer = await ethers.getContractFactory("EscrowSwapComposer");
        const composer = await EscrowSwapComposer.deploy(
            composerConfig.endpoint,
            composerConfig.weth,
            composerConfig.uniswapV2,
            composerConfig.uniswapV3
        );
        
        await composer.waitForDeployment();
        const composerAddress = await composer.getAddress();
        console.log(`✅ EscrowSwapComposer deployed at: ${composerAddress}`);
        
        // Authorize OFT adapter
        const oftAdapter = knownAddresses[networkName]?.oftAdapter;
        if (oftAdapter) {
            console.log(`\n🔐 Authorizing OFT adapter: ${oftAdapter}`);
            const authTx = await composer.setAuthorizedCaller(oftAdapter, true);
            await authTx.wait();
            console.log(`✅ OFT adapter authorized`);
        }
        
        // Save composer deployment
        deployments[networkName].swapComposer = {
            address: composerAddress,
            endpoint: composerConfig.endpoint,
            weth: composerConfig.weth,
            deployedAt: new Date().toISOString(),
            deployer: deployer.address
        };
        fs.writeFileSync(deploymentPath, JSON.stringify(deployments, null, 2));
        
        // Configure composer in escrow service
        if (escrowAddress) {
            console.log("\n⚙️ Configuring composer in escrow service...");
            const escrow = await ethers.getContractAt("UniversalEscrowService", escrowAddress);
            
            for (const [targetNetwork, targetChainId] of Object.entries(lzChainIds)) {
                if (targetNetwork !== networkName) {
                    try {
                        const tx = await escrow.setSwapComposer(targetChainId, composerAddress);
                        await tx.wait();
                        console.log(`✅ Set composer for ${targetNetwork} (${targetChainId})`);
                    } catch (error) {
                        console.log(`⚠️ Failed to set composer for ${targetNetwork}: ${error.message}`);
                    }
                }
            }
        }
    } else {
        console.log(`\n✅ EscrowSwapComposer already deployed at: ${composerDeployed}`);
    }
    
    // Step 3: Verify configuration
    console.log("\n🔍 Verifying configuration...");
    
    const escrow = await ethers.getContractAt("UniversalEscrowService", escrowAddress);
    
    console.log("\nOFT Adapters:");
    for (const [network, chainId] of Object.entries(lzChainIds)) {
        if (network !== networkName) {
            try {
                const adapter = await escrow.oftAdapters(chainId);
                console.log(`${network} (${chainId}): ${adapter !== ethers.ZeroAddress ? '✅' : '❌'} ${adapter}`);
            } catch (e) {
                console.log(`${network} (${chainId}): ❌ Error`);
            }
        }
    }
    
    console.log("\nSwap Composers:");
    for (const [network, chainId] of Object.entries(lzChainIds)) {
        if (network !== networkName) {
            try {
                const composer = await escrow.getSwapComposer(chainId);
                console.log(`${network} (${chainId}): ${composer !== ethers.ZeroAddress ? '✅' : '❌'} ${composer}`);
            } catch (e) {
                console.log(`${network} (${chainId}): ❌ Error`);
            }
        }
    }
    
    // Final summary
    console.log("\n✨ Deployment Complete!");
    console.log(`\nNetwork: ${networkName}`);
    console.log(`UniversalEscrowService: ${escrowAddress}`);
    console.log(`EscrowSwapComposer: ${deployments[networkName]?.swapComposer?.address || composerDeployed}`);
    
    console.log("\n📝 Next Steps:");
    console.log("1. Deploy on other networks if needed");
    console.log("2. Cross-configure composers between networks");
    console.log("3. Run enhanced test: npx hardhat run scripts/testUniversalEscrowEnhanced.js --network " + networkName);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("\n❌ Deployment failed:", error);
        process.exit(1);
    });