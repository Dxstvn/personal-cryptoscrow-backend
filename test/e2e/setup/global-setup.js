// Global setup for E2E tests
import './env-setup.js'; // Load environment configuration first
import { validateTenderlyConfig, logConfigStatus } from './tenderly-config.js';

export default async function globalSetup() {
  console.log('🚀 CryptoScrow E2E Global Setup Starting...');
  console.log('   Testing: Unified LiFi Integration with Universal Property Escrow');
  console.log('   Environment: Tenderly Virtual TestNet');
  
  // Store start time for duration calculation
  global.testStartTime = Date.now();
  
  try {
    // Log current configuration
    console.log('\n📋 Environment Configuration:');
    logConfigStatus();
    
    // Validate Tenderly setup
    console.log('\n🔍 Validating Tenderly Configuration...');
    validateTenderlyConfig();
    console.log('✅ Tenderly configuration validated');
    
    // Create mock user for E2E tests
    console.log('\n👤 Setting up mock user for E2E tests...');
    await createMockUserForE2E();
    console.log('✅ Mock user created successfully');
    
    // Validate critical environment variables
    const criticalVars = ['RPC_URL', 'TEST_DEPLOYER_PRIVATE_KEY'];
    const missingCritical = criticalVars.filter(varName => !process.env[varName]);
    
    if (missingCritical.length > 0) {
      console.warn(`⚠️ Missing critical variables: ${missingCritical.join(', ')}`);
      console.log('   Tests may fail or be skipped');
    } else {
      console.log('✅ All critical environment variables are set');
    }
    
    console.log('\n🎯 E2E Test Environment Ready:');
    console.log(`   Tenderly Account: ${process.env.TENDERLY_ACCOUNT_SLUG || 'Not set'}`);
    console.log(`   Tenderly Project: ${process.env.TENDERLY_PROJECT_SLUG || 'Not set'}`);
    console.log(`   RPC Endpoint: Configured`);
    console.log(`   Deployer Key: Set`);
    console.log(`   Virtual TestNet ID: ${process.env.TENDERLY_VIRTUAL_TESTNET_ID || 'Not set'}`);
    
  } catch (error) {
    console.error('❌ Global setup failed:', error.message);
    console.log('\n💡 Troubleshooting:');
    console.log('   1. Check that .env.testnets exists and contains Tenderly configuration');
    console.log('   2. Verify TENDERLY_ACCESS_KEY, TENDERLY_ACCOUNT_SLUG, TENDERLY_PROJECT_SLUG are set');
    console.log('   3. Ensure TENDERLY_ETHEREUM_MAINNET contains a valid RPC URL');
    console.log('   4. Run "npm run validate:tenderly" to check configuration');
    
    throw error;
  }
  
  console.log('\n✅ Global E2E Setup Complete - Tests can begin');
}

/**
 * Create a mock user in the database for E2E tests
 */
async function createMockUserForE2E() {
  try {
    // Import Firebase admin services
    const { getAdminApp } = await import('../../../src/api/routes/auth/admin.js');
    const { getFirestore } = await import('firebase-admin/firestore');
    
    const adminApp = await getAdminApp();
    const db = getFirestore(adminApp);
    
    // Create mock buyer user document
    const mockBuyerData = {
      email: 'e2e-test-user@cryptoscrow.test',
      displayName: 'E2E Test User (Buyer)',
      createdAt: new Date(),
      isTestUser: true,
      walletAddresses: {
        ethereum: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
        polygon: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
      },
      preferences: {
        defaultNetwork: 'ethereum',
        notifications: true
      }
    };
    
    // Create mock seller users for different test scenarios
    const mockSellerSameChainData = {
      email: 'seller-samechain@e2etest.com',
      displayName: 'E2E Test Seller (Same Chain)',
      createdAt: new Date(),
      isTestUser: true,
      walletAddresses: {
        ethereum: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
        polygon: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'
      },
      preferences: {
        defaultNetwork: 'ethereum',
        notifications: true
      }
    };
    
    const mockSellerCrossChainData = {
      email: 'seller-crosschain@e2etest.com',
      displayName: 'E2E Test Seller (Cross Chain)',
      createdAt: new Date(),
      isTestUser: true,
      walletAddresses: {
        ethereum: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
        polygon: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'
      },
      preferences: {
        defaultNetwork: 'polygon',
        notifications: true
      }
    };
    
    // Set the user documents
    await db.collection('users').doc('e2e-test-user-id').set(mockBuyerData);
    await db.collection('users').doc('e2e-test-seller-samechain-id').set(mockSellerSameChainData);
    await db.collection('users').doc('e2e-test-seller-crosschain-id').set(mockSellerCrossChainData);
    
    console.log('   Mock buyer created with ID: e2e-test-user-id');
    console.log('   Email: e2e-test-user@cryptoscrow.test');
    console.log('   Mock same-chain seller created: seller-samechain@e2etest.com');
    console.log('   Mock cross-chain seller created: seller-crosschain@e2etest.com');
    
  } catch (error) {
    console.warn('⚠️ Could not create mock users (this may be expected in some test environments):', error.message);
    // Don't throw - tests can still run without this
  }
} 