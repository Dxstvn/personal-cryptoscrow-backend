import { initializeApp, cert, getApp, getApps, deleteApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import 'dotenv/config';
import fs from 'fs';

const isTest = process.env.NODE_ENV === 'test';
const appName = "adminApp";

// Function to initialize or get the admin app
function initializeAdmin() {
  console.log(`Initializing Admin SDK. NODE_ENV='${process.env.NODE_ENV}', isTest=${isTest}`);

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
  } else {
    console.log("Using Production configuration for Admin SDK.");
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

  console.log(`Initializing admin app "${appName}" with options:`, options);
  return initializeApp(options, appName);
}

export const adminApp = initializeAdmin();

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