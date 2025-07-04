const { ethers } = require('hardhat');

async function main() {
    console.log('\n=== Checking Adapter Configuration Methods ===\n');
    
    const adapterAddress = '0x90653738e66a0fa93bf20b087e6a39a704fa39e1';
    const adapter = await ethers.getContractAt('PropertyOFTAdapter', adapterAddress);
    
    // Check if the adapter has setConfig or similar methods
    console.log('🔍 Checking available configuration methods:\n');
    
    // Get the contract interface
    const functions = adapter.interface.fragments.filter(f => f.type === 'function');
    const configFunctions = functions.filter(f => 
        f.name.toLowerCase().includes('config') || 
        f.name.toLowerCase().includes('dvn') ||
        f.name.toLowerCase().includes('peer') ||
        f.name.toLowerCase().includes('trusted')
    );
    
    console.log('Configuration-related functions:');
    configFunctions.forEach(f => {
        console.log(`  - ${f.name}(${f.inputs.map(i => i.type).join(', ')})`);
    });
    
    // Check current configuration state
    console.log('\n📊 Current Configuration State:');
    
    // Check peers
    const polygonEid = 40267;
    const sepoliaEid = 40161;
    
    try {
        const polygonPeer = await adapter.peers(polygonEid);
        console.log(`\nPolygon peer: ${polygonPeer}`);
        if (polygonPeer !== '0x0000000000000000000000000000000000000000000000000000000000000000') {
            console.log('  ✅ Polygon peer is set');
        }
    } catch (e) {
        console.log('  Could not check polygon peer');
    }
    
    // Check if there's a setConfig function on the adapter
    console.log('\n🔧 Checking for OApp setConfig:');
    
    try {
        // The OApp base contract should have setConfig
        if (adapter.interface.getFunction('setConfig')) {
            console.log('  ✅ Adapter has setConfig function');
            console.log('  This should be used to set DVN configuration');
            
            // Create the fix script
            console.log('\n📝 To fix the configuration, you need to:');
            console.log('  1. Call adapter.setConfig() with proper DVN configuration');
            console.log('  2. The configuration should include:');
            console.log('     - Required DVNs for verification');
            console.log('     - Executor configuration');
            console.log('     - Proper confirmations count');
        }
    } catch (e) {
        console.log('  Adapter does not have direct setConfig');
    }
    
    // Check delegate configuration
    console.log('\n🔐 Checking delegate configuration:');
    
    try {
        const owner = await adapter.owner();
        const endpoint = await ethers.getContractAt('ILayerZeroEndpointV2', await adapter.endpoint());
        
        // Check if the owner is set as delegate
        const isDelegate = await endpoint.delegates(owner);
        console.log(`  Owner ${owner} is delegate: ${isDelegate ? '✅' : '❌'}`);
        
    } catch (e) {
        console.log('  Could not check delegate status');
    }
    
    // Summary
    console.log('\n📋 Configuration Issue Summary:');
    console.log('  The error "LZ_ULN_InvalidWorkerId(0)" occurs because:');
    console.log('  1. The ULN (Ultra Light Node) configuration is incomplete');
    console.log('  2. DVN (Decentralized Verifier Network) is not properly set');
    console.log('  3. The configuration needs to specify which DVNs to use for verification');
    console.log('\n  Solution: Use the adapter\'s setConfig function to set proper DVN configuration');
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });