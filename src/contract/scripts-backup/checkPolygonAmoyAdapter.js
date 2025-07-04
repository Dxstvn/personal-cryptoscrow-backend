const { ethers } = require('hardhat');

async function main() {
    console.log('\n=== Checking Polygon Amoy OFT Adapter Configuration ===\n');
    
    const adapterAddress = '0x12a9d0C6D06fEA1A584e98cd86aDC9EFdD7887df';
    const sepoliaEid = 40161; // Sepolia endpoint ID
    
    try {
        // Get the adapter contract
        const adapter = await ethers.getContractAt('PropertyOFTAdapter', adapterAddress);
        console.log(`✅ OFT Adapter found at: ${adapterAddress}`);
        
        // Check basic configuration
        console.log('\n📋 Basic Configuration:');
        
        // Get token
        const token = await adapter.token();
        console.log(`   Token: ${token}`);
        
        // Get endpoint
        const endpoint = await adapter.endpoint();
        console.log(`   LayerZero Endpoint: ${endpoint}`);
        
        // Get owner
        const owner = await adapter.owner();
        console.log(`   Owner: ${owner}`);
        
        // Check if Sepolia is configured as a peer
        console.log('\n🔗 Checking Sepolia Peer Configuration:');
        try {
            const sepoliaPeer = await adapter.peers(sepoliaEid);
            if (sepoliaPeer && sepoliaPeer !== '0x0000000000000000000000000000000000000000000000000000000000000000') {
                console.log(`   ✅ Sepolia peer configured: ${sepoliaPeer}`);
                
                // Decode the peer address
                const peerAddress = '0x' + sepoliaPeer.slice(-40);
                console.log(`   Decoded peer address: ${peerAddress}`);
            } else {
                console.log('   ❌ Sepolia peer NOT configured');
            }
        } catch (error) {
            console.log('   ❌ Error checking Sepolia peer:', error.message);
        }
        
        // Check enforced options
        console.log('\n⚙️  Checking Enforced Options:');
        try {
            const enforcedOptions = await adapter.enforcedOptions(sepoliaEid, 1); // msgType 1 for SEND
            if (enforcedOptions && enforcedOptions !== '0x') {
                console.log(`   ✅ Enforced options for Sepolia: ${enforcedOptions}`);
            } else {
                console.log('   ❌ No enforced options set for Sepolia');
            }
        } catch (error) {
            console.log('   ⚠️  Could not check enforced options:', error.message);
        }
        
        // Check token balance
        console.log('\n💰 Checking Token Balance:');
        const tokenContract = await ethers.getContractAt('IERC20', token);
        const balance = await tokenContract.balanceOf(adapterAddress);
        console.log(`   Adapter token balance: ${ethers.formatEther(balance)} tokens`);
        
        // Check if contract is verified
        console.log('\n🔍 Additional Info:');
        const code = await ethers.provider.getCode(adapterAddress);
        console.log(`   Contract has code: ${code.length > 2 ? 'Yes' : 'No'}`);
        
    } catch (error) {
        console.error('\n❌ Error:', error.message);
        console.error('Stack:', error.stack);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });