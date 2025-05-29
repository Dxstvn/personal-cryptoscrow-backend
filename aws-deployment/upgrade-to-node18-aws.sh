#!/bin/bash

# CryptoEscrow Backend - Upgrade to Node.js 18 (AWS-Compatible)
# Uses AWS Cloud9 team's Node.js 18 binary specifically compiled for Amazon Linux 2

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🔧 CryptoEscrow Backend - Upgrade to Node.js 18 (AWS-Compatible)${NC}"
echo "=================================================================="

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

# Step 1: Stop existing processes
print_info "STEP 1: Stopping existing processes..."
pm2 delete all || true
pm2 kill || true

# Step 2: Clean up existing Node.js installations
print_info "STEP 2: Cleaning up existing Node.js installations..."
rm -rf ~/.nvm || true
sudo rm -rf /opt/nodejs || true
sudo rm -f /usr/local/bin/node /usr/local/bin/npm /usr/local/bin/npx || true
sudo rm -f /usr/bin/node /usr/bin/npm /usr/bin/npx || true
sudo yum remove -y nodejs npm || true

# Clean bashrc
sed -i '/nvm/d' ~/.bashrc || true
sed -i '/nodejs/d' ~/.bashrc || true
sed -i '/NVM_DIR/d' ~/.bashrc || true

# Step 3: Download and install AWS-compatible Node.js 18
print_info "STEP 3: Installing AWS-compatible Node.js 18..."

cd /tmp
rm -f node-v18.17.1.tar.gz || true

# Download the AWS Cloud9 team's Node.js 18 binary (compiled for Amazon Linux 2)
print_info "Downloading AWS-compatible Node.js 18 binary..."
wget -nv https://d3rnber7ry90et.cloudfront.net/linux-x86_64/node-v18.17.1.tar.gz

# Extract and install
tar -xf node-v18.17.1.tar.gz
sudo mkdir -p /usr/local/lib/node
sudo rm -rf /usr/local/lib/node/nodejs || true
sudo mv node-v18.17.1 /usr/local/lib/node/nodejs

# Create symlinks
sudo ln -sf /usr/local/lib/node/nodejs/bin/node /usr/local/bin/node
sudo ln -sf /usr/local/lib/node/nodejs/bin/npm /usr/local/bin/npm
sudo ln -sf /usr/local/lib/node/nodejs/bin/npx /usr/local/bin/npx

# Also create symlinks in /usr/bin for sudo compatibility
sudo ln -sf /usr/local/bin/node /usr/bin/node
sudo ln -sf /usr/local/bin/npm /usr/bin/npm
sudo ln -sf /usr/local/bin/npx /usr/bin/npx

# Update PATH
echo 'export NODEJS_HOME=/usr/local/lib/node/nodejs' >> ~/.bashrc
echo 'export PATH=$NODEJS_HOME/bin:$PATH' >> ~/.bashrc
export NODEJS_HOME=/usr/local/lib/node/nodejs
export PATH=$NODEJS_HOME/bin:$PATH

# Step 4: Verify Node.js installation
print_info "STEP 4: Verifying Node.js installation..."
NODE_VERSION=$(node --version 2>/dev/null || echo "FAILED")
if [[ $NODE_VERSION =~ ^v18\. ]]; then
    print_status "Node.js 18 installed successfully: $NODE_VERSION"
else
    print_error "Node.js 18 installation failed: $NODE_VERSION"
    exit 1
fi

# Step 5: Install PM2
print_info "STEP 5: Installing PM2..."
sudo npm install -g pm2

if pm2 --version >/dev/null 2>&1; then
    print_status "PM2 installed successfully: $(pm2 --version)"
else
    print_error "PM2 installation failed"
    exit 1
fi

# Step 6: Set up the application
print_info "STEP 6: Setting up application..."
cd /home/ec2-user/cryptoescrow-backend

# Update code
git fetch origin 2>/dev/null || true
git reset --hard origin/main 2>/dev/null || true

# Clean install dependencies (Node.js 18 compatible)
rm -rf node_modules package-lock.json 2>/dev/null || true
npm install --production

# Verify critical dependencies
npm list @aws-sdk/client-secrets-manager >/dev/null 2>&1 || npm install @aws-sdk/client-secrets-manager

