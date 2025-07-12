/**
 * Firebase Emulator Integration Test
 * Verifies that Firebase emulators are working correctly with Vitest
 */

import { describe, it, expect, beforeAll } from 'vitest';
import admin from 'firebase-admin';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

describe('Firebase Emulator Integration Tests', () => {
  let adminApp;
  let adminAuth;
  let adminFirestore;

  beforeAll(async () => {
    // Verify test environment
    expect(process.env.NODE_ENV).toBe('test');
    expect(process.env.FIRESTORE_EMULATOR_HOST).toBeDefined();
    expect(process.env.FIREBASE_AUTH_EMULATOR_HOST).toBeDefined();
    
    // Get Firebase Admin app
    try {
      adminApp = admin.app('test-admin-app');
    } catch (error) {
      // If app doesn't exist, create it
      adminApp = admin.initializeApp({
        projectId: 'demo-test',
        storageBucket: 'demo-test.appspot.com'
      }, 'test-admin-app');
    }
    
    adminAuth = getAuth(adminApp);
    adminFirestore = getFirestore(adminApp);
  });

  describe('Firebase Auth Emulator', () => {
    it('should create and verify a test user', async () => {
      const testEmail = `test-${Date.now()}@example.com`;
      const testPassword = 'testPassword123';

      // Create user
      const userRecord = await adminAuth.createUser({
        email: testEmail,
        password: testPassword,
        emailVerified: true
      });

      expect(userRecord.uid).toBeDefined();
      expect(userRecord.email).toBe(testEmail);

      // Verify user exists
      const retrievedUser = await adminAuth.getUser(userRecord.uid);
      expect(retrievedUser.email).toBe(testEmail);

      // Clean up
      await adminAuth.deleteUser(userRecord.uid);
    });

    it('should handle authentication errors', async () => {
      await expect(
        adminAuth.getUser('non-existent-uid')
      ).rejects.toThrow();
    });
  });

  describe('Firestore Emulator', () => {
    it('should create and read a document', async () => {
      const testCollection = 'test-collection';
      const testDocId = `test-doc-${Date.now()}`;
      const testData = {
        name: 'Test Document',
        value: 42,
        timestamp: admin.firestore.Timestamp.now()
      };

      // Create document
      await adminFirestore.collection(testCollection).doc(testDocId).set(testData);

      // Read document
      const docSnapshot = await adminFirestore.collection(testCollection).doc(testDocId).get();
      
      expect(docSnapshot.exists).toBe(true);
      const retrievedData = docSnapshot.data();
      expect(retrievedData.name).toBe(testData.name);
      expect(retrievedData.value).toBe(testData.value);

      // Clean up
      await adminFirestore.collection(testCollection).doc(testDocId).delete();
    });

    it('should support Firestore queries', async () => {
      const testCollection = 'test-queries';
      
      // Add test documents
      const docs = [
        { name: 'doc1', value: 10 },
        { name: 'doc2', value: 20 },
        { name: 'doc3', value: 30 }
      ];

      const batch = adminFirestore.batch();
      docs.forEach((doc, index) => {
        const docRef = adminFirestore.collection(testCollection).doc(`doc-${index}`);
        batch.set(docRef, doc);
      });
      await batch.commit();

      // Query documents
      const querySnapshot = await adminFirestore
        .collection(testCollection)
        .where('value', '>=', 20)
        .get();

      expect(querySnapshot.size).toBe(2);

      // Clean up
      const deleteBatch = adminFirestore.batch();
      querySnapshot.docs.forEach(doc => {
        deleteBatch.delete(doc.ref);
      });
      await deleteBatch.commit();
    });

    it('should support transactions', async () => {
      const testCollection = 'test-transactions';
      const docRef = adminFirestore.collection(testCollection).doc('counter');

      // Initialize counter
      await docRef.set({ count: 0 });

      // Run transaction
      await adminFirestore.runTransaction(async (transaction) => {
        const doc = await transaction.get(docRef);
        const currentCount = doc.data().count;
        transaction.update(docRef, { count: currentCount + 1 });
      });

      // Verify result
      const finalDoc = await docRef.get();
      expect(finalDoc.data().count).toBe(1);

      // Clean up
      await docRef.delete();
    });
  });

  describe('Emulator Configuration', () => {
    it('should have correct emulator environment variables', () => {
      expect(process.env.FIRESTORE_EMULATOR_HOST).toBe('localhost:5004');
      expect(process.env.FIREBASE_AUTH_EMULATOR_HOST).toBe('localhost:9099');
      expect(process.env.FIREBASE_STORAGE_EMULATOR_HOST).toBe('localhost:9199');
    });

    it('should have test Firebase project configuration', () => {
      expect(process.env.FIREBASE_PROJECT_ID).toBe('demo-test');
      expect(process.env.FIREBASE_STORAGE_BUCKET).toBe('demo-test.appspot.com');
    });

    it('should verify emulator connectivity', async () => {
      // This test verifies that we can communicate with the emulators
      const testDoc = await adminFirestore.collection('connectivity-test').add({
        timestamp: admin.firestore.Timestamp.now(),
        test: 'emulator-connectivity'
      });

      expect(testDoc.id).toBeDefined();

      // Clean up
      await testDoc.delete();
    });
  });
});