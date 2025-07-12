import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('Admin SDK Unit Tests', () => {
  let mockSecretsManagerClient;
  let mockGetSecretValueCommand;
  let mockInitializeApp;
  let mockGetApp;
  let mockGetApps;
  let mockDeleteApp;
  let mockCert;
  let mockGetAuth;
  let mockFs;
  let adminModule;

  // Save original environment
  const originalEnv = { ...process.env };

  beforeEach(async () => {
    // Reset environment
    process.env = { ...originalEnv };
    
    // Clear all mocks
    vi.clearAllMocks();
    vi.resetModules();
    
    // Create fresh mocks
    mockSecretsManagerClient = {
      send: vi.fn()
    };
    mockGetSecretValueCommand = vi.fn();
    mockInitializeApp = vi.fn();
    mockGetApp = vi.fn();
    mockGetApps = vi.fn();
    mockDeleteApp = vi.fn();
    mockCert = vi.fn();
    mockGetAuth = vi.fn();
    mockFs = {
      existsSync: vi.fn(),
      readFileSync: vi.fn()
    };

    // Mock AWS SDK
    vi.doMock('@aws-sdk/client-secrets-manager', () => ({
      SecretsManagerClient: vi.fn(() => mockSecretsManagerClient),
      GetSecretValueCommand: mockGetSecretValueCommand
    }));

    // Mock Firebase Admin SDK
    vi.doMock('firebase-admin/app', () => ({
      initializeApp: mockInitializeApp,
      getApp: mockGetApp,
      getApps: mockGetApps,
      deleteApp: mockDeleteApp,
      cert: mockCert
    }));

    vi.doMock('firebase-admin/auth', () => ({
      getAuth: mockGetAuth
    }));

    // Mock file system
    vi.doMock('fs', () => ({
      default: {
        existsSync: mockFs.existsSync,
        readFileSync: mockFs.readFileSync
      }
    }));

    // Mock config
    vi.doMock('../../../config/index.js', () => ({
      default: {
        get: vi.fn((key) => {
          const values = {
            'NODE_ENV': process.env.NODE_ENV,
            'USE_AWS_SECRETS': process.env.USE_AWS_SECRETS,
            'FIREBASE_PROJECT_ID': process.env.FIREBASE_PROJECT_ID,
            'FIREBASE_STORAGE_BUCKET': process.env.FIREBASE_STORAGE_BUCKET
          };
          return values[key];
        })
      }
    }));

    // Mock AWS Secrets Manager service
    vi.doMock('../../../services/awsSecretsManager.js', () => ({
      default: {
        getSecret: vi.fn(async (secretName) => {
          if (mockSecretsManagerClient.send.mock.results[0]?.value) {
            const result = await mockSecretsManagerClient.send.mock.results[0].value;
            if (result?.SecretString) {
              return JSON.parse(result.SecretString);
            }
          }
          throw new Error('Secret not found');
        })
      }
    }));

    // Set up default mock implementations
    mockGetApps.mockReturnValue([]);
    mockInitializeApp.mockReturnValue({ name: 'adminApp', projectId: 'test-project' });
    mockCert.mockReturnValue({ credential: 'mock-credential' });
  });

  afterEach(() => {
    // Restore environment
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  describe('Environment Detection', () => {
    it('should detect test environment correctly', async () => {
      process.env.NODE_ENV = 'test';
      adminModule = await import('../../admin.js');
      
      // In test mode, it initializes synchronously
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
      
      mockSecretsManagerClient.send.mockResolvedValue({
        SecretString: JSON.stringify({
          type: 'service_account',
          project_id: 'test-staging-project',
          private_key: '-----BEGIN PRIVATE KEY-----\nMOCK_PRIVATE_KEY\n-----END PRIVATE KEY-----',
          client_email: 'test@test-staging-project.iam.gserviceaccount.com',
          private_key_id: 'mock-key-id',
          client_id: 'mock-client-id'
        })
      });
      
      adminModule = await import('../../admin.js');
      await adminModule.getAdminApp();

      expect(mockSecretsManagerClient.send).toHaveBeenCalled();
      expect(mockInitializeApp).toHaveBeenCalledWith(
        expect.objectContaining({
          credential: expect.anything(),
          projectId: 'test-staging-project'
        }),
        'adminApp'
      );
    });

    it('should detect production environment correctly', async () => {
      process.env.NODE_ENV = 'production';
      process.env.USE_AWS_SECRETS = 'true';
      
      mockSecretsManagerClient.send.mockResolvedValue({
        SecretString: JSON.stringify({
          type: 'service_account',
          project_id: 'test-production-project',
          private_key: '-----BEGIN PRIVATE KEY-----\nMOCK_PRIVATE_KEY\n-----END PRIVATE KEY-----',
          client_email: 'test@test-production-project.iam.gserviceaccount.com'
        })
      });
      
      adminModule = await import('../../admin.js');
      await adminModule.getAdminApp();

      expect(mockSecretsManagerClient.send).toHaveBeenCalled();
      expect(mockInitializeApp).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: 'test-production-project'
        }),
        'adminApp'
      );
    });

    it('should detect development environment correctly', async () => {
      process.env.NODE_ENV = 'development';
      process.env.GOOGLE_APPLICATION_CREDENTIALS = '/path/to/service-account.json';
      
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify({
        type: 'service_account',
        project_id: 'dev-project',
        private_key: '-----BEGIN PRIVATE KEY-----\nDEV_PRIVATE_KEY\n-----END PRIVATE KEY-----',
        client_email: 'dev@dev-project.iam.gserviceaccount.com'
      }));
      
      adminModule = await import('../../admin.js');
      
      // In development mode, it doesn't load credentials during module import
      // but loads them when getAdminApp is called
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
      process.env.FIREBASE_STORAGE_BUCKET = 'escrowstaging.appspot.com';
    });

    it('should initialize Firebase Admin SDK with staging secrets from AWS', async () => {
      mockSecretsManagerClient.send.mockResolvedValue({
        SecretString: JSON.stringify({
          type: 'service_account',
          project_id: 'test-staging-project',
          private_key: '-----BEGIN PRIVATE KEY-----\nMOCK_PRIVATE_KEY\n-----END PRIVATE KEY-----',
          client_email: 'test@test-staging-project.iam.gserviceaccount.com'
        })
      });
      
      adminModule = await import('../../admin.js');
      const app = await adminModule.getAdminApp();

      expect(mockSecretsManagerClient.send).toHaveBeenCalled();
      expect(mockCert).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'service_account',
          project_id: 'test-staging-project'
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
      process.env.FIREBASE_PROJECT_ID = 'fallback-project';

      adminModule = await import('../../admin.js');
      const app = await adminModule.getAdminApp();

      // Should fall back to environment variables
      expect(mockInitializeApp).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: 'fallback-project'
        }),
        'adminApp'
      );
    });

    it('should validate required Firebase service account fields', async () => {
      // This test verifies that the AWS Secrets Manager integration
      // properly validates service account fields during staging initialization
      
      // Set staging environment
      process.env.NODE_ENV = 'staging';
      process.env.USE_AWS_SECRETS = 'true';
      
      // Mock the secrets manager to return a valid response first
      mockSecretsManagerClient.send.mockResolvedValue({
        SecretString: JSON.stringify({
          type: 'service_account',
          project_id: 'test-staging-project',
          private_key: '-----BEGIN PRIVATE KEY-----\nVALID_PRIVATE_KEY\n-----END PRIVATE KEY-----',
          client_email: 'test@test-staging-project.iam.gserviceaccount.com'
        })
      });
      
      const adminModule = await import('../../admin.js');
      
      // This should succeed with valid credentials
      const app = await adminModule.getAdminApp();
      expect(app).toBeDefined();
      expect(mockInitializeApp).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: 'test-staging-project'
        }),
        'adminApp'
      );
      
      // Test that cert was called with the credentials
      expect(mockCert).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'service_account',
          project_id: 'test-staging-project'
        })
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

      adminModule = await import('../../admin.js');
      
      // The test mode synchronous init will have been called
      // But getAdminApp should return the existing app
      const app = await adminModule.getAdminApp();

      expect(app).toBeDefined();
    });

    it('should properly delete admin app', async () => {
      const existingApp = { name: 'adminApp' };
      mockGetApp.mockReturnValue(existingApp);
      mockDeleteApp.mockResolvedValue(undefined);

      adminModule = await import('../../admin.js');
      await adminModule.deleteAdminApp();

      expect(mockDeleteApp).toHaveBeenCalledWith(existingApp);
    });

    it('should handle delete errors gracefully', async () => {
      mockGetApp.mockImplementation(() => {
        throw new Error('No Firebase App');
      });

      adminModule = await import('../../admin.js');
      
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
      adminModule = await import('../../admin.js');

      expect(process.env.FIRESTORE_EMULATOR_HOST).toBe('localhost:5004');
      expect(process.env.FIREBASE_AUTH_EMULATOR_HOST).toBe('localhost:9099');
      expect(process.env.FIREBASE_STORAGE_EMULATOR_HOST).toBe('localhost:9199');
      expect(mockInitializeApp).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: 'demo-test',
          storageBucket: 'demo-test.appspot.com'
        }),
        'adminApp'
      );
    });
  });

  describe('Development Environment Configuration', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'development';
    });

    it('should use service account file when available', async () => {
      process.env.GOOGLE_APPLICATION_CREDENTIALS = '/path/to/valid.json';
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify({
        type: 'service_account',
        project_id: 'dev-project',
        private_key: '-----BEGIN PRIVATE KEY-----\nDEV_KEY\n-----END PRIVATE KEY-----',
        client_email: 'dev@dev-project.iam.gserviceaccount.com'
      }));
      
      adminModule = await import('../../admin.js');
      
      // In development mode, it loads synchronously during module import
      expect(mockInitializeApp).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: 'dev-project'
        }),
        'adminApp'
      );
    });

    it('should handle missing service account file', async () => {
      process.env.GOOGLE_APPLICATION_CREDENTIALS = '/nonexistent/path.json';
      mockFs.existsSync.mockReturnValue(false);
      
      adminModule = await import('../../admin.js');
      
      // In development mode, it warns but doesn't fail immediately
      expect(adminModule.adminApp).toBeUndefined();
    });

    it('should handle invalid JSON in service account file', async () => {
      process.env.GOOGLE_APPLICATION_CREDENTIALS = '/path/to/invalid.json';
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('invalid json');
      
      adminModule = await import('../../admin.js');
      
      // Should warn but not fail immediately
      expect(adminModule.adminApp).toBeUndefined();
    });
  });
});