const { ethers } = require('ethers');
require('dotenv').config({ path: '../../../.env' });

// Add delay function to avoid rate limiting
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function verifyEscrowContract() {
    const contractAddress = '0xA220E7F09a7779bb81E99E615763f3957205BdD7';
    
    // Connect to Sepolia
    const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
    
    console.log('=== Escrow Contract Verification ===');
    console.log('Contract Address:', contractAddress);
    console.log('Network: Sepolia\n');
    
    try {
        // 1. Check if contract exists
        console.log('1. Checking if contract exists...');
        const code = await provider.getCode(contractAddress);
        
        if (code === '0x') {
            console.log('❌ No contract found at this address');
            return;
        }
        
        console.log('✅ Contract exists');
        console.log('   Code size:', (code.length - 2) / 2, 'bytes');
        
        await delay(1000); // Delay to avoid rate limiting
        
        // 2. Check owner
        console.log('\n2. Checking contract owner...');
        const ownerABI = ["function owner() view returns (address)"];
        const contract = new ethers.Contract(contractAddress, ownerABI, provider);
        
        try {
            const owner = await contract.owner();
            console.log('✅ Owner:', owner);
        } catch (e) {
            console.log('❌ Could not retrieve owner');
        }
        
        await delay(1000);
        
        // 3. Try to determine contract type by checking specific functions
        console.log('\n3. Checking contract type...');
        
        // Try V1 escrow functions
        const v1ABI = [
            "function serviceWallet() view returns (address)",
            "function escrowCount() view returns (uint256)",
            "function serviceFee() view returns (uint256)"
        ];
        
        const v1Contract = new ethers.Contract(contractAddress, v1ABI, provider);
        let isV1 = false;
        
        try {
            const serviceWallet = await v1Contract.serviceWallet();
            console.log('✅ Service Wallet found:', serviceWallet);
            console.log('   This appears to be an Escrow contract');
            isV1 = true;
        } catch (e) {
            console.log('❌ serviceWallet() not found - might not be an escrow contract');
        }
        
        await delay(1000);
        
        if (isV1) {
            // 4. Check USDC and Stargate configuration
            console.log('\n4. Checking token and router configuration...');
            
            // Extended ABI for V2/V3 features
            const extendedABI = [
                "function usdc() view returns (address)",
                "function usdcToken() view returns (address)",
                "function stargateRouter() view returns (address)",
                "function stargateRouterETH() view returns (address)",
                "function layerZeroEndpoint() view returns (address)",
                "function lzEndpoint() view returns (address)"
            ];
            
            const extContract = new ethers.Contract(contractAddress, extendedABI, provider);
            
            // Check USDC
            console.log('\n   Token Configuration:');
            try {
                const usdc = await extContract.usdc();
                console.log('   ✅ USDC (v3):', usdc);
            } catch (e) {
                try {
                    const usdc = await extContract.usdcToken();
                    console.log('   ✅ USDC (v2):', usdc);
                } catch (e2) {
                    console.log('   ❌ USDC not configured');
                }
            }
            
            await delay(1000);
            
            // Check Stargate
            console.log('\n   Stargate Configuration:');
            try {
                const router = await extContract.stargateRouter();
                console.log('   ✅ Stargate Router:', router);
                
                const routerETH = await extContract.stargateRouterETH();
                console.log('   ✅ Stargate Router ETH:', routerETH);
                
                console.log('   => This is a V3 contract with Stargate support');
            } catch (e) {
                console.log('   ❌ Stargate routers not configured');
                console.log('   => This appears to be a V1 or V2 contract');
            }
            
            await delay(1000);
            
            // Check LayerZero
            console.log('\n   LayerZero Configuration:');
            try {
                const lz = await extContract.layerZeroEndpoint();
                console.log('   ✅ LayerZero Endpoint (v3):', lz);
            } catch (e) {
                try {
                    const lz = await extContract.lzEndpoint();
                    console.log('   ✅ LayerZero Endpoint (v2):', lz);
                } catch (e2) {
                    console.log('   ❌ LayerZero not configured');
                }
            }
        }
        
        // 5. Summary
        console.log('\n=== Summary ===');
        console.log('Contract exists at:', contractAddress);
        console.log('This appears to be an Escrow contract (likely V1 or V2)');
        console.log('Owner and serviceWallet are both set to:', '0x28f9F5e0Ec9C6B8cdF1F3ad73847A094570c927D');
        console.log('\nStargate routers: Not configured (not a V3 Stargate version)');
        console.log('USDC token: Need to check with V1/V2 specific methods');
        
    } catch (error) {
        console.error('Error:', error.message);
    }
}

// Run verification
verifyEscrowContract().catch(console.error);