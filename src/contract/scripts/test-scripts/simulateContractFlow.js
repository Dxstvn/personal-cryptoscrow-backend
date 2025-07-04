const hre = require("hardhat");

async function main() {
  console.log("\n=== SIMULATE CONTRACT FLOW ===\n");
  
  const [deployer] = await hre.ethers.getSigners();
  
  // Contracts
  const oftAdapter = await hre.ethers.getContractAt(
    "SimplePropertyOFTAdapter",
    "0xbaa46938E3110187ED6a55EE139312b28c943d00"
  );
  
  const weth = await hre.ethers.getContractAt("contracts/UniversalEscrowServiceV2.sol:IWETH", "0x980B62Da83eFf3D4576C647993b0c1D7faf17c73");
  
  // Simulate what the contract does
  console.log("1. Convert ETH to WETH...");
  const amount = hre.ethers.parseEther("0.00098");
  await weth.deposit({ value: amount });
  console.log("✅ Deposited", hre.ethers.formatEther(amount), "WETH");
  
  // Approve OFT
  console.log("\n2. Approve OFT adapter...");
  await weth.approve(oftAdapter.target, amount);
  console.log("✅ Approved");
  
  // Build send params (exactly as contract does)
  console.log("\n3. Building send params...");
  const sendParam = {
    dstEid: 40161,
    to: hre.ethers.zeroPadValue(deployer.address, 32),
    amountLD: amount,
    minAmountLD: amount * 95n / 100n,
    extraOptions: "0x00030100110100000000000000000000000000030d40",
    composeMsg: "0x",
    oftCmd: "0x"  // Must be valid bytes
  };
  
  console.log("Send params:");
  console.log("- dstEid:", sendParam.dstEid);
  console.log("- amountLD:", hre.ethers.formatEther(sendParam.amountLD));
  console.log("- minAmountLD:", hre.ethers.formatEther(sendParam.minAmountLD));
  
  // Get quote (exactly as contract does)
  console.log("\n4. Getting quote...");
  let fee;
  try {
    fee = await oftAdapter.quoteSend(sendParam, false);
    console.log("✅ Quote received:");
    console.log("- nativeFee:", hre.ethers.formatEther(fee.nativeFee));
    console.log("- lzTokenFee:", hre.ethers.formatEther(fee.lzTokenFee));
  } catch (error) {
    console.log("❌ Quote failed:", error.message);
    return;
  }
  
  // Try to send (exactly as contract does)
  console.log("\n5. Attempting send with exact contract logic...");
  console.log("msg.value:", hre.ethers.formatEther(fee.nativeFee));
  
  try {
    const tx = await oftAdapter.send(
      sendParam,
      fee,
      deployer.address,  // Contract uses msg.sender as refund address
      { value: fee.nativeFee }
    );
    
    console.log("✅ Send successful! TX:", tx.hash);
    const receipt = await tx.wait();
    console.log("Block:", receipt.blockNumber);
    
  } catch (error) {
    console.log("❌ Send failed:", error.message);
    
    // If this fails, the issue might be deeper
    console.log("\n🔍 Debugging the failure...");
    
    // Try with more gas in value
    console.log("\nTrying with 10% more value...");
    const extraValue = fee.nativeFee * 110n / 100n;
    
    try {
      const tx2 = await oftAdapter.send(
        sendParam,
        fee,
        deployer.address,
        { value: extraValue }
      );
      
      console.log("✅ Send with extra value successful!");
      await tx2.wait();
      
    } catch (error2) {
      console.log("❌ Still failed with extra value:", error2.message);
      
      // Check if it's a struct issue
      console.log("\n🔍 Checking fee structure...");
      console.log("Fee object:", fee);
      console.log("Fee constructor:", fee.constructor.name);
      
      // Try constructing fee manually
      console.log("\nTrying with manual fee construction...");
      const manualFee = {
        nativeFee: fee.nativeFee,
        lzTokenFee: fee.lzTokenFee
      };
      
      try {
        const tx3 = await oftAdapter.send(
          sendParam,
          manualFee,
          deployer.address,
          { value: fee.nativeFee }
        );
        
        console.log("✅ Manual fee construction worked!");
        await tx3.wait();
        
      } catch (error3) {
        console.log("❌ Manual fee also failed:", error3.message);
      }
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });