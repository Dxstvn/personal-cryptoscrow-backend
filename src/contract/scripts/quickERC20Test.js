#!/usr/bin/env node
require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });
const hre = require('hardhat');
const chalk = require('chalk');

const EXPLORER = 'https://sepolia.etherscan.io';

async function main() {
  console.log(chalk.blue('🪙 Quick ERC-20 Test'));
  
  const [buyer] = await hre.ethers.getSigners();
  const seller = new hre.ethers.Wallet(process.env.SELLER_WALLET_PRIVATE_KEY, hre.ethers.provider);
  
  // Use already deployed tokens
  const mockDAI = await hre.ethers.getContractAt('IERC20', '0xf6ebE8FBd24cF9922442AeDcfCFBB071D24cd2ce');
  const mockUSDT = await hre.ethers.getContractAt('IERC20', '0x21C0E0c1dC6cC86a0B7345d145C8a8b040c3F4e8');
  const mockWBTC = await hre.ethers.getContractAt('IERC20', '0xABeC6E1D70B830149FB7291cf7af747864f58277');
  
  const escrowAddress = '0xABBCEFDB4b3b4660751fF229d41F300C1E27447d';
  const escrow = await hre.ethers.getContractAt('UniversalEscrowServiceV3StargateEnhanced', escrowAddress, buyer);
  
  // Complete the DAI transfer that timed out
  const escrowId1 = '0xb486fa4c97141cc963de22a20ad6090e65d40399c5f903ee597dcc8a7e87aaba';
  
  console.log('Completing DAI transfer...');
  await (await escrow.updateCondition(escrowId1, true)).wait();
  const releaseTx1 = await escrow.releaseEscrow(escrowId1);
  console.log(`✅ Released: ${EXPLORER}/tx/${releaseTx1.hash}`);
  await releaseTx1.wait();
  
  // Check balance
  const daiBalance = await mockDAI.balanceOf(seller.address);
  console.log('Seller DAI balance:', hre.ethers.formatEther(daiBalance));
  
  // Quick WBTC test
  console.log('\nTesting WBTC (8 decimals)...');
  const wbtcAmount = hre.ethers.parseUnits('0.01', 8);
  
  await (await mockWBTC.approve(escrowAddress, wbtcAmount)).wait();
  
  const tx = await escrow.createEscrow(
    seller.address,
    mockWBTC.target,
    wbtcAmount,
    mockWBTC.target,
    11155111,
    { value: 0 }
  );
  
  console.log(`Create: ${EXPLORER}/tx/${tx.hash}`);
  const receipt = await tx.wait();
  
  let escrowId;
  for (const log of receipt.logs) {
    try {
      const parsed = escrow.interface.parseLog(log);
      if (parsed && parsed.name === 'EscrowCreated') {
        escrowId = parsed.args.escrowId;
        break;
      }
    } catch (e) {}
  }
  
  await (await escrow.updateCondition(escrowId, true)).wait();
  const releaseTx = await escrow.releaseEscrow(escrowId);
  console.log(`Release: ${EXPLORER}/tx/${releaseTx.hash}`);
  await releaseTx.wait();
  
  const wbtcBalance = await mockWBTC.balanceOf(seller.address);
  console.log('Seller WBTC balance:', hre.ethers.formatUnits(wbtcBalance, 8));
  
  console.log(chalk.green('\n✅ Test Complete!'));
}

main().catch(console.error);