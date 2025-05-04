import { initializeApp, cert, getApp, getApps, deleteApp } from 'firebase-admin/app';
import 'dotenv/config';

// Use test configuration if we're in a test environment
const isTest = process.env.NODE_ENV === 'test';
const appName = "adminApp"; // Define app name

// Function to initialize or get the admin app
function initializeAdmin() {
  // Check if the app already exists
  if (getApps().find(app => app.name === appName)) {
    return getApp(appName);
  }

  // Initialize Firebase Admin app
  const options = isTest
    ? { // Test configuration
        projectId: "demo-test",
        // *** ADD storageBucket for testing ***
        storageBucket: "demo-test.appspot.com"
      }
    : { // Production configuration
        credential: cert(process.env.GOOGLE_APPLICATION_CREDENTIALS),
        projectId: process.env.FIREBASE_PROJECT_ID,
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET // Ensure this is set for production too
      };

  return initializeApp(options, appName);
}

export const adminApp = initializeAdmin();

// Optional: Function to clean up the admin app (useful for testing teardown)
export async function deleteAdminApp() {
  try {
    const appToDelete = getApp(appName);
    await deleteApp(appToDelete);
  } catch (error) {
    // Ignore if app doesn't exist
    // console.warn(`Could not delete admin app "${appName}": ${error.message}`);
  }
}