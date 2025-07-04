import pkg from "hardhat";
const { ethers } = pkg;

async function main() {
    console.log("=== Deploying Mock Contracts ===\n");
    
    const [deployer] = await ethers.getSigners();
    console.log("Deploying with account:", deployer.address);
    
    // Deploy Mock WETH
    console.log("\n1. Deploying Mock WETH...");
    const MockWETH = await ethers.getContractFactory("MockWETH");
    const mockWETH = await MockWETH.deploy();
    await mockWETH.waitForDeployment();
    const wethAddress = await mockWETH.getAddress();
    console.log(`✅ Mock WETH deployed at: ${wethAddress}`);
    
    // Deploy Mock LayerZero Endpoint
    console.log("\n2. Deploying Mock LayerZero Endpoint...");
    const MockEndpoint = await ethers.getContractFactory("MockLayerZeroEndpoint");
    const mockEndpoint = await MockEndpoint.deploy(30101); // Mock EID for local testing
    await mockEndpoint.waitForDeployment();
    const endpointAddress = await mockEndpoint.getAddress();
    console.log(`✅ Mock LayerZero Endpoint deployed at: ${endpointAddress}`);
    
    console.log("\n=== Mock Deployment Complete ===");
    console.log(`Mock WETH: ${wethAddress}`);
    console.log(`Mock Endpoint: ${endpointAddress}`);
    
    return { wethAddress, endpointAddress };
}

main()
    .then((result) => {
        console.log("\n📝 Use these addresses in your deployment scripts:");
        console.log(`WETH: ${result.wethAddress}`);
        console.log(`Endpoint: ${result.endpointAddress}`);
        process.exit(0);
    })
    .catch((error) => {
        console.error("\n❌ Mock deployment failed:", error);
        process.exit(1);
    });