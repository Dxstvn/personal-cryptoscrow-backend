import pkg from "hardhat";
const { ethers } = pkg;

async function main() {
    console.log("=== Configuring Polygon Amoy OFT Adapter DVN V2 ===\n");
    
    const [signer] = await ethers.getSigners();
    console.log("Configuring with account:", signer.address);
    
    // Get network
    const network = await ethers.provider.getNetwork();
    if (network.chainId !== 80002n) {
        throw new Error("This script must be run on Polygon Amoy network. Use --network polygon-amoy");
    }
    
    // Polygon Amoy adapter address
    const adapterAddress = "0x12a9d0C6D06fEA1A584e98cd86aDC9EFdD7887df";
    
    // Get adapter
    const adapter = await ethers.getContractAt(
        "PropertyOFTAdapter",
        adapterAddress
    );
    
    console.log("Polygon OFT Adapter:", adapter.target);
    
    // Get endpoint
    const endpointAddress = await adapter.endpoint();
    console.log("Endpoint:", endpointAddress);
    
    // Network EIDs
    const sepoliaEid = 40161;
    
    // DVN addresses for testnets
    const dvnAddresses = {
        "polygon-amoy": "0x55370E0fBB5f5b8dAeD978BA1c075a499eB107B8",
        "sepolia": "0x8eebf8b423B73bFCa51a1Db4B7354AA0bFCA9193"
    };
    
    const executorAddresses = {
        "polygon-amoy": "0x4Cf1B3Fa61465c2c907f82fC488B43223BA0CF93",
        "sepolia": "0x718B92b5CB0a5552039B593faF724D182A881eDA"
    };
    
    // Get the endpoint with config interface
    const endpointABI = [
        "function setSendLibrary(address oapp, uint32 eid, address lib) external",
        "function setReceiveLibrary(address oapp, uint32 eid, address lib) external",
        "function getSendLibrary(address oapp, uint32 eid) view returns (address)",
        "function getReceiveLibrary(address oapp, uint32 eid) view returns (address)",
        "function defaultSendLibrary(uint32 eid) view returns (address)",
        "function defaultReceiveLibrary(uint32 eid) view returns (address)",
        "function setConfig(address oapp, address lib, tuple(uint32 eid, uint32 configType, bytes config)[] configs) external",
        "function delegates(address oapp) view returns (address)"
    ];
    
    const endpoint = new ethers.Contract(endpointAddress, endpointABI, signer);
    
    // Check current libraries
    console.log("\nChecking message libraries...");
    const sendLib = await endpoint.getSendLibrary(adapter.target, sepoliaEid);
    const receiveLib = await endpoint.getReceiveLibrary(adapter.target, sepoliaEid);
    const defaultSendLib = await endpoint.defaultSendLibrary(sepoliaEid);
    const defaultReceiveLib = await endpoint.defaultReceiveLibrary(sepoliaEid);
    
    console.log("Send library:", sendLib);
    console.log("Default send library:", defaultSendLib);
    console.log("Using default send:", sendLib === defaultSendLib);
    console.log("Receive library:", receiveLib);
    console.log("Default receive library:", defaultReceiveLib);
    
    // Build ULN config
    const ulnConfig = {
        confirmations: 1, // 1 block confirmation for testnet
        requiredDVNCount: 1,
        optionalDVNCount: 0,
        optionalDVNThreshold: 0,
        requiredDVNs: [dvnAddresses["polygon-amoy"]], // Use Polygon's DVN
        optionalDVNs: []
    };
    
    console.log("\nULN Config:", ulnConfig);
    
    // Encode the config
    const configTypeUln = 2; // ULN config type
    const encodedUlnConfig = ethers.AbiCoder.defaultAbiCoder().encode(
        [
            "tuple(uint64 confirmations, uint8 requiredDVNCount, uint8 optionalDVNCount, uint8 optionalDVNThreshold, address[] requiredDVNs, address[] optionalDVNs)"
        ],
        [ulnConfig]
    );
    
    // Build executor config
    const executorConfig = {
        maxMessageSize: 10000,
        executor: executorAddresses["polygon-amoy"] // Use Polygon's executor
    };
    
    const configTypeExecutor = 1; // Executor config type
    const encodedExecutorConfig = ethers.AbiCoder.defaultAbiCoder().encode(
        ["tuple(uint32 maxMessageSize, address executor)"],
        [executorConfig]
    );
    
    // Build the config array for both send and receive
    const sendConfigs = [
        {
            eid: sepoliaEid,
            configType: configTypeUln,
            config: encodedUlnConfig
        },
        {
            eid: sepoliaEid,
            configType: configTypeExecutor,
            config: encodedExecutorConfig
        }
    ];
    
    console.log("\nSetting endpoint config...");
    
    try {
        // Check if we're the delegate
        const currentDelegate = await endpoint.delegates(adapter.target);
        if (currentDelegate.toLowerCase() !== signer.address.toLowerCase()) {
            console.log("❌ Not the delegate. Current delegate:", currentDelegate);
            console.log("You need to be the delegate to set config.");
            return;
        }
        
        // Set config for send library
        console.log("Setting send config...");
        const tx1 = await endpoint.setConfig(adapter.target, sendLib, sendConfigs);
        console.log("Send config tx:", tx1.hash);
        await tx1.wait();
        console.log("✅ Send config set!");
        
        // Set config for receive library if different
        if (receiveLib !== sendLib) {
            console.log("\nSetting receive config...");
            const tx2 = await endpoint.setConfig(adapter.target, receiveLib, sendConfigs);
            console.log("Receive config tx:", tx2.hash);
            await tx2.wait();
            console.log("✅ Receive config set!");
        }
        
        console.log("\n✅ DVN and Executor configuration complete!");
        console.log("\n🎉 Both Sepolia and Polygon adapters are now configured!");
        console.log("You should now be able to send cross-chain transfers.");
        
    } catch (error) {
        console.error("❌ Failed to set config:", error.message);
        if (error.data) {
            console.log("Error data:", error.data);
            
            try {
                // Try to decode error
                const errorSig = error.data.slice(0, 10);
                console.log("Error signature:", errorSig);
            } catch {}
        }
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("\n❌ Script failed:", error);
        process.exit(1);
    });