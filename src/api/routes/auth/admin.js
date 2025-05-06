import { initializeApp, cert, getApp, getApps, deleteApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth'; // *** ADD THIS LINE ***
import 'dotenv/config';
import fs from 'fs';

const isTest = process.env.NODE_ENV === 'test';
const appName = "adminApp";

// Function to initialize or get the admin app
function initializeAdmin() {
  console.log(`Initializing Admin SDK. NODE_ENV='${process.env.NODE_ENV}', isTest=${isTest}`); // Log environment

  if (getApps().find(app => app.name === appName)) {
    console.log(`Admin app "${appName}" already exists. Returning existing instance.`);
    return getApp(appName);
  }

  let options;
  let usingServiceAccount = false;

  if (isTest) {
    console.log("Using Test configuration for Admin SDK.");
    options = {
        projectId: "demo-test",
        storageBucket: "demo-test.appspot.com" // Keep consistent with previous fix
    };
  } else {
    console.log("Using Production configuration for Admin SDK.");
    const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (!serviceAccountPath) {
        console.error("FATAL ERROR: GOOGLE_APPLICATION_CREDENTIALS environment variable is not set.");
         process.exit(1); // Exit if credentials are required but not found
    }
    console.log(`Attempting to load Service Account from: ${serviceAccountPath}`);
    try {
        // Dynamically require the service account key JSON file
        // NOTE: Using require might cause issues with ES Modules. If so, use fs:
        // import fs from 'fs';
        // const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
        const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8')); // Use this if your setup allows it

        console.log(`Service Account loaded successfully.`);
        options = {
            credential: cert(serviceAccount), // Pass the loaded object/path
            projectId: serviceAccount.project_id, // Explicitly use project ID from file
            storageBucket: process.env.FIREBASE_STORAGE_BUCKET // Add production bucket if needed
        };
        usingServiceAccount = true;
    } catch (e) {
        console.error(`FATAL ERROR: Failed to load or parse Service Account Key from ${serviceAccountPath}. Error: ${e.message}`);
        process.exit(1); // Exit on critical configuration error
    }
  }

  console.log(`Initializing admin app "${appName}" with options:`, options);
  const newApp = initializeApp(options, appName);

  // Check if initialization appears successful (only log extra details for non-test)
  if (!isTest && usingServiceAccount) {
       try {
           const authCheck = getAuth(newApp); // *** This line should now work ***
           console.log(`Admin app "${appName}" initialized successfully using Service Account.`);
       } catch (initError) {
           // This catch block might still catch other potential init errors
           console.error(`Error getting Auth service AFTER initialization: ${initError.message}`);
       }
  } else if (isTest) {
       console.log(`Admin app "${appName}" initialized successfully for Test Environment.`);
  }

  return newApp;
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