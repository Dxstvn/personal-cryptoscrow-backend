import pkg from "hardhat";
const { ethers } = pkg;
import fs from "fs";
import path from "path";

async function main() {
    console.log("=== Deploying PropertyOFTAdapterV2 with DEX Integration ===\n");
    
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
            endpoint: "0x6EDCE65403992e310A62460808c4b910D972f10f",
            dexAggregator: null // Will deploy mock for testing
        },
        "polygon-amoy": {
            weth: "0x360ad4f9a9A8EFe9A8DCB5f461c4Cc1047E1Dcf9", // WPOL on Polygon
            endpoint: "0x6EDCE65403992e310A62460808c4b910D972f10f",
            dexAggregator: null
        },
        "arbitrum-sepolia": {
            weth: "0x980B62Da83eFf3D4576C647993b0c1D7faf17c73",
            endpoint: "0x6EDCE65403992e310A62460808c4b910D972f10f",
            dexAggregator: null
        },
        "localhost": {
            weth: "0x5FbDB2315678afecb367f032d93F642f64180aa3", // Mock WETH
            endpoint: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512", // Mock endpoint
            dexAggregator: null
        }
    };
    
    const config = configs[networkName];
    if (!config) {
        console.error(`No configuration for ${networkName}`);
        return;
    }
    
    // Step 1: Deploy Mock DEX Aggregator (for testing)
    console.log("\n1. Deploying Mock DEX Aggregator...");
    const MockDEXAggregator = await ethers.getContractFactory("MockDEXAggregator");
    const dexAggregator = await MockDEXAggregator.deploy(config.weth);
    await dexAggregator.waitForDeployment();
    const dexAddress = await dexAggregator.getAddress();
    console.log(`✅ Mock DEX Aggregator deployed at: ${dexAddress}`);
    
    // Fund the DEX aggregator with some ETH for testing
    const fundTx = await deployer.sendTransaction({
        to: dexAddress,
        value: ethers.parseEther("0.1")
    });
    await fundTx.wait();
    console.log("✅ Funded DEX aggregator with 0.1 ETH");
    
    // Step 2: Deploy PropertyOFTAdapterV2
    console.log("\n2. Deploying PropertyOFTAdapterV2...");
    console.log(`   WETH: ${config.weth}`);
    console.log(`   Endpoint: ${config.endpoint}`);
    console.log(`   Delegate: ${deployer.address}`);
    console.log(`   DEX Aggregator: ${dexAddress}`);
    
    const PropertyOFTAdapterV2 = await ethers.getContractFactory("PropertyOFTAdapterV2");
    const adapter = await PropertyOFTAdapterV2.deploy(
        config.weth,
        config.endpoint,
        deployer.address, // delegate
        dexAddress
    );
    
    await adapter.waitForDeployment();
    const adapterAddress = await adapter.getAddress();
    
    console.log(`\n✅ PropertyOFTAdapterV2 deployed at: ${adapterAddress}`);
    
    // Step 3: Initialize adapter
    console.log("\n3. Initializing adapter...");
    
    // Set delegate on endpoint (this is crucial!)
    const endpointABI = [
        "function setDelegate(address delegate) external"
    ];
    const endpoint = new ethers.Contract(config.endpoint, endpointABI, deployer);
    
    try {
        console.log("   Setting delegate on endpoint...");
        const delegateTx = await endpoint.setDelegate(adapterAddress);
        await delegateTx.wait();
        console.log("   ✅ Delegate set");
    } catch (error) {
        console.log("   ⚠️  Could not set delegate (might already be set or need different approach)");
    }
    
    // Step 4: Configure peers (example for cross-chain setup)
    console.log("\n4. Configuring cross-chain peers...");
    
    const peerConfigs = {
        "sepolia": {
            "polygon-amoy": { eid: 40267, peer: "0x12a9d0C6D06fEA1A584e98cd86aDC9EFdD7887df" },
            "arbitrum-sepolia": { eid: 40231, peer: "0x5661438B6C23dDFdC718591c3A85FeE1433Dab36" }
        },
        "polygon-amoy": {
            "sepolia": { eid: 40161, peer: adapterAddress }, // Use newly deployed address
            "arbitrum-sepolia": { eid: 40231, peer: "0x5661438B6C23dDFdC718591c3A85FeE1433Dab36" }
        },
        "arbitrum-sepolia": {
            "sepolia": { eid: 40161, peer: adapterAddress }, // Use newly deployed address
            "polygon-amoy": { eid: 40267, peer: "0x12a9d0C6D06fEA1A584e98cd86aDC9EFdD7887df" }
        }
    };
    
    const peers = peerConfigs[networkName];
    if (peers) {
        for (const [targetNetwork, peerConfig] of Object.entries(peers)) {
            if (peerConfig.peer && peerConfig.peer !== "0x0") {
                try {
                    console.log(`   Setting peer for ${targetNetwork} (EID: ${peerConfig.eid})...`);
                    const peerAddress = ethers.zeroPadValue(peerConfig.peer, 32);
                    const setPeerTx = await adapter.setPeer(peerConfig.eid, peerAddress);
                    await setPeerTx.wait();
                    console.log(`   ✅ Peer set for ${targetNetwork}`);
                } catch (error) {
                    console.log(`   ❌ Failed to set peer for ${targetNetwork}: ${error.message}`);
                }
            }
        }
    }
    
    // Step 5: Set enforced options for gas limits
    console.log("\n5. Setting enforced options...");
    
    function buildEnforcedOptions(gasLimit) {
        // Type 3 options with gas limit
        const optionType = 3;
        const option = ethers.AbiCoder.defaultAbiCoder().encode(
            ['uint16', 'uint256'],
            [optionType, gasLimit]
        );
        return "0x0003" + option.slice(2);
    }
    
    const enforcedOptions = buildEnforcedOptions(200000); // 200k gas
    const enforcedOptionsArray = [];
    
    for (const [targetNetwork, peerConfig] of Object.entries(peers || {})) {
        enforcedOptionsArray.push({
            eid: peerConfig.eid,
            msgType: 1, // SEND
            options: enforcedOptions
        });
    }
    
    if (enforcedOptionsArray.length > 0) {
        try {
            const setOptionsTx = await adapter.setEnforcedOptions(enforcedOptionsArray);
            await setOptionsTx.wait();
            console.log("✅ Enforced options set");
        } catch (error) {
            console.log("❌ Failed to set enforced options:", error.message);
        }
    }
    
    // Step 6: Configure allowed swap tokens
    console.log("\n6. Configuring allowed swap tokens...");
    
    // Common tokens to allow for swapping
    const tokensToAllow = {
        "sepolia": [
            "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8", // USDC
            "0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0", // USDT
        ],
        "polygon-amoy": [
            "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582", // USDC
        ],
        "arbitrum-sepolia": [
            "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d", // USDC
        ]
    };
    
    const tokensForNetwork = tokensToAllow[networkName] || [];
    for (const token of tokensForNetwork) {
        try {
            const allowTx = await adapter.setAllowedSwapToken(token, true);
            await allowTx.wait();
            console.log(`✅ Allowed token: ${token}`);
        } catch (error) {
            console.log(`⚠️  Failed to allow token ${token}`);
        }
    }
    
    // Step 7: Verify deployment
    console.log("\n7. Verifying deployment...");
    try {
        const weth = await adapter.WETH();
        const sharedDecimals = await adapter.sharedDecimals();
        const approvalRequired = await adapter.approvalRequired();
        const dexAddr = await adapter.dexAggregator();
        
        console.log(`   WETH: ${weth}`);
        console.log(`   Shared Decimals: ${sharedDecimals}`);
        console.log(`   Approval Required: ${approvalRequired}`);
        console.log(`   DEX Aggregator: ${dexAddr}`);
        
        // Test quote function with proper amount
        const testAmount = ethers.parseEther("1"); // 1 WETH
        const polygonEid = 40267;
        
        const sendParam = {
            dstEid: polygonEid,
            to: ethers.zeroPadValue(deployer.address, 32),
            amountLD: testAmount,
            minAmountLD: testAmount,
            extraOptions: "0x",
            composeMsg: "0x",
            oftCmd: "0x"
        };
        
        try {
            const [nativeFee, lzTokenFee] = await adapter.quoteSend(sendParam, false);
            console.log(`\n✅ Quote test successful!`);
            console.log(`   Native fee: ${ethers.formatEther(nativeFee)} ETH`);
            console.log(`   LZ token fee: ${lzTokenFee}`);
        } catch (error) {
            console.log(`\n⚠️  Quote test failed: ${error.message}`);
            console.log(`   This might be normal if peers aren't set on other chains yet`);
        }
        
    } catch (error) {
        console.log("Verification error:", error.message);
    }
    
    // Step 8: Save deployment info
    console.log("\n8. Saving deployment info...");
    
    const deploymentInfo = {
        network: networkName,
        chainId: chainId,
        adapter: {
            address: adapterAddress,
            weth: config.weth,
            endpoint: config.endpoint,
            dexAggregator: dexAddress
        },
        deployer: deployer.address,
        timestamp: new Date().toISOString()
    };
    
    const deploymentPath = path.join(process.cwd(), "deployments", `${networkName}-oftv2-deployment.json`);
    fs.writeFileSync(deploymentPath, JSON.stringify(deploymentInfo, null, 2));
    
    console.log(`\n✅ Deployment info saved to: ${deploymentPath}`);
    
    console.log("\n=== Deployment Complete ===");
    console.log(`OFT Adapter V2: ${adapterAddress}`);
    console.log(`DEX Aggregator: ${dexAddress}`);
    
    console.log("\n📝 Next Steps:");
    console.log("1. Deploy on other chains and update peer addresses");
    console.log("2. Test ETH wrapping with sendETH()");
    console.log("3. Test token swaps with swapAndSend()");
    console.log("4. Integrate with your escrow contracts");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("\n❌ Deployment failed:", error);
        process.exit(1);
    });