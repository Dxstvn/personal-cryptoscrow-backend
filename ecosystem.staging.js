module.exports = {
  apps: [{
    name: 'cryptoescrow-backend-staging',
    script: 'src/server.js',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env_staging: {
      NODE_ENV: 'staging',
      USE_AWS_SECRETS: 'true',
      AWS_REGION: 'us-east-1',
      PORT: 3001, // Different port from production
      
      // Firebase staging project (create separate staging project)
      FIREBASE_PROJECT_ID: 'ethescrow-staging-377c6',
      FIREBASE_STORAGE_BUCKET: 'ethescrow-staging-377c6.firebasestorage.app',
      FIREBASE_API_KEY: 'staging-api-key',
      FIREBASE_AUTH_DOMAIN: 'ethescrow-staging-377c6.firebaseapp.com',
      FIREBASE_MESSAGING_SENDER_ID: '103629169564',
      FIREBASE_APP_ID: 'staging-app-id',
      FIREBASE_MEASUREMENT_ID: 'G-STAGING',
      
      // Blockchain - use testnet for staging
      CHAIN_ID: '11155111', // Sepolia testnet
      RPC_URL: 'https://sepolia.infura.io/v3/your-staging-infura-key',
      
      // Frontend staging URL
      FRONTEND_URL: 'https://staging.clearhold.app',
      
      // Enable additional logging for staging
      DEBUG: 'cryptoescrow:*',
      LOG_LEVEL: 'debug'
    },
    error_file: './logs/staging-err.log',
    out_file: './logs/staging-out.log',
    log_file: './logs/staging-combined.log',
    time: true,
    merge_logs: true,
    max_restarts: 10,
    min_uptime: '10s'
  }]
}; 