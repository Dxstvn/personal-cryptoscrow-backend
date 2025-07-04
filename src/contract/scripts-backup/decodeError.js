const { ethers } = require('hardhat');

async function main() {
    console.log('\n=== Decoding Error Selector ===\n');
    
    const errorData = '0x6780cfaf0000000000000000000000000000000000000000000000000000000000000000';
    const errorSelector = errorData.slice(0, 10);
    
    console.log(`Error selector: ${errorSelector}`);
    
    // Common LayerZero and OFT errors
    const knownErrors = [
        // OFT Core errors
        'InvalidLocalDecimals()',
        'InvalidAmount()',
        'SlippageExceeded(uint256,uint256)',
        
        // OApp errors  
        'OnlyEndpoint(address,address)',
        'OnlyPeer(uint32,bytes32)',
        'NoPeer(uint32)',
        'InvalidEndpointCall()',
        'InvalidDelegate()',
        
        // Endpoint errors
        'LZ_InvalidEndpointCaller()',
        'LZ_InvalidNonce(uint64)',
        'LZ_InvalidAmount(uint256)',
        'LZ_NoMessageLib(address,uint32)',
        'LZ_SameValue()',
        
        // Message lib errors
        'LZ_UnsupportedEid(uint32)',
        'LZ_InvalidReceiveLibrary()',
        'LZ_InvalidConfig()',
        'LZ_NotEnoughNativeFee(uint256,uint256)',
        
        // Additional OFT errors
        'InvalidMinAmount()',
        'InvalidOptions()',
        'Unauthorized()',
        
        // Token errors
        'InsufficientBalance()',
        'InsufficientAllowance()'
    ];
    
    console.log('Checking against known error signatures:\n');
    
    let found = false;
    for (const errorSig of knownErrors) {
        const hash = ethers.id(errorSig);
        const selector = hash.slice(0, 10);
        
        if (selector === errorSelector) {
            console.log(`✅ FOUND: ${errorSig}`);
            console.log(`   Full hash: ${hash}`);
            found = true;
            
            // If the error has parameters, try to decode them
            if (errorSig.includes('(') && !errorSig.endsWith('()')) {
                console.log('   Attempting to decode parameters...');
                const paramStart = errorSig.indexOf('(');
                const paramEnd = errorSig.lastIndexOf(')');
                const paramTypes = errorSig.slice(paramStart + 1, paramEnd).split(',').map(t => t.trim());
                
                try {
                    const decoded = ethers.AbiCoder.defaultAbiCoder().decode(
                        paramTypes,
                        '0x' + errorData.slice(10)
                    );
                    console.log('   Decoded parameters:', decoded);
                } catch (e) {
                    console.log('   Could not decode parameters');
                }
            }
            break;
        }
    }
    
    if (!found) {
        console.log(`❌ Unknown error selector: ${errorSelector}`);
        console.log('\nTrying reverse lookup...');
        
        // Generate more potential error signatures
        const additionalErrors = [
            'LZ_InvalidAmount()',
            'InvalidAmountLD()',
            'InvalidAmountSD()', 
            'AmountTooSmall()',
            'ZeroAmount()',
            'DustAmount()',
            'BelowMinimum(uint256,uint256)',
            'InvalidPath(uint32)',
            'NotImplemented()'
        ];
        
        for (const errorSig of additionalErrors) {
            const hash = ethers.id(errorSig);
            const selector = hash.slice(0, 10);
            
            if (selector === errorSelector) {
                console.log(`✅ FOUND: ${errorSig}`);
                found = true;
                break;
            }
        }
    }
    
    if (!found) {
        console.log('\n🔍 The error selector might be from the endpoint or message library.');
        console.log('   This typically indicates a configuration or validation issue.');
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });