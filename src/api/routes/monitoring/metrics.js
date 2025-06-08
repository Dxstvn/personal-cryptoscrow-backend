
// Metrics endpoint for monitoring systems
import express from 'express';
import { getPerformanceMetrics } from '../middleware/performanceMonitoring.js';

const router = express.Router();

// Prometheus-style metrics endpoint
router.get('/metrics', (req, res) => {
  const metrics = getPerformanceMetrics();
  
  let prometheusMetrics = `
# HELP http_requests_total Total number of HTTP requests
# TYPE http_requests_total counter
http_requests_total ${metrics.totalRequests}

# HELP http_request_duration_seconds HTTP request duration in seconds
# TYPE http_request_duration_seconds histogram
http_request_duration_seconds_sum ${metrics.averageResponseTime / 1000}
http_request_duration_seconds_count ${metrics.totalRequests}

# HELP http_errors_total Total number of HTTP errors
# TYPE http_errors_total counter
http_errors_total ${Math.floor(metrics.errorRate * metrics.totalRequests)}

# HELP process_uptime_seconds Process uptime in seconds
# TYPE process_uptime_seconds gauge
process_uptime_seconds ${process.uptime()}

# HELP nodejs_memory_usage_bytes Node.js memory usage
# TYPE nodejs_memory_usage_bytes gauge
`;

  const memUsage = process.memoryUsage();
  Object.entries(memUsage).forEach(([key, value]) => {
    prometheusMetrics += `nodejs_memory_usage_bytes{type="${key}"} ${value}\n`;
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

export default router;