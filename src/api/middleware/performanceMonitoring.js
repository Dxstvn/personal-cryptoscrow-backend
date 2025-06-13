
// Performance Monitoring and Metrics Collection
class PerformanceMonitor {
  constructor() {
    this.metrics = {
      requests: new Map(),
      responseTime: [],
      errors: 0,
      totalRequests: 0
    };
    
    // Clean metrics every hour - store interval ID for cleanup
    this.cleanupInterval = setInterval(() => this.cleanOldMetrics(), 60 * 60 * 1000);
  }

  trackRequest(req, res, next) {
    const startTime = Date.now();
    const originalSend = res.send;
    
    res.send = function(data) {
      const responseTime = Date.now() - startTime;
      
      // Track metrics
      monitor.metrics.totalRequests++;
      monitor.metrics.responseTime.push(responseTime);
      
      // Track by endpoint
      const endpoint = `${req.method} ${req.route?.path || req.path}`;
      if (!monitor.metrics.requests.has(endpoint)) {
        monitor.metrics.requests.set(endpoint, {
          count: 0,
          totalTime: 0,
          errors: 0
        });
      }
      
      const endpointMetrics = monitor.metrics.requests.get(endpoint);
      endpointMetrics.count++;
      endpointMetrics.totalTime += responseTime;
      
      if (res.statusCode >= 400) {
        endpointMetrics.errors++;
        monitor.metrics.errors++;
      }
      
      // Alert on slow responses
      if (responseTime > 5000) { // 5 seconds
        console.warn(`⚠️ Slow response: ${endpoint} took ${responseTime}ms`);
      }
      
      return originalSend.call(this, data);
    };
    
    next();
  }

  getMetrics() {
    const now = Date.now();
    const recentResponseTimes = this.metrics.responseTime.slice(-100); // Last 100 requests
    
    return {
      timestamp: new Date().toISOString(),
      totalRequests: this.metrics.totalRequests,
      errorRate: this.metrics.errors / this.metrics.totalRequests,
      averageResponseTime: recentResponseTimes.reduce((a, b) => a + b, 0) / recentResponseTimes.length,
      p95ResponseTime: this.calculatePercentile(recentResponseTimes, 95),
      endpointMetrics: Array.from(this.metrics.requests.entries()).map(([endpoint, metrics]) => ({
        endpoint,
        ...metrics,
        averageTime: metrics.totalTime / metrics.count,
        errorRate: metrics.errors / metrics.count
      }))
    };
  }

  calculatePercentile(arr, percentile) {
    const sorted = arr.sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[index] || 0;
  }

  cleanOldMetrics() {
    // Keep only last 1000 response times
    if (this.metrics.responseTime.length > 1000) {
      this.metrics.responseTime = this.metrics.responseTime.slice(-1000);
    }
  }

  // Method to clean up the monitor (for testing)
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

const monitor = new PerformanceMonitor();

export const performanceMiddleware = (req, res, next) => {
  monitor.trackRequest(req, res, next);
};

export const getPerformanceMetrics = () => monitor.getMetrics();

export const destroyPerformanceMonitor = () => monitor.destroy();

export default monitor;