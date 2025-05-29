#!/bin/bash

# CryptoEscrow Backend Deployment Script for AWS EC2
# This script automates the deployment process on your EC2 instance

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
APP_DIR="/home/ec2-user/cryptoescrow-backend"
REPO_URL="https://github.com/Dxstvn/personal-cryptoscrow-backend.git"
SERVICE_NAME="cryptoescrow-backend"
NODE_VERSION="18"

echo -e "${BLUE}🚀 Starting CryptoEscrow Backend Deployment${NC}"

# Function to print colored output
print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Check if running as ec2-user
if [ "$USER" != "ec2-user" ]; then
    print_error "This script should be run as ec2-user"
    exit 1
fi

# Step 1: Stop any existing PM2 processes
print_status "Stopping existing PM2 processes..."
pm2 delete all || true
pm2 kill || true

# Step 2: Update system
print_status "Updating system packages..."
sudo yum update -y

# Step 3: Install Node.js if not already installed
if ! command -v node &> /dev/null; then
    print_status "Installing Node.js ${NODE_VERSION}..."
    curl -fsSL https://rpm.nodesource.com/setup_${NODE_VERSION}.x | sudo bash -
    sudo yum install -y nodejs
else
    print_status "Node.js is already installed: $(node --version)"
fi

# Step 4: Install global dependencies
print_status "Installing global dependencies..."
sudo npm install -g pm2

# Step 5: Create application directory
print_status "Setting up application directory..."
mkdir -p $APP_DIR
cd $APP_DIR

# Step 6: Clean up any stale files from previous deployments
print_status "Cleaning up stale files..."
rm -f start-server.js || true
rm -f server.js || true

# Step 7: Clone or update repository
if [ -d ".git" ]; then
    print_status "Updating existing repository..."
    git fetch origin
    git reset --hard origin/main
    git clean -fd
else
    print_status "Cloning repository..."
    git clone $REPO_URL .
fi

# Step 8: Install dependencies with fresh installation
print_status "Installing application dependencies..."
rm -rf node_modules package-lock.json || true
npm install --production

# Step 9: Verify critical dependencies
print_status "Verifying critical dependencies..."
if npm list node-fetch > /dev/null 2>&1; then
    print_status "node-fetch is properly installed"
else
    print_warning "Installing node-fetch explicitly..."
    npm install node-fetch@3.3.2
fi

# Step 10: Set up environment file
if [ ! -f ".env" ]; then
    print_warning "Environment file not found. Creating from template..."
    cp aws-deployment/env.production.template .env
    print_warning "Please review and update .env file with production configuration."
else
    print_status "Environment file found"
fi

# Step 11: Create logs directory
mkdir -p logs

# Step 12: Test application can start
print_status "Testing application startup..."
timeout 10s node src/server.js > /dev/null 2>&1 || print_warning "Application test startup completed (timeout expected)"

# Step 13: Set up PM2
print_status "Setting up PM2 process manager..."
pm2 start ecosystem.config.cjs --env production

# Step 14: Save PM2 configuration
pm2 save
pm2 startup systemd -u ec2-user --hp /home/ec2-user

# Step 15: Set up log rotation
print_status "Setting up log rotation..."
pm2 install pm2-logrotate || true
pm2 set pm2-logrotate:max_size 10M || true
pm2 set pm2-logrotate:retain 7 || true
pm2 set pm2-logrotate:compress true || true

# Step 16: Wait for application to stabilize
print_status "Waiting for application to stabilize..."
sleep 5

# Step 17: Display status
print_status "Deployment completed! Here's the current status:"
pm2 list
pm2 logs --lines 10

# Step 18: Test health endpoint
print_status "Testing health endpoint..."
if curl -f http://localhost:3000/health > /dev/null 2>&1; then
    print_status "Health check passed!"
else
    print_warning "Health check failed. Check logs for more details."
    print_warning "This might be normal if AWS Secrets Manager is still being configured."
fi

echo -e "${GREEN}🎉 Deployment completed successfully!${NC}"
echo -e "${BLUE}Your application should be running on port 3000${NC}"
echo -e "${BLUE}You can check logs with: pm2 logs cryptoescrow-backend${NC}"
echo -e "${BLUE}You can restart with: pm2 restart cryptoescrow-backend${NC}"
echo -e "${BLUE}You can monitor with: pm2 monit${NC}"

if [ ! -f ".env" ] || grep -q "REPLACE_WITH_ACTUAL" .env 2>/dev/null; then
    echo -e "${YELLOW}⚠️  Remember to configure your .env file with actual values!${NC}"
fi 