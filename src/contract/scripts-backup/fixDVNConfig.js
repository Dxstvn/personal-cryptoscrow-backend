const { ethers } = require('hardhat');
const { Options } = require('@layerzerolabs/lz-v2-utilities');

async function main() {
    console.log('\n=== Fixing DVN Configuration ===\n');
    
    const adapterAddress = '0x90653738e66a0fa93bf20b087e6a39a704fa39e1';
    const endpointAddress = '0x6EDCE65403992e310A62460808c4b910D972f10f';
    const polygonEid = 40267;
    
    // LayerZero testnet DVN addresses
    const SEPOLIA_DVN = '0x8eebf8b423B73bFCa51a1Db4B7354AA0bfCA9193'; // LayerZero Labs DVN on Sepolia
    const POLYGON_DVN = '0x3909e9C73783e3C0A95175d8ADE321E8dB7EF08B'; // LayerZero Labs DVN on Polygon Amoy
    
    const [signer] = await ethers.getSigners();
    const adapter = await ethers.getContractAt('PropertyOFTAdapter', adapterAddress);
    const endpoint = await ethers.getContractAt('ILayerZeroEndpointV2', endpointAddress);
    
    // Check ownership
    const owner = await adapter.owner();
    console.log(`Adapter owner: ${owner}`);
    console.log(`Current signer: ${signer.address}`);
    
    if (owner.toLowerCase() !== signer.address.toLowerCase()) {
        console.log('\n❌ Error: Only the owner can set configuration');
        return;
    }
    
    console.log('\n📋 Setting DVN Configuration:');
    
    try {
        // Get the send library
        const sendLib = await endpoint.getSendLibrary(adapterAddress, polygonEid);
        console.log(`Send Library: ${sendLib}`);
        
        // Create ULN config
        // Structure: confirmations, requiredDVNCount, optionalDVNCount, optionalDVNThreshold, requiredDVNs[], optionalDVNs[]
        const ulnConfig = ethers.AbiCoder.defaultAbiCoder().encode(
            ['tuple(uint64,uint8,uint8,uint8,address[],address[])'],
            [[
                1, // confirmations
                1, // requiredDVNCount
                0, // optionalDVNCount
                0, // optionalDVNThreshold
                [SEPOLIA_DVN], // requiredDVNs - use Sepolia DVN
                [] // optionalDVNs
            ]]
        );
        
        console.log('\nULN Config:');
        console.log('  Confirmations: 1');
        console.log('  Required DVN Count: 1');
        console.log(`  Required DVN: ${SEPOLIA_DVN}`);
        
        // Create executor config
        // Structure: maxMessageSize, executor
        const executorConfig = ethers.AbiCoder.defaultAbiCoder().encode(
            ['tuple(uint32,address)'],
            [[
                10000, // maxMessageSize
                '0x5Df3a1cEbBD9c8BA7F8dF51Fd632A9aef8308897' // LayerZero Executor on Sepolia
            ]]
        );
        
        // Set the configuration
        const configParams = [
            {
                eid: polygonEid,
                configType: 2, // ULN_CONFIG_TYPE
                config: ulnConfig
            }
        ];
        
        console.log('\n🔧 Setting configuration...');
        const tx = await endpoint.setConfig(
            adapterAddress,
            sendLib,
            configParams
        );
        
        console.log(`Transaction hash: ${tx.hash}`);
        console.log('Waiting for confirmation...');
        
        const receipt = await tx.wait();
        console.log(`✅ Configuration set! Gas used: ${receipt.gasUsed}`);
        
        // Verify the configuration
        console.log('\n🔍 Verifying configuration:');
        const newConfig = await endpoint.getConfig(
            adapterAddress,
            sendLib,
            polygonEid,
            2 // ULN_CONFIG_TYPE
        );
        
        console.log(`New config length: ${newConfig.length} bytes`);
        console.log(`Config set: ${newConfig.length > 2 ? '✅' : '❌'}`);
        
        // Try a quote again
        console.log('\n💸 Testing quote after fix:');
        const amount = ethers.parseEther('0.001');
        const sendParam = {
            dstEid: polygonEid,
            to: ethers.zeroPadValue(signer.address, 32),
            amountLD: amount,
            minAmountLD: amount * 99n / 100n,
            extraOptions: Options.newOptions().addExecutorLzReceiveOption(200000, 0).toHex(),
            composeMsg: '0x',
            oftCmd: '0x'
        };
        
        try {
            const [nativeFee] = await adapter.quoteSend(sendParam, false);
            console.log(`✅ Quote successful! Fee: ${ethers.formatEther(nativeFee)} ETH`);
        } catch (error) {
            console.log(`❌ Quote still failing: ${error.message}`);
        }
        
    } catch (error) {
        console.log(`\n❌ Error: ${error.message}`);
        
        // If setting config failed, we might need to use the OApp's setConfig function
        console.log('\n📝 Alternative approach:');
        console.log('The adapter might need to use its own setConfig function.');
        console.log('Or the endpoint might require different permissions.');
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });