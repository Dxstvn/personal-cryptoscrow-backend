const hre = require("hardhat");

async function main() {
  console.log("\n=== ULTIMATE DEBUG ===\n");
  
  const [deployer] = await hre.ethers.getSigners();
  
  // The issue is that the test contract works but escrow doesn't
  // Both are calling the same OFT adapter with the same pattern
  // The error "Insufficient fee" comes from _payNative checking msg.value != fee
  
  console.log("🔍 Analyzing the error:");
  console.log("1. The error happens in OAppSender._payNative");
  console.log("2. It checks: if (msg.value != _nativeFee) revert");
  console.log("3. We're passing fee.nativeFee as {value: fee.nativeFee}");
  console.log("4. So msg.value SHOULD equal _nativeFee");
  
  console.log("\n💡 The only way this can fail is if:");
  console.log("- The fee object passed to send() is different from quoteSend()");
  console.log("- The contract is modifying the fee object");
  console.log("- There's a compiler/optimizer issue");
  
  // Let's verify the fee hasn't changed
  const oftAdapter = await hre.ethers.getContractAt(
    "SimplePropertyOFTAdapter",
    "0xbaa46938E3110187ED6a55EE139312b28c943d00"
  );
  
  const sendParam = {
    dstEid: 40161,
    to: hre.ethers.zeroPadValue(deployer.address, 32),
    amountLD: hre.ethers.parseEther("0.00098"),
    minAmountLD: hre.ethers.parseEther("0.00098") * 95n / 100n,
    extraOptions: "0x00030100110100000000000000000000000000030d40",
    composeMsg: "0x",
    oftCmd: "0x"
  };
  
  console.log("\n📊 Fee consistency check:");
  for (let i = 0; i < 3; i++) {
    const quote = await oftAdapter.quoteSend(sendParam, false);
    console.log(`Quote ${i + 1}: ${hre.ethers.formatEther(quote.nativeFee)}`);
  }
  
  console.log("\n🤔 Wait... I just realized something!");
  console.log("The escrow contract gets the quote BEFORE approving WETH");
  console.log("But what if the quote is different after approval?");
  console.log("Or what if there's a timing issue?");
  
  console.log("\n🔥 FINAL THEORY:");
  console.log("The UniversalEscrowServiceV3 might have the wrong interface for IOFT");
  console.log("The send function signature might be slightly different");
  console.log("This could cause the fee parameter to be interpreted incorrectly");
  
  // Let's check if it's an interface issue by comparing function selectors
  const iface = oftAdapter.interface;
  const sendFunc = iface.getFunction("send");
  console.log("\n📝 OFT send function:");
  console.log("Selector:", iface.getSighash(sendFunc));
  console.log("Inputs:", sendFunc.inputs.map(i => `${i.type} ${i.name}`).join(", "));
  
  console.log("\n💭 The issue must be in how the parameters are encoded/decoded");
  console.log("Since the same call works from TestOFTCaller but not from UniversalEscrowServiceV3");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });