import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env first (public variables)
dotenv.config({ 
  path: path.resolve(__dirname, '../../.env'),
  override: false  // Don't override if already set
});

// Load .env.local second (private variables, will override .env if needed)
dotenv.config({ 
  path: path.resolve(__dirname, '../../.env.local'),
  override: true   // Override existing values
});

// Export a function to validate required environment variables
export function validateEnvVars(requiredVars = []) {
  const missing = requiredVars.filter(varName => !process.env[varName]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

// Export common environment configurations
export const config = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: process.env.PORT || 3000,
  FRONTEND_URL: process.env.FRONTEND_URL,
  
  // Firebase config
  FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID,
  FIREBASE_STORAGE_BUCKET: process.env.FIREBASE_STORAGE_BUCKET,
  FIREBASE_API_KEY: process.env.FIREBASE_API_KEY,
  FIREBASE_AUTH_DOMAIN: process.env.FIREBASE_AUTH_DOMAIN,
  FIREBASE_MESSAGING_SENDER_ID: process.env.FIREBASE_MESSAGING_SENDER_ID,
  FIREBASE_APP_ID: process.env.FIREBASE_APP_ID,
  FIREBASE_MEASUREMENT_ID: process.env.FIREBASE_MEASUREMENT_ID,
  GOOGLE_APPLICATION_CREDENTIALS: process.env.GOOGLE_APPLICATION_CREDENTIALS,
  
  // Blockchain config
  RPC_URL: process.env.RPC_URL,
  SEPOLIA_RPC_URL: process.env.SEPOLIA_RPC_URL,
  CHAIN_ID: process.env.CHAIN_ID,
  DEPLOYER_PRIVATE_KEY: process.env.DEPLOYER_PRIVATE_KEY,
  BACKEND_WALLET_PRIVATE_KEY: process.env.BACKEND_WALLET_PRIVATE_KEY,
  
  // Security
  JWT_SECRET: process.env.JWT_SECRET,
  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
  DATABASE_ENCRYPTION_KEY: process.env.DATABASE_ENCRYPTION_KEY,
  ALLOWED_EMAILS: process.env.ALLOWED_EMAILS,
  
  // Email config
  SMTP_HOST: process.env.SMTP_HOST,
  SMTP_PORT: process.env.SMTP_PORT,
  SMTP_USER: process.env.SMTP_USER,
  SMTP_PASS: process.env.SMTP_PASS,
  
  // Test config
  TEST_USER_A_EMAIL: process.env.TEST_USER_A_EMAIL,
  TEST_USER_A_PASSWORD: process.env.TEST_USER_A_PASSWORD,
  TEST_USER_A_PK: process.env.TEST_USER_A_PK,
  TEST_USER_B_EMAIL: process.env.TEST_USER_B_EMAIL,
  TEST_USER_B_PASSWORD: process.env.TEST_USER_B_PASSWORD,
  TEST_USER_B_PK: process.env.TEST_USER_B_PK,
  
  // Emulator config
  FIRESTORE_EMULATOR_HOST: process.env.FIRESTORE_EMULATOR_HOST,
  FIREBASE_AUTH_EMULATOR_HOST: process.env.FIREBASE_AUTH_EMULATOR_HOST,
  FIREBASE_STORAGE_EMULATOR_HOST: process.env.FIREBASE_STORAGE_EMULATOR_HOST,
  
  // Scheduled jobs
  CRON_SCHEDULE_DEADLINE_CHECKS: process.env.CRON_SCHEDULE_DEADLINE_CHECKS,
  
  // API Keys
  INFURA_API_KEY: process.env.INFURA_API_KEY,
  ALCHEMY_API_KEY: process.env.ALCHEMY_API_KEY,
};

// Log environment loading status (only in development)
if (config.NODE_ENV === 'development') {
  console.log('🔧 Environment variables loaded from .env and .env.local');
} 