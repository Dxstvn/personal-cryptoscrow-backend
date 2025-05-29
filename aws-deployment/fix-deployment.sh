#!/bin/bash

# CryptoEscrow Backend - Deployment Fix Script
# This script fixes common deployment issues and ensures clean operation

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🔧 CryptoEscrow Backend - Deployment Fix Script${NC}"
echo "========================================================"

print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

# Configuration
APP_DIR="/home/ec2-user/cryptoescrow-backend"
REPO_URL="https://github.com/Dxstvn/personal-cryptoscrow-backend.git"
SERVICE_NAME="cryptoescrow-backend"

# Check if running as ec2-user
if [ "$USER" != "ec2-user" ]; then
    print_error "This script should be run as ec2-user"
    exit 1
fi

print_info "Starting deployment fix process..."

# Step 1: Stop current PM2 processes
print_info "Stopping any running PM2 processes..."
pm2 delete all || true
pm2 kill || true

# Step 2: Clean up any stale files
print_info "Cleaning up stale files..."
cd $APP_DIR
rm -f start-server.js || true
rm -f server.js || true  # In case there's a conflicting server.js in root

# Step 3: Ensure we're on the latest code
print_info "Updating to latest code..."
git fetch origin
git reset --hard origin/main
git clean -fd

# Step 4: Clear node_modules and reinstall dependencies
print_info "Reinstalling dependencies..."
rm -rf node_modules
rm -f package-lock.json
npm install --production

# Step 5: Verify node-fetch is installed
print_info "Verifying dependencies..."
if npm list node-fetch > /dev/null 2>&1; then
    print_status "node-fetch is properly installed"
else
    print_warning "Installing node-fetch explicitly..."
    npm install node-fetch@3.3.2
fi

# Step 6: Verify environment setup
if [ ! -f ".env" ]; then
    print_warning "Environment file not found. Creating from template..."
    cp aws-deployment/env.production.template .env
    print_warning "Please review and update .env file with your configuration"
fi

# Step 7: Create logs directory
mkdir -p logs
touch logs/out.log logs/err.log logs/combined.log

# Step 8: Test the application startup
print_info "Testing application startup..."
timeout 10s node src/server.js > /dev/null 2>&1 || true

# Step 9: Start PM2 with fresh configuration
print_info "Starting PM2 with fresh configuration..."
pm2 start ecosystem.config.cjs --env production

# Step 10: Save PM2 configuration
pm2 save
pm2 startup systemd -u ec2-user --hp /home/ec2-user

# Step 11: Set up log rotation
print_info "Setting up log rotation..."
pm2 install pm2-logrotate || true
pm2 set pm2-logrotate:max_size 10M || true
pm2 set pm2-logrotate:retain 7 || true
pm2 set pm2-logrotate:compress true || true

# Step 12: Wait and check status
print_info "Waiting for application to stabilize..."
sleep 5

# Step 13: Display status
print_status "Deployment fix completed! Current status:"
pm2 list
echo ""
print_info "Recent logs:"
pm2 logs --lines 10

# Step 14: Test health endpoint
print_info "Testing health endpoint..."
if curl -f http://localhost:3000/health > /dev/null 2>&1; then
    print_status "Health check passed!"
else
    print_warning "Health check failed. Check logs for more details."
fi

echo -e "\n${GREEN}🎉 Deployment fix completed!${NC}"
echo -e "${BLUE}Next steps:${NC}"
echo -e "1. Check logs: pm2 logs ${SERVICE_NAME}"
echo -e "2. Monitor status: pm2 monit"
echo -e "3. Test your API endpoints"
echo -e "4. If issues persist, check AWS Secrets Manager configuration" 