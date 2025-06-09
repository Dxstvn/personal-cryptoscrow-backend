#!/bin/bash

# Deploy Production Environment to EC2 - UPDATED VERSION
# This script deploys your production app to EC2 using the working PM2 method

set -e

echo "🚀 Deploying Production Environment to EC2 (Updated)..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${BLUE}[PRODUCTION]${NC} $1"
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

# Stop existing production process (if any)
print_status "Stopping existing production process..."
pm2 stop cryptoescrow-backend 2>/dev/null || echo "No existing production process found"
pm2 delete cryptoescrow-backend 2>/dev/null || echo "No production process to delete"

# Kill any process using port 3000 (in case Docker or other services are running)
print_status "Checking port 3000 availability..."
if lsof -i :3000 >/dev/null 2>&1; then
    print_warning "Port 3000 is in use. Attempting to free it..."
    lsof -ti :3000 | xargs kill -9 2>/dev/null || print_warning "Could not kill process on port 3000"
    sleep 2
fi

# Start production environment using the WORKING method
print_status "Starting production environment with working configuration..."
NODE_ENV=production USE_AWS_SECRETS=true AWS_REGION=us-east-1 PORT=3000 FIREBASE_PROJECT_ID=ethescrow-377c6 pm2 start src/server.js --name cryptoescrow-backend

# Verify production is running
print_status "Verifying production deployment..."
sleep 10

# Check if process is running
if pm2 list | grep -q "cryptoescrow-backend.*online"; then
    print_success "Production process is running"
else
    print_error "Production process failed to start"
    pm2 logs cryptoescrow-backend --lines 20
    exit 1
fi

# Test health endpoint on correct port (3000)
print_status "Testing health endpoint on port 3000..."
if curl -f -s http://localhost:3000/health >/dev/null; then
    print_success "Health endpoint responding"
    HEALTH_RESPONSE=$(curl -s http://localhost:3000/health)
    echo "Response: $HEALTH_RESPONSE"
else
    print_error "Health endpoint not responding on port 3000"
    echo "📋 Recent logs:"
    pm2 logs cryptoescrow-backend --lines 10
    
    # Try to diagnose the issue
    print_status "Diagnosing issue..."
    print_status "PM2 process status:"
    pm2 show cryptoescrow-backend
    
    print_status "Port usage check:"
    lsof -i :3000 || echo "Nothing listening on port 3000"
    
    exit 1
fi

# Configure PM2 to restart on boot
print_status "Configuring PM2 startup..."
pm2 save
sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u $USER --hp $HOME || print_warning "PM2 startup configuration may need manual setup"

print_success "🎉 Production deployment complete!"

echo "
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 PRODUCTION DEPLOYMENT SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Production app running on port 3000
✅ Health endpoint: http://localhost:3000/health
✅ PM2 process: cryptoescrow-backend
✅ Environment: production
✅ Firebase Project: ethescrow-377c6
✅ AWS Secrets Manager: enabled
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🌐 External URL: https://api.clearhold.app/health

📊 Monitoring commands:
  pm2 logs cryptoescrow-backend
  pm2 status
  pm2 restart cryptoescrow-backend
  
⚠️  IMPORTANT: Ensure your AWS Load Balancer target group
   points to port 3000 for production traffic routing.
" 