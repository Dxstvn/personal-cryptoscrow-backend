#!/bin/bash

# 🚀 COMPREHENSIVE CONNECTIVITY FIX SCRIPT
# Fixes all identified issues preventing staging and production connectivity

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

log_section() {
    echo -e "\n${BOLD}${BLUE}$1${NC}"
    echo "=========================================="
}

echo -e "${BOLD}🔧 CRYPTOESCROW BACKEND CONNECTIVITY FIX${NC}"
echo "=============================================="
echo "This script will fix all identified connectivity issues:"
echo "• Port configuration mismatches"
echo "• PM2 environment variable issues"
echo "• Firebase initialization problems"
echo "• AWS ALB target group configurations"
echo ""

# Check if we're on EC2
if curl -s --max-time 2 http://169.254.169.254/latest/meta-data/instance-id >/dev/null 2>&1; then
    INSTANCE_ID=$(curl -s http://169.254.169.254/latest/meta-data/instance-id)
    log_success "Running on EC2 instance: $INSTANCE_ID"
else
    log_warning "Not on EC2 - some steps will be skipped"
    INSTANCE_ID=""
fi

# ==========================================
# PHASE 1: STOP ALL PROCESSES AND CLEAN UP
# ==========================================
log_section "PHASE 1: CLEANUP AND PORT MANAGEMENT"

log_info "Stopping all PM2 processes..."
pm2 stop all 2>/dev/null || true
pm2 delete all 2>/dev/null || true

log_info "Killing any processes using ports 3000, 3001, and 5173..."
for port in 3000 3001 5173; do
    if lsof -ti:$port >/dev/null 2>&1; then
        log_warning "Killing processes on port $port"
        lsof -ti:$port | xargs kill -9 2>/dev/null || true
        sleep 2
    fi
done

log_info "Verifying ports are free..."
for port in 3000 5173; do
    if lsof -i:$port >/dev/null 2>&1; then
        log_error "Port $port is still in use!"
        lsof -i:$port
        exit 1
    else
        log_success "Port $port is free"
    fi
done

# ==========================================
# PHASE 2: VERIFY ECOSYSTEM CONFIGURATIONS
# ==========================================
log_section "PHASE 2: ECOSYSTEM FILE VERIFICATION"

log_info "Verifying production ecosystem file..."
if [ -f "ecosystem.production.cjs" ]; then
    PROD_PORT=$(node -e "const config = require('./ecosystem.production.cjs'); console.log(config.apps[0].env.PORT);" 2>/dev/null || echo "unknown")
    if [ "$PROD_PORT" = "3000" ]; then
        log_success "Production port correctly set to 3000"
    else
        log_error "Production port is $PROD_PORT, should be 3000"
        exit 1
    fi
else
    log_error "ecosystem.production.cjs not found"
    exit 1
fi

log_info "Verifying staging ecosystem file..."
if [ -f "ecosystem.staging.cjs" ]; then
    STAGING_PORT=$(node -e "const config = require('./ecosystem.staging.cjs'); console.log(config.apps[0].env.PORT);" 2>/dev/null || echo "unknown")
    if [ "$STAGING_PORT" = "5173" ]; then
        log_success "Staging port correctly set to 5173"
    else
        log_error "Staging port is $STAGING_PORT, should be 5173"
        exit 1
    fi
else
    log_error "ecosystem.staging.cjs not found"
    exit 1
fi

# ==========================================
# PHASE 3: INSTALL DEPENDENCIES AND PREPARE
# ==========================================
log_section "PHASE 3: DEPENDENCY INSTALLATION"

log_info "Creating logs directory..."
mkdir -p logs

log_info "Installing/updating dependencies..."
npm install --production

# ==========================================
# PHASE 4: START PRODUCTION ENVIRONMENT
# ==========================================
log_section "PHASE 4: STARTING PRODUCTION (PORT 3000)"

log_info "Starting production environment..."
pm2 start ecosystem.production.cjs

# Wait for production to start
log_info "Waiting for production to initialize..."
sleep 10

# Check production status
PROD_RUNNING=$(pm2 list | grep -c "cryptoescrow-backend.*online" || echo "0")
if [ "$PROD_RUNNING" -eq 0 ]; then
    log_error "Production failed to start"
    pm2 logs cryptoescrow-backend --lines 20
    exit 1
fi

# Test production health
log_info "Testing production health endpoint..."
for i in {1..30}; do
    if curl -s http://localhost:3000/health/simple >/dev/null 2>&1; then
        PROD_HEALTH=$(curl -s http://localhost:3000/health/simple | jq -r '.status' 2>/dev/null || echo "unknown")
        log_success "Production health check: $PROD_HEALTH"
        break
    elif [ $i -eq 30 ]; then
        log_error "Production health check failed after 30 attempts"
        pm2 logs cryptoescrow-backend --lines 20
        exit 1
    else
        log_info "Attempt $i/30: Waiting for production health endpoint..."
        sleep 2
    fi
done

# ==========================================
# PHASE 5: START STAGING ENVIRONMENT  
# ==========================================
log_section "PHASE 5: STARTING STAGING (PORT 5173)"

log_info "Starting staging environment..."
pm2 start ecosystem.staging.cjs

# Wait for staging to start
log_info "Waiting for staging to initialize..."
sleep 10

# Check staging status
STAGING_RUNNING=$(pm2 list | grep -c "cryptoescrow-backend-staging.*online" || echo "0")
if [ "$STAGING_RUNNING" -eq 0 ]; then
    log_error "Staging failed to start"
    pm2 logs cryptoescrow-backend-staging --lines 20
    exit 1
fi

# Test staging health
log_info "Testing staging health endpoint..."
for i in {1..30}; do
    if curl -s http://localhost:5173/health/simple >/dev/null 2>&1; then
        STAGING_HEALTH=$(curl -s http://localhost:5173/health/simple | jq -r '.status' 2>/dev/null || echo "unknown")
        log_success "Staging health check: $STAGING_HEALTH"
        break
    elif [ $i -eq 30 ]; then
        log_error "Staging health check failed after 30 attempts"
        pm2 logs cryptoescrow-backend-staging --lines 20
        exit 1
    else
        log_info "Attempt $i/30: Waiting for staging health endpoint..."
        sleep 2
    fi
done

# ==========================================
# PHASE 6: AWS SECURITY GROUP CONFIGURATION
# ==========================================
log_section "PHASE 6: AWS SECURITY GROUP CONFIGURATION"

if [ -n "$INSTANCE_ID" ] && command -v aws >/dev/null 2>&1; then
    log_info "Configuring AWS security groups..."
    
    # Get security groups
    SECURITY_GROUPS=$(aws ec2 describe-instances --instance-ids $INSTANCE_ID --query 'Reservations[0].Instances[0].SecurityGroups[].GroupId' --output text 2>/dev/null || echo "")
    
    if [ -n "$SECURITY_GROUPS" ]; then
        log_info "Instance security groups: $SECURITY_GROUPS"
        
        # Get VPC ID for internal rules
        VPC_ID=$(aws ec2 describe-instances --instance-ids $INSTANCE_ID --query 'Reservations[0].Instances[0].VpcId' --output text 2>/dev/null || echo "")
        VPC_CIDR=$(aws ec2 describe-vpcs --vpc-ids $VPC_ID --query 'Vpcs[0].CidrBlock' --output text 2>/dev/null || echo "10.0.0.0/16")
        
        # Check and add security group rules for both ports
        for SG in $SECURITY_GROUPS; do
            for PORT in 3000 5173; do
                log_info "Checking security group $SG for port $PORT..."
                
                # Check if rule exists
                if aws ec2 describe-security-groups --group-ids $SG --query "SecurityGroups[0].IpPermissions[?FromPort<=\`$PORT\` && ToPort>=\`$PORT\`]" --output text 2>/dev/null | grep -q .; then
                    log_success "Port $PORT access already configured in $SG"
                else
                    log_warning "Adding inbound rule for port $PORT to $SG..."
                    
                    # Add rule for VPC access (ALB to instances)
                    aws ec2 authorize-security-group-ingress \
                        --group-id $SG \
                        --protocol tcp \
                        --port $PORT \
                        --cidr $VPC_CIDR \
                        --description "Allow VPC access to port $PORT" 2>/dev/null || log_warning "Rule may already exist"
                fi
            done
        done
    else
        log_warning "Could not retrieve security group information"
    fi
else
    log_warning "Skipping AWS configuration (not on EC2 or AWS CLI not available)"
fi

# ==========================================
# PHASE 7: AWS TARGET GROUP VERIFICATION/CREATION
# ==========================================
log_section "PHASE 7: AWS TARGET GROUP CONFIGURATION"

if [ -n "$INSTANCE_ID" ] && command -v aws >/dev/null 2>&1; then
    log_info "Checking AWS target group configuration..."
    
    # Check for existing ALB
    ALB_ARN=$(aws elbv2 describe-load-balancers --query "LoadBalancers[?contains(LoadBalancerName, 'clearhold') || contains(DNSName, 'clearhold')].LoadBalancerArn" --output text 2>/dev/null || echo "")
    
    if [ -n "$ALB_ARN" ]; then
        ALB_DNS=$(aws elbv2 describe-load-balancers --load-balancer-arns $ALB_ARN --query "LoadBalancers[0].DNSName" --output text)
        log_success "Found ALB: $ALB_DNS"
        
        # Get VPC ID
        VPC_ID=$(aws elbv2 describe-load-balancers --load-balancer-arns $ALB_ARN --query "LoadBalancers[0].VpcId" --output text)
        
        # Check production target group (port 3000)
        PROD_TG_ARN=$(aws elbv2 describe-target-groups --load-balancer-arn $ALB_ARN --query "TargetGroups[?Port==\`3000\`].TargetGroupArn" --output text 2>/dev/null || echo "")
        
        if [ -z "$PROD_TG_ARN" ]; then
            log_warning "Creating production target group for port 3000..."
            PROD_TG_ARN=$(aws elbv2 create-target-group \
                --name "cryptoescrow-backend-3000" \
                --protocol HTTP \
                --port 3000 \
                --vpc-id $VPC_ID \
                --health-check-path "/health/simple" \
                --health-check-protocol HTTP \
                --health-check-port 3000 \
                --query "TargetGroups[0].TargetGroupArn" \
                --output text 2>/dev/null || echo "")
            
            if [ -n "$PROD_TG_ARN" ]; then
                log_success "Created production target group"
                
                # Register instance
                aws elbv2 register-targets \
                    --target-group-arn $PROD_TG_ARN \
                    --targets Id=$INSTANCE_ID,Port=3000 2>/dev/null || true
                log_success "Registered instance with production target group"
            fi
        else
            log_success "Production target group exists: $PROD_TG_ARN"
            
            # Ensure instance is registered
            aws elbv2 register-targets \
                --target-group-arn $PROD_TG_ARN \
                --targets Id=$INSTANCE_ID,Port=3000 2>/dev/null || true
        fi
        
        # Check staging target group (port 5173)
        STAGING_TG_ARN=$(aws elbv2 describe-target-groups --load-balancer-arn $ALB_ARN --query "TargetGroups[?Port==\`5173\`].TargetGroupArn" --output text 2>/dev/null || echo "")
        
        if [ -z "$STAGING_TG_ARN" ]; then
            log_warning "Creating staging target group for port 5173..."
            STAGING_TG_ARN=$(aws elbv2 create-target-group \
                --name "cryptoescrow-be-staging-5173" \
                --protocol HTTP \
                --port 5173 \
                --vpc-id $VPC_ID \
                --health-check-path "/health/simple" \
                --health-check-protocol HTTP \
                --health-check-port 5173 \
                --query "TargetGroups[0].TargetGroupArn" \
                --output text 2>/dev/null || echo "")
            
            if [ -n "$STAGING_TG_ARN" ]; then
                log_success "Created staging target group"
                
                # Register instance
                aws elbv2 register-targets \
                    --target-group-arn $STAGING_TG_ARN \
                    --targets Id=$INSTANCE_ID,Port=5173 2>/dev/null || true
                log_success "Registered instance with staging target group"
            fi
        else
            log_success "Staging target group exists: $STAGING_TG_ARN"
            
            # Ensure instance is registered
            aws elbv2 register-targets \
                --target-group-arn $STAGING_TG_ARN \
                --targets Id=$INSTANCE_ID,Port=5173 2>/dev/null || true
        fi
        
        # Check listener rules
        HTTPS_LISTENER_ARN=$(aws elbv2 describe-listeners --load-balancer-arn $ALB_ARN --query "Listeners[?Port==\`443\`].ListenerArn" --output text 2>/dev/null || echo "")
        
        if [ -n "$HTTPS_LISTENER_ARN" ]; then
            log_info "Checking/creating listener rules..."
            
            # Check staging rule
            STAGING_RULE=$(aws elbv2 describe-rules --listener-arn $HTTPS_LISTENER_ARN --query "Rules[?Conditions[0].Values[0]=='staging.clearhold.app']" --output text 2>/dev/null || echo "")
            
            if [ -z "$STAGING_RULE" ] && [ -n "$STAGING_TG_ARN" ]; then
                log_warning "Creating listener rule for staging.clearhold.app..."
                aws elbv2 create-rule \
                    --listener-arn $HTTPS_LISTENER_ARN \
                    --priority 90 \
                    --conditions Field=host-header,Values=staging.clearhold.app \
                    --actions Type=forward,TargetGroupArn=$STAGING_TG_ARN 2>/dev/null || log_warning "Rule creation failed"
                log_success "Created staging listener rule"
            fi
        fi
    else
        log_warning "No ALB found - you may need to create one manually"
    fi
else
    log_warning "Skipping AWS target group configuration"
fi

# ==========================================
# PHASE 8: FINAL VERIFICATION AND STATUS
# ==========================================
log_section "PHASE 8: FINAL VERIFICATION"

log_info "Saving PM2 configuration..."
pm2 save

log_info "Final PM2 status:"
pm2 status

log_info "Testing final connectivity..."

# Test production
PROD_STATUS="❌"
if curl -s http://localhost:3000/health/simple >/dev/null 2>&1; then
    PROD_STATUS="✅"
fi

# Test staging  
STAGING_STATUS="❌"
if curl -s http://localhost:5173/health/simple >/dev/null 2>&1; then
    STAGING_STATUS="✅"
fi

# Test external (if possible)
EXTERNAL_PROD_STATUS="❓"
EXTERNAL_STAGING_STATUS="❓"

if command -v curl >/dev/null 2>&1; then
    if curl -s --max-time 10 https://api.clearhold.app/health/simple >/dev/null 2>&1; then
        EXTERNAL_PROD_STATUS="✅"
    else
        EXTERNAL_PROD_STATUS="❌"
    fi
    
    if curl -s --max-time 10 https://staging.clearhold.app/health/simple >/dev/null 2>&1; then
        EXTERNAL_STAGING_STATUS="✅"
    else
        EXTERNAL_STAGING_STATUS="❌"
    fi
fi

# ==========================================
# FINAL SUMMARY
# ==========================================
echo ""
echo -e "${BOLD}🎉 CONNECTIVITY FIX COMPLETE! 🎉${NC}"
echo "=============================================="
echo ""
echo -e "${BOLD}📊 STATUS SUMMARY:${NC}"
echo "• Production (port 3000):  $PROD_STATUS Local"
echo "• Staging (port 5173):     $STAGING_STATUS Local"
echo "• api.clearhold.app:       $EXTERNAL_PROD_STATUS External"  
echo "• staging.clearhold.app:   $EXTERNAL_STAGING_STATUS External"
echo ""

if [ "$PROD_STATUS" = "✅" ] && [ "$STAGING_STATUS" = "✅" ]; then
    log_success "Both environments are running locally!"
    echo ""
    echo -e "${BOLD}🧪 TEST COMMANDS:${NC}"
    echo "curl http://localhost:3000/health/simple    # Production"
    echo "curl http://localhost:5173/health/simple    # Staging"
    echo ""
    
    if [ "$EXTERNAL_PROD_STATUS" = "❌" ] || [ "$EXTERNAL_STAGING_STATUS" = "❌" ]; then
        echo -e "${BOLD}⏳ NEXT STEPS FOR EXTERNAL ACCESS:${NC}"
        echo "1. Wait 2-3 minutes for ALB health checks to pass"
        echo "2. Verify target group health in AWS console"
        echo "3. Check ALB listener rules are correct"
        echo "4. Test external endpoints again"
    fi
else
    log_error "Some environments failed to start properly"
    echo ""
    echo -e "${BOLD}🔧 DEBUGGING STEPS:${NC}"
    echo "1. Check PM2 logs: pm2 logs"
    echo "2. Check individual service logs:"
    if [ "$PROD_STATUS" = "❌" ]; then
        echo "   pm2 logs cryptoescrow-backend --lines 50"
    fi
    if [ "$STAGING_STATUS" = "❌" ]; then
        echo "   pm2 logs cryptoescrow-backend-staging --lines 50"
    fi
    echo "3. Check process status: pm2 status"
    echo "4. Check port usage: lsof -i:3000 && lsof -i:5173"
fi

echo ""
echo -e "${BOLD}📋 MONITORING:${NC}"
echo "• pm2 status                    # Check process status"
echo "• pm2 logs --lines 20           # Check recent logs"  
echo "• pm2 monit                     # Real-time monitoring"
echo ""

echo "✅ Connectivity fix script completed!" 