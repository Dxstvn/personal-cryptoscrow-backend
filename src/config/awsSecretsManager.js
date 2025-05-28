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
    return await this.getSecret('CryptoEscrow/App/Config');
  }

  async getBlockchainSecrets() {
    return await this.getSecret('CryptoEscrow/Blockchain/Keys');
  }

  async getFirebaseServiceAccount() {
    return await this.getSecret('CryptoEscrow/Firebase/ServiceAccount');
  }

  // Method to clear cache (useful for testing or forced refresh)
  clearCache() {
    this.cache.clear();
  }

  // Method to check if running in AWS environment
  isAWSEnvironment() {
    return process.env.NODE_ENV === 'production' || process.env.USE_AWS_SECRETS === 'true';
  }
}

export default new AWSSecretsManager(); 