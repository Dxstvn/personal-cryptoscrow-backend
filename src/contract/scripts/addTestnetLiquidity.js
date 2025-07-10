#!/usr/bin/env node
/**
 * Add liquidity to Uniswap V2 pools on testnets
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });
const hre = require('hardhat');
const chalk = require('chalk');

async function main() {
  console.log(chalk.blue('💧 Add Testnet Liquidity'));
  console.log('========================\n');
  
  const [signer] = await hre.ethers.getSigners();
  const network = await hre.ethers.provider.getNetwork();
  const chainId = Number(network.chainId);
  
  let config;
  if (chainId === 11155111) {
    config = {
      name: 'Sepolia',
      weth: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14',
      usdc: '0x2F6F07CDcf3588944Bf4C42aC74ff24bF56e7590',
      router: '0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E'
    };
  } else if (chainId === 421614) {
    config = {
      name: 'Arbitrum Sepolia',
      weth: '0x980B62Da83eFf3D4576C647993b0c1D7faf17c73',
      usdc: '0x3253a335E7bFfB4790Aa4C25C4250d206E9b9773',
      router: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D'
    };
  } else {
    throw new Error('Unsupported network');
  }
  
  console.log('📍 Network:', config.name);
  console.log('👤 Signer:', signer.address);
  
  // Check balances
  const ethBalance = await signer.provider.getBalance(signer.address);
  const weth = await hre.ethers.getContractAt('contracts/UniversalEscrowServiceV3.sol:IWETH', config.weth);
  const usdc = await hre.ethers.getContractAt('IERC20', config.usdc);
  const wethBalance = await weth.balanceOf(signer.address);
  const usdcBalance = await usdc.balanceOf(signer.address);
  
  console.log('\n💰 Current Balances:');
  console.log('├─ ETH:', hre.ethers.formatEther(ethBalance));
  console.log('├─ WETH:', hre.ethers.formatEther(wethBalance));
  console.log('└─ USDC:', hre.ethers.formatUnits(usdcBalance, 6));
  
  // Step 1: Wrap some ETH to WETH if needed
  const wethNeeded = hre.ethers.parseEther('0.05'); // 0.05 WETH for liquidity
  if (wethBalance < wethNeeded) {
    console.log(chalk.blue('\n1️⃣ Wrapping ETH to WETH...'));
    const wrapAmount = wethNeeded - wethBalance;
    
    try {
      const tx = await weth.deposit({ value: wrapAmount });
      await tx.wait();
      console.log('✅ Wrapped', hre.ethers.formatEther(wrapAmount), 'ETH to WETH');
    } catch (error) {
      console.log(chalk.red('❌ Failed to wrap ETH:'), error.message);
      return;
    }
  }
  
  // Step 2: Get some test USDC (check if there's a mint function)
  if (usdcBalance < hre.ethers.parseUnits('100', 6)) {
    console.log(chalk.blue('\n2️⃣ Getting test USDC...'));
    
    // Try to mint if it's a test token
    try {
      const usdcWithMint = await hre.ethers.getContractAt([
        'function mint(address to, uint256 amount) external',
        'function mintTo(address to, uint256 amount) external',
        'function faucet() external',
        'function drip() external'
      ], config.usdc);
      
      // Try different mint methods
      try {
        await (await usdcWithMint.mint(signer.address, hre.ethers.parseUnits('1000', 6))).wait();
        console.log('✅ Minted 1000 USDC');
      } catch (e1) {
        try {
          await (await usdcWithMint.mintTo(signer.address, hre.ethers.parseUnits('1000', 6))).wait();
          console.log('✅ Minted 1000 USDC');
        } catch (e2) {
          try {
            await (await usdcWithMint.faucet()).wait();
            console.log('✅ Used USDC faucet');
          } catch (e3) {
            try {
              await (await usdcWithMint.drip()).wait();
              console.log('✅ Used USDC drip');
            } catch (e4) {
              console.log(chalk.yellow('⚠️  No mint function available for USDC'));
              console.log('You need to get USDC from a faucet or swap');
            }
          }
        }
      }
    } catch (error) {
      console.log(chalk.yellow('⚠️  Could not get test USDC automatically'));
    }
  }
  
  // Re-check balances
  const newWethBalance = await weth.balanceOf(signer.address);
  const newUsdcBalance = await usdc.balanceOf(signer.address);
  
  console.log(chalk.blue('\n3️⃣ Updated Balances:'));
  console.log('├─ WETH:', hre.ethers.formatEther(newWethBalance));
  console.log('└─ USDC:', hre.ethers.formatUnits(newUsdcBalance, 6));
  
  if (newWethBalance < hre.ethers.parseEther('0.01') || newUsdcBalance < hre.ethers.parseUnits('10', 6)) {
    console.log(chalk.red('\n❌ Insufficient balances to add liquidity'));
    console.log('Need at least 0.01 WETH and 10 USDC');
    return;
  }
  
  // Step 3: Add liquidity
  console.log(chalk.blue('\n4️⃣ Adding Liquidity to WETH/USDC Pool...'));
  
  const router = await hre.ethers.getContractAt([
    'function addLiquidity(address tokenA, address tokenB, uint amountADesired, uint amountBDesired, uint amountAMin, uint amountBMin, address to, uint deadline) external returns (uint amountA, uint amountB, uint liquidity)',
    'function factory() external view returns (address)'
  ], config.router);
  
  // Approve router to spend tokens
  const wethAmount = hre.ethers.parseEther('0.01'); // 0.01 WETH
  const usdcAmount = hre.ethers.parseUnits('25', 6); // 25 USDC (assuming 2500 USDC/ETH rate)
  
  console.log('Approving router to spend tokens...');
  await (await weth.approve(config.router, wethAmount)).wait();
  await (await usdc.approve(config.router, usdcAmount)).wait();
  console.log('✅ Approvals completed');
  
  console.log('\nAdding liquidity:');
  console.log('├─ WETH:', hre.ethers.formatEther(wethAmount));
  console.log('└─ USDC:', hre.ethers.formatUnits(usdcAmount, 6));
  
  try {
    const deadline = Math.floor(Date.now() / 1000) + 60 * 10; // 10 minutes
    const tx = await router.addLiquidity(
      config.weth,
      config.usdc,
      wethAmount,
      usdcAmount,
      0, // Accept any amount of tokens (for first liquidity)
      0, // Accept any amount of tokens (for first liquidity)
      signer.address,
      deadline
    );
    
    const receipt = await tx.wait();
    console.log(chalk.green('✅ Liquidity added successfully!'));
    console.log('Transaction:', receipt.hash);
    
    // Check the pair
    const factory = await hre.ethers.getContractAt([
      'function getPair(address, address) external view returns (address)'
    ], await router.factory());
    
    const pairAddress = await factory.getPair(config.weth, config.usdc);
    console.log('\n📊 Liquidity Pool Info:');
    console.log('└─ Pair address:', pairAddress);
    
    if (pairAddress !== hre.ethers.ZeroAddress) {
      const pair = await hre.ethers.getContractAt([
        'function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
        'function token0() external view returns (address)',
        'function balanceOf(address) external view returns (uint256)'
      ], pairAddress);
      
      const reserves = await pair.getReserves();
      const token0 = await pair.token0();
      const lpBalance = await pair.balanceOf(signer.address);
      
      console.log('\n💧 Pool Reserves:');
      if (token0.toLowerCase() === config.weth.toLowerCase()) {
        console.log('├─ WETH:', hre.ethers.formatEther(reserves.reserve0));
        console.log('└─ USDC:', hre.ethers.formatUnits(reserves.reserve1, 6));
      } else {
        console.log('├─ USDC:', hre.ethers.formatUnits(reserves.reserve0, 6));
        console.log('└─ WETH:', hre.ethers.formatEther(reserves.reserve1));
      }
      console.log('\n🪙 Your LP tokens:', hre.ethers.formatEther(lpBalance));
    }
    
  } catch (error) {
    console.log(chalk.red('❌ Failed to add liquidity:'), error.message);
  }
  
  // Step 4: Test the swap
  console.log(chalk.blue('\n5️⃣ Testing ETH → USDC Swap...'));
  try {
    const swapRouter = await hre.ethers.getContractAt([
      'function getAmountsOut(uint amountIn, address[] calldata path) external view returns (uint[] memory amounts)'
    ], config.router);
    
    const testAmount = hre.ethers.parseEther('0.001');
    const path = [config.weth, config.usdc];
    const amounts = await swapRouter.getAmountsOut(testAmount, path);
    
    console.log('✅ Swap quote available!');
    console.log('├─ Input:', hre.ethers.formatEther(amounts[0]), 'WETH');
    console.log('└─ Output:', hre.ethers.formatUnits(amounts[1], 6), 'USDC');
    
  } catch (error) {
    console.log(chalk.red('❌ Swap quote failed:'), error.message);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(chalk.red('❌ Script failed:'), error);
    process.exit(1);
  });