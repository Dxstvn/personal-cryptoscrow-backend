import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

class AWSSecretsManager {
  constructor() {
    this.client = new SecretsManagerClient({ 
      region: process.env.AWS_REGION || 'us-east-1' 
    });
    this.cache = new Map();
    this.cacheTimeout = 300000; // 5 minutes cache
  }

  async getSecret(secretName) {
    // Check cache first
    const cached = this.cache.get(secretName);
    if (cached && cached.timestamp > Date.now() - this.cacheTimeout) {
      return cached.value;
    }

    try {
      const response = await this.client.send(
        new GetSecretValueCommand({
          SecretId: secretName,
          VersionStage: "AWSCURRENT", // VersionStage defaults to AWSCURRENT if unspecified
        })
      );
      
      let secretValue;
      if (response.SecretString) {
        try {
          secretValue = JSON.parse(response.SecretString);
        } catch (e) {
          // If not JSON, return as string
          secretValue = response.SecretString;
        }
      } else if (response.SecretBinary) {
        // Handle binary secrets if needed
        const buff = Buffer.from(response.SecretBinary, 'base64');
        secretValue = buff.toString('ascii');
      }

      // Cache the result
      this.cache.set(secretName, {
        value: secretValue,
        timestamp: Date.now()
      });

      return secretValue;
    } catch (error) {
      console.error(`Error retrieving secret ${secretName}:`, error);
      throw error;
    }
  }

  async getFirebaseServiceAccount() {
    const secretName = process.env.NODE_ENV === 'production' 
      ? 'CryptoEscrow/Firebase/ServiceAccount'
      : 'CryptoEscrow/Staging/Firebase';
    return this.getSecret(secretName);
  }

  async getAppConfig() {
    const secretName = process.env.NODE_ENV === 'production' 
      ? 'CryptoEscrow/App/Config'
      : 'CryptoEscrow/Staging/Config';
    return this.getSecret(secretName);
  }

  async getBlockchainKeys() {
    const environment = process.env.NODE_ENV === 'production' ? '' : '/Staging';
    const secretName = `CryptoEscrow${environment}/Blockchain/Keys`;
    return this.getSecret(secretName);
  }

  clearCache() {
    this.cache.clear();
  }
}

export default new AWSSecretsManager();