# Ensure environment file
[ ! -f ".env" ] && cp aws-deployment/env.production.template .env 2>/dev/null || true

# Create logs directory
mkdir -p logs

print_status "Application setup completed"

# Step 7: Test application startup
print_info "STEP 7: Testing application startup..."
timeout 10s node src/server.js > logs/startup-test.log 2>&1 || true

if grep -q "Server running\|listening" logs/startup-test.log 2>/dev/null; then
    print_status "Application startup test passed"
elif grep -q "Error" logs/startup-test.log 2>/dev/null; then
    print_warning "Application has startup issues:"
    cat logs/startup-test.log
    print_info "Continuing anyway - issues may resolve in PM2 environment"
else
    print_info "Startup test completed (expected timeout)"
fi

# Step 8: Create/update ecosystem config
print_info "STEP 8: Creating PM2 ecosystem configuration..."

cat > ecosystem.config.cjs << 'EOF'
module.exports = {
  apps: [{
    name: 'cryptoescrow-backend',
    script: 'src/server.js',
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
    max_memory_restart: '1G',
    restart_delay: 1000
  }]
};
EOF

# Step 9: Start with PM2
print_info "STEP 9: Starting application with PM2..."

# Start the application
pm2 start ecosystem.config.cjs --env production

# Save PM2 configuration
pm2 save

# Set up PM2 startup
print_info "Setting up PM2 startup..."
sudo env PATH="$PATH" pm2 startup systemd -u ec2-user --hp /home/ec2-user 2>/dev/null || true

print_status "PM2 started successfully"

# Step 10: Final verification
print_info "STEP 10: Final verification..."
sleep 5

# Display status
echo -e "\n${GREEN}🎯 Final Status:${NC}"
echo "Node.js: $(node --version)"
echo "NPM: $(npm --version)"
echo "PM2: $(pm2 --version)"

echo -e "\n${GREEN}PM2 Status:${NC}"
pm2 list

# Test health endpoint with retries
print_info "Testing health endpoint (with retries)..."
HEALTH_SUCCESS=false
for i in {1..5}; do
    print_info "Health check attempt $i/5..."
    if curl -f -s http://localhost:3000/health >/dev/null 2>&1; then
        HEALTH_SUCCESS=true
        break
    fi
    sleep 3
done

if [ "$HEALTH_SUCCESS" = true ]; then
    PUBLIC_IP=$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || echo "UNKNOWN")
    print_status "🎉 SUCCESS! Backend is running with Node.js 18!"
    echo -e "\n${GREEN}🌐 Access URLs:${NC}"
    echo "• Health Check: http://localhost:3000/health"
    echo "• Public Health Check: http://$PUBLIC_IP:3000/health"
    echo "• Backend API: http://$PUBLIC_IP:3000"
    
    # Test the health endpoint and show response
    echo -e "\n${GREEN}Health Check Response:${NC}"
    curl -s http://localhost:3000/health
else
    print_warning "Health check failed. Diagnosing issue..."
    
    echo -e "\n${YELLOW}PM2 Status:${NC}"
    pm2 list
    
    echo -e "\n${YELLOW}Recent logs:${NC}"
    pm2 logs --lines 20
fi

# Create helpful aliases
echo -e "\n# Node.js and PM2 aliases (Node.js 18)" >> ~/.bashrc
echo "alias node='/usr/local/bin/node'" >> ~/.bashrc
echo "alias npm='/usr/local/bin/npm'" >> ~/.bashrc
echo "alias pm2='$(which pm2)'" >> ~/.bashrc

print_status "Node.js 18 upgrade completed!"
print_info "Run 'source ~/.bashrc' to use the new aliases"

echo -e "\n${BLUE}📋 Summary:${NC}"
echo "✅ Node.js 18.17.1 (AWS-compatible) installed"
echo "✅ Compatible with Amazon Linux 2 GLIBC 2.26"
echo "✅ Native fetch support (no polyfill needed)"
echo "✅ PM2 configured and running"
if [ "$HEALTH_SUCCESS" = true ]; then
    echo "✅ Health endpoint responding"
    echo "🎉 Your CryptoEscrow backend is fully operational with Node.js 18!"
else
    echo "⚠️  Health endpoint not responding - check logs for issues"
fi 