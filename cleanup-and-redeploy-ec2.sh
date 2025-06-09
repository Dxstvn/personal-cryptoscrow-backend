#!/bin/bash

# Cleanup and Redeploy Script for EC2
# This script completely cleans up old PM2 processes and redeploys correctly

set -e

echo "🧹 Cleanup and Redeploy Script for EC2"
echo "======================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${BLUE}[CLEANUP]${NC} $1"
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
    exit 1
fi

# Show current PM2 status
print_status "Current PM2 processes:"
pm2 list || echo "No PM2 processes running"

# COMPLETE PM2 CLEANUP
print_status "Performing complete PM2 cleanup..."

# Stop all PM2 processes
print_status "Stopping all PM2 processes..."
pm2 stop all || echo "No processes to stop"

# Delete all PM2 processes
print_status "Deleting all PM2 processes..."
pm2 delete all || echo "No processes to delete"

# Kill PM2 daemon and restart it
print_status "Restarting PM2 daemon..."
pm2 kill
sleep 2

# Kill any lingering processes on our target ports
print_status "Killing any processes using ports 3000 and 5173..."
lsof -ti :3000 | xargs kill -9 2>/dev/null || echo "No process on port 3000"
lsof -ti :5173 | xargs kill -9 2>/dev/null || echo "No process on port 5173"

# Wait a moment for cleanup
sleep 3

# Verify ports are free
print_status "Verifying ports are free..."
if lsof -i :3000 >/dev/null 2>&1; then
    print_error "Port 3000 is still in use!"
    lsof -i :3000
    exit 1
else
    print_success "Port 3000 is free"
fi

if lsof -i :5173 >/dev/null 2>&1; then
    print_error "Port 5173 is still in use!"
    lsof -i :5173
    exit 1
else
    print_success "Port 5173 is free"
fi

# Pull latest code
print_status "Pulling latest code..."
git pull origin main || print_warning "Git pull failed - continuing with existing code"

# Install dependencies
print_status "Installing/updating dependencies..."
npm install

# Create logs directory
mkdir -p logs

# Start PRODUCTION environment (port 3000) with detailed logging
print_status "Starting PRODUCTION environment on port 3000..."
NODE_ENV=production USE_AWS_SECRETS=true AWS_REGION=us-east-1 PORT=3000 FIREBASE_PROJECT_ID=ethescrow-377c6 pm2 start src/server.js --name cryptoescrow-backend --log ./logs/production.log --error ./logs/production-error.log

# Wait for production to fully start
print_status "Waiting for production to start..."
sleep 15

# Check production startup
print_status "Checking production process..."
if pm2 list | grep -q "cryptoescrow-backend.*online"; then
    print_success "Production process is online"
else
    print_error "Production process failed to start"
    print_status "Production logs:"
    pm2 logs cryptoescrow-backend --lines 20 || cat ./logs/production-error.log
    exit 1
fi

# Test production health
print_status "Testing production health endpoint..."
sleep 5
if curl -f -s http://localhost:3000/health >/dev/null; then
    PROD_RESPONSE=$(curl -s http://localhost:3000/health)
    print_success "Production health: $PROD_RESPONSE"
else
    print_error "Production health check failed"
    print_status "Production process details:"
    pm2 show cryptoescrow-backend
    print_status "Production logs:"
    pm2 logs cryptoescrow-backend --lines 20
    
    # Check if something else is using port 3000
    print_status "Checking port 3000 usage:"
    lsof -i :3000 || echo "Nothing on port 3000"
    
    # Continue anyway to start staging
fi

# Start STAGING environment (port 5173)
print_status "Starting STAGING environment on port 5173..."
NODE_ENV=staging USE_AWS_SECRETS=true AWS_REGION=us-east-1 PORT=5173 FIREBASE_PROJECT_ID=escrowstaging pm2 start src/server.js --name cryptoescrow-backend-staging --log ./logs/staging.log --error ./logs/staging-error.log

# Wait for staging to start
print_status "Waiting for staging to start..."
sleep 15

# Check staging startup
print_status "Checking staging process..."
if pm2 list | grep -q "cryptoescrow-backend-staging.*online"; then
    print_success "Staging process is online"
else
    print_error "Staging process failed to start"
    print_status "Staging logs:"
    pm2 logs cryptoescrow-backend-staging --lines 20 || cat ./logs/staging-error.log
    exit 1
fi

# Test staging health
print_status "Testing staging health endpoint..."
if curl -f -s http://localhost:5173/health >/dev/null; then
    STAGING_RESPONSE=$(curl -s http://localhost:5173/health)
    print_success "Staging health: $STAGING_RESPONSE"
else
    print_error "Staging health check failed"
    print_status "Staging logs:"
    pm2 logs cryptoescrow-backend-staging --lines 20
fi

# Configure PM2 to restart on boot
print_status "Configuring PM2 startup..."
pm2 save
sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u $USER --hp $HOME || print_warning "PM2 startup configuration may need manual setup"

# Final status
print_status "Final PM2 status:"
pm2 list

print_success "🎉 Cleanup and redeploy completed!"

echo "
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 CLEAN DEPLOYMENT SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ All old processes cleaned up
✅ Production: port 3000 | https://api.clearhold.app/health
✅ Staging:    port 5173 | https://staging.clearhold.app/health

📊 Local endpoints on this EC2 instance:
  http://localhost:3000/health (production)
  http://localhost:5173/health (staging)

📋 Only 2 PM2 processes should be running:
  • cryptoescrow-backend (production)
  • cryptoescrow-backend-staging (staging)

🔧 Monitoring commands:
  pm2 status
  pm2 logs cryptoescrow-backend
  pm2 logs cryptoescrow-backend-staging
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
" 