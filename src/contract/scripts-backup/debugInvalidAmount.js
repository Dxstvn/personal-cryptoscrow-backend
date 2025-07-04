const { ethers } = require('hardhat');

async function main() {
    console.log('\n=== Debugging InvalidAmount Error ===\n');
    
    // Configuration
    const sepoliaAdapter = '0x90653738e66a0fa93bf20b087e6a39a704fa39e1';
    const polygonAdapter = '0x12a9d0C6D06fEA1A584e98cd86aDC9EFdD7887df';
    const sepoliaEid = 40161;
    const polygonEid = 40267;
    const amount = ethers.parseEther('0.001'); // Test amount
    
    console.log('🔍 Checking configuration on both chains...\n');
    
    // Check Sepolia configuration
    console.log('📍 Sepolia Configuration:');
    console.log(`   Adapter: ${sepoliaAdapter}`);
    console.log(`   Chain ID: 11155111`);
    console.log(`   Endpoint ID: ${sepoliaEid}`);
    
    const sepoliaAdapterContract = await ethers.getContractAt('PropertyOFTAdapter', sepoliaAdapter);
    
    // Check token
    const sepoliaToken = await sepoliaAdapterContract.token();
    console.log(`   Token: ${sepoliaToken}`);
    
    // Check decimals conversion
    console.log('\n🔢 Checking Decimals and Shared Decimals:');
    const tokenContract = await ethers.getContractAt('IERC20', sepoliaToken);
    
    // Get token decimals
    let tokenDecimals;
    try {
        tokenDecimals = await tokenContract.decimals();
        console.log(`   Token decimals: ${tokenDecimals}`);
    } catch (error) {
        console.log('   ⚠️  Could not get token decimals, assuming 18');
        tokenDecimals = 18;
    }
    
    // Get shared decimals from OFT
    try {
        const sharedDecimals = await sepoliaAdapterContract.sharedDecimals();
        console.log(`   Shared decimals: ${sharedDecimals}`);
        console.log(`   Decimal conversion rate: ${10 ** (tokenDecimals - sharedDecimals)}`);
    } catch (error) {
        console.log('   ⚠️  Could not get shared decimals');
    }
    
    // Check if amount would be valid
    console.log('\n💰 Amount Validation:');
    console.log(`   Amount to send: ${ethers.formatEther(amount)} ETH`);
    
    // Check LD to SD conversion
    try {
        // The OFT adapter should have these functions
        const ldToSdRate = await sepoliaAdapterContract.decimalConversionRate();
        console.log(`   LD to SD conversion rate: ${ldToSdRate}`);
        
        const sdAmount = amount / ldToSdRate;
        console.log(`   SD amount: ${sdAmount}`);
        
        if (sdAmount < 1n) {
            console.log('   ❌ WARNING: Amount converts to 0 in shared decimals!');
            console.log('   This would cause InvalidAmount error');
        } else {
            console.log('   ✅ Amount is valid in shared decimals');
        }
    } catch (error) {
        console.log('   ⚠️  Could not check decimal conversion directly');
        
        // Try manual calculation
        try {
            const sharedDecimals = 6; // Common for USDC-like tokens
            const conversionRate = 10 ** (18 - sharedDecimals);
            const sdAmount = amount / BigInt(conversionRate);
            
            console.log(`   Manual calculation (assuming SD=6):`)
            console.log(`   Conversion rate: ${conversionRate}`);
            console.log(`   SD amount: ${sdAmount}`);
            
            if (sdAmount < 1n) {
                console.log('   ❌ Amount too small for cross-chain transfer');
            }
        } catch (e) {
            console.log('   Could not perform manual calculation');
        }
    }
    
    // Check minimum amount configuration
    console.log('\n⚙️  Checking Minimum Amount Configuration:');
    try {
        // Check if there's a minimum amount set
        const minAmount = await sepoliaAdapterContract.minAmountLD();
        console.log(`   Minimum amount (LD): ${ethers.formatEther(minAmount)} tokens`);
        
        if (amount < minAmount) {
            console.log('   ❌ Amount is below minimum!');
        } else {
            console.log('   ✅ Amount is above minimum');
        }
    } catch (error) {
        console.log('   No explicit minimum amount configuration found');
    }
    
    // Check Polygon peer configuration
    console.log('\n🔗 Checking Peer Configuration:');
    const polygonPeer = await sepoliaAdapterContract.peers(polygonEid);
    console.log(`   Polygon peer: ${polygonPeer}`);
    
    if (polygonPeer === '0x0000000000000000000000000000000000000000000000000000000000000000') {
        console.log('   ❌ Polygon peer not configured!');
    } else {
        const decodedPeer = '0x' + polygonPeer.slice(-40);
        console.log(`   Decoded peer: ${decodedPeer}`);
        console.log(`   Expected: ${polygonAdapter.toLowerCase()}`);
        console.log(`   Match: ${decodedPeer.toLowerCase() === polygonAdapter.toLowerCase() ? '✅' : '❌'}`);
    }
    
    // Estimate send fee
    console.log('\n💸 Estimating Send Fee:');
    try {
        const to = '0x28f9F5e0Ec9C6B8cdF1F3ad73847A094570c927D'; // Test address
        
        // Create send params
        const sendParam = {
            dstEid: polygonEid,
            to: ethers.zeroPadValue(to, 32),
            amountLD: amount,
            minAmountLD: amount * 99n / 100n, // 1% slippage
            extraOptions: '0x000300000000000000000000000000000000000000000000000000000000000000030000000000000000000000000000000000000000000000000000000000030d40',
            composeMsg: '0x',
            oftCmd: '0x'
        };
        
        const [nativeFee, lzTokenFee] = await sepoliaAdapterContract.quoteSend(sendParam, false);
        console.log(`   Native fee: ${ethers.formatEther(nativeFee)} ETH`);
        console.log(`   LZ token fee: ${lzTokenFee}`);
    } catch (error) {
        console.log('   ❌ Error estimating fee:', error.message);
    }
    
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });