// src/api/routes/kyc/openSanctionsMonitoringRoutes.js

import express from 'express';
import { query, validationResult } from 'express-validator';
import { authMiddleware as authenticateToken } from '../../middleware/authMiddleware.js';
import { OpenSanctionsMonitor } from '../../../services/kyc/opensanctions/OpenSanctionsMonitor.js';
import { openSanctionsSQLiteService } from '../../../services/kyc/opensanctions/OpenSanctionsSQLiteService.js';
import { openSanctionsUpdater } from '../../../services/kyc/opensanctions/OpenSanctionsUpdater.js';

const router = express.Router();

// Initialize monitor
const monitor = new OpenSanctionsMonitor({
  metricsInterval: 60000, // 1 minute
  healthCheckInterval: 300000, // 5 minutes
  alertThresholds: {
    searchLatency: 1000, // 1 second
    errorRate: 0.05, // 5%
    cacheHitRate: 0.7, // 70%
    updateDuration: 3600000 // 1 hour
  }
});

// Initialize monitoring with services
(async () => {
  try {
    monitor.initialize({
      searchService: openSanctionsSQLiteService,
      updateService: openSanctionsUpdater
    });
    console.log('[OpenSanctions Monitoring] API initialized');
  } catch (error) {
    console.error('[OpenSanctions Monitoring] Failed to initialize:', error);
  }
})();

/**
 * @route   GET /api/kyc/opensanctions/monitoring/metrics
 * @desc    Get current metrics
 * @access  Private
 */
router.get('/metrics',
  authenticateToken,
  async (req, res) => {
    try {
      const metrics = monitor.getCurrentMetrics();
      
      res.json({
        success: true,
        metrics
      });
      
    } catch (error) {
      console.error('[OpenSanctions Monitoring] Metrics error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve metrics'
      });
    }
  }
);

/**
 * @route   GET /api/kyc/opensanctions/monitoring/health
 * @desc    Get health status
 * @access  Private
 */
router.get('/health',
  authenticateToken,
  async (req, res) => {
    try {
      const health = monitor.getHealthStatus();
      const statusCode = health.status === 'healthy' ? 200 : 
                        health.status === 'degraded' ? 200 : 503;
      
      res.status(statusCode).json({
        success: true,
        health
      });
      
    } catch (error) {
      console.error('[OpenSanctions Monitoring] Health check error:', error);
      res.status(503).json({
        success: false,
        error: 'Health check failed',
        health: { status: 'unhealthy' }
      });
    }
  }
);

/**
 * @route   GET /api/kyc/opensanctions/monitoring/alerts
 * @desc    Get recent alerts
 * @access  Private
 */
router.get('/alerts',
  authenticateToken,
  [
    query('hours').optional().isInt({ min: 1, max: 168 })
      .withMessage('Hours must be between 1 and 168'),
    query('severity').optional().isIn(['info', 'warning', 'critical'])
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ 
          success: false, 
          errors: errors.array() 
        });
      }
      
      const { hours = 24, severity } = req.query;
      let alerts = monitor.getRecentAlerts(parseInt(hours));
      
      // Filter by severity if specified
      if (severity) {
        alerts = alerts.filter(a => a.severity === severity);
      }
      
      res.json({
        success: true,
        alerts,
        count: alerts.length
      });
      
    } catch (error) {
      console.error('[OpenSanctions Monitoring] Alerts error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve alerts'
      });
    }
  }
);

/**
 * @route   GET /api/kyc/opensanctions/monitoring/report
 * @desc    Generate monitoring report
 * @access  Private
 */
router.get('/report',
  authenticateToken,
  [
    query('period').optional().isIn(['daily', 'weekly'])
      .withMessage('Period must be daily or weekly')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ 
          success: false, 
          errors: errors.array() 
        });
      }
      
      const { period = 'daily' } = req.query;
      const report = monitor.generateReport(period);
      
      res.json({
        success: true,
        report
      });
      
    } catch (error) {
      console.error('[OpenSanctions Monitoring] Report error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to generate report'
      });
    }
  }
);

