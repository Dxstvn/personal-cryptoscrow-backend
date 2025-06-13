// Firestore configuration for E2E tests
import { initializeApp, getApps, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Configuration for E2E testing
const E2E_PROJECT_ID = 'test-project-e2e';

let firestoreInstance = null;
let adminApp = null;

export async function initializeFirestoreForE2E() {
  console.log('🔧 Initializing Firestore for E2E tests...');
  
  if (firestoreInstance) {
    console.log('✅ Firestore already initialized for E2E');
    return firestoreInstance;
  }

  try {
    // Clean up any existing apps first
    const existingApps = getApps();
    for (const app of existingApps) {
      if (app.name === 'e2e-admin-app') {
        console.log('🧹 Cleaning up existing E2E admin app...');
        await deleteApp(app);
      }
    }

    // Set emulator environment variables before initialization
    process.env.FIRESTORE_EMULATOR_HOST = 'localhost:5004';
    process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099';
    process.env.FIREBASE_PROJECT_ID = E2E_PROJECT_ID;

    // Initialize Firebase Admin app specifically for E2E tests
    adminApp = initializeApp({
      projectId: E2E_PROJECT_ID,
      storageBucket: `${E2E_PROJECT_ID}.appspot.com`
    }, 'e2e-admin-app');

    // Get Firestore instance
    firestoreInstance = getFirestore(adminApp);
    
    // Configure Firestore settings for emulator
    firestoreInstance.settings({
      host: 'localhost:5004',
      ssl: false,
      ignoreUndefinedProperties: true,
      merge: true
    });

    console.log('✅ Firestore initialized successfully for E2E tests');
    console.log(`   Project ID: ${E2E_PROJECT_ID}`);
    console.log(`   Emulator: localhost:5004`);
    
    return firestoreInstance;
  } catch (error) {
    console.error('❌ Failed to initialize Firestore for E2E:', error.message);
    throw error;
  }
}

export async function cleanupFirestoreForE2E() {
  console.log('🧹 Cleaning up Firestore for E2E tests...');
  
  try {
    if (adminApp) {
      await deleteApp(adminApp);
      adminApp = null;
    }
    firestoreInstance = null;
    console.log('✅ Firestore cleanup complete');
  } catch (error) {
    console.warn('⚠️ Warning during Firestore cleanup:', error.message);
  }
}

export function getFirestoreForE2E() {
  if (!firestoreInstance) {
    throw new Error('Firestore not initialized for E2E tests. Call initializeFirestoreForE2E() first.');
  }
  return firestoreInstance;
}

export function getAdminAppForE2E() {
  if (!adminApp) {
    throw new Error('Admin app not initialized for E2E tests. Call initializeFirestoreForE2E() first.');
  }
  return adminApp;
} 