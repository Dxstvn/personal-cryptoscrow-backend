const hre = require("hardhat");

async function main() {
  console.log("\n=== FIND ROOT CAUSE ===\n");
  
  // The test contract works, so the issue is in the escrow contract
  // Let's trace through the exact differences
  
  console.log("Working TestOFTCaller:");
  console.log("1. Uses WETH.approve() directly");
  console.log("2. Passes fee.nativeFee as msg.value");
  console.log("3. Uses hex\"\" for oftCmd");
  console.log("4. Uses \"\" for composeMsg");
  
  console.log("\nFailing UniversalEscrowServiceV3:");
  console.log("1. Uses IERC20(WETH).safeIncreaseAllowance()");
  console.log("2. Passes fee.nativeFee as msg.value (after our fix)");
  console.log("3. Uses hex\"\" for oftCmd (after our fix)");
  console.log("4. Uses \"\" for composeMsg (after our fix)");
  
  console.log("\n💡 The key difference is safeIncreaseAllowance vs approve!");
  
  // Let's check if the issue is with safeIncreaseAllowance
  const [deployer] = await hre.ethers.getSigners();
  const weth = await hre.ethers.getContractAt("IERC20", "0x980B62Da83eFf3D4576C647993b0c1D7faf17c73");
  const oftAdapter = "0xbaa46938E3110187ED6a55EE139312b28c943d00";
  
  // Test safeIncreaseAllowance
  console.log("\n🧪 Testing safeIncreaseAllowance...");
  
  // First reset allowance
  await weth.approve(oftAdapter, 0);
  console.log("Reset allowance to 0");
  
  // Now try safeIncreaseAllowance through SafeERC20
  const SafeERC20 = await hre.ethers.getContractFactory("@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol:SafeERC20");
  
  // Actually, let's just verify the allowance is being set correctly
  const escrowAddress = "0xeb8e89c8872f476750C91a9557798ec83EDC7031";
  const allowance = await weth.allowance(escrowAddress, oftAdapter);
  console.log("Current escrow allowance to OFT:", hre.ethers.formatEther(allowance));
  
  console.log("\n🔍 Possible issues:");
  console.log("1. The safeIncreaseAllowance might not be working as expected");
  console.log("2. The allowance might be consumed before the OFT send");
  console.log("3. There might be a reentrancy issue");
  
  // Let's check the exact error location
  console.log("\n📊 Error analysis:");
  console.log("- Gas used: ~284,647");
  console.log("- This suggests it's failing late in execution");
  console.log("- The 'Insufficient fee' error comes from OAppSender._payNative");
  console.log("- This means the escrow contract IS calling the OFT adapter");
  console.log("- But the msg.value at that point doesn't match the fee");
  
  console.log("\n🔥 CRITICAL INSIGHT:");
  console.log("The error might be that the escrow contract is consuming some of the msg.value");
  console.log("before passing it to the OFT adapter!");
  
  console.log("\nLet's check if the contract has a receive() function or other payable functions");
  console.log("that might be interfering with the value transfer...");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });