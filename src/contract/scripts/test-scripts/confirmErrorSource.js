const hre = require("hardhat");

async function main() {
  console.log("\n=== CONFIRM ERROR SOURCE ===\n");
  
  console.log("💡 BREAKTHROUGH!");
  console.log("The error 'Insufficient fee' is from line 514 in OUR contract!");
  console.log("NOT from the OFT adapter!");
  console.log("\nOur contract: require(msg.value >= fee.nativeFee, \"Insufficient fee\");");
  console.log("OFT adapter would say: revert NotEnoughNative(msg.value);");
  
  console.log("\n🔍 This means:");
  console.log("1. We're getting the quote correctly");
  console.log("2. But msg.value < fee.nativeFee when we check");
  console.log("3. The transaction is reverting BEFORE calling the OFT adapter");
  
  console.log("\n❓ But wait... in our test script we ARE sending the exact fee!");
  console.log("Let's check what's happening...");
  
  // Get a quote to see the fee
  const oftAdapter = await hre.ethers.getContractAt(
    "SimplePropertyOFTAdapter",
    "0xbaa46938E3110187ED6a55EE139312b28c943d00"
  );
  
  const sendParam = {
    dstEid: 40161,
    to: hre.ethers.zeroPadValue("0x0000000000000000000000000000000000000001", 32),
    amountLD: hre.ethers.parseEther("0.00098"),
    minAmountLD: hre.ethers.parseEther("0.00098") * 95n / 100n,
    extraOptions: "0x00030100110100000000000000000000000000030d40",
    composeMsg: "0x",
    oftCmd: "0x"
  };
  
  const quote = await oftAdapter.quoteSend(sendParam, false);
  console.log("\nQuote from our script:", hre.ethers.formatEther(quote.nativeFee));
  
  console.log("\n🤔 Theory: The quote might be different when called from inside the contract");
  console.log("This could happen if:");
  console.log("1. Gas prices change between calls");
  console.log("2. The contract's context affects the quote");
  console.log("3. There's a race condition");
  
  console.log("\n📝 In our test scripts, we:");
  console.log("1. Call quoteSend externally");
  console.log("2. Pass that fee to releaseEscrow");
  console.log("3. Contract calls quoteSend again internally");
  console.log("4. If the new quote is higher, it fails!");
  
  console.log("\n✅ SOLUTION:");
  console.log("We need to either:");
  console.log("1. Remove the internal quoteSend and trust the caller's fee");
  console.log("2. Add a buffer to the fee (like 110%)");
  console.log("3. Make the contract use the caller's excess msg.value");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });