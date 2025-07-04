const hre = require("hardhat");

async function main() {
  console.log("\n=== CHECK OFT CALL ===\n");
  
  const [deployer] = await hre.ethers.getSigners();
  
  // Let's directly test the OFT adapter
  const oftAdapter = await hre.ethers.getContractAt(
    "SimplePropertyOFTAdapter",
    "0xbaa46938E3110187ED6a55EE139312b28c943d00"
  );
  
  const weth = await hre.ethers.getContractAt("IERC20", "0x980B62Da83eFf3D4576C647993b0c1D7faf17c73");
  
  // First get some WETH
  console.log("Getting WETH...");
  const wethContract = await hre.ethers.getContractAt("contracts/UniversalEscrowServiceV2.sol:IWETH", weth.target);
  await wethContract.deposit({ value: hre.ethers.parseEther("0.001") });
  
  const wethBalance = await weth.balanceOf(deployer.address);
  console.log("WETH balance:", hre.ethers.formatEther(wethBalance));
  
  // Approve OFT adapter
  await weth.approve(oftAdapter.target, wethBalance);
  console.log("✅ Approved OFT adapter");
  
  // Prepare send params
  const sendParam = {
    dstEid: 40161,
    to: hre.ethers.zeroPadValue(deployer.address, 32),
    amountLD: hre.ethers.parseEther("0.00098"),
    minAmountLD: hre.ethers.parseEther("0.00098") * 95n / 100n,
    extraOptions: "0x00030100110100000000000000000000000000030d40",
    composeMsg: "0x",
    oftCmd: "0x"
  };
  
  // Get quote
  const quote = await oftAdapter.quoteSend(sendParam, false);
  console.log("\nQuote:");
  console.log("- Native fee:", hre.ethers.formatEther(quote.nativeFee));
  console.log("- LZ token fee:", hre.ethers.formatEther(quote.lzTokenFee));
  
  // Try to send directly
  console.log("\n🚀 Attempting direct send...");
  try {
    const fee = {
      nativeFee: quote.nativeFee,
      lzTokenFee: quote.lzTokenFee
    };
    
    const sendTx = await oftAdapter.send(sendParam, fee, deployer.address, {
      value: quote.nativeFee
    });
    
    console.log("✅ Send successful! TX:", sendTx.hash);
    const receipt = await sendTx.wait();
    console.log("Block:", receipt.blockNumber);
    
    // Check events
    for (const log of receipt.logs) {
      try {
        const parsed = oftAdapter.interface.parseLog(log);
        if (parsed && parsed.name === "OFTSent") {
          console.log("\n📤 OFT Sent:");
          console.log("- GUID:", parsed.args.guid);
          console.log("- Amount:", hre.ethers.formatEther(parsed.args.amountSentLD));
        }
      } catch {}
    }
    
  } catch (error) {
    console.log("❌ Send failed:", error.message);
    if (error.data) {
      console.log("Error data:", error.data);
    }
  }
  
  // Now let's check what the escrow contract is doing
  console.log("\n🔍 Checking escrow contract call structure...");
  
  const escrowAddress = "0xF29A11B7c0856BAF925a63c1104F37b8A12204A2";
  const escrow = await hre.ethers.getContractAt("UniversalEscrowServiceV2", escrowAddress);
  
  // Check how the contract builds the fee object
  console.log("\nThe contract should be calling:");
  console.log("IOFT(oftAdapter).send{value: msg.value}(sendParam, fee, refundAddress)");
  console.log("\nWhere fee = { nativeFee: quote.nativeFee, lzTokenFee: quote.lzTokenFee }");
  
  // The issue might be that the contract is passing the quote object directly
  // instead of constructing a MessagingFee object
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });