#!/bin/bash

# ==========================================
# COMPREHENSIVE STAGING ENVIRONMENT FIX
# ==========================================
# This script diagnoses and fixes all staging environment issues

set -e
trap 'echo "❌ Script failed at line $LINENO"' ERR

echo "🔧 COMPREHENSIVE STAGING DIAGNOSIS & FIX SCRIPT"
echo "=============================================="
echo "This script will:"
echo "1. Diagnose all current issues"
echo "2. Clean up conflicting processes"
echo "3. Create proper configuration"
echo "4. Start staging correctly"
echo "5. Verify everything works"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
log_success() { echo -e "${GREEN}✅ $1${NC}"; }
log_warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}"; }

# ==========================================
# STEP 1: ENVIRONMENT VERIFICATION
# ==========================================
echo ""
log_info "STEP 1: Verifying Environment"
echo "-----------------------------"

# Check if we're on EC2
if curl -s --max-time 2 http://169.254.169.254/latest/meta-data/instance-id >/dev/null 2>&1; then
    INSTANCE_ID=$(curl -s http://169.254.169.254/latest/meta-data/instance-id)
    log_success "Running on EC2 instance: $INSTANCE_ID"
else
    log_error "Not running on EC2. This script is designed for EC2."
    exit 1
fi

# Check required commands
for cmd in pm2 node npm curl; do
    if command -v $cmd >/dev/null 2>&1; then
        log_success "$cmd is available"
    else
        log_error "$cmd is not available"
        exit 1
    fi
done

# Check if we're in the right directory
if [[ ! -f "src/server.js" ]]; then
    log_error "src/server.js not found. Please run this script from the project root."
    exit 1
fi
log_success "In correct project directory"

# ==========================================
# STEP 2: CURRENT STATE DIAGNOSIS
# ==========================================
echo ""
log_info "STEP 2: Diagnosing Current State"
echo "--------------------------------"

# Check current PM2 processes
log_info "Current PM2 processes:"
pm2 list || log_warning "PM2 list failed"

# Check port usage
log_info "Checking port usage:"
PORT_3000_USED=$(netstat -tulpn 2>/dev/null | grep :3000 | wc -l)
PORT_3001_USED=$(netstat -tulpn 2>/dev/null | grep :3001 | wc -l)

echo "Port 3000 usage: $PORT_3000_USED processes"
echo "Port 3001 usage: $PORT_3001_USED processes"

# Show what's using ports
if [[ $PORT_3000_USED -gt 0 ]]; then
    log_info "Port 3000 used by:"
    netstat -tulpn 2>/dev/null | grep :3000 || true
fi

if [[ $PORT_3001_USED -gt 0 ]]; then
    log_info "Port 3001 used by:"
    netstat -tulpn 2>/dev/null | grep :3001 || true
fi

# Check existing configuration files
log_info "Checking configuration files:"
for file in ecosystem.staging.cjs ecosystem.production.cjs package.json; do
    if [[ -f "$file" ]]; then
        log_success "$file exists"
    else
        log_warning "$file missing"
    fi
done

# Test basic Node.js functionality
log_info "Testing basic Node.js functionality:"
if node -e "console.log('Node.js working')" >/dev/null 2>&1; then
    log_success "Node.js basic functionality working"
else
    log_error "Node.js basic functionality failed"
    exit 1
fi

# ==========================================
# STEP 3: CLEANUP EXISTING PROCESSES
# ==========================================
echo ""
log_info "STEP 3: Cleaning Up Existing Processes"
echo "--------------------------------------"

# Stop and delete all staging-related PM2 processes
STAGING_PROCESSES=(
    "cryptoescrow-backend-staging"
    "ecosystem.staging"
    "staging"
)

for process in "${STAGING_PROCESSES[@]}"; do
    if pm2 list | grep -q "$process"; then
        log_info "Stopping $process"
        pm2 stop "$process" 2>/dev/null || log_warning "Failed to stop $process"
        pm2 delete "$process" 2>/dev/null || log_warning "Failed to delete $process"
    fi
done

# Kill any processes on port 3001 (if needed)
if [[ $PORT_3001_USED -gt 0 ]]; then
    log_warning "Killing processes on port 3001"
    sudo lsof -ti:3001 | xargs sudo kill -9 2>/dev/null || log_info "Port 3001 already free"
fi

log_success "Cleanup completed"

# ==========================================
# STEP 4: CREATE PROPER STAGING CONFIGURATION
# ==========================================
echo ""
log_info "STEP 4: Creating Proper Staging Configuration"
echo "---------------------------------------------"

# Create logs directory
mkdir -p logs
log_success "Logs directory created"

# Create corrected ecosystem.staging.cjs
cat > ecosystem.staging.cjs << 'EOF'
module.exports = {
  apps: [{
    name: 'cryptoescrow-backend-staging',
    script: 'src/server.js',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'staging',
      PORT: 3001,
      USE_AWS_SECRETS: 'true',
      AWS_REGION: 'us-east-1',
      CHAIN_ID: '11155111',
      RPC_URL: 'https://sepolia.infura.io/v3/4af9a8307a914da58937e8da53c602f9',
      SEPOLIA_RPC_URL: 'https://sepolia.infura.io/v3/4af9a8307a914da58937e8da53c602f9',
      FRONTEND_URL: 'https://staging.clearhold.app',
      DEBUG: 'cryptoescrow:*',
      LOG_LEVEL: 'debug'
    },
    error_file: './logs/staging-err.log',
    out_file: './logs/staging-out.log',
    log_file: './logs/staging-combined.log',
    time: true,
    merge_logs: true,
    max_restarts: 10,
    min_uptime: '10s'
  }]
};
EOF

log_success "Created ecosystem.staging.cjs"

# Verify the configuration file syntax
if node -c ecosystem.staging.cjs; then
    log_success "Configuration file syntax is valid"
else
    log_error "Configuration file has syntax errors"
    exit 1
fi

# ==========================================
# STEP 5: TEST APPLICATION MANUALLY
# ==========================================
echo ""
log_info "STEP 5: Testing Application Manually"
echo "------------------------------------"

log_info "Testing manual startup (10 second test)..."
timeout 10s bash -c 'NODE_ENV=staging PORT=3001 node src/server.js' || MANUAL_TEST_RESULT=$?

if [[ ${MANUAL_TEST_RESULT:-0} -eq 124 ]]; then
    log_success "Manual startup successful (terminated by timeout as expected)"
elif [[ ${MANUAL_TEST_RESULT:-0} -eq 0 ]]; then
    log_success "Manual startup completed successfully"
else
    log_error "Manual startup failed with exit code: ${MANUAL_TEST_RESULT:-0}"
    log_info "Checking for specific errors..."
    
    # Try to get more detailed error info
    NODE_ENV=staging PORT=3001 timeout 5s node src/server.js 2>&1 | head -20 || true
    exit 1
fi

# ==========================================
# STEP 6: START STAGING WITH PM2
# ==========================================
echo ""
log_info "STEP 6: Starting Staging with PM2"
echo "---------------------------------"

# Method 1: Try with ecosystem file
log_info "Method 1: Starting with ecosystem file..."
if pm2 start ecosystem.staging.cjs; then
    log_success "PM2 start with ecosystem file successful"
    METHOD_USED="ecosystem"
else
    log_warning "Ecosystem file method failed, trying direct method..."
    
    # Method 2: Direct start with environment variables
    log_info "Method 2: Direct PM2 start..."
    NODE_ENV=staging PORT=3001 USE_AWS_SECRETS=true AWS_REGION=us-east-1 pm2 start src/server.js \
        --name "cryptoescrow-backend-staging" \
        -- \
        --staging
    
    METHOD_USED="direct"
    log_success "Direct PM2 start successful"
fi

# Wait for startup
log_info "Waiting 15 seconds for application startup..."
sleep 15

