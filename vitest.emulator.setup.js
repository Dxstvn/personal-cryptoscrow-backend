/**
 * Firebase Emulator Setup for Vitest Integration Tests
 */

import { spawn } from 'child_process';
import { beforeAll, afterAll } from 'vitest';
import admin from 'firebase-admin';

let emulatorProcess = null;
let setupComplete = false;

// Firebase emulator ports from firebase.json
const EMULATOR_PORTS = {
  auth: 9099,
  firestore: 5004,
  storage: 9199,
  ui: 4000
};

// Test for port availability
function isPortInUse(port) {
  return new Promise((resolve) => {
    const net = require('net');
    const server = net.createServer();
    
    server.listen(port, () => {
      server.once('close', () => resolve(false));
      server.close();
    });
    
    server.on('error', () => resolve(true));
  });
}

// Wait for emulators to be ready
function waitForEmulators(timeout = 30000) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    
    const checkPorts = async () => {
      try {
        const authReady = await isPortInUse(EMULATOR_PORTS.auth);
        const firestoreReady = await isPortInUse(EMULATOR_PORTS.firestore);
        const storageReady = await isPortInUse(EMULATOR_PORTS.storage);
        
        if (authReady && firestoreReady && storageReady) {
          console.log('✅ All Firebase emulators are ready');
          resolve();
        } else if (Date.now() - startTime > timeout) {
          reject(new Error('Timeout waiting for Firebase emulators to start'));
        } else {
          setTimeout(checkPorts, 500);
        }
      } catch (error) {
        reject(error);
      }
    };
    
    checkPorts();
  });
}

// Start Firebase emulators
async function startEmulators() {
  if (setupComplete) return;
  
  console.log('🚀 Starting Firebase emulators for integration tests...');
  
  // Check if emulators are already running
  const authInUse = await isPortInUse(EMULATOR_PORTS.auth);
  const firestoreInUse = await isPortInUse(EMULATOR_PORTS.firestore);
  const storageInUse = await isPortInUse(EMULATOR_PORTS.storage);
  
  if (authInUse && firestoreInUse && storageInUse) {
    console.log('📱 Firebase emulators already running');
    setupComplete = true;
    return;
  }
  
  // Start emulators
  emulatorProcess = spawn('firebase', ['emulators:start', '--only', 'auth,firestore,storage', '--project', 'demo-test'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, FIREBASE_DEBUG: 'false' }
  });
  
  // Handle emulator output
  emulatorProcess.stdout.on('data', (data) => {
    const output = data.toString();
    if (process.env.EMULATOR_DEBUG) {
      console.log(`[Emulator] ${output}`);
    }
  });
  
  emulatorProcess.stderr.on('data', (data) => {
    const error = data.toString();
    if (error.includes('error') || error.includes('Error')) {
      console.error(`[Emulator Error] ${error}`);
    }
  });
  
  emulatorProcess.on('error', (error) => {
    console.error('Failed to start Firebase emulators:', error);
  });
  
  // Wait for emulators to be ready
  try {
    await waitForEmulators();
    setupComplete = true;
  } catch (error) {
    console.error('Error starting Firebase emulators:', error);
    throw error;
  }
}

// Stop Firebase emulators
function stopEmulators() {
  if (emulatorProcess) {
    console.log('🛑 Stopping Firebase emulators...');
    emulatorProcess.kill('SIGTERM');
    emulatorProcess = null;
  }
}

// Initialize Firebase Admin SDK for emulators
function initializeFirebaseAdmin() {
  // Set emulator environment variables
  process.env.FIRESTORE_EMULATOR_HOST = `localhost:${EMULATOR_PORTS.firestore}`;
  process.env.FIREBASE_AUTH_EMULATOR_HOST = `localhost:${EMULATOR_PORTS.auth}`;
  process.env.FIREBASE_STORAGE_EMULATOR_HOST = `localhost:${EMULATOR_PORTS.storage}`;
  
  // Test environment configuration
  process.env.NODE_ENV = 'test';
  process.env.FIREBASE_PROJECT_ID = 'demo-test';
  process.env.FIREBASE_STORAGE_BUCKET = 'demo-test.appspot.com';
  
  try {
    // Initialize Firebase Admin SDK for test environment
    if (!admin.apps.length) {
      admin.initializeApp({
        projectId: 'demo-test',
        storageBucket: 'demo-test.appspot.com'
      }, 'test-admin-app');
      
      console.log('✅ Firebase Admin SDK initialized for emulator testing');
    }
  } catch (error) {
    if (error.code !== 'app/duplicate-app') {
      console.error('Error initializing Firebase Admin SDK:', error);
      throw error;
    }
  }
}

// Setup function for integration tests
export async function setupFirebaseEmulators() {
  if (setupComplete) return;
  
  await startEmulators();
  initializeFirebaseAdmin();
  
  console.log('🧪 Firebase emulators ready for integration tests');
}

// Cleanup function
export function teardownFirebaseEmulators() {
  // Clean up Firebase apps
  const apps = admin.apps;
  if (apps.length > 0) {
    Promise.all(apps.map(app => admin.app(app.name).delete()))
      .then(() => console.log('✅ Firebase apps cleaned up'))
      .catch(error => console.error('Error cleaning up Firebase apps:', error));
  }
  
  stopEmulators();
  setupComplete = false;
}

// Global setup for integration tests
beforeAll(async () => {
  // Only set up emulators for integration tests
  if (process.env.TEST_TYPE === 'integration' || 
      process.argv.some(arg => arg.includes('integration'))) {
    await setupFirebaseEmulators();
  }
}, 60000); // 60 second timeout for emulator startup

afterAll(() => {
  if (process.env.TEST_TYPE === 'integration' || 
      process.argv.some(arg => arg.includes('integration'))) {
    teardownFirebaseEmulators();
  }
});

// Export utilities for tests
export {
  EMULATOR_PORTS,
  initializeFirebaseAdmin
};