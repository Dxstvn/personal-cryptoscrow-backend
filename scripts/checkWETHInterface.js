import pkg from "hardhat";
const { ethers } = pkg;

async function main() {
    console.log("=== Checking WETH Interface ===\n");
    
    const [signer] = await ethers.getSigners();
    console.log("Checking with account:", signer.address);
    
    // Sepolia WETH address
    const wethAddress = "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14";
    
    // WETH ABI (standard interface)
    const wethABI = [
        "function deposit() payable",
        "function withdraw(uint256) external",
        "function totalSupply() view returns (uint256)",
        "function balanceOf(address) view returns (uint256)",
        "function transfer(address, uint256) returns (bool)",
        "function allowance(address, address) view returns (uint256)",
        "function approve(address, uint256) returns (bool)",
        "function transferFrom(address, address, uint256) returns (bool)",
        "function decimals() view returns (uint8)",
        "function symbol() view returns (string)",
        "function name() view returns (string)"
    ];
    
    const weth = new ethers.Contract(wethAddress, wethABI, signer);
    
    console.log("WETH Contract:", wethAddress);
    console.log("Name:", await weth.name());
    console.log("Symbol:", await weth.symbol());
    console.log("Decimals:", await weth.decimals());
    
    // Check if WETH has mint/burn functions (it shouldn't)
    console.log("\nChecking for mint/burn functions...");
    
    const mintBurnABI = [
        "function mint(address to, uint256 amount) external",
        "function burn(uint256 amount) external",
        "function burnFrom(address from, uint256 amount) external"
    ];
    
    const wethWithMintBurn = new ethers.Contract(wethAddress, [...wethABI, ...mintBurnABI], signer);
    
    // Try to check if functions exist
    try {
        // This will fail if the function doesn't exist
        await wethWithMintBurn.mint.staticCall(signer.address, 0);
        console.log("✅ WETH has mint function");
    } catch (e) {
        console.log("❌ WETH does NOT have mint function (expected for standard WETH)");
    }
    
    try {
        await wethWithMintBurn.burn.staticCall(0);
        console.log("✅ WETH has burn function");
    } catch (e) {
        console.log("❌ WETH does NOT have burn function (expected for standard WETH)");
    }
    
    console.log("\n💡 Conclusion:");
    console.log("Standard WETH uses deposit/withdraw, not mint/burn.");
    console.log("MintBurnOFTAdapter is incompatible with standard WETH.");
    console.log("\nSolutions:");
    console.log("1. Use standard OFTAdapter (lock/unlock mechanism)");
    console.log("2. Deploy a custom WETH wrapper that supports mint/burn");
    console.log("3. Use a different token for testing");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("\n❌ Script failed:", error);
        process.exit(1);
    });