// Global teardown for E2E tests
export default async function globalTeardown() {
  console.log('🧹 Global E2E Test Teardown Starting...');
  
  // Log test completion summary
  const testDuration = Date.now() - (global.testStartTime || Date.now());
  console.log(`   Test Suite Duration: ${Math.round(testDuration / 1000)}s`);
  console.log('   Environment: E2E Test (Tenderly)');
  console.log('   Mode: Real Services Integration');
  
  // Clean up all persistent resources
  try {
    console.log('🔌 Cleaning up HTTP connections and agents...');
    await cleanupHttpConnections();
    
    console.log('🔥 Cleaning up Firebase Admin connections...');
    await cleanupFirebaseConnections();
    
    console.log('🔌 Cleaning up Ethers providers...');
    await cleanupEthersProviders();
    
    console.log('⏰ Cleaning up intervals and timeouts...');
    await cleanupTimersAndIntervals();
    
    console.log('📊 Cleaning up performance monitoring...');
    await cleanupPerformanceMonitoring();
    
    console.log('🧹 Cleaning up global test data...');
    await cleanupGlobalTestData();
    
    console.log('🔄 Force closing remaining open handles...');
    await forceCloseOpenHandles();
    
    console.log('✅ Resource cleanup completed');
  } catch (error) {
    console.warn('⚠️ Warning during teardown:', error.message);
  }
  
  // Force garbage collection if available
  if (global.gc) {
    console.log('🗑️ Running garbage collection...');
    global.gc();
  }
  
  // Wait for final cleanup
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  console.log('✅ Global E2E Teardown Complete');
}

/**
 * Clean up HTTP connections and agents specifically for Axios TCPWRAP issues
 */
async function cleanupHttpConnections() {
  try {
    // Clean up Node.js HTTP global agent
    if (global.http && global.http.globalAgent) {
      global.http.globalAgent.destroy();
    }
    
    if (global.https && global.https.globalAgent) {
      global.https.globalAgent.destroy();
    }
    
    // Clean up any Axios instances stored globally
    if (global.axiosInstances && Array.isArray(global.axiosInstances)) {
      for (const instance of global.axiosInstances) {
        try {
          if (instance.defaults.httpAgent) {
            instance.defaults.httpAgent.destroy();
          }
          if (instance.defaults.httpsAgent) {
            instance.defaults.httpsAgent.destroy();
          }
        } catch (error) {
          console.warn('   Warning: Could not cleanup Axios instance:', error.message);
        }
      }
      global.axiosInstances = [];
    }
    
    // Force close any remaining TCP connections
    const http = await import('http');
    const https = await import('https');
    
    // Destroy default agents
    if (http.globalAgent) {
      http.globalAgent.destroy();
    }
    if (https.globalAgent) {
      https.globalAgent.destroy();
    }
    
    console.log('   HTTP connections cleaned up');
  } catch (error) {
    console.warn('   Warning: HTTP cleanup failed:', error.message);
  }
}

/**
 * Clean up Firebase Admin connections
 */
async function cleanupFirebaseConnections() {
  try {
    // Use the E2E-specific Firestore cleanup
    const { cleanupFirestoreForE2E } = await import('./firestore-config.js');
    await cleanupFirestoreForE2E();
    
    // Clean up any remaining Firebase apps
    const { getApps, deleteApp } = await import('firebase-admin/app');
    const apps = getApps();
    for (const app of apps) {
      try {
        if (app.name !== 'e2e-admin-app') { // Skip our E2E app as it's already cleaned up
          await deleteApp(app);
          console.log(`   Deleted Firebase app: ${app.name}`);
        }
      } catch (error) {
        if (!error.message.includes('already deleted')) {
          console.warn(`   Warning: Could not delete Firebase app ${app.name}:`, error.message);
        }
      }
    }
    
    console.log(`   Cleaned up Firebase connections`);
  } catch (error) {
    console.warn('   Warning: Firebase cleanup failed:', error.message);
  }
}

/**
 * Clean up Ethers.js providers
 */
