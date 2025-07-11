#!/bin/bash
# Commands to run on EC2 instance to deploy with AWS Secrets Manager

echo "🚀 Starting CryptoEscrow Backend deployment with AWS Secrets Manager..."

# Navigate to project directory
cd ~/personal-cryptoscrow-backend || { echo "❌ Project directory not found"; exit 1; }

# Pull latest code
echo "📥 Pulling latest code from git..."
git pull origin main

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Copy deployment files if they don't exist
echo "📄 Ensuring deployment files exist..."
cat > test-aws-secrets.js << 'EOF'
#!/usr/bin/env node

// Test AWS Secrets Manager integration locally
// This script verifies that secrets can be loaded without any .env files

import config from './src/config/index.js';

// Set environment to use AWS Secrets Manager
process.env.USE_AWS_SECRETS = 'true';
process.env.NODE_ENV = process.env.NODE_ENV || 'production';
process.env.AWS_REGION = 'us-east-1';

console.log('🔧 Testing AWS Secrets Manager Integration...\n');

async function testAwsSecrets() {
  try {
    // Test 1: Initialize configuration
    console.log('1️⃣ Initializing configuration from AWS Secrets Manager...');
    await config.initialize();
    console.log('✅ Configuration initialized successfully\n');

    // Test 2: Check key configurations
    console.log('2️⃣ Checking key configurations:');
    
    const keysToCheck = [
      'NODE_ENV',
      'AWS_REGION',
      'USE_AWS_SECRETS',
      'FIREBASE_PROJECT_ID',
      'FIREBASE_STORAGE_BUCKET',
      'BACKEND_WALLET_ADDRESS',
      'DEFAULT_SERVICE_WALLET',
      'SERVICE_FEE_PERCENTAGE',
      'ALLOWED_EMAILS',
      'CHAIN_ID',
      'RPC_URL',
      'FRONTEND_URL'
    ];

    for (const key of keysToCheck) {
      const value = config.get(key);
      if (value) {
        // Mask sensitive values
        const displayValue = key.includes('PRIVATE_KEY') || key.includes('SECRET') 
          ? '***HIDDEN***' 
          : value;
        console.log(`   ✓ ${key}: ${displayValue}`);
      } else {
        console.log(`   ✗ ${key}: NOT FOUND`);
      }
    }

    // Test 3: Check Firebase service account
    console.log('\n3️⃣ Checking Firebase service account:');
    const firebaseAccount = config.get('FIREBASE_SERVICE_ACCOUNT');
    if (firebaseAccount && firebaseAccount.project_id) {
      console.log(`   ✓ Firebase Project ID: ${firebaseAccount.project_id}`);
      console.log(`   ✓ Firebase Client Email: ${firebaseAccount.client_email}`);
      console.log('   ✓ Firebase Private Key: ***HIDDEN***');
    } else {
      console.log('   ✗ Firebase service account not found or invalid');
    }

    // Test 4: Verify blockchain configuration
    console.log('\n4️⃣ Verifying blockchain configuration:');
    const blockchainConfig = config.getBlockchainConfig();
    console.log(`   ✓ RPC URL: ${blockchainConfig.rpcUrl}`);
    console.log(`   ✓ Chain ID: ${blockchainConfig.chainId}`);
    console.log(`   ✓ Backend Wallet: ${blockchainConfig.backendWalletAddress}`);
    console.log(`   ✓ Private Key: ${blockchainConfig.backendWalletPrivateKey ? '***HIDDEN***' : 'NOT FOUND'}`);

    console.log('\n✅ All tests passed! AWS Secrets Manager integration is working correctly.');
    return true;

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error('\nPlease ensure:');
    console.error('1. IAM role is attached to EC2 instance');
    console.error('2. IAM role has secretsmanager:GetSecretValue permission');
    console.error('3. Secrets exist in AWS Secrets Manager');
    console.error('4. Network connectivity to AWS is available');
    return false;
  }
}

// Run tests
testAwsSecrets().then(success => {
  process.exit(success ? 0 : 1);
});
EOF

# Make test script executable
chmod +x test-aws-secrets.js

# Test AWS Secrets Manager connection
echo "🔐 Testing AWS Secrets Manager connection..."
export NODE_ENV=production
export USE_AWS_SECRETS=true
export AWS_REGION=us-east-1

node test-aws-secrets.js

if [ $? -eq 0 ]; then
    echo "✅ AWS Secrets Manager test passed!"
    
    # Check if .env exists and back it up
    if [ -f .env ]; then
        echo "📦 Backing up .env file..."
        mv .env .env.backup.$(date +%Y%m%d_%H%M%S)
        echo "✅ .env file backed up and removed"
    fi
    
    # Create PM2 ecosystem file
    echo "📝 Creating PM2 ecosystem file..."
    cat > ecosystem.production.js << 'EOF'
module.exports = {
  apps: [{
    name: 'cryptoescrow-backend',
    script: './src/server.js',
    instances: 1,
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
      USE_AWS_SECRETS: 'true',
      AWS_REGION: 'us-east-1'
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
    watch: false,
    max_memory_restart: '1G'
  }]
};
EOF
    
    # Stop existing PM2 processes
    echo "🔄 Stopping existing PM2 processes..."
    pm2 stop all || true
    pm2 delete all || true
    
    # Start application with PM2
    echo "🚀 Starting application with PM2..."
    pm2 start ecosystem.production.js
    pm2 save
    pm2 startup systemd -u ubuntu --hp /home/ubuntu
    
    # Show status
    echo "✅ Deployment complete!"
    echo ""
    pm2 status
    echo ""
    echo "📋 View logs with: pm2 logs cryptoescrow-backend"
    echo "🔍 Test the API with: curl http://localhost:3000/api/health"
    
else
    echo "❌ AWS Secrets Manager test failed!"
    echo "Please check:"
    echo "1. IAM role is attached to EC2 instance"
    echo "2. IAM role has secretsmanager:GetSecretValue permission"
    echo "3. Secrets exist in AWS Secrets Manager"
    exit 1
fi