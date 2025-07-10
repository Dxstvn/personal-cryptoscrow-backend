const { ethers } = require('ethers');
require('dotenv').config({ path: '../../../.env' });

async function checkContractFunctions() {
    const contractAddress = '0xA220E7F09a7779bb81E99E615763f3957205BdD7';
    
    // Connect to Sepolia
    const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
    
    console.log('Checking available functions at:', contractAddress);
    console.log('Network: Sepolia\n');
    
    // List of common function signatures to try
    const functionSignatures = [
        // Owner/Admin functions
        { name: 'owner()', sig: '0x8da5cb5b' },
        { name: 'serviceWallet()', sig: '0xb1906103' },
        { name: 'transferOwnership(address)', sig: '0xf2fde38b' },
        
        // Escrow count variations
        { name: 'escrowCount()', sig: '0xc842e41f' },
        { name: 'escrowCounter()', sig: '0x4b0e7216' },
        { name: 'totalEscrows()', sig: '0x7d7c2e1b' },
        
        // Token functions
        { name: 'usdc()', sig: '0x3e413bee' },
        { name: 'usdcToken()', sig: '0x25be124b' },
        { name: 'weth()', sig: '0x3fc8cef3' },
        { name: 'wethToken()', sig: '0x4aa07e64' },
        { name: 'acceptedTokens(address)', sig: '0x1640645f' },
        
        // LayerZero functions
        { name: 'layerZeroEndpoint()', sig: '0x7774a6e0' },
        { name: 'lzEndpoint()', sig: '0xb353aaa7' },
        { name: 'endpoint()', sig: '0x5e280f11' },
        { name: 'trustedRemotes(uint16)', sig: '0x8da5cb5b' },
        { name: 'getChainId()', sig: '0x3408e470' },
        
        // Stargate functions
        { name: 'stargateRouter()', sig: '0x459de6ab' },
        { name: 'stargateRouterETH()', sig: '0x8e499bcf' },
        { name: 'router()', sig: '0xf887ea40' },
        
        // Escrow functions
        { name: 'escrows(uint256)', sig: '0x7150d8ae' },
        { name: 'createEscrow(address,address,uint256,address)', sig: '0x8e9e7922' },
        { name: 'getEscrow(uint256)', sig: '0x2e1a7d4d' },
        
        // Fee functions
        { name: 'fee()', sig: '0xddca3f43' },
        { name: 'serviceFee()', sig: '0x8abdf5aa' },
        { name: 'feePercent()', sig: '0x7fd6f15c' }
    ];
    
    console.log('Testing function calls...\n');
    
    const availableFunctions = [];
    
    for (const func of functionSignatures) {
        try {
            // Try to call the function with low-level call
            const result = await provider.call({
                to: contractAddress,
                data: func.sig
            });
            
            if (result !== '0x') {
                availableFunctions.push(func.name);
                console.log(`✅ ${func.name} - Available`);
                
                // Try to decode common return types
                try {
                    if (func.name.includes('()')) {
                        // No parameters, likely returns address or uint
                        if (result.length === 66) { // Address return
                            const decoded = ethers.AbiCoder.defaultAbiCoder().decode(['address'], result);
                            console.log(`   Value: ${decoded[0]}`);
                        } else if (result.length === 66) { // uint256 return
                            const decoded = ethers.AbiCoder.defaultAbiCoder().decode(['uint256'], result);
                            console.log(`   Value: ${decoded[0]}`);
                        }
                    }
                } catch (e) {
                    // Decoding failed, just show raw result
                    console.log(`   Raw: ${result.substring(0, 10)}...`);
                }
            }
        } catch (error) {
            // Function doesn't exist or reverted
        }
    }
    
    console.log('\n=== Summary ===');
    console.log(`Found ${availableFunctions.length} available functions:`);
    availableFunctions.forEach(f => console.log(`  - ${f}`));
    
    // Try to get the contract bytecode to analyze further
    console.log('\n=== Contract Analysis ===');
    const code = await provider.getCode(contractAddress);
    
    // Check for common contract patterns in bytecode
    const codeStr = code.toLowerCase();
    const patterns = {
        'ERC20': codeStr.includes('a9059cbb') || codeStr.includes('dd62ed3e'),
        'Ownable': codeStr.includes('8da5cb5b') || codeStr.includes('f2fde38b'),
        'LayerZero': codeStr.includes('66ad5c8a') || codeStr.includes('07e0db17'),
        'Upgradeable': codeStr.includes('3659cfe6') || codeStr.includes('4f1ef286')
    };
    
    console.log('Contract patterns detected:');
    Object.entries(patterns).forEach(([pattern, detected]) => {
        console.log(`  ${pattern}: ${detected ? '✅' : '❌'}`);
    });
}

// Run the check
checkContractFunctions().catch(console.error);