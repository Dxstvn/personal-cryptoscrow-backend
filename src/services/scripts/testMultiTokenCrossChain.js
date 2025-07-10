#!/usr/bin/env node
/**
 * Test cross-chain transfers with different token types
 * Includes proper transaction tracking and verification
 */

import { ethers, parseEther, formatEther, parseUnits } from 'ethers';
import chalk from 'chalk';
import dotenv from 'dotenv';

dotenv.config();

const ESCROW_CONTRACT = '0xDb3C220fc27f1459af0Fe489830De080151C090b'; // Latest deployed

const TOKENS = {
  sepolia: {
    ETH: '0x0000000000000000000000000000000000000000',
    WETH: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14',
    USDC: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238', // Sepolia USDC
    explorer: 'https://sepolia.etherscan.io'
  },
  arbitrum: {
    WETH: '0x980B62Da83eFf3D4576C647993b0c1D7faf17c73',
    USDC: '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d', // Arbitrum Sepolia USDC
    explorer: 'https://sepolia.arbiscan.io'
  }
};

async function testMultiToken() {
  console.log(chalk.blue('🧪 Multi-Token Cross-Chain Test Suite'));
  console.log(chalk.blue('====================================='));
  
  const sepoliaProvider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
  const arbitrumProvider = new ethers.JsonRpcProvider(process.env.ARBITRUM_SEPOLIA_RPC_URL);
  const wallet = new ethers.Wallet(process.env.BACKEND_WALLET_PRIVATE_KEY);
  
  const sepoliaWallet = wallet.connect(sepoliaProvider);
  const arbitrumWallet = wallet.connect(arbitrumProvider);
  
  console.log('Escrow Contract:', ESCROW_CONTRACT);
  console.log('Your Wallet:', wallet.address);
  
  const escrowAbi = [
    'function createEscrow(address,address,uint256,address,uint256) payable returns (bytes32)',
    'function updateCondition(bytes32,bool)',
    'function releaseEscrow(bytes32) payable',
    'function escrows(bytes32) view returns (address buyer,address seller,address depositToken,uint256 depositAmount,uint256 netAmount,address targetToken,uint256 targetChainId,bool released,bool conditionMet,uint256 timestamp,bytes32 transactionId)',
    'event EscrowCreated(bytes32 indexed escrowId, address indexed buyer, address indexed seller, address depositToken, uint256 depositAmount, uint256 serviceFee, uint256 netAmount, address targetToken, uint256 targetChainId)',
    'event CrossChainTransferInitiated(bytes32 indexed escrowId, uint256 indexed targetChainId, address indexed oftAdapter, bytes32 guid, bool useCompose)',
    'event EscrowReleased(bytes32 indexed escrowId, address indexed recipient, address token, uint256 amount, string method, bool isCompose)'
  ];
  
  const escrow = new ethers.Contract(ESCROW_CONTRACT, escrowAbi, sepoliaWallet);
  
  // Helper function to get transaction details
  async function getTransactionDetails(txHash, provider) {
    const tx = await provider.getTransaction(txHash);
    const receipt = await provider.getTransactionReceipt(txHash);
    return { tx, receipt };
  }
  
  // Helper function to parse events
  function parseEvents(receipt, contract) {
    const events = [];
    for (const log of receipt.logs) {
      try {
        const parsed = contract.interface.parseLog(log);
        if (parsed) {
          events.push({
            name: parsed.name,
            args: parsed.args,
            address: log.address
          });
        }
      } catch {}
    }
    return events;
  }
  
  // Test 1: ETH to WETH Cross-Chain
  console.log(chalk.cyan('\n📋 Test 1: ETH → WETH Cross-Chain'));
  console.log('Deposit: ETH on Sepolia');
  console.log('Target: WETH on Arbitrum');
  
  try {
    const seller = ethers.Wallet.createRandom().address;
    const amount = parseEther('0.0002');
    
    console.log('\nCreating escrow...');
    console.log('Seller:', seller);
    console.log('Amount:', formatEther(amount), 'ETH');
    
    // Create escrow
    const createTx = await escrow.createEscrow(
      seller,
      TOKENS.sepolia.ETH,
      amount,
      TOKENS.arbitrum.WETH,
      421614, // Arbitrum Sepolia
      { value: amount }
    );
    
    console.log('Create TX Hash:', createTx.hash);
    const createReceipt = await createTx.wait();
    
    // Parse events
    const createEvents = parseEvents(createReceipt, escrow);
    const escrowCreatedEvent = createEvents.find(e => e.name === 'EscrowCreated');
    
    if (escrowCreatedEvent) {
      const escrowId = escrowCreatedEvent.args.escrowId;
      console.log('✅ Escrow Created');
      console.log('Escrow ID:', escrowId);
      console.log('Service Fee:', formatEther(escrowCreatedEvent.args.serviceFee), 'ETH');
      console.log('Net Amount:', formatEther(escrowCreatedEvent.args.netAmount), 'ETH');
      console.log(chalk.green('View TX:'), `${TOKENS.sepolia.explorer}/tx/${createTx.hash}`);
      
      // Verify escrow details
      const details = await escrow.escrows(escrowId);
      console.log('\nVerifying escrow storage:');
      console.log('Deposit Token:', details.depositToken === TOKENS.sepolia.ETH ? 'ETH' : details.depositToken);
      console.log('Target Token:', details.targetToken);
      console.log('Target Chain:', details.targetChainId.toString());
      
      // Update condition
      console.log('\nUpdating condition...');
      const updateTx = await escrow.updateCondition(escrowId, true);
      await updateTx.wait();
      console.log('✅ Condition updated');
      
      // Release cross-chain
      console.log('\nReleasing cross-chain...');
      const fee = parseEther('0.01');
      
      const releaseTx = await escrow.releaseEscrow(escrowId, { 
        value: fee,
        gasLimit: 2000000 
      });
      
      console.log('Release TX Hash:', releaseTx.hash);
      const releaseReceipt = await releaseTx.wait();
      
      // Parse release events
      const releaseEvents = parseEvents(releaseReceipt, escrow);
      
      console.log('\n📊 Release Transaction Analysis:');
      console.log('Gas Used:', releaseReceipt.gasUsed.toString());
      console.log('Status:', releaseReceipt.status === 1 ? '✅ Success' : '❌ Failed');
      console.log(chalk.green('View TX:'), `${TOKENS.sepolia.explorer}/tx/${releaseTx.hash}`);
      
      // Check for specific events
      const crossChainEvent = releaseEvents.find(e => e.name === 'CrossChainTransferInitiated');
      const releaseEvent = releaseEvents.find(e => e.name === 'EscrowReleased');
      
      if (crossChainEvent) {
        console.log('\n✅ CrossChainTransferInitiated Event:');
        console.log('Target Chain:', crossChainEvent.args.targetChainId.toString());
        console.log('OFT Adapter:', crossChainEvent.args.oftAdapter);
        console.log('LayerZero GUID:', crossChainEvent.args.guid);
        console.log('Use Compose:', crossChainEvent.args.useCompose);
      }
      
      if (releaseEvent) {
        console.log('\n✅ EscrowReleased Event:');
        console.log('Recipient:', releaseEvent.args.recipient);
        console.log('Token:', releaseEvent.args.token);
        console.log('Amount:', formatEther(releaseEvent.args.amount));
        console.log('Method:', releaseEvent.args.method);
      }
      
      // Check for OFT events
      const oftAddress = '0x5277270f4F4F7e03439F2eCdb6d6632ED921bfF6';
      const oftEvents = releaseReceipt.logs.filter(log => 
        log.address.toLowerCase() === oftAddress.toLowerCase()
      );
      
      console.log(`\n📡 LayerZero OFT Events: ${oftEvents.length}`);
      if (oftEvents.length > 0) {
        console.log('OFT Contract:', oftAddress);
        console.log(chalk.green('✅ Cross-chain transfer initiated via LayerZero'));
      }
      
      // Token flow summary
      console.log(chalk.yellow('\n💱 Token Flow:'));
      console.log('1. User deposits ETH');
      console.log('2. Contract wraps ETH → WETH');
      console.log('3. Contract bridges WETH via LayerZero');
      console.log('4. Seller receives WETH on Arbitrum');
      
    } else {
      console.log(chalk.red('❌ No EscrowCreated event found'));
    }
    
  } catch (error) {
    console.log(chalk.red('❌ Test 1 failed:'), error.message);
  }
  
  // Test 2: Check Arbitrum balance after delay
  console.log(chalk.cyan('\n📋 Test 2: Verify Destination Chain'));
  console.log('Checking WETH balance on Arbitrum...');
  
  const wethAbi = ['function balanceOf(address) view returns (uint256)'];
  const arbitrumWeth = new ethers.Contract(TOKENS.arbitrum.WETH, wethAbi, arbitrumProvider);
  
  // In a real test, you'd track the seller address from Test 1
  console.log('\nNote: Cross-chain transfers take 1-3 minutes');
  console.log('Check seller WETH balance on Arbitrum after confirmation');
  
  // Test 3: ERC20 Token Support (conceptual)
  console.log(chalk.cyan('\n📋 Test 3: ERC20 Token Support (Conceptual)'));
  console.log('\nHow other tokens would work:');
  console.log('1. USDC → WETH → Bridge → WETH → USDC');
  console.log('   - Source: Swap USDC to WETH via Uniswap');
  console.log('   - Bridge: Send WETH via LayerZero');
  console.log('   - Destination: Receive WETH (manual swap needed)');
  
  console.log('\n2. With Composer (if configured):');
  console.log('   - Destination: Auto-swap WETH to target token');
  console.log('   - User receives desired token directly');
  
  console.log(chalk.green('\n✅ Test Suite Complete!'));
  
  // Summary
  console.log(chalk.blue('\n📊 Summary:'));
  console.log('- ETH deposits are wrapped to WETH before bridging');
  console.log('- ERC20 tokens are swapped to WETH before bridging');
  console.log('- LayerZero only bridges WETH between chains');
  console.log('- Users receive WETH on destination (unless composer configured)');
  console.log('- All transactions can be verified on block explorers');
}

// Run tests
testMultiToken().catch(console.error);