async function cleanupEthersProviders() {
  try {
    // Clean up global provider if it exists
    if (global.provider) {
      try {
        if (typeof global.provider.destroy === 'function') {
          await global.provider.destroy();
        } else if (typeof global.provider.removeAllListeners === 'function') {
          global.provider.removeAllListeners();
        }
        global.provider = null;
        console.log('   Cleaned up global ethers provider');
      } catch (error) {
        console.warn('   Warning: Could not clean up global provider:', error.message);
      }
    }
    
    // Clean up any providers stored in global test state
    if (global.testProviders && Array.isArray(global.testProviders)) {
      for (const provider of global.testProviders) {
        try {
          if (typeof provider.destroy === 'function') {
            await provider.destroy();
          } else if (typeof provider.removeAllListeners === 'function') {
            provider.removeAllListeners();
          }
        } catch (error) {
          console.warn('   Warning: Could not clean up provider:', error.message);
        }
      }
      global.testProviders = [];
      console.log('   Cleaned up test providers array');
    }
  } catch (error) {
    console.warn('   Warning: Ethers provider cleanup failed:', error.message);
  }
}

/**
 * Clean up intervals, timeouts, and other timers
 */
async function cleanupTimersAndIntervals() {
  try {
    let cleanedCount = 0;
    
    // Clear all active timeouts (Node.js specific)
    // Note: This is a bit aggressive but necessary for test cleanup
    const activeHandles = process._getActiveHandles();
    const activeRequests = process._getActiveRequests();
    
    console.log(`   Found ${activeHandles.length} active handles and ${activeRequests.length} active requests`);
    
    // Clean up any intervals stored in global state
    if (global.testIntervals && Array.isArray(global.testIntervals)) {
      for (const intervalId of global.testIntervals) {
        clearInterval(intervalId);
        cleanedCount++;
      }
      global.testIntervals = [];
    }
    
    // Clean up any timeouts stored in global state
    if (global.testTimeouts && Array.isArray(global.testTimeouts)) {
      for (const timeoutId of global.testTimeouts) {
        clearTimeout(timeoutId);
        cleanedCount++;
      }
      global.testTimeouts = [];
    }
    
    console.log(`   Cleaned up ${cleanedCount} timers`);
  } catch (error) {
    console.warn('   Warning: Timer cleanup failed:', error.message);
  }
}

/**
 * Clean up performance monitoring
 */
async function cleanupPerformanceMonitoring() {
  try {
    const { destroyPerformanceMonitor } = await import('../../../src/api/middleware/performanceMonitoring.js');
    destroyPerformanceMonitor();
    console.log('   Performance monitor cleaned up');
  } catch (error) {
    console.warn('   Warning: Performance monitor cleanup failed:', error.message);
  }
}

/**
 * Clean up global test data and state
 */
async function cleanupGlobalTestData() {
  try {
    // Clean up global test variables
    const globalVarsToClean = [
      'testTransactionId',
      'testContractAddress', 
      'testAccounts',
      'authToken',
      'provider',
      'testProviders',
      'testIntervals',
      'testTimeouts',
      'testStartTime',
      'axiosInstances'
    ];
    
    let cleanedCount = 0;
    for (const varName of globalVarsToClean) {
      if (global[varName] !== undefined) {
        delete global[varName];
        cleanedCount++;
      }
    }
    
    console.log(`   Cleaned up ${cleanedCount} global variables`);
  } catch (error) {
    console.warn('   Warning: Global data cleanup failed:', error.message);
  }
}

/**
 * Force close remaining open handles
 */
async function forceCloseOpenHandles() {
  try {
    const activeHandles = process._getActiveHandles();
    const activeRequests = process._getActiveRequests();
    
    console.log(`   Found ${activeHandles.length} active handles and ${activeRequests.length} active requests`);
    
    let closedCount = 0;
    
    // Force close TCP, HTTP, and Timer handles
    for (const handle of activeHandles) {
      try {
        const handleType = handle.constructor.name;
        
        if (handleType.includes('TCP') || 
            handleType.includes('HTTP') || 
            handleType.includes('Socket') ||
            handleType.includes('Timer')) {
          
          if (typeof handle.destroy === 'function') {
            handle.destroy();
            closedCount++;
          } else if (typeof handle.close === 'function') {
            handle.close();
            closedCount++;
          } else if (typeof handle.unref === 'function') {
            handle.unref();
            closedCount++;
          }
        }
      } catch (error) {
        // Ignore errors during forced cleanup
      }
    }
    
    // Force close active requests
    for (const request of activeRequests) {
      try {
        if (typeof request.destroy === 'function') {
          request.destroy();
        } else if (typeof request.abort === 'function') {
          request.abort();
        }
      } catch (error) {
        // Ignore errors during forced cleanup
      }
    }
    
    console.log(`   Forcibly closed ${closedCount} handles`);
  } catch (error) {
    console.warn('   Warning: Force close failed:', error.message);
  }
} 