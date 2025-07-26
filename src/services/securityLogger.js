// Security-focused logging service for staking mechanism
import winston from 'winston';
import { getDb } from './databaseService.js';
import { Timestamp } from 'firebase-admin/firestore';
import crypto from 'crypto';

// Create security-specific logger
const createSecurityLogger = () => {
  const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.json()
    ),
    defaultMeta: { service: 'security-staking' },
    transports: [
      // Security events file
      new winston.transports.File({ 
        filename: 'logs/security-events.log',
        level: 'info'
      }),
      // Security errors file
      new winston.transports.File({ 
        filename: 'logs/security-errors.log', 
        level: 'error' 
      }),
      // Critical alerts file
      new winston.transports.File({
        filename: 'logs/critical-alerts.log',
        level: 'error',
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.printf(info => {
            return `[CRITICAL] ${info.timestamp} - ${info.message} - ${JSON.stringify(info.metadata)}`;
          })
        )
      })
    ]
  });

  // Add console transport in development
  if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }));
  }

  return logger;
};

const logger = createSecurityLogger();

/**
 * Security event types for categorization
 */
export const SecurityEventType = {
  STAKE_LOCKED: 'STAKE_LOCKED',
  STAKE_RETURNED: 'STAKE_RETURNED',
  STAKE_SLASHED: 'STAKE_SLASHED',
  DISPUTE_RAISED: 'DISPUTE_RAISED',
  DISPUTE_RESOLVED: 'DISPUTE_RESOLVED',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  SUSPICIOUS_ACTIVITY: 'SUSPICIOUS_ACTIVITY',
  REPUTATION_MANIPULATION: 'REPUTATION_MANIPULATION',
  HIGH_VALUE_OPERATION: 'HIGH_VALUE_OPERATION',
  EMERGENCY_ACTION: 'EMERGENCY_ACTION',
  ACCESS_DENIED: 'ACCESS_DENIED',
  BALANCE_CHECK_FAILED: 'BALANCE_CHECK_FAILED'
};

/**
 * Log security event with full context
 */
export const logSecurityEvent = async (eventType, eventData) => {
  try {
    const event = {
      id: crypto.randomUUID(),
      type: eventType,
      timestamp: new Date().toISOString(),
      ...eventData
    };

    // Log to Winston
    logger.info(`Security Event: ${eventType}`, { metadata: event });

    // Store critical events in Firestore for audit trail
    if (shouldStoreInDatabase(eventType)) {
      const db = await getDb();
      await db.collection('securityEvents').add({
        ...event,
        timestamp: Timestamp.now(),
        indexed: true
      });
    }

    // Trigger alerts for critical events
    if (isCriticalEvent(eventType, eventData)) {
      await triggerSecurityAlert(event);
    }

    return event.id;
  } catch (error) {
    logger.error('Failed to log security event', { error: error.message, eventType, eventData });
  }
};

/**
 * Log stake operation with transaction details
 */
export const logStakeOperation = async (operation, details) => {
  const { userId, dealId, amount, txHash, chainId, token, reputationScore } = details;
  
  return logSecurityEvent(operation, {
    userId,
    dealId,
    stakeAmount: amount,
    stakeToken: token,
    transactionHash: txHash,
    chainId,
    userReputationAtTime: reputationScore,
    blockNumber: details.blockNumber,
    gasUsed: details.gasUsed
  });
};

/**
 * Monitor for suspicious staking patterns
 */
export const detectSuspiciousPatterns = async (userId) => {
  try {
    const db = await getDb();
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    
    // Check recent dispute activity
    const recentDisputes = await db.collection('securityEvents')
      .where('userId', '==', userId)
      .where('type', 'in', ['DISPUTE_RAISED', 'STAKE_SLASHED'])
      .where('timestamp', '>=', Timestamp.fromDate(oneHourAgo))
      .get();
    
    const patterns = {
      rapidDisputes: recentDisputes.size > 3,
      highSlashRate: false,
      reputationGaming: false
    };
    
    // Check slash rate
    let slashCount = 0;
    let disputeCount = 0;
    recentDisputes.forEach(doc => {
      const data = doc.data();
      if (data.type === 'STAKE_SLASHED') slashCount++;
      if (data.type === 'DISPUTE_RAISED') disputeCount++;
    });
    
    if (disputeCount > 0) {
      patterns.highSlashRate = (slashCount / disputeCount) > 0.7;
    }
    
    // Check for reputation manipulation
    const reputationHistory = await db.collection('reputationHistory')
      .where('userId', '==', userId)
      .orderBy('timestamp', 'desc')
      .limit(10)
      .get();
    
    if (reputationHistory.size >= 5) {
      const scores = reputationHistory.docs.map(doc => doc.data().newScore);
      const avgChange = Math.abs(scores[0] - scores[scores.length - 1]) / scores.length;
      patterns.reputationGaming = avgChange > 50; // Suspicious if avg change > 50 points
    }
    
    // Log if suspicious patterns detected
    if (Object.values(patterns).some(p => p)) {
      await logSecurityEvent(SecurityEventType.SUSPICIOUS_ACTIVITY, {
        userId,
        patterns,
        severity: 'HIGH'
      });
    }
    
    return patterns;
  } catch (error) {
    logger.error('Failed to detect suspicious patterns', { error: error.message, userId });
    return null;
  }
};

