#!/usr/bin/env node

/**
 * Pre-Production Validation Script
 * Run this before any production deployment to ensure environment is correctly configured
 */

import fs from 'fs';
import path from 'path';

console.log('🔍 Running pre-production validation...\n');

let hasErrors = false;

function logError(message) {
  console.error(`❌ ${message}`);
  hasErrors = true;
}

function logWarning(message) {
  console.warn(`⚠️  ${message}`);
}

function logSuccess(message) {
  console.log(`✅ ${message}`);
}

// 1. Check NODE_ENV
const nodeEnv = process.env.NODE_ENV;
if (nodeEnv !== 'production') {
  logError(`NODE_ENV is '${nodeEnv}', must be 'production'`);
} else {
  logSuccess('NODE_ENV is set to production');
}

// 2. Check for .env file
if (!fs.existsSync('.env')) {
  logError('.env file not found - required for production');
} else {
  const envContent = fs.readFileSync('.env', 'utf8');
  
  // Check NODE_ENV in .env
  if (!envContent.includes('NODE_ENV=production')) {
    logError('.env file must contain NODE_ENV=production');
  } else {
    logSuccess('.env file has correct NODE_ENV');
  }
  
  // Check for test configurations
  const dangerousPatterns = [
    'demo-test',
    'localhost:5004',
    'localhost:9099',
    'localhost:9199',
    '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
    'test-project'
  ];
  
  for (const pattern of dangerousPatterns) {
    if (envContent.includes(pattern)) {
      logError(`Dangerous test configuration found in .env: ${pattern}`);
    }
  }
}

// 3. Check AWS Secrets configuration
if (process.env.USE_AWS_SECRETS !== 'true') {
  logError('USE_AWS_SECRETS must be "true" in production');
} else {
  logSuccess('AWS Secrets Manager enabled');
}

if (!process.env.AWS_REGION) {
  logError('AWS_REGION must be set');
} else {
  logSuccess(`AWS Region: ${process.env.AWS_REGION}`);
}

// 4. Check Firebase configuration
const firebaseProjectId = process.env.FIREBASE_PROJECT_ID;
if (!firebaseProjectId) {
  logError('FIREBASE_PROJECT_ID must be set');
} else if (firebaseProjectId.includes('test') || firebaseProjectId === 'demo-test') {
  logError(`Firebase project ID appears to be for testing: ${firebaseProjectId}`);
} else {
  logSuccess(`Firebase Project ID: ${firebaseProjectId}`);
}

// 5. Check for emulator environment variables
const emulatorVars = [
  'FIRESTORE_EMULATOR_HOST',
  'FIREBASE_AUTH_EMULATOR_HOST',
  'FIREBASE_STORAGE_EMULATOR_HOST'
];

for (const varName of emulatorVars) {
  if (process.env[varName]) {
    logError(`Emulator variable set in production: ${varName}=${process.env[varName]}`);
  }
}

// 6. Check package.json scripts for production readiness
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
if (!packageJson.scripts.start) {
  logWarning('No "start" script found in package.json');
} else {
  logSuccess('Start script available');
}

// 7. Check for PM2 ecosystem file
if (!fs.existsSync('ecosystem.config.cjs')) {
  logWarning('PM2 ecosystem.config.cjs not found');
} else {
  logSuccess('PM2 configuration found');
}

// 8. Check critical dependencies
const criticalDeps = ['express', 'firebase-admin', 'aws-sdk'];
for (const dep of criticalDeps) {
  if (!packageJson.dependencies[dep] && !packageJson.devDependencies[dep]) {
    logError(`Critical dependency missing: ${dep}`);
  }
}

// Final result
console.log('\n' + '='.repeat(50));
if (hasErrors) {
  console.error('❌ PRODUCTION VALIDATION FAILED');
  console.error('Please fix the above issues before deploying to production.');
  process.exit(1);
} else {
  console.log('✅ PRODUCTION VALIDATION PASSED');
  console.log('Environment is ready for production deployment.');
}
console.log('='.repeat(50));