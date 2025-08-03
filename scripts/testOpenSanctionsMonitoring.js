#!/usr/bin/env node

// scripts/testOpenSanctionsMonitoring.js

import { OpenSanctionsMonitor } from '../src/services/kyc/opensanctions/OpenSanctionsMonitor.js';
import { OpenSanctionsSQLiteService } from '../src/services/kyc/opensanctions/OpenSanctionsSQLiteService.js';
import { OpenSanctionsUpdater } from '../src/services/kyc/opensanctions/OpenSanctionsUpdater.js';

async function testMonitoring() {
  console.log('📊 Testing OpenSanctions Monitoring System');
  console.log('========================================\n');

  // Initialize services
  const searchService = new OpenSanctionsSQLiteService();
  const updateService = new OpenSanctionsUpdater({ autoUpdate: false });
  
  const monitor = new OpenSanctionsMonitor({
    metricsInterval: 5000, // 5 seconds for testing
    healthCheckInterval: 10000, // 10 seconds for testing
    alertThresholds: {
      searchLatency: 500, // 500ms for testing
      errorRate: 0.1,
      cacheHitRate: 0.5
    }
  });

  try {
    // Initialize services
    console.log('1️⃣ Initializing services...');
    await searchService.initialize();
    await updateService.initialize();
    
    monitor.initialize({
      searchService,
      updateService
    });
    
    console.log('   ✅ Services initialized\n');

    // Listen to monitoring events
    monitor.on('alert:created', (alert) => {
      console.log(`\n🚨 Alert Created: ${alert.severity.toUpperCase()}`);
      console.log(`   Type: ${alert.type}`);
      console.log(`   Message: ${alert.message}`);
    });

    monitor.on('health:check', (health) => {
      console.log(`\n🏥 Health Check: ${health.status}`);
      console.log(`   Checks:`, health.checks);
    });

    monitor.on('metrics:calculated', (metrics) => {
      console.log(`\n📈 Metrics Updated:`);
      console.log(`   Searches: ${metrics.search.totalSearches}`);
      console.log(`   Avg Latency: ${metrics.search.averageLatency.toFixed(0)}ms`);
      console.log(`   Cache Hit Rate: ${(metrics.cacheHitRate * 100).toFixed(1)}%`);
    });

    // Perform some test searches
    console.log('2️⃣ Performing test searches...\n');
    
    const testSearches = [
      'Vladimir Putin',
      'Kim Jong Un',
      'Nicolas Maduro',
      'Invalid Name That Should Not Exist',
      'Test Search'
    ];

    for (const name of testSearches) {
      console.log(`   🔍 Searching for: ${name}`);
      try {
        const results = await searchService.search(name, { limit: 3 });
        console.log(`      Found ${results.length} results`);
      } catch (error) {
        console.log(`      Error: ${error.message}`);
      }
    }

    // Wait for metrics to be calculated
    console.log('\n3️⃣ Waiting for metrics calculation...');
    await new Promise(resolve => setTimeout(resolve, 6000));

    // Get current metrics
    console.log('\n4️⃣ Current Metrics:');
    const currentMetrics = monitor.getCurrentMetrics();
    console.log('   📊 Search Performance:');
    console.log(`      - Total searches: ${currentMetrics.search.totalSearches}`);
    console.log(`      - Average latency: ${currentMetrics.search.averageLatency.toFixed(0)}ms`);
    console.log(`      - Searches per minute: ${currentMetrics.search.searchesPerMinute.toFixed(2)}`);
    console.log('   📊 System Performance:');
    console.log(`      - Error rate: ${(currentMetrics.errorRate * 100).toFixed(1)}%`);
    console.log(`      - Cache hit rate: ${(currentMetrics.cacheHitRate * 100).toFixed(1)}%`);

    // Get health status
    console.log('\n5️⃣ Health Status:');
    const health = monitor.getHealthStatus();
    console.log(`   Status: ${health.status}`);
    if (health.checks) {
      console.log('   Service Health:');
      Object.entries(health.checks).forEach(([service, status]) => {
        console.log(`      - ${service}: ${status}`);
      });
    }

    // Get alerts
    console.log('\n6️⃣ Recent Alerts:');
    const alerts = monitor.getRecentAlerts(1);
    if (alerts.length === 0) {
      console.log('   ✅ No alerts in the last hour');
    } else {
      alerts.forEach((alert, index) => {
        console.log(`   Alert ${index + 1}:`);
        console.log(`      - Type: ${alert.type}`);
        console.log(`      - Severity: ${alert.severity}`);
        console.log(`      - Message: ${alert.message}`);
        console.log(`      - Time: ${new Date(alert.timestamp).toLocaleString()}`);
      });
    }

    // Generate report
    console.log('\n7️⃣ Daily Report:');
    const report = monitor.generateReport('daily');
    console.log('   📋 Summary:');
    console.log(`      - Period: ${report.period}`);
    console.log(`      - Health: ${report.health}`);
    console.log('   📋 Metrics:');
    console.log(`      - Searches: ${report.metrics.searches}`);
    console.log(`      - Avg Latency: ${report.metrics.averageLatency}`);
    console.log(`      - Error Rate: ${report.metrics.errorRate}`);
    console.log(`      - Cache Hit Rate: ${report.metrics.cacheHitRate}`);
    console.log('   📋 Alerts Summary:');
    console.log(`      - Total: ${report.alerts.total}`);
    console.log(`      - Critical: ${report.alerts.critical}`);
    console.log(`      - Warning: ${report.alerts.warning}`);
    console.log(`      - Info: ${report.alerts.info}`);

    // Create a test alert
    console.log('\n8️⃣ Creating test alert...');
    monitor.createAlert({
      type: 'test_alert',
      severity: 'info',
      message: 'This is a test alert from the monitoring test script',
      details: { test: true }
    });

    // Wait a bit more
    await new Promise(resolve => setTimeout(resolve, 11000));

    // Clean up
    console.log('\n✅ Monitoring test completed successfully!');
    
    monitor.stop();
    await searchService.close();
    await updateService.close();

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    monitor.stop();
    await searchService.close();
    await updateService.close();
    process.exit(1);
  }

  process.exit(0);
}

testMonitoring();