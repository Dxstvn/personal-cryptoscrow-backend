import { Tenderly } from '@tenderly/sdk';
import { tenderlyConfig } from './tenderly-config.js';
import { ethers } from 'ethers';

export async function fundTestAccounts() {
  console.log('💰 Setting up and funding test accounts on Tenderly Virtual TestNet...');
  
  try {
    // Use direct RPC calls to fund accounts (Tenderly VNet supports tenderly_setBalance)
    const provider = new ethers.JsonRpcProvider(tenderlyConfig.rpcUrl);
    
    // Test accounts for real scenarios - using well-known test addresses
    const buyerAddress = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'; // Standard test address
    const sellerAddress = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'; // Standard test address
    
    const testAccounts = [
      {
        address: buyerAddress,
        role: 'buyer',
        networks: ['ethereum', 'polygon']
      },
      {
        address: sellerAddress,
        role: 'seller',
        networks: ['ethereum', 'polygon']
      }
    ];

    for (const account of testAccounts) {
      console.log(`💰 Funding ${account.role} account: ${account.address}`);
      
      try {
        // Fund with ETH using Tenderly's unlimited faucet
        await provider.send("tenderly_setBalance", [
          account.address,
          "0x8AC7230489E80000" // 10 ETH in hex
        ]);

        console.log(`✅ Funded ${account.role} account with 10 ETH`);
        
        // Verify the balance
        const balance = await provider.getBalance(account.address);
        console.log(`   Balance: ${ethers.formatEther(balance)} ETH`);
        
      } catch (error) {
        console.warn(`⚠️ Failed to fund ${account.role} account:`, error.message);
        // Continue with other accounts even if one fails
      }
    }

    console.log('✅ Account funding completed');
    return testAccounts;
    
  } catch (error) {
    console.error('❌ Error during account funding:', error);
    throw error;
  }
}

// Helper function to get account balances
export async function getAccountBalances() {
  const provider = new ethers.JsonRpcProvider(tenderlyConfig.rpcUrl);
  
  const accounts = [
    { name: 'Buyer', address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' },
    { name: 'Seller', address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' }
  ];

  console.log('📊 Current Account Balances:');
  for (const account of accounts) {
    if (account.address) {
      try {
        const balance = await provider.getBalance(account.address);
        console.log(`   ${account.name}: ${ethers.formatEther(balance)} ETH`);
      } catch (error) {
        console.log(`   ${account.name}: Error getting balance`);
      }
    }
  }
}

// Test the funding function
export async function testAccountFunding() {
  console.log('🧪 Testing Tenderly account funding...');
  
  try {
    await fundTestAccounts();
    await getAccountBalances();
    console.log('✅ Account funding test completed successfully');
  } catch (error) {
    console.error('❌ Account funding test failed:', error);
    throw error;
  }
} 