#!/bin/bash

# Deploy Both Production and Staging to Single EC2 Instance
# This script deploys both environments to the same EC2 instance using different ports

set -e

echo "🚀 Deploying Both Production & Staging to Single EC2 Instance"
echo "=============================================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${BLUE}[DEPLOY]${NC} $1"
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
    echo "💡 SSH into your EC2 instance and run this script there"
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

# Stop existing processes
print_status "Stopping existing production and staging processes..."
pm2 stop cryptoescrow-backend 2>/dev/null || echo "No existing production process found"
pm2 delete cryptoescrow-backend 2>/dev/null || echo "No production process to delete"
pm2 stop cryptoescrow-backend-staging 2>/dev/null || echo "No existing staging process found"  
pm2 delete cryptoescrow-backend-staging 2>/dev/null || echo "No staging process to delete"

# Kill any processes using the ports we need
print_status "Checking port availability..."
if lsof -i :3000 >/dev/null 2>&1; then
    print_warning "Port 3000 is in use. Attempting to free it..."
    lsof -ti :3000 | xargs kill -9 2>/dev/null || print_warning "Could not kill process on port 3000"
    sleep 2
fi

if lsof -i :5173 >/dev/null 2>&1; then
    print_warning "Port 5173 is in use. Attempting to free it..."
    lsof -ti :5173 | xargs kill -9 2>/dev/null || print_warning "Could not kill process on port 5173"
    sleep 2
fi

# Start PRODUCTION environment (port 3000)
print_status "Starting PRODUCTION environment on port 3000..."
NODE_ENV=production USE_AWS_SECRETS=true AWS_REGION=us-east-1 PORT=3000 FIREBASE_PROJECT_ID=ethescrow-377c6 pm2 start src/server.js --name cryptoescrow-backend

# Wait a moment for production to start
sleep 5

# Start STAGING environment (port 5173)
print_status "Starting STAGING environment on port 5173..."
NODE_ENV=staging USE_AWS_SECRETS=true AWS_REGION=us-east-1 PORT=5173 FIREBASE_PROJECT_ID=escrowstaging pm2 start src/server.js --name cryptoescrow-backend-staging

# Verify both are running
print_status "Verifying deployments..."
sleep 10

# Check if both processes are running
PROD_RUNNING=$(pm2 list | grep -c "cryptoescrow-backend.*online" || echo "0")
STAGING_RUNNING=$(pm2 list | grep -c "cryptoescrow-backend-staging.*online" || echo "0")

if [ "$PROD_RUNNING" -ge "1" ]; then
    print_success "Production process is running"
else
    print_error "Production process failed to start"
    pm2 logs cryptoescrow-backend --lines 10
fi

if [ "$STAGING_RUNNING" -ge "1" ]; then
    print_success "Staging process is running"
else
    print_error "Staging process failed to start"
    pm2 logs cryptoescrow-backend-staging --lines 10
fi

# Test health endpoints
print_status "Testing health endpoints..."

# Test production (port 3000)
if curl -f -s http://localhost:3000/health >/dev/null; then
    PROD_RESPONSE=$(curl -s http://localhost:3000/health)
    print_success "Production health: $PROD_RESPONSE"
else
    print_error "Production health endpoint not responding on port 3000"
fi

# Test staging (port 5173)
if curl -f -s http://localhost:5173/health >/dev/null; then
    STAGING_RESPONSE=$(curl -s http://localhost:5173/health)
    print_success "Staging health: $STAGING_RESPONSE"
else
    print_error "Staging health endpoint not responding on port 5173"
fi

# Configure PM2 to restart on boot
print_status "Configuring PM2 startup..."
pm2 save
sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u $USER --hp $HOME || print_warning "PM2 startup configuration may need manual setup"

print_success "🎉 Dual deployment complete!"

echo "
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 DUAL DEPLOYMENT SUMMARY  
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Production: port 3000 | https://api.clearhold.app/health
✅ Staging:    port 5173 | https://staging.clearhold.app/health

📊 Local endpoints on this EC2 instance:
  http://localhost:3000/health (production)  
  http://localhost:5173/health (staging)

📋 PM2 processes running:
  • cryptoescrow-backend (production)
  • cryptoescrow-backend-staging (staging)

🔧 Monitoring commands:
  pm2 status
  pm2 logs cryptoescrow-backend
  pm2 logs cryptoescrow-backend-staging
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
" 