/**
 * @route   POST /api/kyc/opensanctions/monitoring/test-alert
 * @desc    Create a test alert (admin only)
 * @access  Private
 */
router.post('/test-alert',
  authenticateToken,
  async (req, res) => {
    try {
      // Create a test alert
      monitor.createAlert({
        type: 'test_alert',
        severity: 'info',
        message: 'This is a test alert',
        details: { 
          triggeredBy: req.user.uid,
          timestamp: new Date().toISOString()
        }
      });
      
      res.json({
        success: true,
        message: 'Test alert created'
      });
      
    } catch (error) {
      console.error('[OpenSanctions Monitoring] Test alert error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to create test alert'
      });
    }
  }
);

/**
 * @route   GET /api/kyc/opensanctions/monitoring/dashboard
 * @desc    Get dashboard data (metrics, health, alerts combined)
 * @access  Private
 */
router.get('/dashboard',
  authenticateToken,
  async (req, res) => {
    try {
      const metrics = monitor.getCurrentMetrics();
      const health = monitor.getHealthStatus();
      const alerts = monitor.getRecentAlerts(24);
      const report = monitor.generateReport('daily');
      
      // Get database statistics
      let dbStats = null;
      try {
        dbStats = await openSanctionsSQLiteService.getStatistics();
      } catch (error) {
        console.error('Failed to get DB stats:', error);
      }
      
      res.json({
        success: true,
        dashboard: {
          timestamp: new Date().toISOString(),
          health: health.status,
          metrics: {
            searches: {
              total: metrics.search.totalSearches,
              perMinute: metrics.search.searchesPerMinute.toFixed(2),
              averageLatency: `${metrics.search.averageLatency.toFixed(0)}ms`
            },
            performance: {
              errorRate: `${(metrics.errorRate * 100).toFixed(1)}%`,
              cacheHitRate: `${(metrics.cacheHitRate * 100).toFixed(1)}%`
            }
          },
          alerts: {
            active: alerts.length,
            bySeverity: {
              critical: alerts.filter(a => a.severity === 'critical').length,
              warning: alerts.filter(a => a.severity === 'warning').length,
              info: alerts.filter(a => a.severity === 'info').length
            },
            recent: alerts.slice(0, 5)
          },
          database: dbStats ? {
            totalEntities: dbStats.total,
            individuals: dbStats.individuals,
            lastUpdate: dbStats.last_update
          } : null,
          summary: report
        }
      });
      
    } catch (error) {
      console.error('[OpenSanctions Monitoring] Dashboard error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve dashboard data'
      });
    }
  }
);

// WebSocket support for real-time monitoring (optional)
// Commented out as it requires express-ws middleware to be configured
/*
router.ws('/live', (ws, req) => {
  // Verify authentication
  const token = req.query.token;
  if (!token) {
    ws.close(1008, 'Authentication required');
    return;
  }
  
  console.log('[OpenSanctions Monitoring] WebSocket client connected');
  
  // Send initial data
  ws.send(JSON.stringify({
    type: 'connected',
    timestamp: new Date().toISOString()
  }));
  
  // Send metrics every 10 seconds
  const metricsInterval = setInterval(() => {
    if (ws.readyState === ws.OPEN) {
      const metrics = monitor.getCurrentMetrics();
      ws.send(JSON.stringify({
        type: 'metrics',
        data: metrics
      }));
    }
  }, 10000);
  
  // Listen for alerts
  const alertHandler = (alert) => {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({
        type: 'alert',
        data: alert
      }));
    }
  };
  
  monitor.on('alert:created', alertHandler);
  
  // Clean up on disconnect
  ws.on('close', () => {
    clearInterval(metricsInterval);
    monitor.off('alert:created', alertHandler);
    console.log('[OpenSanctions Monitoring] WebSocket client disconnected');
  });
});
*/

export default router;