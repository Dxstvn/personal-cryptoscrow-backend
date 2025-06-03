#!/bin/bash

# Fix Git Conflicts and Pull New Scripts
# This script resolves git conflicts and pulls the latest certbot fix scripts

echo "🔧 Fixing Git Conflicts and Pulling New Scripts"
echo "================================================"

# Function to log with timestamp
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

log "Checking git status..."

# Check current status
git status

echo ""
log "🔍 Analyzing conflicts..."

# Check for merge conflicts
if git status | grep -q "Unmerged paths"; then
    log "⚠️ Found unmerged files. Resolving conflicts..."
    
    # Show conflicted files
    echo "Conflicted files:"
    git status --porcelain | grep "^UU\|^AA\|^DD" || echo "No standard conflicts found"
    
    # Option 1: Reset to match remote (safest for getting new scripts)
    log "🔄 Backing up current changes and resetting to remote..."
    
    # Create backup of current state
    BACKUP_DIR="backup_$(date +%Y%m%d_%H%M%S)"
    mkdir -p "$BACKUP_DIR"
    
    # Copy any modified files to backup
    git status --porcelain | while read status file; do
        if [[ "$status" =~ ^(M|U|A) ]]; then
            if [ -f "$file" ]; then
                mkdir -p "$BACKUP_DIR/$(dirname "$file")" 2>/dev/null
                cp "$file" "$BACKUP_DIR/$file" 2>/dev/null || true
                log "📋 Backed up: $file"
            fi
        fi
    done
    
    # Reset to clean state
    git reset --hard HEAD
    git clean -fd
    
    log "✅ Repository reset to clean state"
    
elif git status | grep -q "You have unmerged paths"; then
    log "⚠️ Found unmerged paths, attempting to resolve..."
    
    # Add all files to mark conflicts as resolved
    git add .
    git commit -m "Resolve merge conflicts by accepting all changes"
    
else
    log "ℹ️ No active merge conflicts found"
fi

log "🔄 Attempting to pull latest changes..."

# Pull latest changes
if git pull origin main; then
    log "✅ Successfully pulled latest changes!"
else
    log "❌ Pull failed. Trying alternative approach..."
    
    # Alternative: fetch and reset
    log "🔄 Fetching latest and resetting..."
    git fetch origin main
    git reset --hard origin/main
    
    if [ $? -eq 0 ]; then
        log "✅ Successfully reset to latest remote state!"
    else
        log "❌ Failed to sync with remote. Manual intervention may be needed."
        exit 1
    fi
fi

log "🔍 Checking for new scripts..."

# Check if the new scripts are present
if [ -f "diagnose-certbot.sh" ] && [ -f "fix-certbot-final.sh" ]; then
    log "✅ New certbot scripts found!"
    
    # Make scripts executable
    chmod +x diagnose-certbot.sh fix-certbot-final.sh
    log "🔧 Made scripts executable"
    
    # List available scripts
    echo ""
    log "📋 Available SSL/Certbot scripts:"
    ls -la *.sh | grep -E "(certbot|ssl|domain)" | head -10
    
else
    log "⚠️ New scripts not found. Checking available scripts..."
    ls -la *.sh | head -10
fi

echo ""
log "🎯 Next Steps:"
log "=============="

if [ -f "diagnose-certbot.sh" ] && [ -f "fix-certbot-final.sh" ]; then
    log "1. Run diagnostic: ./diagnose-certbot.sh"
    log "2. Run fix script: ./fix-certbot-final.sh"
else
    log "❌ Scripts not found. You may need to:"
    log "1. Check if you're in the correct directory"
    log "2. Verify the scripts were pushed to the remote repository"
    log "3. Try running: git log --oneline -5 (to see recent commits)"
fi

if [ -d "$BACKUP_DIR" ]; then
    log "📋 Your previous files were backed up to: $BACKUP_DIR"
fi

log "🏁 Git conflict resolution completed!" 