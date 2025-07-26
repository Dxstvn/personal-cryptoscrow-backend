// Monitoring configuration for staking mechanism security

export const monitoringConfig = {
  // Alert thresholds
  alerts: {
    // Stake-related alerts
    highValueStakeThreshold: 10000, // Alert for stakes over $10k
    rapidDisputeThreshold: 3, // Alert if user raises >3 disputes per hour
    highSlashingRateThreshold: 0.3, // Alert if >30% of stakes are slashed
    
    // Reputation alerts
    rapidReputationChangeThreshold: 100, // Alert for changes >100 points
    suspiciousReputationPattern: {
      windowHours: 24,
      maxFluctuations: 5, // Alert if reputation changes >5 times in 24h
      totalChangeThreshold: 200 // Alert if total change >200 points in 24h
    },
    
    // System alerts
    contractPausedDuration: 60 * 60 * 1000, // Alert if paused >1 hour
    pendingDisputesThreshold: 50, // Alert if >50 pending disputes
    failedTransactionRate: 0.1 // Alert if >10% transactions fail
  },
  
  // Logging configuration
  logging: {
    // What to log
    logAllStakeOperations: true,
    logReputationChanges: true,
    logHighValueTransactions: true,
    logSecurityEvents: true,
    logRateLimitViolations: true,
    
    // Log retention
    retentionDays: {
      securityEvents: 365, // 1 year for security events
      stakeOperations: 180, // 6 months for stake operations
      generalLogs: 30 // 30 days for general logs
    },
    
    // Log levels
    levels: {
      security: 'info',
      stakes: 'info',
      reputation: 'info',
      system: 'warn'
    }
  },
  
  // Metrics to track
  metrics: {
    // Real-time metrics (updated every minute)
    realtime: [
      'activeDisputes',
      'totalStakesLocked',
      'pendingMultiSigOperations',
      'contractPausedStatus'
    ],
    
    // Hourly metrics
    hourly: [
      'stakesCreated',
      'stakesReturned',
      'stakesSlashed',
      'disputesRaised',
      'disputesResolved',
      'reputationChanges',
      'rateLimitViolations'
    ],
    
    // Daily metrics
    daily: [
      'totalStakeVolume',
      'slashingRate',
      'averageStakeAmount',
      'reputationDistribution',
      'userActivityPatterns',
      'systemHealthScore'
    ]
  },
  
  // Dashboard configuration
  dashboard: {
    refreshInterval: 60000, // Refresh every minute
    
    // Widgets to display
    widgets: [
      {
        name: 'Active Disputes',
        type: 'gauge',
        metric: 'activeDisputes',
        thresholds: { normal: 10, warning: 25, critical: 50 }
      },
      {
        name: 'Stake Volume (24h)',
        type: 'line',
        metric: 'totalStakeVolume',
        period: '24h'
      },
      {
        name: 'Slashing Rate',
        type: 'percentage',
        metric: 'slashingRate',
        thresholds: { normal: 0.1, warning: 0.2, critical: 0.3 }
      },
      {
        name: 'Reputation Distribution',
        type: 'pie',
        metric: 'reputationDistribution'
      },
      {
        name: 'Security Events',
        type: 'log',
        source: 'securityEvents',
        limit: 20
      },
      {
        name: 'System Health',
        type: 'status',
        checks: [
          'contractStatus',
          'databaseConnection',
          'blockchainSync',
          'apiResponseTime'
        ]
      }
    ]
  },
  
  // Integration with external monitoring services
  integrations: {
    // Prometheus metrics export
    prometheus: {
      enabled: true,
      port: 9090,
      path: '/metrics',
      prefix: 'cryptoescrow_staking_'
    },
    
    // Grafana dashboard
    grafana: {
      enabled: true,
      dashboardId: 'staking-security',
      datasource: 'prometheus'
    },
    
    // Alert channels
    alerting: {
      slack: {
        enabled: false, // Set to true and configure webhook
        webhook: process.env.SLACK_WEBHOOK_URL,
        channel: '#security-alerts',
        mentionOn: ['critical', 'emergency']
      },
      email: {
        enabled: false, // Set to true and configure SMTP
        recipients: ['security@clearhold.com'],
        smtp: {
          host: process.env.SMTP_HOST,
          port: 587,
          secure: false,
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
          }
        }
      },
      pagerduty: {
        enabled: false, // Set to true and configure
        apiKey: process.env.PAGERDUTY_API_KEY,
        serviceId: process.env.PAGERDUTY_SERVICE_ID
      }
    }
  },
  
  // Anomaly detection
  anomalyDetection: {
    enabled: true,
    
    // Patterns to detect
    patterns: {
      // Stake amount anomalies
      unusualStakeAmount: {
        method: 'statistical',
        sensitivity: 2.5, // Standard deviations from mean
        windowSize: 100 // Last 100 stakes
      },
      
      // Timing anomalies
      suspiciousTiming: {
        rapidSuccession: 60000, // Stakes within 1 minute
        unusualHours: [0, 1, 2, 3, 4, 5], // UTC hours
      },
      
      // Behavioral anomalies
      reputationGaming: {
        maxDisputesPerDay: 5,
        winLossRatioThreshold: 0.9, // Suspicious if >90% wins
        rapidScoreChanges: true
      }
    }
  },
  
  // Automated responses
  automatedResponses: {
    enabled: true,
    
    actions: {
      // Rate limit escalation
      rateLimitViolation: {
        threshold: 5, // After 5 violations
        action: 'blockUser',
        duration: 86400000 // 24 hours
      },
      
      // Suspicious activity
      suspiciousPattern: {
        action: 'flagForReview',
        notifyAdmin: true,
        restrictOperations: ['raiseDispute', 'highValueTransfer']
      },
      
      // System protection
      highLoad: {
        threshold: 1000, // Requests per minute
        action: 'enableEmergencyMode',
        scalingFactor: 2
      }
    }
  }
};

export default monitoringConfig;