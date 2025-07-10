// Deprecation Monitor - Tracks usage of deprecated services
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAdminApp } from '../api/routes/auth/admin.js';

class DeprecationMonitor {
  constructor() {
    this.deprecatedServices = [
      'contractDeployer.js',
      'crossChainContractDeployer.js',
      'smartContractBridgeService.js',
      'crossChainService.js',
      'blockchainService.js'
    ];
    this.usageStats = new Map();
    this.db = null;
  }

  async initialize() {
    const adminApp = await getAdminApp();
    this.db = getFirestore(adminApp);
  }

  // Log usage of deprecated service
  async logUsage(serviceName, methodName, userId = 'unknown') {
    const timestamp = new Date();
    const key = `${serviceName}:${methodName}`;
    
    // Update in-memory stats
    if (!this.usageStats.has(key)) {
      this.usageStats.set(key, { count: 0, lastUsed: null, users: new Set() });
    }
    
    const stats = this.usageStats.get(key);
    stats.count++;
    stats.lastUsed = timestamp;
    stats.users.add(userId);
    
    // Log to console with warning
    console.warn(`[DEPRECATION USAGE] Service: ${serviceName}, Method: ${methodName}, User: ${userId}, Time: ${timestamp.toISOString()}`);
    
    // Store in Firestore for persistence
    try {
      if (!this.db) await this.initialize();
      
      await this.db.collection('deprecation_logs').add({
        service: serviceName,
        method: methodName,
        userId,
        timestamp,
        environment: process.env.NODE_ENV || 'development'
      });
    } catch (error) {
      console.error('[DEPRECATION MONITOR] Failed to log to Firestore:', error);
    }
  }

  // Get usage report
  async getUsageReport() {
    const report = {
      summary: {},
      details: [],
      recommendations: []
    };
    
    // Convert Map to report format
    for (const [key, stats] of this.usageStats) {
      const [service, method] = key.split(':');
      
      if (!report.summary[service]) {
        report.summary[service] = {
          totalCalls: 0,
          uniqueUsers: new Set(),
          methods: []
        };
      }
      
      report.summary[service].totalCalls += stats.count;
      stats.users.forEach(user => report.summary[service].uniqueUsers.add(user));
      report.summary[service].methods.push({
        method,
        count: stats.count,
        lastUsed: stats.lastUsed
      });
      
      report.details.push({
        service,
        method,
        count: stats.count,
        uniqueUsers: stats.users.size,
        lastUsed: stats.lastUsed
      });
    }
    
    // Convert Sets to counts
    for (const service in report.summary) {
      report.summary[service].uniqueUsers = report.summary[service].uniqueUsers.size;
    }
    
    // Add recommendations
    if (report.details.length > 0) {
      report.recommendations.push('Migrate all deprecated service usage to escrowServiceV3.js');
      report.recommendations.push('Review MIGRATION_GUIDE.md for detailed migration steps');
      
      // Service-specific recommendations
      const highUsageServices = report.details
        .filter(d => d.count > 10)
        .map(d => d.service);
      
      if (highUsageServices.length > 0) {
        report.recommendations.push(`Priority migration needed for: ${highUsageServices.join(', ')}`);
      }
    }
    
    return report;
  }

  // Get historical usage from Firestore
  async getHistoricalUsage(days = 7) {
    if (!this.db) await this.initialize();
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    const snapshot = await this.db.collection('deprecation_logs')
      .where('timestamp', '>=', startDate)
      .orderBy('timestamp', 'desc')
      .get();
    
    const usage = {};
    
    snapshot.forEach(doc => {
      const data = doc.data();
      const key = `${data.service}:${data.method}`;
      
      if (!usage[key]) {
        usage[key] = {
          service: data.service,
          method: data.method,
          calls: [],
          uniqueUsers: new Set()
        };
      }
      
      usage[key].calls.push({
        userId: data.userId,
        timestamp: data.timestamp.toDate()
      });
      usage[key].uniqueUsers.add(data.userId);
    });
    
    // Convert to array and calculate stats
    return Object.values(usage).map(item => ({
      service: item.service,
      method: item.method,
      totalCalls: item.calls.length,
      uniqueUsers: item.uniqueUsers.size,
      firstCall: item.calls[item.calls.length - 1]?.timestamp,
      lastCall: item.calls[0]?.timestamp,
      calls: item.calls
    }));
  }

  // Clear old logs (retention policy)
  async cleanupOldLogs(retentionDays = 30) {
    if (!this.db) await this.initialize();
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    
    const snapshot = await this.db.collection('deprecation_logs')
      .where('timestamp', '<', cutoffDate)
      .get();
    
    const batch = this.db.batch();
    let count = 0;
    
    snapshot.forEach(doc => {
      batch.delete(doc.ref);
      count++;
    });
    
    if (count > 0) {
      await batch.commit();
      console.log(`[DEPRECATION MONITOR] Cleaned up ${count} old deprecation logs`);
    }
    
    return count;
  }
}

// Export singleton instance
export const deprecationMonitor = new DeprecationMonitor();

// Example usage in deprecated services:
// import { deprecationMonitor } from './deprecationMonitor.js';
// deprecationMonitor.logUsage('contractDeployer.js', 'deployPropertyEscrowContract', userId);