#!/bin/bash

# CryptoEscrow Backend - Complete Amazon Linux 2 Fix
# This script completely cleans up and properly installs Node.js on Amazon Linux 2

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🔧 CryptoEscrow Backend - Complete Amazon Linux 2 Fix${NC}"
echo "==========================================================="

print_status() { echo -e "${GREEN}✅ $1${NC}"; }
print_warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }
print_error() { echo -e "${RED}❌ $1${NC}"; }
print_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }

# Confirm we're on Amazon Linux 2
OS_CHECK=$(cat /etc/os-release | grep 'VERSION="2"' || echo "")
if [ -z "$OS_CHECK" ]; then
    print_error "This script is specifically for Amazon Linux 2"
    exit 1
fi

print_status "Confirmed: Amazon Linux 2 detected"

# Step 1: Complete Node.js cleanup
print_info "STEP 1: Complete Node.js cleanup..."

# Stop any existing processes
command -v pm2 >/dev/null 2>&1 && pm2 delete all 2>/dev/null || true
command -v pm2 >/dev/null 2>&1 && pm2 kill 2>/dev/null || true

# Remove all Node.js installations
print_info "Removing all existing Node.js installations..."
rm -rf ~/.nvm 2>/dev/null || true
sudo rm -rf /opt/nodejs 2>/dev/null || true
sudo rm -f /usr/local/bin/node /usr/local/bin/npm /usr/local/bin/npx 2>/dev/null || true
sudo yum remove -y nodejs npm 2>/dev/null || true
sudo rm -f /etc/yum.repos.d/nodesource* 2>/dev/null || true

# Clean bashrc
sed -i '/nvm/d' ~/.bashrc 2>/dev/null || true
sed -i '/nodejs/d' ~/.bashrc 2>/dev/null || true
sed -i '/NVM_DIR/d' ~/.bashrc 2>/dev/null || true

print_status "Cleanup completed"

# Step 2: Install Node.js 16 (best GLIBC 2.26 compatibility)
print_info "STEP 2: Installing Node.js 16 (GLIBC 2.26 compatible)..."

cd /tmp
rm -f node-v16.20.2-linux-x64.tar.xz 2>/dev/null || true

# Download Node.js 16
wget https://nodejs.org/dist/v16.20.2/node-v16.20.2-linux-x64.tar.xz
tar -xf node-v16.20.2-linux-x64.tar.xz

# Install to /usr/local (standard location)
sudo cp -r node-v16.20.2-linux-x64/* /usr/local/

# Verify installation
if /usr/local/bin/node --version >/dev/null 2>&1; then
    print_status "Node.js installed successfully: $(/usr/local/bin/node --version)"
else
    print_error "Node.js installation failed"
    exit 1
fi

# Step 3: Install PM2 globally
print_info "STEP 3: Installing PM2..."
sudo /usr/local/bin/npm install -g pm2

# Verify PM2 installation
if /usr/local/bin/pm2 --version >/dev/null 2>&1; then
    print_status "PM2 installed successfully: $(/usr/local/bin/pm2 --version)"
else
    print_error "PM2 installation failed"
    exit 1
fi

# Step 4: Set up the application
print_info "STEP 4: Setting up application..."
cd /home/ec2-user/cryptoescrow-backend

# Update code
git fetch origin 2>/dev/null || true
git reset --hard origin/main 2>/dev/null || true

# Clean install dependencies
rm -rf node_modules package-lock.json 2>/dev/null || true
/usr/local/bin/npm install --production

# Install critical dependencies
/usr/local/bin/npm list node-fetch >/dev/null 2>&1 || /usr/local/bin/npm install node-fetch@3.3.2
/usr/local/bin/npm list @aws-sdk/client-secrets-manager >/dev/null 2>&1 || /usr/local/bin/npm install @aws-sdk/client-secrets-manager

# Ensure environment file
[ ! -f ".env" ] && cp aws-deployment/env.production.template .env 2>/dev/null || true

# Create logs directory
mkdir -p logs

print_status "Application setup completed"

# Step 5: Test application
print_info "STEP 5: Testing application startup..."
timeout 10s /usr/local/bin/node src/server.js > logs/startup-test.log 2>&1 || true

if grep -q "Server running\|listening" logs/startup-test.log 2>/dev/null; then
    print_status "Application startup test passed"
elif grep -q "Error" logs/startup-test.log 2>/dev/null; then
    print_warning "Application has startup issues:"
    cat logs/startup-test.log
else
    print_info "Startup test completed (expected timeout)"
fi

# Step 6: Start with PM2
print_info "STEP 6: Starting with PM2..."

# Update ecosystem config to use full paths
cat > ecosystem.config.cjs << 'EOF'
module.exports = {
  apps: [{
    name: 'cryptoescrow-backend',
    script: '/usr/local/bin/node',
    args: 'src/server.js',
    cwd: '/home/ec2-user/cryptoescrow-backend',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    log_file: './logs/combined.log',
    out_file: './logs/out.log',
    error_file: './logs/err.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    max_restarts: 5,
    min_uptime: '10s',
    max_memory_restart: '1G'
  }]
};
EOF

# Start with PM2
/usr/local/bin/pm2 start ecosystem.config.cjs --env production

# Save PM2 configuration
/usr/local/bin/pm2 save

# Set up PM2 startup with correct paths
sudo env PATH=$PATH:/usr/local/bin /usr/local/bin/pm2 startup systemd -u ec2-user --hp /home/ec2-user

print_status "PM2 started successfully"

# Step 7: Final verification
print_info "STEP 7: Final verification..."
sleep 5

# Display status
echo -e "\n${GREEN}🎯 Final Status:${NC}"
echo "Node.js: $(/usr/local/bin/node --version)"
echo "NPM: $(/usr/local/bin/npm --version)"
echo "PM2: $(/usr/local/bin/pm2 --version)"

echo -e "\n${GREEN}PM2 Status:${NC}"
/usr/local/bin/pm2 list

# Test health endpoint
print_info "Testing health endpoint..."
sleep 3
if curl -f -s http://localhost:3000/health >/dev/null 2>&1; then
    PUBLIC_IP=$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || echo "UNKNOWN")
    print_status "🎉 SUCCESS! Backend is running and healthy!"
    echo -e "\n${GREEN}🌐 Access URLs:${NC}"
    echo "• Health Check: http://$PUBLIC_IP:3000/health"
    echo "• Backend API: http://$PUBLIC_IP:3000"
else
    print_warning "Health check failed. Checking logs..."
    /usr/local/bin/pm2 logs --lines 10
fi

echo -e "\n${GREEN}🔧 Useful Commands:${NC}"
echo "• Check status: /usr/local/bin/pm2 status"
echo "• View logs: /usr/local/bin/pm2 logs cryptoescrow-backend"
echo "• Restart: /usr/local/bin/pm2 restart cryptoescrow-backend"
echo "• Monitor: /usr/local/bin/pm2 monit"

# Add convenient aliases to bashrc
echo -e "\n# Node.js and PM2 aliases" >> ~/.bashrc
echo "alias node='/usr/local/bin/node'" >> ~/.bashrc
echo "alias npm='/usr/local/bin/npm'" >> ~/.bashrc
echo "alias pm2='/usr/local/bin/pm2'" >> ~/.bashrc

print_status "Script completed successfully!"
print_info "Log out and back in, or run 'source ~/.bashrc' to use aliases" 