import pkg from "hardhat";
const { ethers } = pkg;
import fs from "fs";

async function main() {
    console.log("=== Checking Standard OFT Adapter Delegate Configuration ===\n");
    
    const [signer] = await ethers.getSigners();
    console.log("Checking with account:", signer.address);
    
    // Load deployments
    const deployments = JSON.parse(fs.readFileSync('./deployments/testnet-deployments.json', 'utf8'));
    
    // Get Sepolia standard adapter
    const adapter = await ethers.getContractAt(
        "PropertyOFTAdapter",
        deployments.sepolia.standardOftAdapters.WETH.address
    );
    
    console.log("Standard OFT Adapter:", adapter.target);
    
    // Get endpoint
    const endpointAddress = await adapter.endpoint();
    console.log("Endpoint:", endpointAddress);
    
    // Check delegate on endpoint
    const endpointABI = [
        "function delegates(address oapp) view returns (address)",
        "function setDelegate(address delegate) external"
    ];
    
    const endpoint = new ethers.Contract(endpointAddress, endpointABI, signer);
    
    try {
        const currentDelegate = await endpoint.delegates(adapter.target);
        console.log("\nCurrent delegate for adapter:", currentDelegate);
        console.log("Is delegate set:", currentDelegate !== ethers.ZeroAddress);
        console.log("Is signer the delegate:", currentDelegate.toLowerCase() === signer.address.toLowerCase());
        
        if (currentDelegate === ethers.ZeroAddress) {
            console.log("\n⚠️  No delegate set! This is likely why quoteSend is failing.");
            console.log("The adapter needs to call setDelegate on the endpoint.");
        }
        
    } catch (error) {
        console.log("Error checking delegate:", error.message);
    }
    
    // Check enforced options
    console.log("\n=== Checking Enforced Options ===");
    try {
        const polygonEid = 40267;
        const enforcedOption = await adapter.enforcedOptions(polygonEid, 1);
        console.log("Enforced options for Polygon:", enforcedOption);
        console.log("Are enforced options set:", enforcedOption !== "0x");
    } catch (error) {
        console.log("Error checking enforced options:", error.message);
    }
    
    // Check message library configuration
    console.log("\n=== Checking Message Library ===");
    const endpointLibABI = [
        "function getSendLibrary(address oapp, uint32 eid) view returns (address)",
        "function getReceiveLibrary(address oapp, uint32 eid) view returns (address)",
        "function defaultSendLibrary(uint32 eid) view returns (address)",
        "function isDefaultSendLibrary(address oapp, uint32 eid) view returns (bool)"
    ];
    
    const endpointWithLib = new ethers.Contract(endpointAddress, endpointLibABI, signer);
    
    try {
        const polygonEid = 40267;
        const sendLib = await endpointWithLib.getSendLibrary(adapter.target, polygonEid);
        const defaultLib = await endpointWithLib.defaultSendLibrary(polygonEid);
        const isDefault = await endpointWithLib.isDefaultSendLibrary(adapter.target, polygonEid);
        
        console.log("Send library for Polygon:", sendLib);
        console.log("Default send library:", defaultLib);
        console.log("Using default library:", isDefault);
        
    } catch (error) {
        console.log("Error checking library:", error.message);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("\n❌ Script failed:", error);
        process.exit(1);
    });