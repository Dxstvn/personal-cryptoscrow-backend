// src/scripts/setupKYCDatabase.js

/**
 * Script to set up KYC database schema
 * Run this script to create collections and migrate existing users
 * 
 * Usage: node src/scripts/setupKYCDatabase.js
 */

import { setupKYCDatabase } from '../services/kyc/migrations/addKYCFields.js';
import admin from 'firebase-admin';
import config from '../config/index.js';

async function main() {
  try {
    console.log('=== KYC Database Setup Script ===');
    console.log('Environment:', process.env.NODE_ENV || 'development');
    
    // Initialize config
    await config.initialize();
    
    // Check if Firebase Admin is initialized
    if (!admin.apps.length) {
      console.log('Initializing Firebase Admin...');
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: config.get('FIREBASE_PROJECT_ID'),
          clientEmail: config.get('FIREBASE_CLIENT_EMAIL'),
          privateKey: config.get('FIREBASE_PRIVATE_KEY').replace(/\\n/g, '\n')
        })
      });
    }
    
    console.log('Starting KYC database setup...\n');
    
    // Run the setup
    const results = await setupKYCDatabase();
    
    console.log('\n=== Setup Complete ===');
    console.log('Collections created:', results.collections);
    console.log('Migration results:');
    console.log(`  - Total users: ${results.migration.total}`);
    console.log(`  - Updated: ${results.migration.updated}`);
    console.log(`  - Skipped: ${results.migration.skipped}`);
    console.log(`  - Errors: ${results.migration.errors.length}`);
    
    if (results.migration.errors.length > 0) {
      console.log('\nErrors encountered:');
      results.migration.errors.forEach(err => {
        console.log(`  - User ${err.userId}: ${err.error}`);
      });
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error during KYC database setup:', error);
    process.exit(1);
  }
}

// Run the script
main();