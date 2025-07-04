const hre = require("hardhat");

async function main() {
  console.log("\n=== SIMPLE ESCROW TEST (SAME CHAIN) ===\n");
  
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer:", deployer.address);
  
  const network = hre.network.name;
  console.log(`Network: ${network}`);
  
  // Contract addresses
  const escrowAddresses = {
    "sepolia": "0x2ee79369D7cCb53550F1Ca61A1a3bf60B3C92f1E",
    "polygon-amoy": "0x53E4b9A8f7b1185768cef74d9564cbeD052a9682",
    "arbitrum-sepolia": "0xd3b5A13C113328C4F4F1AbF646a2be2AaC8815B5"
  };
  
  const escrowAddress = escrowAddresses[network];
  const UniversalEscrowService = await hre.ethers.getContractFactory("UniversalEscrowService");
  const escrow = UniversalEscrowService.attach(escrowAddress);
  
  // Create test wallets
  const buyer = deployer;
  const seller = hre.ethers.Wallet.createRandom();
  
  console.log(`\nBuyer: ${buyer.address}`);
  console.log(`Seller: ${seller.address}`);
  
  // Test amount
  const testAmount = hre.ethers.parseEther("0.0001");
  
  console.log(`\n💰 Creating same-chain escrow...`);
  console.log(`Amount: ${hre.ethers.formatEther(testAmount)} ETH`);
  
  try {
    // Create escrow for same chain ETH transfer
    const tx = await escrow.createEscrow(
      seller.address,
      "0x0000000000000000000000000000000000000000", // ETH
      testAmount,
      "0x0000000000000000000000000000000000000000", // ETH
      0, // Same chain
      { value: testAmount }
    );
    
    console.log(`📤 Transaction: ${tx.hash}`);
    const receipt = await tx.wait();
    console.log(`✅ Escrow created in block ${receipt.blockNumber}`);
    
    // Parse event
    const event = receipt.logs.find(log => {
      try {
        const parsed = escrow.interface.parseLog(log);
        return parsed.name === "EscrowCreated";
      } catch {
        return false;
      }
    });
    
    if (event) {
      const parsedEvent = escrow.interface.parseLog(event);
      console.log(`\n📋 Escrow Details:`);
      console.log(`ID: ${parsedEvent.args.escrowId}`);
      console.log(`Service Fee: ${hre.ethers.formatEther(parsedEvent.args.serviceFee)} ETH`);
      console.log(`Net Amount: ${hre.ethers.formatEther(parsedEvent.args.netAmount)} ETH`);
    }
    
    console.log("\n✅ Test successful!");
    
  } catch (error) {
    console.error(`\n❌ Failed: ${error.message}`);
    if (error.data) {
      // Try to decode error
      try {
        const errorInterface = new hre.ethers.Interface([
          "error InsufficientDeposit()",
          "error InvalidConfiguration()",
          "error UnauthorizedCaller()",
          "error InvalidAmount()"
        ]);
        const decodedError = errorInterface.parseError(error.data);
        console.error(`Decoded error: ${decodedError?.name || "Unknown"}`);
      } catch {
        console.error(`Error data: ${error.data}`);
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