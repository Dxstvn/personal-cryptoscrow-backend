const hre = require("hardhat");

async function main() {
  console.log("\n=== DEBUG V2 AUTHORIZATION ===\n");
  
  const [deployer] = await hre.ethers.getSigners();
  const network = hre.network.name;
  
  console.log("Network:", network);
  console.log("Deployer:", deployer.address);
  
  const escrowV2 = "0x85D3a74D19E1135fC295fFBB483403c064e47B71";
  const oftAdapter = "0xbaa46938E3110187ED6a55EE139312b28c943d00";
  
  console.log("Escrow V2:", escrowV2);
  console.log("OFT Adapter:", oftAdapter);
  
  // Check if escrow is a delegate
  const adapter = await hre.ethers.getContractAt("SimplePropertyOFTAdapter", oftAdapter);
  
  // Try to check delegate status
  console.log("\n🔍 Checking delegate status...");
  try {
    // LayerZero OFTs use a delegates mapping
    // Try to read it through the endpoint
    const endpoint = await adapter.endpoint();
    console.log("Endpoint:", endpoint);
    
    // Check owner
    const owner = await adapter.owner();
    console.log("OFT Owner:", owner);
    console.log("Is deployer owner?", owner === deployer.address);
    
    // Try to authorize if we're not already
    if (owner === deployer.address) {
      console.log("\n🔧 Setting escrow V2 as delegate...");
      try {
        const tx = await adapter.setDelegate(escrowV2);
        console.log("TX:", tx.hash);
        await tx.wait();
        console.log("✅ Delegate set");
      } catch (error) {
        console.log("Delegate already set or error:", error.message);
      }
    }
    
  } catch (error) {
    console.log("Error checking delegate:", error.message);
  }
  
  // Create a minimal test to see what's failing
  console.log("\n🧪 Running minimal test...");
  
  const escrow = await hre.ethers.getContractAt("UniversalEscrowServiceV2", escrowV2);
  
  // Check escrow balance
  const escrowEthBalance = await hre.ethers.provider.getBalance(escrowV2);
  console.log("Escrow ETH balance:", hre.ethers.formatEther(escrowEthBalance));
  
  // Check WETH balance
  const weth = await hre.ethers.getContractAt("IERC20", "0x980B62Da83eFf3D4576C647993b0c1D7faf17c73");
  const wethBalance = await weth.balanceOf(escrowV2);
  console.log("Escrow WETH balance:", hre.ethers.formatEther(wethBalance));
  
  // Check allowance
  const allowance = await weth.allowance(escrowV2, oftAdapter);
  console.log("WETH allowance to OFT:", hre.ethers.formatEther(allowance));
  
  // Try a same-chain release first
  console.log("\n📝 Testing same-chain release...");
  const seller = hre.ethers.Wallet.createRandom();
  const amount = hre.ethers.parseEther("0.001");
  
  try {
    // Create same-chain escrow
    const createTx = await escrow.createEscrow(
      seller.address,
      hre.ethers.ZeroAddress,
      amount,
      hre.ethers.ZeroAddress,
      0, // Same chain
      { value: amount }
    );
    
    const receipt = await createTx.wait();
    console.log("✅ Same-chain escrow created");
    
    // Get escrow ID
    let escrowId;
    for (const log of receipt.logs) {
      try {
        const parsed = escrow.interface.parseLog(log);
        if (parsed && parsed.name === "EscrowCreated") {
          escrowId = parsed.args.escrowId;
          break;
        }
      } catch {}
    }
    
    // Update and release
    await escrow.updateCondition(escrowId, true);
    const releaseTx = await escrow.releaseEscrow(escrowId);
    await releaseTx.wait();
    console.log("✅ Same-chain release works!");
    
  } catch (error) {
    console.log("❌ Same-chain failed:", error.message);
  }
  
  // Now test cross-chain with detailed error capture
  console.log("\n📝 Testing cross-chain with error details...");
  
  try {
    const createTx2 = await escrow.createEscrow(
      seller.address,
      hre.ethers.ZeroAddress,
      amount,
      "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14", // Sepolia WETH
      11155111, // Sepolia chain ID
      { value: amount }
    );
    
    const receipt2 = await createTx2.wait();
    
    let escrowId2;
    for (const log of receipt2.logs) {
      try {
        const parsed = escrow.interface.parseLog(log);
        if (parsed && parsed.name === "EscrowCreated") {
          escrowId2 = parsed.args.escrowId;
          break;
        }
      } catch {}
    }
    
    await escrow.updateCondition(escrowId2, true);
    
    // Get LZ fee
    const netAmount = amount * 98n / 100n;
    const sendParam = {
      dstEid: 40161,
      to: hre.ethers.zeroPadValue(seller.address, 32),
      amountLD: netAmount,
      minAmountLD: netAmount * 95n / 100n,
      extraOptions: "0x00030100110100000000000000000000000000030d40",
      composeMsg: "0x",
      oftCmd: "0x"
    };
    
    const quote = await adapter.quoteSend(sendParam, false);
    console.log("LZ fee:", hre.ethers.formatEther(quote.nativeFee));
    
    // Try static call first
    console.log("\n🔍 Trying static call...");
    try {
      await escrow.releaseEscrow.staticCall(escrowId2, { value: quote.nativeFee });
      console.log("✅ Static call succeeded");
    } catch (staticError) {
      console.log("❌ Static call failed:", staticError.message);
      if (staticError.data) {
        console.log("Error data:", staticError.data);
      }
    }
    
    // Try actual release
    const releaseTx2 = await escrow.releaseEscrow(escrowId2, { 
      value: quote.nativeFee,
      gasLimit: 2000000
    });
    await releaseTx2.wait();
    console.log("✅ Cross-chain release succeeded!");
    
  } catch (error) {
    console.log("❌ Cross-chain failed:", error.message);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });