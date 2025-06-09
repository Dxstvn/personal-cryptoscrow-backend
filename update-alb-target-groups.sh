#!/bin/bash

# 🎯 AWS ALB TARGET GROUP UPDATE SCRIPT
# Updates target groups to use correct ports: 3000 (production) and 5173 (staging)

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

echo -e "${BOLD}🎯 ALB TARGET GROUP UPDATE${NC}"
echo "================================="
echo "Updating target groups for:"
echo "• Production: port 3000"
echo "• Staging: port 5173"
echo ""

# Get existing ALB information from your screenshots
ALB_ARN="arn:aws:elasticloadbalancing:us-east-1:407813178514:loadbalancer/app/clearhold-app-alb/24298611ecbe24a1"
VPC_ID="vpc-00661f7a3875053a4"
INSTANCE_ID="i-0b25b447125440fc6b"

log_info "Using ALB: clearhold-app-alb"
log_info "VPC ID: $VPC_ID"
log_info "Instance ID: $INSTANCE_ID"

# Check existing target groups
log_info "Checking existing target groups..."
EXISTING_TGS=$(aws elbv2 describe-target-groups --load-balancer-arn $ALB_ARN --query "TargetGroups[*].[TargetGroupName,Port,TargetGroupArn]" --output text)
echo "$EXISTING_TGS"

# Production target group (port 3000)
log_info "Checking production target group (port 3000)..."
PROD_TG_ARN=$(aws elbv2 describe-target-groups --load-balancer-arn $ALB_ARN --query "TargetGroups[?Port==\`3000\`].TargetGroupArn" --output text 2>/dev/null || echo "")

if [ -z "$PROD_TG_ARN" ]; then
    # Check if there's an existing production target group with different port
    EXISTING_PROD_TG=$(aws elbv2 describe-target-groups --load-balancer-arn $ALB_ARN --query "TargetGroups[?contains(TargetGroupName, 'backend') && Port!=\`3000\`] | [0]" --output json 2>/dev/null || echo "null")
    
    if [ "$EXISTING_PROD_TG" != "null" ]; then
        OLD_TG_ARN=$(echo "$EXISTING_PROD_TG" | jq -r '.TargetGroupArn')
        OLD_PORT=$(echo "$EXISTING_PROD_TG" | jq -r '.Port')
        log_warning "Found existing production target group on port $OLD_PORT"
        
        # Create new target group for port 3000
        log_info "Creating new production target group for port 3000..."
        PROD_TG_ARN=$(aws elbv2 create-target-group \
            --name "cryptoescrow-backend-3000" \
            --protocol HTTP \
            --port 3000 \
            --vpc-id $VPC_ID \
            --health-check-path "/health/simple" \
            --health-check-protocol HTTP \
            --health-check-port 3000 \
            --health-check-interval-seconds 30 \
            --health-check-timeout-seconds 5 \
            --healthy-threshold-count 2 \
            --unhealthy-threshold-count 2 \
            --query "TargetGroups[0].TargetGroupArn" \
            --output text)
        
        log_success "Created production target group: $PROD_TG_ARN"
        
        # Register instance
        aws elbv2 register-targets \
            --target-group-arn $PROD_TG_ARN \
            --targets Id=$INSTANCE_ID,Port=3000
        
        log_success "Registered instance with production target group"
        
        # Update listener rules to use new target group
        log_info "Updating production listener rules..."
        HTTPS_LISTENER_ARN=$(aws elbv2 describe-listeners --load-balancer-arn $ALB_ARN --query "Listeners[?Port==\`443\`].ListenerArn" --output text)
        
        # Find rules using the old target group
        OLD_RULES=$(aws elbv2 describe-rules --listener-arn $HTTPS_LISTENER_ARN --query "Rules[?Actions[0].TargetGroupArn=='$OLD_TG_ARN'].RuleArn" --output text)
        
        for RULE_ARN in $OLD_RULES; do
            if [ "$RULE_ARN" != "None" ]; then
                log_info "Updating rule $RULE_ARN to use new target group..."
                aws elbv2 modify-rule \
                    --rule-arn $RULE_ARN \
                    --actions Type=forward,TargetGroupArn=$PROD_TG_ARN
            fi
        done
        
        # Update default action if it was using old target group
        DEFAULT_ACTION=$(aws elbv2 describe-listeners --listener-arn $HTTPS_LISTENER_ARN --query "Listeners[0].DefaultActions[0].TargetGroupArn" --output text)
        if [ "$DEFAULT_ACTION" = "$OLD_TG_ARN" ]; then
            log_info "Updating default action to use new target group..."
            aws elbv2 modify-listener \
                --listener-arn $HTTPS_LISTENER_ARN \
                --default-actions Type=forward,TargetGroupArn=$PROD_TG_ARN
        fi
    else
        log_info "Creating production target group for port 3000..."
        PROD_TG_ARN=$(aws elbv2 create-target-group \
            --name "cryptoescrow-backend-3000" \
            --protocol HTTP \
            --port 3000 \
            --vpc-id $VPC_ID \
            --health-check-path "/health/simple" \
            --health-check-protocol HTTP \
            --health-check-port 3000 \
            --query "TargetGroups[0].TargetGroupArn" \
            --output text)
        
        # Register instance
        aws elbv2 register-targets \
            --target-group-arn $PROD_TG_ARN \
            --targets Id=$INSTANCE_ID,Port=3000
        
        log_success "Created and registered production target group"
    fi
