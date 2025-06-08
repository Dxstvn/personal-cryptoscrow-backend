import { jest, describe, it, expect, beforeEach, afterEach, afterAll } from '@jest/globals';

// Mock dependencies before importing
const mockSecretsManagerClient = {
  send: jest.fn()
};

const mockGetSecretValueCommand = jest.fn();

// Mock AWS SDK
jest.unstable_mockModule('@aws-sdk/client-secrets-manager', () => ({
  SecretsManagerClient: jest.fn(() => mockSecretsManagerClient),
  GetSecretValueCommand: mockGetSecretValueCommand
}));

// Mock Firebase Admin SDK
const mockInitializeApp = jest.fn();
const mockGetApp = jest.fn();
const mockGetApps = jest.fn();
const mockDeleteApp = jest.fn();
const mockCert = jest.fn();
const mockGetAuth = jest.fn();

jest.unstable_mockModule('firebase-admin/app', () => ({
  initializeApp: mockInitializeApp,
  getApp: mockGetApp,
  getApps: mockGetApps,
  deleteApp: mockDeleteApp,
  cert: mockCert
}));

jest.unstable_mockModule('firebase-admin/auth', () => ({
  getAuth: mockGetAuth
}));

// Mock file system - using proper ES module syntax
const mockFs = {
  existsSync: jest.fn(),
  readFileSync: jest.fn()
};

jest.unstable_mockModule('fs', () => mockFs);

describe('Admin SDK Unit Tests', () => {
  let admin;
  let getAdminApp;
  let deleteAdminApp;

  // Save original environment
  const originalEnv = process.env;

  beforeEach(async () => {
    // Reset environment
    process.env = { ...originalEnv };
    
    // Clear all mocks
    jest.clearAllMocks();
    jest.resetModules();
    
    // Set up default mock implementations
    mockGetApps.mockReturnValue([]);
    mockInitializeApp.mockReturnValue({ name: 'adminApp', projectId: 'test-project' });
    mockSecretsManagerClient.send.mockResolvedValue({
      SecretString: JSON.stringify({
        type: 'service_account',
        project_id: 'test-staging-project',
        private_key: '-----BEGIN PRIVATE KEY-----\nMOCK_PRIVATE_KEY\n-----END PRIVATE KEY-----',
        client_email: 'test@test-staging-project.iam.gserviceaccount.com',
        private_key_id: 'mock-key-id',
        client_id: 'mock-client-id',
        auth_uri: 'https://accounts.google.com/o/oauth2/auth',
        token_uri: 'https://oauth2.googleapis.com/token',
        auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
        client_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs/test%40test-staging-project.iam.gserviceaccount.com'
      })
    });
    
    // Mock file system for development mode
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue(JSON.stringify({
      type: 'service_account',
      project_id: 'dev-project',
      private_key: '-----BEGIN PRIVATE KEY-----\nDEV_PRIVATE_KEY\n-----END PRIVATE KEY-----',
      client_email: 'dev@dev-project.iam.gserviceaccount.com'
    }));

    // Import the module after mocks are set up
    const adminModule = await import('../../admin.js');
    admin = adminModule.adminApp;
    getAdminApp = adminModule.getAdminApp;
    deleteAdminApp = adminModule.deleteAdminApp;
  });

  afterEach(() => {
    // Restore environment
    process.env = originalEnv;
  });

  afterAll(async () => {
    // Clean up any remaining apps
    try {
      await deleteAdminApp();
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Environment Detection', () => {
    it('should detect test environment correctly', async () => {
      process.env.NODE_ENV = 'test';
      const adminModule = await import('../../admin.js');
      await adminModule.getAdminApp();

      expect(mockInitializeApp).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: 'demo-test',
          storageBucket: 'demo-test.appspot.com'
        }),
        'adminApp'
      );
    });

    it('should detect staging environment correctly', async () => {
      process.env.NODE_ENV = 'staging';
      process.env.USE_AWS_SECRETS = 'true';
      
      const adminModule = await import('../../admin.js');
      await adminModule.getAdminApp();

      expect(mockSecretsManagerClient.send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            SecretId: 'CryptoEscrow/Staging/Firebase'
          })
        })
      );
    });

    it('should detect production environment correctly', async () => {
      process.env.NODE_ENV = 'production';
      process.env.USE_AWS_SECRETS = 'true';
      
      const adminModule = await import('../../admin.js');
      await adminModule.getAdminApp();

      expect(mockSecretsManagerClient.send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            SecretId: 'CryptoEscrow/Production/Firebase'
          })
        })
      );
    });

    it('should detect development environment correctly', async () => {
      process.env.NODE_ENV = 'development';
      process.env.GOOGLE_APPLICATION_CREDENTIALS = '/path/to/service-account.json';
      
      const adminModule = await import('../../admin.js');
      await adminModule.getAdminApp();

      expect(mockFs.readFileSync).toHaveBeenCalledWith('/path/to/service-account.json', 'utf8');
      expect(mockInitializeApp).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: 'dev-project'
        }),
        'adminApp'
      );
    });
  });

  describe('Staging Mode Firebase Initialization', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'staging';
      process.env.USE_AWS_SECRETS = 'true';
      process.env.FIREBASE_PROJECT_ID = 'escrowstaging';
      process.env.FIREBASE_STORAGE_BUCKET = 'escrowstaging.appspot.com';
    });

    it('should initialize Firebase Admin SDK with staging secrets from AWS', async () => {
      const adminModule = await import('../../admin.js');
      const app = await adminModule.getAdminApp();

      expect(mockSecretsManagerClient.send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            SecretId: 'CryptoEscrow/Staging/Firebase'
          })
        })
      );
      
      expect(mockCert).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'service_account',
          project_id: 'test-staging-project',
          private_key: '-----BEGIN PRIVATE KEY-----\nMOCK_PRIVATE_KEY\n-----END PRIVATE KEY-----',
          client_email: 'test@test-staging-project.iam.gserviceaccount.com'
        })
      );

      expect(mockInitializeApp).toHaveBeenCalledWith(
        expect.objectContaining({
          credential: expect.anything(),
          projectId: 'test-staging-project',
          storageBucket: 'escrowstaging.appspot.com'
        }),
        'adminApp'
      );
    });

    it('should handle AWS Secrets Manager errors gracefully', async () => {
      mockSecretsManagerClient.send.mockRejectedValue(new Error('Secret not found'));

      const adminModule = await import('../../admin.js');
      
      await expect(adminModule.getAdminApp()).rejects.toThrow(
        /Failed to initialize Firebase Admin SDK with AWS Secrets Manager/
      );
    });

    it('should fallback to environment variables when AWS secrets fail', async () => {
      // First call fails (for Firebase secrets)
      mockSecretsManagerClient.send.mockRejectedValueOnce(new Error('Secret not found'));
      
      const adminModule = await import('../../admin.js');
      
      await expect(adminModule.getAdminApp()).rejects.toThrow();
      
      // Should attempt fallback to environment variables
      expect(mockInitializeApp).not.toHaveBeenCalled();
    });

    it('should validate required Firebase service account fields', async () => {
      mockSecretsManagerClient.send.mockResolvedValue({
        SecretString: JSON.stringify({
          type: 'service_account',
          project_id: 'test-staging-project',
          private_key: 'PLACEHOLDER', // Invalid placeholder value
          client_email: 'test@test-staging-project.iam.gserviceaccount.com'
        })
      });

      const adminModule = await import('../../admin.js');
      
      await expect(adminModule.getAdminApp()).rejects.toThrow(
        /Firebase service account missing or placeholder value for field: private_key/
      );
    });
  });

  describe('App Lifecycle Management', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'test';
    });

    it('should return existing app if already initialized', async () => {
      const existingApp = { name: 'adminApp', projectId: 'existing' };
      mockGetApps.mockReturnValue([existingApp]);
      mockGetApp.mockReturnValue(existingApp);

      const adminModule = await import('../../admin.js');
      const app = await adminModule.getAdminApp();

      expect(mockGetApp).toHaveBeenCalledWith('adminApp');
      expect(mockInitializeApp).not.toHaveBeenCalled();
    });

    it('should properly delete admin app', async () => {
      const existingApp = { name: 'adminApp' };
      mockGetApp.mockReturnValue(existingApp);
      mockDeleteApp.mockResolvedValue(undefined);

      const adminModule = await import('../../admin.js');
      await adminModule.deleteAdminApp();

      expect(mockDeleteApp).toHaveBeenCalledWith(existingApp);
    });

    it('should handle delete errors gracefully', async () => {
      mockGetApp.mockImplementation(() => {
        throw new Error('No Firebase App');
      });

      const adminModule = await import('../../admin.js');
      
      // Should not throw
      await expect(adminModule.deleteAdminApp()).resolves.toBeUndefined();
    });
  });

  describe('Test Environment Configuration', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'test';
      process.env.FIRESTORE_EMULATOR_HOST = 'localhost:5004';
      process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099';
      process.env.FIREBASE_STORAGE_EMULATOR_HOST = 'localhost:9199';
    });

    it('should configure emulator hosts for test environment', async () => {
      const adminModule = await import('../../admin.js');
      await adminModule.getAdminApp();

      expect(process.env.FIRESTORE_EMULATOR_HOST).toBe('localhost:5004');
      expect(process.env.FIREBASE_AUTH_EMULATOR_HOST).toBe('localhost:9099');
      expect(process.env.FIREBASE_STORAGE_EMULATOR_HOST).toBe('localhost:9199');
      expect(process.env.FIREBASE_PROJECT_ID).toBe('demo-test');
      expect(process.env.FIREBASE_STORAGE_BUCKET).toBe('demo-test.appspot.com');
    });
  });

  describe('Development Environment Configuration', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'development';
    });

    it('should throw error when GOOGLE_APPLICATION_CREDENTIALS is not set', async () => {
      delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
      
      const adminModule = await import('../../admin.js');
      
      await expect(adminModule.getAdminApp()).rejects.toThrow(
        'GOOGLE_APPLICATION_CREDENTIALS environment variable is not set.'
      );
    });

    it('should handle missing service account file', async () => {
      process.env.GOOGLE_APPLICATION_CREDENTIALS = '/nonexistent/path.json';
      mockFs.existsSync.mockReturnValue(false);
      
      const adminModule = await import('../../admin.js');
      
      await expect(adminModule.getAdminApp()).rejects.toThrow(
        'GOOGLE_APPLICATION_CREDENTIALS environment variable is not set.'
      );
    });

    it('should handle invalid JSON in service account file', async () => {
      process.env.GOOGLE_APPLICATION_CREDENTIALS = '/path/to/invalid.json';
      mockFs.readFileSync.mockReturnValue('invalid json');
      
      const adminModule = await import('../../admin.js');
      
      await expect(adminModule.getAdminApp()).rejects.toThrow(
        /Failed to load or parse Service Account Key/
      );
    });
  });
}); 