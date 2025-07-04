import pkg from "hardhat";
const { ethers } = pkg;

async function main() {
    console.log("=== Debugging OFT Cross-Chain Issue ===\n");
    
    const [deployer] = await ethers.getSigners();
    
    // Escrow and OFT addresses
    const escrowAddress = "0x2ee79369D7cCb53550F1Ca61A1a3bf60B3C92f1E";
    const escrow = await ethers.getContractAt("UniversalEscrowService", escrowAddress);
    
    console.log("🔍 Checking Escrow Configuration...");
    
    // Check OFT adapters
    const polygonOFT = await escrow.oftAdapters(40267);
    const arbitrumOFT = await escrow.oftAdapters(40231);
    
    console.log(`Polygon OFT: ${polygonOFT}`);
    console.log(`Arbitrum OFT: ${arbitrumOFT}`);
    
    // Try to estimate LayerZero fee for a simple transfer
    console.log("\n💸 Estimating LayerZero Fee...");
    
    const amount = ethers.parseEther("0.01");
    const targetChainId = 40267; // Polygon Amoy
    
    // Get the Sepolia OFT adapter address
    const sepoliaOFT = "0x90653738e66A0fa93BF20b087e6A39A704FA39e1";
    
    try {
        // Create a test escrow ID
        const escrowId = ethers.keccak256(ethers.toUtf8Bytes("test"));
        
        // Try to call the internal fee estimation
        console.log("Trying to estimate fee for:");
        console.log(`- Amount: ${ethers.formatEther(amount)} ETH`);
        console.log(`- Target Chain: ${targetChainId}`);
        console.log(`- Source OFT Adapter: ${sepoliaOFT}`);
        
        // Check if OFT adapter is a contract
        const code = await ethers.provider.getCode(sepoliaOFT);
        console.log(`\nSepolia OFT Adapter has code: ${code !== '0x' ? '✅ Yes' : '❌ No'}`);
        
        if (code !== '0x') {
            // Try to interact with the OFT adapter
            const oftAdapter = await ethers.getContractAt("SimplePropertyOFTAdapter", sepoliaOFT);
            
            // Check if it has the quoteSend function
            try {
                const sendParam = {
                    dstEid: targetChainId,
                    to: ethers.zeroPadValue(deployer.address, 32),
                    amountLD: amount,
                    minAmountLD: amount,
                    extraOptions: "0x00030100110100000000000000000000000000030d40", // Standard options
                    composeMsg: "0x",
                    oftCmd: "0x"
                };
                
                const fee = await oftAdapter.quoteSend(sendParam, false);
                console.log("\n✅ Fee estimation successful!");
                console.log(`Native fee: ${ethers.formatEther(fee.nativeFee)} ETH`);
                console.log(`LZ token fee: ${fee.lzTokenFee}`);
            } catch (error) {
                console.log("\n❌ quoteSend failed:", error.message);
                
                // Try older interface
                try {
                    const fee = await oftAdapter.estimateSendFee(
                        targetChainId,
                        deployer.address,
                        amount,
                        false,
                        "0x"
                    );
                    console.log("\n✅ Old interface fee estimation successful!");
                    console.log(`Native fee: ${ethers.formatEther(fee[0])} ETH`);
                } catch (e2) {
                    console.log("❌ Old interface also failed:", e2.message);
                }
            }
        }
        
    } catch (error) {
        console.log(`\n❌ Error: ${error.message}`);
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