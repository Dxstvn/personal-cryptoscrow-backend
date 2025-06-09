module.exports = {
  apps: [{
    name: 'cryptoescrow-backend',
    script: 'src/server.js',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    // Add node arguments for ESM support
    node_args: '--no-warnings',
    env_production: {
      NODE_ENV: 'production',
      USE_AWS_SECRETS: 'true',
      AWS_REGION: 'us-east-1',
      PORT: 3000,
      FIREBASE_API_KEY: 'AIzaSyCmiddab4u_voTUPEsIDxHr_M3LY6bJvRY',
      FIREBASE_AUTH_DOMAIN: 'ethescrow-377c6.firebaseapp.com',
      FIREBASE_PROJECT_ID: 'ethescrow-377c6',
      FIREBASE_STORAGE_BUCKET: 'ethescrow-377c6.firebasestorage.app',
      FIREBASE_MESSAGING_SENDER_ID: '103629169564',
      FIREBASE_APP_ID: '1:103629169564:web:2450fa1239dd476afc5e59',
      FIREBASE_MEASUREMENT_ID: 'G-GXB1ZWVPMN',
      CHAIN_ID: '11155111',
      FRONTEND_URL: 'https://clearhold.app'
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
    log_date_format: 'YYYY-MM-DD HH:mm Z',
    merge_logs: true,
    max_restarts: 10,
    min_uptime: '10s',
    // Health check
    health_check_grace_period: 3000,
    // Graceful shutdown
    kill_timeout: 5000,
    listen_timeout: 3000
  }]
}; 