import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { initializeApp as initializeAdminApp } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
import 'dotenv/config';

// Common project ID for both client and admin SDKs
const PROJECT_ID = "demo-test";

// Firebase configuration for emulator - API key can be anything when using emulator
const firebaseConfig = {
  apiKey: "demo-api-key",
  authDomain: "localhost",
  projectId: PROJECT_ID,
  storageBucket: `${PROJECT_ID}.appspot.com`,
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef"
};

// Initialize Firebase app
const app = initializeApp(firebaseConfig, "testApp");

// Initialize Firebase Admin app with the same project ID
// For testing, we don't need credentials
const adminApp = initializeAdminApp({
  projectId: PROJECT_ID,
  storageBucket: `${PROJECT_ID}.appspot.com`
}, "adminTestApp");

// Connect client SDK to auth emulator
const auth = getAuth(app);
connectAuthEmulator(auth, "http://localhost:9099", { disableWarnings: false });

// Get Admin Auth instance - now safe to call after admin app initialization
const adminAuth = getAdminAuth(adminApp);
const adminFirestore = getAdminFirestore(adminApp);
adminFirestore.settings({
  host: 'localhost:5004',
  ssl: false,
});

// Log environment for debugging
console.log(`Auth Emulator Host: ${process.env.FIREBASE_AUTH_EMULATOR_HOST}`);
console.log(`Firestore Emulator Host: ${process.env.FIRESTORE_EMULATOR_HOST}`);
console.log(`Storage Emulator Host: ${process.env.FIREBASE_STORAGE_EMULATOR_HOST}`);
console.log(`Test Project ID: ${PROJECT_ID}`);


// Export initialized services
export {
  auth,
  adminAuth,
  adminFirestore,
  PROJECT_ID,
  adminApp
}; 