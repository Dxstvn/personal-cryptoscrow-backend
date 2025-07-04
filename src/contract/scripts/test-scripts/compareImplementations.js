const hre = require("hardhat");

async function main() {
  console.log("\n=== COMPARE IMPLEMENTATIONS ===\n");
  
  console.log("Key differences to check:");
  console.log("\n1. TestOFTCaller uses:");
  console.log("   - oftCmd: hex\"\" (empty hex)");
  console.log("   - composeMsg: \"\" (empty string)");
  console.log("   - Direct send call with exact fee");
  
  console.log("\n2. UniversalEscrowServiceV3 uses:");
  console.log("   - oftCmd: \"0x\" (hex string)");
  console.log("   - composeMsg: composeMsg or \"0x\"");
  console.log("   - Same send call pattern");
  
  console.log("\n3. Potential issues:");
  console.log("   - The escrow might be setting composeMsg incorrectly");
  console.log("   - There might be a state issue with escrow.released");
  console.log("   - The WETH conversion might be interfering");
  
  // Let's check if the issue is with hex"" vs "0x"
  console.log("\n🧪 Testing different parameter formats...");
  
  const oftAdapter = await hre.ethers.getContractAt(
    "SimplePropertyOFTAdapter",
    "0xbaa46938E3110187ED6a55EE139312b28c943d00"
  );
  
  const testParams = [
    { oftCmd: "0x", composeMsg: "0x", label: "Both 0x" },
    { oftCmd: "0x", composeMsg: "", label: "oftCmd: 0x, composeMsg: empty" },
    { oftCmd: "", composeMsg: "", label: "Both empty" },
  ];
  
  for (const test of testParams) {
    console.log(`\nTesting ${test.label}...`);
    
    const sendParam = {
      dstEid: 40161,
      to: hre.ethers.zeroPadValue("0x0000000000000000000000000000000000000001", 32),
      amountLD: hre.ethers.parseEther("0.0001"),
      minAmountLD: hre.ethers.parseEther("0.00009"),
      extraOptions: "0x00030100110100000000000000000000000000030d40",
      composeMsg: test.composeMsg,
      oftCmd: test.oftCmd
    };
    
    try {
      const quote = await oftAdapter.quoteSend(sendParam, false);
      console.log(`✅ Quote success: ${hre.ethers.formatEther(quote.nativeFee)}`);
    } catch (error) {
      console.log(`❌ Quote failed: ${error.message}`);
    }
  }
  
  console.log("\n💡 The issue is likely not with parameter formatting");
  console.log("The test contract proves the OFT adapter works correctly");
  console.log("The problem must be in the escrow contract's state or call sequence");
  
  // Let's check if it's a reentrancy guard issue
  console.log("\n🔍 Possible root causes:");
  console.log("1. Reentrancy guard blocking the call");
  console.log("2. State changes happening in wrong order");
  console.log("3. Gas estimation issues");
  console.log("4. The contract might not have the correct bytecode deployed");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });