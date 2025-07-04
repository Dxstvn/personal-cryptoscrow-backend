const hre = require("hardhat");

async function main() {
  console.log("\n=== MONITOR CROSS-CHAIN TRANSFERS ===\n");
  
  const network = hre.network.name;
  console.log("Network:", network);
  
  // Get recent escrows from the contract
  const escrowAddresses = {
    "sepolia": "0x2ee79369D7cCb53550F1Ca61A1a3bf60B3C92f1E",
    "polygon-amoy": "0x53E4b9A8f7b1185768cef74d9564cbeD052a9682",
    "arbitrum-sepolia": "0xd3b5A13C113328C4F4F1AbF646a2be2AaC8815B5"
  };
  
  const escrowAddress = escrowAddresses[network];
  if (!escrowAddress) {
    console.error("Network not supported");
    return;
  }
  
  const escrow = await hre.ethers.getContractAt("UniversalEscrowService", escrowAddress);
  
  // Get recent blocks
  const currentBlock = await hre.ethers.provider.getBlockNumber();
  // Check specific range where we know we created escrows
  const fromBlock = 170225700; // Around where we created test escrows
  const toBlock = Math.min(fromBlock + 499, currentBlock); // Stay within 500 block limit
  
  console.log(`Checking blocks ${fromBlock} to ${toBlock}...`);
  
  // Query events
  console.log("\n📋 Recent Escrow Events:");
  
  try {
    // Get EscrowCreated events
    const createdFilter = escrow.filters.EscrowCreated();
    const createdEvents = await escrow.queryFilter(createdFilter, fromBlock, toBlock);
    
    console.log(`\nFound ${createdEvents.length} EscrowCreated events:`);
    for (const event of createdEvents) {
      const args = event.args;
      console.log(`\n- Escrow ID: ${args.escrowId}`);
      console.log(`  Buyer: ${args.buyer}`);
      console.log(`  Seller: ${args.seller}`);
      console.log(`  Amount: ${hre.ethers.formatEther(args.depositAmount)}`);
      console.log(`  Target Chain: ${args.targetChainId}`);
      console.log(`  Block: ${event.blockNumber}`);
    }
    
    // Get EscrowReleased events
    const releasedFilter = escrow.filters.EscrowReleased();
    const releasedEvents = await escrow.queryFilter(releasedFilter, fromBlock, toBlock);
    
    console.log(`\n\nFound ${releasedEvents.length} EscrowReleased events:`);
    for (const event of releasedEvents) {
      const args = event.args;
      console.log(`\n- Escrow ID: ${args.escrowId}`);
      console.log(`  Method: ${args.method}`);
      console.log(`  With Compose: ${args.withCompose || false}`);
      console.log(`  Block: ${event.blockNumber}`);
    }
    
    // Get CrossChainTransferInitiated events
    const crossChainFilter = escrow.filters.CrossChainTransferInitiated();
    const crossChainEvents = await escrow.queryFilter(crossChainFilter, fromBlock, toBlock);
    
    console.log(`\n\nFound ${crossChainEvents.length} CrossChainTransferInitiated events:`);
    for (const event of crossChainEvents) {
      const args = event.args;
      console.log(`\n- Escrow ID: ${args.escrowId}`);
      console.log(`  Target Chain: ${args.targetChainId}`);
      console.log(`  OFT Adapter: ${args.oftAdapter}`);
      console.log(`  GUID: ${args.guid}`);
      console.log(`  With Compose: ${args.withCompose}`);
      console.log(`  Block: ${event.blockNumber}`);
    }
    
  } catch (error) {
    console.error("Error querying events:", error.message);
  }
  
  // Check OFT adapter events if we have recent cross-chain transfers
  const oftAdapters = {
    "sepolia": "0xb3dd252bfc2c3d822f7F0f550Df576a9CC928Bf4",
    "polygon-amoy": "0x746EF3c4C9c3f779Bc3558A5FF55C3f34ae20725",
    "arbitrum-sepolia": "0xbaa46938E3110187ED6a55EE139312b28c943d00"
  };
  
  const oftAdapter = oftAdapters[network];
  if (oftAdapter) {
    console.log("\n\n📡 Checking OFT Adapter events...");
    
    try {
      const oft = await hre.ethers.getContractAt("SimplePropertyOFTAdapter", oftAdapter);
      
      // Check for OFTSent events
      const sentFilter = oft.filters.OFTSent();
      const sentEvents = await oft.queryFilter(sentFilter, fromBlock, toBlock);
      
      console.log(`\nFound ${sentEvents.length} OFTSent events:`);
      for (const event of sentEvents) {
        console.log(`\n- GUID: ${event.args.guid}`);
        console.log(`  To Chain: ${event.args.dstEid}`);
        console.log(`  Amount: ${hre.ethers.formatEther(event.args.amountSentLD)}`);
        console.log(`  Block: ${event.blockNumber}`);
      }
      
    } catch (error) {
      console.log("Could not query OFT events:", error.message);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });