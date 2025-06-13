// Global teardown for E2E tests
export default async function globalTeardown() {
  console.log('🧹 Global E2E Test Teardown Starting...');
  
  // Log test completion summary
  const testDuration = Date.now() - (global.testStartTime || Date.now());
  console.log(`   Test Suite Duration: ${Math.round(testDuration / 1000)}s`);
  console.log('   Environment: E2E Test (Tenderly)');
  console.log('   Mode: Real Services Integration');
  
  // Clean up any global resources if needed
  try {
    // Any cleanup logic would go here
    // For example: closing database connections, cleaning up temp files, etc.
    
    console.log('   Resource cleanup completed');
  } catch (error) {
    console.warn('⚠️ Warning during teardown:', error.message);
  }
  
  console.log('✅ Global E2E Teardown Complete');
} 