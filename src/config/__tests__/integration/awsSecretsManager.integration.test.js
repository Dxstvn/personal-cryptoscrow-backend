import { jest, describe, it, expect, beforeEach, afterEach, beforeAll } from '@jest/globals';

// Note: This is an integration test that uses real AWS SDK behavior but with mocked responses
// It tests the full flow of secret retrieval including caching, error handling, and environment detection

describe('AWS Secrets Manager Integration Tests', () => {
  let awsSecretsManager;
  let mockSecretsManager;

  // Save original environment
  const originalEnv = process.env;

  // Mock console to reduce test output noise
  let consoleSpy;

  beforeAll(() => {
    // Set up console spy to capture log outputs
    consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  beforeEach(async () => {
    // Reset environment
    process.env = { ...originalEnv };
    
    // Clear all mocks and reset modules
    jest.clearAllMocks();
    jest.resetModules();

    // Import the real AWS Secrets Manager module (will be using mocked AWS SDK)
    const module = await import('../../awsSecretsManager.js');
    awsSecretsManager = module.default;
    
    // Get access to the underlying client for setting up mocks
    mockSecretsManager = awsSecretsManager.client;
  });

  afterEach(() => {
    // Restore environment and clear cache
    process.env = originalEnv;
    awsSecretsManager.clearCache();
  });

  afterAll(() => {
    // Restore console
    if (consoleSpy) {
      consoleSpy.mockRestore();
    }
  });

  describe('Real AWS Secrets Manager Flow Integration', () => {
    it('should handle successful secret retrieval with proper JSON parsing', async () => {
      const mockSecret = {
        JWT_SECRET: 'test-jwt-secret',
        ENCRYPTION_KEY: 'test-encryption-key',
        DATABASE_URL: 'postgresql://test:test@localhost/test'
      };

      // Mock the AWS SDK send method
      jest.spyOn(mockSecretsManager, 'send').mockResolvedValue({
        SecretString: JSON.stringify(mockSecret)
      });

      const result = await awsSecretsManager.getSecret('test-secret');

      expect(result).toEqual(mockSecret);
      expect(mockSecretsManager.send).toHaveBeenCalledTimes(1);
    });

    it('should handle AWS service errors properly', async () => {
      const awsError = new Error('ResourceNotFoundException: Secrets Manager can\'t find the specified secret.');
      awsError.name = 'ResourceNotFoundException';
      
      jest.spyOn(mockSecretsManager, 'send').mockRejectedValue(awsError);

      await expect(awsSecretsManager.getSecret('nonexistent-secret'))
        .rejects.toThrow('AWS Secrets Manager error: ResourceNotFoundException: Secrets Manager can\'t find the specified secret.');
    });

    it('should handle network errors gracefully', async () => {
      const networkError = new Error('Network timeout');
      networkError.code = 'NetworkingError';
      
      jest.spyOn(mockSecretsManager, 'send').mockRejectedValue(networkError);

      await expect(awsSecretsManager.getSecret('timeout-secret'))
        .rejects.toThrow('AWS Secrets Manager error: Network timeout');
    });
  });

  describe('Environment-Based Secret Management Integration', () => {
    describe('Staging Environment', () => {
      beforeEach(() => {
        process.env.NODE_ENV = 'staging';
        process.env.AWS_REGION = 'us-east-1';
        process.env.USE_AWS_SECRETS = 'true';
      });

      it('should retrieve staging app secrets correctly', async () => {
        const stagingAppSecrets = {
          JWT_SECRET: 'staging-jwt-secret',
          ENCRYPTION_KEY: 'staging-encryption-key',
          FRONTEND_URL: 'https://staging.clearhold.app'
        };

        jest.spyOn(mockSecretsManager, 'send').mockResolvedValue({
          SecretString: JSON.stringify(stagingAppSecrets)
        });

        const result = await awsSecretsManager.getAppSecrets();

        expect(result).toEqual(stagingAppSecrets);
        // Verify it called with the correct staging secret name
        const callArgs = mockSecretsManager.send.mock.calls[0][0];
        expect(callArgs.input.SecretId).toBe('CryptoEscrow/Staging/App/Config');
      });

      it('should retrieve staging blockchain secrets correctly', async () => {
        const stagingBlockchainSecrets = {
          BACKEND_WALLET_PRIVATE_KEY: 'staging-private-key',
          RPC_URL: 'https://sepolia.infura.io/v3/staging-key',
          CHAIN_ID: '11155111'
        };

        jest.spyOn(mockSecretsManager, 'send').mockResolvedValue({
          SecretString: JSON.stringify(stagingBlockchainSecrets)
        });

        const result = await awsSecretsManager.getBlockchainSecrets();

        expect(result).toEqual(stagingBlockchainSecrets);
        const callArgs = mockSecretsManager.send.mock.calls[0][0];
        expect(callArgs.input.SecretId).toBe('CryptoEscrow/Staging/Blockchain/Keys');
      });

      it('should retrieve staging Firebase service account correctly', async () => {
        const stagingFirebaseSecret = {
          type: 'service_account',
          project_id: 'escrowstaging',
          private_key: '-----BEGIN PRIVATE KEY-----\\nSTAGING_KEY_DATA\\n-----END PRIVATE KEY-----',
          client_email: 'firebase-adminsdk@escrowstaging.iam.gserviceaccount.com',
          private_key_id: 'staging-key-id',
          client_id: 'staging-client-id',
          auth_uri: 'https://accounts.google.com/o/oauth2/auth',
          token_uri: 'https://oauth2.googleapis.com/token',
          auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
          client_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs/firebase-adminsdk%40escrowstaging.iam.gserviceaccount.com'
        };

        jest.spyOn(mockSecretsManager, 'send').mockResolvedValue({
          SecretString: JSON.stringify(stagingFirebaseSecret)
        });

        const result = await awsSecretsManager.getFirebaseServiceAccount();

        expect(result.project_id).toBe('escrowstaging');
        expect(result.client_email).toBe('firebase-adminsdk@escrowstaging.iam.gserviceaccount.com');
        // Verify private key newlines are properly unescaped
        expect(result.private_key).toBe('-----BEGIN PRIVATE KEY-----\nSTAGING_KEY_DATA\n-----END PRIVATE KEY-----');
        
        const callArgs = mockSecretsManager.send.mock.calls[0][0];
        expect(callArgs.input.SecretId).toBe('CryptoEscrow/Staging/Firebase');
      });
    });

    describe('Production Environment', () => {
      beforeEach(() => {
        process.env.NODE_ENV = 'production';
        process.env.AWS_REGION = 'us-east-1';
        process.env.USE_AWS_SECRETS = 'true';
      });

      it('should retrieve production Firebase service account correctly', async () => {
        const productionFirebaseSecret = {
          type: 'service_account',
          project_id: 'ethescrow-377c6',
          private_key: '-----BEGIN PRIVATE KEY-----\\nPRODUCTION_KEY_DATA\\n-----END PRIVATE KEY-----',
          client_email: 'firebase-adminsdk@ethescrow-377c6.iam.gserviceaccount.com'
        };

        jest.spyOn(mockSecretsManager, 'send').mockResolvedValue({
          SecretString: JSON.stringify(productionFirebaseSecret)
        });

        const result = await awsSecretsManager.getFirebaseServiceAccount();

        expect(result.project_id).toBe('ethescrow-377c6');
        expect(result.private_key).toBe('-----BEGIN PRIVATE KEY-----\nPRODUCTION_KEY_DATA\n-----END PRIVATE KEY-----');
        
        const callArgs = mockSecretsManager.send.mock.calls[0][0];
        expect(callArgs.input.SecretId).toBe('CryptoEscrow/Production/Firebase');
      });
    });
  });

  describe('Caching Integration', () => {
    it('should properly cache secrets across multiple requests', async () => {
      const secretData = { cached: 'value', timestamp: Date.now() };
      
      jest.spyOn(mockSecretsManager, 'send').mockResolvedValue({
        SecretString: JSON.stringify(secretData)
      });

      // First request
      const result1 = await awsSecretsManager.getSecret('cache-test');
      expect(result1).toEqual(secretData);
      expect(mockSecretsManager.send).toHaveBeenCalledTimes(1);

      // Second request should use cache
      const result2 = await awsSecretsManager.getSecret('cache-test');
      expect(result2).toEqual(secretData);
      expect(mockSecretsManager.send).toHaveBeenCalledTimes(1); // Still only 1 call

      // Verify both results are equal
      expect(result1).toEqual(result2);
    });

    it('should handle cache expiration correctly', async () => {
      const secretData1 = { version: 1 };
      const secretData2 = { version: 2 };
      
      // Reduce cache timeout for testing
      const originalTimeout = awsSecretsManager.cacheTimeout;
      awsSecretsManager.cacheTimeout = 50; // 50ms

      jest.spyOn(mockSecretsManager, 'send')
        .mockResolvedValueOnce({
          SecretString: JSON.stringify(secretData1)
        })
        .mockResolvedValueOnce({
          SecretString: JSON.stringify(secretData2)
        });

      // First request
      const result1 = await awsSecretsManager.getSecret('expiring-secret');
      expect(result1).toEqual(secretData1);

      // Wait for cache to expire
      await new Promise(resolve => setTimeout(resolve, 60));

      // Second request should fetch fresh data
      const result2 = await awsSecretsManager.getSecret('expiring-secret');
      expect(result2).toEqual(secretData2);
      expect(mockSecretsManager.send).toHaveBeenCalledTimes(2);

      // Restore original timeout
      awsSecretsManager.cacheTimeout = originalTimeout;
    });
  });

  describe('Environment Detection Integration', () => {
    it('should correctly identify AWS environment for staging', () => {
      process.env.NODE_ENV = 'staging';
      expect(awsSecretsManager.isAWSEnvironment()).toBe(true);
    });

    it('should correctly identify AWS environment for production', () => {
      process.env.NODE_ENV = 'production';
      expect(awsSecretsManager.isAWSEnvironment()).toBe(true);
    });

    it('should correctly identify AWS environment when USE_AWS_SECRETS is set', () => {
      process.env.NODE_ENV = 'development';
      process.env.USE_AWS_SECRETS = 'true';
      expect(awsSecretsManager.isAWSEnvironment()).toBe(true);
    });

    it('should not identify as AWS environment for regular development', () => {
      process.env.NODE_ENV = 'development';
      delete process.env.USE_AWS_SECRETS;
      expect(awsSecretsManager.isAWSEnvironment()).toBe(false);
    });
  });

  describe('Error Recovery Integration', () => {
    it('should handle temporary AWS service unavailability', async () => {
      const temporaryError = new Error('Service Unavailable');
      temporaryError.name = 'ServiceUnavailableException';
      
      jest.spyOn(mockSecretsManager, 'send').mockRejectedValue(temporaryError);

      await expect(awsSecretsManager.getSecret('unavailable-secret'))
        .rejects.toThrow('AWS Secrets Manager error: Service Unavailable');
    });

    it('should handle invalid JSON in secret response', async () => {
      jest.spyOn(mockSecretsManager, 'send').mockResolvedValue({
        SecretString: 'invalid json {'
      });

      await expect(awsSecretsManager.getSecret('invalid-json-secret'))
        .rejects.toThrow();
    });

    it('should handle missing SecretString in response', async () => {
      jest.spyOn(mockSecretsManager, 'send').mockResolvedValue({
        // Missing SecretString
      });

      await expect(awsSecretsManager.getSecret('missing-string-secret'))
        .rejects.toThrow();
    });
  });

  describe('Multi-Environment Configuration Integration', () => {
    it('should handle switching between environments', async () => {
      // Start in staging
      process.env.NODE_ENV = 'staging';
      
      const stagingSecret = { env: 'staging' };
      jest.spyOn(mockSecretsManager, 'send').mockResolvedValue({
        SecretString: JSON.stringify(stagingSecret)
      });

      const stagingResult = await awsSecretsManager.getAppSecrets();
      expect(stagingResult).toEqual(stagingSecret);
      
      let callArgs = mockSecretsManager.send.mock.calls[0][0];
      expect(callArgs.input.SecretId).toBe('CryptoEscrow/Staging/App/Config');

      // Clear cache and switch to production
      awsSecretsManager.clearCache();
      jest.clearAllMocks();
      process.env.NODE_ENV = 'production';
      
      const productionSecret = { env: 'production' };
      jest.spyOn(mockSecretsManager, 'send').mockResolvedValue({
        SecretString: JSON.stringify(productionSecret)
      });

      const productionResult = await awsSecretsManager.getAppSecrets();
      expect(productionResult).toEqual(productionSecret);
      
      callArgs = mockSecretsManager.send.mock.calls[0][0];
      expect(callArgs.input.SecretId).toBe('CryptoEscrow/App/Config');
    });
  });
}); 