const { ethers } = require('hardhat');

async function main() {
    console.log('\n=== Debugging Adapter and Endpoint Configuration ===\n');
    
    const adapterAddress = '0x90653738e66a0fa93bf20b087e6a39a704fa39e1';
    const endpointAddress = '0x6EDCE65403992e310A62460808c4b910D972f10f';
    const polygonEid = 40267;
    
    const adapter = await ethers.getContractAt('PropertyOFTAdapter', adapterAddress);
    const endpoint = await ethers.getContractAt('ILayerZeroEndpointV2', endpointAddress);
    
    console.log('📡 Endpoint Configuration:');
    
    // Check if endpoint is set correctly
    const adapterEndpoint = await adapter.endpoint();
    console.log(`  Adapter's endpoint: ${adapterEndpoint}`);
    console.log(`  Expected endpoint: ${endpointAddress}`);
    console.log(`  Match: ${adapterEndpoint.toLowerCase() === endpointAddress.toLowerCase() ? '✅' : '❌'}`);
    
    // Check if the adapter is registered as a delegate
    console.log('\n🔐 Delegate Configuration:');
    try {
        const isDelegate = await endpoint.isDelegate(adapterAddress);
        console.log(`  Adapter is registered delegate: ${isDelegate ? '✅' : '❌'}`);
    } catch (error) {
        console.log('  Could not check delegate status');
    }
    
    // Check message library configuration
    console.log('\n📚 Message Library Configuration:');
    try {
        // Check default send library for Polygon
        const defaultSendLib = await endpoint.defaultSendLibrary(polygonEid);
        console.log(`  Default send library for Polygon: ${defaultSendLib}`);
        
        // Check if library is set for the adapter
        const sendLib = await endpoint.getSendLibrary(adapterAddress, polygonEid);
        console.log(`  Send library for adapter->Polygon: ${sendLib}`);
    } catch (error) {
        console.log('  Error checking message libraries:', error.message);
    }
    
    // Check if the path is supported
    console.log('\n🛤️  Path Support:');
    try {
        const isSupported = await endpoint.isSupportedEid(polygonEid);
        console.log(`  Polygon Amoy (${polygonEid}) supported: ${isSupported ? '✅' : '❌'}`);
    } catch (error) {
        console.log('  Could not check path support');
    }
    
    // Try to get more specific error information
    console.log('\n🔍 Attempting Direct Endpoint Call:');
    try {
        const [signer] = await ethers.getSigners();
        
        // Create a minimal message
        const message = ethers.AbiCoder.defaultAbiCoder().encode(
            ['bytes32', 'uint256'],
            [ethers.zeroPadValue(signer.address, 32), ethers.parseEther('0.001')]
        );
        
        // Try to quote directly from endpoint
        const options = '0x000300000000000000000000000000000000000000000000000000000000000000030000000000000000000000000000000000000000000000000000000000030d40';
        
        const quote = await endpoint['quote((uint32,bytes32,bytes,bytes,bool),address)'](
            {
                dstEid: polygonEid,
                receiver: ethers.zeroPadValue(adapterAddress, 32),
                message: message,
                options: options,
                payInLzToken: false
            },
            adapterAddress
        );
        
        console.log(`  Direct endpoint quote: ${ethers.formatEther(quote.nativeFee)} ETH`);
    } catch (error) {
        console.log('  Direct endpoint call failed:', error.message);
        
        // The error might give us more information
        if (error.message.includes('NoPeer')) {
            console.log('  ❌ Issue: No peer configured at endpoint level');
        } else if (error.message.includes('InvalidEndpointCall')) {
            console.log('  ❌ Issue: Invalid endpoint call');
        }
    }
    
    // Check OApp configuration
    console.log('\n⚙️  OApp Configuration:');
    try {
        // Get the OApp config
        const delegate = await adapter.owner();
        console.log(`  Adapter owner/delegate: ${delegate}`);
        
        // Check if configs are set
        const configTypes = [2, 3]; // ULN config types
        for (const configType of configTypes) {
            try {
                const config = await endpoint.getConfig(
                    adapterAddress,
                    await endpoint.getSendLibrary(adapterAddress, polygonEid),
                    polygonEid,
                    configType
                );
                console.log(`  Config type ${configType}: ${config.length > 2 ? '✅ Set' : '❌ Not set'}`);
            } catch (e) {
                console.log(`  Config type ${configType}: ❌ Not accessible`);
            }
        }
    } catch (error) {
        console.log('  Could not check OApp configuration');
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });