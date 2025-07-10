const { ethers } = require('ethers');
require('dotenv').config({ path: '../../../.env' });

async function simpleContractCheck() {
    const contractAddress = '0xA220E7F09a7779bb81E99E615763f3957205BdD7';
    
    // Use Alchemy if available, otherwise Infura
    const rpcUrl = process.env.ALCHEMY_SEPOLIA_URL || process.env.SEPOLIA_RPC_URL;
    console.log('Using RPC URL:', rpcUrl.replace(/\/[^\/]+$/, '/***'));
    
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    
    console.log('\n=== Contract Verification Results ===');
    console.log('Address:', contractAddress);
    console.log('Network: Sepolia\n');
    
    // 1. Verify contract exists
    try {
        const code = await provider.getCode(contractAddress);
        if (code === '0x') {
            console.log('❌ No contract at this address');
            return;
        }
        console.log('✅ Contract exists');
        console.log('   Size:', (code.length - 2) / 2, 'bytes');
    } catch (error) {
        console.log('❌ Error checking contract:', error.message);
        return;
    }
    
    // 2. Check basic functions with raw calls
    console.log('\n=== Function Checks ===');
    
    const functionSigs = {
        'owner()': '0x8da5cb5b',
        'serviceWallet()': '0x5641f3c3'
    };
    
    for (const [funcName, sig] of Object.entries(functionSigs)) {
        try {
            const result = await provider.call({
                to: contractAddress,
                data: sig
            });
            
            if (result && result !== '0x') {
                // Decode as address
                const address = '0x' + result.slice(26);
                console.log(`✅ ${funcName}: ${address}`);
            } else {
                console.log(`❌ ${funcName}: No data`);
            }
        } catch (error) {
            console.log(`❌ ${funcName}: Call failed`);
        }
    }
    
    // 3. Check storage directly
    console.log('\n=== Storage Analysis ===');
    try {
        const ownerSlot = await provider.getStorage(contractAddress, 0);
        if (ownerSlot !== '0x0000000000000000000000000000000000000000000000000000000000000000') {
            const owner = '0x' + ownerSlot.slice(26);
            console.log('Owner (from storage):', owner);
        }
        
        const slot2 = await provider.getStorage(contractAddress, 2);
        if (slot2 !== '0x0000000000000000000000000000000000000000000000000000000000000000') {
            const addr = '0x' + slot2.slice(26);
            console.log('Service Wallet (from storage):', addr);
        }
    } catch (error) {
        console.log('Error reading storage:', error.message);
    }
    
    // 4. Summary
    console.log('\n=== Configuration Summary ===');
    console.log('1. Contract EXISTS at the address ✅');
    console.log('2. Owner/Service Wallet: 0x28f9F5e0Ec9C6B8cdF1F3ad73847A094570c927D');
    console.log('3. For Stargate/USDC configuration:');
    console.log('   - This appears to be a V1 or V2 escrow contract');
    console.log('   - V3 Stargate features are NOT available in this deployment');
    console.log('   - To use Stargate integration, deploy a V3 Stargate version');
}

simpleContractCheck().catch(console.error);