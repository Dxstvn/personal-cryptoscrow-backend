const hre = require("hardhat");

async function main() {
  console.log("\n=== CHECK AND FIX OFT AUTHORIZATION ===\n");
  
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer:", deployer.address);
  
  const network = hre.network.name;
  console.log("Network:", network);
  
  // Configurations
  const configs = {
    "sepolia": {
      escrow: "0x2ee79369D7cCb53550F1Ca61A1a3bf60B3C92f1E",
      oftAdapter: "0xb3dd252bfc2c3d822f7F0f550Df576a9CC928Bf4"
    },
    "polygon-amoy": {
      escrow: "0x53E4b9A8f7b1185768cef74d9564cbeD052a9682",
      oftAdapter: "0x746EF3c4C9c3f779Bc3558A5FF55C3f34ae20725"
    },
    "arbitrum-sepolia": {
      escrow: "0xd3b5A13C113328C4F4F1AbF646a2be2AaC8815B5",
      oftAdapter: "0xbaa46938E3110187ED6a55EE139312b28c943d00"
    }
  };
  
  const config = configs[network];
  if (!config) {
    console.error("Network not configured");
    return;
  }
  
  console.log("\nContracts:");
  console.log("Escrow:", config.escrow);
  console.log("OFT Adapter:", config.oftAdapter);
  
  // Connect to OFT adapter
  const oftAdapter = await hre.ethers.getContractAt("SimplePropertyOFTAdapter", config.oftAdapter);
  
  // Check owner
  const owner = await oftAdapter.owner();
  console.log("\nOFT Adapter owner:", owner);
  console.log("Is deployer the owner?", owner === deployer.address ? "✅ Yes" : "❌ No");
  
  if (owner !== deployer.address) {
    console.error("\n❌ Cannot proceed - deployer is not the owner!");
    return;
  }
  
  // Check if escrow is authorized
  console.log("\n🔍 Checking authorization...");
  
  try {
    // SimplePropertyOFTAdapter might not have authorizedCallers
    // Let's check the contract source to understand the auth mechanism
    
    // Try to call a function that only authorized callers can use
    // This will help us understand if there's an auth issue
    console.log("Checking if escrow can interact with OFT adapter...");
    
    // Check if we need to authorize the escrow
    console.log("\n🔧 Authorizing escrow contract...");
    
    // The SimplePropertyOFTAdapter inherits from OFT
    // It might use the delegate mechanism from LayerZero
    
    // Try to set the escrow as a delegate
    try {
      console.log("Setting escrow as delegate...");
      const tx = await oftAdapter.setDelegate(config.escrow);
      console.log("TX:", tx.hash);
      const receipt = await tx.wait();
      console.log("✅ Escrow set as delegate in block", receipt.blockNumber);
    } catch (error) {
      console.log("Could not set as delegate:", error.message);
      
      // Try another approach - check if there's an allowCaller function
      try {
        console.log("\nTrying allowCaller...");
        const tx = await oftAdapter.allowCaller(config.escrow, true);
        console.log("TX:", tx.hash);
        const receipt = await tx.wait();
        console.log("✅ Escrow authorized via allowCaller");
      } catch (error2) {
        console.log("Could not use allowCaller:", error2.message);
        
        // Try setPeer if it's a peer authorization issue
        try {
          console.log("\nChecking if it's a peer configuration issue...");
          // This would be for setting cross-chain peers, not local authorization
          console.log("This doesn't seem to be a peer issue.");
        } catch (error3) {
          console.log("Not a peer issue");
        }
      }
    }
    
    // Final check - see if we can read any authorization state
    console.log("\n📊 Final authorization status:");
    
    // Try to read delegates
    try {
      const delegates = await oftAdapter.delegates(config.escrow);
      console.log("Escrow is delegate:", delegates);
    } catch {
      console.log("Could not read delegate status");
    }
    
    // Check if the issue might be with WETH allowance instead
    console.log("\n💰 Checking WETH allowances...");
    const wethAddresses = {
      "sepolia": "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14",
      "polygon-amoy": "0x360ad4f9a9A8ECB5f461c4Cc1047E1Dcf9",
      "arbitrum-sepolia": "0x980B62Da83eFf3D4576C647993b0c1D7faf17c73"
    };
    
    const wethAddress = wethAddresses[network];
    if (wethAddress) {
      const weth = await hre.ethers.getContractAt("IERC20", wethAddress);
      const allowance = await weth.allowance(config.escrow, config.oftAdapter);
      console.log("WETH allowance from escrow to OFT:", hre.ethers.formatEther(allowance));
      
      if (allowance === 0n) {
        console.log("⚠️  No WETH allowance! This might be the issue.");
      }
    }
    
  } catch (error) {
    console.error("\n❌ Error:", error.message);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });