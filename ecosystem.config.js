module.exports = {
  apps: [{
    name: 'clearhold-backend',
    script: './src/server.js',
    instances: 1,
    exec_mode: 'fork',
    watch: false,
    max_memory_restart: '1G',
    env_staging: {
      NODE_ENV: 'staging',
      PORT: 3000
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: '/var/log/clearhold/error.log',
    out_file: '/var/log/clearhold/out.log',
    log_file: '/var/log/clearhold/combined.log',
    time: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    
    // Restart policy
    min_uptime: '10s',
    max_restarts: 10,
    autorestart: true,
    restart_delay: 4000,
    
    // Graceful shutdown
    kill_timeout: 5000,
    listen_timeout: 3000,
    
    // Environment variable handling
    instance_var: 'INSTANCE_ID',
    
    // Monitoring
    pmx: true,
    
    // Auto-restart on file changes (disabled in production)
    ignore_watch: ['node_modules', 'logs', '.git', 'coverage', 'tmp'],
    
    // Memory monitoring
    monitor_options: {
      http: true,
      https: false,
      network: true,
      ports: true
    }
  }],

  // Deployment configuration
  deploy: {
    staging: {
      user: 'ec2-user',
      host: process.env.STAGING_HOST,
      ref: 'origin/develop',
      repo: 'git@github.com:clearhold/personal-cryptoscrow-backend.git',
      path: '/opt/clearhold/staging',
      'post-deploy': 'npm install && pm2 reload ecosystem.config.js --env staging',
      'pre-deploy-local': 'echo "Deploying to staging server"'
    },
    production: {
      user: 'ec2-user',
      host: process.env.PRODUCTION_HOST,
      ref: 'origin/main',
      repo: 'git@github.com:clearhold/personal-cryptoscrow-backend.git',
      path: '/opt/clearhold/production',
      'post-deploy': 'npm install && pm2 reload ecosystem.config.js --env production',
      'pre-deploy-local': 'echo "Deploying to production server"'
    }
  }
};