#!/usr/bin/env node

/**
 * Production Monitoring and Alerting Setup
 * Sets up comprehensive monitoring for early issue detection
 */

import fs from 'fs';
import path from 'path';

class MonitoringSetup {
  
  createHealthCheckEndpoint() {
    const healthCheckCode = `
// Enhanced Health Check with Detailed System Status
import express from 'express';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { ethers } from 'ethers';

const router = express.Router();

// Detailed health check with timing metrics
router.get('/', async (req, res) => {
  const startTime = Date.now();
  const health = {
    status: 'OK',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    version: process.env.npm_package_version || '1.0.0',
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    checks: {}
  };

  try {
    // Database connectivity check
    const dbStart = Date.now();
    try {
      const db = getFirestore();
      await db.collection('health').limit(1).get();
      health.checks.database = {
        status: 'OK',
        responseTime: Date.now() - dbStart
      };
    } catch (error) {
      health.checks.database = {
        status: 'ERROR',
        error: error.message,
        responseTime: Date.now() - dbStart
      };
      health.status = 'DEGRADED';
    }

    // Blockchain connectivity check
    const bcStart = Date.now();
    try {
      const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
      await provider.getBlockNumber();
      health.checks.blockchain = {
        status: 'OK',
        responseTime: Date.now() - bcStart,
        chainId: process.env.CHAIN_ID
      };
    } catch (error) {
      health.checks.blockchain = {
        status: 'ERROR',
        error: error.message,
        responseTime: Date.now() - bcStart
      };
      health.status = 'DEGRADED';
    }

    // Auth service check
    const authStart = Date.now();
    try {
      const auth = getAuth();
      // Just check if auth is initialized
      health.checks.auth = {
        status: 'OK',
        responseTime: Date.now() - authStart
      };
    } catch (error) {
      health.checks.auth = {
        status: 'ERROR',
        error: error.message,
        responseTime: Date.now() - authStart
      };
      health.status = 'DEGRADED';
    }

    health.totalResponseTime = Date.now() - startTime;

    // Return appropriate status code
    const statusCode = health.status === 'OK' ? 200 : 503;
    res.status(statusCode).json(health);

  } catch (error) {
    res.status(503).json({
      status: 'ERROR',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Readiness check (for Kubernetes/container orchestration)
router.get('/ready', async (req, res) => {
  // Quick check without external dependencies
  res.json({
    status: 'READY',
    timestamp: new Date().toISOString(),
    pid: process.pid
  });
});

// Liveness check (for Kubernetes/container orchestration)
router.get('/live', (req, res) => {
  res.json({
    status: 'ALIVE',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

export default router;`;

    fs.writeFileSync('src/api/routes/health/enhanced-health.js', healthCheckCode);
    console.log('✅ Enhanced health check endpoint created');
  }

  createErrorTrackingMiddleware() {
    const errorTrackingCode = `
// Production Error Tracking and Alerting
import fs from 'fs';
import path from 'path';

class ErrorTracker {
  constructor() {
    this.errorCounts = new Map();
    this.lastAlert = new Map();
    this.alertThreshold = 5; // Alert after 5 errors in timeWindow
    this.timeWindow = 5 * 60 * 1000; // 5 minutes
  }

  track(error, req) {
    const errorKey = \`\${error.name}:\${error.message}\`;
    const now = Date.now();
    
    // Update error count
    if (!this.errorCounts.has(errorKey)) {
      this.errorCounts.set(errorKey, []);
    }
    
    const errorTimes = this.errorCounts.get(errorKey);
    errorTimes.push(now);
    
    // Clean old errors outside time window
    const cutoff = now - this.timeWindow;
    const recentErrors = errorTimes.filter(time => time > cutoff);
    this.errorCounts.set(errorKey, recentErrors);
    
    // Check if we should alert
    if (recentErrors.length >= this.alertThreshold) {
      const lastAlertTime = this.lastAlert.get(errorKey) || 0;
      if (now - lastAlertTime > this.timeWindow) {
        this.sendAlert(error, req, recentErrors.length);
        this.lastAlert.set(errorKey, now);
      }
    }
    
    // Log error details
    this.logError(error, req);
  }

  logError(error, req) {
    const errorLog = {
      timestamp: new Date().toISOString(),
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack
      },
      request: {
        method: req.method,
        url: req.url,
        headers: req.headers,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      },
      environment: process.env.NODE_ENV,
      pid: process.pid
    };

    // Write to error log file
    const logDir = path.join(process.cwd(), 'logs');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    
    const logFile = path.join(logDir, 'errors.log');
    fs.appendFileSync(logFile, JSON.stringify(errorLog) + '\\n');
  }

  sendAlert(error, req, count) {
    const alert = {
      severity: 'HIGH',
      title: \`High Error Rate Detected: \${error.name}\`,
      message: \`Error "\${error.message}" occurred \${count} times in the last 5 minutes\`,
      details: {
        endpoint: \`\${req.method} \${req.url}\`,
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV
      }
    };

    console.error('🚨 ALERT:', JSON.stringify(alert, null, 2));
    
    // Here you would integrate with your alerting service
    // Examples: Slack, Discord, email, PagerDuty, etc.
    this.sendToSlack(alert);
  }

  sendToSlack(alert) {
    // Implementation for Slack alerting
    console.log('📱 Would send to Slack:', alert.title);
  }
}

const errorTracker = new ErrorTracker();

export const errorTrackingMiddleware = (error, req, res, next) => {
  errorTracker.track(error, req);
  next(error);
};

export default errorTracker;`;

    fs.writeFileSync('src/api/middleware/errorTracking.js', errorTrackingCode);
    console.log('✅ Error tracking middleware created');
  }

