// Staking mechanism monitoring dashboard configuration
import express from 'express';
import { getDb } from '../services/databaseService.js';
import { getSecurityMetrics } from '../services/securityLogger.js';
import { Timestamp } from 'firebase-admin/firestore';

const router = express.Router();

/**
 * Get real-time staking metrics
 */
router.get('/metrics/staking', async (req, res) => {
  try {
    const db = await getDb();
    const metrics = await getStakingMetrics(db);
    res.json({ success: true, metrics });
  } catch (error) {
    console.error('[Monitoring] Failed to get staking metrics:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Get security metrics for staking
 */
router.get('/metrics/security', async (req, res) => {
  try {
    const metrics = await getSecurityMetrics();
    res.json({ success: true, metrics });
  } catch (error) {
    console.error('[Monitoring] Failed to get security metrics:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Get reputation distribution
 */
router.get('/metrics/reputation', async (req, res) => {
  try {
    const db = await getDb();
    const distribution = await getReputationDistribution(db);
    res.json({ success: true, distribution });
  } catch (error) {
    console.error('[Monitoring] Failed to get reputation distribution:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Get active alerts
 */
router.get('/alerts', async (req, res) => {
  try {
    const db = await getDb();
    const alerts = await getActiveAlerts(db);
    res.json({ success: true, alerts });
  } catch (error) {
    console.error('[Monitoring] Failed to get alerts:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Prometheus metrics endpoint for staking
 */
router.get('/prometheus', async (req, res) => {
  try {
    const db = await getDb();
    const metrics = await getStakingMetrics(db);
    const prometheusFormat = formatPrometheusMetrics(metrics);
    res.set('Content-Type', 'text/plain');
    res.send(prometheusFormat);
  } catch (error) {
    console.error('[Monitoring] Failed to generate Prometheus metrics:', error);
    res.status(500).send('# Error generating metrics');
  }
});

// Helper functions

async function getStakingMetrics(db) {
  const now = new Date();
  const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);
  const oneHourAgo = new Date(now - 60 * 60 * 1000);
  
  // Get dispute stakes
  const disputeStakes = await db.collection('disputeStakes')
    .where('createdAt', '>=', Timestamp.fromDate(oneDayAgo))
    .get();
  
  // Calculate metrics
  const metrics = {
    totalStakesLocked: 0,
    totalStakesReturned: 0,
    totalStakesSlashed: 0,
    activeDisputes: 0,
    stakesLastHour: 0,
    averageStakeAmount: 0,
    averageStakePercentage: 0,
    slashingRate: 0,
    stakesByStatus: {
      locked: 0,
      returned: 0,
      slashed: 0,
      partial_return: 0
    },
    stakesByToken: {},
    highValueStakes: 0,
    reputationImpact: {
      improved: 0,
      degraded: 0,
      unchanged: 0
    }
  };
  
  let totalAmount = 0;
  let totalPercentage = 0;
  let stakesWithOutcome = 0;
  
  disputeStakes.forEach(doc => {
    const stake = doc.data();
    
    // Count by status
    metrics.stakesByStatus[stake.status]++;
    
    // Track token distribution
    const token = stake.stakeToken || 'ETH';
    metrics.stakesByToken[token] = (metrics.stakesByToken[token] || 0) + 1;
    
    // Sum amounts
    if (stake.stakeAmount) {
      totalAmount += stake.stakeAmount;
      if (stake.stakeAmount > 1000) {
        metrics.highValueStakes++;
      }
    }
    
    // Sum percentages
    if (stake.stakePercentage) {
      totalPercentage += stake.stakePercentage;
    }
    
    // Track timing
    if (stake.createdAt && stake.createdAt.toDate() > oneHourAgo) {
      metrics.stakesLastHour++;
    }
    
    // Track outcomes
    if (stake.status === 'locked') {
      metrics.activeDisputes++;
      metrics.totalStakesLocked += stake.stakeAmount || 0;
    } else if (stake.status === 'returned') {
      metrics.totalStakesReturned += stake.stakeAmount || 0;
      stakesWithOutcome++;
    } else if (stake.status === 'slashed') {
      metrics.totalStakesSlashed += stake.stakeAmount || 0;
      stakesWithOutcome++;
    }
  });
  
  // Calculate averages
  if (disputeStakes.size > 0) {
    metrics.averageStakeAmount = totalAmount / disputeStakes.size;
    metrics.averageStakePercentage = totalPercentage / disputeStakes.size;
  }
  
  // Calculate slashing rate
  if (stakesWithOutcome > 0) {
    metrics.slashingRate = metrics.stakesByStatus.slashed / stakesWithOutcome;
  }
  
  // Get reputation changes
  const reputationChanges = await db.collection('reputationHistory')
    .where('timestamp', '>=', Timestamp.fromDate(oneDayAgo))
    .get();
  
  reputationChanges.forEach(doc => {
    const change = doc.data();
    if (change.pointsChanged > 0) {
      metrics.reputationImpact.improved++;
    } else if (change.pointsChanged < 0) {
      metrics.reputationImpact.degraded++;
    } else {
      metrics.reputationImpact.unchanged++;
    }
  });
  
  return metrics;
}

async function getReputationDistribution(db) {
  const users = await db.collection('users')
    .select('reputationScore')
    .get();
  
  const distribution = {
    total: users.size,
    tiers: {
      restricted: 0,    // 0-199
      probation: 0,     // 200-499
      standard: 0,      // 500-749
      good: 0,          // 750-899
      excellent: 0      // 900-1000
    },
    average: 0,
    median: 0,
    percentiles: {}
  };
  
  const scores = [];
  
  users.forEach(doc => {
    const score = doc.data().reputationScore || 1000;
    scores.push(score);
    
    if (score < 200) distribution.tiers.restricted++;
    else if (score < 500) distribution.tiers.probation++;
    else if (score < 750) distribution.tiers.standard++;
    else if (score < 900) distribution.tiers.good++;
    else distribution.tiers.excellent++;
  });
  
  // Calculate statistics
  if (scores.length > 0) {
    scores.sort((a, b) => a - b);
    distribution.average = scores.reduce((a, b) => a + b, 0) / scores.length;
    distribution.median = scores[Math.floor(scores.length / 2)];
    distribution.percentiles = {
      p10: scores[Math.floor(scores.length * 0.1)],
      p25: scores[Math.floor(scores.length * 0.25)],
      p75: scores[Math.floor(scores.length * 0.75)],
      p90: scores[Math.floor(scores.length * 0.9)]
    };
  }
  
  return distribution;
}

async function getActiveAlerts(db) {
  const alerts = await db.collection('securityAlerts')
    .where('status', '==', 'PENDING')
    .orderBy('alertedAt', 'desc')
    .limit(50)
    .get();
  
  const alertList = [];
  alerts.forEach(doc => {
    alertList.push({
      id: doc.id,
      ...doc.data(),
      timestamp: doc.data().alertedAt?.toDate?.() || doc.data().timestamp
    });
  });
  
  return alertList;
}

function formatPrometheusMetrics(metrics) {
  return `
# HELP staking_total_locked Total amount currently locked in stakes
# TYPE staking_total_locked gauge
staking_total_locked ${metrics.totalStakesLocked}

# HELP staking_total_returned Total amount returned to users
# TYPE staking_total_returned counter
staking_total_returned ${metrics.totalStakesReturned}

# HELP staking_total_slashed Total amount slashed from stakes
# TYPE staking_total_slashed counter
staking_total_slashed ${metrics.totalStakesSlashed}

# HELP staking_active_disputes Number of active disputes
# TYPE staking_active_disputes gauge
staking_active_disputes ${metrics.activeDisputes}

# HELP staking_slashing_rate Rate of stakes being slashed
# TYPE staking_slashing_rate gauge
staking_slashing_rate ${metrics.slashingRate}

# HELP staking_average_amount Average stake amount
# TYPE staking_average_amount gauge
staking_average_amount ${metrics.averageStakeAmount}

# HELP staking_high_value_count Number of high value stakes
# TYPE staking_high_value_count gauge
staking_high_value_count ${metrics.highValueStakes}

# HELP staking_hourly_rate Stakes created in the last hour
# TYPE staking_hourly_rate gauge
staking_hourly_rate ${metrics.stakesLastHour}
`;
}

export default router;