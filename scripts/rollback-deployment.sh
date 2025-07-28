#!/bin/bash
# Rollback script for ClearHold Backend
# Quick rollback to previous deployment version

set -e

# Configuration
APP_DIR="/opt/clearhold"
BACKUP_DIR="/opt/clearhold/backup"
PM2_APP_NAME="clearhold-backend"
ENVIRONMENT=${1:-staging}

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

log "Starting rollback procedure for $ENVIRONMENT environment"

# Check if running on EC2 or locally
if [ -d "$APP_DIR" ]; then
    log "Running on EC2 instance"
else
    error "This script should be run on the EC2 instance"
    exit 1
fi

# Find latest backup
LATEST_BACKUP=$(ls -t $BACKUP_DIR | head -n 1)
if [ -z "$LATEST_BACKUP" ]; then
    error "No backup found to rollback to!"
    exit 1
fi

log "Found backup: $LATEST_BACKUP"

# Confirm rollback
if [ -t 0 ]; then
    read -p "Are you sure you want to rollback to $LATEST_BACKUP? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log "Rollback cancelled"
        exit 0
    fi
fi

# Stop current application
log "Stopping current application..."
pm2 stop $PM2_APP_NAME || true

# Backup current (failed) deployment
log "Backing up current deployment..."
if [ -d "$APP_DIR/current" ]; then
    sudo mv $APP_DIR/current $APP_DIR/failed_$(date +%Y%m%d_%H%M%S)
fi

# Restore from backup
log "Restoring from backup..."
sudo cp -r $BACKUP_DIR/$LATEST_BACKUP $APP_DIR/current

# Start application
log "Starting application..."
cd $APP_DIR/current
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
            error "Health check failed after rollback!"
            exit 1
        fi
        log "Health check attempt $i failed, retrying..."
        sleep 3
    fi
done

# Check API endpoints
log "Verifying API endpoints..."
curl -s http://localhost:3000/health | jq '.' || warning "Failed to parse health response"

# Summary
echo ""
echo "========================================="
echo "Rollback Summary:"
echo "Environment: $ENVIRONMENT"
echo "Rolled back to: $LATEST_BACKUP"
echo "Status: SUCCESS"
echo "========================================="

log "Rollback completed successfully!"

# Optional: Clean up old failed deployments
FAILED_COUNT=$(ls -1 $APP_DIR/failed_* 2>/dev/null | wc -l)
if [ $FAILED_COUNT -gt 3 ]; then
    warning "Found $FAILED_COUNT failed deployments. Consider cleaning up old ones."
fi