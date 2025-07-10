// Debug script for wallet registration issue

import axios from 'axios';

const API_BASE_URL = 'http://localhost:3000';
const TEST_EMAIL = 'wallettest3@example.com';
const TEST_PASSWORD = 'testPassword123!';
const TEST_WALLET_ADDRESS = '0x1234567890123456789012345678901234567890';

async function testWalletRegistration() {
  console.log('🔍 Testing Wallet Registration Flow\n');
  
  try {
    // Step 1: Create a new user
    console.log('1️⃣ Creating new user...');
    const signUpResponse = await axios.post(`${API_BASE_URL}/auth/signUpEmailPass`, {
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      walletAddress: TEST_WALLET_ADDRESS
    });
    
    console.log('✅ User created successfully');
    console.log('   User ID:', signUpResponse.data.userId);
    console.log('   Token type:', signUpResponse.data.tokenType);
    
    const authToken = signUpResponse.data.token;
    const userId = signUpResponse.data.userId;
    
    // Step 2: Get user profile
    console.log('\n2️⃣ Getting user wallets...');
    const walletsResponse = await axios.get(`${API_BASE_URL}/wallet/`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    
    console.log('✅ User wallets retrieved:');
    console.log('   Wallets:', JSON.stringify(walletsResponse.data.wallets, null, 2));
    
    // Step 3: Register a wallet
    console.log('\n3️⃣ Registering new wallet...');
    try {
      const registerResponse = await axios.post(`${API_BASE_URL}/wallet/register`, {
        address: '0x9876543210987654321098765432109876543210',
        name: 'Test Sepolia Wallet',
        network: 'sepolia',
        isPrimary: true
      }, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      
      console.log('✅ Wallet registered successfully:');
      console.log('   Response:', JSON.stringify(registerResponse.data, null, 2));
    } catch (walletError) {
      console.log('❌ Wallet registration failed:');
      console.log('   Status:', walletError.response?.status);
      console.log('   Error:', walletError.response?.data);
      console.log('   Full error:', walletError.message);
      
      // Try to understand the error better
      if (walletError.response?.status === 500) {
        console.log('\n📋 Server error details:');
        console.log('   This is likely a server-side issue');
        console.log('   Check server logs for more details');
      }
    }
    
    // Step 4: Check wallets again
    console.log('\n4️⃣ Getting updated wallets...');
    const finalWalletsResponse = await axios.get(`${API_BASE_URL}/wallet/`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    
    console.log('✅ Final wallets:');
    console.log('   Wallets:', JSON.stringify(finalWalletsResponse.data.wallets, null, 2));
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    if (error.response) {
      console.error('   Response data:', error.response.data);
      console.error('   Status:', error.response.status);
    }
  }
}

// Run the test
console.log('🚀 Starting Wallet Registration Debug Test');
console.log('═'.repeat(50));
testWalletRegistration().then(() => {
  console.log('\n✨ Test complete');
  process.exit(0);
}).catch(error => {
  console.error('\n💥 Fatal error:', error);
  process.exit(1);
});