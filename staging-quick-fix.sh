#!/bin/bash

# QUICK STAGING FIX - Address immediate PM2 and AWS issues
echo "🚀 QUICK STAGING FIX"
echo "==================="

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
log_success() { echo -e "${GREEN}✅ $1${NC}"; }
log_warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}"; }

# Stop current broken staging process
log_info "Stopping broken staging process..."
pm2 stop cryptoescrow-backend-staging 2>/dev/null || echo "No process to stop"
pm2 delete cryptoescrow-backend-staging 2>/dev/null || echo "No process to delete"

# Start staging with correct environment variables (same method that worked manually)
log_info "Starting staging with correct environment variables..."
NODE_ENV=staging PORT=3001 USE_AWS_SECRETS=true AWS_REGION=us-east-1 \
CHAIN_ID=11155111 RPC_URL="https://sepolia.infura.io/v3/4af9a8307a914da58937e8da53c602f9" \
FRONTEND_URL="https://staging.clearhold.app" DEBUG="cryptoescrow:*" LOG_LEVEL="debug" \
pm2 start src/server.js --name "cryptoescrow-backend-staging"

# Wait for startup
log_info "Waiting 15 seconds for startup..."
sleep 15

# Test health endpoint
log_info "Testing health endpoint..."
if curl -f -s http://localhost:3001/health >/dev/null; then
    RESPONSE=$(curl -s http://localhost:3001/health)
    log_success "✅ STAGING IS WORKING! Response: $RESPONSE"
    
    # Show PM2 status
    log_info "PM2 Status:"
    pm2 list
    
    # Test port binding
    log_info "Port 3001 binding:"
    netstat -tulpn | grep :3001 || log_warning "Port 3001 not found in netstat"
    
else
    log_error "Health endpoint still not responding"
    log_info "Checking logs..."
    pm2 logs cryptoescrow-backend-staging --lines 10
fi

# AWS Security Group Fix
log_info "🔧 AWS Security Group Fix"
echo "========================="

if command -v aws >/dev/null 2>&1; then
    INSTANCE_ID=$(curl -s http://169.254.169.254/latest/meta-data/instance-id)
    log_info "Instance ID: $INSTANCE_ID"
    
    # Get security groups
    SECURITY_GROUPS=$(aws ec2 describe-instances --instance-ids $INSTANCE_ID --query 'Reservations[0].Instances[0].SecurityGroups[].GroupId' --output text 2>/dev/null)
    log_info "Security Groups: $SECURITY_GROUPS"
    
    # Get VPC ID for ALB security group
    VPC_ID=$(aws ec2 describe-instances --instance-ids $INSTANCE_ID --query 'Reservations[0].Instances[0].VpcId' --output text 2>/dev/null)
    
    # Find ALB security group (it should have port 443/80 open)
    ALB_SG=$(aws ec2 describe-security-groups --filters "Name=vpc-id,Values=$VPC_ID" --query 'SecurityGroups[?IpPermissions[?FromPort==`443`]].GroupId' --output text 2>/dev/null | head -1)
    
    log_success "🎯 SECURITY GROUP FIX COMMANDS:"
    echo ""
    echo "# Method 1: Allow ALB security group to access port 3001"
    for sg in $SECURITY_GROUPS; do
        echo "aws ec2 authorize-security-group-ingress \\"
        echo "    --group-id $sg \\"
        echo "    --protocol tcp \\"
        echo "    --port 3001 \\"
        echo "    --source-group ${ALB_SG:-sg-ALB_SECURITY_GROUP_ID} \\"
        echo "    --description 'Allow ALB to access staging port 3001'"
        echo ""
    done
    
    echo "# Method 2: Allow internal VPC access to port 3001"
    VPC_CIDR=$(aws ec2 describe-vpcs --vpc-ids $VPC_ID --query 'Vpcs[0].CidrBlock' --output text 2>/dev/null)
    for sg in $SECURITY_GROUPS; do
        echo "aws ec2 authorize-security-group-ingress \\"
        echo "    --group-id $sg \\"
        echo "    --protocol tcp \\"
        echo "    --port 3001 \\"
        echo "    --cidr ${VPC_CIDR:-10.0.0.0/16} \\"
        echo "    --description 'Allow VPC access to staging port 3001'"
        echo ""
    done
    
else
    log_warning "AWS CLI not available"
fi

log_success "🎯 NEXT STEPS:"
echo "1. ✅ If health endpoint is working locally, run one of the security group commands above"
echo "2. 🔧 Create staging target group in AWS (port 3001, health path /health)"
echo "3. 🔧 Add listener rule for staging.clearhold.app → staging target group" 
echo "4. 🧪 Test: https://staging.clearhold.app/health" 