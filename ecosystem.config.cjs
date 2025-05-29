module.exports = {
  apps: [{
    name: 'cryptoescrow-backend',
    script: 'src/server.js',
    instances: 1, // Single instance only
    exec_mode: 'fork', // Fork mode instead of cluster
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'development',
      PORT: 3000
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000,
      USE_AWS_SECRETS: 'true',
      AWS_REGION: 'us-east-1'
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
    log_date_format: 'YYYY-MM-DD HH:mm Z',
    merge_logs: true,
    autorestart: true,
    max_restarts: 10,
    min_uptime: '10s',
    // Health check
    health_check_grace_period: 3000,
    // Graceful shutdown
    kill_timeout: 5000,
    listen_timeout: 3000,
    // Advanced PM2 features
    instance_var: 'INSTANCE_ID',
    // Monitoring
    monitoring: false,
    pmx: false
  }],

  deploy: {
    production: {
      user: 'ec2-user',
      host: 'your-ec2-public-ip-or-domain',
      ref: 'origin/main',
      repo: 'https://github.com/Dxstvn/personal-cryptoscrow-backend.git',
      path: '/home/ec2-user/app',
      'pre-deploy-local': '',
      'post-deploy': 'npm install && pm2 reload ecosystem.config.cjs --env production',
      'pre-setup': ''
    }
  }
}; 