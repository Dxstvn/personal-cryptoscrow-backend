const { ethers } = require("hardhat");

async function main() {
    // Function signatures we're interested in
    const functions = [
        "returnFundsAfterDisputeTimeout(bytes32)",
        "getStargateQuote(uint256,uint256)",
        "getStargateQuote(uint256,address,uint256)",
        "_returnFundsToBuyer(bytes32)",
        "_handleConvertAndStargateTransfer(bytes32,EscrowDeposit,uint16,TokenConfig)"
    ];
    
    console.log("Checking function selectors for potential collisions:\n");
    
    const selectors = {};
    
    for (const func of functions) {
        const hash = ethers.keccak256(ethers.toUtf8Bytes(func));
        const selector = hash.slice(0, 10); // First 4 bytes (0x + 8 chars)
        
        console.log(`Function: ${func}`);
        console.log(`Hash: ${hash}`);
        console.log(`Selector: ${selector}`);
        console.log("---");
        
        if (selectors[selector]) {
            console.log(`⚠️  COLLISION DETECTED! ${func} has same selector as ${selectors[selector]}`);
        }
        selectors[selector] = func;
    }
    
    // Also check the actual contract
    try {
        const DisputesContract = await ethers.getContractFactory("UniversalEscrowServiceV3Disputes");
        const abi = DisputesContract.interface;
        
        console.log("\nActual function selectors from contract ABI:");
        
        const fragments = Object.values(abi.functions);
        const contractSelectors = {};
        
        for (const fragment of fragments) {
            const selector = abi.getSighash(fragment);
            console.log(`${fragment.name}: ${selector}`);
            
            if (contractSelectors[selector]) {
                console.log(`⚠️  SELECTOR COLLISION in contract: ${fragment.name} and ${contractSelectors[selector]}`);
            }
            contractSelectors[selector] = fragment.name;
        }
        
    } catch (error) {
        console.error("Error loading contract:", error.message);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });