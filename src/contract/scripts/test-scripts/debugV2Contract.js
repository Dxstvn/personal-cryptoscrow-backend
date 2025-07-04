const hre = require("hardhat");

async function main() {
  console.log("\n=== DEBUG V2 CONTRACT ===\n");
  
  const [deployer] = await hre.ethers.getSigners();
  const escrowAddress = "0xF29A11B7c0856BAF925a63c1104F37b8A12204A2";
  const escrow = await hre.ethers.getContractAt("UniversalEscrowServiceV2", escrowAddress);
  
  // Check contract state
  console.log("Contract Address:", escrowAddress);
  const contractBalance = await hre.ethers.provider.getBalance(escrowAddress);
  console.log("Contract ETH Balance:", hre.ethers.formatEther(contractBalance));
  
  // Check WETH
  const wethAddress = await escrow.WETH();
  console.log("\nWETH Address:", wethAddress);
  const weth = await hre.ethers.getContractAt("IERC20", wethAddress);
  const wethBalance = await weth.balanceOf(escrowAddress);
  console.log("Contract WETH Balance:", hre.ethers.formatEther(wethBalance));
  
  // Check chain mappings
  console.log("\nChain Mappings:");
  const sepoliaEndpoint = await escrow.chainIdToEndpointId(11155111);
  console.log("Sepolia (11155111) -> Endpoint:", sepoliaEndpoint);
  
  const amoyEndpoint = await escrow.chainIdToEndpointId(80002);
  console.log("Polygon Amoy (80002) -> Endpoint:", amoyEndpoint);
  
  const arbEndpoint = await escrow.chainIdToEndpointId(421614);
  console.log("Arbitrum Sepolia (421614) -> Endpoint:", arbEndpoint);
  
  // Check OFT adapters
  console.log("\nOFT Adapters:");
  const sepoliaAdapter = await escrow.oftAdapters(40161);
  console.log("Sepolia (40161):", sepoliaAdapter);
  
  const amoyAdapter = await escrow.oftAdapters(40267);
  console.log("Polygon Amoy (40267):", amoyAdapter);
  
  // Check composers
  console.log("\nComposers:");
  const sepoliaComposer = await escrow.swapComposers(40161);
  console.log("Sepolia (40161):", sepoliaComposer);
  
  const amoyComposer = await escrow.swapComposers(40267);
  console.log("Polygon Amoy (40267):", amoyComposer);
  
  // Check OFT adapter authorization
  const oftAdapter = await hre.ethers.getContractAt(
    "SimplePropertyOFTAdapter",
    "0xbaa46938E3110187ED6a55EE139312b28c943d00"
  );
  
  console.log("\nOFT Adapter Authorization:");
  const isDelegate = await oftAdapter.delegates(escrowAddress);
  console.log("Is escrow a delegate?", isDelegate);
  
  // Check if we can get a quote
  try {
    const netAmount = hre.ethers.parseEther("0.00098"); // 0.001 * 0.98
    const sendParam = {
      dstEid: 40161,
      to: hre.ethers.zeroPadValue(deployer.address, 32),
      amountLD: netAmount,
      minAmountLD: netAmount * 95n / 100n,
      extraOptions: "0x00030100110100000000000000000000000000030d40",
      composeMsg: "0x",
      oftCmd: "0x"
    };
    
    const quote = await oftAdapter.quoteSend(sendParam, false);
    console.log("\nLayerZero Quote:");
    console.log("Native Fee:", hre.ethers.formatEther(quote.nativeFee));
    console.log("LZ Token Fee:", hre.ethers.formatEther(quote.lzTokenFee));
  } catch (error) {
    console.log("\nQuote Error:", error.message);
  }
  
  // Check allowances
  console.log("\nAllowances:");
  const escrowWethAllowance = await weth.allowance(escrowAddress, oftAdapter.target);
  console.log("Escrow -> OFT Adapter:", hre.ethers.formatEther(escrowWethAllowance));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });