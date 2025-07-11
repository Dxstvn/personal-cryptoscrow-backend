#!/bin/bash

# Deployment script for EC2 with AWS Secrets Manager
# This script configures the backend to use AWS Secrets Manager instead of .env files

set -e

echo "🚀 Deploying CryptoEscrow Backend with AWS Secrets Manager..."

# Check if we're on EC2 instance
if [ ! -f /etc/ec2-metadata ]; then
    echo "⚠️  Warning: This doesn't appear to be an EC2 instance"
    echo "Make sure IAM roles are configured correctly for AWS Secrets Manager access"
fi

# Pull latest code
echo "📥 Pulling latest code from git..."
git pull origin main

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Create PM2 ecosystem file with AWS Secrets Manager enabled
echo "📝 Creating PM2 ecosystem file..."
cat > ecosystem.production.js << 'EOF'
module.exports = {
  apps: [{
    name: 'cryptoescrow-backend',
    script: './src/server.js',
    instances: 1,
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
      USE_AWS_SECRETS: 'true',
      AWS_REGION: 'us-east-1'
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
    watch: false,
    max_memory_restart: '1G'
  }]
};
EOF

# Create staging ecosystem file
cat > ecosystem.staging.js << 'EOF'
module.exports = {
  apps: [{
    name: 'cryptoescrow-backend-staging',
    script: './src/server.js',
    instances: 1,
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'staging',
      PORT: 3001,
      USE_AWS_SECRETS: 'true',
      AWS_REGION: 'us-east-1'
    },
    error_file: './logs/staging-err.log',
    out_file: './logs/staging-out.log',
    log_file: './logs/staging-combined.log',
    time: true,
    watch: false,
    max_memory_restart: '1G'
  }]
};
EOF

# Test AWS Secrets Manager connection
echo "🔐 Testing AWS Secrets Manager connection..."
node test-aws-secrets.js

if [ $? -eq 0 ]; then
    echo "✅ AWS Secrets Manager test passed!"
    
    # Backup and remove .env file if it exists
    if [ -f .env ]; then
        echo "📦 Backing up .env file..."
        mv .env .env.backup.$(date +%Y%m%d_%H%M%S)
        echo "✅ .env file backed up and removed"
    fi
    
    # Restart PM2 application
    echo "🔄 Restarting PM2 application..."
    pm2 stop cryptoescrow-backend || true
    pm2 delete cryptoescrow-backend || true
    pm2 start ecosystem.production.js
    pm2 save
    
    echo "✅ Deployment complete! Backend is now using AWS Secrets Manager"
    echo "📊 Check application status with: pm2 status"
    echo "📋 View logs with: pm2 logs cryptoescrow-backend"
else
    echo "❌ AWS Secrets Manager test failed!"
    echo "Please check:"
    echo "1. IAM role is attached to EC2 instance"
    echo "2. IAM role has secretsmanager:GetSecretValue permission"
    echo "3. Secrets exist in AWS Secrets Manager"
    exit 1
fi