import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

class AWSSecretsManager {
  constructor() {
    this.client = new SecretsManagerClient({
      region: process.env.AWS_REGION || 'us-east-1'
    });
    this.cache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes cache
  }

  async getSecret(secretName) {
    // Check cache first
    const cached = this.cache.get(secretName);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }

    try {
      const command = new GetSecretValueCommand({
        SecretId: secretName,
      });

      const response = await this.client.send(command);
      const secretValue = JSON.parse(response.SecretString);

      // Cache the result
      this.cache.set(secretName, {
        data: secretValue,
        timestamp: Date.now()
      });

      return secretValue;
    } catch (error) {
      console.error(`Failed to retrieve secret ${secretName}:`, error.message);
      throw new Error(`AWS Secrets Manager error: ${error.message}`);
    }
  }

  async getAppSecrets() {
    const environment = process.env.NODE_ENV || 'development';
    const secretName = environment === 'staging' 
      ? 'CryptoEscrow/Staging/App/Config'
      : 'CryptoEscrow/App/Config';
    return await this.getSecret(secretName);
  }

  async getBlockchainSecrets() {
    const environment = process.env.NODE_ENV || 'development';
    const secretName = environment === 'staging' 
      ? 'CryptoEscrow/Staging/Blockchain/Keys'
      : 'CryptoEscrow/Blockchain/Keys';
    return await this.getSecret(secretName);
  }

  async getFirebaseServiceAccount() {
    const environment = process.env.NODE_ENV || 'development';
    
    // For staging, we need a separate Firebase project (escrowstaging)
    // For production, we use the main Firebase project (ethescrow-377c6)
    const secretName = environment === 'staging' 
      ? 'CryptoEscrow/Staging/Firebase'
      : 'CryptoEscrow/Firebase/ServiceAccount';
      
    console.log(`Getting Firebase service account for environment: ${environment}, secret: ${secretName}`);
    const serviceAccount = await this.getSecret(secretName);
    
    // Fix the private key formatting - unescape the newlines
    if (serviceAccount && serviceAccount.private_key) {
      serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
    }
    
    return serviceAccount;
  }

  // Method to clear cache (useful for testing or forced refresh)
  clearCache() {
    this.cache.clear();
  }

  // Method to check if running in AWS environment
  isAWSEnvironment() {
    return process.env.NODE_ENV === 'production' || 
           process.env.NODE_ENV === 'staging' || 
           process.env.USE_AWS_SECRETS === 'true';
  }
}

export default new AWSSecretsManager(); 