else
    log_success "Production target group already exists: $PROD_TG_ARN"
    # Ensure instance is registered
    aws elbv2 register-targets \
        --target-group-arn $PROD_TG_ARN \
        --targets Id=$INSTANCE_ID,Port=3000 2>/dev/null || true
fi

# Staging target group (port 5173)
log_info "Checking staging target group (port 5173)..."
STAGING_TG_ARN=$(aws elbv2 describe-target-groups --load-balancer-arn $ALB_ARN --query "TargetGroups[?Port==\`5173\`].TargetGroupArn" --output text 2>/dev/null || echo "")

if [ -z "$STAGING_TG_ARN" ]; then
    # Check for existing staging target group on different port (like 3001)
    EXISTING_STAGING_TG=$(aws elbv2 describe-target-groups --load-balancer-arn $ALB_ARN --query "TargetGroups[?contains(TargetGroupName, 'staging') || Port==\`3001\`] | [0]" --output json 2>/dev/null || echo "null")
    
    if [ "$EXISTING_STAGING_TG" != "null" ]; then
        OLD_STAGING_TG_ARN=$(echo "$EXISTING_STAGING_TG" | jq -r '.TargetGroupArn')
        OLD_STAGING_PORT=$(echo "$EXISTING_STAGING_TG" | jq -r '.Port')
        log_warning "Found existing staging target group on port $OLD_STAGING_PORT"
    fi
    
    log_info "Creating staging target group for port 5173..."
    STAGING_TG_ARN=$(aws elbv2 create-target-group \
        --name "cryptoescrow-be-staging-5173" \
        --protocol HTTP \
        --port 5173 \
        --vpc-id $VPC_ID \
        --health-check-path "/health/simple" \
        --health-check-protocol HTTP \
        --health-check-port 5173 \
        --health-check-interval-seconds 30 \
        --health-check-timeout-seconds 5 \
        --healthy-threshold-count 2 \
        --unhealthy-threshold-count 2 \
        --query "TargetGroups[0].TargetGroupArn" \
        --output text)
    
    log_success "Created staging target group: $STAGING_TG_ARN"
    
    # Register instance
    aws elbv2 register-targets \
        --target-group-arn $STAGING_TG_ARN \
        --targets Id=$INSTANCE_ID,Port=5173
    
    log_success "Registered instance with staging target group"
    
    # Create or update listener rule for staging.clearhold.app
    HTTPS_LISTENER_ARN=$(aws elbv2 describe-listeners --load-balancer-arn $ALB_ARN --query "Listeners[?Port==\`443\`].ListenerArn" --output text)
    
    # Check if staging rule exists
    STAGING_RULE=$(aws elbv2 describe-rules --listener-arn $HTTPS_LISTENER_ARN --query "Rules[?Conditions[0].Values[0]=='staging.clearhold.app']" --output text 2>/dev/null || echo "")
    
    if [ -z "$STAGING_RULE" ]; then
        log_info "Creating listener rule for staging.clearhold.app..."
        aws elbv2 create-rule \
            --listener-arn $HTTPS_LISTENER_ARN \
            --priority 90 \
            --conditions Field=host-header,Values=staging.clearhold.app \
            --actions Type=forward,TargetGroupArn=$STAGING_TG_ARN
        
        log_success "Created staging listener rule"
    else
        log_info "Updating existing staging listener rule..."
        STAGING_RULE_ARN=$(aws elbv2 describe-rules --listener-arn $HTTPS_LISTENER_ARN --query "Rules[?Conditions[0].Values[0]=='staging.clearhold.app'].RuleArn" --output text)
        aws elbv2 modify-rule \
            --rule-arn $STAGING_RULE_ARN \
            --actions Type=forward,TargetGroupArn=$STAGING_TG_ARN
        
        log_success "Updated staging listener rule"
    fi
