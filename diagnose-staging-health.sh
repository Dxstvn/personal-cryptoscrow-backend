#!/bin/bash

# 🔍 DIAGNOSE STAGING HEALTH ISSUES
# This script diagnoses why the staging health endpoint is failing

echo "🔍 Diagnosing Staging Health Issues"
echo "=================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Step 1: Check if staging process is running
log_info "Step 1: Checking PM2 processes..."
pm2 status

# Step 2: Check if port 3001 is listening
log_info "Step 2: Checking if port 3001 is listening..."
if lsof -i :3001 >/dev/null 2>&1; then
    log_success "Port 3001 is in use"
    lsof -i :3001
else
    log_error "Port 3001 is not listening"
fi

# Step 3: Test local health endpoint
log_info "Step 3: Testing local health endpoint..."
if curl -s http://localhost:3001/health >/dev/null 2>&1; then
    HEALTH_RESPONSE=$(curl -s http://localhost:3001/health)
    log_success "Health endpoint responding: $HEALTH_RESPONSE"
else
    log_error "Health endpoint not responding on localhost:3001"
fi

# Step 4: Check PM2 logs for errors
log_info "Step 4: Checking recent PM2 logs for staging..."
if pm2 list | grep -q "cryptoescrow-backend-staging"; then
    log_info "Recent staging logs:"
    timeout 5 pm2 logs cryptoescrow-backend-staging --lines 20 || true
else
    log_warning "No staging process found in PM2"
fi

# Step 5: Check if staging ecosystem file is correct
log_info "Step 5: Checking ecosystem configuration..."
if [ -f "ecosystem.staging.cjs" ]; then
    log_success "ecosystem.staging.cjs exists"
    log_info "Environment configuration:"
    node -e "const config = require('./ecosystem.staging.cjs'); console.log(JSON.stringify(config.apps[0].env_staging, null, 2));"
else
    log_error "ecosystem.staging.cjs not found"
fi

# Step 6: Test the private key format issue we found
log_info "Step 6: Checking AWS Secrets Manager private key format..."
PRIVATE_KEY=$(aws secretsmanager get-secret-value --secret-id "CryptoEscrow/Staging/Firebase" --region us-east-1 --query "SecretString" --output text | jq -r .private_key)

if [[ "$PRIVATE_KEY" == "-----BEGIN PRIVATE KEY-----"* ]]; then
    log_success "Private key starts correctly"
else
    log_error "Private key doesn't start with -----BEGIN PRIVATE KEY-----"
    echo "First 50 characters: ${PRIVATE_KEY:0:50}..."
fi

if [[ "$PRIVATE_KEY" == *"-----END PRIVATE KEY-----" ]]; then
    log_success "Private key ends correctly"
else
    log_error "Private key doesn't end with -----END PRIVATE KEY-----"
    echo "Last 50 characters: ...${PRIVATE_KEY: -50}"
fi

# Check for proper newlines in private key
if [[ "$PRIVATE_KEY" == *"\\n"* ]]; then
    log_warning "Private key contains \\n literal strings instead of actual newlines"
    log_info "This is likely the cause of the Firebase authentication failure"
else
    log_success "Private key appears to have proper newline formatting"
fi

echo ""
echo "🎯 DIAGNOSIS SUMMARY"
echo "==================="

# Check if main issues are present
STAGING_RUNNING=$(pm2 list | grep -c "cryptoescrow-backend-staging" 2>/dev/null || echo "0")
PORT_LISTENING=$(lsof -i :3001 >/dev/null 2>&1 && echo "1" || echo "0")
HEALTH_WORKING=$(curl -s http://localhost:3001/health >/dev/null 2>&1 && echo "1" || echo "0")

if [ "${STAGING_RUNNING:-0}" -gt 0 ]; then
    log_success "Staging process is running in PM2"
else
    log_error "Staging process not running in PM2"
fi

if [ "${PORT_LISTENING:-0}" -eq 1 ]; then
    log_success "Port 3001 is listening"
else
    log_error "Port 3001 is not listening"
fi

if [ "${HEALTH_WORKING:-0}" -eq 1 ]; then
    log_success "Health endpoint is responding"
else
    log_error "Health endpoint is not responding"
fi

echo ""
log_info "NEXT ACTIONS:"

if [ "${STAGING_RUNNING:-0}" -eq 0 ]; then
    echo "1. Start staging process: pm2 start ecosystem.staging.cjs --env staging"
elif [ "${HEALTH_WORKING:-0}" -eq 0 ]; then
    echo "1. Check logs for errors: pm2 logs cryptoescrow-backend-staging"
    echo "2. Restart staging process: pm2 restart cryptoescrow-backend-staging"
    echo "3. Fix Firebase private key format in AWS Secrets Manager"
else
    echo "1. Health endpoint is working locally"
    echo "2. Check security groups allow health check from ALB"
    echo "3. Verify ALB health check path is /health"
fi 