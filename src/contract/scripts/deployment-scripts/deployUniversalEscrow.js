import pkg from "hardhat";
const { ethers } = pkg;

async function main() {
    console.log("=== Deploying Universal Escrow Service ===\n");
    
    const [deployer] = await ethers.getSigners();
    console.log("Deploying with account:", deployer.address);
    
    // Get network info
    const network = await ethers.provider.getNetwork();
    const chainId = network.chainId.toString();
    const networkName = chainId === "11155111" ? "sepolia" :
                       chainId === "80002" ? "polygon-amoy" :
                       chainId === "421614" ? "arbitrum-sepolia" :
                       chainId === "31337" ? "localhost" :
                       `unknown-${chainId}`;
    
    console.log(`Network: ${networkName} (Chain ID: ${chainId})`);
    
    // Network-specific configurations
    const configs = {
        "sepolia": {
            weth: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14",
            uniswapRouter: "0xC532a74256D3Db42D0Bf7a0400fEFDbad7694008", // Sepolia Uniswap V2
            serviceWallet: deployer.address, // Use deployer as service wallet for testing
            name: "Sepolia Testnet"
        },
        "polygon-amoy": {
            weth: "0x360ad4f9a9A8EFe9A8DCB5f461c4Cc1047E1Dcf9", // WPOL on Polygon
            uniswapRouter: "0x8954AfA98594b838bda56FE4C12a09D7739D179b", // QuickSwap on Polygon Amoy
            serviceWallet: deployer.address,
            name: "Polygon Amoy Testnet"
        },
        "arbitrum-sepolia": {
            weth: "0x980B62Da83eFf3D4576C647993b0c1D7faf17c73",
            uniswapRouter: "0x101fE6B0AC74c3D32A6ce5Fb01B6a0A02eE1Bf7E", // Arbitrum Sepolia Router
            serviceWallet: deployer.address,
            name: "Arbitrum Sepolia Testnet"
        },
        "localhost": {
            weth: "0x5FbDB2315678afecb367f032d93F642f64180aa3", // Mock WETH
            uniswapRouter: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512", // Mock Router
            serviceWallet: deployer.address,
            name: "Local Hardhat"
        }
    };
    
    const config = configs[networkName];
    if (!config) {
        console.error(`No configuration for ${networkName}`);
        return;
    }
    
    console.log(`\n📋 Configuration:`);
    console.log(`   WETH: ${config.weth}`);
    console.log(`   Uniswap Router: ${config.uniswapRouter}`);
    console.log(`   Service Wallet: ${config.serviceWallet}`);
    
    // Deploy Universal Escrow Service
    console.log(`\n🚀 Deploying Universal Escrow Service...`);
    
    const UniversalEscrowService = await ethers.getContractFactory("UniversalEscrowService");
    const escrowService = await UniversalEscrowService.deploy(
        config.serviceWallet,
        config.weth,
        config.uniswapRouter
    );
    
    await escrowService.waitForDeployment();
    const escrowAddress = await escrowService.getAddress();
    
    console.log(`✅ Universal Escrow Service deployed at: ${escrowAddress}`);
    
    // Verify deployment
    console.log(`\n🔍 Verifying deployment...`);
    try {
        const serviceWallet = await escrowService.serviceWallet();
        const weth = await escrowService.WETH();
        const router = await escrowService.uniswapRouter();
        const serviceFee = await escrowService.SERVICE_FEE_BPS();
        const maxSlippage = await escrowService.maxSlippageBps();
        
        console.log(`   Service Wallet: ${serviceWallet}`);
        console.log(`   WETH: ${weth}`);
        console.log(`   Uniswap Router: ${router}`);
        console.log(`   Service Fee: ${serviceFee / 100}% (${serviceFee} BPS)`);
        console.log(`   Max Slippage: ${maxSlippage / 100}% (${maxSlippage} BPS)`);
        
        console.log(`\n✅ Deployment verification successful!`);
        
    } catch (error) {
        console.log(`❌ Verification error: ${error.message}`);
    }
    
    // Configure OFT adapters if we have them
    console.log(`\n⚙️  Configuring LayerZero OFT Adapters...`);
    
    const oftAdapters = {
        "sepolia": {
            adapters: [
                { chainId: 40267, address: "0x12a9d0C6D06fEA1A584e98cd86aDC9EFdD7887df", name: "Polygon Amoy" },
                { chainId: 40231, address: "0xf829798145e7128c820CdeC5B1cB2Fa2A2008597", name: "Arbitrum Sepolia" }
            ]
        },
        "polygon-amoy": {
            adapters: [
                { chainId: 40161, address: "0xabB44feF0521d1Fc5Df081A95D5D13FF2bD5b297", name: "Sepolia" },
                { chainId: 40231, address: "0xf829798145e7128c820CdeC5B1cB2Fa2A2008597", name: "Arbitrum Sepolia" }
            ]
        },
        "arbitrum-sepolia": {
            adapters: [
                { chainId: 40161, address: "0xabB44feF0521d1Fc5Df081A95D5D13FF2bD5b297", name: "Sepolia" },
                { chainId: 40267, address: "0x12a9d0C6D06fEA1A584e98cd86aDC9EFdD7887df", name: "Polygon Amoy" }
            ]
        }
    };
    
    if (oftAdapters[networkName]) {
        for (const adapter of oftAdapters[networkName].adapters) {
            try {
                const tx = await escrowService.setOFTAdapter(
                    adapter.chainId,
                    adapter.address,
                    adapter.name
                );
                await tx.wait();
                console.log(`   ✅ ${adapter.name} (${adapter.chainId}): ${adapter.address}`);
            } catch (error) {
                console.log(`   ❌ ${adapter.name} failed: ${error.message}`);
            }
        }
    } else {
        console.log(`   ⚠️  No OFT adapters configured for ${networkName}`);
    }
    
    console.log(`\n🎯 UNIVERSAL ESCROW SERVICE FEATURES:`);
    console.log(`\n💰 Service Features:`);
    console.log(`   • 2% service fee automatically deducted`);
    console.log(`   • Supports any ERC20 token + ETH`);
    console.log(`   • Intelligent routing based on seller requirements`);
    console.log(`   • 5% max slippage protection`);
    
    console.log(`\n🔄 Routing Options:`);
    console.log(`   • Direct Transfer: Same token, same chain`);
    console.log(`   • Uniswap Swap: Different token, same chain`);
    console.log(`   • LayerZero Bridge: Cross-chain transfers`);
    
    console.log(`\n📊 Transaction Flow:`);
    console.log(`   1. Buyer deposits any token → 2% service fee taken`);
    console.log(`   2. When released, system automatically:`);
    console.log(`      - Direct transfer if same token/chain`);
    console.log(`      - Uniswap swap if different token, same chain`);
    console.log(`      - LayerZero bridge if different chain`);
    console.log(`   3. Seller receives exactly what they requested`);
    
    console.log(`\n🚀 Deployment Summary:`);
    console.log(`   Network: ${config.name}`);
    console.log(`   Contract: ${escrowAddress}`);
    console.log(`   Service Wallet: ${config.serviceWallet}`);
    
    console.log(`\n📝 Next Steps:`);
    console.log(`1. Test same-chain escrow (ETH → ETH)`);
    console.log(`2. Test same-chain swap (ETH → ERC20)`);
    console.log(`3. Test cross-chain escrow (requires LayerZero)`);
    console.log(`4. Configure service wallet in production`);
    
    console.log(`\n🧪 Test Commands:`);
    console.log(`   Create Escrow: Call createEscrow() with parameters`);
    console.log(`   Release Escrow: Call releaseEscrow() with escrow ID`);
    console.log(`   Check Status: Call getEscrow() with escrow ID`);
    
    // Create test script examples
    console.log(`\n📋 Example Usage:`);
    console.log(`\n// Create escrow (ETH → ETH, same chain):`);
    console.log(`await escrow.createEscrow(`);
    console.log(`  "${config.serviceWallet}", // seller`);
    console.log(`  "0x0000000000000000000000000000000000000000", // ETH`);
    console.log(`  ethers.parseEther("0.1"), // 0.1 ETH`);
    console.log(`  "0x0000000000000000000000000000000000000000", // ETH`);
    console.log(`  0, // same chain`);
    console.log(`  { value: ethers.parseEther("0.1") }`);
    console.log(`);`);
    
    console.log(`\n// Create escrow (ETH → USDC, same chain):`);
    console.log(`await escrow.createEscrow(`);
    console.log(`  "${config.serviceWallet}", // seller`);
    console.log(`  "0x0000000000000000000000000000000000000000", // ETH`);
    console.log(`  ethers.parseEther("0.1"), // 0.1 ETH`);
    console.log(`  "${config.weth}", // USDC address`);
    console.log(`  0, // same chain`);
    console.log(`  { value: ethers.parseEther("0.1") }`);
    console.log(`);`);
    
    if (oftAdapters[networkName]) {
        const crossChainExample = oftAdapters[networkName].adapters[0];
        console.log(`\n// Create escrow (ETH → ETH, cross-chain to ${crossChainExample.name}):`);
        console.log(`await escrow.createEscrow(`);
        console.log(`  "${config.serviceWallet}", // seller`);
        console.log(`  "0x0000000000000000000000000000000000000000", // ETH`);
        console.log(`  ethers.parseEther("0.1"), // 0.1 ETH`);
        console.log(`  "0x0000000000000000000000000000000000000000", // ETH`);
        console.log(`  ${crossChainExample.chainId}, // ${crossChainExample.name}`);
        console.log(`  { value: ethers.parseEther("0.1") }`);
        console.log(`);`);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("\n❌ Deployment failed:", error);
        process.exit(1);
    });