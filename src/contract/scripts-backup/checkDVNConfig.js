const { ethers } = require('hardhat');

async function main() {
    console.log('\n=== Checking DVN Configuration ===\n');
    
    const adapterAddress = '0x90653738e66a0fa93bf20b087e6a39a704fa39e1';
    const endpointAddress = '0x6EDCE65403992e310A62460808c4b910D972f10f';
    const polygonEid = 40267;
    
    const adapter = await ethers.getContractAt('PropertyOFTAdapter', adapterAddress);
    const endpoint = await ethers.getContractAt('ILayerZeroEndpointV2', endpointAddress);
    
    console.log('🔍 The error LZ_ULN_InvalidWorkerId(0) indicates:');
    console.log('   - The ULN configuration is missing or invalid');
    console.log('   - Worker ID 0 is not valid (workers start from 1)');
    console.log('   - The DVN (Decentralized Verifier Network) is not properly set\n');
    
    // Get the send library
    const sendLib = await endpoint.getSendLibrary(adapterAddress, polygonEid);
    console.log(`📚 Send Library: ${sendLib}`);
    
    // Check ULN config
    console.log('\n⚙️  Checking ULN Configuration:');
    
    // Config types for ULN
    const CONFIG_TYPE_ULN = 2;
    const CONFIG_TYPE_EXECUTOR = 1;
    
    try {
        // Get ULN config
        const ulnConfig = await endpoint.getConfig(
            adapterAddress,
            sendLib,
            polygonEid,
            CONFIG_TYPE_ULN
        );
        
        console.log(`   ULN Config length: ${ulnConfig.length} bytes`);
        console.log(`   ULN Config: ${ulnConfig}`);
        
        if (ulnConfig === '0x' || ulnConfig.length <= 2) {
            console.log('   ❌ ULN config is not set!');
            console.log('\n   This is the root cause of the error.');
            console.log('   The adapter needs DVN configuration for cross-chain messaging.');
        } else {
            // Try to decode the config
            console.log('\n   Attempting to decode ULN config:');
            try {
                // ULN config structure: confirmations (uint64), requiredDVNCount (uint8), optionalDVNCount (uint8), optionalDVNThreshold (uint8), requiredDVNs (address[]), optionalDVNs (address[])
                const decoded = ethers.AbiCoder.defaultAbiCoder().decode(
                    ['uint64', 'uint8', 'uint8', 'uint8', 'address[]', 'address[]'],
                    ulnConfig
                );
                console.log(`   Confirmations: ${decoded[0]}`);
                console.log(`   Required DVN Count: ${decoded[1]}`);
                console.log(`   Optional DVN Count: ${decoded[2]}`);
                console.log(`   Optional DVN Threshold: ${decoded[3]}`);
                console.log(`   Required DVNs: ${decoded[4]}`);
                console.log(`   Optional DVNs: ${decoded[5]}`);
            } catch (e) {
                console.log('   Could not decode config');
            }
        }
    } catch (error) {
        console.log(`   ❌ Error getting ULN config: ${error.message}`);
    }
    
    // Check executor config
    try {
        const executorConfig = await endpoint.getConfig(
            adapterAddress,
            sendLib,
            polygonEid,
            CONFIG_TYPE_EXECUTOR
        );
        console.log(`\n   Executor Config length: ${executorConfig.length} bytes`);
        
        if (executorConfig === '0x' || executorConfig.length <= 2) {
            console.log('   ❌ Executor config is not set!');
        }
    } catch (error) {
        console.log(`   ❌ Error getting Executor config: ${error.message}`);
    }
    
    console.log('\n📋 Solution:');
    console.log('   The adapter needs to have its ULN configuration set.');
    console.log('   This includes:');
    console.log('   1. DVN (Decentralized Verifier Network) addresses');
    console.log('   2. Confirmation requirements');
    console.log('   3. Executor configuration');
    console.log('\n   On testnets, LayerZero provides default DVNs that can be used.');
    
    // Get default config from endpoint
    console.log('\n🔍 Checking if there are default configs available:');
    try {
        // Try to get default send library config
        const defaultSendLib = await endpoint.defaultSendLibrary(polygonEid);
        console.log(`   Default send library: ${defaultSendLib}`);
        
        if (defaultSendLib === sendLib) {
            console.log('   ✅ Using default send library');
            console.log('   The issue is that OApp-specific config is missing');
        }
    } catch (error) {
        console.log('   Could not check default library');
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });