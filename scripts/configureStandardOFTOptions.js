import pkg from "hardhat";
const { ethers } = pkg;
import fs from "fs";

async function main() {
    console.log("=== Configuring Enforced Options for Standard OFT Adapters ===\n");
    
    const [signer] = await ethers.getSigners();
    console.log("Configuring with account:", signer.address);
    
    // Load deployments
    const deployments = JSON.parse(fs.readFileSync('./deployments/testnet-deployments.json', 'utf8'));
    
    // Get current network
    const network = await ethers.provider.getNetwork();
    const currentNetwork = network.chainId === 11155111n ? 'sepolia' :
                          network.chainId === 80002n ? 'polygon-amoy' :
                          network.chainId === 421614n ? 'arbitrum-sepolia' : null;
    
    if (!currentNetwork) {
        throw new Error(`Unknown network with chainId ${network.chainId}`);
    }
    
    console.log(`Current network: ${currentNetwork}`);
    
    // Get the standard OFT adapter for current network
    const currentAdapter = deployments[currentNetwork]?.standardOftAdapters?.WETH || 
                          deployments[currentNetwork]?.standardOftAdapters?.WMATIC;
    
    if (!currentAdapter) {
        throw new Error(`No standard OFT adapter found for ${currentNetwork}`);
    }
    
    console.log(`Adapter address: ${currentAdapter.address}\n`);
    
    // Connect to adapter
    const adapter = await ethers.getContractAt(
        "PropertyOFTAdapter",
        currentAdapter.address
    );
    
    // Network endpoint IDs
    const endpointIds = {
        'sepolia': 40161,
        'polygon-amoy': 40267,
        'arbitrum-sepolia': 40231
    };
    
    // Build Type 3 options with gas limit
    function buildType3Options(gasLimit) {
        // Option 3 = lzReceive with gas
        const optionType = 3;
        const option = ethers.AbiCoder.defaultAbiCoder().encode(
            ['uint16', 'uint256'],
            [optionType, gasLimit]
        );
        
        // Type 3 prefix
        const typePrefix = "0x0003";
        
        // Combine type prefix with option data
        return typePrefix + option.slice(2); // Remove 0x from option
    }
    
    const options = buildType3Options(200000); // 200k gas
    console.log("Enforced options:", options);
    console.log("");
    
    // Set enforced options for each destination
    const enforcedOptionsArray = [];
    
    for (const [networkName, eid] of Object.entries(endpointIds)) {
        if (networkName === currentNetwork) continue;
        
        enforcedOptionsArray.push({
            eid: eid,
            msgType: 1, // SEND message type
            options: options
        });
        console.log(`  • ${networkName} (eid: ${eid})`);
    }
    
    try {
        console.log("\nSetting enforced options...");
        const tx = await adapter.setEnforcedOptions(enforcedOptionsArray);
        console.log(`📤 Transaction sent: ${tx.hash}`);
        console.log("⏳ Waiting for confirmation...");
        
        const receipt = await tx.wait();
        console.log(`✅ Enforced options configured successfully!`);
        console.log(`   Gas used: ${receipt.gasUsed}`);
        
        // Verify configuration
        console.log("\n=== Verifying Configuration ===");
        for (const [networkName, eid] of Object.entries(endpointIds)) {
            if (networkName === currentNetwork) continue;
            
            try {
                const enforcedOption = await adapter.enforcedOptions(eid, 1);
                console.log(`${networkName}: ${enforcedOption ? 'Configured ✅' : 'Not set ❌'}`);
                if (enforcedOption && enforcedOption !== "0x") {
                    console.log(`  Options: ${enforcedOption}`);
                }
            } catch (e) {
                console.log(`${networkName}: Unable to verify - ${e.message}`);
            }
        }
        
    } catch (error) {
        console.error("\n❌ Failed to set enforced options:", error.message);
        
        // Try to decode the error
        if (error.data) {
            console.log("\nError data:", error.data);
        }
    }
    
    console.log("\n=== Next Steps ===");
    console.log("1. Run this script on all networks");
    console.log("2. Test cross-chain transfers with the standard OFT adapters");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("\n❌ Script failed:", error);
        process.exit(1);
    });