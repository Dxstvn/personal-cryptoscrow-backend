#!/bin/bash

# 🔄 PRODUCTION RESTART SCRIPT
# Restarts production PM2 process to pick up updated AWS Secrets Manager configuration

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

echo -e "${BOLD}🔄 PRODUCTION RESTART${NC}"
echo "========================="

log_info "This script will restart the production PM2 process to pick up updated AWS Secrets Manager configuration"
echo ""

# Check current PM2 status
log_info "Current PM2 status:"
pm2 status

echo ""
log_info "Restarting production process..."

# Restart production process
pm2 restart cryptoescrow-backend 2>/dev/null || {
    log_warning "Standard restart failed, trying alternative method..."
    pm2 delete cryptoescrow-backend 2>/dev/null || true
    pm2 start ecosystem.config.cjs --env production
}

log_success "Production process restarted"

# Wait for process to initialize
log_info "Waiting 15 seconds for process to initialize..."
sleep 15

# Test local health endpoint
log_info "Testing local health endpoint..."
if curl -s http://localhost:3000/health | grep -q "OK"; then
    log_success "Local health endpoint is responding correctly!"
else
    log_error "Local health endpoint is still failing"
    log_info "Checking PM2 logs for errors..."
    pm2 logs cryptoescrow-backend --lines 20
    exit 1
fi

# Test external health endpoint
log_info "Testing external health endpoint..."
echo "Waiting 30 seconds for AWS health checks to update..."
sleep 30

if curl -s https://api.clearhold.app/health | grep -q "OK"; then
    log_success "External health endpoint is responding correctly!"
    echo ""
    curl https://api.clearhold.app/health | jq . 2>/dev/null || curl https://api.clearhold.app/health
else
    log_warning "External health endpoint may still be updating..."
    log_info "Current response:"
    curl https://api.clearhold.app/health 2>/dev/null | head -200
    echo ""
    log_info "AWS Target Group health checks can take 1-2 minutes to update"
fi

echo ""
echo -e "${BOLD}🎉 PRODUCTION RESTART COMPLETE!${NC}"
echo "==================================="

log_info "Final PM2 status:"
pm2 status

echo ""
log_success "Production restart completed!"
log_info "Monitor external endpoint: https://api.clearhold.app/health" 