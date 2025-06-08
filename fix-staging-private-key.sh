#!/bin/bash

# 🔧 FIX STAGING PRIVATE KEY AND RESTART
# This script fixes the private key format and properly restarts staging

echo "🔧 Fixing Staging Private Key Format and Restarting"
echo "=================================================="

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

# Step 1: Kill any process using port 3001
log_info "Step 1: Cleaning up port 3001..."
if lsof -ti:3001 >/dev/null 2>&1; then
    log_warning "Port 3001 is in use. Killing processes..."
    lsof -ti:3001 | xargs kill -9 2>/dev/null || true
    sleep 2
    log_success "Port 3001 cleaned up"
else
    log_info "Port 3001 is free"
fi

# Step 2: Stop all staging-related PM2 processes
log_info "Step 2: Stopping existing PM2 processes..."
pm2 stop ecosystem.staging 2>/dev/null || true
pm2 delete ecosystem.staging 2>/dev/null || true
pm2 stop cryptoescrow-backend-staging 2>/dev/null || true
pm2 delete cryptoescrow-backend-staging 2>/dev/null || true
pm2 save
log_success "Cleaned up PM2 processes"

# Step 3: Fix the private key format in AWS Secrets Manager
log_info "Step 3: Fixing Firebase private key format in AWS Secrets Manager..."

# Get current secret
SECRET_JSON=$(aws secretsmanager get-secret-value --secret-id "CryptoEscrow/Staging/Firebase" --region us-east-1 --query "SecretString" --output text)

if [ $? -ne 0 ]; then
    log_error "Failed to retrieve Firebase secret from AWS Secrets Manager"
    exit 1
fi

# Extract the private key and fix the format
BROKEN_PRIVATE_KEY=$(echo "$SECRET_JSON" | jq -r .private_key)

# Convert \n to actual newlines
FIXED_PRIVATE_KEY=$(echo "$BROKEN_PRIVATE_KEY" | sed 's/\\n/\n/g')

# Update the secret with the fixed private key
UPDATED_SECRET=$(echo "$SECRET_JSON" | jq --arg key "$FIXED_PRIVATE_KEY" '.private_key = $key')

# Update AWS Secrets Manager
aws secretsmanager update-secret \
    --secret-id "CryptoEscrow/Staging/Firebase" \
    --secret-string "$UPDATED_SECRET" \
    --region us-east-1

if [ $? -eq 0 ]; then
    log_success "Fixed Firebase private key format in AWS Secrets Manager"
else
    log_error "Failed to update Firebase secret"
    exit 1
fi

# Step 4: Verify the fix
log_info "Step 4: Verifying private key format..."
VERIFICATION=$(aws secretsmanager get-secret-value --secret-id "CryptoEscrow/Staging/Firebase" --region us-east-1 --query "SecretString" --output text | jq -r .private_key)

if [[ "$VERIFICATION" == *$'\n'* ]] && [[ "$VERIFICATION" == "-----BEGIN PRIVATE KEY-----"* ]] && [[ "$VERIFICATION" == *"-----END PRIVATE KEY-----" ]]; then
    log_success "Private key format is now correct"
else
    log_error "Private key format is still incorrect"
    echo "First 100 chars: ${VERIFICATION:0:100}..."
    echo "Last 50 chars: ...${VERIFICATION: -50}"
fi

# Step 5: Start staging with proper configuration
log_info "Step 5: Starting staging environment with correct configuration..."
pm2 start ecosystem.staging.cjs --env staging
pm2 save

sleep 5

# Step 6: Check if staging is running properly
log_info "Step 6: Verifying staging environment..."
pm2 status

# Check if port is listening
if lsof -i :3001 >/dev/null 2>&1; then
    log_success "Port 3001 is now listening"
    
    # Test health endpoint
    sleep 5
    if curl -s http://localhost:3001/health >/dev/null 2>&1; then
        HEALTH_RESPONSE=$(curl -s http://localhost:3001/health)
        log_success "Health endpoint is responding: $HEALTH_RESPONSE"
    else
        log_warning "Health endpoint not responding yet. Checking logs..."
        timeout 5 pm2 logs cryptoescrow-backend-staging --lines 10 || true
    fi
else
    log_error "Port 3001 is still not listening. Checking logs..."
    timeout 5 pm2 logs cryptoescrow-backend-staging --lines 20 || true
fi

# Step 7: Final status
echo ""
echo "🎯 STAGING FIX SUMMARY"
echo "====================="

# Check final status
STAGING_RUNNING=$(pm2 list | grep -c "cryptoescrow-backend-staging" || echo "0")
PORT_LISTENING=$(lsof -i :3001 >/dev/null 2>&1 && echo "1" || echo "0")
HEALTH_WORKING=$(curl -s http://localhost:3001/health >/dev/null 2>&1 && echo "1" || echo "0")

if [ "$STAGING_RUNNING" -gt 0 ]; then
    log_success "Staging process is running in PM2"
else
    log_error "Staging process not found in PM2"
fi

if [ "$PORT_LISTENING" -eq 1 ]; then
    log_success "Port 3001 is listening"
else
    log_error "Port 3001 is not listening"
fi

if [ "$HEALTH_WORKING" -eq 1 ]; then
    log_success "Health endpoint is responding"
else
    log_error "Health endpoint is not responding"
fi

echo ""
if [ "$HEALTH_WORKING" -eq 1 ]; then
    log_success "🎉 Staging environment is now working!"
    echo ""
    log_info "Next steps:"
    echo "1. Test your staging endpoint: curl http://localhost:3001/health"
    echo "2. Check ALB health checks will now pass"
    echo "3. Test external access: https://staging.clearhold.app/health"
else
    log_error "Staging environment still has issues"
    echo ""
    log_info "Debug steps:"
    echo "1. Check logs: pm2 logs cryptoescrow-backend-staging"
    echo "2. Check Firebase connection: ./test-staging-firebase-connection.sh"
    echo "3. Check AWS secrets: aws secretsmanager get-secret-value --secret-id 'CryptoEscrow/Staging/Firebase' --region us-east-1"
fi 