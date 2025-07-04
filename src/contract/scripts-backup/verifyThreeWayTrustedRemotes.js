import pkg from "hardhat";
const { ethers } = pkg;

async function main() {
    console.log("=== Verifying Three-Way Trusted Remote Setup ===\n");
    
    const [signer] = await ethers.getSigners();
    console.log("Checking with account:", signer.address);
    
    // Get current network
    const network = await ethers.provider.getNetwork();
    const chainId = network.chainId.toString();
    const networkName = chainId === "11155111" ? "sepolia" :
                       chainId === "80002" ? "polygon-amoy" :
                       chainId === "421614" ? "arbitrum-sepolia" :
                       `unknown-${chainId}`;
    
    console.log(`Current Network: ${networkName} (Chain ID: ${chainId})`);
    
    // Network configurations with current adapter addresses
    const networks = {
        "sepolia": {
            name: "Sepolia",
            chainId: "11155111",
            eid: 40161,
            adapter: "0xabB44feF0521d1Fc5Df081A95D5D13FF2bD5b297", // New SimplePropertyOFTAdapter
            contractType: "SimplePropertyOFTAdapter"
        },
        "polygon-amoy": {
            name: "Polygon Amoy",
            chainId: "80002", 
            eid: 40267,
            adapter: "0x12a9d0C6D06fEA1A584e98cd86aDC9EFdD7887df", // Existing PropertyOFTAdapter
            contractType: "PropertyOFTAdapter"
        },
        "arbitrum-sepolia": {
            name: "Arbitrum Sepolia",
            chainId: "421614",
            eid: 40231,
            adapter: "0xf829798145e7128c820CdeC5B1cB2Fa2A2008597", // New SimplePropertyOFTAdapter
            contractType: "SimplePropertyOFTAdapter"
        }
    };
    
    const currentNetwork = networks[networkName];
    if (!currentNetwork) {
        console.log("❌ Unknown network");
        return;
    }
    
    console.log(`\n=== ${currentNetwork.name.toUpperCase()} ADAPTER ANALYSIS ===`);
    console.log(`Adapter: ${currentNetwork.adapter}`);
    console.log(`Contract Type: ${currentNetwork.contractType}`);
    console.log(`LayerZero EID: ${currentNetwork.eid}`);
    
    try {
        // Get the adapter contract
        const adapter = await ethers.getContractAt(currentNetwork.contractType, currentNetwork.adapter);
        
        // Basic adapter info
        console.log(`\n📋 Basic Configuration:`);
        const endpoint = await adapter.endpoint();
        const owner = await adapter.owner();
        const sharedDecimals = await adapter.sharedDecimals();
        console.log(`   Endpoint: ${endpoint}`);
        console.log(`   Owner: ${owner}`);
        console.log(`   Shared Decimals: ${sharedDecimals}`);
        
        // Check peers for all other networks
        console.log(`\n🔗 Peer Configuration Check:`);
        
        const otherNetworks = Object.entries(networks).filter(([key]) => key !== networkName);
        const peerStatus = {};
        
        for (const [otherNetworkKey, otherNetworkConfig] of otherNetworks) {
            console.log(`\n   === ${otherNetworkConfig.name} Peer ===`);
            console.log(`   Target EID: ${otherNetworkConfig.eid}`);
            console.log(`   Expected Peer: ${otherNetworkConfig.adapter}`);
            
            try {
                const actualPeer = await adapter.peers(otherNetworkConfig.eid);
                const expectedPeerBytes32 = ethers.zeroPadValue(otherNetworkConfig.adapter, 32);
                
                console.log(`   Actual Peer: ${actualPeer}`);
                console.log(`   Expected Bytes32: ${expectedPeerBytes32}`);
                
                const isPeerSet = actualPeer === expectedPeerBytes32;
                console.log(`   Peer Configured: ${isPeerSet ? '✅' : '❌'}`);
                
                // Check enforced options
                const enforcedOptions = await adapter.enforcedOptions(otherNetworkConfig.eid, 1);
                const hasOptions = enforcedOptions !== "0x";
                console.log(`   Enforced Options: ${hasOptions ? '✅' : '❌'} (${enforcedOptions})`);
                
                peerStatus[otherNetworkKey] = {
                    configured: isPeerSet,
                    hasOptions: hasOptions,
                    actualPeer: actualPeer,
                    expectedPeer: expectedPeerBytes32
                };
                
            } catch (e) {
                console.log(`   ❌ Error checking peer: ${e.message}`);
                peerStatus[otherNetworkKey] = { configured: false, error: e.message };
            }
        }
        
        // Check delegate
        console.log(`\n👤 Delegate Configuration:`);
        const endpointContract = await ethers.getContractAt(
            ["function delegates(address) view returns (address)"],
            endpoint
        );
        const delegate = await endpointContract.delegates(currentNetwork.adapter);
        const isDelegateSet = delegate !== ethers.ZeroAddress;
        console.log(`   Delegate: ${delegate}`);
        console.log(`   Delegate Set: ${isDelegateSet ? '✅' : '❌'}`);
        
        // Test quote functionality
        console.log(`\n💰 Quote Tests:`);
        for (const [otherNetworkKey, otherNetworkConfig] of otherNetworks) {
            try {
                const testAmount = ethers.parseEther("0.001");
                const toAddress = ethers.zeroPadValue(signer.address, 32);
                
                const sendParam = {
                    dstEid: otherNetworkConfig.eid,
                    to: toAddress,
                    amountLD: testAmount,
                    minAmountLD: testAmount,
                    extraOptions: "0x",
                    composeMsg: "0x",
                    oftCmd: "0x"
                };
                
                const fee = await adapter.quoteSend(sendParam, false);
                console.log(`   ${otherNetworkConfig.name}: ${ethers.formatEther(fee.nativeFee)} ETH ✅`);
                
            } catch (e) {
                console.log(`   ${otherNetworkConfig.name}: ❌ ${e.message.split('.')[0]}`);
            }
        }
        
        // Overall readiness assessment
        console.log(`\n📊 READINESS SUMMARY for ${currentNetwork.name}:`);
        const allPeersConfigured = Object.values(peerStatus).every(status => status.configured);
        const allOptionsSet = Object.values(peerStatus).every(status => status.hasOptions);
        
        console.log(`   All Peers Configured: ${allPeersConfigured ? '✅' : '❌'}`);
        console.log(`   All Options Set: ${allOptionsSet ? '✅' : '❌'}`);
        console.log(`   Delegate Set: ${isDelegateSet ? '✅' : '❌'}`);
        
        const isReady = allPeersConfigured && allOptionsSet && isDelegateSet;
        console.log(`   Overall Ready: ${isReady ? '✅ READY' : '❌ NEEDS SETUP'}`);
        
        if (!isReady) {
            console.log(`\n⚠️ Issues Found:`);
            for (const [networkKey, status] of Object.entries(peerStatus)) {
                if (!status.configured) {
                    console.log(`   • ${networks[networkKey].name} peer not configured`);
                }
                if (!status.hasOptions) {
                    console.log(`   • ${networks[networkKey].name} enforced options missing`);
                }
            }
            if (!isDelegateSet) {
                console.log(`   • Delegate not set`);
            }
        }
        
        // Enhanced features check for SimplePropertyOFTAdapter
        if (currentNetwork.contractType === "SimplePropertyOFTAdapter") {
            console.log(`\n🔧 Enhanced Features Check:`);
            try {
                const weth = await adapter.WETH();
                const usdc = await adapter.USDC();
                const usdt = await adapter.USDT();
                const dexAggregator = await adapter.dexAggregator();
                
                console.log(`   Multi-Bridge Support: ✅`);
                console.log(`   WETH: ${weth}`);
                console.log(`   USDC: ${usdc}`);
                console.log(`   USDT: ${usdt}`);
                console.log(`   DEX Aggregator: ${dexAggregator}`);
                
                // Check bridge token priorities
                const usdcPriority = await adapter.bridgeTokenPriority(usdc);
                const usdtPriority = await adapter.bridgeTokenPriority(usdt);
                const wethPriority = await adapter.bridgeTokenPriority(weth);
                console.log(`   Priorities: USDC(${usdcPriority}), USDT(${usdtPriority}), WETH(${wethPriority})`);
                
            } catch (e) {
                console.log(`   Enhanced features error: ${e.message}`);
            }
        }
        
    } catch (error) {
        console.log("❌ Verification failed:", error.message);
    }
    
    console.log(`\n📋 NETWORK SUMMARY:`);
    console.log(`Current: ${currentNetwork.name} (${currentNetwork.adapter})`);
    console.log(`Peers to check:`);
    for (const [key, config] of Object.entries(networks)) {
        if (key !== networkName) {
            console.log(`  • ${config.name} (EID ${config.eid}): ${config.adapter}`);
        }
    }
    
    console.log(`\n📝 Next Steps:`);
    console.log(`1. Run this script on each network to verify all connections:`);
    console.log(`   npx hardhat run scripts/verifyThreeWayTrustedRemotes.js --network sepolia`);
    console.log(`   npx hardhat run scripts/verifyThreeWayTrustedRemotes.js --network polygon-amoy`);
    console.log(`   npx hardhat run scripts/verifyThreeWayTrustedRemotes.js --network arbitrum-sepolia`);
    console.log(`2. Fix any missing peer configurations`);
    console.log(`3. Test actual cross-chain transfers`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("\n❌ Script failed:", error);
        process.exit(1);
    });