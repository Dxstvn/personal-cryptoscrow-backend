#!/bin/bash

# CryptoEscrow Backend - GLIBC Compatible Node.js Installation Fix
# This script resolves GLIBC compatibility issues on Amazon Linux 2023

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🔧 CryptoEscrow Backend - GLIBC Compatible Node.js Fix${NC}"
echo "============================================================"

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
SERVICE_NAME="cryptoescrow-backend"

# Check if running as ec2-user
if [ "$USER" != "ec2-user" ]; then
    print_error "This script should be run as ec2-user"
    exit 1
fi

print_info "Analyzing system compatibility..."

# Step 1: Check system information
print_info "System Information:"
echo "OS: $(cat /etc/os-release | grep PRETTY_NAME | cut -d'"' -f2)"
echo "Kernel: $(uname -r)"
echo "Architecture: $(uname -m)"

# Check GLIBC version
GLIBC_VERSION=$(ldd --version | head -1 | grep -o '[0-9]\+\.[0-9]\+' | head -1)
echo "GLIBC Version: $GLIBC_VERSION"

# Step 2: Stop any existing processes
print_info "Stopping existing processes..."
pm2 delete all || true
pm2 kill || true

# Step 3: Remove problematic Node.js installations
print_info "Cleaning up existing Node.js installations..."

# Remove NVM installation
rm -rf ~/.nvm || true
sed -i '/NVM_DIR/d' ~/.bashrc || true
sed -i '/nvm.sh/d' ~/.bashrc || true
sed -i '/bash_completion/d' ~/.bashrc || true

# Remove NodeSource repository
sudo rm -f /etc/yum.repos.d/nodesource* || true

# Remove existing Node.js
sudo yum remove -y nodejs npm || true

# Clear any cached packages
sudo yum clean all

# Step 4: Install Node.js using Amazon Linux's package manager (most compatible)
print_info "Installing Node.js using Amazon Linux package manager..."

# Update packages first
sudo yum update -y

# Try to install Node.js from Amazon Linux extras first (most compatible)
if sudo amazon-linux-extras list | grep -q "nodejs"; then
    print_info "Installing Node.js from Amazon Linux Extras..."
    sudo amazon-linux-extras enable nodejs18
    sudo yum install -y nodejs npm
elif sudo yum list available | grep -q "nodejs"; then
    print_info "Installing Node.js from default repositories..."
    sudo yum install -y nodejs npm
else
    # Fallback: Use EPEL repository
    print_warning "Using EPEL repository as fallback..."
    sudo yum install -y epel-release
    sudo yum install -y nodejs npm
fi

# Verify installation
print_info "Verifying Node.js installation..."
NODE_VERSION=$(node --version 2>/dev/null || echo "FAILED")
NPM_VERSION=$(npm --version 2>/dev/null || echo "FAILED")

