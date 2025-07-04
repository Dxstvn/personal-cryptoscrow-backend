const { ethers } = require('hardhat');

async function main() {
    console.log('\n=== Debugging Send Error with Static Call ===\n');
    
    const adapterAddress = '0x90653738e66a0fa93bf20b087e6a39a704fa39e1';
    const tokenAddress = '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14';
    const polygonEid = 40267;
    const amount = ethers.parseEther('0.001');
    
    const [signer] = await ethers.getSigners();
    const adapter = await ethers.getContractAt('PropertyOFTAdapter', adapterAddress);
    const token = await ethers.getContractAt('IERC20', tokenAddress);
    
    // First, let's make sure we have proper setup
    console.log('📋 Pre-flight checks:');
    const balance = await token.balanceOf(signer.address);
    const allowance = await token.allowance(signer.address, adapterAddress);
    console.log(`  Balance: ${ethers.formatEther(balance)} WETH`);
    console.log(`  Allowance: ${ethers.formatEther(allowance)} WETH`);
    console.log(`  Amount to send: ${ethers.formatEther(amount)} WETH`);
    
    if (balance < amount || allowance < amount) {
        console.log('\n❌ Insufficient balance or allowance');
        return;
    }
    
    // Create send parameters
    const sendParam = {
        dstEid: polygonEid,
        to: ethers.zeroPadValue(signer.address, 32),
        amountLD: amount,
        minAmountLD: amount * 99n / 100n, // 1% slippage
        extraOptions: '0x000300000000000000000000000000000000000000000000000000000000000000030000000000000000000000000000000000000000000000000000000000030d40',
        composeMsg: '0x',
        oftCmd: '0x'
    };
    
    // Try different approaches to get the error
    console.log('\n🔍 Attempting different error capture methods:\n');
    
    // Method 1: Try quoteSend with staticCall
    console.log('1. Using staticCall on quoteSend:');
    try {
        const result = await adapter.quoteSend.staticCall(sendParam, false);
        console.log('   ✅ Quote successful:', result);
    } catch (error) {
        console.log('   ❌ Error:', error.message);
        if (error.data) {
            console.log('   Error data:', error.data);
            
            // Try to decode common OFT errors
            const oftErrors = [
                'InvalidAmount',
                'SlippageExceeded', 
                'InvalidMinAmount',
                'InvalidOptions',
                'NoPeer',
                'InvalidEndpointCall'
            ];
            
            for (const errName of oftErrors) {
                try {
                    const errSig = ethers.id(errName + '()').slice(0, 10);
                    if (error.data.includes(errSig.slice(2))) {
                        console.log(`   🎯 Detected error: ${errName}`);
                    }
                } catch (e) {}
            }
        }
    }
    
    // Method 2: Check removal amounts
    console.log('\n2. Checking amount conversions:');
    try {
        // Get the removal amounts that would be used
        const removableLD = await adapter.removeDust(amount);
        console.log(`   Amount LD: ${amount}`);
        console.log(`   Removable LD: ${removableLD}`);
        console.log(`   Dust: ${amount - removableLD}`);
        
        if (removableLD === 0n) {
            console.log('   ❌ ERROR: Amount converts to 0 after dust removal!');
            console.log('   This would cause InvalidAmount error');
        }
        
        // Check SD conversion
        const decimalRate = await adapter.decimalConversionRate();
        const amountSD = removableLD / decimalRate;
        console.log(`   Amount SD: ${amountSD}`);
        
        if (amountSD === 0n) {
            console.log('   ❌ ERROR: Amount converts to 0 in shared decimals!');
        }
    } catch (error) {
        console.log('   Could not check conversions:', error.message);
    }
    
    // Method 3: Try to simulate the actual send
    console.log('\n3. Simulating send transaction:');
    try {
        // First get the fee
        const [nativeFee] = await adapter.quoteSend(sendParam, false);
        console.log(`   Estimated fee: ${ethers.formatEther(nativeFee)} ETH`);
        
        const ethBalance = await ethers.provider.getBalance(signer.address);
        console.log(`   ETH balance: ${ethers.formatEther(ethBalance)} ETH`);
        
        if (ethBalance < nativeFee) {
            console.log('   ❌ Insufficient ETH for gas fees');
            return;
        }
        
        // Try static call of send
        const result = await adapter.send.staticCall(
            sendParam,
            { nativeFee, lzTokenFee: 0 },
            signer.address,
            { value: nativeFee }
        );
        console.log('   ✅ Send simulation successful!');
        console.log('   Result:', result);
    } catch (error) {
        console.log('   ❌ Send simulation failed:', error.message);
        
        // Extract revert reason
        if (error.reason) {
            console.log('   Revert reason:', error.reason);
        }
        if (error.errorName) {
            console.log('   Error name:', error.errorName);
        }
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });