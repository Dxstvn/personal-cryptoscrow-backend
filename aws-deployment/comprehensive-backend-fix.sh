#!/bin/bash

# CryptoEscrow Backend - Comprehensive Fix Script
# Addresses Node.js compatibility, Firebase issues, and missing dependencies

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🔧 CryptoEscrow Backend - Comprehensive Fix${NC}"
echo "=============================================="

print_status() { echo -e "${GREEN}✅ $1${NC}"; }
print_warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }
print_error() { echo -e "${RED}❌ $1${NC}"; }
print_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }

# Step 1: Check Node.js version and upgrade if needed
print_info "STEP 1: Checking Node.js version..."
NODE_VERSION=$(node --version | cut -d'v' -f2)
NODE_MAJOR=$(echo $NODE_VERSION | cut -d'.' -f1)

if [ "$NODE_MAJOR" -lt 18 ]; then
    print_warning "Node.js $NODE_VERSION detected. Firebase requires Node.js 18+. Upgrading..."
    
    # Install Node.js 18 using NodeSource
    curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
    sudo yum install -y nodejs
    
    # Verify upgrade
    NEW_NODE_VERSION=$(node --version)
    print_status "Node.js upgraded to $NEW_NODE_VERSION"
    
    # Reinstall PM2 globally
    sudo npm install -g pm2
else
    print_status "Node.js $NODE_VERSION is compatible"
fi

# Step 2: Install missing dependencies
print_info "STEP 2: Installing missing dependencies..."
cd /home/ec2-user/cryptoescrow-backend

# Install node-fetch if not present
if ! npm list node-fetch >/dev/null 2>&1; then
    npm install node-fetch@3.3.2
    print_status "node-fetch installed"
fi

# Install node-abort-controller for Firebase compatibility
if ! npm list node-abort-controller >/dev/null 2>&1; then
    npm install node-abort-controller
    print_status "node-abort-controller installed"
fi

# Install firebase if not present
if ! npm list firebase >/dev/null 2>&1; then
    npm install firebase
    print_status "firebase client SDK installed"
fi

# Step 3: Create ESM-compatible ecosystem config
print_info "STEP 3: Creating ESM-compatible ecosystem config..."
cat > ecosystem.config.mjs << 'EOF'
export default {
  apps: [{
    name: 'cryptoescrow-backend',
    script: 'src/server.js',
    instances: 1,
    exec_mode: 'fork',
    watch: false,
    max_memory_restart: '1G',
    node_args: '--experimental-specifier-resolution=node',
    env: {
      NODE_ENV: 'development',
      PORT: 3000
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000,
      USE_AWS_SECRETS: 'true',
      AWS_REGION: 'us-east-1'
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
    log_date_format: 'YYYY-MM-DD HH:mm Z',
    merge_logs: true,
    autorestart: true,
    max_restarts: 10,
    min_uptime: '10s',
    kill_timeout: 5000,
    listen_timeout: 3000,
    instance_var: 'INSTANCE_ID',
    monitoring: false,
    pmx: false
  }]
};
EOF

print_status "ESM ecosystem config created as ecosystem.config.mjs"

# Step 4: Create Firebase service account secret
print_info "STEP 4: Setting up Firebase service account secret..."

# Check if secret already exists
if aws secretsmanager describe-secret --secret-id "CryptoEscrow/Firebase/ServiceAccount" --region us-east-1 >/dev/null 2>&1; then
    print_status "Firebase service account secret already exists"
else
    print_warning "Firebase service account secret missing"
    print_info "Creating a placeholder secret - you'll need to update it with real Firebase credentials"
    
    # Create placeholder secret
    aws secretsmanager create-secret \
        --name "CryptoEscrow/Firebase/ServiceAccount" \
        --description "Firebase service account for CryptoEscrow backend" \
        --secret-string '{
            "type": "service_account",
            "project_id": "REPLACE_WITH_YOUR_PROJECT_ID",
            "private_key_id": "REPLACE_WITH_YOUR_PRIVATE_KEY_ID",
            "private_key": "REPLACE_WITH_YOUR_PRIVATE_KEY",
            "client_email": "REPLACE_WITH_YOUR_CLIENT_EMAIL",
            "client_id": "REPLACE_WITH_YOUR_CLIENT_ID",
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
            "client_x509_cert_url": "REPLACE_WITH_YOUR_CLIENT_CERT_URL"
        }' \
        --region us-east-1
    
    print_warning "⚠️  IMPORTANT: Update the Firebase service account secret with real credentials!"
    print_info "Run: aws secretsmanager update-secret --secret-id 'CryptoEscrow/Firebase/ServiceAccount' --secret-string 'YOUR_REAL_FIREBASE_JSON' --region us-east-1"
fi

# Step 5: Update environment variables
print_info "STEP 5: Updating environment variables..."
if [ ! -f ".env" ]; then
    if [ -f "aws-deployment/env.production.template" ]; then
        cp aws-deployment/env.production.template .env
        print_status "Environment file created from template"
    fi
fi

# Ensure Firebase project ID is set
if ! grep -q "FIREBASE_PROJECT_ID" .env 2>/dev/null; then
    echo "FIREBASE_PROJECT_ID=ethescrow-377c6" >> .env
    print_status "Firebase project ID added to .env"
fi

# Step 6: Stop current PM2 processes
print_info "STEP 6: Restarting PM2 with new configuration..."
pm2 delete all 2>/dev/null || true
pm2 kill 2>/dev/null || true

# Start with new ESM config
pm2 start ecosystem.config.mjs --env production
pm2 save

print_status "PM2 restarted with ESM configuration"

# Step 7: Verification
print_info "STEP 7: Running verification checks..."
sleep 5

# Check PM2 status
pm2 status

# Check if process is running
if pm2 list | grep -q "online"; then
    print_status "✅ PM2 process is online"
else
    print_error "❌ PM2 process is not running properly"
fi

# Test health endpoint
print_info "Testing health endpoint..."
if curl -f -s http://localhost:3000/health >/dev/null 2>&1; then
    print_status "✅ Health endpoint is responding"
    
    # Get public IP for external access
    PUBLIC_IP=$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || echo "UNKNOWN")
    echo -e "\n${GREEN}🎉 Backend is running successfully!${NC}"
    echo -e "\n${GREEN}🌐 Access URLs:${NC}"
    echo "• Local Health Check: http://localhost:3000/health"
    echo "• Public Health Check: http://$PUBLIC_IP:3000/health"
    echo "• Backend API: http://$PUBLIC_IP:3000"
else
    print_warning "⚠️  Health endpoint not responding yet"
    print_info "Checking logs for issues..."
    pm2 logs --lines 20
fi

echo -e "\n${GREEN}🔧 Useful Commands:${NC}"
echo "• Check status: pm2 status"
echo "• View logs: pm2 logs cryptoescrow-backend"
echo "• Restart: pm2 restart cryptoescrow-backend"
echo "• Health check: curl http://localhost:3000/health"

echo -e "\n${YELLOW}📝 Next Steps:${NC}"
echo "1. Update Firebase service account secret with real credentials"
echo "2. Verify all environment variables in .env file"
echo "3. Test API endpoints"

print_status "Comprehensive fix completed!" 