else
    log_success "Staging target group already exists: $STAGING_TG_ARN"
    # Ensure instance is registered
    aws elbv2 register-targets \
        --target-group-arn $STAGING_TG_ARN \
        --targets Id=$INSTANCE_ID,Port=5173 2>/dev/null || true
fi

# Wait for health checks
log_info "Waiting for health checks to pass..."
echo "This may take 1-2 minutes..."

for i in {1..12}; do
    echo "Health check attempt $i/12..."
    
    # Check production health
    if [ -n "$PROD_TG_ARN" ]; then
        PROD_HEALTH=$(aws elbv2 describe-target-health --target-group-arn $PROD_TG_ARN --targets Id=$INSTANCE_ID,Port=3000 --query 'TargetHealthDescriptions[0].TargetHealth.State' --output text 2>/dev/null || echo "unknown")
        echo "  Production (port 3000): $PROD_HEALTH"
    fi
    
    # Check staging health  
    if [ -n "$STAGING_TG_ARN" ]; then
        STAGING_HEALTH=$(aws elbv2 describe-target-health --target-group-arn $STAGING_TG_ARN --targets Id=$INSTANCE_ID,Port=5173 --query 'TargetHealthDescriptions[0].TargetHealth.State' --output text 2>/dev/null || echo "unknown")
        echo "  Staging (port 5173): $STAGING_HEALTH"
    fi
    
    # Check if both are healthy
    if [ "$PROD_HEALTH" = "healthy" ] && [ "$STAGING_HEALTH" = "healthy" ]; then
        log_success "Both target groups are healthy!"
        break
    fi
    
    sleep 10
done

echo ""
echo -e "${BOLD}🎉 ALB TARGET GROUP UPDATE COMPLETE!${NC}"
echo "===================================="
echo ""
echo -e "${BOLD}📊 FINAL STATUS:${NC}"
echo "• Production Target Group: $([ -n "$PROD_TG_ARN" ] && echo "✅ Configured" || echo "❌ Failed") (port 3000)"
echo "• Staging Target Group: $([ -n "$STAGING_TG_ARN" ] && echo "✅ Configured" || echo "❌ Failed") (port 5173)"
echo "• Production Health: $PROD_HEALTH"
echo "• Staging Health: $STAGING_HEALTH"
echo ""

echo -e "${BOLD}🧪 TEST COMMANDS:${NC}"
echo "# Test external endpoints (should work in 1-2 minutes):"
echo "curl -I https://api.clearhold.app/health/simple"
echo "curl -I https://staging.clearhold.app/health/simple"
echo ""

echo -e "${BOLD}📋 MONITOR HEALTH:${NC}"
echo "# Check target group health:"
if [ -n "$PROD_TG_ARN" ]; then
    echo "aws elbv2 describe-target-health --target-group-arn $PROD_TG_ARN"
fi
if [ -n "$STAGING_TG_ARN" ]; then
    echo "aws elbv2 describe-target-health --target-group-arn $STAGING_TG_ARN"
fi
echo ""

log_success "ALB target group update completed!" 