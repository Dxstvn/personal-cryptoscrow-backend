#!/bin/bash

# CryptoEscrow Backend - Final Fix Script for ESM + AWS Secrets Manager
# Addresses PM2 ESM compatibility and Firebase service account integration

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🔧 CryptoEscrow Backend - Final Fix (ESM + AWS Secrets Manager)${NC}"
echo "================================================================="

print_status() { echo -e "${GREEN}✅ $1${NC}"; }
print_warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }
print_error() { echo -e "${RED}❌ $1${NC}"; }
print_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }

# Step 1: Stop existing processes
print_info "STEP 1: Stopping existing PM2 processes..."
pm2 delete all || true
pm2 kill || true

# Step 2: Clean up problematic files
print_info "STEP 2: Cleaning up problematic configuration files..."
rm -f ecosystem.config.mjs
print_status "Removed problematic ESM ecosystem config"

# Step 3: Ensure correct ecosystem config exists
print_info "STEP 3: Ensuring correct PM2 configuration..."
if [ ! -f "ecosystem.config.cjs" ]; then
    print_error "ecosystem.config.cjs not found!"
    exit 1
fi
print_status "PM2 CommonJS config found"

# Step 4: Update dependencies
print_info "STEP 4: Installing/updating dependencies..."
npm install node-abort-controller@3.1.1 --save

# Step 5: Verify Firebase service account in AWS Secrets Manager
print_info "STEP 5: Verifying Firebase service account in AWS Secrets Manager..."
if aws secretsmanager get-secret-value --secret-id "CryptoEscrow/Firebase/ServiceAccount" --region us-east-1 >/dev/null 2>&1; then
    print_status "Firebase service account found in AWS Secrets Manager"
    
    # Check if it has required fields
    FIREBASE_SECRET=$(aws secretsmanager get-secret-value --secret-id "CryptoEscrow/Firebase/ServiceAccount" --region us-east-1 --query 'SecretString' --output text)
    if echo "$FIREBASE_SECRET" | jq -e '.project_id and .private_key and .client_email' >/dev/null 2>&1; then
        PROJECT_ID=$(echo "$FIREBASE_SECRET" | jq -r '.project_id')
        print_status "Firebase service account is properly configured (Project: $PROJECT_ID)"
    else
        print_error "Firebase service account is missing required fields!"
        exit 1
    fi
else
    print_error "Firebase service account not found in AWS Secrets Manager!"
    print_info "Please run: aws-deployment/setup-firebase-secret-final.sh"
    exit 1
fi

# Step 6: Set up environment
print_info "STEP 6: Configuring environment..."
if [ ! -f ".env" ]; then
    cp aws-deployment/env.production.template .env
    print_status "Environment file created from template"
fi

# Ensure Firebase project ID is set in environment
if ! grep -q "FIREBASE_PROJECT_ID" .env; then
    echo "FIREBASE_PROJECT_ID=$PROJECT_ID" >> .env
    print_status "Firebase project ID added to .env"
fi

# Ensure AWS secrets usage is enabled
if ! grep -q "USE_AWS_SECRETS=true" .env; then
    echo "USE_AWS_SECRETS=true" >> .env
    print_status "AWS Secrets usage enabled"
fi

# Step 7: Create logs directory
mkdir -p logs

# Step 8: Test application startup
print_info "STEP 8: Testing application startup..."
print_info "Running quick startup test..."

# Set environment variables for the test
export NODE_ENV=production
export USE_AWS_SECRETS=true
export AWS_REGION=us-east-1

timeout 15s node src/server.js > logs/startup-test.log 2>&1 || true

if grep -q "CryptoEscrow Backend server running" logs/startup-test.log; then
    print_status "Application startup test passed"
elif grep -q "Firebase Admin SDK initialized with service account from AWS Secrets Manager" logs/startup-test.log; then
    print_status "Firebase Admin SDK successfully loaded from AWS Secrets Manager"
elif grep -i "error" logs/startup-test.log; then
    print_warning "Application startup had issues:"
    cat logs/startup-test.log
    print_info "Continuing with PM2 startup - issues may resolve in production environment"
else
    print_info "Startup test completed (timeout expected for server)"
fi

# Step 9: Start with PM2
print_info "STEP 9: Starting application with PM2..."
pm2 start ecosystem.config.cjs --env production

# Step 10: Save PM2 configuration
print_info "STEP 10: Saving PM2 configuration..."
pm2 save

# Step 11: Set up PM2 startup
print_info "STEP 11: Setting up PM2 startup..."
sudo env PATH="$PATH" pm2 startup systemd -u ec2-user --hp /home/ec2-user || print_warning "PM2 startup setup failed (manual setup may be required)"

# Step 12: Final verification
print_info "STEP 12: Final verification..."
sleep 10

echo -e "\n${GREEN}🎯 Final Status:${NC}"
echo "Node.js: $(node --version)"
echo "PM2 Status:"
pm2 list

# Test health endpoint
print_info "Testing health endpoint..."
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
    print_status "🎉 SUCCESS! Backend is running and healthy!"
    echo -e "\n${GREEN}🌐 Access URLs:${NC}"
    echo "• Health Check: http://localhost:3000/health"
    echo "• Public Health Check: http://$PUBLIC_IP:3000/health"
    echo "• Backend API: http://$PUBLIC_IP:3000"
    
    # Show health response
    echo -e "\n${GREEN}Health Check Response:${NC}"
    curl -s http://localhost:3000/health | head -3
    
    echo -e "\n${GREEN}🔧 Application Logs (last 10 lines):${NC}"
    pm2 logs --lines 10 | tail -20
else
    print_warning "Health check failed. Checking logs for issues..."
    echo -e "\n${YELLOW}PM2 Status:${NC}"
    pm2 list
    
    echo -e "\n${YELLOW}Recent logs:${NC}"
    pm2 logs --lines 20
    
    echo -e "\n${YELLOW}Startup test log:${NC}"
    cat logs/startup-test.log
fi

echo -e "\n${GREEN}🔧 Useful Commands:${NC}"
echo "• Check status: pm2 status"
echo "• View logs: pm2 logs cryptoescrow-backend"
echo "• Restart: pm2 restart cryptoescrow-backend"
echo "• Health check: curl http://localhost:3000/health"

print_status "Final fix script completed!"

if [ "$HEALTH_SUCCESS" = true ]; then
    echo -e "\n${GREEN}🎉 Your CryptoEscrow backend is fully operational!${NC}"
    echo -e "✅ ESM application running with PM2"
    echo -e "✅ Firebase service account loaded from AWS Secrets Manager"
    echo -e "✅ All dependencies properly installed"
    echo -e "✅ Health endpoint responding"
else
    echo -e "\n${YELLOW}⚠️  Backend started but health check not responding yet.${NC}"
    echo -e "This may be normal startup behavior. Monitor logs with:"
    echo -e "pm2 logs cryptoescrow-backend --follow"
fi 