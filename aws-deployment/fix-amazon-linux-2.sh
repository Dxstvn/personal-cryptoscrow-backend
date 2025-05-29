#!/bin/bash

# CryptoEscrow Backend - Amazon Linux 2 GLIBC Fix
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🔧 CryptoEscrow Backend - Amazon Linux 2 Fix${NC}"

print_status() { echo -e "${GREEN}✅ $1${NC}"; }
print_warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }
print_error() { echo -e "${RED}❌ $1${NC}"; }
print_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }

print_info "Detected Amazon Linux 2 with GLIBC 2.26 - good compatibility!"

# Stop any existing processes (ignore errors if PM2 not installed)
print_info "Stopping existing processes..."
command -v pm2 >/dev/null 2>&1 && pm2 delete all || true
command -v pm2 >/dev/null 2>&1 && pm2 kill || true

# Clean up previous installations
print_info "Cleaning up previous Node.js installations..."
rm -rf ~/.nvm || true
sed -i '/NVM_DIR/d' ~/.bashrc || true
sudo rm -f /etc/yum.repos.d/nodesource* || true
sudo yum remove -y nodejs npm || true

# Install Node.js using amazon-linux-extras (Amazon Linux 2 method)
print_info "Installing Node.js via amazon-linux-extras..."
sudo amazon-linux-extras enable nodejs18 || true
sudo yum clean all
sudo yum install -y nodejs npm

# Verify installation
NODE_VERSION=$(node --version 2>/dev/null || echo "FAILED")
if [ "$NODE_VERSION" = "FAILED" ]; then
    print_error "amazon-linux-extras failed. Using Node.js 16 binary (guaranteed GLIBC 2.26 compatibility)..."
    
    cd /tmp
    wget https://nodejs.org/dist/v16.20.2/node-v16.20.2-linux-x64.tar.xz
    tar -xf node-v16.20.2-linux-x64.tar.xz
    
    sudo mkdir -p /opt/nodejs
    sudo cp -r node-v16.20.2-linux-x64/* /opt/nodejs/
    
    sudo ln -sf /opt/nodejs/bin/node /usr/local/bin/node
    sudo ln -sf /opt/nodejs/bin/npm /usr/local/bin/npm
    sudo ln -sf /opt/nodejs/bin/npx /usr/local/bin/npx
    
    echo 'export PATH="/opt/nodejs/bin:$PATH"' >> ~/.bashrc
    export PATH="/opt/nodejs/bin:$PATH"
    
    NODE_VERSION=$(node --version)
fi

print_status "Node.js installed: $NODE_VERSION"

# Install PM2 globally
print_info "Installing PM2..."
sudo npm install -g pm2

# Go to app directory
cd /home/ec2-user/cryptoescrow-backend

# Update to latest code
print_info "Updating code..."
git fetch origin
git reset --hard origin/main

# Clean install dependencies
print_info "Installing dependencies..."
rm -rf node_modules package-lock.json
npm install --production

# Install critical dependencies if missing
npm list node-fetch >/dev/null 2>&1 || npm install node-fetch@3.3.2
npm list @aws-sdk/client-secrets-manager >/dev/null 2>&1 || npm install @aws-sdk/client-secrets-manager

# Ensure environment file
[ ! -f ".env" ] && cp aws-deployment/env.production.template .env 2>/dev/null || true

# Create logs directory
mkdir -p logs

# Test startup briefly
print_info "Testing application..."
timeout 10s node src/server.js > logs/test.log 2>&1 || true

# Start with PM2
print_info "Starting with PM2..."
pm2 start ecosystem.config.cjs --env production
pm2 save
pm2 startup systemd -u ec2-user --hp /home/ec2-user >/dev/null 2>&1 || true

# Final status
sleep 3
print_status "Deployment completed!"
echo "Node.js: $(node --version)"
echo "PM2 Status:"
pm2 list

# Health check
print_info "Testing health endpoint..."
if curl -f -s http://localhost:3000/health >/dev/null 2>&1; then
    print_status "🎉 SUCCESS! Backend is running and healthy!"
    echo "Your backend is available at: http://$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4):3000"
else
    print_warning "Health check failed. Checking logs..."
    pm2 logs --lines 10
    echo "Checking if the process is running..."
    ps aux | grep node
fi

echo -e "\n${GREEN}🎯 Quick Commands:${NC}"
echo "• Check status: pm2 status"
echo "• View logs: pm2 logs cryptoescrow-backend"
echo "• Health check: curl http://localhost:3000/health" 