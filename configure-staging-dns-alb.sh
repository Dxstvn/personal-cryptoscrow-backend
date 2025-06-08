#!/bin/bash

# 🌐 STAGING DNS AND ALB CONFIGURATION SCRIPT
# This script helps configure DNS and ALB for staging.clearhold.app

set -e

echo "🌐 Staging DNS and ALB Configuration"
echo "===================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

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

# Get current instance information
INSTANCE_ID=$(curl -s http://169.254.169.254/latest/meta-data/instance-id)
PUBLIC_IP=$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4)
PRIVATE_IP=$(curl -s http://169.254.169.254/latest/meta-data/local-ipv4)

log_info "Current instance details:"
echo "• Instance ID: $INSTANCE_ID"
echo "• Public IP: $PUBLIC_IP"
echo "• Private IP: $PRIVATE_IP"

# Check if ALB exists
log_info "Checking for existing Application Load Balancer..."
ALB_ARN=$(aws elbv2 describe-load-balancers --query "LoadBalancers[?contains(LoadBalancerName, 'clearhold') || contains(DNSName, 'clearhold')].LoadBalancerArn" --output text)

if [ -n "$ALB_ARN" ]; then
    ALB_DNS=$(aws elbv2 describe-load-balancers --load-balancer-arns $ALB_ARN --query "LoadBalancers[0].DNSName" --output text)
    log_success "Found existing ALB: $ALB_DNS"
    
    # Check target groups
    log_info "Checking target groups..."
    TARGET_GROUPS=$(aws elbv2 describe-target-groups --load-balancer-arn $ALB_ARN --query "TargetGroups[*].[TargetGroupName,Port,Protocol]" --output table)
    echo "$TARGET_GROUPS"
    
    # Check if staging target group exists (port 3001)
    STAGING_TG_ARN=$(aws elbv2 describe-target-groups --load-balancer-arn $ALB_ARN --query "TargetGroups[?Port==\`3001\`].TargetGroupArn" --output text)
    
    if [ -z "$STAGING_TG_ARN" ]; then
        log_warning "No staging target group found (port 3001). Creating one..."
        
        # Get VPC ID from the ALB
        VPC_ID=$(aws elbv2 describe-load-balancers --load-balancer-arns $ALB_ARN --query "LoadBalancers[0].VpcId" --output text)
        
        # Create target group for staging
        STAGING_TG_ARN=$(aws elbv2 create-target-group \
            --name "clearhold-staging-tg" \
            --protocol HTTP \
            --port 3001 \
            --vpc-id $VPC_ID \
            --health-check-path "/health" \
            --health-check-protocol HTTP \
            --health-check-port 3001 \
            --query "TargetGroups[0].TargetGroupArn" \
            --output text)
        
        log_success "Created staging target group: $STAGING_TG_ARN"
        
        # Register current instance with the target group
        aws elbv2 register-targets \
            --target-group-arn $STAGING_TG_ARN \
            --targets Id=$INSTANCE_ID,Port=3001
        
        log_success "Registered instance $INSTANCE_ID with staging target group"
    else
        log_success "Found existing staging target group: $STAGING_TG_ARN"
        
        # Check if current instance is registered
        REGISTERED=$(aws elbv2 describe-target-health --target-group-arn $STAGING_TG_ARN --query "TargetHealthDescriptions[?Target.Id=='$INSTANCE_ID']" --output text)
        
        if [ -z "$REGISTERED" ]; then
            log_warning "Current instance not registered with staging target group. Registering..."
            aws elbv2 register-targets \
                --target-group-arn $STAGING_TG_ARN \
                --targets Id=$INSTANCE_ID,Port=3001
            log_success "Registered instance with staging target group"
        else
            log_success "Instance already registered with staging target group"
        fi
    fi
    
    # Check listeners
    log_info "Checking ALB listeners..."
    LISTENERS=$(aws elbv2 describe-listeners --load-balancer-arn $ALB_ARN --query "Listeners[*].[Port,Protocol]" --output table)
    echo "$LISTENERS"
    
    # Check if there's a listener rule for staging.clearhold.app
    HTTPS_LISTENER_ARN=$(aws elbv2 describe-listeners --load-balancer-arn $ALB_ARN --query "Listeners[?Port==\`443\`].ListenerArn" --output text)
    
    if [ -n "$HTTPS_LISTENER_ARN" ]; then
        log_info "Checking listener rules for staging subdomain..."
        
        # Check if staging rule exists
        STAGING_RULE=$(aws elbv2 describe-rules --listener-arn $HTTPS_LISTENER_ARN --query "Rules[?Conditions[0].Values[0]=='staging.clearhold.app']" --output text)
        
        if [ -z "$STAGING_RULE" ]; then
            log_warning "No listener rule found for staging.clearhold.app. Creating one..."
            
            # Create listener rule for staging
            aws elbv2 create-rule \
                --listener-arn $HTTPS_LISTENER_ARN \
                --priority 100 \
                --conditions Field=host-header,Values=staging.clearhold.app \
                --actions Type=forward,TargetGroupArn=$STAGING_TG_ARN
            
            log_success "Created listener rule for staging.clearhold.app"
        else
            log_success "Listener rule for staging.clearhold.app already exists"
        fi
    else
        log_error "No HTTPS listener found on the ALB. You need to configure SSL first."
    fi
else
    log_error "No Application Load Balancer found. You need to create one first."
    echo ""
    echo "To create an ALB, run:"
    echo "./configure-staging-alb.sh"
    exit 1
fi

# Check Route 53 configuration
log_info "Checking Route 53 DNS configuration..."

# Get hosted zone for clearhold.app
HOSTED_ZONE_ID=$(aws route53 list-hosted-zones --query "HostedZones[?Name=='clearhold.app.'].Id" --output text | sed 's|/hostedzone/||')

if [ -n "$HOSTED_ZONE_ID" ]; then
    log_success "Found hosted zone for clearhold.app: $HOSTED_ZONE_ID"
    
    # Check if staging.clearhold.app record exists
    STAGING_RECORD=$(aws route53 list-resource-record-sets --hosted-zone-id $HOSTED_ZONE_ID --query "ResourceRecordSets[?Name=='staging.clearhold.app.']" --output text)
    
    if [ -z "$STAGING_RECORD" ]; then
        log_warning "No DNS record found for staging.clearhold.app. Creating one..."
        
        # Create DNS record
        cat > /tmp/staging-dns-record.json << EOF
{
    "Comment": "Create staging subdomain",
    "Changes": [{
        "Action": "CREATE",
        "ResourceRecordSet": {
            "Name": "staging.clearhold.app",
            "Type": "A",
            "AliasTarget": {
                "DNSName": "$ALB_DNS",
                "EvaluateTargetHealth": false,
                "HostedZoneId": "$(aws elbv2 describe-load-balancers --load-balancer-arns $ALB_ARN --query "LoadBalancers[0].CanonicalHostedZoneId" --output text)"
            }
        }
    }]
}
EOF
        
        CHANGE_ID=$(aws route53 change-resource-record-sets --hosted-zone-id $HOSTED_ZONE_ID --change-batch file:///tmp/staging-dns-record.json --query "ChangeInfo.Id" --output text)
        
        log_success "Created DNS record for staging.clearhold.app (Change ID: $CHANGE_ID)"
        log_info "DNS propagation may take a few minutes..."
        
        rm /tmp/staging-dns-record.json
    else
        log_success "DNS record for staging.clearhold.app already exists"
    fi
else
    log_error "No hosted zone found for clearhold.app. You need to configure DNS first."
fi

# Test health endpoint
echo ""
log_info "Testing staging environment..."

log_info "1. Testing local health endpoint..."
if curl -s http://localhost:3001/health | grep -q "OK"; then
    log_success "Local health endpoint is working"
else
    log_error "Local health endpoint is not responding"
fi

log_info "2. Testing public IP health endpoint..."
if curl -s http://$PUBLIC_IP:3001/health | grep -q "OK"; then
    log_success "Public IP health endpoint is working"
else
    log_error "Public IP health endpoint is not responding (check security groups)"
fi

log_info "3. Testing ALB health check..."
if [ -n "$STAGING_TG_ARN" ]; then
    TARGET_HEALTH=$(aws elbv2 describe-target-health --target-group-arn $STAGING_TG_ARN --query "TargetHealthDescriptions[0].TargetHealth.State" --output text)
    log_info "Target health status: $TARGET_HEALTH"
    
    if [ "$TARGET_HEALTH" = "healthy" ]; then
        log_success "ALB health check is passing"
    else
        log_warning "ALB health check is not passing. This may take a few minutes to update."
    fi
fi

log_info "4. Testing domain resolution..."
if nslookup staging.clearhold.app > /dev/null 2>&1; then
    log_success "staging.clearhold.app resolves correctly"
    
    log_info "5. Testing HTTPS endpoint..."
    if curl -s https://staging.clearhold.app/health | grep -q "OK"; then
        log_success "HTTPS endpoint is working!"
    else
        log_warning "HTTPS endpoint is not responding yet (may take time for DNS propagation and health checks)"
    fi
else
    log_warning "staging.clearhold.app does not resolve yet (DNS propagation in progress)"
fi

echo ""
echo "🎯 STAGING DNS AND ALB CONFIGURATION SUMMARY"
echo "============================================="
log_info "Configuration status:"
echo "• ALB: $ALB_DNS"
echo "• Target Group: $([ -n "$STAGING_TG_ARN" ] && echo "✅ Configured" || echo "❌ Missing")"
echo "• Listener Rule: $([ -n "$HTTPS_LISTENER_ARN" ] && echo "✅ Configured" || echo "❌ Missing")"
echo "• DNS Record: $([ -n "$STAGING_RECORD" ] && echo "✅ Configured" || echo "❌ Missing")"

echo ""
log_info "Test URLs:"
echo "• Local: http://localhost:3001/health"
echo "• Public IP: http://$PUBLIC_IP:3001/health"
echo "• Domain: https://staging.clearhold.app/health"

echo ""
log_info "Next steps:"
echo "1. Wait for DNS propagation (up to 10 minutes)"
echo "2. Wait for ALB health checks to pass (2-3 minutes)"
echo "3. Ensure SSL certificate covers *.clearhold.app or staging.clearhold.app"
echo "4. Test your staging application at https://staging.clearhold.app" 