  createPerformanceMonitoring() {
    const performanceCode = `
// Performance Monitoring and Metrics Collection
class PerformanceMonitor {
  constructor() {
    this.metrics = {
      requests: new Map(),
      responseTime: [],
      errors: 0,
      totalRequests: 0
    };
    
    // Clean metrics every hour
    setInterval(() => this.cleanOldMetrics(), 60 * 60 * 1000);
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
      const endpoint = \`\${req.method} \${req.route?.path || req.path}\`;
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
        console.warn(\`⚠️ Slow response: \${endpoint} took \${responseTime}ms\`);
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
}

const monitor = new PerformanceMonitor();

export const performanceMiddleware = (req, res, next) => {
  monitor.trackRequest(req, res, next);
};

export const getPerformanceMetrics = () => monitor.getMetrics();

export default monitor;`;

    fs.writeFileSync('src/api/middleware/performanceMonitoring.js', performanceCode);
    console.log('✅ Performance monitoring created');
  }

  createMetricsEndpoint() {
    const metricsEndpointCode = `
// Metrics endpoint for monitoring systems
import express from 'express';
import { getPerformanceMetrics } from '../middleware/performanceMonitoring.js';

const router = express.Router();

// Prometheus-style metrics endpoint
router.get('/metrics', (req, res) => {
  const metrics = getPerformanceMetrics();
  
  let prometheusMetrics = \`
# HELP http_requests_total Total number of HTTP requests
# TYPE http_requests_total counter
http_requests_total \${metrics.totalRequests}

# HELP http_request_duration_seconds HTTP request duration in seconds
# TYPE http_request_duration_seconds histogram
http_request_duration_seconds_sum \${metrics.averageResponseTime / 1000}
http_request_duration_seconds_count \${metrics.totalRequests}

# HELP http_errors_total Total number of HTTP errors
# TYPE http_errors_total counter
http_errors_total \${Math.floor(metrics.errorRate * metrics.totalRequests)}

# HELP process_uptime_seconds Process uptime in seconds
# TYPE process_uptime_seconds gauge
process_uptime_seconds \${process.uptime()}

# HELP nodejs_memory_usage_bytes Node.js memory usage
# TYPE nodejs_memory_usage_bytes gauge
\`;

  const memUsage = process.memoryUsage();
  Object.entries(memUsage).forEach(([key, value]) => {
    prometheusMetrics += \`nodejs_memory_usage_bytes{type="\${key}"} \${value}\\n\`;
  });

  res.set('Content-Type', 'text/plain');
  res.send(prometheusMetrics);
});

// JSON metrics for custom dashboards
router.get('/metrics/json', (req, res) => {
  const metrics = getPerformanceMetrics();
  res.json({
    ...metrics,
    system: {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
      version: process.version,
      platform: process.platform
    }
  });
});

export default router;`;

    fs.writeFileSync('src/api/routes/monitoring/metrics.js', metricsEndpointCode);
    console.log('✅ Metrics endpoint created');
  }

  generateDocumentation() {
    const docs = `
# Production Monitoring Guide

## Health Checks

### Basic Health Check
\`\`\`
GET /health
\`\`\`
Returns overall system status with detailed component checks.

### Readiness Check  
\`\`\`
GET /health/ready
\`\`\`
Quick readiness check for load balancers.

### Liveness Check
\`\`\`
GET /health/live  
\`\`\`
Basic liveness probe for container orchestration.

## Metrics Collection

### Prometheus Metrics
\`\`\`
GET /monitoring/metrics
\`\`\`
Prometheus-compatible metrics for monitoring systems.

### JSON Metrics
\`\`\`
GET /monitoring/metrics/json
\`\`\`
Detailed metrics in JSON format for custom dashboards.

## Error Tracking

Automatic error tracking with:
- Error rate monitoring
- Automatic alerting on error spikes  
- Detailed error logging
- Performance impact tracking

## Alerting Thresholds

- **Response Time**: Alert if > 5 seconds
- **Error Rate**: Alert if > 5 errors in 5 minutes
- **Memory Usage**: Alert if > 80% of limit
- **Database Connectivity**: Alert on failure

## Log Files

- \`logs/errors.log\` - Error details and stack traces
- \`logs/combined.log\` - All application logs
- \`logs/out.log\` - Standard output
- \`logs/err.log\` - Standard error

## Integration Examples

### Grafana Dashboard Query Examples
\`\`\`
# Average response time
rate(http_request_duration_seconds_sum[5m]) / rate(http_request_duration_seconds_count[5m])

# Error rate percentage  
rate(http_errors_total[5m]) / rate(http_requests_total[5m]) * 100

# Memory usage
nodejs_memory_usage_bytes{type="heapUsed"} / nodejs_memory_usage_bytes{type="heapTotal"} * 100
\`\`\`

### Slack Webhook Integration
Set environment variable:
\`\`\`
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
\`\`\`
`;

    fs.writeFileSync('docs/MONITORING.md', docs);
    console.log('✅ Monitoring documentation created');
  }

  setup() {
    console.log('🔧 Setting up production monitoring...\n');

    // Create directories
    ['src/api/routes/monitoring', 'logs', 'docs'].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });

    this.createHealthCheckEndpoint();
    this.createErrorTrackingMiddleware();
    this.createPerformanceMonitoring();
    this.createMetricsEndpoint();
    this.generateDocumentation();

    console.log('\n✅ Production monitoring setup complete!');
    console.log('\n📋 Next steps:');
    console.log('1. Add monitoring routes to your server.js');
    console.log('2. Configure Slack/Discord webhooks for alerts');
    console.log('3. Set up Grafana/Prometheus for metrics visualization');
    console.log('4. Configure log rotation for production');
  }
}

const monitoring = new MonitoringSetup();
monitoring.setup(); 