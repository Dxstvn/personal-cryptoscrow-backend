#!/usr/bin/env node
/**
 * Test OFT adapter directly
 */
const hre = require('hardhat');
const chalk = require('chalk');

const WETH_ADDRESS = '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14';
const OFT_ADAPTER = '0x51aF053a6BB282284E4407FaDfd13b09D93B82eE';
const SELLER_ADDRESS = '0xA1a5961F5F3f5B488af86b37E112bC26e4aC41DC';

async function main() {
  console.log(chalk.blue('🧪 Testing OFT Adapter Directly'));
  console.log(chalk.blue('=============================\n'));
  
  const [deployer] = await hre.ethers.getSigners();
  console.log(`Using wallet: ${deployer.address}`);
  
  // Deploy test contract
  console.log(chalk.cyan('1️⃣  Deploying test contract...'));
  const SimpleOFTTest = await hre.ethers.getContractFactory('SimpleOFTTest');
  const test = await SimpleOFTTest.deploy(WETH_ADDRESS, OFT_ADAPTER);
  await test.waitForDeployment();
  const testAddress = await test.getAddress();
  console.log(`Test contract: ${testAddress}`);
  
  // Get some WETH first
  console.log(chalk.cyan('\n2️⃣  Getting WETH...'));
  const wethAbi = [
    'function deposit() payable',
    'function approve(address spender, uint256 amount) returns (bool)',
    'function balanceOf(address) view returns (uint256)'
  ];
  
  const weth = new hre.ethers.Contract(WETH_ADDRESS, wethAbi, deployer);
  
  // Wrap 0.001 ETH
  const amount = hre.ethers.parseEther('0.001');
  const wrapTx = await weth.deposit({ value: amount });
  await wrapTx.wait();
  console.log('✅ Wrapped 0.001 ETH to WETH');
  
  // Approve test contract
  const approveTx = await weth.approve(testAddress, amount);
  await approveTx.wait();
  console.log('✅ Approved test contract');
  
  // Check balances before
  console.log(chalk.cyan('\n3️⃣  Balances before test:'));
  const deployerBalance = await weth.balanceOf(deployer.address);
  const oftBalance = await weth.balanceOf(OFT_ADAPTER);
  console.log(`Deployer WETH: ${hre.ethers.formatEther(deployerBalance)}`);
  console.log(`OFT WETH: ${hre.ethers.formatEther(oftBalance)}`);
  
  // Run test
  console.log(chalk.cyan('\n4️⃣  Running OFT test...'));
  try {
    const testTx = await test.testSend(
      amount,
      SELLER_ADDRESS,
      { 
        value: hre.ethers.parseEther('0.01'), // LayerZero fee
        gasLimit: 1000000
      }
    );
    
    console.log(`Transaction: ${testTx.hash}`);
    const receipt = await testTx.wait();
    
    // Parse events
    const events = [];
    for (const log of receipt.logs) {
      try {
        const parsed = test.interface.parseLog(log);
        if (parsed) {
          events.push(parsed.name);
          console.log(`\n📋 ${parsed.name}:`);
          Object.entries(parsed.args).forEach(([key, value]) => {
            if (isNaN(key)) {
              console.log(`   ${key}: ${value}`);
            }
          });
        }
      } catch (e) {}
    }
    
    console.log(chalk.green('\n✅ Test completed successfully!'));
    console.log(`Events emitted: ${events.join(', ')}`);
    
    // Check final balances
    console.log(chalk.cyan('\n5️⃣  Final balances:'));
    const testBalance = await test.getWETHBalance();
    const finalOftBalance = await test.getOFTBalance();
    console.log(`Test contract WETH: ${hre.ethers.formatEther(testBalance)}`);
    console.log(`OFT WETH: ${hre.ethers.formatEther(finalOftBalance)}`);
    
    if (finalOftBalance > oftBalance) {
      console.log(chalk.yellow('\n⚠️  WETH transferred to OFT adapter'));
      console.log('Cross-chain send may have initiated');
    }
    
  } catch (error) {
    console.log(chalk.red('\n❌ Test failed:'));
    console.log(error.message);
    
    // Try to decode the error
    if (error.data) {
      try {
        const decoded = test.interface.parseError(error.data);
        console.log(`Decoded error: ${decoded}`);
      } catch (e) {}
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(chalk.red('❌ Error:'), error);
    process.exit(1);
  });