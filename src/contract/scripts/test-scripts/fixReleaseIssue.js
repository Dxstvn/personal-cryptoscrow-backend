const hre = require("hardhat");

async function main() {
  console.log("\n=== FIX RELEASE ISSUE ===\n");
  
  const [deployer] = await hre.ethers.getSigners();
  const network = hre.network.name;
  
  if (network === "sepolia") {
    console.log("Please run on polygon-amoy or arbitrum-sepolia");
    return;
  }
  
  const configs = {
    "polygon-amoy": {
      escrow: "0x53E4b9A8f7b1185768cef74d9564cbeD052a9682",
      oftAdapter: "0x746EF3c4C9c3f779Bc3558A5FF55C3f34ae20725",
      weth: "0x360ad4f9a9A8ECB5f461c4Cc1047E1Dcf9"
    },
    "arbitrum-sepolia": {
      escrow: "0xd3b5A13C113328C4F4F1AbF646a2be2AaC8815B5",
      oftAdapter: "0xbaa46938E3110187ED6a55EE139312b28c943d00",
      weth: "0x980B62Da83eFf3D4576C647993b0c1D7faf17c73"
    }
  };
  
  const config = configs[network];
  const escrow = await hre.ethers.getContractAt("UniversalEscrowService", config.escrow);
  
  console.log("Network:", network);
  console.log("Escrow:", config.escrow);
  
  // Check current ETH balance
  const escrowBalance = await hre.ethers.provider.getBalance(config.escrow);
  console.log("\nCurrent escrow ETH balance:", hre.ethers.formatEther(escrowBalance));
  
  // The issue might be that the contract needs ETH to pay LayerZero fees
  // but the msg.value check is preventing it
  
  // Let's look at the releaseEscrow function
  console.log("\n💡 Understanding the issue:");
  console.log("1. The contract quotes LZ fee internally (line 485)");
  console.log("2. The contract pays LZ fee from its own balance (line 491)");
  console.log("3. But releaseEscrow is payable, expecting msg.value");
  console.log("4. There might be a require(msg.value >= fee) check");
  
  // Create a test escrow
  const seller = hre.ethers.Wallet.createRandom();
  const amount = hre.ethers.parseEther("0.001");
  
  console.log("\n📝 Creating test escrow...");
  const createTx = await escrow.createEscrow(
    seller.address,
    hre.ethers.ZeroAddress,
    amount,
    config.weth,
    40161,
    { value: amount }
  );
  
  const receipt = await createTx.wait();
  
  let escrowId;
  for (const log of receipt.logs) {
    try {
      const parsed = escrow.interface.parseLog(log);
      if (parsed && parsed.name === "EscrowCreated") {
        escrowId = parsed.args.escrowId;
        console.log("✅ Escrow created:", escrowId);
        break;
      }
    } catch {}
  }
  
  // Update condition
  await escrow.updateCondition(escrowId, true);
  console.log("✅ Condition updated");
  
  // Get the LayerZero fee quote
  const oftAdapter = await hre.ethers.getContractAt("SimplePropertyOFTAdapter", config.oftAdapter);
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
  
  const quote = await oftAdapter.quoteSend(sendParam, false);
  console.log("\n📊 LayerZero fee:", hre.ethers.formatEther(quote.nativeFee));
  
  // Check if contract has enough ETH
  const totalNeeded = netAmount + quote.nativeFee; // WETH amount + LZ fee
  console.log("Total ETH needed:", hre.ethers.formatEther(quote.nativeFee), "(just LZ fee)");
  console.log("Contract has:", hre.ethers.formatEther(escrowBalance));
  
  if (escrowBalance < quote.nativeFee) {
    console.log("\n⚠️  Contract doesn't have enough ETH for LZ fee!");
    console.log("This is likely the issue.");
  }
  
  // Try different approaches
  console.log("\n🔧 Trying different approaches...");
  
  // Approach 1: Send exact LZ fee
  console.log("\n1️⃣ Sending exact LZ fee...");
  try {
    const tx1 = await escrow.releaseEscrow(escrowId, { value: quote.nativeFee });
    const receipt1 = await tx1.wait();
    console.log("✅ Success with exact fee! Gas used:", receipt1.gasUsed.toString());
    return;
  } catch (error) {
    console.log("❌ Failed with exact fee");
  }
  
  // Approach 2: Send no value (use contract balance)
  console.log("\n2️⃣ Sending no value (use contract balance)...");
  try {
    const tx2 = await escrow.releaseEscrow(escrowId);
    const receipt2 = await tx2.wait();
    console.log("✅ Success with no value! Gas used:", receipt2.gasUsed.toString());
    return;
  } catch (error) {
    console.log("❌ Failed with no value");
  }
  
  // Approach 3: Send extra ETH
  console.log("\n3️⃣ Sending extra ETH...");
  try {
    const tx3 = await escrow.releaseEscrow(escrowId, { value: hre.ethers.parseEther("0.01") });
    const receipt3 = await tx3.wait();
    console.log("✅ Success with extra ETH! Gas used:", receipt3.gasUsed.toString());
    return;
  } catch (error) {
    console.log("❌ Failed with extra ETH");
  }
  
  console.log("\n🤔 The contract might have a bug in handling msg.value for cross-chain releases");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });