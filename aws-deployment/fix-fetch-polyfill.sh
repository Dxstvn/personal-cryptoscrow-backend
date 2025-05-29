#!/bin/bash

# CryptoEscrow Backend - Fix Fetch Polyfill Issue
# This script fixes the fetch polyfill timing issue

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🔧 CryptoEscrow Backend - Fix Fetch Polyfill Issue${NC}"
echo "======================================================="

print_status() { echo -e "${GREEN}✅ $1${NC}"; }
print_warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }
print_error() { echo -e "${RED}❌ $1${NC}"; }
print_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }

# Navigate to app directory
cd /home/ec2-user/cryptoescrow-backend

# Step 1: Install node-fetch explicitly and ensure it's available
print_info "STEP 1: Installing node-fetch polyfill..."
npm install node-fetch@3.3.2 --save

# Step 2: Create a fetch polyfill setup file
print_info "STEP 2: Creating fetch polyfill setup..."
cat > src/polyfills/fetch.js << 'EOF'
// fetch polyfill for Node.js 16 compatibility
import fetch, { Headers, Request, Response, FormData } from 'node-fetch';

// Make fetch available globally
if (!globalThis.fetch) {
  globalThis.fetch = fetch;
  globalThis.Headers = Headers;
  globalThis.Request = Request;
  globalThis.Response = Response;
  globalThis.FormData = FormData;
}

export { fetch, Headers, Request, Response, FormData };
EOF

# Create polyfills directory if it doesn't exist
mkdir -p src/polyfills

# Step 3: Update the server.js to load fetch polyfill first
print_info "STEP 3: Creating updated server.js with early fetch polyfill..."
cat > src/server-fixed.js << 'EOF'
// Import fetch polyfill BEFORE any other imports
import './polyfills/fetch.js';

console.log('📦 Fetch polyfill loaded for Node.js compatibility');

// Now import the original server
import('./server.js').then(() => {
  console.log('🚀 Server started successfully');
}).catch(error => {
  console.error('❌ Server failed to start:', error);
  process.exit(1);
});
EOF

# Step 4: Update package.json to use the fixed server
print_info "STEP 4: Updating package.json..."
if [ -f "package.json" ]; then
  # Create backup
  cp package.json package.json.backup
  
  # Update the start script
  node -e "
    const fs = require('fs');
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    pkg.scripts = pkg.scripts || {};
    pkg.scripts.start = 'node src/server-fixed.js';
    pkg.scripts['start:original'] = 'node src/server.js';
    fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2));
    console.log('✅ Package.json updated');
  "
fi

# Step 5: Update ecosystem config to use the fixed server
print_info "STEP 5: Updating PM2 ecosystem config..."
cat > ecosystem.config.cjs << 'EOF'
module.exports = {
  apps: [{
    name: 'cryptoescrow-backend',
    script: 'src/server-fixed.js',
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

# Step 6: Stop PM2 and restart with the fixed configuration
print_info "STEP 6: Restarting PM2 with fixed configuration..."
pm2 delete all || true
sleep 2
pm2 start ecosystem.config.cjs --env production
pm2 save

# Step 7: Wait and test
print_info "STEP 7: Testing the fix..."
sleep 5

# Test health endpoint
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
    print_status "🎉 SUCCESS! Fetch polyfill fix worked!"
    echo -e "\n${GREEN}Health Check Response:${NC}"
    curl -s http://localhost:3000/health
    
    PUBLIC_IP=$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || echo "UNKNOWN")
    echo -e "\n${GREEN}🌐 Your backend is now accessible at:${NC}"
    echo "• Health Check: http://$PUBLIC_IP:3000/health"
    echo "• Backend API: http://$PUBLIC_IP:3000"
else
    print_warning "Health check still failing. Let's diagnose..."
    
    echo -e "\n${YELLOW}PM2 Status:${NC}"
    pm2 list
    
    echo -e "\n${YELLOW}Recent logs:${NC}"
    pm2 logs --lines 20
fi

print_status "Fetch polyfill fix completed!"
echo -e "\n${BLUE}If successful, your backend should now work with Node.js 16${NC}" 