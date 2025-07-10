#!/usr/bin/env node
/**
 * Comprehensive Cross-Chain Token Scenarios
 */

import chalk from 'chalk';

console.log(chalk.blue('🌐 Cross-Chain Token Handling Scenarios'));
console.log(chalk.blue('======================================'));

// Scenario configurations
const scenarios = [
  {
    id: 1,
    name: 'ETH → WETH',
    source: { chain: 'Sepolia', token: 'ETH' },
    target: { chain: 'Arbitrum', token: 'WETH' },
    process: [
      '1. User deposits ETH on Sepolia',
      '2. Contract wraps ETH → WETH using WETH.deposit()',
      '3. Contract bridges WETH via LayerZero OFT',
      '4. User receives WETH on Arbitrum'
    ],
    composer: false
  },
  {
    id: 2,
    name: 'ETH → USDC',
    source: { chain: 'Sepolia', token: 'ETH' },
    target: { chain: 'Arbitrum', token: 'USDC' },
    process: [
      '1. User deposits ETH on Sepolia',
      '2. Contract wraps ETH → WETH',
      '3. Contract bridges WETH via LayerZero OFT',
      '4a. Without Composer: User receives WETH (must swap manually)',
      '4b. With Composer: Auto-swap WETH → USDC on arrival'
    ],
    composer: true
  },
  {
    id: 3,
    name: 'USDC → WETH',
    source: { chain: 'Sepolia', token: 'USDC' },
    target: { chain: 'Arbitrum', token: 'WETH' },
    process: [
      '1. User deposits USDC on Sepolia',
      '2. Contract swaps USDC → WETH via Uniswap',
      '3. Contract bridges WETH via LayerZero OFT',
      '4. User receives WETH on Arbitrum'
    ],
    composer: false
  },
  {
    id: 4,
    name: 'USDC → USDC',
    source: { chain: 'Sepolia', token: 'USDC' },
    target: { chain: 'Arbitrum', token: 'USDC' },
    process: [
      '1. User deposits USDC on Sepolia',
      '2. Contract swaps USDC → WETH via Uniswap',
      '3. Contract bridges WETH via LayerZero OFT',
      '4a. Without Composer: User receives WETH (must swap to USDC manually)',
      '4b. With Composer: Auto-swap WETH → USDC on arrival'
    ],
    composer: true
  },
  {
    id: 5,
    name: 'USDC → DAI',
    source: { chain: 'Sepolia', token: 'USDC' },
    target: { chain: 'Arbitrum', token: 'DAI' },
    process: [
      '1. User deposits USDC on Sepolia',
      '2. Contract swaps USDC → WETH via Uniswap',
      '3. Contract bridges WETH via LayerZero OFT',
      '4a. Without Composer: User receives WETH (must swap to DAI manually)',
      '4b. With Composer: Auto-swap WETH → DAI on arrival'
    ],
    composer: true
  },
  {
    id: 6,
    name: 'WETH → WETH',
    source: { chain: 'Sepolia', token: 'WETH' },
    target: { chain: 'Arbitrum', token: 'WETH' },
    process: [
      '1. User deposits WETH on Sepolia',
      '2. No conversion needed - already WETH',
      '3. Contract bridges WETH via LayerZero OFT',
      '4. User receives WETH on Arbitrum'
    ],
    composer: false
  },
  {
    id: 7,
    name: 'WETH → ETH',
    source: { chain: 'Sepolia', token: 'WETH' },
    target: { chain: 'Arbitrum', token: 'ETH' },
    process: [
      '1. User deposits WETH on Sepolia',
      '2. No conversion needed - already WETH',
      '3. Contract bridges WETH via LayerZero OFT',
      '4a. Without Composer: User receives WETH (must unwrap manually)',
      '4b. With Composer: Auto-unwrap WETH → ETH on arrival'
    ],
    composer: true
  }
];

// Display scenarios
scenarios.forEach(scenario => {
  console.log(chalk.cyan(`\n📋 Scenario ${scenario.id}: ${scenario.name}`));
  console.log(`Source: ${scenario.source.token} on ${scenario.source.chain}`);
  console.log(`Target: ${scenario.target.token} on ${scenario.target.chain}`);
  console.log('\nProcess:');
  scenario.process.forEach(step => console.log(`  ${step}`));
  
  if (scenario.composer) {
    console.log(chalk.yellow('\n⚡ Composer Impact:'));
    console.log('  - Without: User gets WETH, manual swap needed');
    console.log('  - With: Automatic conversion to target token');
  }
});

// Technical implementation details
console.log(chalk.blue('\n🔧 Technical Implementation'));
console.log(chalk.blue('========================='));

console.log('\n1. Source Chain Processing:');
console.log(`
if (escrow.depositToken == address(0)) {
    // ETH: Wrap to WETH
    WETH.deposit{value: escrow.netAmount}();
} else if (escrow.depositToken != address(WETH)) {
    // Any ERC20: Swap to WETH via Uniswap
    uniswapRouter.swapExactTokensForTokens(
        escrow.netAmount,
        minAmountOut,
        [escrow.depositToken, WETH],
        address(this),
        deadline
    );
}
// WETH: No conversion needed
`);

console.log('\n2. Bridge Configuration:');
console.log(`
bool useCompose = composer != address(0) && escrow.targetToken != address(WETH);

if (useCompose) {
    // Send to composer with swap instructions
    to = composer;
    composeMsg = encode(seller, targetToken, amount, minOut, deadline);
} else {
    // Send directly to seller
    to = seller;
    composeMsg = "";
}
`);

console.log('\n3. Destination Chain Result:');
console.log('Without Composer:');
console.log('  - Always receive WETH');
console.log('  - Must manually swap/unwrap if different token desired');
console.log('\nWith Composer:');
console.log('  - Automatic conversion to escrow.targetToken');
console.log('  - Single transaction experience');

// Current limitations
console.log(chalk.yellow('\n⚠️  Current System Status'));
console.log(chalk.yellow('======================'));
console.log('✅ Working: All source chain conversions');
console.log('✅ Working: WETH bridging via LayerZero');
console.log('❌ Not Configured: Composers on testnets');
console.log('📍 Result: Users always receive WETH on destination');

// Gas considerations
console.log(chalk.blue('\n⛽ Gas Considerations'));
console.log(chalk.blue('=================='));
console.log('1. ETH → WETH: ~50k gas (wrap)');
console.log('2. Token → WETH: ~150k gas (swap)');
console.log('3. LayerZero Bridge: ~200k gas + LZ fee');
console.log('4. With Composer: +100k gas on destination');
console.log('Total: 250k-450k gas depending on tokens');

// Security notes
console.log(chalk.red('\n🔒 Security Notes'));
console.log(chalk.red('==============='));
console.log('1. All swaps use 5% slippage protection');
console.log('2. Bridge uses minAmountLD for slippage');
console.log('3. Approvals are exact amounts (no infinite)');
console.log('4. Service fee taken before any conversions');

console.log(chalk.green('\n✅ Summary'));
console.log(chalk.green('========='));
console.log('- System standardizes on WETH for all cross-chain transfers');
console.log('- Source chain: Convert any token → WETH');
console.log('- Bridge: Always WETH via LayerZero OFT');
console.log('- Destination: WETH (or target token with composer)');
console.log('- This design maximizes liquidity and minimizes complexity');