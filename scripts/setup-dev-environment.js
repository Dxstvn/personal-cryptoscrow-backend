#!/usr/bin/env node

/**
 * Development Environment Setup Script
 * Sets up minimal environment variables for production readiness testing
 */

import fs from 'fs';
import path from 'path';

const COLORS = {
  RED: '\x1b[31m',
  GREEN: '\x1b[32m',
  YELLOW: '\x1b[33m',
  BLUE: '\x1b[34m',
  RESET: '\x1b[0m',
  BOLD: '\x1b[1m'
};

function log(message, color = COLORS.RESET) {
  console.log(`${color}${message}${COLORS.RESET}`);
}

// Development environment variables for testing
const devEnvVars = `# Development Environment Variables for Production Readiness Testing
# This file is safe for version control - contains no sensitive data

NODE_ENV=development
PORT=3000
FRONTEND_URL=http://localhost:3000

# Firebase Project Configuration (Public)
FIREBASE_PROJECT_ID=ethescrow-377c6
FIREBASE_STORAGE_BUCKET=ethescrow-377c6.firebasestorage.app
FIREBASE_API_KEY=AIzaSyCmiddab4u_voTUPEsIDxHr_M3LY6bJvRY
FIREBASE_AUTH_DOMAIN=ethescrow-377c6.firebaseapp.com
FIREBASE_MESSAGING_SENDER_ID=103629169564
FIREBASE_APP_ID=1:103629169564:web:2450fa1239dd476afc5e59
FIREBASE_MEASUREMENT_ID=G-GXB1ZWVPMN

# Blockchain Configuration (Public)
RPC_URL=https://sepolia.infura.io/v3/4af9a8307a914da58937e8da53c602f9
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/4af9a8307a914da58937e8da53c602f9
CHAIN_ID=11155111

# Admin Configuration
ALLOWED_EMAILS=jasmindustin@gmail.com,dustin.jasmin@jaspire.co,andyrowe00@gmail.com

# Scheduled Jobs Configuration
CRON_SCHEDULE_DEADLINE_CHECKS=*/30 * * * *
`;

// Development local environment variables (sensitive test data)
const devLocalEnvVars = `# Development Local Environment Variables
# Contains test secrets for development - DO NOT COMMIT TO VERSION CONTROL

# Test Security Keys (FOR DEVELOPMENT ONLY)
JWT_SECRET=development-jwt-secret-key-for-testing-minimum-32-characters
ENCRYPTION_KEY=development-encryption-key-32-chars
DATABASE_ENCRYPTION_KEY=development-db-encryption-key-32

# Test Blockchain Keys (FOR DEVELOPMENT ONLY - TESTNET ONLY)
DEPLOYER_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
BACKEND_WALLET_PRIVATE_KEY=0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d

# Test Email Configuration (FOR DEVELOPMENT ONLY)
SMTP_HOST=localhost
SMTP_PORT=587
SMTP_USER=test@example.com
SMTP_PASS=testpassword

# Test API Keys (FOR DEVELOPMENT ONLY)
INFURA_API_KEY=test-infura-key
ALCHEMY_API_KEY=test-alchemy-key
`;

async function setupDevEnvironment() {
  try {
    log('🚀 Setting up development environment for production readiness testing...', COLORS.BOLD);

    // Check if .env already exists
    if (fs.existsSync('.env')) {
      log('⚠️  .env file already exists - skipping creation', COLORS.YELLOW);
    } else {
      // Create .env file
      fs.writeFileSync('.env', devEnvVars);
      log('✅ Created .env file with development configuration', COLORS.GREEN);
    }

    // Check if .env.local already exists
    if (fs.existsSync('.env.local')) {
      log('⚠️  .env.local file already exists - skipping creation', COLORS.YELLOW);
    } else {
      // Create .env.local file
      fs.writeFileSync('.env.local', devLocalEnvVars);
      log('✅ Created .env.local file with test secrets', COLORS.GREEN);
    }

    // Update .gitignore to ensure .env.local is ignored
    const gitignorePath = '.gitignore';
    const gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
    
    if (!gitignoreContent.includes('.env.local')) {
      fs.appendFileSync(gitignorePath, '\n# Environment variables with secrets\n.env.local\n');
      log('✅ Updated .gitignore to exclude .env.local', COLORS.GREEN);
    }

    log('\n📋 Development environment setup complete!', COLORS.BOLD);
    log('\n🔍 Next steps:', COLORS.BLUE);
    log('1. Run: npm run production-check', COLORS.BLUE);
    log('2. Start server: npm start', COLORS.BLUE);
    log('3. Test endpoints manually if needed', COLORS.BLUE);

    log('\n⚠️  IMPORTANT SECURITY NOTES:', COLORS.YELLOW);
    log('• The .env.local file contains TEST SECRETS only', COLORS.YELLOW);
    log('• Never use these test keys in production', COLORS.YELLOW);
    log('• For production, use AWS Secrets Manager', COLORS.YELLOW);
    log('• The test private keys are from Hardhat\'s default accounts', COLORS.YELLOW);

  } catch (error) {
    log(`❌ Failed to setup development environment: ${error.message}`, COLORS.RED);
    process.exit(1);
  }
}

// Run setup
setupDevEnvironment(); 