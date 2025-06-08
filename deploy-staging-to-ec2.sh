#!/bin/bash

# Deploy Staging Environment to EC2
# This script deploys your staging app to EC2 for use with the ALB

set -e

echo "🚀 Deploying Staging Environment to EC2..."

# Check if we're running on EC2
if curl -s --max-time 2 http://169.254.169.254/latest/meta-data/instance-id >/dev/null 2>&1; then
    echo "✅ Running on EC2 instance"
    INSTANCE_ID=$(curl -s http://169.254.169.254/latest/meta-data/instance-id)
    echo "Instance ID: $INSTANCE_ID"
else
    echo "❌ Not running on EC2. Please run this script on your EC2 instance."
    echo "💡 You can either:"
    echo "   1. SSH into your EC2 instance and run this script there"
    echo "   2. Use AWS Systems Manager Session Manager"
    echo "   3. Deploy via CI/CD pipeline"
    exit 1
fi

# Create logs directory
mkdir -p logs

# Install dependencies (if not already installed)
echo "📦 Installing dependencies..."
npm install

# Stop existing staging process (if any)
echo "🛑 Stopping existing staging process..."
pm2 stop cryptoescrow-backend-staging 2>/dev/null || echo "No existing staging process found"
pm2 delete cryptoescrow-backend-staging 2>/dev/null || echo "No staging process to delete"

# Start staging environment
echo "🚀 Starting staging environment..."
NODE_ENV=staging pm2 start ecosystem.staging.cjs --env staging

# Verify staging is running
echo "🔍 Verifying staging deployment..."
sleep 5

# Check if process is running
if pm2 list | grep -q "cryptoescrow-backend-staging.*online"; then
    echo "✅ Staging process is running"
else
    echo "❌ Staging process failed to start"
    pm2 logs cryptoescrow-backend-staging --lines 20
    exit 1
fi

# Test health endpoint
echo "🩺 Testing health endpoint..."
if curl -f -s http://localhost:3001/health >/dev/null; then
    echo "✅ Health endpoint responding"
    curl -s http://localhost:3001/health | jq .
else
    echo "❌ Health endpoint not responding"
    echo "📋 Recent logs:"
    pm2 logs cryptoescrow-backend-staging --lines 10
    exit 1
fi

# Configure PM2 to restart on boot
echo "🔄 Configuring PM2 startup..."
pm2 save
pm2 startup systemd -u $USER --hp $HOME 2>/dev/null || echo "PM2 startup already configured"

echo "
🎉 Staging deployment complete!

✅ Staging app running on port 3001
✅ Health endpoint: http://localhost:3001/health
✅ PM2 process: cryptoescrow-backend-staging

Next steps:
1. Create target group for port 3001 in AWS console
2. Add listener rule for staging.clearhold.app
3. Test: https://staging.clearhold.app/health

To monitor:
  pm2 logs cryptoescrow-backend-staging
  pm2 status
" 