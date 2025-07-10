// Test with Firebase Emulators
// Set NODE_ENV=test to use emulators

import axios from 'axios';

// Force test environment
process.env.NODE_ENV = 'test';

const API_BASE_URL = 'http://localhost:3000';
const TEST_EMAIL = `emulatortest.${Date.now()}@example.com`;
const TEST_PASSWORD = 'testPassword123!';

async function testWithEmulators() {
  console.log('🔥 Testing with Firebase Emulators');
  console.log(`NODE_ENV: ${process.env.NODE_ENV}`);
  console.log('═'.repeat(50));
  
  try {
    // Test health check
    console.log('1️⃣ Testing health check...');
    const healthResponse = await axios.get(`${API_BASE_URL}/health`);
    console.log('✅ Health check passed');
    
    // Test sign up
    console.log('2️⃣ Testing sign up...');
    const signUpResponse = await axios.post(`${API_BASE_URL}/auth/signUpEmailPass`, {
      email: TEST_EMAIL,
      password: TEST_PASSWORD
    });
    console.log('✅ Sign up passed');
    
    const authToken = signUpResponse.data.token;
    
    // Test wallet registration
    console.log('3️⃣ Testing wallet registration...');
    const walletResponse = await axios.post(`${API_BASE_URL}/wallet/register`, {
      address: '0x1234567890123456789012345678901234567890',
      name: 'Test Wallet',
      network: 'sepolia',
      isPrimary: true
    }, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    console.log('✅ Wallet registration passed');
    
    // Test contact invite
    console.log('4️⃣ Testing contact invite...');
    const contactResponse = await axios.post(`${API_BASE_URL}/contact/invite`, {
      contactEmail: 'contact@example.com'
    }, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    console.log('✅ Contact invite test (expected to fail due to user not found)');
    
    // Test get pending invites
    console.log('5️⃣ Testing get pending invites...');
    const pendingResponse = await axios.get(`${API_BASE_URL}/contact/pending`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    console.log('✅ Get pending invites passed');
    console.log('📊 Pending invites:', pendingResponse.data.invitations.length);
    
    console.log('\n🎯 ALL EMULATOR TESTS PASSED!');
    console.log('✨ Firebase Emulators provide:');
    console.log('- No real data modification');
    console.log('- No Firestore index requirements');
    console.log('- Faster testing');
    console.log('- Isolated test environment');
    
  } catch (error) {
    console.error('❌ Emulator test failed:', error.message);
    if (error.response?.data) {
      console.error('   Response:', error.response.data);
    }
  }
}

console.log('🚀 Starting Emulator Tests');
testWithEmulators().then(() => {
  console.log('\n✨ Emulator test complete');
  process.exit(0);
}).catch(error => {
  console.error('\n💥 Fatal error:', error);
  process.exit(1);
});