#!/bin/bash

# 🎯 TARGET GROUP REGISTRATION FIX
# This fixes the instance registration issue that was causing "unused" status

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
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

echo -e "${BOLD}🎯 TARGET GROUP REGISTRATION FIX${NC}"
echo "========================================="

# Get the correct running instance ID
INSTANCE_ID=$(aws ec2 describe-instances --filters "Name=instance-state-name,Values=running" --query "Reservations[0].Instances[0].InstanceId" --output text)

if [ "$INSTANCE_ID" = "None" ] || [ -z "$INSTANCE_ID" ]; then
    log_error "No running EC2 instance found!"
    exit 1
fi

log_info "Found running instance: $INSTANCE_ID"

# Target group ARNs
PROD_TG_ARN="arn:aws:elasticloadbalancing:us-east-1:407813178514:targetgroup/cryptoescrow-backend-3000/deb8517bf44a65c1"
STAGING_TG_ARN="arn:aws:elasticloadbalancing:us-east-1:407813178514:targetgroup/cryptoescrow-be-staging-5173/37bc1585a7ddda29"

# Register production target
log_info "Registering instance with production target group (port 3000)..."
aws elbv2 register-targets \
    --target-group-arn "$PROD_TG_ARN" \
    --targets Id=$INSTANCE_ID,Port=3000

log_success "Production target registered"

# Register staging target  
log_info "Registering instance with staging target group (port 5173)..."
aws elbv2 register-targets \
    --target-group-arn "$STAGING_TG_ARN" \
    --targets Id=$INSTANCE_ID,Port=5173

log_success "Staging target registered"

# Wait a moment and check health
log_info "Waiting 10 seconds for initial health check..."
sleep 10

log_info "Checking health status..."

# Check production health
PROD_HEALTH=$(aws elbv2 describe-target-health --target-group-arn "$PROD_TG_ARN" --targets Id=$INSTANCE_ID,Port=3000 --query 'TargetHealthDescriptions[0].TargetHealth.State' --output text 2>/dev/null || echo "unknown")
echo "Production (port 3000): $PROD_HEALTH"

# Check staging health
STAGING_HEALTH=$(aws elbv2 describe-target-health --target-group-arn "$STAGING_TG_ARN" --targets Id=$INSTANCE_ID,Port=5173 --query 'TargetHealthDescriptions[0].TargetHealth.State' --output text 2>/dev/null || echo "unknown")
echo "Staging (port 5173): $STAGING_HEALTH"

echo ""
echo -e "${BOLD}🎉 TARGET GROUP REGISTRATION COMPLETE!${NC}"
echo "==========================================="
echo ""
echo -e "${BOLD}📊 STATUS:${NC}"
echo "• Instance ID: $INSTANCE_ID"
echo "• Production Health: $PROD_HEALTH"
echo "• Staging Health: $STAGING_HEALTH"
echo ""

if [ "$PROD_HEALTH" = "initial" ] || [ "$STAGING_HEALTH" = "initial" ]; then
    log_info "Health checks are in 'initial' state - this is normal!"
    log_info "Wait 1-2 minutes for health checks to complete."
    echo ""
fi

echo -e "${BOLD}🧪 TEST EXTERNAL ENDPOINTS (after health checks pass):${NC}"
echo "curl -I https://api.clearhold.app/health"
echo "curl -I https://staging.clearhold.app/health"
echo ""

echo -e "${BOLD}📋 MONITOR HEALTH:${NC}"
echo "aws elbv2 describe-target-health --target-group-arn \"$PROD_TG_ARN\""
echo "aws elbv2 describe-target-health --target-group-arn \"$STAGING_TG_ARN\""

log_success "Target group registration fix completed!" 