/**
 * Log reputation changes with context
 */
export const logReputationChange = async (userId, oldScore, newScore, reason, relatedDealId) => {
  const change = newScore - oldScore;
  const severity = Math.abs(change) > 100 ? 'HIGH' : 'NORMAL';
  
  return logSecurityEvent(SecurityEventType.REPUTATION_MANIPULATION, {
    userId,
    previousScore: oldScore,
    newScore,
    change,
    reason,
    relatedDealId,
    severity
  });
};

/**
 * Create security metrics for monitoring
 */
export const getSecurityMetrics = async () => {
  try {
    const db = await getDb();
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    // Get event counts by type
    const events = await db.collection('securityEvents')
      .where('timestamp', '>=', Timestamp.fromDate(oneDayAgo))
      .get();
    
    const metrics = {
      totalEvents: events.size,
      eventsByType: {},
      criticalEvents: 0,
      suspiciousUsers: new Set(),
      totalStakeVolume: 0,
      slashingRate: 0
    };
    
    events.forEach(doc => {
      const data = doc.data();
      metrics.eventsByType[data.type] = (metrics.eventsByType[data.type] || 0) + 1;
      
      if (data.severity === 'CRITICAL' || data.severity === 'HIGH') {
        metrics.criticalEvents++;
      }
      
      if (data.type === SecurityEventType.SUSPICIOUS_ACTIVITY) {
        metrics.suspiciousUsers.add(data.userId);
      }
      
      if (data.stakeAmount) {
        metrics.totalStakeVolume += data.stakeAmount;
      }
    });
    
    // Calculate slashing rate
    const stakes = metrics.eventsByType[SecurityEventType.STAKE_LOCKED] || 0;
    const slashes = metrics.eventsByType[SecurityEventType.STAKE_SLASHED] || 0;
    metrics.slashingRate = stakes > 0 ? (slashes / stakes) : 0;
    
    metrics.suspiciousUsers = metrics.suspiciousUsers.size;
    
    return metrics;
  } catch (error) {
    logger.error('Failed to generate security metrics', { error: error.message });
    return null;
  }
};

// Helper functions
const shouldStoreInDatabase = (eventType) => {
  const storedEvents = [
    SecurityEventType.STAKE_LOCKED,
    SecurityEventType.STAKE_RETURNED,
    SecurityEventType.STAKE_SLASHED,
    SecurityEventType.DISPUTE_RAISED,
    SecurityEventType.DISPUTE_RESOLVED,
    SecurityEventType.SUSPICIOUS_ACTIVITY,
    SecurityEventType.REPUTATION_MANIPULATION,
    SecurityEventType.EMERGENCY_ACTION,
    SecurityEventType.HIGH_VALUE_OPERATION
  ];
  return storedEvents.includes(eventType);
};

const isCriticalEvent = (eventType, eventData) => {
  // Always critical
  const criticalTypes = [
    SecurityEventType.EMERGENCY_ACTION,
    SecurityEventType.REPUTATION_MANIPULATION
  ];
  
  if (criticalTypes.includes(eventType)) return true;
  
  // Conditionally critical based on data
  if (eventType === SecurityEventType.STAKE_SLASHED && eventData.stakeAmount > 1000) return true;
  if (eventType === SecurityEventType.HIGH_VALUE_OPERATION && eventData.amount > 10000) return true;
  if (eventType === SecurityEventType.SUSPICIOUS_ACTIVITY && eventData.severity === 'HIGH') return true;
  
  return false;
};

const triggerSecurityAlert = async (event) => {
  // In production, this would integrate with monitoring services
  logger.error('[SECURITY ALERT]', event);
  
  // Store alert for dashboard
  try {
    const db = await getDb();
    await db.collection('securityAlerts').add({
      ...event,
      alertedAt: Timestamp.now(),
      status: 'PENDING'
    });
  } catch (error) {
    logger.error('Failed to store security alert', { error: error.message });
  }
};

export default {
  logSecurityEvent,
  logStakeOperation,
  detectSuspiciousPatterns,
  logReputationChange,
  getSecurityMetrics,
  SecurityEventType
};