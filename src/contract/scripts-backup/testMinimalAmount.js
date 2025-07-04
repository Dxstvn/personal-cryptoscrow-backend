const { ethers } = require('hardhat');

async function main() {
    console.log('\n=== Testing Minimal Cross-Chain Amount ===\n');
    
    const adapterAddress = '0x90653738e66a0fa93bf20b087e6a39a704fa39e1';
    const polygonEid = 40267;
    
    const [signer] = await ethers.getSigners();
    const adapter = await ethers.getContractAt('PropertyOFTAdapter', adapterAddress);
    
    // Test different amounts to find the minimum
    const testAmounts = [
        ethers.parseEther('0.0001'),   // 0.0001 WETH
        ethers.parseEther('0.001'),    // 0.001 WETH
        ethers.parseEther('0.01'),     // 0.01 WETH
        ethers.parseEther('0.1'),      // 0.1 WETH
        ethers.parseEther('1.0'),      // 1.0 WETH
    ];
    
    console.log('Testing different amounts to find minimum viable amount...\n');
    
    for (const amount of testAmounts) {
        console.log(`Testing ${ethers.formatEther(amount)} WETH:`);
        
        // Calculate shared decimal amount
        const sharedDecimals = 6; // Based on previous output
        const tokenDecimals = 18;
        const conversionRate = 10 ** (tokenDecimals - sharedDecimals);
        const sdAmount = amount / BigInt(conversionRate);
        
        console.log(`  LD amount: ${amount}`);
        console.log(`  SD amount: ${sdAmount}`);
        console.log(`  SD > 0: ${sdAmount > 0n ? '✅' : '❌'}`);
        
        // Try to quote
        const sendParam = {
            dstEid: polygonEid,
            to: ethers.zeroPadValue(signer.address, 32),
            amountLD: amount,
            minAmountLD: amount * 99n / 100n,
            extraOptions: '0x000300000000000000000000000000000000000000000000000000000000000000030000000000000000000000000000000000000000000000000000000000030d40',
            composeMsg: '0x',
            oftCmd: '0x'
        };
        
        try {
            const [nativeFee] = await adapter.quoteSend(sendParam, false);
            console.log(`  ✅ Quote successful! Fee: ${ethers.formatEther(nativeFee)} ETH`);
            console.log(`  This is the minimum viable amount!\n`);
            break;
        } catch (error) {
            console.log(`  ❌ Failed: ${error.message.substring(0, 50)}...`);
            
            // Check if it's specifically InvalidAmount
            if (error.message.includes('InvalidAmount') || error.message.includes('invalid amount')) {
                console.log(`  Amount too small for cross-chain transfer`);
            }
        }
        console.log('');
    }
    
    // Let's also check the adapter's view of the conversion
    console.log('\n📊 Checking adapter conversion functions:');
    
    try {
        // Test with 1 WETH
        const testAmount = ethers.parseEther('1.0');
        
        // Get decimal conversion rate
        const rate = await adapter.decimalConversionRate();
        console.log(`  Decimal conversion rate: ${rate}`);
        
        // Check what 1 WETH converts to
        const convertedAmount = testAmount / rate;
        console.log(`  1 WETH in LD: ${testAmount}`);
        console.log(`  1 WETH in SD: ${convertedAmount}`);
        
    } catch (error) {
        console.log('  Could not check conversion functions');
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });