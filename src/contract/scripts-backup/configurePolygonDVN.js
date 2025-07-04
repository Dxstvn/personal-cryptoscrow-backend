import pkg from "hardhat";
const { ethers } = pkg;

async function main() {
    console.log("=== Configuring Polygon Amoy OFT Adapter DVN ===\n");
    
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
    
    // First set delegate if needed
    const endpointAddress = await adapter.endpoint();
    console.log("Endpoint:", endpointAddress);
    
    // Check delegate
    const endpoint = await ethers.getContractAt(
        ["function delegates(address) view returns (address)",
         "function setDelegate(address) external"],
        endpointAddress
    );
    
    const currentDelegate = await endpoint.delegates(adapter.target);
    console.log("Current delegate:", currentDelegate);
    
    if (currentDelegate === ethers.ZeroAddress) {
        console.log("\nSetting delegate...");
        const tx = await endpoint.connect(signer).setDelegate(adapter.target);
        await tx.wait();
        console.log("✅ Delegate set");
    }
    
    // Now configure DVN for Sepolia
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
    
    // Build the config array
    const configs = [
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
    
    console.log("\nSetting Endpoint config for Sepolia...");
    try {
        const tx = await adapter.setConfig(configs);
        console.log("Transaction sent:", tx.hash);
        const receipt = await tx.wait();
        console.log("✅ DVN and Executor configuration set!");
        console.log("Gas used:", receipt.gasUsed.toString());
        
        // Verify configuration
        console.log("\nVerifying configuration...");
        const getConfigABI = [
            "function getConfig(address oapp, address lib, uint32 eid, uint32 configType) view returns (bytes config)"
        ];
        
        const endpointWithConfig = new ethers.Contract(endpointAddress, getConfigABI, signer);
        
        // Get send library
        const getSendLibABI = ["function getSendLibrary(address oapp, uint32 eid) view returns (address lib)"];
        const endpointWithLib = new ethers.Contract(endpointAddress, getSendLibABI, signer);
        const sendLib = await endpointWithLib.getSendLibrary(adapter.target, sepoliaEid);
        console.log("Send library:", sendLib);
        
        // Check ULN config
        const ulnConfigBytes = await endpointWithConfig.getConfig(
            adapter.target,
            sendLib,
            sepoliaEid,
            configTypeUln
        );
        console.log("ULN config set:", ulnConfigBytes !== "0x");
        
        // Check Executor config
        const executorConfigBytes = await endpointWithConfig.getConfig(
            adapter.target,
            sendLib,
            sepoliaEid,
            configTypeExecutor
        );
        console.log("Executor config set:", executorConfigBytes !== "0x");
        
    } catch (error) {
        console.error("❌ Failed to set config:", error.message);
        if (error.data) {
            console.log("Error data:", error.data);
        }
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("\n❌ Script failed:", error);
        process.exit(1);
    });