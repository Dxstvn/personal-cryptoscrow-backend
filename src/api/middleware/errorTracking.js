
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
    const errorKey = `${error.name}:${error.message}`;
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
    fs.appendFileSync(logFile, JSON.stringify(errorLog) + '\n');
  }

  sendAlert(error, req, count) {
    const alert = {
      severity: 'HIGH',
      title: `High Error Rate Detected: ${error.name}`,
      message: `Error "${error.message}" occurred ${count} times in the last 5 minutes`,
      details: {
        endpoint: `${req.method} ${req.url}`,
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

export default errorTracker;