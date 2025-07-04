const { ethers } = require('hardhat');

async function main() {
    console.log('\n=== Debugging After Configuration ===\n');
    
    const adapterAddress = '0x90653738e66a0fa93bf20b087e6a39a704fa39e1';
    const polygonAdapterAddress = '0x12a9d0C6D06fEA1A584e98cd86aDC9EFdD7887df';
    const endpointAddress = '0x6EDCE65403992e310A62460808c4b910D972f10f';
    const polygonEid = 40267;
    
    const [signer] = await ethers.getSigners();
    const adapter = await ethers.getContractAt('PropertyOFTAdapter', adapterAddress);
    
    console.log('🔍 Checking complete configuration:\n');
    
    // Check if both sides have peers set
    console.log('📍 Peer Configuration:');
    const polygonPeer = await adapter.peers(polygonEid);
    console.log(`  Sepolia -> Polygon peer: ${polygonPeer}`);
    
    const decodedPeer = '0x' + polygonPeer.slice(-40);
    console.log(`  Decoded peer address: ${decodedPeer}`);
    console.log(`  Expected: ${polygonAdapterAddress.toLowerCase()}`);
    console.log(`  Match: ${decodedPeer.toLowerCase() === polygonAdapterAddress.toLowerCase() ? '✅' : '❌'}`);
    
    // Check enforced options
    console.log('\n⚙️  Enforced Options:');
    try {
        const enforcedOptions = await adapter.enforcedOptions(polygonEid, 1); // msgType 1 for SEND
        console.log(`  Enforced options: ${enforcedOptions || 'None set'}`);
        
        if (!enforcedOptions || enforcedOptions === '0x') {
            console.log('\n  💡 Setting enforced options...');
            
            // Set enforced options for better gas estimation
            const options = '0x00030100110100000000000000000000000000030d40'; // 200k gas
            const tx = await adapter.setEnforcedOptions([{
                eid: polygonEid,
                msgType: 1, // SEND
                options: options
            }]);
            
            console.log(`  Transaction: ${tx.hash}`);
            await tx.wait();
            console.log('  ✅ Enforced options set');
        }
    } catch (error) {
        console.log('  Error checking enforced options:', error.message);
    }
    
    // Try quote with different parameters
    console.log('\n💸 Testing different quote parameters:');
    
    const amounts = [
        ethers.parseEther('0.001'),
        ethers.parseEther('0.01'),
        ethers.parseEther('0.1')
    ];
    
    for (const amount of amounts) {
        console.log(`\n  Testing ${ethers.formatEther(amount)} WETH:`);
        
        const sendParam = {
            dstEid: polygonEid,
            to: ethers.zeroPadValue(signer.address, 32),
            amountLD: amount,
            minAmountLD: amount * 95n / 100n, // 5% slippage
            extraOptions: '0x00030100110100000000000000000000000000030d40',
            composeMsg: '0x',
            oftCmd: '0x'
        };
        
        try {
            const [nativeFee] = await adapter.quoteSend(sendParam, false);
            console.log(`  ✅ Success! Fee: ${ethers.formatEther(nativeFee)} ETH`);
            break;
        } catch (error) {
            console.log(`  ❌ Failed: ${error.message}`);
            
            // Try to get error data
            if (error.data) {
                const errorSelector = error.data.slice(0, 10);
                console.log(`  Error selector: ${errorSelector}`);
                
                // Check if it's still the same error
                if (errorSelector === '0x6780cfaf') {
                    console.log('  Still getting LZ_ULN_InvalidWorkerId error');
                    console.log('  The configuration might not be active yet or needs different parameters');
                }
            }
        }
    }
    
    // Check if we need to configure on Polygon side too
    console.log('\n📝 Next Steps:');
    console.log('1. The Sepolia adapter configuration is set');
    console.log('2. You may need to configure the Polygon Amoy adapter as well');
    console.log('3. Run the same configuration script on Polygon Amoy network');
    console.log('4. Ensure both adapters have matching peer addresses');
    console.log('5. Wait a few minutes for the configuration to propagate');
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });