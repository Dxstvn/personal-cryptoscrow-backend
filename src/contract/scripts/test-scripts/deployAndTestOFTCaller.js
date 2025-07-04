const hre = require("hardhat");

async function main() {
  console.log("\n=== DEPLOY AND TEST OFT CALLER ===\n");
  
  const [deployer] = await hre.ethers.getSigners();
  
  // Deploy test contract
  console.log("Deploying TestOFTCaller...");
  const TestOFTCaller = await hre.ethers.getContractFactory("TestOFTCaller");
  const testCaller = await TestOFTCaller.deploy(
    "0x980B62Da83eFf3D4576C647993b0c1D7faf17c73", // WETH
    "0xbaa46938E3110187ED6a55EE139312b28c943d00"  // OFT Adapter
  );
  
  await testCaller.waitForDeployment();
  console.log("✅ TestOFTCaller deployed to:", testCaller.target);
  
  // Authorize it on OFT adapter
  const oftAdapter = await hre.ethers.getContractAt(
    "SimplePropertyOFTAdapter",
    "0xbaa46938E3110187ED6a55EE139312b28c943d00"
  );
  
  console.log("\nAuthorizing TestOFTCaller...");
  await oftAdapter.setDelegate(testCaller.target);
  console.log("✅ Authorized");
  
  // Get quote first to know how much to send
  const amount = hre.ethers.parseEther("0.0001");
  const sendParam = {
    dstEid: 40161,
    to: hre.ethers.zeroPadValue(deployer.address, 32),
    amountLD: amount,
    minAmountLD: amount * 95n / 100n,
    extraOptions: "0x00030100110100000000000000000000000000030d40",
    composeMsg: "0x",
    oftCmd: "0x"
  };
  
  const quote = await oftAdapter.quoteSend(sendParam, false);
  console.log("\nLZ fee:", hre.ethers.formatEther(quote.nativeFee));
  
  const totalValue = amount + quote.nativeFee;
  console.log("Total value needed:", hre.ethers.formatEther(totalValue));
  
  // Test the contract
  console.log("\n🧪 Testing cross-chain send...");
  
  try {
    const tx = await testCaller.testCrossChainSend(
      deployer.address,
      amount,
      { 
        value: totalValue,
        gasLimit: 1000000
      }
    );
    
    console.log("📤 TX:", tx.hash);
    const receipt = await tx.wait();
    
    console.log("✅ SUCCESS! Gas used:", receipt.gasUsed.toString());
    
    // Check events
    console.log("\n📋 Test events:");
    for (const log of receipt.logs) {
      try {
        const parsed = testCaller.interface.parseLog(log);
        if (parsed && parsed.name === "TestResult") {
          console.log(`- ${parsed.args.step}: ${parsed.args.success ? "✅" : "❌"} (value: ${hre.ethers.formatEther(parsed.args.value)})`);
        }
      } catch {}
    }
    
    console.log("\n🎉 Test contract works! The issue must be specific to the escrow contract implementation.");
    
  } catch (error) {
    console.error("❌ Test failed:", error.message);
    
    if (error.data) {
      // Try to decode the error
      console.log("\nError data:", error.data);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });