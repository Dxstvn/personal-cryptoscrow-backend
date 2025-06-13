// Database service override for E2E tests
// This prevents RetryOptions constructor errors by using proper E2E Firestore configuration

import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { getFirestoreForE2E } from './firestore-config.js';

let dbInstance = null;

export async function getDb() {
  if (dbInstance) {
    return dbInstance;
  }

  try {
    console.log('[E2E DBService] Using E2E-specific Firestore configuration');
    dbInstance = getFirestoreForE2E();
    console.log('[E2E DBService] Successfully obtained Firestore instance for E2E tests');
    return dbInstance;
  } catch (error) {
    console.error('[E2E DBService] CRITICAL ERROR: Could not get Firestore instance:', error.message);
    throw error;
  }
}

// Export Firestore utilities for E2E tests
export { Timestamp, FieldValue };

// Mock the regular database service for E2E tests
export const databaseService = {
  getDb,
  Timestamp,
  FieldValue
}; 