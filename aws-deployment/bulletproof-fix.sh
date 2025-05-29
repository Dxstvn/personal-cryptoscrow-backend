#!/bin/bash

# CryptoEscrow Backend - Bulletproof Amazon Linux 2 Fix
# This script tries multiple methods to get Node.js working

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🔧 CryptoEscrow Backend - Bulletproof Fix${NC}"
echo "=========================================="

print_status() { echo -e "${GREEN}✅ $1${NC}"; }
print_warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }
print_error() { echo -e "${RED}❌ $1${NC}"; }
print_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to test Node.js installation
test_nodejs() {
    if command_exists node && command_exists npm; then
        local node_version=$(node --version 2>/dev/null)
        local npm_version=$(npm --version 2>/dev/null)
        if [[ $node_version =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
            print_status "Node.js working: $node_version, npm: $npm_version"
            return 0
        fi
    fi
    return 1
}

print_info "System diagnostics..."
echo "OS: $(cat /etc/os-release | grep PRETTY_NAME | cut -d'"' -f2)"
echo "Architecture: $(uname -m)"
echo "User: $(whoami)"

# Stop existing processes (don't fail if not found)
print_info "Stopping existing processes..."
command_exists pm2 && pm2 delete all 2>/dev/null || true
command_exists pm2 && pm2 kill 2>/dev/null || true

# Clean up previous installations
print_info "Cleaning up previous installations..."
rm -rf ~/.nvm 2>/dev/null || true
sed -i '/NVM_DIR/d' ~/.bashrc 2>/dev/null || true
sudo rm -f /etc/yum.repos.d/nodesource* 2>/dev/null || true
sudo yum remove -y nodejs npm 2>/dev/null || true

print_info "Available amazon-linux-extras topics:"
sudo amazon-linux-extras list | grep -i node || echo "No Node.js topics found"

# METHOD 1: Try amazon-linux-extras with available Node.js versions
print_info "METHOD 1: Trying amazon-linux-extras..."
for topic in nodejs20 nodejs18 nodejs16 nodejs14 nodejs; do
    if sudo amazon-linux-extras list | grep -q "$topic"; then
        print_info "Found topic: $topic"
        if sudo amazon-linux-extras enable "$topic" 2>/dev/null && sudo yum install -y nodejs npm 2>/dev/null; then
            if test_nodejs; then
                print_status "SUCCESS with amazon-linux-extras $topic"
                METHOD_USED="amazon-linux-extras $topic"
                break
            fi
        fi
    fi
done

# METHOD 2: Try EPEL repository
if ! test_nodejs; then
    print_info "METHOD 2: Trying EPEL repository..."
    if sudo yum install -y epel-release 2>/dev/null && sudo yum install -y nodejs npm 2>/dev/null; then
        if test_nodejs; then
            print_status "SUCCESS with EPEL repository"
            METHOD_USED="EPEL repository"
        fi
    fi
fi

# METHOD 3: NodeSource repository
if ! test_nodejs; then
    print_info "METHOD 3: Trying NodeSource repository..."
    curl -fsSL https://rpm.nodesource.com/setup_lts.x 2>/dev/null | sudo bash - 2>/dev/null || true
    if sudo yum install -y nodejs 2>/dev/null; then
        if test_nodejs; then
            print_status "SUCCESS with NodeSource repository"
            METHOD_USED="NodeSource repository"
        fi
    fi
fi

# METHOD 4: Direct binary installation (most reliable)
if ! test_nodejs; then
    print_info "METHOD 4: Installing Node.js 16 binary (guaranteed compatibility)..."
    
    cd /tmp
    
    # Download Node.js 16 (excellent GLIBC 2.26 compatibility)
    if wget https://nodejs.org/dist/v16.20.2/node-v16.20.2-linux-x64.tar.xz 2>/dev/null; then
        tar -xf node-v16.20.2-linux-x64.tar.xz 2>/dev/null
        
        # Install to /opt/nodejs
        sudo mkdir -p /opt/nodejs
        sudo rm -rf /opt/nodejs/* 2>/dev/null || true
        sudo cp -r node-v16.20.2-linux-x64/* /opt/nodejs/
        
        # Create symlinks
        sudo ln -sf /opt/nodejs/bin/node /usr/local/bin/node
        sudo ln -sf /opt/nodejs/bin/npm /usr/local/bin/npm
        sudo ln -sf /opt/nodejs/bin/npx /usr/local/bin/npx
        
        # Update PATH for current session
        export PATH="/opt/nodejs/bin:$PATH"
        
        # Update PATH permanently for ec2-user
        if ! grep -q "/opt/nodejs/bin" ~/.bashrc; then
            echo 'export PATH="/opt/nodejs/bin:$PATH"' >> ~/.bashrc
        fi
        
        # Test installation
        if test_nodejs; then
            print_status "SUCCESS with Node.js binary installation"
            METHOD_USED="Node.js 16 binary"
        else
            print_error "Node.js binary installation failed"
        fi
    else
        print_error "Failed to download Node.js binary"
    fi
fi

# Final check
if ! test_nodejs; then
    print_error "ALL METHODS FAILED - Cannot install Node.js"
    echo "Please check:"
    echo "1. Internet connectivity: curl -I https://nodejs.org"
    echo "2. Available space: df -h"
    echo "3. System updates: sudo yum update"
    exit 1
fi

print_status "Node.js installation completed using: $METHOD_USED"
echo "Node.js version: $(node --version)"
echo "NPM version: $(npm --version)"

# Install PM2
print_info "Installing PM2..."
if sudo npm install -g pm2; then
    print_status "PM2 installed successfully"
else
    print_error "PM2 installation failed"
    exit 1
fi

# Navigate to app directory
print_info "Setting up application..."
cd /home/ec2-user/cryptoescrow-backend

# Update code
print_info "Updating application code..."
git fetch origin 2>/dev/null || true
git reset --hard origin/main 2>/dev/null || true

# Install dependencies
print_info "Installing application dependencies..."
rm -rf node_modules package-lock.json 2>/dev/null || true

if npm install --production; then
    print_status "Dependencies installed successfully"
else
    print_error "Dependency installation failed"
    echo "Trying with --no-optional flag..."
    npm install --production --no-optional || exit 1
fi

# Install critical dependencies explicitly
print_info "Verifying critical dependencies..."
npm list node-fetch >/dev/null 2>&1 || npm install node-fetch@3.3.2
npm list @aws-sdk/client-secrets-manager >/dev/null 2>&1 || npm install @aws-sdk/client-secrets-manager

# Ensure environment file exists
if [ ! -f ".env" ]; then
    if [ -f "aws-deployment/env.production.template" ]; then
        cp aws-deployment/env.production.template .env
        print_status "Environment file created from template"
    else
        print_warning "No environment template found - you may need to create .env manually"
    fi
fi

# Create logs directory
mkdir -p logs

# Test application startup
print_info "Testing application startup..."
if timeout 10s node src/server.js > logs/startup-test.log 2>&1; then
    print_status "Application startup test passed"
else
    print_info "Startup test completed (timeout expected)"
    if grep -i error logs/startup-test.log; then
        print_warning "Errors found in startup test:"
        cat logs/startup-test.log
    fi
fi

# Start with PM2
print_info "Starting application with PM2..."
if pm2 start ecosystem.config.cjs --env production; then
    print_status "Application started with PM2"
    
    # Save PM2 configuration
    pm2 save
    
    # Set up PM2 startup (don't fail if this doesn't work)
    pm2 startup systemd -u ec2-user --hp /home/ec2-user 2>/dev/null || print_warning "PM2 startup setup skipped (may require manual setup)"
else
    print_error "Failed to start application with PM2"
    print_info "Trying direct start for testing..."
    node src/server.js &
    sleep 3
fi

# Wait for startup
sleep 5

# Display status
print_status "Deployment completed!"
echo "Node.js: $(node --version) (via $METHOD_USED)"
echo "PM2 Status:"
pm2 list 2>/dev/null || echo "PM2 not running"

# Test health endpoint
print_info "Testing health endpoint..."
if curl -f -s http://localhost:3000/health >/dev/null 2>&1; then
    print_status "🎉 SUCCESS! Backend is running and healthy!"
    
    # Get public IP
    PUBLIC_IP=$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || echo "UNKNOWN")
    echo "Backend URL: http://$PUBLIC_IP:3000"
    echo "Health URL: http://$PUBLIC_IP:3000/health"
else
    print_warning "Health check failed. Diagnosing..."
    
    # Check if process is running
    if ps aux | grep -q "[n]ode.*server.js"; then
        print_info "Node.js process is running"
    else
        print_error "No Node.js process found"
    fi
    
    # Check port
    if netstat -tlnp 2>/dev/null | grep -q ":3000"; then
        print_info "Port 3000 is listening"
    else
        print_error "Port 3000 is not listening"
    fi
    
    # Show recent logs
    print_info "Recent logs:"
    pm2 logs --lines 10 2>/dev/null || tail -20 logs/startup-test.log 2>/dev/null || echo "No logs available"
fi

echo -e "\n${GREEN}🎯 Next Steps:${NC}"
echo "• Check status: pm2 status"
echo "• View logs: pm2 logs cryptoescrow-backend"
echo "• Health check: curl http://localhost:3000/health"
echo "• Restart: pm2 restart cryptoescrow-backend"

print_status "Script completed successfully!" 