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
APP_DIR="/home/ec2-user/app"
REPO_URL="https://github.com/Dxstvn/python-cryptoscrow-backend.git"
SERVICE_NAME="cryptoescrow"
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

# Step 1: Update system
print_status "Updating system packages..."
sudo yum update -y

# Step 2: Install Node.js if not already installed
if ! command -v node &> /dev/null; then
    print_status "Installing Node.js ${NODE_VERSION}..."
    curl -fsSL https://rpm.nodesource.com/setup_${NODE_VERSION}.x | sudo bash -
    sudo yum install -y nodejs
else
    print_status "Node.js is already installed: $(node --version)"
fi

# Step 3: Install global dependencies
print_status "Installing global dependencies..."
sudo npm install -g pm2

# Step 4: Create application directory
print_status "Setting up application directory..."
mkdir -p $APP_DIR
cd $APP_DIR

# Step 5: Clone or update repository
if [ -d ".git" ]; then
    print_status "Updating existing repository..."
    git fetch origin
    git reset --hard origin/main
else
    print_status "Cloning repository..."
    git clone $REPO_URL .
fi

# Step 6: Install dependencies
print_status "Installing application dependencies..."
npm install --production

# Step 7: Set up environment file
if [ ! -f ".env" ]; then
    print_warning "Environment file not found. Please create .env file with production configuration."
    print_warning "You can use aws-deployment/env.production.template as a reference."
else
    print_status "Environment file found"
fi

# Step 8: Create logs directory
mkdir -p logs

# Step 9: Set up PM2
print_status "Setting up PM2 process manager..."
if pm2 list | grep -q "cryptoescrow-backend"; then
    print_status "Reloading existing PM2 process..."
    pm2 reload ecosystem.config.js --env production
else
    print_status "Starting new PM2 process..."
    pm2 start ecosystem.config.js --env production
fi

# Step 10: Save PM2 configuration
pm2 save
pm2 startup systemd -u ec2-user --hp /home/ec2-user

# Step 11: Set up log rotation
print_status "Setting up log rotation..."
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
pm2 set pm2-logrotate:compress true

# Step 12: Display status
print_status "Deployment completed! Here's the current status:"
pm2 list
pm2 logs --lines 10

echo -e "${GREEN}🎉 Deployment completed successfully!${NC}"
echo -e "${BLUE}Your application should be running on port 3000${NC}"
echo -e "${BLUE}You can check logs with: pm2 logs cryptoescrow-backend${NC}"
echo -e "${BLUE}You can restart with: pm2 restart cryptoescrow-backend${NC}" 