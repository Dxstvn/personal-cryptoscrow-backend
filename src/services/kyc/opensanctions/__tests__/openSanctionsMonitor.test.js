// src/services/kyc/opensanctions/__tests__/openSanctionsMonitor.test.js

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OpenSanctionsMonitor } from '../OpenSanctionsMonitor.js';
import { EventEmitter } from 'events';

// Mock fs module
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn()
}));

// Mock node-cron
vi.mock('node-cron', () => ({
  default: {
    schedule: vi.fn(() => ({
      stop: vi.fn()
    }))
  }
}));

// Create mock services
class MockSearchService extends EventEmitter {
  constructor() {
    super();
    this.initialized = true;
    this.db = { connected: true }; // Add db property
  }
  
  async search(query, options) {
    return [];
  }
  
  async getStatistics() {
    return { total: 10000 };
  }
}

class MockUpdateService extends EventEmitter {
  constructor() {
    super();
  }
}

describe('OpenSanctionsMonitor', () => {
  let monitor;
  let mockSearchService;
  let mockUpdateService;
  let consoleLogSpy;
  let consoleErrorSpy;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    
    // Spy on console methods
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    
    // Reset fs mocks
    const fs = vi.mocked(await import('fs'));
    fs.existsSync.mockReturnValue(false);
    fs.readFileSync.mockReturnValue('{}');
    fs.writeFileSync.mockImplementation(() => {});
    fs.mkdirSync.mockImplementation(() => {});
    
    // Create fresh service instances
    mockSearchService = new MockSearchService();
    mockUpdateService = new MockUpdateService();
  });

  afterEach(() => {
    if (monitor) {
      monitor.stop();
    }
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with default configuration', () => {
      monitor = new OpenSanctionsMonitor();
      
      expect(monitor.config).toMatchObject({
        metricsInterval: 60000,
        healthCheckInterval: 300000,
        alertThresholds: {
          searchLatency: 1000,
          errorRate: 0.05,
          cacheHitRate: 0.7,
          updateDuration: 3600000
        },
        retentionDays: 30
      });
      
      expect(monitor.metrics).toMatchObject({
        searches: [],
        errors: [],
        cacheHits: 0,
        cacheMisses: 0,
        updates: [],
        health: []
      });
      
      expect(monitor.alerts).toEqual([]);
      expect(monitor).toBeInstanceOf(EventEmitter);
    });

    it('should accept custom configuration', () => {
      monitor = new OpenSanctionsMonitor({
        metricsInterval: 30000,
        healthCheckInterval: 60000,
        alertThresholds: {
          searchLatency: 500,
          errorRate: 0.1
        },
        retentionDays: 7
      });
      
      expect(monitor.config.metricsInterval).toBe(30000);
      expect(monitor.config.healthCheckInterval).toBe(60000);
      expect(monitor.config.alertThresholds.searchLatency).toBe(500);
      expect(monitor.config.alertThresholds.errorRate).toBe(0.1);
      expect(monitor.config.retentionDays).toBe(7);
    });

    it('should load persisted data on construction', async () => {
      const fs = vi.mocked(await import('fs'));
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync
        .mockReturnValueOnce(JSON.stringify({
          searches: [{ timestamp: new Date().toISOString() }],
          errors: [],
          cacheHits: 10,
          cacheMisses: 5
        }))
        .mockReturnValueOnce(JSON.stringify([
          { id: 'alert1', type: 'test' }
        ]));
      
      monitor = new OpenSanctionsMonitor();
      
      expect(monitor.metrics.searches).toHaveLength(1);
      expect(monitor.metrics.cacheHits).toBe(10);
      expect(monitor.alerts).toHaveLength(1);
    });
  });

  describe('initialize', () => {
    beforeEach(() => {
      monitor = new OpenSanctionsMonitor();
    });

    it('should initialize monitoring with services', async () => {
      const fs = vi.mocked(await import('fs'));
      fs.existsSync.mockReturnValue(false);
      
      const initSpy = vi.fn();
      monitor.on('initialized', initSpy);
      
      monitor.initialize({
        searchService: mockSearchService,
        updateService: mockUpdateService
      });
      
      expect(fs.mkdirSync).toHaveBeenCalled();
      expect(monitor.services.searchService).toBe(mockSearchService);
      expect(monitor.services.updateService).toBe(mockUpdateService);
      expect(initSpy).toHaveBeenCalled();
    });

    it('should attach search service listeners', () => {
      const onSpy = vi.spyOn(mockSearchService, 'on');
      
      monitor.initialize({ searchService: mockSearchService });
      
      expect(onSpy).toHaveBeenCalledWith('search:completed', expect.any(Function));
      expect(onSpy).toHaveBeenCalledWith('search:cache_hit', expect.any(Function));
      expect(onSpy).toHaveBeenCalledWith('search:error', expect.any(Function));
    });

    it('should attach update service listeners', () => {
      const onSpy = vi.spyOn(mockUpdateService, 'on');
      
      monitor.initialize({ updateService: mockUpdateService });
      
      expect(onSpy).toHaveBeenCalledWith('update:start', expect.any(Function));
      expect(onSpy).toHaveBeenCalledWith('update:complete', expect.any(Function));
      expect(onSpy).toHaveBeenCalledWith('update:error', expect.any(Function));
    });

    it('should start monitoring tasks', () => {
      monitor.initialize({});
      
      expect(monitor.metricsTask).not.toBeNull();
      expect(monitor.healthCheckTask).not.toBeNull();
    });
  });

  describe('search service event handling', () => {
    beforeEach(() => {
      monitor = new OpenSanctionsMonitor();
      monitor.initialize({ searchService: mockSearchService });
    });

    it('should record search completion', () => {
      mockSearchService.emit('search:completed', {
        duration: 150,
        results: 5,
        name: 'John Doe'
      });
      
      expect(monitor.metrics.searches).toHaveLength(1);
      expect(monitor.metrics.searches[0]).toMatchObject({
        duration: 150,
        resultCount: 5,
        query: 'John Doe'
      });
      expect(monitor.metrics.cacheMisses).toBe(1);
    });

    it('should record cache hits', () => {
      mockSearchService.emit('search:cache_hit', { name: 'cached query' });
      
      expect(monitor.metrics.cacheHits).toBe(1);
    });

    it('should record search errors', () => {
      mockSearchService.emit('search:error', {
        name: 'error query',
        error: new Error('Search failed')
      });
      
      expect(monitor.metrics.errors).toHaveLength(1);
      expect(monitor.metrics.errors[0]).toMatchObject({
        type: 'search_error',
        query: 'error query',
        error: 'Search failed'
      });
    });
  });

  describe('update service event handling', () => {
    beforeEach(() => {
      monitor = new OpenSanctionsMonitor();
      monitor.initialize({ updateService: mockUpdateService });
    });

    it('should log update start', () => {
      mockUpdateService.emit('update:start');
      
      expect(consoleLogSpy).toHaveBeenCalledWith('[OpenSanctions Monitor] Update started');
    });

    it('should record update completion', () => {
      const updateData = {
        timestamp: new Date().toISOString(),
        duration: 1800000, // 30 minutes
        entitiesAdded: 100,
        entitiesUpdated: 50,
        entitiesRemoved: 10,
        errors: 0
      };
      
      mockUpdateService.emit('update:complete', updateData);
      
      expect(monitor.metrics.updates).toHaveLength(1);
      expect(monitor.metrics.updates[0]).toEqual(updateData);
    });

    it('should create alert for slow updates', () => {
      const alertSpy = vi.fn();
      monitor.on('alert:created', alertSpy);
      
      mockUpdateService.emit('update:complete', {
        timestamp: new Date().toISOString(),
        duration: 4000000, // Over 1 hour
        entitiesAdded: 100
      });
      
      expect(alertSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'slow_update',
          severity: 'warning'
        })
      );
    });

    it('should record update errors', () => {
      mockUpdateService.emit('update:error', new Error('Update failed'));
      
      expect(monitor.metrics.errors).toHaveLength(1);
      expect(monitor.metrics.errors[0]).toMatchObject({
        type: 'update_error',
        error: 'Update failed'
      });
    });
  });

  describe('performHealthCheck', () => {
    beforeEach(() => {
      monitor = new OpenSanctionsMonitor();
    });

    it('should perform health check with healthy services', async () => {
      vi.spyOn(mockSearchService, 'search').mockResolvedValue([]);
      vi.spyOn(mockSearchService, 'getStatistics').mockResolvedValue({ total: 10000 });
      
      monitor.initialize({ searchService: mockSearchService });
      
      const healthSpy = vi.fn();
      monitor.on('health:check', healthSpy);
      
      const result = await monitor.performHealthCheck();
      
      expect(result.status).toBe('healthy');
      expect(result.checks.searchService).toBe('healthy');
      expect(result.checks.database).toBe('healthy');
      expect(result.checks.entityCount).toBe(10000);
      expect(healthSpy).toHaveBeenCalledWith(result);
    });

    it('should detect degraded service with slow searches', async () => {
      vi.spyOn(mockSearchService, 'search').mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve([]), 1500))
      );
      
      monitor.initialize({ searchService: mockSearchService });
      
      const healthPromise = monitor.performHealthCheck();
      
      // Advance timers to resolve the slow search
      vi.advanceTimersByTime(1500);
      
      const result = await healthPromise;
      
      expect(result.status).toBe('degraded');
      expect(result.checks.searchService).toBe('degraded');
    });

    it('should detect unhealthy service when database fails', async () => {
      vi.spyOn(mockSearchService, 'getStatistics').mockRejectedValue(new Error('DB error'));
      
      monitor.initialize({ searchService: mockSearchService });
      
      const result = await monitor.performHealthCheck();
      
      expect(result.status).toBe('unhealthy');
      expect(result.checks.database).toBe('unhealthy');
    });

    it('should handle unavailable search service', async () => {
      monitor.initialize({});
      
      const result = await monitor.performHealthCheck();
      
      expect(result.status).toBe('unhealthy');
      expect(result.checks.searchService).toBe('unavailable');
    });

    it('should create alert on health check failure', async () => {
      vi.spyOn(mockSearchService, 'search').mockRejectedValue(new Error('Service down'));
      
      monitor.initialize({ searchService: mockSearchService });
      
      const alertSpy = vi.fn();
      monitor.on('alert:created', alertSpy);
      
      await monitor.performHealthCheck();
      
      expect(alertSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'health_check_failed',
          severity: 'critical'
        })
      );
    });
  });

  describe('calculateMetrics', () => {
    beforeEach(() => {
      monitor = new OpenSanctionsMonitor();
      
      // Add test data
      const now = new Date();
      const thirtyMinutesAgo = new Date(now.getTime() - 1800000); // 30 minutes ago
      const twoHoursAgo = new Date(now.getTime() - 7200000);
      
      monitor.metrics.searches = [
        { timestamp: now.toISOString(), duration: 100 },
        { timestamp: now.toISOString(), duration: 200 },
        { timestamp: thirtyMinutesAgo.toISOString(), duration: 150 }
        // Don't include twoHoursAgo as it should be excluded from calculations
      ];
      
      monitor.metrics.errors = [
        { timestamp: now.toISOString(), type: 'search_error' }
        // Don't include twoHoursAgo as it should be excluded from calculations
      ];
      
      monitor.metrics.cacheHits = 8;
      monitor.metrics.cacheMisses = 2;
    });

    it('should calculate search metrics correctly', () => {
      const metrics = monitor.calculateMetrics();
      
      expect(metrics.search.totalSearches).toBe(3);
      expect(metrics.search.averageLatency).toBe(150); // (100+200+150)/3
      expect(metrics.search.searchesPerMinute).toBeCloseTo(0.4); // 2 in last 5 min / 5
    });

    it('should calculate error rate correctly', () => {
      const metrics = monitor.calculateMetrics();
      
      expect(metrics.errorRate).toBeCloseTo(0.333, 2); // 1 error / 3 searches
      expect(metrics.recentErrors).toBe(1);
    });

    it('should calculate cache hit rate correctly', () => {
      const metrics = monitor.calculateMetrics();
      
      expect(metrics.cacheHitRate).toBe(0.8); // 8 hits / 10 total
    });

    it('should emit metrics event', () => {
      const metricsSpy = vi.fn();
      monitor.on('metrics:calculated', metricsSpy);
      
      const metrics = monitor.calculateMetrics();
      
      expect(metricsSpy).toHaveBeenCalledWith(metrics);
    });

    it('should handle empty metrics', () => {
      monitor.metrics.searches = [];
      monitor.metrics.errors = [];
      monitor.metrics.cacheHits = 0;
      monitor.metrics.cacheMisses = 0;
      
      const metrics = monitor.calculateMetrics();
      
      expect(metrics.search.averageLatency).toBe(0);
      expect(metrics.errorRate).toBe(0);
      expect(metrics.cacheHitRate).toBe(0);
    });
  });

  describe('checkAlertConditions', () => {
    beforeEach(() => {
      monitor = new OpenSanctionsMonitor({
        alertThresholds: {
          searchLatency: 100,
          errorRate: 0.1,
          cacheHitRate: 0.8
        }
      });
    });

    it('should create alert for high latency', () => {
      const now = new Date();
      monitor.metrics.searches = [
        { timestamp: now.toISOString(), duration: 200 },
        { timestamp: now.toISOString(), duration: 300 }
      ];
      
      const alertSpy = vi.fn();
      monitor.on('alert:created', alertSpy);
      
      monitor.checkAlertConditions();
      
      expect(alertSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'high_latency',
          severity: 'warning'
        })
      );
    });

    it('should create alert for high error rate', () => {
      const now = new Date();
      monitor.metrics.searches = Array(10).fill({ timestamp: now.toISOString(), duration: 50 });
      monitor.metrics.errors = Array(2).fill({ timestamp: now.toISOString(), type: 'error' });
      
      const alertSpy = vi.fn();
      monitor.on('alert:created', alertSpy);
      
      monitor.checkAlertConditions();
      
      expect(alertSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'high_error_rate',
          severity: 'critical'
        })
      );
    });

    it('should create alert for low cache hit rate', () => {
      monitor.metrics.cacheHits = 5;
      monitor.metrics.cacheMisses = 5;
      
      const alertSpy = vi.fn();
      monitor.on('alert:created', alertSpy);
      
      monitor.checkAlertConditions();
      
      expect(alertSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'low_cache_hit_rate',
          severity: 'info'
        })
      );
    });
  });

  describe('createAlert', () => {
    beforeEach(() => {
      monitor = new OpenSanctionsMonitor();
    });

    it('should create new alert with unique ID', () => {
      const alertSpy = vi.fn();
      monitor.on('alert:created', alertSpy);
      
      monitor.createAlert({
        type: 'test_alert',
        severity: 'warning',
        message: 'Test alert'
      });
      
      expect(monitor.alerts).toHaveLength(1);
      expect(monitor.alerts[0]).toMatchObject({
        id: expect.stringMatching(/^alert_\d+_[a-z0-9]+$/),
        timestamp: expect.any(String),
        type: 'test_alert',
        severity: 'warning',
        message: 'Test alert'
      });
      expect(alertSpy).toHaveBeenCalled();
    });

    it('should prevent duplicate alerts within 1 hour', () => {
      monitor.createAlert({
        type: 'duplicate_test',
        severity: 'warning',
        message: 'First alert'
      });
      
      monitor.createAlert({
        type: 'duplicate_test',
        severity: 'warning',
        message: 'Second alert'
      });
      
      expect(monitor.alerts).toHaveLength(1);
    });

    it('should allow same alert type after 1 hour', () => {
      const oldAlert = {
        id: 'old_alert',
        timestamp: new Date(Date.now() - 3700000).toISOString(), // Over 1 hour ago
        type: 'old_test',
        severity: 'info'
      };
      
      monitor.alerts = [oldAlert];
      
      monitor.createAlert({
        type: 'old_test',
        severity: 'info',
        message: 'New alert'
      });
      
      expect(monitor.alerts).toHaveLength(2);
    });
  });

  describe('getter methods', () => {
    beforeEach(() => {
      monitor = new OpenSanctionsMonitor();
      
      // Add test data
      const now = new Date();
      monitor.metrics.searches = [
        { timestamp: now.toISOString(), duration: 100 }
      ];
      monitor.metrics.health = [
        { timestamp: now.toISOString(), status: 'healthy' }
      ];
      monitor.alerts = [
        { timestamp: now.toISOString(), type: 'test1' },
        { timestamp: new Date(now.getTime() - 25 * 3600000).toISOString(), type: 'test2' } // 25 hours ago
      ];
    });

    it('should get current metrics', () => {
      const metrics = monitor.getCurrentMetrics();
      
      expect(metrics).toHaveProperty('timestamp');
      expect(metrics).toHaveProperty('search');
      expect(metrics).toHaveProperty('errorRate');
      expect(metrics).toHaveProperty('cacheHitRate');
    });

    it('should get recent alerts', () => {
      const recentAlerts = monitor.getRecentAlerts(24);
      
      expect(recentAlerts).toHaveLength(1);
      expect(recentAlerts[0].type).toBe('test1');
    });

    it('should get health status', () => {
      const health = monitor.getHealthStatus();
      
      expect(health.status).toBe('healthy');
    });

    it('should return unknown health when no data', () => {
      monitor.metrics.health = [];
      
      const health = monitor.getHealthStatus();
      
      expect(health.status).toBe('unknown');
    });
  });

  describe('data persistence', () => {
    beforeEach(() => {
      monitor = new OpenSanctionsMonitor();
    });

    it('should persist data to files', async () => {
      const fs = vi.mocked(await import('fs'));
      
      monitor.metrics.searches = [{ test: 'data' }];
      monitor.alerts = [{ alert: 'data' }];
      
      monitor.persistData();
      
      expect(fs.writeFileSync).toHaveBeenCalledTimes(2);
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('opensanctions-metrics.json'),
        expect.stringContaining('"test": "data"')
      );
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('opensanctions-alerts.json'),
        expect.stringContaining('"alert": "data"')
      );
    });

    it('should handle persistence errors gracefully', async () => {
      const fs = vi.mocked(await import('fs'));
      fs.writeFileSync.mockImplementation(() => {
        throw new Error('Write failed');
      });
      
      expect(() => monitor.persistData()).not.toThrow();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to persist data'),
        expect.any(Error)
      );
    });
  });

  describe('trimMetrics', () => {
    beforeEach(() => {
      monitor = new OpenSanctionsMonitor({ retentionDays: 1 });
      
      const now = new Date();
      const oneDayAgo = new Date(now.getTime() - 24 * 3600000);
      const twoDaysAgo = new Date(now.getTime() - 48 * 3600000);
      
      monitor.metrics.searches = [
        { timestamp: now.toISOString() },
        { timestamp: new Date(now.getTime() - 12 * 3600000).toISOString() }, // 12 hours ago
        { timestamp: twoDaysAgo.toISOString() }
      ];
      
      monitor.metrics.errors = [
        { timestamp: now.toISOString() },
        { timestamp: twoDaysAgo.toISOString() }
      ];
      
      monitor.alerts = [
        { timestamp: now.toISOString() },
        { timestamp: twoDaysAgo.toISOString() }
      ];
    });

    it('should trim old metrics data', () => {
      monitor.trimMetrics();
      
      expect(monitor.metrics.searches).toHaveLength(2); // Current and 1 day old
      expect(monitor.metrics.errors).toHaveLength(1);
      expect(monitor.alerts).toHaveLength(1);
    });
  });

  describe('generateReport', () => {
    beforeEach(() => {
      monitor = new OpenSanctionsMonitor();
      
      // Add test data
      const now = new Date();
      monitor.metrics.searches = [
        { timestamp: now.toISOString(), duration: 100 }
      ];
      monitor.metrics.health = [
        { timestamp: now.toISOString(), status: 'healthy' }
      ];
      monitor.alerts = [
        { timestamp: now.toISOString(), severity: 'critical' },
        { timestamp: now.toISOString(), severity: 'warning' },
        { timestamp: now.toISOString(), severity: 'info' }
      ];
      monitor.metrics.updates = [
        { timestamp: now.toISOString(), duration: 1800000 }
      ];
      monitor.metrics.cacheHits = 8;
      monitor.metrics.cacheMisses = 2;
    });

    it('should generate daily report', () => {
      const report = monitor.generateReport('daily');
      
      expect(report).toMatchObject({
        period: 'daily',
        generatedAt: expect.any(String),
        health: 'healthy',
        metrics: {
          searches: 1,
          averageLatency: '100ms',
          errorRate: '0.0%',
          cacheHitRate: '80.0%'
        },
        alerts: {
          total: 3,
          critical: 1,
          warning: 1,
          info: 1
        }
      });
      expect(report.recentUpdates).toHaveLength(1);
    });

    it('should generate weekly report', () => {
      const report = monitor.generateReport('weekly');
      
      expect(report.period).toBe('weekly');
    });
  });

  describe('monitoring tasks', () => {
    beforeEach(() => {
      monitor = new OpenSanctionsMonitor({
        metricsInterval: 100,
        healthCheckInterval: 200
      });
    });

    it('should run metrics collection periodically', () => {
      const calculateSpy = vi.spyOn(monitor, 'calculateMetrics');
      const checkAlertSpy = vi.spyOn(monitor, 'checkAlertConditions');
      const persistSpy = vi.spyOn(monitor, 'persistData');
      
      monitor.initialize({});
      
      expect(monitor.metricsTask).not.toBeNull();
      
      // Fast forward time
      vi.advanceTimersByTime(100);
      
      expect(calculateSpy).toHaveBeenCalled();
      expect(checkAlertSpy).toHaveBeenCalled();
      expect(persistSpy).toHaveBeenCalled();
    });

    it('should run health checks periodically', () => {
      const healthCheckSpy = vi.spyOn(monitor, 'performHealthCheck');
      
      monitor.initialize({});
      
      expect(monitor.healthCheckTask).not.toBeNull();
      
      // Initial health check
      expect(healthCheckSpy).toHaveBeenCalledTimes(1);
      
      // Fast forward time
      vi.advanceTimersByTime(200);
      
      expect(healthCheckSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('stop', () => {
    beforeEach(() => {
      monitor = new OpenSanctionsMonitor();
      monitor.initialize({});
    });

    it('should stop all monitoring tasks', () => {
      const persistSpy = vi.spyOn(monitor, 'persistData');
      const stoppedSpy = vi.fn();
      monitor.on('stopped', stoppedSpy);
      
      monitor.stop();
      
      expect(monitor.metricsTask).toBeNull();
      expect(monitor.healthCheckTask).toBeNull();
      expect(persistSpy).toHaveBeenCalled();
      expect(stoppedSpy).toHaveBeenCalled();
    });

    it('should handle stop when not initialized', () => {
      const newMonitor = new OpenSanctionsMonitor();
      
      expect(() => newMonitor.stop()).not.toThrow();
    });
  });
});