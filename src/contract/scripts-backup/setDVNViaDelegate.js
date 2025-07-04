const { ethers } = require('hardhat');
const { Options } = require('@layerzerolabs/lz-v2-utilities');

async function main() {
    console.log('\n=== Setting DVN Configuration via Delegate ===\n');
    
    const adapterAddress = '0x90653738e66a0fa93bf20b087e6a39a704fa39e1';
    const endpointAddress = '0x6EDCE65403992e310A62460808c4b910D972f10f';
    const polygonEid = 40267;
    
    // LayerZero testnet addresses
    const SEPOLIA_DVN = '0x8eebf8b423b73bfca51a1db4b7354aa0bfca9193'.toLowerCase();
    const SEPOLIA_EXECUTOR = '0x5df3a1cebbd9c8ba7f8df51fd632a9aef8308897'.toLowerCase();
    
    const [signer] = await ethers.getSigners();
    const adapter = await ethers.getContractAt('PropertyOFTAdapter', adapterAddress);
    
    // Check if we're the owner
    const owner = await adapter.owner();
    if (owner.toLowerCase() !== signer.address.toLowerCase()) {
        console.log(`❌ Error: Current signer (${signer.address}) is not the owner (${owner})`);
        return;
    }
    
    console.log(`✅ Current signer is the owner: ${signer.address}`);
    
    // Get the endpoint interface with setConfig
    const endpointABI = [
        'function setConfig(address oapp, address lib, tuple(uint32 eid, uint32 configType, bytes config)[] params)',
        'function delegates(address) view returns (bool)',
        'function getSendLibrary(address, uint32) view returns (address)',
        'function getConfig(address, address, uint32, uint32) view returns (bytes)'
    ];
    
    const endpoint = new ethers.Contract(endpointAddress, endpointABI, signer);
    
    try {
        // First, set the signer as delegate if needed
        console.log('\n🔐 Setting up delegate...');
        const delegateFn = adapter.interface.getFunction('setDelegate');
        if (delegateFn) {
            const tx = await adapter.setDelegate(signer.address);
            console.log('Setting delegate transaction:', tx.hash);
            await tx.wait();
            console.log('✅ Delegate set');
        }
        
        // Get the send library
        const sendLib = await endpoint.getSendLibrary(adapterAddress, polygonEid);
        console.log(`\n📚 Send Library: ${sendLib}`);
        
        // Create configurations
        console.log('\n⚙️  Creating configurations:');
        
        // ULN Config
        const ulnConfig = ethers.AbiCoder.defaultAbiCoder().encode(
            ['tuple(uint64 confirmations, uint8 requiredDVNCount, uint8 optionalDVNCount, uint8 optionalDVNThreshold, address[] requiredDVNs, address[] optionalDVNs)'],
            [[
                1, // confirmations
                1, // requiredDVNCount
                0, // optionalDVNCount
                0, // optionalDVNThreshold
                [SEPOLIA_DVN], // requiredDVNs
                [] // optionalDVNs
            ]]
        );
        
        console.log('  ULN Configuration:');
        console.log('    - Confirmations: 1');
        console.log('    - Required DVNs: 1');
        console.log(`    - DVN Address: ${SEPOLIA_DVN}`);
        
        // Executor Config
        const executorConfig = ethers.AbiCoder.defaultAbiCoder().encode(
            ['tuple(uint32 maxMessageSize, address executor)'],
            [[
                10000, // maxMessageSize
                SEPOLIA_EXECUTOR // executor address
            ]]
        );
        
        console.log('  Executor Configuration:');
        console.log('    - Max Message Size: 10000');
        console.log(`    - Executor: ${SEPOLIA_EXECUTOR}`);
        
        // Set both configs
        const configParams = [
            {
                eid: polygonEid,
                configType: 2, // ULN_CONFIG_TYPE
                config: ulnConfig
            },
            {
                eid: polygonEid,
                configType: 1, // EXECUTOR_CONFIG_TYPE
                config: executorConfig
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
        const newUlnConfig = await endpoint.getConfig(adapterAddress, sendLib, polygonEid, 2);
        const newExecConfig = await endpoint.getConfig(adapterAddress, sendLib, polygonEid, 1);
        
        console.log(`  ULN Config set: ${newUlnConfig.length > 2 ? '✅' : '❌'} (${newUlnConfig.length} bytes)`);
        console.log(`  Executor Config set: ${newExecConfig.length > 2 ? '✅' : '❌'} (${newExecConfig.length} bytes)`);
        
        // Test quote
        console.log('\n💸 Testing quote after configuration:');
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
            console.log('\n🎉 Configuration fixed! The adapter should now work for cross-chain transfers.');
        } catch (error) {
            console.log(`❌ Quote still failing: ${error.message}`);
            console.log('\nAdditional debugging may be needed.');
        }
        
    } catch (error) {
        console.log(`\n❌ Error: ${error.message}`);
        console.log('\nThe configuration might need to be set differently.');
        console.log('Check LayerZero documentation for the specific testnet configuration.');
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });