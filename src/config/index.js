import dotenv from 'dotenv';
import awsSecretsManager from '../services/awsSecretsManager.js';

// Load .env file only if not using AWS Secrets Manager
if (process.env.USE_AWS_SECRETS !== 'true') {
  dotenv.config();
}

class Config {
  constructor() {
    this.isInitialized = false;
    this.config = {};
  }

  async initialize() {
    if (this.isInitialized) return;

    if (process.env.USE_AWS_SECRETS === 'true') {
      console.log('Loading configuration from AWS Secrets Manager...');
      
      try {
        // Load secrets from AWS
        const [appConfig, blockchainKeys, firebaseServiceAccount] = await Promise.all([
          awsSecretsManager.getAppConfig(),
          awsSecretsManager.getBlockchainKeys(),
          awsSecretsManager.getFirebaseServiceAccount()
        ]);

        // Merge all configurations
        this.config = {
          // Server config (from environment or defaults)
          NODE_ENV: process.env.NODE_ENV || 'development',
          PORT: process.env.PORT || 3000,
          FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:3000',
          AWS_REGION: process.env.AWS_REGION || 'us-east-1',
          
          // From AWS Secrets Manager
          ...appConfig,
          ...blockchainKeys,
          
          // Firebase service account
          FIREBASE_SERVICE_ACCOUNT: firebaseServiceAccount,
          
          // Computed values
          USE_AWS_SECRETS: true
        };

        console.log('Configuration loaded from AWS Secrets Manager successfully');
      } catch (error) {
        console.error('Failed to load configuration from AWS Secrets Manager:', error);
        throw new Error('Failed to initialize configuration from AWS Secrets Manager');
      }
    } else {
      // Load from environment variables
      console.log('Loading configuration from environment variables...');
      
      this.config = {
        // Server config
        NODE_ENV: process.env.NODE_ENV || 'development',
        PORT: process.env.PORT || 3000,
        FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:3000',
        
        // Firebase config
        FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID,
        FIREBASE_STORAGE_BUCKET: process.env.FIREBASE_STORAGE_BUCKET,
        FIREBASE_API_KEY: process.env.FIREBASE_API_KEY,
        FIREBASE_AUTH_DOMAIN: process.env.FIREBASE_AUTH_DOMAIN,
        FIREBASE_MESSAGING_SENDER_ID: process.env.FIREBASE_MESSAGING_SENDER_ID,
        FIREBASE_APP_ID: process.env.FIREBASE_APP_ID,
        GOOGLE_APPLICATION_CREDENTIALS: process.env.GOOGLE_APPLICATION_CREDENTIALS,
        
        // Blockchain config
        RPC_URL: process.env.RPC_URL,
        CHAIN_ID: process.env.CHAIN_ID,
        BACKEND_WALLET_PRIVATE_KEY: process.env.BACKEND_WALLET_PRIVATE_KEY,
        BACKEND_WALLET_ADDRESS: process.env.BACKEND_WALLET_ADDRESS,
        DEFAULT_SERVICE_WALLET: process.env.DEFAULT_SERVICE_WALLET,
        
        // Service config
        SERVICE_FEE_PERCENTAGE: process.env.SERVICE_FEE_PERCENTAGE,
        ALLOWED_EMAILS: process.env.ALLOWED_EMAILS,
        
        // AWS config
        AWS_REGION: process.env.AWS_REGION || 'us-east-1',
        USE_AWS_SECRETS: false
      };
    }

    this.isInitialized = true;
  }

  get(key) {
    if (!this.isInitialized) {
      throw new Error('Configuration not initialized. Call initialize() first.');
    }
    return this.config[key];
  }

  getAll() {
    if (!this.isInitialized) {
      throw new Error('Configuration not initialized. Call initialize() first.');
    }
    return { ...this.config };
  }

  // Helper methods for common configurations
  getFirebaseConfig() {
    return {
      projectId: this.get('FIREBASE_PROJECT_ID'),
      storageBucket: this.get('FIREBASE_STORAGE_BUCKET'),
      apiKey: this.get('FIREBASE_API_KEY'),
      authDomain: this.get('FIREBASE_AUTH_DOMAIN'),
      messagingSenderId: this.get('FIREBASE_MESSAGING_SENDER_ID'),
      appId: this.get('FIREBASE_APP_ID')
    };
  }

  getBlockchainConfig() {
    return {
      rpcUrl: this.get('RPC_URL'),
      chainId: this.get('CHAIN_ID'),
      backendWalletPrivateKey: this.get('BACKEND_WALLET_PRIVATE_KEY'),
      backendWalletAddress: this.get('BACKEND_WALLET_ADDRESS'),
      defaultServiceWallet: this.get('DEFAULT_SERVICE_WALLET')
    };
  }

  isProduction() {
    return this.get('NODE_ENV') === 'production';
  }

  isStaging() {
    return this.get('NODE_ENV') === 'staging';
  }

  isDevelopment() {
    return this.get('NODE_ENV') === 'development';
  }
}

export default new Config();