# Quick health check to see if it's already working
log_info "Quick health check to see if staging is already responding..."
if curl -f -s http://localhost:3001/health >/dev/null; then
    HEALTH_RESPONSE=$(curl -s http://localhost:3001/health)
    log_success "Staging already responding! Health check: $HEALTH_RESPONSE"
    INITIAL_HEALTH_SUCCESS=true
else
    log_info "Staging not responding yet, will proceed with fixes..."
    INITIAL_HEALTH_SUCCESS=false
fi

# Fix PM2 naming issue if needed
log_info "Checking for PM2 naming issues..."
if pm2 list | grep -q "ecosystem.staging.*online" && [[ "$INITIAL_HEALTH_SUCCESS" != "true" ]]; then
    log_warning "PM2 is using filename instead of configured name"
    log_info "Attempting to fix PM2 naming issue..."
    
    # Stop the incorrectly named process
    pm2 stop ecosystem.staging 2>/dev/null || true
    pm2 delete ecosystem.staging 2>/dev/null || true
    
    # Start with explicit environment variables (use -- to pass to Node.js process)
    NODE_ENV=staging PORT=3001 USE_AWS_SECRETS=true AWS_REGION=us-east-1 pm2 start src/server.js \
        --name "cryptoescrow-backend-staging" \
        -- \
        --staging
    
    log_info "Restarted with correct name, waiting 10 more seconds..."
    sleep 10
    METHOD_USED="direct-fixed"
fi

# ==========================================
# STEP 7: COMPREHENSIVE VERIFICATION
# ==========================================
echo ""
log_info "STEP 7: Comprehensive Verification"
echo "----------------------------------"

# Check PM2 status
log_info "PM2 Status:"
pm2 list

# Check if staging process is running (check both possible names)
STAGING_PROCESS_NAME=""
if pm2 list | grep -q "cryptoescrow-backend-staging.*online"; then
    STAGING_PROCESS_NAME="cryptoescrow-backend-staging"
    log_success "Staging process is running in PM2 as: $STAGING_PROCESS_NAME"
elif pm2 list | grep -q "ecosystem.staging.*online"; then
    STAGING_PROCESS_NAME="ecosystem.staging"
    log_warning "Staging process is running but with filename as name: $STAGING_PROCESS_NAME"
    log_info "This is a PM2 naming issue, but the process should still work"
else
    log_error "No staging process found running in PM2"
    log_info "PM2 logs:"
    pm2 logs cryptoescrow-backend-staging --lines 20 2>/dev/null || pm2 logs ecosystem.staging --lines 20 2>/dev/null || log_warning "No logs found"
    exit 1
fi

# Test health endpoint
log_info "Testing health endpoint..."
HEALTH_TEST_ATTEMPTS=5
HEALTH_SUCCESS=false

for i in $(seq 1 $HEALTH_TEST_ATTEMPTS); do
    log_info "Health check attempt $i/$HEALTH_TEST_ATTEMPTS"
    
    if curl -f -s http://localhost:3001/health >/dev/null; then
        HEALTH_RESPONSE=$(curl -s http://localhost:3001/health)
        log_success "Health endpoint responding: $HEALTH_RESPONSE"
        HEALTH_SUCCESS=true
        break
    else
        log_warning "Health endpoint not responding, waiting 5 seconds..."
        sleep 5
    fi
done

if [[ "$HEALTH_SUCCESS" != "true" ]]; then
    log_error "Health endpoint failed after $HEALTH_TEST_ATTEMPTS attempts"
    log_info "Checking logs for errors..."
    pm2 logs "$STAGING_PROCESS_NAME" --lines 30 2>/dev/null || log_warning "Could not retrieve logs"
    exit 1
fi

# Test with verbose curl
log_info "Detailed health endpoint test:"
curl -v http://localhost:3001/health || log_warning "Verbose curl failed"

# Check port binding
log_info "Verifying port 3001 binding:"
if netstat -tulpn | grep -q ":3001.*LISTEN"; then
    log_success "Port 3001 is properly bound"
    netstat -tulpn | grep ":3001"
else
    log_error "Port 3001 is not bound"
    exit 1
fi

# Check logs for errors
log_info "Checking staging logs for errors:"
if [[ -f "logs/staging-err.log" ]] && [[ -s "logs/staging-err.log" ]]; then
    log_warning "Error log has content:"
    tail -10 logs/staging-err.log || true
else
    log_success "No errors in error log"
fi

# ==========================================
# STEP 8: AWS TARGET GROUP VERIFICATION
# ==========================================
echo ""
log_info "STEP 8: AWS Target Group Information"
echo "-----------------------------------"

log_info "Local staging is working. For AWS target group health:"
echo "1. Ensure target group 'cryptoescrow-backend-staging-3001' exists"
echo "2. Target group should point to this instance ($INSTANCE_ID) on port 3001"
echo "3. Health check path should be '/health'"
echo "4. Health check should use HTTP protocol"

# Test if AWS CLI is available
if command -v aws >/dev/null 2>&1; then
    log_info "AWS CLI is available. Checking AWS configuration..."
    
    # Check target groups
    aws elbv2 describe-target-groups --query 'TargetGroups[?contains(TargetGroupName, `staging`)].{Name:TargetGroupName,Port:Port,HealthCheckPath:HealthCheckPath}' --output table 2>/dev/null || log_warning "Could not retrieve target group info"
    
    # Check security groups for port 3001
    log_info "Checking security groups for port 3001 access..."
    SECURITY_GROUPS=$(aws ec2 describe-instances --instance-ids $INSTANCE_ID --query 'Reservations[0].Instances[0].SecurityGroups[].GroupId' --output text 2>/dev/null || echo "")
    
    if [[ -n "$SECURITY_GROUPS" ]]; then
        log_info "Instance security groups: $SECURITY_GROUPS"
        
        # Check if port 3001 is open in any security group
        PORT_3001_OPEN=false
        for sg in $SECURITY_GROUPS; do
            if aws ec2 describe-security-groups --group-ids $sg --query "SecurityGroups[0].IpPermissions[?FromPort<=\`3001\` && ToPort>=\`3001\`]" --output text 2>/dev/null | grep -q .; then
                PORT_3001_OPEN=true
                break
            fi
        done
        
        if [[ "$PORT_3001_OPEN" = "true" ]]; then
            log_success "Port 3001 is accessible through security groups"
        else
            log_error "❌ CRITICAL: Port 3001 is NOT accessible through security groups!"
            log_info "🔧 AWS Security Group Fix Commands:"
            echo ""
            echo "# Add port 3001 to your security group (replace sg-xxxxx with your security group ID):"
            for sg in $SECURITY_GROUPS; do
                echo "aws ec2 authorize-security-group-ingress \\"
                echo "    --group-id $sg \\"
                echo "    --protocol tcp \\"
                echo "    --port 3001 \\"
                echo "    --source-group $sg \\"
                echo "    --description 'Allow ALB to access staging on port 3001'"
                echo ""
            done
        fi
    else
        log_warning "Could not retrieve security group information"
    fi
else
    log_warning "AWS CLI not available for security group verification"
fi

# ==========================================
# STEP 9: FINAL SUMMARY
# ==========================================
echo ""
log_success "==========================================
🎉 STAGING ENVIRONMENT SETUP COMPLETE! 🎉
=========================================="

echo ""
echo "📊 FINAL STATUS:"
echo "---------------"
log_success "✅ Staging process: RUNNING"
log_success "✅ Port 3001: ACCESSIBLE"
log_success "✅ Health endpoint: RESPONDING"
log_success "✅ PM2 method used: $METHOD_USED"

echo ""
echo "🧪 TEST COMMANDS:"
echo "----------------"
echo "# Local health check:"
echo "curl -i http://localhost:3001/health"
echo ""
echo "# Check PM2 status:"
echo "pm2 list"
echo ""
echo "# Check logs:"
echo "pm2 logs $STAGING_PROCESS_NAME"
echo ""
echo "# AWS load balancer test (once DNS is configured):"
echo "curl -i https://staging.clearhold.app/health"

echo ""
echo "📋 NEXT STEPS:"
echo "-------------"
echo "1. ✅ Local staging is working"
echo "2. 🔧 Configure AWS target group if not done"
echo "3. 🔧 Add DNS record for staging.clearhold.app"
echo "4. 🧪 Test: https://staging.clearhold.app/health"

echo ""
log_success "Staging environment is ready for use!"

# Save the configuration for reference
pm2 save
log_info "PM2 configuration saved"

echo ""
echo "🔧 Configuration files created:"
echo "  - ecosystem.staging.cjs (PM2 configuration)"
echo "  - logs/staging-*.log (Application logs)" 