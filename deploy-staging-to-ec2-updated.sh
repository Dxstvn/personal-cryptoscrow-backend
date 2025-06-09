#!/bin/bash

# Deploy Staging Environment to EC2 - UPDATED VERSION
# This script deploys your staging app to EC2 using the working PM2 method

set -e

echo "🚀 Deploying Staging Environment to EC2 (Updated)..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${BLUE}[STAGING]${NC} $1"
}

print_success() {
    echo -e "${GREEN}✅${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠️${NC} $1"
}

print_error() {
    echo -e "${RED}❌${NC} $1"
}

# Check if we're running on EC2
if curl -s --max-time 2 http://169.254.169.254/latest/meta-data/instance-id >/dev/null 2>&1; then
    print_success "Running on EC2 instance"
    INSTANCE_ID=$(curl -s http://169.254.169.254/latest/meta-data/instance-id)
    print_status "Instance ID: $INSTANCE_ID"
else
    print_error "Not running on EC2. Please run this script on your EC2 instance."
    echo "💡 You can either:"
    echo "   1. SSH into your EC2 instance and run this script there"
    echo "   2. Use AWS Systems Manager Session Manager"
    echo "   3. Deploy via CI/CD pipeline"
    exit 1
fi

# Create logs directory
print_status "Creating logs directory..."
mkdir -p logs

# Pull latest code
print_status "Pulling latest code from git..."
git pull origin main || print_warning "Git pull failed - continuing with existing code"

# Install dependencies
print_status "Installing/updating dependencies..."
npm install

# Stop existing staging process (if any)
print_status "Stopping existing staging process..."
pm2 stop cryptoescrow-backend-staging 2>/dev/null || echo "No existing staging process found"
pm2 delete cryptoescrow-backend-staging 2>/dev/null || echo "No staging process to delete"

# Start staging environment using the WORKING method
print_status "Starting staging environment with working configuration..."
NODE_ENV=staging USE_AWS_SECRETS=true AWS_REGION=us-east-1 PORT=5173 FIREBASE_PROJECT_ID=escrowstaging pm2 start src/server.js --name cryptoescrow-backend-staging

# Verify staging is running
print_status "Verifying staging deployment..."
sleep 10

# Check if process is running
if pm2 list | grep -q "cryptoescrow-backend-staging.*online"; then
    print_success "Staging process is running"
else
    print_error "Staging process failed to start"
    pm2 logs cryptoescrow-backend-staging --lines 20
    exit 1
fi

# Test health endpoint on correct port (5173)
print_status "Testing health endpoint on port 5173..."
if curl -f -s http://localhost:5173/health >/dev/null; then
    print_success "Health endpoint responding"
    HEALTH_RESPONSE=$(curl -s http://localhost:5173/health)
    echo "Response: $HEALTH_RESPONSE"
else
    print_error "Health endpoint not responding on port 5173"
    echo "📋 Recent logs:"
    pm2 logs cryptoescrow-backend-staging --lines 10
    
    # Try to diagnose the issue
    print_status "Diagnosing issue..."
    print_status "PM2 process status:"
    pm2 show cryptoescrow-backend-staging
    
    print_status "Port usage check:"
    lsof -i :5173 || echo "Nothing listening on port 5173"
    
    exit 1
fi

# Configure PM2 to restart on boot
print_status "Configuring PM2 startup..."
pm2 save
sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u $USER --hp $HOME || print_warning "PM2 startup configuration may need manual setup"

print_success "🎉 Staging deployment complete!"

echo "
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 STAGING DEPLOYMENT SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Staging app running on port 5173
✅ Health endpoint: http://localhost:5173/health
✅ PM2 process: cryptoescrow-backend-staging
✅ Environment: staging
✅ Firebase Project: escrowstaging
✅ AWS Secrets Manager: enabled
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🌐 External URL: https://staging.clearhold.app/health

📊 Monitoring commands:
  pm2 logs cryptoescrow-backend-staging
  pm2 status
  pm2 restart cryptoescrow-backend-staging
" 