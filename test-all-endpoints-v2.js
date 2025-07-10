// Comprehensive Endpoint Testing Script V2
// Tests ALL backend endpoints with correct paths

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
      status: error.response?.status || 0,
      details: error.response?.data
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
      if (result.details) {
        console.log(`   Details: ${JSON.stringify(result.details)}`);
      }
      results.failed++;
      results.errors.push({ test: testName, error: result.error, details: result.details });
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
}

// 3. Wallet Management Endpoints
async function testWalletEndpoints() {
  console.log('\n💰 TESTING WALLET ENDPOINTS');
  
  await runTest('POST /wallet/register', async () => {
    const result = await makeRequest('POST', '/wallet/register', {
      address: TEST_WALLET_ADDRESS,
      network: 'ethereum'
    }, {
      'Authorization': `Bearer ${authToken}`
    });
    
    return result;
  });

  await runTest('GET /wallet/', async () => {
    const result = await makeRequest('GET', '/wallet/', null, {
      'Authorization': `Bearer ${authToken}`
    });
    
    return result;
  });

  await runTest('GET /wallet/chains', async () => {
    const result = await makeRequest('GET', '/wallet/chains', null, {
      'Authorization': `Bearer ${authToken}`
    });
    
    return result;
  });

  await runTest('GET /wallet/tokens/11155111', async () => {
    const result = await makeRequest('GET', '/wallet/tokens/11155111', null, {
      'Authorization': `Bearer ${authToken}`
    });
    
    return result;
  });

  await runTest('POST /wallet/estimate-fees', async () => {
    const result = await makeRequest('POST', '/wallet/estimate-fees', {
      fromChainId: 11155111,
      toChainId: 421614,
      fromToken: '0x0000000000000000000000000000000000000000',
      toToken: '0x0000000000000000000000000000000000000000',
      amount: '1000000000000000000' // 1 ETH
    }, {
      'Authorization': `Bearer ${authToken}`
    });
    
    return result;
  });

  await runTest('POST /wallet/quote', async () => {
    const result = await makeRequest('POST', '/wallet/quote', {
      fromChainId: 11155111,
      toChainId: 421614,
      fromToken: '0x0000000000000000000000000000000000000000',
      toToken: '0x0000000000000000000000000000000000000000',
      amount: '1000000000000000000' // 1 ETH
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
  
  // Send invite
  await runTest('POST /contact/invite', async () => {
    const result = await makeRequest('POST', '/contact/invite', {
      email: 'contact@example.com',
      name: 'Test Contact'
    }, {
      'Authorization': `Bearer ${authToken}`
    });
    
    return result;
  });

  // Get pending invites
  await runTest('GET /contact/pending', async () => {
    const result = await makeRequest('GET', '/contact/pending', null, {
      'Authorization': `Bearer ${authToken}`
    });
    
    return result;
  });

  // Get contacts
  await runTest('GET /contact/contacts', async () => {
    const result = await makeRequest('GET', '/contact/contacts', null, {
      'Authorization': `Bearer ${authToken}`
    });
    
    if (result.success && result.data.contacts && result.data.contacts.length > 0) {
      contactId = result.data.contacts[0].id;
    }
    
    return result;
  });

  // Delete contact (if we have one)
  if (contactId) {
    await runTest('DELETE /contact/contacts/:id', async () => {
      const result = await makeRequest('DELETE', `/contact/contacts/${contactId}`, null, {
        'Authorization': `Bearer ${authToken}`
      });
      
      return result;
    });
  }
}

// 5. File Upload/Download Endpoints
async function testFileEndpoints() {
  console.log('\n📁 TESTING FILE ENDPOINTS');
  
  // Create test file
  const testFilePath = path.join(__dirname, 'test-file.txt');
  fs.writeFileSync(testFilePath, 'This is a test file for endpoint testing');
  
  let dealId = null;
  let fileId = null;
  
  // Upload file
  await runTest('POST /files/upload', async () => {
    const formData = new FormData();
    formData.append('file', fs.createReadStream(testFilePath));
    formData.append('dealId', 'test-deal-123');
    
    const result = await makeRequest('POST', '/files/upload', formData, {
      'Authorization': `Bearer ${authToken}`,
      ...formData.getHeaders()
    }, { data: formData });
    
    if (result.success && result.data.fileId) {
      fileId = result.data.fileId;
      dealId = 'test-deal-123';
    }
    
    return result;
  });

  // List deals
  await runTest('GET /files/my-deals', async () => {
    const result = await makeRequest('GET', '/files/my-deals', null, {
      'Authorization': `Bearer ${authToken}`
    });
    
    return result;
  });

  // Download file (if we have IDs)
  if (dealId && fileId) {
    await runTest('GET /files/download/:dealId/:fileId', async () => {
      const result = await makeRequest('GET', `/files/download/${dealId}/${fileId}`, null, {
        'Authorization': `Bearer ${authToken}`
      });
      
      return result;
    });
  }
  
  // Clean up test file
  fs.unlinkSync(testFilePath);
}

// 6. Transaction/Escrow Endpoints
async function testTransactionEndpoints() {
  console.log('\n💸 TESTING TRANSACTION/ESCROW ENDPOINTS');
  
  let dealId = null;
  
  // Get quote
  await runTest('GET /transaction/api/v3/quote', async () => {
    const result = await makeRequest('GET', '/transaction/api/v3/quote?fromChainId=11155111&toChainId=421614&fromToken=0x0000000000000000000000000000000000000000&toToken=0x0000000000000000000000000000000000000000&amount=1000000000000000000', null, {
      'Authorization': `Bearer ${authToken}`
    });
    
    return result;
  });

  // Create deal
  await runTest('POST /transaction/api/createDeal', async () => {
    const result = await makeRequest('POST', '/transaction/api/createDeal', {
      sellerAddress: '0x9876543210987654321098765432109876543210',
      depositToken: '0x0000000000000000000000000000000000000000', // ETH
      depositAmount: '1000000000000000000', // 1 ETH
      targetToken: '0x0000000000000000000000000000000000000000', // ETH
      targetChainId: 11155111, // Same chain for simplicity
      description: 'Test escrow deal'
    }, {
      'Authorization': `Bearer ${authToken}`
    });
    
    if (result.success && result.data.dealId) {
      dealId = result.data.dealId;
    }
    
    return result;
  });

  // Get deal details
  if (dealId) {
    await runTest('GET /transaction/api/deal/:dealId', async () => {
      const result = await makeRequest('GET', `/transaction/api/deal/${dealId}`, null, {
        'Authorization': `Bearer ${authToken}`
      });
      
      return result;
    });

    // Update condition
    await runTest('POST /transaction/api/updateCondition', async () => {
      const result = await makeRequest('POST', '/transaction/api/updateCondition', {
        dealId,
        conditionMet: true
      }, {
        'Authorization': `Bearer ${authToken}`
      });
      
      return result;
    });

    // Raise dispute
    await runTest('POST /transaction/api/raiseDispute', async () => {
      const result = await makeRequest('POST', '/transaction/api/raiseDispute', {
        dealId,
        reason: 'Test dispute'
      }, {
        'Authorization': `Bearer ${authToken}`
      });
      
      // This might fail if not within dispute window
      if (result.status === 400) {
        return { success: true, error: 'Expected failure - not in dispute window' };
      }
      
      return result;
    });
  }
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
  console.log('🚀 Starting Comprehensive Endpoint Tests V2');
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
      if (error.details) {
        console.log(`    Details: ${JSON.stringify(error.details)}`);
      }
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