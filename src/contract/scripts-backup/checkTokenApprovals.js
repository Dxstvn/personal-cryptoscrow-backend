const { ethers } = require('hardhat');

async function main() {
    console.log('\n=== Checking Token Approvals and Balances ===\n');
    
    const adapterAddress = '0x90653738e66a0fa93bf20b087e6a39a704fa39e1';
    const tokenAddress = '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14'; // WETH on Sepolia
    const testAmount = ethers.parseEther('0.001');
    
    const [signer] = await ethers.getSigners();
    console.log(`🔑 Checking for wallet: ${signer.address}`);
    
    // Get contracts
    const token = await ethers.getContractAt('IERC20', tokenAddress);
    const adapter = await ethers.getContractAt('PropertyOFTAdapter', adapterAddress);
    
    // Check balances
    console.log('\n💰 Balances:');
    const userBalance = await token.balanceOf(signer.address);
    const adapterBalance = await token.balanceOf(adapterAddress);
    console.log(`   User WETH balance: ${ethers.formatEther(userBalance)} WETH`);
    console.log(`   Adapter WETH balance: ${ethers.formatEther(adapterBalance)} WETH`);
    
    // Check allowance
    console.log('\n✅ Allowances:');
    const allowance = await token.allowance(signer.address, adapterAddress);
    console.log(`   Current allowance: ${ethers.formatEther(allowance)} WETH`);
    console.log(`   Sufficient for test: ${allowance >= testAmount ? '✅' : '❌'}`);
    
    // Check if user has enough balance
    if (userBalance < testAmount) {
        console.log('\n❌ Insufficient WETH balance!');
        console.log('   You need to wrap some ETH first.');
        
        // Check ETH balance
        const ethBalance = await ethers.provider.getBalance(signer.address);
        console.log(`\n   ETH balance: ${ethers.formatEther(ethBalance)} ETH`);
        
        if (ethBalance > ethers.parseEther('0.01')) {
            console.log('\n   Would you like to wrap some ETH? Run:');
            console.log('   npx hardhat run scripts/wrapTokensSimple.js --network sepolia');
        }
    }
    
    // If balance is sufficient but allowance is not
    if (userBalance >= testAmount && allowance < testAmount) {
        console.log('\n⚠️  Need to approve the adapter to spend WETH.');
        console.log('   Setting approval...');
        
        try {
            const tx = await token.approve(adapterAddress, ethers.parseEther('1.0'));
            console.log(`   Approval tx: ${tx.hash}`);
            await tx.wait();
            console.log('   ✅ Approval confirmed!');
        } catch (error) {
            console.log('   ❌ Approval failed:', error.message);
        }
    }
    
    // Try a direct quote to see the exact error
    if (userBalance >= testAmount) {
        console.log('\n🔍 Testing quote with current balance:');
        
        const sendParam = {
            dstEid: 40267, // Polygon Amoy
            to: ethers.zeroPadValue(signer.address, 32),
            amountLD: testAmount,
            minAmountLD: testAmount * 99n / 100n, // 1% slippage
            extraOptions: '0x000300000000000000000000000000000000000000000000000000000000000000030000000000000000000000000000000000000000000000000000000000030d40',
            composeMsg: '0x',
            oftCmd: '0x'
        };
        
        try {
            console.log('   Calling quoteSend...');
            const [nativeFee] = await adapter.quoteSend(sendParam, false);
            console.log(`   ✅ Quote successful! Fee: ${ethers.formatEther(nativeFee)} ETH`);
        } catch (error) {
            console.log('   ❌ Quote failed:', error.message);
            
            // Try to decode the error
            if (error.data) {
                try {
                    const decodedError = adapter.interface.parseError(error.data);
                    console.log('   Decoded error:', decodedError);
                } catch (e) {
                    console.log('   Raw error data:', error.data);
                }
            }
        }
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });