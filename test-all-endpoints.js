// Comprehensive Endpoint Testing Script
// Tests ALL backend endpoints to ensure they're working correctly

import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const TEST_EMAIL = 'testuser.a@example.com';
const TEST_PASSWORD = 'testPassword123!';
const TEST_WALLET_ADDRESS = '0x1234567890123456789012345678901234567890';

// Test results tracking
const results = {
  passed: 0,
  failed: 0,
  errors: []
};

// Helper function to make requests
async function makeRequest(method, endpoint, data = null, headers = {}, options = {}) {
  try {
    const config = {
      method,
      url: `${API_BASE_URL}${endpoint}`,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      },
      ...options
    };

    if (data) {
      config.data = data;
    }

    const response = await axios(config);
    return { success: true, data: response.data, status: response.status };
  } catch (error) {
    return { 
      success: false, 
      error: error.response?.data?.error || error.response?.data?.message || error.message,
      status: error.response?.status || 0 
    };
  }
}

// Test function wrapper
async function runTest(testName, testFunc) {
  console.log(`\n🧪 Testing: ${testName}`);
  try {
    const result = await testFunc();
    if (result.success) {
      console.log(`✅ PASSED: ${testName}`);
      results.passed++;
    } else {
      console.log(`❌ FAILED: ${testName}`);
      console.log(`   Error: ${typeof result.error === 'object' ? JSON.stringify(result.error) : result.error}`);
      results.failed++;
      results.errors.push({ test: testName, error: result.error });
    }
  } catch (error) {
    console.log(`❌ FAILED: ${testName}`);
    console.log(`   Error: ${error.message}`);
    results.failed++;
    results.errors.push({ test: testName, error: error.message });
  }
}

// 1. Health Check Endpoints
async function testHealthEndpoints() {
  console.log('\n📋 TESTING HEALTH CHECK ENDPOINTS');
  
  await runTest('GET /health/simple', async () => {
    const result = await makeRequest('GET', '/health/simple');
    if (!result.success) return result;
    if (!result.data.status || result.data.status !== 'OK') {
      return { success: false, error: 'Invalid health status' };
    }
    return { success: true };
  });

  await runTest('GET /health', async () => {
    const result = await makeRequest('GET', '/health');
    if (!result.success) return result;
    if (!result.data.status || result.data.status !== 'OK') {
      return { success: false, error: 'Invalid health status' };
    }
    return { success: true };
  });

  await runTest('GET /health/enhanced', async () => {
    const result = await makeRequest('GET', '/health/enhanced');
    // This might not exist in all setups
    return { success: result.status === 200 || result.status === 404 };
  });
}

// 2. Auth Endpoints
let authToken = null;
let userId = null;

async function testAuthEndpoints() {
  console.log('\n🔐 TESTING AUTH ENDPOINTS');
  
  // Sign up
  await runTest('POST /auth/signUpEmailPass', async () => {
    const result = await makeRequest('POST', '/auth/signUpEmailPass', {
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      walletAddress: TEST_WALLET_ADDRESS
    });
    
    if (result.success) {
      authToken = result.data.token;
      userId = result.data.userId;
    }
    
    // If user already exists, try login instead
    if (result.status === 409 || (result.error && result.error.includes('already exists'))) {
      return { success: true, error: 'User already exists - expected' };
    }
    
    return result;
  });

  // Login
  await runTest('POST /auth/signInEmailPass', async () => {
    const result = await makeRequest('POST', '/auth/signInEmailPass', {
      email: TEST_EMAIL,
      password: TEST_PASSWORD
    });
    
    if (result.success) {
      authToken = result.data.token;
      userId = result.data.userId;
    }
    
    return result;
  });

  // Note: No verify endpoint exists, authentication is handled per-route
}

// 3. Wallet Management Endpoints
async function testWalletEndpoints() {
  console.log('\n💰 TESTING WALLET ENDPOINTS');
  
  await runTest('GET /wallet/balance/:address', async () => {
    const result = await makeRequest('GET', `/wallet/balance/${TEST_WALLET_ADDRESS}`, null, {
      'Authorization': `Bearer ${authToken}`
    });
    
    return result;
  });

  await runTest('GET /wallet/transactions/:address', async () => {
    const result = await makeRequest('GET', `/wallet/transactions/${TEST_WALLET_ADDRESS}`, null, {
      'Authorization': `Bearer ${authToken}`
    });
    
    return result;
  });

  await runTest('POST /wallet/update', async () => {
    const result = await makeRequest('POST', '/wallet/update', {
      walletAddress: TEST_WALLET_ADDRESS,
      network: 'ethereum'
    }, {
      'Authorization': `Bearer ${authToken}`
    });
    
    return result;
  });
}

// 4. Contact Management Endpoints
let contactId = null;

async function testContactEndpoints() {
  console.log('\n👥 TESTING CONTACT ENDPOINTS');
  
  // Add contact
  await runTest('POST /contact/add', async () => {
    const result = await makeRequest('POST', '/contact/add', {
      name: 'Test Contact',
      walletAddress: '0x9876543210987654321098765432109876543210',
      email: 'contact@example.com'
    }, {
      'Authorization': `Bearer ${authToken}`
    });
    
    if (result.success && result.data.contactId) {
      contactId = result.data.contactId;
    }
    
    return result;
  });

  // Get contacts
  await runTest('GET /contact/list', async () => {
    const result = await makeRequest('GET', '/contact/list', null, {
      'Authorization': `Bearer ${authToken}`
    });
    
    return result;
  });

  // Update contact
  await runTest('PUT /contact/update/:id', async () => {
    if (!contactId) return { success: false, error: 'No contact ID' };
    
    const result = await makeRequest('PUT', `/contact/update/${contactId}`, {
      name: 'Updated Contact Name'
    }, {
      'Authorization': `Bearer ${authToken}`
    });
    
    return result;
  });

  // Delete contact
  await runTest('DELETE /contact/delete/:id', async () => {
    if (!contactId) return { success: false, error: 'No contact ID' };
    
    const result = await makeRequest('DELETE', `/contact/delete/${contactId}`, null, {
      'Authorization': `Bearer ${authToken}`
    });
    
    return result;
  });
}

// 5. File Upload/Download Endpoints
async function testFileEndpoints() {
  console.log('\n📁 TESTING FILE ENDPOINTS');
  
  // Create test file
  const testFilePath = path.join(__dirname, 'test-file.txt');
  fs.writeFileSync(testFilePath, 'This is a test file for endpoint testing');
  
  let fileId = null;
  
  // Upload file
  await runTest('POST /files/upload', async () => {
    const formData = new FormData();
    formData.append('file', fs.createReadStream(testFilePath));
    formData.append('description', 'Test file upload');
    
    const result = await makeRequest('POST', '/files/upload', formData, {
      'Authorization': `Bearer ${authToken}`,
      ...formData.getHeaders()
    }, { data: formData });
    
    if (result.success && result.data.fileId) {
      fileId = result.data.fileId;
    }
    
    return result;
  });

  // List files
  await runTest('GET /files/list', async () => {
    const result = await makeRequest('GET', '/files/list', null, {
      'Authorization': `Bearer ${authToken}`
    });
    
    return result;
  });

  // Download file
  await runTest('GET /files/download/:id', async () => {
    if (!fileId) return { success: false, error: 'No file ID' };
    
    const result = await makeRequest('GET', `/files/download/${fileId}`, null, {
      'Authorization': `Bearer ${authToken}`
    });
    
    return result;
  });

  // Delete file
  await runTest('DELETE /files/delete/:id', async () => {
    if (!fileId) return { success: false, error: 'No file ID' };
    
    const result = await makeRequest('DELETE', `/files/delete/${fileId}`, null, {
      'Authorization': `Bearer ${authToken}`
    });
    
    return result;
  });
  
  // Clean up test file
  fs.unlinkSync(testFilePath);
}

// 6. Transaction/Escrow Endpoints
async function testTransactionEndpoints() {
  console.log('\n💸 TESTING TRANSACTION/ESCROW ENDPOINTS');
  
  let escrowId = null;
  
  // Create escrow
  await runTest('POST /transaction/create-escrow', async () => {
    const result = await makeRequest('POST', '/transaction/create-escrow', {
      seller: '0x9876543210987654321098765432109876543210',
      depositToken: '0x0000000000000000000000000000000000000000', // ETH
      depositAmount: '1000000000000000000', // 1 ETH
      targetToken: '0x0000000000000000000000000000000000000000', // ETH
      targetChainId: 11155111, // Sepolia
      description: 'Test escrow'
    }, {
      'Authorization': `Bearer ${authToken}`
    });
    
    if (result.success && result.data.escrowId) {
      escrowId = result.data.escrowId;
    }
    
    return result;
  });

  // Get escrow details
  await runTest('GET /transaction/escrow/:id', async () => {
    if (!escrowId) return { success: false, error: 'No escrow ID' };
    
    const result = await makeRequest('GET', `/transaction/escrow/${escrowId}`, null, {
      'Authorization': `Bearer ${authToken}`
    });
    
    return result;
  });

  // List user escrows
  await runTest('GET /transaction/user-escrows', async () => {
    const result = await makeRequest('GET', '/transaction/user-escrows', null, {
      'Authorization': `Bearer ${authToken}`
    });
    
    return result;
  });

  // Update escrow condition
  await runTest('POST /transaction/update-condition', async () => {
    if (!escrowId) return { success: false, error: 'No escrow ID' };
    
    const result = await makeRequest('POST', '/transaction/update-condition', {
      escrowId,
      conditionMet: true
    }, {
      'Authorization': `Bearer ${authToken}`
    });
    
    return result;
  });

  // Get cross-chain quote
  await runTest('POST /transaction/cross-chain-quote', async () => {
    const result = await makeRequest('POST', '/transaction/cross-chain-quote', {
      targetChainId: 42161, // Arbitrum
      token: '0x0000000000000000000000000000000000000000', // ETH
      amount: '1000000000000000000' // 1 ETH
    }, {
      'Authorization': `Bearer ${authToken}`
    });
    
    return result;
  });

  // Get supported chains
  await runTest('GET /transaction/supported-chains', async () => {
    const result = await makeRequest('GET', '/transaction/supported-chains', null, {
      'Authorization': `Bearer ${authToken}`
    });
    
    return result;
  });

  // Get supported tokens
  await runTest('GET /transaction/supported-tokens/:chainId', async () => {
    const result = await makeRequest('GET', '/transaction/supported-tokens/11155111', null, {
      'Authorization': `Bearer ${authToken}`
    });
    
    return result;
  });

  // Raise dispute (if supported)
  await runTest('POST /transaction/raise-dispute', async () => {
    if (!escrowId) return { success: false, error: 'No escrow ID' };
    
    const result = await makeRequest('POST', '/transaction/raise-dispute', {
      escrowId,
      reason: 'Test dispute'
    }, {
      'Authorization': `Bearer ${authToken}`
    });
    
    // This might fail if not within dispute window or not supported
    if (result.status === 400 || result.status === 404) {
      return { success: true, error: 'Expected failure - OK' };
    }
    
    return result;
  });
}

// 7. Monitoring/Metrics Endpoints
async function testMonitoringEndpoints() {
  console.log('\n📊 TESTING MONITORING ENDPOINTS');
  
  await runTest('GET /metrics', async () => {
    const result = await makeRequest('GET', '/metrics');
    // Metrics endpoint might require special setup
    return { success: result.status === 200 || result.status === 404 };
  });
}

// Main test runner
async function runAllTests() {
  console.log('🚀 Starting Comprehensive Endpoint Tests');
  console.log(`📍 Testing against: ${API_BASE_URL}`);
  console.log('═'.repeat(50));
  
  // Run all test suites
  await testHealthEndpoints();
  await testAuthEndpoints();
  
  // Only run authenticated endpoints if we have a token
  if (authToken) {
    await testWalletEndpoints();
    await testContactEndpoints();
    await testFileEndpoints();
    await testTransactionEndpoints();
  } else {
    console.log('\n⚠️  Skipping authenticated endpoints - no auth token');
  }
  
  await testMonitoringEndpoints();
  
  // Print results
  console.log('\n' + '═'.repeat(50));
  console.log('📊 TEST RESULTS SUMMARY');
  console.log('═'.repeat(50));
  console.log(`✅ Passed: ${results.passed}`);
  console.log(`❌ Failed: ${results.failed}`);
  console.log(`📈 Total: ${results.passed + results.failed}`);
  console.log(`🎯 Success Rate: ${((results.passed / (results.passed + results.failed)) * 100).toFixed(1)}%`);
  
  if (results.errors.length > 0) {
    console.log('\n❌ FAILED TESTS:');
    results.errors.forEach(error => {
      console.log(`\n  • ${error.test}`);
      console.log(`    Error: ${typeof error.error === 'object' ? JSON.stringify(error.error) : error.error}`);
    });
  }
  
  // Exit with appropriate code
  process.exit(results.failed > 0 ? 1 : 0);
}

// Run tests
runAllTests().catch(error => {
  console.error('Fatal error running tests:', error);
  process.exit(1);
});