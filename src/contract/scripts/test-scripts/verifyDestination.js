const hre = require("hardhat");

// Known test transactions
const KNOWN_TRANSFERS = {
  "sepolia": [
    {
      seller: "0x6Deb7c0886b94b289F891bC1C0D6c447F74f3BaA",
      expectedWETH: "0.000098",
      fromChain: "arbitrum-sepolia",
      guid: "0xbcab3c617b8822dfd14e472d74131931d655608588eb4908f2849f1c09600acc"
    },
    {
      seller: "0x1D6daDFDE0e84E69bab6466d4Ad2B2D72ed60FCC", 
      expectedToken: "USDC",
      fromChain: "arbitrum-sepolia",
      guid: "0x7e037acbb2667df60e69d7a6518786f3f76d9216e3ca0fef9eea8cdb96633679",
      note: "Compose swap to USDC"
    }
  ],
  "polygon-amoy": [
    {
      seller: "0x7fFA8De598e503491e33DB6CAe6ebac1AF71C07e",
      expectedWETH: "0.000098",
      fromChain: "sepolia",
      guid: "0xb690a71dc7caa38c5982d4d78c8538082000c71f562bda9ddca370945ced08df"
    }
  ]
};

const WETH_ADDRESSES = {
  "sepolia": "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14",
  "polygon-amoy": "0x360ad4f9a9A8EFe9A8DCB5f461c4Cc1047E1Dcf9",
  "arbitrum-sepolia": "0x980B62Da83eFf3D4576C647993b0c1D7faf17c73"
};

const USDC_ADDRESSES = {
  "sepolia": "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
  "polygon-amoy": "0x0000000000000000000000000000000000000000",
  "arbitrum-sepolia": "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d"
};

const EXPLORERS = {
  "arbitrum-sepolia": "https://sepolia.arbiscan.io",
  "sepolia": "https://sepolia.etherscan.io",
  "polygon-amoy": "https://amoy.polygonscan.com"
};

async function main() {
  const network = hre.network.name;
  console.log(`\n=== VERIFY DESTINATION BALANCES ON ${network.toUpperCase()} ===\n`);
  
  const transfers = KNOWN_TRANSFERS[network];
  if (!transfers || transfers.length === 0) {
    console.log("No known transfers to verify on this network");
    return;
  }
  
  const wethAddress = WETH_ADDRESSES[network];
  const usdcAddress = USDC_ADDRESSES[network];
  const explorer = EXPLORERS[network];
  
  // Connect to tokens
  const weth = await hre.ethers.getContractAt("IERC20", wethAddress);
  let usdc;
  if (usdcAddress !== hre.ethers.ZeroAddress) {
    usdc = await hre.ethers.getContractAt("IERC20", usdcAddress);
  }
  
  console.log("📊 Checking balances for known cross-chain transfers:\n");
  
  for (const transfer of transfers) {
    console.log(`📍 Transfer from ${transfer.fromChain}:`);
    console.log(`   Seller: ${transfer.seller}`);
    console.log(`   ${explorer}/address/${transfer.seller}`);
    console.log(`   LayerZero: https://testnet.layerzeroscan.com/tx/${transfer.guid}`);
    
    if (transfer.expectedToken === "USDC" && usdc) {
      // Check USDC balance
      const usdcBalance = await usdc.balanceOf(transfer.seller);
      console.log(`   USDC Balance: ${hre.ethers.formatUnits(usdcBalance, 6)} USDC`);
      console.log(`   Status: ${usdcBalance > 0 ? "✅ RECEIVED" : "⏳ PENDING"}`);
    } else {
      // Check WETH balance
      const wethBalance = await weth.balanceOf(transfer.seller);
      const expectedWei = hre.ethers.parseEther(transfer.expectedWETH);
      
      console.log(`   WETH Balance: ${hre.ethers.formatEther(wethBalance)}`);
      console.log(`   Expected: ${transfer.expectedWETH} WETH`);
      
      if (wethBalance >= expectedWei) {
        console.log(`   Status: ✅ RECEIVED`);
      } else if (wethBalance > 0) {
        console.log(`   Status: ⚠️  PARTIAL (${hre.ethers.formatEther(wethBalance)})`);
      } else {
        console.log(`   Status: ⏳ PENDING`);
      }
    }
    
    if (transfer.note) {
      console.log(`   Note: ${transfer.note}`);
    }
    
    console.log("");
  }
  
  console.log("\n💡 Tips:");
  console.log("- Cross-chain transfers typically take 1-3 minutes");
  console.log("- Check LayerZero Scan for detailed status");
  console.log("- Compose swaps may take slightly longer");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });