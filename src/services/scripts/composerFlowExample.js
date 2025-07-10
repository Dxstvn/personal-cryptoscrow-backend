#!/usr/bin/env node
/**
 * Visual example of cross-chain transfer with composer
 */

import chalk from 'chalk';

console.log(chalk.blue('🌐 Cross-Chain Transfer with Automatic Token Conversion'));
console.log(chalk.blue('====================================================='));

// Example: 100 USDC (Sepolia) → DAI (Arbitrum)
console.log(chalk.cyan('\n📋 Example: 100 USDC on Sepolia → DAI on Arbitrum'));

console.log(chalk.yellow('\n1️⃣  SOURCE CHAIN (Sepolia)'));
console.log('├─ User deposits: 100 USDC');
console.log('├─ Service fee: -2 USDC (2%)');
console.log('├─ Net amount: 98 USDC');
console.log('├─ Swap via Uniswap: 98 USDC → 0.049 WETH');
console.log('└─ Ready to bridge: 0.049 WETH');

console.log(chalk.green('\n2️⃣  ESCROW DECISION'));
console.log('├─ Target token: DAI (not WETH)');
console.log('├─ Composer available: ✅ Yes');
console.log('├─ Decision: Use composer for auto-conversion');
console.log('└─ Compose message created:');
console.log('   ├─ Recipient: 0x123...seller');
console.log('   ├─ Target token: DAI');
console.log('   ├─ Amount: 0.049 WETH');
console.log('   ├─ Min output: 88.2 DAI (10% slippage)');
console.log('   └─ Deadline: +1 hour');

console.log(chalk.magenta('\n3️⃣  LAYERZERO BRIDGE'));
console.log('├─ Send WETH: 0.049 WETH');
console.log('├─ Send to: Composer contract (not seller)');
console.log('├─ Include: Compose message');
console.log('├─ Gas allocation:');
console.log('│  ├─ LZ Receive: 100k gas');
console.log('│  └─ LZ Compose: 300k gas');
console.log('└─ Status: Bridging... (1-3 minutes)');

console.log(chalk.cyan('\n4️⃣  DESTINATION CHAIN (Arbitrum)'));
console.log('├─ Composer receives: 0.049 WETH + instructions');
console.log('├─ Decode message: Swap to DAI for seller');
console.log('├─ Execute swap:');
console.log('│  ├─ Approve Uniswap: 0.049 WETH');
console.log('│  ├─ Swap: 0.049 WETH → 92.1 DAI');
console.log('│  └─ Send to seller: 92.1 DAI');
console.log('└─ Complete: Seller has DAI! 🎉');

console.log(chalk.green('\n✅ RESULT COMPARISON'));
console.log('┌─────────────────────┬──────────────────────┬──────────────────────┐');
console.log('│                     │ Without Composer      │ With Composer        │');
console.log('├─────────────────────┼──────────────────────┼──────────────────────┤');
console.log('│ User receives       │ 0.049 WETH          │ 92.1 DAI            │');
console.log('│ Additional steps    │ Manual swap needed   │ None                │');
console.log('│ Extra gas cost      │ ~150k (manual swap)  │ Included            │');
console.log('│ Time to target token│ 2 transactions       │ 1 transaction       │');
console.log('│ Slippage risk       │ 2x (bridge + swap)   │ 1x (managed)        │');
console.log('└─────────────────────┴──────────────────────┴──────────────────────┘');

console.log(chalk.yellow('\n🔧 TECHNICAL FLOW'));

console.log('\n// 1. Escrow determines composer usage');
console.log(`bool useCompose = composer != address(0) && targetToken != WETH;`);

console.log('\n// 2. Build compose message if needed');
console.log(`if (useCompose) {
    composeMsg = abi.encode(
        seller,           // Who gets the tokens
        targetToken,      // What token they want
        bridgeAmount,     // How much WETH to convert
        minAmountOut,     // Slippage protection
        deadline          // Timeout protection
    );
}`);

console.log('\n// 3. Set destination based on composer');
console.log(`bytes32 to = useCompose ? 
    bytes32(composer) :     // Send to composer for conversion
    bytes32(seller);        // Send directly to seller`);

console.log('\n// 4. Composer executes swap');
console.log(`function lzCompose(address from, bytes32 guid, bytes memory message) {
    (recipient, targetToken, amount, minOut, deadline) = decode(message);
    
    if (targetToken == ETH) {
        WETH.withdraw(amount);
        recipient.transfer(amount);
    } else {
        uniswap.swap(WETH, targetToken, amount, minOut, recipient);
    }
}`);

console.log(chalk.blue('\n📊 GAS COST BREAKDOWN'));
console.log('├─ Source chain:');
console.log('│  ├─ Create escrow: ~200k gas');
console.log('│  ├─ Token swap: ~150k gas');
console.log('│  └─ Release + bridge: ~300k gas');
console.log('├─ LayerZero fee: ~0.003 ETH');
console.log('└─ Destination chain (composer):');
console.log('   ├─ Receive WETH: ~50k gas');
console.log('   ├─ Token approval: ~50k gas');
console.log('   ├─ Swap execution: ~150k gas');
console.log('   └─ Total compose: ~250k gas');

console.log(chalk.green('\n🎯 KEY BENEFITS'));
console.log('1. One-click experience: Deposit any token, receive any token');
console.log('2. No manual intervention: Fully automated conversion');
console.log('3. Gas efficient: Composer gas included in initial transaction');
console.log('4. Slippage protected: Min output enforced on destination');
console.log('5. Time saved: No need to find DEX and swap manually');

console.log(chalk.red('\n⚠️  CURRENT LIMITATIONS'));
console.log('1. Testnet only: Composers not deployed on mainnet yet');
console.log('2. Limited pairs: Only WETH-based swaps currently');
console.log('3. Single DEX: Only Uniswap, no aggregation yet');
console.log('4. Fixed slippage: No dynamic adjustment based on conditions');

console.log(chalk.green('\n✅ SUMMARY'));
console.log('The composer system transforms the cross-chain experience from:');
console.log('  "Deposit X, receive WETH, manually swap to Y"');
console.log('To:');
console.log('  "Deposit X, receive Y automatically!"');
console.log('\nThis is the power of LayerZero compose + smart contract automation. 🚀');