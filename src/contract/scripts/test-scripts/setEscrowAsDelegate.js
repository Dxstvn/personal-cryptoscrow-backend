const hre = require("hardhat");

async function main() {
  console.log("\n=== SET ESCROW AS DELEGATE ===\n");
  
  const [deployer] = await hre.ethers.getSigners();
  const escrowAddress = "0xF29A11B7c0856BAF925a63c1104F37b8A12204A2";
  
  const oftAdapter = await hre.ethers.getContractAt(
    "SimplePropertyOFTAdapter",
    "0xbaa46938E3110187ED6a55EE139312b28c943d00"
  );
  
  console.log("OFT Adapter:", oftAdapter.target);
  console.log("Escrow Contract:", escrowAddress);
  console.log("Deployer:", deployer.address);
  
  // Check current owner
  const owner = await oftAdapter.owner();
  console.log("\nCurrent owner:", owner);
  console.log("Is deployer owner?", owner.toLowerCase() === deployer.address.toLowerCase());
  
  // Set escrow as delegate
  console.log("\n🔧 Setting escrow as delegate...");
  try {
    const tx = await oftAdapter.setDelegate(escrowAddress);
    await tx.wait();
    console.log("✅ Escrow set as delegate!");
  } catch (error) {
    console.log("❌ Failed to set delegate:", error.message);
    
    // The issue might be that SimplePropertyOFTAdapter doesn't have setDelegate
    // Let's check what functions it has
    console.log("\n🔍 Checking available functions...");
    
    // Try to read the contract to understand its structure
    console.log("\nThe SimplePropertyOFTAdapter might not have delegate functionality.");
    console.log("It might simply check msg.sender authorization differently.");
  }
  
  // Let's also check if the issue is with the fee structure
  console.log("\n🔍 Checking fee structure...");
  
  // Get a quote
  const sendParam = {
    dstEid: 40161,
    to: hre.ethers.zeroPadValue(deployer.address, 32),
    amountLD: hre.ethers.parseEther("0.00098"),
    minAmountLD: hre.ethers.parseEther("0.00098") * 95n / 100n,
    extraOptions: "0x00030100110100000000000000000000000000030d40",
    composeMsg: "0x",
    oftCmd: "0x"
  };
  
  const quote = await oftAdapter.quoteSend(sendParam, false);
  console.log("\nQuote structure:");
  console.log("- nativeFee:", quote.nativeFee);
  console.log("- lzTokenFee:", quote.lzTokenFee);
  console.log("- Type of quote:", typeof quote);
  console.log("- Quote keys:", Object.keys(quote));
  
  // The actual issue might be that the contract needs to have enough ETH
  // not just for the LZ fee but also for internal gas costs
  console.log("\n💡 The 'Insufficient fee' error might be from:");
  console.log("1. The OFT adapter checking if msg.value >= fee");
  console.log("2. The LayerZero endpoint checking fees");
  console.log("3. Some internal gas calculation");
  
  // Let's check the exact error by looking at the OFT adapter code
  console.log("\n📝 Note: The error happens during the OFT send call");
  console.log("The contract passes msg.value correctly, so the issue might be:");
  console.log("- The OFT adapter has additional fee requirements");
  console.log("- There's a precision/rounding issue with fees");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });