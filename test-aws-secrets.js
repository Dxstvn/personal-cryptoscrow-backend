#!/usr/bin/env node

// test-aws-secrets.js - Test script for AWS Secrets Manager on EC2

import awsSecretsManager from './src/config/awsSecretsManager.js';

async function testAWSSecretsAccess() {
  console.log('🔐 Testing AWS Secrets Manager Access on EC2...\n');

  // Test 1: Check environment detection
  console.log('1. Environment Detection:');
  console.log(`   - NODE_ENV: ${process.env.NODE_ENV}`);
  console.log(`   - USE_AWS_SECRETS: ${process.env.USE_AWS_SECRETS}`);
  console.log(`   - AWS_REGION: ${process.env.AWS_REGION || 'us-east-1 (default)'}`);
  console.log(`   - Is AWS Environment: ${awsSecretsManager.isAWSEnvironment()}\n`);

  // Test 2: Try to get App Config secrets
  console.log('2. Testing App Config Secrets:');
  try {
    console.log('   - Attempting to retrieve CryptoEscrow/App/Config...');
    const appSecrets = await awsSecretsManager.getAppSecrets();
    console.log('   ✅ App secrets retrieved successfully!');
    console.log('   - Available keys:', Object.keys(appSecrets));
    
    // Don't log actual values for security
    console.log('   - JWT_SECRET:', appSecrets.JWT_SECRET ? '[PRESENT]' : '[MISSING]');
    console.log('   - EMAIL settings:', appSecrets.EMAIL_USER ? '[PRESENT]' : '[MISSING]');
  } catch (error) {
    console.log('   ❌ Failed to retrieve app secrets:', error.message);
  }

  console.log();

  // Test 3: Try to get Blockchain secrets
  console.log('3. Testing Blockchain Secrets:');
  try {
    console.log('   - Attempting to retrieve CryptoEscrow/Blockchain/Keys...');
    const blockchainSecrets = await awsSecretsManager.getBlockchainSecrets();
    console.log('   ✅ Blockchain secrets retrieved successfully!');
    console.log('   - Available keys:', Object.keys(blockchainSecrets));
    
    // Check for important blockchain keys
    console.log('   - PRIVATE_KEY:', blockchainSecrets.PRIVATE_KEY ? '[PRESENT]' : '[MISSING]');
    console.log('   - RPC_URL:', blockchainSecrets.RPC_URL ? '[PRESENT]' : '[MISSING]');
  } catch (error) {
    console.log('   ❌ Failed to retrieve blockchain secrets:', error.message);
  }

  console.log();

  // Test 4: Try to get Firebase Service Account
  console.log('4. Testing Firebase Service Account:');
  try {
    console.log('   - Attempting to retrieve CryptoEscrow/Firebase/ServiceAccount...');
    const firebaseSecrets = await awsSecretsManager.getFirebaseServiceAccount();
    console.log('   ✅ Firebase service account retrieved successfully!');
    console.log('   - Available keys:', Object.keys(firebaseSecrets));
    
    // Check critical Firebase fields
    console.log('   - project_id:', firebaseSecrets.project_id ? '[PRESENT]' : '[MISSING]');
    console.log('   - private_key:', firebaseSecrets.private_key ? '[PRESENT]' : '[MISSING]');
    console.log('   - client_email:', firebaseSecrets.client_email ? '[PRESENT]' : '[MISSING]');
  } catch (error) {
    console.log('   ❌ Failed to retrieve Firebase service account:', error.message);
  }

  console.log();

  // Test 5: Cache functionality
  console.log('5. Testing Cache Functionality:');
  try {
    console.log('   - Testing cache hit (should be faster)...');
    const start = Date.now();
    await awsSecretsManager.getAppSecrets();
    const duration = Date.now() - start;
    console.log(`   ✅ Cache hit completed in ${duration}ms`);
  } catch (error) {
    console.log('   ❌ Cache test failed:', error.message);
  }

  console.log('\n🎯 AWS Secrets Manager Test Complete!');
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Test interrupted by user');
  process.exit(0);
});

process.on('unhandledRejection', (err) => {
  console.error('\n💥 Unhandled promise rejection:', err);
  process.exit(1);
});

// Run the test
testAWSSecretsAccess().catch(error => {
  console.error('\n💥 Test failed with error:', error);
  process.exit(1);
}); 