const { ethers } = require('hardhat');

async function main() {
    console.log('\n=== Debugging Endpoint Error ===\n');
    
    // The error selector we found
    const errorSelector = '0x6780cfaf';
    
    // Let's calculate what common endpoint/ULN errors might have this selector
    const endpointErrors = [
        // Endpoint V2 errors
        'InvalidAmount(uint256)',
        'InvalidPath()',
        'InvalidEid(uint32)',
        'UnsupportedEid(uint32)',
        'InvalidNonce(uint64)',
        'InvalidReceiver()',
        'InvalidSender()',
        'NoMessageLib(uint32)',
        'InvalidMsgValue()',
        'InvalidDelegate(address)',
        'OnlyDelegate()',
        'Unauthorized()',
        'AlreadySet()',
        'NotImplemented()',
        'UnsupportedInterface()',
        'InvalidConfig()',
        'InvalidConfigType(uint32)',
        
        // ULN specific errors
        'LZ_ULN_Unsorted()',
        'LZ_ULN_InvalidRequiredDVNCount()',
        'LZ_ULN_InvalidOptionalDVNCount()',
        'LZ_ULN_InvalidOptionalDVNThreshold()',
        'LZ_ULN_InvalidConfirmations()',
        'LZ_ULN_UnsupportedOptionType(uint16)',
        'LZ_ULN_InvalidWorkerId(uint8)',
        'LZ_ULN_InvalidParams(uint16)',
        'LZ_ULN_InvalidEid()',
        
        // Verifier errors
        'LZ_Verifier_InvalidArgument()',
        'Verifier_InvalidDVN()',
        'Verifier_InvalidThreshold()',
        'Verifier_InvalidDVNCount()',
        
        // Common variations
        'InvalidAmountLD(uint256)',
        'InvalidAmountSD(uint256)',
        'AmountTooSmall(uint256,uint256)',
        'InsufficientAmount(uint256,uint256)',
        'ZeroAmount()'
    ];
    
    console.log('Testing error signatures...\n');
    
    let found = false;
    for (const errorSig of endpointErrors) {
        try {
            const hash = ethers.id(errorSig);
            const selector = hash.slice(0, 10);
            
            if (selector.toLowerCase() === errorSelector.toLowerCase()) {
                console.log(`✅ MATCH FOUND: ${errorSig}`);
                console.log(`   Hash: ${hash}`);
                found = true;
                break;
            }
        } catch (e) {
            // Skip invalid signatures
        }
    }
    
    if (!found) {
        // Let's try a different approach - check what function is being called
        console.log('❌ No match found in common errors\n');
        console.log('🔍 Analyzing the context:\n');
        
        console.log('The error occurs during quoteSend, which internally calls:');
        console.log('1. _debit() - to check the amount conversion');
        console.log('2. endpoint.quote() - to get the messaging fee');
        console.log('\nThe error selector 0x6780cfaf might be from:');
        console.log('- The endpoint\'s quote function');
        console.log('- The message library (ULN302)');
        console.log('- An internal validation in the OFT adapter');
        
        // Let's check if it could be a custom error with parameters
        console.log('\n📊 Attempting to decode as parameterized error:');
        
        const errorData = '0x6780cfaf0000000000000000000000000000000000000000000000000000000000000000';
        const paramData = '0x' + errorData.slice(10);
        
        // Try different parameter combinations
        const paramCombos = [
            ['uint256'],
            ['address'],
            ['uint32'],
            ['bytes32'],
            ['uint256', 'uint256'],
            ['address', 'uint256'],
            ['uint32', 'uint256']
        ];
        
        for (const params of paramCombos) {
            try {
                const decoded = ethers.AbiCoder.defaultAbiCoder().decode(params, paramData);
                console.log(`\nDecoded as (${params.join(', ')}):`, decoded);
                
                // Check if the decoded values make sense
                if (params[0] === 'uint256' && decoded[0] === 0n) {
                    console.log('  → Could be a "zero amount" error');
                }
                if (params[0] === 'uint32' && decoded[0] === 0) {
                    console.log('  → Could be an "invalid endpoint ID" error');
                }
            } catch (e) {
                // Skip failed decodings
            }
        }
    }
    
    // Final analysis
    console.log('\n📝 Summary:');
    console.log('The error 0x6780cfaf with a zero parameter suggests:');
    console.log('1. An amount validation failure (amount is 0 after conversion)');
    console.log('2. An endpoint configuration issue');
    console.log('3. A missing or invalid parameter in the quote request');
    
    console.log('\n💡 Recommended next steps:');
    console.log('1. Check if the token has non-standard decimals');
    console.log('2. Verify the endpoint accepts the destination chain');
    console.log('3. Ensure the message library is properly configured');
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });