import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// Mock AWS SDK
const mockSend = jest.fn();
const mockSecretsManagerClient = jest.fn(() => ({
  send: mockSend
}));

const mockGetSecretValueCommand = jest.fn();

jest.unstable_mockModule('@aws-sdk/client-secrets-manager', () => ({
  SecretsManagerClient: mockSecretsManagerClient,
  GetSecretValueCommand: mockGetSecretValueCommand
}));

describe('AWS Secrets Manager Unit Tests', () => {
  let awsSecretsManager;

  // Save original environment
  const originalEnv = process.env;

  beforeEach(async () => {
    // Reset environment
    process.env = { ...originalEnv };
    
    // Clear all mocks
    jest.clearAllMocks();
    jest.resetModules();
    
    // Set up default mock implementations
    mockSend.mockResolvedValue({
      SecretString: JSON.stringify({
        type: 'service_account',
        project_id: 'test-project',
        private_key: '-----BEGIN PRIVATE KEY-----\\nTEST_KEY\\n-----END PRIVATE KEY-----',
        client_email: 'test@test-project.iam.gserviceaccount.com'
      })
    });

    // Import the module after mocks are set up
    const module = await import('../../awsSecretsManager.js');
    awsSecretsManager = module.default;
  });

  afterEach(() => {
    // Restore environment and clear cache
    process.env = originalEnv;
    awsSecretsManager.clearCache();
  });

  describe('Environment Detection', () => {
    it('should detect AWS environment correctly for production', () => {
      process.env.NODE_ENV = 'production';
      expect(awsSecretsManager.isAWSEnvironment()).toBe(true);
    });

    it('should detect AWS environment correctly for staging', () => {
      process.env.NODE_ENV = 'staging';
      expect(awsSecretsManager.isAWSEnvironment()).toBe(true);
    });

    it('should detect AWS environment correctly when USE_AWS_SECRETS is true', () => {
      process.env.NODE_ENV = 'development';
      process.env.USE_AWS_SECRETS = 'true';
      expect(awsSecretsManager.isAWSEnvironment()).toBe(true);
    });

    it('should not detect AWS environment for development', () => {
      process.env.NODE_ENV = 'development';
      delete process.env.USE_AWS_SECRETS;
      expect(awsSecretsManager.isAWSEnvironment()).toBe(false);
    });

    it('should not detect AWS environment for test', () => {
      process.env.NODE_ENV = 'test';
      expect(awsSecretsManager.isAWSEnvironment()).toBe(false);
    });
  });

  describe('Secret Retrieval', () => {
    it('should retrieve secrets successfully', async () => {
      const testSecret = { key: 'value', nested: { data: 'test' } };
      mockSend.mockResolvedValue({
        SecretString: JSON.stringify(testSecret)
      });

      const result = await awsSecretsManager.getSecret('test-secret');

      expect(mockGetSecretValueCommand).toHaveBeenCalledWith({
        SecretId: 'test-secret'
      });
      expect(mockSend).toHaveBeenCalledWith(expect.any(Object));
      expect(result).toEqual(testSecret);
    });

    it('should handle AWS SDK errors', async () => {
      mockSend.mockRejectedValue(new Error('Secret not found'));

      await expect(awsSecretsManager.getSecret('nonexistent-secret'))
        .rejects.toThrow('AWS Secrets Manager error: Secret not found');
    });

    it('should cache retrieved secrets', async () => {
      const testSecret = { cached: 'data' };
      mockSend.mockResolvedValue({
        SecretString: JSON.stringify(testSecret)
      });

      // First call
      const result1 = await awsSecretsManager.getSecret('cached-secret');
      expect(result1).toEqual(testSecret);
      expect(mockSend).toHaveBeenCalledTimes(1);

      // Second call should use cache
      const result2 = await awsSecretsManager.getSecret('cached-secret');
      expect(result2).toEqual(testSecret);
      expect(mockSend).toHaveBeenCalledTimes(1); // Still only called once
    });

    it('should expire cache after timeout', async () => {
      const testSecret = { expired: 'data' };
      mockSend.mockResolvedValue({
        SecretString: JSON.stringify(testSecret)
      });

      // Mock short cache timeout
      const originalTimeout = awsSecretsManager.cacheTimeout;
      awsSecretsManager.cacheTimeout = 10; // 10ms

      // First call
      await awsSecretsManager.getSecret('expiring-secret');
      expect(mockSend).toHaveBeenCalledTimes(1);

      // Wait for cache to expire
      await new Promise(resolve => setTimeout(resolve, 20));

      // Second call should fetch again
      await awsSecretsManager.getSecret('expiring-secret');
      expect(mockSend).toHaveBeenCalledTimes(2);

      // Restore original timeout
      awsSecretsManager.cacheTimeout = originalTimeout;
    });
  });

  describe('Environment-Specific Secret Names', () => {
    describe('App Secrets', () => {
      it('should use staging secret name in staging environment', async () => {
        process.env.NODE_ENV = 'staging';
        
        await awsSecretsManager.getAppSecrets();
        
        expect(mockGetSecretValueCommand).toHaveBeenCalledWith({
          SecretId: 'CryptoEscrow/Staging/App/Config'
        });
      });

      it('should use production secret name in production environment', async () => {
        process.env.NODE_ENV = 'production';
        
        await awsSecretsManager.getAppSecrets();
        
        expect(mockGetSecretValueCommand).toHaveBeenCalledWith({
          SecretId: 'CryptoEscrow/App/Config'
        });
      });

      it('should use production secret name for development environment', async () => {
        process.env.NODE_ENV = 'development';
        
        await awsSecretsManager.getAppSecrets();
        
        expect(mockGetSecretValueCommand).toHaveBeenCalledWith({
          SecretId: 'CryptoEscrow/App/Config'
        });
      });
    });

    describe('Blockchain Secrets', () => {
      it('should use staging secret name in staging environment', async () => {
        process.env.NODE_ENV = 'staging';
        
        await awsSecretsManager.getBlockchainSecrets();
        
        expect(mockGetSecretValueCommand).toHaveBeenCalledWith({
          SecretId: 'CryptoEscrow/Staging/Blockchain/Keys'
        });
      });

      it('should use production secret name in production environment', async () => {
        process.env.NODE_ENV = 'production';
        
        await awsSecretsManager.getBlockchainSecrets();
        
        expect(mockGetSecretValueCommand).toHaveBeenCalledWith({
          SecretId: 'CryptoEscrow/Blockchain/Keys'
        });
      });
    });

    describe('Firebase Service Account', () => {
      it('should use staging Firebase secret in staging environment', async () => {
        process.env.NODE_ENV = 'staging';
        
        await awsSecretsManager.getFirebaseServiceAccount();
        
        expect(mockGetSecretValueCommand).toHaveBeenCalledWith({
          SecretId: 'CryptoEscrow/Staging/Firebase'
        });
      });

      it('should use production Firebase secret in production environment', async () => {
        process.env.NODE_ENV = 'production';
        
        await awsSecretsManager.getFirebaseServiceAccount();
        
        expect(mockGetSecretValueCommand).toHaveBeenCalledWith({
          SecretId: 'CryptoEscrow/Production/Firebase'
        });
      });

      it('should use production Firebase secret for development environment', async () => {
        process.env.NODE_ENV = 'development';
        
        await awsSecretsManager.getFirebaseServiceAccount();
        
        expect(mockGetSecretValueCommand).toHaveBeenCalledWith({
          SecretId: 'CryptoEscrow/Production/Firebase'
        });
      });
    });
  });

  describe('Firebase Private Key Formatting', () => {
    it('should fix escaped newlines in private key', async () => {
      const serviceAccountWithEscapedKey = {
        type: 'service_account',
        project_id: 'test-project',
        private_key: '-----BEGIN PRIVATE KEY-----\\nESCAPED_KEY_DATA\\n-----END PRIVATE KEY-----',
        client_email: 'test@test-project.iam.gserviceaccount.com'
      };

      mockSend.mockResolvedValue({
        SecretString: JSON.stringify(serviceAccountWithEscapedKey)
      });

      const result = await awsSecretsManager.getFirebaseServiceAccount();

      expect(result.private_key).toBe(
        '-----BEGIN PRIVATE KEY-----\nESCAPED_KEY_DATA\n-----END PRIVATE KEY-----'
      );
    });

    it('should handle private key without escaped characters', async () => {
      const serviceAccountWithNormalKey = {
        type: 'service_account',
        project_id: 'test-project',
        private_key: '-----BEGIN PRIVATE KEY-----\nNORMAL_KEY_DATA\n-----END PRIVATE KEY-----',
        client_email: 'test@test-project.iam.gserviceaccount.com'
      };

      mockSend.mockResolvedValue({
        SecretString: JSON.stringify(serviceAccountWithNormalKey)
      });

      const result = await awsSecretsManager.getFirebaseServiceAccount();

      expect(result.private_key).toBe(
        '-----BEGIN PRIVATE KEY-----\nNORMAL_KEY_DATA\n-----END PRIVATE KEY-----'
      );
    });

    it('should handle missing private key', async () => {
      const serviceAccountWithoutKey = {
        type: 'service_account',
        project_id: 'test-project',
        client_email: 'test@test-project.iam.gserviceaccount.com'
      };

      mockSend.mockResolvedValue({
        SecretString: JSON.stringify(serviceAccountWithoutKey)
      });

      const result = await awsSecretsManager.getFirebaseServiceAccount();

      expect(result.private_key).toBeUndefined();
    });
  });

  describe('Cache Management', () => {
    it('should clear cache when requested', async () => {
      const testSecret = { cleared: 'data' };
      mockSend.mockResolvedValue({
        SecretString: JSON.stringify(testSecret)
      });

      // First call to populate cache
      await awsSecretsManager.getSecret('cache-test');
      expect(mockSend).toHaveBeenCalledTimes(1);

      // Clear cache
      awsSecretsManager.clearCache();

      // Second call should fetch again
      await awsSecretsManager.getSecret('cache-test');
      expect(mockSend).toHaveBeenCalledTimes(2);
    });

    it('should maintain separate cache entries for different secrets', async () => {
      mockSend
        .mockResolvedValueOnce({
          SecretString: JSON.stringify({ secret: 'one' })
        })
        .mockResolvedValueOnce({
          SecretString: JSON.stringify({ secret: 'two' })
        });

      const result1 = await awsSecretsManager.getSecret('secret-one');
      const result2 = await awsSecretsManager.getSecret('secret-two');

      expect(result1).toEqual({ secret: 'one' });
      expect(result2).toEqual({ secret: 'two' });
      expect(mockSend).toHaveBeenCalledTimes(2);

      // Subsequent calls should use cache
      await awsSecretsManager.getSecret('secret-one');
      await awsSecretsManager.getSecret('secret-two');
      expect(mockSend).toHaveBeenCalledTimes(2); // Still only 2 calls
    });
  });

  describe('Constructor and Configuration', () => {
    it('should initialize with correct AWS region from environment', async () => {
      process.env.AWS_REGION = 'us-west-2';
      
      // Need to re-import to get new instance with new environment
      jest.resetModules();
      await import('../../awsSecretsManager.js');

      expect(mockSecretsManagerClient).toHaveBeenCalledWith({
        region: 'us-west-2'
      });
    });

    it('should use default region when AWS_REGION is not set', async () => {
      delete process.env.AWS_REGION;
      
      // Need to re-import to get new instance
      jest.resetModules();
      await import('../../awsSecretsManager.js');

      expect(mockSecretsManagerClient).toHaveBeenCalledWith({
        region: 'us-east-1'
      });
    });
  });
}); 