if [ "$NODE_VERSION" = "FAILED" ] || [ "$NPM_VERSION" = "FAILED" ]; then
    print_error "Node.js installation failed. Trying alternative approach..."
    
    # Alternative: Download pre-compiled Node.js binary compatible with older GLIBC
    print_info "Downloading GLIBC-compatible Node.js binary..."
    
    cd /tmp
    # Use Node.js 16 which has better compatibility with older GLIBC
    wget https://nodejs.org/dist/v16.20.2/node-v16.20.2-linux-x64.tar.xz
    tar -xf node-v16.20.2-linux-x64.tar.xz
    
    # Install to /opt/nodejs
    sudo mkdir -p /opt/nodejs
    sudo cp -r node-v16.20.2-linux-x64/* /opt/nodejs/
    
    # Create symlinks
    sudo ln -sf /opt/nodejs/bin/node /usr/local/bin/node
    sudo ln -sf /opt/nodejs/bin/npm /usr/local/bin/npm
    sudo ln -sf /opt/nodejs/bin/npx /usr/local/bin/npx
    
    # Update PATH for ec2-user
    echo 'export PATH="/opt/nodejs/bin:$PATH"' >> ~/.bashrc
    export PATH="/opt/nodejs/bin:$PATH"
    
    # Verify again
    NODE_VERSION=$(node --version 2>/dev/null || echo "FAILED")
    NPM_VERSION=$(npm --version 2>/dev/null || echo "FAILED")
    
    if [ "$NODE_VERSION" = "FAILED" ] || [ "$NPM_VERSION" = "FAILED" ]; then
        print_error "All Node.js installation methods failed"
        exit 1
    fi
fi

print_status "Node.js successfully installed: $NODE_VERSION"
print_status "NPM successfully installed: $NPM_VERSION"

# Step 5: Install PM2 globally
print_info "Installing PM2 globally..."
sudo npm install -g pm2

# Step 6: Navigate to application directory
print_info "Setting up application..."
cd $APP_DIR

# Clean up any stale files
rm -f start-server.js server.js || true

# Step 7: Fresh git pull
print_info "Updating application code..."
git fetch origin
git reset --hard origin/main
git clean -fd

# Step 8: Clean install dependencies
print_info "Installing application dependencies..."
rm -rf node_modules package-lock.json || true

# Install with specific Node.js version
npm install --production

# Verify critical dependencies
print_info "Verifying critical dependencies..."
MISSING_DEPS=()

# Check for essential dependencies
if ! npm list node-fetch > /dev/null 2>&1; then
    MISSING_DEPS+=("node-fetch")
fi

if ! npm list @aws-sdk/client-secrets-manager > /dev/null 2>&1; then
    MISSING_DEPS+=("@aws-sdk/client-secrets-manager")
fi

# Install missing dependencies
if [ ${#MISSING_DEPS[@]} -gt 0 ]; then
    print_warning "Installing missing dependencies: ${MISSING_DEPS[*]}"
    npm install ${MISSING_DEPS[@]}
fi

# Step 9: Verify environment file
if [ ! -f ".env" ]; then
    print_warning "Creating environment file from template..."
    cp aws-deployment/env.production.template .env
fi

# Step 10: Create logs directory
mkdir -p logs

# Step 11: Test application startup
print_info "Testing application startup..."
timeout 15s node src/server.js > logs/startup-test.log 2>&1 || true

if grep -q "Server running" logs/startup-test.log || grep -q "listening" logs/startup-test.log; then
    print_status "Application startup test passed"
elif grep -q "Error" logs/startup-test.log; then
    print_warning "Application has startup issues. Check logs/startup-test.log"
    cat logs/startup-test.log
else
    print_info "Startup test completed (timeout expected for infinite loop)"
fi

# Step 12: Start with PM2
print_info "Starting application with PM2..."
pm2 start ecosystem.config.cjs --env production

# Step 13: Configure PM2 for auto-start
pm2 save
pm2 startup systemd -u ec2-user --hp /home/ec2-user

# Step 14: Set up log rotation
print_info "Setting up log rotation..."
pm2 install pm2-logrotate || true
pm2 set pm2-logrotate:max_size 10M || true
pm2 set pm2-logrotate:retain 7 || true
pm2 set pm2-logrotate:compress true || true

# Step 15: Wait for stabilization
print_info "Waiting for application to stabilize..."
sleep 5

# Step 16: Display final status
print_status "Fix completed! Final status:"
echo "Node.js Version: $(node --version)"
echo "NPM Version: $(npm --version)"
echo "PM2 Status:"
pm2 list

# Step 17: Test health endpoint
print_info "Testing health endpoint..."
sleep 3
if curl -f http://localhost:3000/health > /dev/null 2>&1; then
    print_status "Health check passed! Application is running correctly."
else
    print_warning "Health check failed. Checking application logs..."
    pm2 logs --lines 15
fi

echo -e "\n${GREEN}🎉 GLIBC compatibility fix completed!${NC}"
echo -e "${BLUE}Application should now be running with a compatible Node.js version${NC}"
echo -e "\n${BLUE}Commands for monitoring:${NC}"
echo -e "• pm2 status"
echo -e "• pm2 logs $SERVICE_NAME"
echo -e "• pm2 monit"
echo -e "• curl http://localhost:3000/health" 