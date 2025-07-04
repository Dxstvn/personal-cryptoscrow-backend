import pkg from "hardhat";
const { ethers } = pkg;

async function main() {
    console.log("=== Testing OFT Adapter quoteSend Function ===\n");
    
    const [deployer] = await ethers.getSigners();
    
    // New OFT adapter addresses
    const oftAddress = "0xb3dd252bfc2c3d822f7F0f550Df576a9CC928Bf4"; // Sepolia
    
    try {
        console.log(`Testing OFT Adapter: ${oftAddress}`);
        
        const adapter = await ethers.getContractAt("SimplePropertyOFTAdapter", oftAddress);
        
        // Check basic info
        const weth = await adapter.WETH();
        const endpoint = await adapter.endpoint();
        
        console.log(`WETH: ${weth}`);
        console.log(`Endpoint: ${endpoint}`);
        
        // Test quoteSend function
        console.log("\n🔍 Testing quoteSend...");
        
        const sendParam = {
            dstEid: 40267, // Polygon Amoy
            to: ethers.zeroPadValue(deployer.address, 32),
            amountLD: ethers.parseEther("0.001"),
            minAmountLD: ethers.parseEther("0.0009"),
            extraOptions: "0x00030100110100000000000000000000000000030d40",
            composeMsg: "0x",
            oftCmd: "0x"
        };
        
        console.log("SendParam:", {
            dstEid: sendParam.dstEid,
            to: sendParam.to,
            amountLD: ethers.formatEther(sendParam.amountLD),
            minAmountLD: ethers.formatEther(sendParam.minAmountLD)
        });
        
        const fee = await adapter.quoteSend(sendParam, false);
        console.log("\n✅ quoteSend successful!");
        console.log(`Native fee: ${ethers.formatEther(fee.nativeFee)} ETH`);
        console.log(`LZ token fee: ${fee.lzTokenFee}`);
        
        // Test with WETH approval
        console.log("\n🔍 Testing with WETH approval...");
        const wethContract = await ethers.getContractAt("IWETH", weth);
        
        // Deposit some ETH to WETH
        const depositTx = await wethContract.deposit({ value: ethers.parseEther("0.001") });
        await depositTx.wait();
        console.log("✅ Deposited ETH to WETH");
        
        // Approve adapter
        const approveTx = await wethContract.approve(oftAddress, ethers.parseEther("0.001"));
        await approveTx.wait();
        console.log("✅ Approved WETH to adapter");
        
        // Test quoteSend again
        const fee2 = await adapter.quoteSend(sendParam, false);
        console.log(`✅ quoteSend with approval: ${ethers.formatEther(fee2.nativeFee)} ETH`);
        
    } catch (error) {
        console.log(`❌ Error: ${error.message}`);
        if (error.data) {
            console.log(`Error data: ${error.data}`);
        }
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });