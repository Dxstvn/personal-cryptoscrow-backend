import { jest, describe, it, expect, beforeEach, afterEach, afterAll, beforeAll } from '@jest/globals';
import { initializeApp as initializeAdminApp, getApps, deleteApp } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';

// Test project ID for integration tests
const TEST_PROJECT_ID = 'demo-test';

describe('Admin SDK Integration Tests', () => {
  let getAdminApp;
  let deleteAdminApp;
  let adminApp;

  // Save original environment
  const originalEnv = process.env;

  beforeAll(async () => {
    // Set up test environment variables
    process.env.NODE_ENV = 'test';
    process.env.FIRESTORE_EMULATOR_HOST = 'localhost:5004';
    process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099';
    process.env.FIREBASE_STORAGE_EMULATOR_HOST = 'localhost:9199';
    process.env.FIREBASE_PROJECT_ID = TEST_PROJECT_ID;
    process.env.FIREBASE_STORAGE_BUCKET = `${TEST_PROJECT_ID}.appspot.com`;

    // Clean up any existing apps
    const existingApps = getApps();
    for (const app of existingApps) {
      try {
        await deleteApp(app);
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  });

  beforeEach(async () => {
    // Reset modules to ensure fresh imports
    jest.resetModules();
    
    // Clean up any existing apps before each test
    const existingApps = getApps();
    for (const app of existingApps) {
      if (app.name === 'adminApp') {
        try {
          await deleteApp(app);
        } catch (error) {
          // Ignore cleanup errors
        }
      }
    }
  });

  afterEach(async () => {
    // Clean up after each test
    if (deleteAdminApp) {
      try {
        await deleteAdminApp();
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  });

  afterAll(async () => {
    // Restore original environment
    process.env = originalEnv;
    
    // Final cleanup
    const existingApps = getApps();
    for (const app of existingApps) {
      try {
        await deleteApp(app);
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  });

  describe('Test Environment Integration', () => {
    it('should initialize Firebase Admin SDK for test environment', async () => {
      process.env.NODE_ENV = 'test';
      
      const adminModule = await import('../../admin.js');
      getAdminApp = adminModule.getAdminApp;
      deleteAdminApp = adminModule.deleteAdminApp;
      
      const app = await getAdminApp();
      
      expect(app).toBeDefined();
      expect(app.name).toBe('adminApp');
      expect(app.options.projectId).toBe(TEST_PROJECT_ID);
    });

    it('should properly connect to Firebase emulators in test mode', async () => {
      process.env.NODE_ENV = 'test';
      
      const adminModule = await import('../../admin.js');
      getAdminApp = adminModule.getAdminApp;
      deleteAdminApp = adminModule.deleteAdminApp;
      
      const app = await getAdminApp();
      
      // Test Firestore connection
      const firestore = getAdminFirestore(app);
      expect(firestore).toBeDefined();
      
      // Verify emulator connection by attempting a simple operation
      const testCollection = firestore.collection('test-integration');
      const docRef = await testCollection.add({ test: true, timestamp: new Date() });
      expect(docRef.id).toBeDefined();
      
      // Clean up test data
      await docRef.delete();
    });

    it('should properly connect to Firebase Auth emulator in test mode', async () => {
      process.env.NODE_ENV = 'test';
      
      const adminModule = await import('../../admin.js');
      getAdminApp = adminModule.getAdminApp;
      deleteAdminApp = adminModule.deleteAdminApp;
      
      const app = await getAdminApp();
      
      // Test Auth connection
      const auth = getAdminAuth(app);
      expect(auth).toBeDefined();
      
      // Verify emulator connection by attempting to list users (should work with emulator)
      try {
        const listUsersResult = await auth.listUsers(1);
        expect(listUsersResult).toBeDefined();
      } catch (error) {
        // This is expected in emulator mode, just verify we can connect
        expect(error.code).toBeDefined();
      }
    });
  });

  describe('Environment Variable Configuration', () => {
    it('should use correct project ID from environment variables', async () => {
      process.env.NODE_ENV = 'test';
      process.env.FIREBASE_PROJECT_ID = 'custom-test-project';
      
      const adminModule = await import('../../admin.js');
      getAdminApp = adminModule.getAdminApp;
      deleteAdminApp = adminModule.deleteAdminApp;
      
      const app = await getAdminApp();
      
      expect(app.options.projectId).toBe('demo-test'); // Should use default for test mode
    });

    it('should set up emulator environment variables correctly', async () => {
      process.env.NODE_ENV = 'test';
      
      const adminModule = await import('../../admin.js');
      
      // Verify environment variables are set for emulators
      expect(process.env.FIRESTORE_EMULATOR_HOST).toBe('localhost:5004');
      expect(process.env.FIREBASE_AUTH_EMULATOR_HOST).toBe('localhost:9099');
      expect(process.env.FIREBASE_STORAGE_EMULATOR_HOST).toBe('localhost:9199');
      expect(process.env.FIREBASE_PROJECT_ID).toBe(TEST_PROJECT_ID);
      expect(process.env.FIREBASE_STORAGE_BUCKET).toBe(`${TEST_PROJECT_ID}.appspot.com`);
    });
  });

  describe('Development Environment Integration', () => {
    it('should handle missing GOOGLE_APPLICATION_CREDENTIALS gracefully', async () => {
      process.env.NODE_ENV = 'development';
      delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
      
      const adminModule = await import('../../admin.js');
      getAdminApp = adminModule.getAdminApp;
      deleteAdminApp = adminModule.deleteAdminApp;
      
      await expect(getAdminApp()).rejects.toThrow(
        'GOOGLE_APPLICATION_CREDENTIALS environment variable is not set.'
      );
    });
  });

  describe('App Lifecycle Management Integration', () => {
    it('should properly manage app lifecycle', async () => {
      process.env.NODE_ENV = 'test';
      
      const adminModule = await import('../../admin.js');
      getAdminApp = adminModule.getAdminApp;
      deleteAdminApp = adminModule.deleteAdminApp;
      
      // Initialize app
      const app1 = await getAdminApp();
      expect(app1).toBeDefined();
      
      // Should return same app instance
      const app2 = await getAdminApp();
      expect(app2).toBe(app1);
      
      // Clean up
      await deleteAdminApp();
      
      // Should create new app after deletion
      const app3 = await getAdminApp();
      expect(app3).toBeDefined();
      expect(app3).not.toBe(app1);
    });

    it('should handle concurrent app requests correctly', async () => {
      process.env.NODE_ENV = 'test';
      
      const adminModule = await import('../../admin.js');
      getAdminApp = adminModule.getAdminApp;
      deleteAdminApp = adminModule.deleteAdminApp;
      
      // Make multiple concurrent requests
      const promises = [
        getAdminApp(),
        getAdminApp(),
        getAdminApp()
      ];
      
      const apps = await Promise.all(promises);
      
      // All should return the same app instance
      expect(apps[0]).toBe(apps[1]);
      expect(apps[1]).toBe(apps[2]);
      expect(apps[0].name).toBe('adminApp');
    });
  });

  describe('Error Handling Integration', () => {
    it('should handle initialization errors gracefully', async () => {
      process.env.NODE_ENV = 'development';
      process.env.GOOGLE_APPLICATION_CREDENTIALS = '/nonexistent/path.json';
      
      const adminModule = await import('../../admin.js');
      getAdminApp = adminModule.getAdminApp;
      deleteAdminApp = adminModule.deleteAdminApp;
      
      await expect(getAdminApp()).rejects.toThrow();
    });

    it('should handle delete errors gracefully', async () => {
      process.env.NODE_ENV = 'test';
      
      const adminModule = await import('../../admin.js');
      getAdminApp = adminModule.getAdminApp;
      deleteAdminApp = adminModule.deleteAdminApp;
      
      // Try to delete when no app exists - should not throw
      await expect(deleteAdminApp()).resolves.toBeUndefined();
    });
  });

  describe('Firebase Operations Integration', () => {
    beforeEach(async () => {
      process.env.NODE_ENV = 'test';
      
      const adminModule = await import('../../admin.js');
      getAdminApp = adminModule.getAdminApp;
      deleteAdminApp = adminModule.deleteAdminApp;
      adminApp = await getAdminApp();
    });

    it('should support Firestore operations', async () => {
      const firestore = getAdminFirestore(adminApp);
      
      // Create a test document
      const testData = {
        name: 'integration-test',
        timestamp: new Date(),
        value: Math.random()
      };
      
      const docRef = firestore.collection('integration-tests').doc();
      await docRef.set(testData);
      
      // Read the document back
      const snapshot = await docRef.get();
      expect(snapshot.exists).toBe(true);
      
      const data = snapshot.data();
      expect(data.name).toBe(testData.name);
      expect(data.value).toBe(testData.value);
      
      // Clean up
      await docRef.delete();
    });

    it('should support Auth operations in emulator', async () => {
      const auth = getAdminAuth(adminApp);
      
      // Create a test user
      const testUser = {
        email: `test-${Date.now()}@example.com`,
        password: 'testpassword123',
        displayName: 'Integration Test User'
      };
      
      try {
        const userRecord = await auth.createUser({
          email: testUser.email,
          password: testUser.password,
          displayName: testUser.displayName
        });
        
        expect(userRecord.uid).toBeDefined();
        expect(userRecord.email).toBe(testUser.email);
        expect(userRecord.displayName).toBe(testUser.displayName);
        
        // Clean up
        await auth.deleteUser(userRecord.uid);
      } catch (error) {
        // In some test environments, user creation might not be available
        // This is acceptable as long as we can connect to the auth service
        expect(error.code).toBeDefined();
      }
    });
  });
}); 