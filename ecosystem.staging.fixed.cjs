module.exports = {
  apps: [{
    name: 'cryptoescrow-backend-staging',
    script: './src/server.js',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'staging',
      USE_AWS_SECRETS: 'true',
      AWS_REGION: 'us-east-1',
      PORT: '5173',
      FIREBASE_PROJECT_ID: 'escrowstaging',
      FIREBASE_STORAGE_BUCKET: 'escrowstaging.appspot.com',
      FIREBASE_API_KEY: 'AIzaSyAEnTHpQpcgzWvDfiusF90-beSGCz5pva8',
      FIREBASE_AUTH_DOMAIN: 'escrowstaging.firebaseapp.com',
      FIREBASE_MESSAGING_SENDER_ID: '960491714548',
      FIREBASE_APP_ID: '1:960491714548:web:f1b418ffaddd0ba2cc2ba',
      FIREBASE_MEASUREMENT_ID: 'G-07NYQBYP9N',
      CHAIN_ID: '11155111',
      RPC_URL: 'https://sepolia.infura.io/v3/4af9a8307a914da58937e8da53c602f9',
      FRONTEND_URL: 'https://staging.clearhold.app',
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