import axios from 'axios';
import http from 'http';
import https from 'https';

/**
 * HTTP Cleanup Utility for E2E Tests
 * Prevents Axios TCPWRAP open handle issues
 */

class HttpCleanupUtil {
  constructor() {
    this.axiosInstances = [];
    this.httpAgents = [];
    this.httpsAgents = [];
    this.activeConnections = new Set();
  }

  /**
   * Create an Axios instance with proper cleanup tracking
   */
  createAxiosInstance(config = {}) {
    // Create agents with no keep-alive to prevent hanging connections
    const httpAgent = new http.Agent({
      keepAlive: false,
      timeout: config.timeout || 30000,
      keepAliveMsecs: 0,
      maxSockets: config.maxSockets || 10,
      maxFreeSockets: 0
    });

    const httpsAgent = new https.Agent({
      keepAlive: false,
      timeout: config.timeout || 30000,
      keepAliveMsecs: 0,
      maxSockets: config.maxSockets || 10,
      maxFreeSockets: 0
    });

    // Track agents for cleanup
    this.httpAgents.push(httpAgent);
    this.httpsAgents.push(httpsAgent);

    // Create Axios instance with custom agents
    const axiosInstance = axios.create({
      ...config,
      httpAgent,
      httpsAgent,
      // Ensure no connection reuse
      headers: {
        'Connection': 'close',
        ...config.headers
      }
    });

    // Track instance for cleanup
    this.axiosInstances.push(axiosInstance);
    
    // Also add to global tracking
    if (!global.axiosInstances) {
      global.axiosInstances = [];
    }
    global.axiosInstances.push(axiosInstance);

    return axiosInstance;
  }

  /**
   * Create a request interceptor that tracks active connections
   */
  addConnectionTracking(axiosInstance) {
    // Request interceptor
    axiosInstance.interceptors.request.use(
      (config) => {
        const connectionId = `${config.method}-${config.url}-${Date.now()}`;
        config.connectionId = connectionId;
        this.activeConnections.add(connectionId);
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // Response interceptor
    axiosInstance.interceptors.response.use(
      (response) => {
        if (response.config.connectionId) {
          this.activeConnections.delete(response.config.connectionId);
        }
        return response;
      },
      (error) => {
        if (error.config && error.config.connectionId) {
          this.activeConnections.delete(error.config.connectionId);
        }
        return Promise.reject(error);
      }
    );

    return axiosInstance;
  }

  /**
   * Clean up all tracked HTTP resources
   */
  async cleanup() {
    console.log('🧹 Starting HTTP cleanup...');
    
    try {
      // 1. Clean up all Axios instances
      for (const instance of this.axiosInstances) {
        try {
          if (instance.defaults.httpAgent) {
            instance.defaults.httpAgent.destroy();
          }
          if (instance.defaults.httpsAgent) {
            instance.defaults.httpsAgent.destroy();
          }
        } catch (error) {
          console.warn('Warning cleaning up Axios instance:', error.message);
        }
      }

      // 2. Clean up all HTTP agents
      for (const agent of this.httpAgents) {
        try {
          agent.destroy();
        } catch (error) {
          console.warn('Warning cleaning up HTTP agent:', error.message);
        }
      }

      // 3. Clean up all HTTPS agents
      for (const agent of this.httpsAgents) {
        try {
          agent.destroy();
        } catch (error) {
          console.warn('Warning cleaning up HTTPS agent:', error.message);
        }
      }

      // 4. Force close global agents
      try {
        if (http.globalAgent) {
          http.globalAgent.destroy();
        }
        if (https.globalAgent) {
          https.globalAgent.destroy();
        }
      } catch (error) {
        console.warn('Warning cleaning up global agents:', error.message);
      }

      // 5. Clear tracking arrays
      this.axiosInstances = [];
      this.httpAgents = [];
      this.httpsAgents = [];
      this.activeConnections.clear();

      // 6. Clean up global tracking
      if (global.axiosInstances) {
        global.axiosInstances = [];
      }

      console.log('✅ HTTP cleanup completed');
    } catch (error) {
      console.warn('⚠️ Error during HTTP cleanup:', error.message);
    }
  }

  /**
   * Force close any remaining open handles
   */
  async forceCloseHandles() {
    console.log('🔨 Force closing remaining HTTP handles...');
    
    try {
      const activeHandles = process._getActiveHandles();
      const activeRequests = process._getActiveRequests();
      
      console.log(`Found ${activeHandles.length} active handles and ${activeRequests.length} active requests`);
      
      let closedCount = 0;
      
      // Force close HTTP-related handles
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
      
      console.log(`🔨 Forcibly closed ${closedCount} handles`);
    } catch (error) {
      console.warn('⚠️ Error during force close:', error.message);
    }
  }

  /**
   * Get status of active connections
   */
  getStatus() {
    return {
      axiosInstances: this.axiosInstances.length,
      httpAgents: this.httpAgents.length,
      httpsAgents: this.httpsAgents.length,
      activeConnections: this.activeConnections.size,
      activeConnectionIds: Array.from(this.activeConnections)
    };
  }
}

// Export singleton instance
export const httpCleanupUtil = new HttpCleanupUtil();

// Export class for custom instances
export { HttpCleanupUtil };

// Helper function to create a clean Axios instance
export function createCleanAxiosInstance(config = {}) {
  return httpCleanupUtil.createAxiosInstance(config);
}

// Helper function for complete cleanup
export async function cleanupAllHttpResources() {
  await httpCleanupUtil.cleanup();
  await httpCleanupUtil.forceCloseHandles();
} 