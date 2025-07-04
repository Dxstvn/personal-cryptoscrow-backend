import pkg from "hardhat";
const { ethers } = pkg;

async function checkWalletBalance(networkName, expectedToken) {
    console.log(`\n=== ${networkName} Wallet Check ===`);
    
    const [signer] = await ethers.getSigners();
    const balance = await ethers.provider.getBalance(signer.address);
    
    console.log(`Wallet: ${signer.address}`);
    console.log(`Native Balance: ${ethers.formatEther(balance)} ETH`);
    
    // Check if we have enough for testing (at least 0.01 ETH)
    const minBalance = ethers.parseEther("0.01");
    const hasEnoughBalance = balance >= minBalance;
    console.log(`Sufficient for testing: ${hasEnoughBalance ? '✅' : '❌'} (Need ≥0.01 ETH)`);
    
    // Check token balance if address provided
    if (expectedToken && expectedToken !== ethers.ZeroAddress) {
        try {
            const tokenContract = await ethers.getContractAt(
                ["function balanceOf(address) view returns (uint256)", 
                 "function symbol() view returns (string)",
                 "function decimals() view returns (uint8)"],
                expectedToken
            );
            
            const tokenBalance = await tokenContract.balanceOf(signer.address);
            const symbol = await tokenContract.symbol();
            const decimals = await tokenContract.decimals();
            
            console.log(`${symbol} Balance: ${ethers.formatUnits(tokenBalance, decimals)} ${symbol}`);
        } catch (e) {
            console.log(`Token balance check failed: ${e.message}`);
        }
    }
    
    return {
        address: signer.address,
        balance: balance,
        hasEnoughBalance: hasEnoughBalance
    };
}

async function checkOFTAdapter(networkName, adapterAddress, peerEid) {
    console.log(`\n=== ${networkName} OFT Adapter Check ===`);
    
    if (!adapterAddress || adapterAddress === ethers.ZeroAddress) {
        console.log("❌ No adapter deployed");
        return { isReady: false, reason: "No adapter deployed" };
    }
    
    try {
        const adapter = await ethers.getContractAt("PropertyOFTAdapter", adapterAddress);
        
        // Basic checks
        const token = await adapter.token();
        const endpoint = await adapter.endpoint();
        const owner = await adapter.owner();
        const sharedDecimals = await adapter.sharedDecimals();
        
        console.log(`Adapter: ${adapterAddress}`);
        console.log(`Token: ${token}`);
        console.log(`Endpoint: ${endpoint}`);
        console.log(`Owner: ${owner}`);
        console.log(`Shared Decimals: ${sharedDecimals}`);
        
        // Check peer configuration
        const peer = await adapter.peers(peerEid);
        const isPeerSet = peer !== ethers.ZeroAddress;
        console.log(`Peer (EID ${peerEid}): ${peer}`);
        console.log(`Peer configured: ${isPeerSet ? '✅' : '❌'}`);
        
        // Check enforced options
        const enforcedOptions = await adapter.enforcedOptions(peerEid, 1);
        const hasEnforcedOptions = enforcedOptions !== "0x";
        console.log(`Enforced Options: ${hasEnforcedOptions ? '✅' : '❌'}`);
        
        // Check delegate
        const endpointContract = await ethers.getContractAt(
            ["function delegates(address) view returns (address)"],
            endpoint
        );
        const delegate = await endpointContract.delegates(adapterAddress);
        const isDelegateSet = delegate !== ethers.ZeroAddress;
        console.log(`Delegate: ${delegate}`);
        console.log(`Delegate set: ${isDelegateSet ? '✅' : '❌'}`);
        
        const isReady = isPeerSet && hasEnforcedOptions && isDelegateSet;
        console.log(`Overall Status: ${isReady ? '✅ READY' : '❌ NOT READY'}`);
        
        return {
            isReady: isReady,
            adapterAddress: adapterAddress,
            token: token,
            endpoint: endpoint,
            owner: owner,
            peer: peer,
            isPeerSet: isPeerSet,
            hasEnforcedOptions: hasEnforcedOptions,
            isDelegateSet: isDelegateSet
        };
        
    } catch (e) {
        console.log(`❌ Adapter check failed: ${e.message}`);
        return { isReady: false, reason: e.message };
    }
}

async function main() {
    console.log("=== CROSS-CHAIN TESTING READINESS CHECK ===");
    
    // Network configurations
    const configs = {
        sepolia: {
            name: "Sepolia",
            adapter: "0x90653738e66A0fa93BF20b087e6A39A704FA39e1",
            token: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14", // WETH
            peerEid: 40267, // Polygon Amoy
            chainId: 11155111
        },
        "polygon-amoy": {
            name: "Polygon Amoy", 
            adapter: "0x12a9d0C6D06fEA1A584e98cd86aDC9EFdD7887df",
            token: "0x360ad4f9a9A8EFe9A8DCB5f461c4Cc1047E1Dcf9", // WPOL
            peerEid: 40161, // Sepolia
            chainId: 80002
        },
        "arbitrum-sepolia": {
            name: "Arbitrum Sepolia",
            adapter: null, // Not deployed yet
            token: "0x980B62Da83eFf3D4576C647993b0c1D7faf17c73", // WETH
            peerEid: 40161, // Sepolia
            chainId: 421614
        }
    };
    
    // Detect current network
    const network = await ethers.provider.getNetwork();
    const currentChainId = network.chainId.toString();
    const currentNetwork = Object.entries(configs).find(([key, config]) => 
        config.chainId.toString() === currentChainId
    );
    
    if (!currentNetwork) {
        console.log(`❌ Unknown network: Chain ID ${currentChainId}`);
        return;
    }
    
    const [networkKey, networkConfig] = currentNetwork;
    console.log(`\nCurrent Network: ${networkConfig.name} (${currentChainId})`);
    
    // Check wallet
    const walletInfo = await checkWalletBalance(networkConfig.name, networkConfig.token);
    
    // Check OFT adapter
    const adapterInfo = await checkOFTAdapter(
        networkConfig.name, 
        networkConfig.adapter, 
        networkConfig.peerEid
    );
    
    // Summary
    console.log(`\n=== READINESS SUMMARY ===`);
    console.log(`Network: ${networkConfig.name}`);
    console.log(`Wallet Ready: ${walletInfo.hasEnoughBalance ? '✅' : '❌'}`);
    console.log(`Adapter Ready: ${adapterInfo.isReady ? '✅' : '❌'}`);
    
    const overallReady = walletInfo.hasEnoughBalance && adapterInfo.isReady;
    console.log(`Overall Ready: ${overallReady ? '✅ READY FOR TESTING' : '❌ NEEDS SETUP'}`);
    
    if (!overallReady) {
        console.log(`\n=== SETUP NEEDED ===`);
        if (!walletInfo.hasEnoughBalance) {
            console.log(`• Fund wallet with at least 0.01 ETH for gas`);
        }
        if (!adapterInfo.isReady) {
            console.log(`• Fix adapter configuration: ${adapterInfo.reason || 'See details above'}`);
        }
    }
    
    console.log(`\n=== NEXT STEPS ===`);
    console.log(`To check other networks:`);
    console.log(`• Sepolia: npx hardhat run scripts/checkCrossChainReadiness.js --network sepolia`);
    console.log(`• Polygon Amoy: npx hardhat run scripts/checkCrossChainReadiness.js --network polygon-amoy`);
    console.log(`• Arbitrum Sepolia: npx hardhat run scripts/checkCrossChainReadiness.js --network arbitrum-sepolia`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("\\n❌ Readiness check failed:", error);
        process.exit(1);
    });