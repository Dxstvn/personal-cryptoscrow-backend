const { ethers } = require('ethers');
require('dotenv').config({ path: '../../../.env' });

async function deepContractAnalysis() {
    const contractAddress = '0xA220E7F09a7779bb81E99E615763f3957205BdD7';
    
    // Connect to Sepolia
    const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
    
    console.log('Deep analysis of contract at:', contractAddress);
    console.log('Network: Sepolia\n');
    
    // Get transaction that created the contract
    console.log('=== Contract Creation Analysis ===');
    
    // Try to find creation transaction by checking recent blocks
    // This is a simplified approach - in production you'd use Etherscan API
    
    // Manual function signature calculation
    const iface = new ethers.Interface([
        "function owner() view returns (address)",
        "function serviceWallet() view returns (address)",
        "function escrowCount() view returns (uint256)",
        "function escrows(uint256) view returns (address buyer, address seller, address arbiter, uint256 amount, address token, uint8 status, uint256 createdAt)",
        "function createEscrow(address _seller, address _arbiter, uint256 _amount, address _token) returns (uint256)",
        "function releaseEscrow(uint256 _escrowId)",
        "function refundEscrow(uint256 _escrowId)",
        "function acceptedTokens(address) view returns (bool)",
        "function serviceFee() view returns (uint256)",
        "function withdraw()",
        "function addAcceptedToken(address _token)",
        "function removeAcceptedToken(address _token)",
        "function setServiceFee(uint256 _fee)",
        "function setServiceWallet(address _wallet)"
    ]);
    
    console.log('Testing comprehensive function set...\n');
    
    const functionTests = [
        { name: 'owner', args: [] },
        { name: 'serviceWallet', args: [] },
        { name: 'escrowCount', args: [] },
        { name: 'serviceFee', args: [] }
    ];
    
    for (const test of functionTests) {
        try {
            const data = iface.encodeFunctionData(test.name, test.args);
            const result = await provider.call({
                to: contractAddress,
                data: data
            });
            
            if (result !== '0x') {
                const decoded = iface.decodeFunctionResult(test.name, result);
                console.log(`✅ ${test.name}():`, decoded[0].toString());
            } else {
                console.log(`❌ ${test.name}(): No data returned`);
            }
        } catch (error) {
            console.log(`❌ ${test.name}(): ${error.message.split('\n')[0]}`);
        }
    }
    
    // Check for specific storage slots
    console.log('\n=== Storage Slot Analysis ===');
    
    const storageSlots = [
        { slot: 0, name: 'Slot 0 (usually owner)' },
        { slot: 1, name: 'Slot 1 (service wallet?)' },
        { slot: 2, name: 'Slot 2 (counter?)' },
        { slot: 3, name: 'Slot 3' },
        { slot: 4, name: 'Slot 4' },
        { slot: 5, name: 'Slot 5' }
    ];
    
    for (const { slot, name } of storageSlots) {
        try {
            const value = await provider.getStorage(contractAddress, slot);
            if (value !== '0x0000000000000000000000000000000000000000000000000000000000000000') {
                console.log(`${name}: ${value}`);
                
                // Try to interpret as address
                if (value.length === 66) {
                    const potentialAddress = '0x' + value.slice(26);
                    if (ethers.isAddress(potentialAddress)) {
                        console.log(`  Decoded as address: ${potentialAddress}`);
                    }
                }
            }
        } catch (e) {
            console.log(`${name}: Error reading`);
        }
    }
    
    // Check if it might be a minimal proxy
    console.log('\n=== Proxy Pattern Check ===');
    const code = await provider.getCode(contractAddress);
    
    // EIP-1167 minimal proxy bytecode pattern
    const minimalProxyPattern = '363d3d373d3d3d363d73';
    if (code.includes(minimalProxyPattern)) {
        console.log('✅ This appears to be an EIP-1167 minimal proxy');
        
        // Extract implementation address
        const implStart = code.indexOf(minimalProxyPattern) + minimalProxyPattern.length;
        const implAddress = '0x' + code.substring(implStart, implStart + 40);
        console.log('Implementation address:', implAddress);
    } else {
        console.log('❌ Not an EIP-1167 minimal proxy');
    }
    
    // Check for other proxy patterns
    const proxyPatterns = {
        'EIP-1967': code.includes('360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc'),
        'OpenZeppelin Transparent': code.includes('b53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103'),
        'UUPS': code.includes('360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc')
    };
    
    Object.entries(proxyPatterns).forEach(([pattern, found]) => {
        console.log(`${pattern} Proxy: ${found ? '✅' : '❌'}`);
    });
}

// Run the analysis
deepContractAnalysis().catch(console.error);