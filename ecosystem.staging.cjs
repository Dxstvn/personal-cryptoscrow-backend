module.exports = {
  apps: [{
    name: 'cryptoescrow-backend-',
    script: 'src/server.js',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env_: {
      NODE_ENV: '',
      USE_AWS_SECRETS: 'true',
      AWS_REGION: 'us-east-1',
      PORT: 3001, // Different port from production
      
      // Firebase  project
      FIREBASE_PROJECT_ID: 'jaspirev4-2f12a',
      FIREBASE_STORAGE_BUCKET: 'jaspirev4-2f12a.appspot.com',
      FIREBASE_API_KEY: '-api-key-from-secrets',
      FIREBASE_AUTH_DOMAIN: 'jaspirev4-2f12a.firebaseapp.com',
      FIREBASE_MESSAGING_SENDER_ID: '-sender-from-secrets',
      FIREBASE_APP_ID: '-app-id-from-secrets',
      FIREBASE_MEASUREMENT_ID: '-measurement-from-secrets',
      
      // Blockchain - use testnet for 
      CHAIN_ID: '11155111', // Sepolia testnet
      RPC_URL: 'https://sepolia.infura.io/v3/your--infura-key',
      
      // Frontend  URL
      FRONTEND_URL: 'https://.clearhold.app',
      
      // Enable additional logging for 
      DEBUG: 'cryptoescrow:*',
      LOG_LEVEL: 'debug'
    },
    error_file: './logs/-err.log',
    out_file: './logs/-out.log',
    log_file: './logs/-combined.log',
    time: true,
    merge_logs: true,
    max_restarts: 10,
    min_uptime: '10s'
  }]
}; 