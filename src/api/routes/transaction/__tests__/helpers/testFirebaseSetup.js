// Test Firebase setup helper
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

let testApp = null;
let testDb = null;
let testAuth = null;

export function initializeTestFirebase() {
  if (!testApp) {
    // Initialize Firebase with emulator settings
    process.env.FIRESTORE_EMULATOR_HOST = 'localhost:5004';
    process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099';
    
    testApp = initializeApp({
      projectId: 'demo-test',
      databaseURL: 'http://localhost:5004'
    }, 'test-app-' + Date.now());
    
    testDb = getFirestore(testApp);
    testAuth = getAuth(testApp);
  }
  
  return { app: testApp, db: testDb, auth: testAuth };
}

export function getTestApp() {
  if (!testApp) {
    throw new Error('Test app not initialized. Call initializeTestFirebase first.');
  }
  return testApp;
}

export function getTestDb() {
  if (!testDb) {
    throw new Error('Test db not initialized. Call initializeTestFirebase first.');
  }
  return testDb;
}

export function getTestAuth() {
  if (!testAuth) {
    throw new Error('Test auth not initialized. Call initializeTestFirebase first.');
  }
  return testAuth;
}

// Mock getAdminApp to return test app
export async function getAdminApp() {
  return getTestApp();
}

export function cleanupTestFirebase() {
  testApp = null;
  testDb = null;
  testAuth = null;
}