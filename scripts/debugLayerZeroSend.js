import pkg from "hardhat";
const { ethers } = pkg;
import fs from "fs";

async function main() {
    console.log("=== Debugging LayerZero Send Failure ===\n");
    
    const [signer] = await ethers.getSigners();
    console.log("Account:", signer.address);
    
    // Load deployments
    const deployments = JSON.parse(fs.readFileSync('./deployments/testnet-deployments.json', 'utf8'));
    
    // Get adapter
    const adapter = await ethers.getContractAt(
        "PropertyMintBurnOFTAdapterV2",
        deployments.sepolia.oftAdapters.WETH.address
    );
    
    // Get token
    const weth = await ethers.getContractAt(
        "IWETH",
        await adapter.token()
    );
    
    // Get minter burner
    const minterBurnerABI = [
        "function operators(address) view returns (bool)",
        "function burn(address from, uint256 amount) external",
        "function mint(address to, uint256 amount) external"
    ];
    
    const minterBurnerAddress = await adapter.minterBurner();
    const minterBurner = new ethers.Contract(minterBurnerAddress, minterBurnerABI, signer);
    
    console.log("Adapter:", adapter.target);
    console.log("Token (WETH):", await adapter.token());
    console.log("MinterBurner:", minterBurnerAddress);
    
    // Check if adapter is an operator
    const isOperator = await minterBurner.operators(adapter.target);
    console.log("\nIs adapter an operator on MinterBurner?", isOperator);
    
    if (!isOperator) {
        console.log("❌ PROBLEM: Adapter is not set as operator on MinterBurner!");
        console.log("   This would prevent the adapter from burning tokens during send");
    }
    
    // Check balances
    const balance = await weth.balanceOf(signer.address);
    const allowance = await weth.allowance(signer.address, adapter.target);
    
    console.log("\nToken State:");
    console.log("Balance:", ethers.formatEther(balance));
    console.log("Allowance:", ethers.formatEther(allowance));
    
    // Test amount
    const testAmount = ethers.parseEther("0.0001");
    
    if (balance < testAmount) {
        console.log("\nWrapping ETH...");
        const tx = await weth.deposit({ value: testAmount });
        await tx.wait();
        console.log("✅ Wrapped");
    }
    
    if (allowance < testAmount) {
        console.log("\nApproving...");
        const tx = await weth.approve(adapter.target, testAmount);
        await tx.wait();
        console.log("✅ Approved");
    }
    
    // Try to understand the exact failure point
    console.log("\n=== Testing Send Components ===");
    
    // 1. Test if we can call _debit (internal, so test via send)
    console.log("\n1. Testing token transfer to adapter...");
    try {
        // First just try a simple transfer
        const transferTx = await weth.transfer(adapter.target, 1);
        await transferTx.wait();
        console.log("✅ Simple transfer works");
        
        // Transfer back
        const wethWithSigner = await ethers.getContractAt("IERC20", await adapter.token(), signer);
        // Note: We can't transfer back directly, adapter needs to do it
        
    } catch (e) {
        console.log("❌ Transfer failed:", e.message);
    }
    
    // 2. Check if minter can burn
    console.log("\n2. Testing if MinterBurner can burn...");
    try {
        // First approve minterBurner directly
        const smallAmount = 1;
        await weth.approve(minterBurnerAddress, smallAmount);
        
        // Try to burn (this will fail if we're not authorized)
        await minterBurner.burn(signer.address, smallAmount);
        console.log("✅ MinterBurner can burn");
    } catch (e) {
        console.log("❌ Burn failed:", e.message);
        if (e.message.includes("!authorized")) {
            console.log("   MinterBurner is not authorized to burn WETH");
            console.log("   This is expected for WETH - it should use transferFrom instead");
        }
    }
    
    // 3. Check adapter's view of its configuration
    console.log("\n3. Checking adapter configuration...");
    const hasTransferFees = await adapter.hasTransferFees();
    console.log("Has transfer fees:", hasTransferFees);
    
    // 4. Try quoteSend with different parameters
    console.log("\n4. Testing quoteSend variations...");
    
    const polygonEid = 40267;
    const baseParams = {
        dstEid: polygonEid,
        to: ethers.zeroPadValue(signer.address, 32),
        amountLD: testAmount,
        minAmountLD: testAmount * 99n / 100n,
        extraOptions: "0x",
        composeMsg: "0x",
        oftCmd: "0x"
    };
    
    // Test different amounts
    const amounts = [1, 1000, testAmount];
    for (const amount of amounts) {
        try {
            const params = { ...baseParams, amountLD: amount, minAmountLD: amount };
            const [fee] = await adapter.quoteSend(params, false);
            console.log(`✅ Amount ${amount}: Fee = ${fee}`);
        } catch (e) {
            console.log(`❌ Amount ${amount}: ${e.message}`);
        }
    }
    
    console.log("\n=== Diagnosis ===");
    console.log("\nThe error 0x6780cfaf might indicate:");
    console.log("1. MinterBurner authorization issue");
    console.log("2. Token implementation incompatibility");
    console.log("3. Adapter configuration mismatch");
    console.log("4. WETH-specific handling needed");
    
    // Check if WETH is actually mintable/burnable
    console.log("\n=== WETH Implementation Check ===");
    const wethCode = await ethers.provider.getCode(await weth.getAddress());
    console.log("WETH has code:", wethCode !== "0x");
    
    // WETH typically doesn't have mint/burn, only deposit/withdraw
    console.log("\n💡 INSIGHT: WETH typically doesn't support mint/burn!");
    console.log("   It uses deposit/withdraw instead");
    console.log("   The MintBurnOFTAdapter might not be compatible with standard WETH");
    console.log("\n   Solutions:");
    console.log("   1. Use a wrapped version of WETH that supports mint/burn");
    console.log("   2. Use a different OFT adapter type for WETH");
    console.log("   3. Deploy a custom WETH that supports the required interface");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("\n❌ Script failed:", error);
        process.exit(1);
    });