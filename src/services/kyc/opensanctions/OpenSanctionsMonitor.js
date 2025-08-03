// src/services/kyc/opensanctions/OpenSanctionsMonitor.js

import { EventEmitter } from 'events';
import { writeFileSync, existsSync, readFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import cron from 'node-cron';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Monitoring and alerting system for OpenSanctions
 * Tracks performance, health, and generates alerts
 */
export class OpenSanctionsMonitor extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      metricsInterval: config.metricsInterval || 60000, // 1 minute
      healthCheckInterval: config.healthCheckInterval || 300000, // 5 minutes
      alertThresholds: {
        searchLatency: config.searchLatencyThreshold || 1000, // 1 second
        errorRate: config.errorRateThreshold || 0.05, // 5%
        cacheHitRate: config.cacheHitRateThreshold || 0.7, // 70%
        updateDuration: config.updateDurationThreshold || 3600000, // 1 hour
        ...config.alertThresholds
      },
      retentionDays: config.retentionDays || 30,
      metricsFile: config.metricsFile || 
        join(__dirname, '../../../../data/opensanctions-metrics.json'),
      alertsFile: config.alertsFile || 
        join(__dirname, '../../../../data/opensanctions-alerts.json'),
      ...config
    };
    
    this.metrics = {
      searches: [],
      errors: [],
      cacheHits: 0,
      cacheMisses: 0,
      updates: [],
      health: []
    };
    
    this.alerts = [];
    this.services = {};
    this.metricsTask = null;
    this.healthCheckTask = null;
    
    this.loadPersistedData();
  }

  /**
   * Initialize monitoring
   */
  initialize(services = {}) {
    this.services = services;
    
    // Ensure data directory exists
    const dataDir = dirname(this.config.metricsFile);
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }
    
    // Attach event listeners to services
    if (services.searchService) {
      this.attachSearchServiceListeners(services.searchService);
    }
    
    if (services.updateService) {
      this.attachUpdateServiceListeners(services.updateService);
    }
    
    // Start monitoring tasks
    this.startMetricsCollection();
    this.startHealthChecks();
    
    this.emit('initialized');
    console.log('[OpenSanctions Monitor] Monitoring system initialized');
  }

  /**
   * Attach listeners to search service
   */
  attachSearchServiceListeners(service) {
    service.on('search:completed', (data) => {
      this.recordSearch({
        timestamp: new Date().toISOString(),
        duration: data.duration,
        resultCount: data.results,
        query: data.name
      });
    });
    
    service.on('search:cache_hit', (data) => {
      this.metrics.cacheHits++;
    });
    
    service.on('search:error', (data) => {
      this.recordError({
        timestamp: new Date().toISOString(),
        type: 'search_error',
        query: data.name,
        error: data.error.message
      });
    });
  }

  /**
   * Attach listeners to update service
   */
  attachUpdateServiceListeners(service) {
    service.on('update:start', () => {
      console.log('[OpenSanctions Monitor] Update started');
    });
    
    service.on('update:complete', (data) => {
      this.recordUpdate({
        timestamp: data.timestamp,
        duration: data.duration,
        entitiesAdded: data.entitiesAdded,
        entitiesUpdated: data.entitiesUpdated,
        entitiesRemoved: data.entitiesRemoved,
        errors: data.errors
      });
    });
    
    service.on('update:error', (error) => {
      this.recordError({
        timestamp: new Date().toISOString(),
        type: 'update_error',
        error: error.message
      });
    });
  }

  /**
   * Start metrics collection
   */
  startMetricsCollection() {
    this.metricsTask = setInterval(() => {
      this.calculateMetrics();
      this.checkAlertConditions();
      this.persistData();
    }, this.config.metricsInterval);
  }

  /**
   * Start health checks
   */
  startHealthChecks() {
    this.healthCheckTask = setInterval(async () => {
      await this.performHealthCheck();
    }, this.config.healthCheckInterval);
    
    // Perform initial health check
    this.performHealthCheck();
  }

  /**
   * Record search metrics
   */
  recordSearch(searchData) {
    this.metrics.searches.push(searchData);
    this.metrics.cacheMisses++;
    
    // Trim old data
    this.trimMetrics();
  }

  /**
   * Record error
   */
  recordError(errorData) {
    this.metrics.errors.push(errorData);
    this.trimMetrics();
  }

  /**
   * Record update
   */
  recordUpdate(updateData) {
    this.metrics.updates.push(updateData);
    
    // Check if update took too long
    if (updateData.duration > this.config.alertThresholds.updateDuration) {
      this.createAlert({
        type: 'slow_update',
        severity: 'warning',
        message: `Update took ${(updateData.duration / 1000 / 60).toFixed(1)} minutes`,
        details: updateData
      });
    }
  }

  /**
   * Perform health check
   */
  async performHealthCheck() {
    const healthStatus = {
      timestamp: new Date().toISOString(),
      status: 'healthy',
      checks: {}
    };
    
    try {
      // Check search service
      if (this.services.searchService && this.services.searchService.initialized) {
        healthStatus.checks.searchService = 'healthy';
        
        // Test search
        const testStart = Date.now();
        await this.services.searchService.search('test', { limit: 1 });
        const searchTime = Date.now() - testStart;
        
        if (searchTime > this.config.alertThresholds.searchLatency) {
          healthStatus.checks.searchService = 'degraded';
          healthStatus.status = 'degraded';
        }
      } else {
        healthStatus.checks.searchService = 'unavailable';
        healthStatus.status = 'unhealthy';
      }
      
      // Check database connection
      if (this.services.searchService && this.services.searchService.db) {
        try {
          const stats = await this.services.searchService.getStatistics();
          healthStatus.checks.database = 'healthy';
          healthStatus.checks.entityCount = stats.total;
        } catch (error) {
          healthStatus.checks.database = 'unhealthy';
          healthStatus.status = 'unhealthy';
        }
      }
      
    } catch (error) {
      healthStatus.status = 'unhealthy';
      healthStatus.error = error.message;
      
      this.createAlert({
        type: 'health_check_failed',
        severity: 'critical',
        message: 'Health check failed',
        details: { error: error.message }
      });
    }
    
    this.metrics.health.push(healthStatus);
    this.emit('health:check', healthStatus);
    
    return healthStatus;
  }

  /**
   * Calculate current metrics
   */
  calculateMetrics() {
    const now = Date.now();
    const oneHourAgo = now - 3600000;
    const fiveMinutesAgo = now - 300000;
    
    // Calculate search metrics
    const recentSearches = this.metrics.searches.filter(s => 
      new Date(s.timestamp).getTime() > oneHourAgo
    );
    
    const searchMetrics = {
      totalSearches: recentSearches.length,
      averageLatency: recentSearches.length > 0 
        ? recentSearches.reduce((sum, s) => sum + s.duration, 0) / recentSearches.length
        : 0,
      searchesPerMinute: recentSearches.filter(s => 
        new Date(s.timestamp).getTime() > fiveMinutesAgo
      ).length / 5
    };
    
    // Calculate error rate
    const recentErrors = this.metrics.errors.filter(e => 
      new Date(e.timestamp).getTime() > oneHourAgo
    );
    
    const errorRate = recentSearches.length > 0 
      ? recentErrors.length / recentSearches.length 
      : 0;
    
    // Calculate cache hit rate
    const totalCacheOps = this.metrics.cacheHits + this.metrics.cacheMisses;
    const cacheHitRate = totalCacheOps > 0 
      ? this.metrics.cacheHits / totalCacheOps 
      : 0;
    
    const currentMetrics = {
      timestamp: new Date().toISOString(),
      search: searchMetrics,
      errorRate,
      cacheHitRate,
      recentErrors: recentErrors.length
    };
    
    this.emit('metrics:calculated', currentMetrics);
    
    return currentMetrics;
  }

  /**
   * Check alert conditions
   */
  checkAlertConditions() {
    const metrics = this.calculateMetrics();
    
    // Check search latency
    if (metrics.search.averageLatency > this.config.alertThresholds.searchLatency) {
      this.createAlert({
        type: 'high_latency',
        severity: 'warning',
        message: `Average search latency is ${metrics.search.averageLatency.toFixed(0)}ms`,
        details: metrics.search
      });
    }
    
    // Check error rate
    if (metrics.errorRate > this.config.alertThresholds.errorRate) {
      this.createAlert({
        type: 'high_error_rate',
        severity: 'critical',
        message: `Error rate is ${(metrics.errorRate * 100).toFixed(1)}%`,
        details: { errorRate: metrics.errorRate, recentErrors: metrics.recentErrors }
      });
    }
    
    // Check cache hit rate
    if (metrics.cacheHitRate < this.config.alertThresholds.cacheHitRate) {
      this.createAlert({
        type: 'low_cache_hit_rate',
        severity: 'info',
        message: `Cache hit rate is ${(metrics.cacheHitRate * 100).toFixed(1)}%`,
        details: { cacheHitRate: metrics.cacheHitRate }
      });
    }
  }

  /**
   * Create alert
   */
  createAlert(alert) {
    const fullAlert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      ...alert
    };
    
    // Check for duplicate alerts
    const recentAlerts = this.alerts.filter(a => 
      a.type === alert.type && 
      new Date(a.timestamp).getTime() > Date.now() - 3600000 // 1 hour
    );
    
    if (recentAlerts.length === 0) {
      this.alerts.push(fullAlert);
      this.emit('alert:created', fullAlert);
      
      console.log(`[OpenSanctions Monitor] Alert: ${alert.severity.toUpperCase()} - ${alert.message}`);
    }
  }

  /**
   * Get current metrics
   */
  getCurrentMetrics() {
    return this.calculateMetrics();
  }

  /**
   * Get recent alerts
   */
  getRecentAlerts(hours = 24) {
    const since = Date.now() - (hours * 3600000);
    return this.alerts.filter(a => 
      new Date(a.timestamp).getTime() > since
    );
  }

  /**
   * Get health status
   */
  getHealthStatus() {
    if (this.metrics.health.length === 0) {
      return { status: 'unknown' };
    }
    
    return this.metrics.health[this.metrics.health.length - 1];
  }

  /**
   * Trim old metrics data
   */
  trimMetrics() {
    const cutoffTime = Date.now() - (this.config.retentionDays * 24 * 3600000);
    
    this.metrics.searches = this.metrics.searches.filter(s => 
      new Date(s.timestamp).getTime() > cutoffTime
    );
    
    this.metrics.errors = this.metrics.errors.filter(e => 
      new Date(e.timestamp).getTime() > cutoffTime
    );
    
    this.metrics.health = this.metrics.health.filter(h => 
      new Date(h.timestamp).getTime() > cutoffTime
    );
    
    this.alerts = this.alerts.filter(a => 
      new Date(a.timestamp).getTime() > cutoffTime
    );
  }

  /**
   * Persist data to files
   */
  persistData() {
    try {
      // Save metrics
      writeFileSync(
        this.config.metricsFile,
        JSON.stringify(this.metrics, null, 2)
      );
      
      // Save alerts
      writeFileSync(
        this.config.alertsFile,
        JSON.stringify(this.alerts, null, 2)
      );
    } catch (error) {
      console.error('[OpenSanctions Monitor] Failed to persist data:', error);
    }
  }

  /**
   * Load persisted data
   */
  loadPersistedData() {
    try {
      // Load metrics
      if (existsSync(this.config.metricsFile)) {
        const data = readFileSync(this.config.metricsFile, 'utf8');
        this.metrics = JSON.parse(data);
      }
      
      // Load alerts
      if (existsSync(this.config.alertsFile)) {
        const data = readFileSync(this.config.alertsFile, 'utf8');
        this.alerts = JSON.parse(data);
      }
      
      // Trim old data
      this.trimMetrics();
      
    } catch (error) {
      console.error('[OpenSanctions Monitor] Failed to load persisted data:', error);
    }
  }

  /**
   * Generate report
   */
  generateReport(period = 'daily') {
    const metrics = this.calculateMetrics();
    const health = this.getHealthStatus();
    const alerts = this.getRecentAlerts(period === 'daily' ? 24 : 168);
    
    const report = {
      period,
      generatedAt: new Date().toISOString(),
      health: health.status,
      metrics: {
        searches: metrics.search.totalSearches,
        averageLatency: `${metrics.search.averageLatency.toFixed(0)}ms`,
        errorRate: `${(metrics.errorRate * 100).toFixed(1)}%`,
        cacheHitRate: `${(metrics.cacheHitRate * 100).toFixed(1)}%`
      },
      alerts: {
        total: alerts.length,
        critical: alerts.filter(a => a.severity === 'critical').length,
        warning: alerts.filter(a => a.severity === 'warning').length,
        info: alerts.filter(a => a.severity === 'info').length
      },
      recentUpdates: this.metrics.updates.slice(-5)
    };
    
    return report;
  }

  /**
   * Stop monitoring
   */
  stop() {
    if (this.metricsTask) {
      clearInterval(this.metricsTask);
      this.metricsTask = null;
    }
    
    if (this.healthCheckTask) {
      clearInterval(this.healthCheckTask);
      this.healthCheckTask = null;
    }
    
    this.persistData();
    this.emit('stopped');
  }
}

// Export singleton instance
export const openSanctionsMonitor = new OpenSanctionsMonitor();