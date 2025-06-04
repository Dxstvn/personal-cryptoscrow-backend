import { initializeApp, getApps, deleteApp } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth"; // Import connectAuthEmulator
import { getStorage, connectStorageEmulator } from 'firebase/storage';
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import '../../../config/env.js';

// Use test configuration if we're in a test environment
const isTest = process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'e2e_test';

// In test mode, delete any existing default apps to prevent conflicts
if (isTest) {
  const existingApps = getApps();
  for (const app of existingApps) {
    if (app.name === '[DEFAULT]') {
      console.log('🧪 Deleting existing default Firebase app to prevent conflicts');
      await deleteApp(app);
    }
  }
}

// When using the Firebase Auth Emulator, API key validation is bypassed
// So we can use any value for the apiKey in test mode
const firebaseConfig = isTest ? {
  apiKey: "demo-api-key", // Any value works with emulator
  authDomain: "localhost",
  projectId: "demo-test", // Must match the project ID used by the admin SDK
  storageBucket: "demo-test.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef"
} : {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
  measurementId: process.env.FIREBASE_MEASUREMENT_ID
};

// Log the configuration being used for debugging
console.log(`🔧 Firebase Client SDK Config - isTest: ${isTest}, projectId: ${firebaseConfig.projectId}`);

// Initialize Firebase app with a specific name to avoid default app conflicts
export const ethEscrowApp = initializeApp(firebaseConfig, "ethEscrowApp");

// Connect to Auth emulator in test environment
if (isTest) {
  const auth = getAuth(ethEscrowApp);
  const storage = getStorage(ethEscrowApp);
  const firestore = getFirestore(ethEscrowApp);
  connectAuthEmulator(auth, "http://localhost:9099", { disableWarnings: true });
  connectStorageEmulator(storage, "localhost", 9199);
  connectFirestoreEmulator(firestore, 'localhost', 5004);
}