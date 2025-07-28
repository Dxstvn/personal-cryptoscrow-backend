#!/bin/bash
# Deployment script for ClearHold Backend to AWS EC2
# This script is called by GitHub Actions but can also be run manually

set -e

# Configuration
ENVIRONMENT=${1:-staging}
EC2_HOST=${2:-}
DEPLOY_KEY=${3:-}
APP_DIR="/opt/clearhold"
BACKUP_DIR="/opt/clearhold/backup"
PM2_APP_NAME="clearhold-backend"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Validate inputs
if [ -z "$EC2_HOST" ]; then
    error "EC2 host not provided"
    exit 1
fi

if [ "$ENVIRONMENT" != "staging" ] && [ "$ENVIRONMENT" != "production" ]; then
    error "Invalid environment: $ENVIRONMENT"
    exit 1
fi

log "Starting deployment to $ENVIRONMENT environment"

# Create deployment package
log "Creating deployment package..."
tar -czf deploy-package.tar.gz \
    --exclude=node_modules \
    --exclude=.git \
    --exclude=coverage \
    --exclude=test-results \
    --exclude='*.test.js' \
    --exclude=__tests__ \
    --exclude=.env \
    --exclude=.env.* \
    .

# Transfer to EC2
log "Transferring package to EC2..."
if [ -n "$DEPLOY_KEY" ]; then
    # Use deploy key if provided (GitHub Actions)
    echo "$DEPLOY_KEY" > deploy_key.pem
    chmod 600 deploy_key.pem
    scp -i deploy_key.pem -o StrictHostKeyChecking=no deploy-package.tar.gz ec2-user@$EC2_HOST:/tmp/
    SSH_CMD="ssh -i deploy_key.pem -o StrictHostKeyChecking=no ec2-user@$EC2_HOST"
else
    # Use default SSH key (manual deployment)
    scp deploy-package.tar.gz ec2-user@$EC2_HOST:/tmp/
    SSH_CMD="ssh ec2-user@$EC2_HOST"
fi

# Deploy on EC2
log "Deploying on EC2 instance..."
$SSH_CMD << 'ENDSSH'
set -e

# Function definitions on remote
log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1"
}

# Create backup
log "Creating backup of current deployment..."
sudo mkdir -p /opt/clearhold/backup
if [ -d /opt/clearhold/current ]; then
    sudo cp -r /opt/clearhold/current /opt/clearhold/backup/$(date +%Y%m%d_%H%M%S)
    # Keep only last 5 backups
    ls -t /opt/clearhold/backup | tail -n +6 | xargs -I {} sudo rm -rf /opt/clearhold/backup/{}
fi

# Extract new deployment
log "Extracting new deployment..."
sudo mkdir -p /opt/clearhold/new
sudo tar -xzf /tmp/deploy-package.tar.gz -C /opt/clearhold/new
sudo rm /tmp/deploy-package.tar.gz

# Install dependencies
log "Installing dependencies..."
cd /opt/clearhold/new
sudo npm ci --production

# Copy environment files
log "Setting up environment..."
if [ -f /opt/clearhold/env/.env.$ENVIRONMENT ]; then
    sudo cp /opt/clearhold/env/.env.$ENVIRONMENT /opt/clearhold/new/.env
else
    log "Warning: Environment file not found, using defaults"
fi

# Stop current application
log "Stopping current application..."
pm2 stop $PM2_APP_NAME || true

# Switch to new deployment
log "Switching to new deployment..."
sudo rm -rf /opt/clearhold/previous
if [ -d /opt/clearhold/current ]; then
    sudo mv /opt/clearhold/current /opt/clearhold/previous
fi
sudo mv /opt/clearhold/new /opt/clearhold/current

# Start application
log "Starting application..."
cd /opt/clearhold/current
pm2 start ecosystem.config.js --env $ENVIRONMENT
pm2 save

# Health check
log "Running health check..."
sleep 5
for i in {1..10}; do
    if curl -f http://localhost:3000/health > /dev/null 2>&1; then
        log "Health check passed!"
        break
    else
        if [ $i -eq 10 ]; then
            log "Health check failed after 10 attempts!"
            # Rollback
            log "Rolling back deployment..."
            pm2 stop $PM2_APP_NAME
            sudo rm -rf /opt/clearhold/current
            sudo mv /opt/clearhold/previous /opt/clearhold/current
            cd /opt/clearhold/current
            pm2 start ecosystem.config.js --env $ENVIRONMENT
            exit 1
        fi
        log "Health check attempt $i failed, retrying..."
        sleep 3
    fi
done

# Cleanup
log "Cleaning up..."
sudo rm -rf /opt/clearhold/previous

log "Deployment completed successfully!"
ENDSSH

# Cleanup local files
rm -f deploy-package.tar.gz
[ -f deploy_key.pem ] && rm -f deploy_key.pem

log "Deployment to $ENVIRONMENT completed successfully!"

# Run post-deployment checks
log "Running post-deployment validation..."
sleep 10

# Check if API is responding
API_URL="https://$ENVIRONMENT.clearhold.com/health"
if [ "$ENVIRONMENT" = "production" ]; then
    API_URL="https://api.clearhold.com/health"
fi

HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL" || echo "000")
if [ "$HTTP_CODE" = "200" ]; then
    log "API health check passed! ($API_URL)"
else
    warning "API health check returned $HTTP_CODE"
fi

echo ""
echo "========================================="
echo "Deployment Summary:"
echo "Environment: $ENVIRONMENT"
echo "Host: $EC2_HOST"
echo "Status: SUCCESS"
echo "API URL: $API_URL"
echo "========================================="

# Send deployment notification (would integrate with Slack/Discord in production)
log "Deployment notification sent"