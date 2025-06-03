import '../../../config/env.js';

// Set emulator configuration BEFORE any Firebase imports
const isTest = process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'e2e_test';
const isProduction = process.env.NODE_ENV === 'production';

if (isTest) {
  // Ensure Admin SDK uses emulators
  process.env.FIRESTORE_EMULATOR_HOST = 'localhost:5004';
  process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099';
}

import { initializeApp, cert, getApp, getApps, deleteApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import fs from 'fs';
import awsSecretsManager from '../../../config/awsSecretsManager.js';

const appName = "adminApp";

// Function to initialize or get the admin app
async function initializeAdmin() {
  console.log(`Initializing Admin SDK. NODE_ENV='${process.env.NODE_ENV}', isTest=${isTest}, isProduction=${isProduction}`);

  if (getApps().find(app => app.name === appName)) {
    console.log(`Admin app "${appName}" already exists. Returning existing instance.`);
    return getApp(appName);
  }

  let options;

  if (isTest) {
    console.log("Using Test configuration for Admin SDK with emulators.");
    options = {
      projectId: "demo-test",
      storageBucket: "demo-test.appspot.com"
    };
  } else if (isProduction && process.env.USE_AWS_SECRETS === 'true') {
    console.log("Using Production configuration for Admin SDK with AWS Secrets Manager.");
    
    // In production with AWS Secrets Manager, try to get Firebase service account
    try {
      const firebaseServiceAccount = await awsSecretsManager.getFirebaseServiceAccount();
      
      if (!firebaseServiceAccount || !firebaseServiceAccount.project_id || !firebaseServiceAccount.private_key || !firebaseServiceAccount.client_email) {
        throw new Error('Firebase service account is missing required fields from AWS Secrets Manager');
      }
      
      options = {
        credential: cert(firebaseServiceAccount),
        projectId: firebaseServiceAccount.project_id,
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET || firebaseServiceAccount.project_id + '.appspot.com'
      };
      console.log("Firebase Admin SDK initialized with service account from AWS Secrets Manager.");
    } catch (secretsManagerError) {
      console.warn(`Failed to get Firebase service account from AWS Secrets Manager: ${secretsManagerError.message}`);
      console.log("Attempting fallback to environment variables for Firebase configuration...");
      
      // Fallback to environment variables
      try {
        if (!process.env.FIREBASE_PROJECT_ID) {
          throw new Error('FIREBASE_PROJECT_ID environment variable is required when Firebase service account is not in AWS Secrets Manager');
        }
        
        // Use Application Default Credentials or environment-based initialization
        options = {
          projectId: process.env.FIREBASE_PROJECT_ID,
          storageBucket: process.env.FIREBASE_STORAGE_BUCKET || process.env.FIREBASE_PROJECT_ID + '.appspot.com'
        };
        
        // If we have a service account file path, use it
        if (process.env.GOOGLE_APPLICATION_CREDENTIALS && fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
          console.log("Using GOOGLE_APPLICATION_CREDENTIALS file for Firebase authentication.");
          const serviceAccount = JSON.parse(fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8'));
          options.credential = cert(serviceAccount);
        } else {
          console.log("Using Application Default Credentials for Firebase authentication.");
          // Firebase Admin SDK will automatically use Application Default Credentials
          // This works in environments like Google Cloud Run, App Engine, etc.
        }
        
        console.log("Firebase Admin SDK initialized with environment variables fallback.");
      } catch (fallbackError) {
        console.error("Fallback to environment variables also failed:", fallbackError.message);
        throw new Error(`Failed to initialize Firebase Admin SDK with AWS Secrets Manager: ${secretsManagerError.message}. Fallback to environment variables also failed: ${fallbackError.message}. Please ensure either the Firebase service account is properly configured in AWS Secrets Manager, or FIREBASE_PROJECT_ID and GOOGLE_APPLICATION_CREDENTIALS are set.`);
      }
    }
  } else {
    console.log("Using Development configuration for Admin SDK with local service account file.");
    const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (!serviceAccountPath) {
      throw new Error("GOOGLE_APPLICATION_CREDENTIALS environment variable is not set.");
    }
    
    try {
      const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
      options = {
        credential: cert(serviceAccount),
        projectId: serviceAccount.project_id,
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET
      };
    } catch (e) {
      throw new Error(`Failed to load or parse Service Account Key: ${e.message}`);
    }
  }

  console.log(`Initializing admin app "${appName}" with project ID:`, options.projectId);
  return initializeApp(options, appName);
}

// Lazy initialization cache
let adminAppPromise = null;

// Async function to get admin app
async function getAdminApp() {
  if (!adminAppPromise) {
    adminAppPromise = initializeAdmin();
  }
  return await adminAppPromise;
}

// For backward compatibility, export a synchronous version for non-production environments
let adminApp;
if (isTest || (!isProduction || process.env.USE_AWS_SECRETS !== 'true')) {
  // For test or development environments, initialize synchronously using the old approach
  console.log("Using synchronous initialization for development/test environment.");
  try {
    // Use the synchronous version for development
    if (isTest) {
      adminApp = initializeApp({
        projectId: "demo-test",
        storageBucket: "demo-test.appspot.com"
      }, appName);
    } else {
      const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
      if (serviceAccountPath && fs.existsSync(serviceAccountPath)) {
        const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
        adminApp = initializeApp({
          credential: cert(serviceAccount),
          projectId: serviceAccount.project_id,
          storageBucket: process.env.FIREBASE_STORAGE_BUCKET
        }, appName);
      } else {
        console.warn("GOOGLE_APPLICATION_CREDENTIALS not found. Will initialize when first accessed.");
      }
    }
  } catch (error) {
    console.warn('Warning: Synchronous admin app initialization failed:', error.message);
    console.log('Admin app will be initialized asynchronously when first accessed.');
  }
} else {
  console.log("Production mode detected. Admin app will be initialized asynchronously when first accessed.");
}

export { adminApp, getAdminApp };

// Optional: Function to clean up the admin app
export async function deleteAdminApp() {
    try {
        const appToDelete = getApp(appName);
        await deleteApp(appToDelete);
        console.log(`Admin app "${appName}" deleted.`);
    } catch (error) {
        if (!error.message.includes("No Firebase App") && !error.message.includes("already deleted")) {
            console.warn(`Could not delete admin app "${appName}": ${error.message}`);
        }
    }
}