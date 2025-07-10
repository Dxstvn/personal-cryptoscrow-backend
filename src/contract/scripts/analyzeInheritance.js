const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
    console.log("Analyzing contract inheritance and function calls...\n");
    
    // Read the contracts
    const disputesPath = path.join(__dirname, "../contracts/UniversalEscrowServiceV3Disputes.sol");
    const stargateEnhancedPath = path.join(__dirname, "../contracts/UniversalEscrowServiceV3StargateEnhanced.sol");
    
    const disputesCode = fs.readFileSync(disputesPath, "utf8");
    const stargateEnhancedCode = fs.readFileSync(stargateEnhancedPath, "utf8");
    
    // Find line 254 in both files
    console.log("Line 254 in UniversalEscrowServiceV3Disputes.sol:");
    const disputesLines = disputesCode.split("\n");
    console.log(`Line 254: ${disputesLines[253]}`); // 0-indexed
    console.log(`Context (lines 252-256):`);
    for (let i = 251; i <= 255 && i < disputesLines.length; i++) {
        console.log(`${i + 1}: ${disputesLines[i]}`);
    }
    
    console.log("\n\nLine 254 in UniversalEscrowServiceV3StargateEnhanced.sol:");
    const stargateLines = stargateEnhancedCode.split("\n");
    console.log(`Line 254: ${stargateLines[253]}`); // 0-indexed
    console.log(`Context (lines 252-256):`);
    for (let i = 251; i <= 255 && i < stargateLines.length; i++) {
        console.log(`${i + 1}: ${stargateLines[i]}`);
    }
    
    // Check for any calls from _returnFundsToBuyer
    console.log("\n\nSearching for _returnFundsToBuyer implementation:");
    const returnFundsStart = disputesCode.indexOf("function _returnFundsToBuyer");
    if (returnFundsStart !== -1) {
        const functionEnd = disputesCode.indexOf("}", returnFundsStart);
        const functionBody = disputesCode.substring(returnFundsStart, functionEnd + 1);
        console.log(functionBody);
    }
    
    // Check if there's any override or virtual keyword issues
    console.log("\n\nChecking for function overrides:");
    const overrideMatches = disputesCode.match(/override.*_returnFundsToBuyer/g);
    if (overrideMatches) {
        console.log("Found override:", overrideMatches);
    }
    
    // Check for any internal calls that might be causing issues
    console.log("\n\nChecking line 269 (the transfer line):");
    console.log(`Line 269: ${disputesLines[268]}`);
    console.log(`Context (lines 267-271):`);
    for (let i = 266; i <= 270 && i < disputesLines.length; i++) {
        console.log(`${i + 1}: ${disputesLines[i]}`);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });