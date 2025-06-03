#!/bin/bash

# OpenSSL Upgrade Path Assessment Script
# Determines the best approach to upgrade to modern OpenSSL

echo "🔍 OpenSSL Upgrade Path Assessment"
echo "=================================="
echo ""

# Function to log with timestamp
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

# Function to check command success
check_cmd() {
    if command -v "$1" >/dev/null 2>&1; then
        echo "✅ $1 available"
        return 0
    else
        echo "❌ $1 not available"
        return 1
    fi
}

# System Information
log "📋 Current System Analysis"
echo "=========================="
echo "OS: $(cat /etc/os-release | grep PRETTY_NAME | cut -d'"' -f2)"
echo "Kernel: $(uname -r)"
echo "Architecture: $(uname -m)"
echo "Current OpenSSL: $(openssl version)"
echo "Python: $(python3 --version 2>/dev/null || echo 'Not found')"
echo "Node.js: $(node --version 2>/dev/null || echo 'Not found')"
echo ""

# Check Current OpenSSL Details
log "🔒 OpenSSL Analysis"
echo "=================="
OPENSSL_VERSION=$(openssl version | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')
echo "Version: $OPENSSL_VERSION"
echo "Build: $(openssl version -a | grep 'built on' || echo 'Unknown')"
echo "Location: $(which openssl)"
echo "Library path: $(openssl version -d 2>/dev/null || echo 'Unknown')"

# Check if OpenSSL is too old
if printf '%s\n%s\n' "1.1.1" "$OPENSSL_VERSION" | sort -V | head -n1 | grep -q "1.1.1"; then
    echo "✅ OpenSSL version is modern enough"
    OPENSSL_MODERN=true
else
    echo "❌ OpenSSL version is too old (need 1.1.1+)"
    OPENSSL_MODERN=false
fi
echo ""

# Check Amazon Linux Version
log "🏷️ Amazon Linux Version Analysis"
echo "=============================="
if grep -q "Amazon Linux 2023" /etc/os-release; then
    echo "✅ Already running Amazon Linux 2023"
    AL_VERSION="2023"
elif grep -q "Amazon Linux 2" /etc/os-release; then
    echo "📋 Running Amazon Linux 2"
    AL_VERSION="2"
    
    # Check for available updates
    echo "Checking for available Amazon Linux Extras..."
    if command -v amazon-linux-extras >/dev/null 2>&1; then
        echo "Available extras:"
        amazon-linux-extras list | grep -E "(openssl|ssl)" || echo "No SSL-related extras found"
    fi
else
    echo "⚠️ Unknown Amazon Linux version"
    AL_VERSION="unknown"
fi
echo ""

# Check Available Package Versions
log "📦 Package Repository Analysis"
echo "============================="
echo "Checking available OpenSSL versions..."

if [ "$AL_VERSION" = "2" ]; then
    # Check what's available in repos
    AVAILABLE_OPENSSL=$(yum info openssl 2>/dev/null | grep Version | head -1 | awk '{print $3}' || echo "Unknown")
    echo "YUM OpenSSL available: $AVAILABLE_OPENSSL"
    
    # Check for newer versions in other repos
    if yum list available | grep -q openssl11; then
        echo "✅ OpenSSL 1.1 packages available"
        OPENSSL11_AVAILABLE=true
    else
        echo "❌ OpenSSL 1.1 packages not found"
        OPENSSL11_AVAILABLE=false
    fi
fi
echo ""

# Check Node.js App Compatibility
log "🚀 Application Compatibility Check"
echo "=================================="
if pgrep -f "node" > /dev/null; then
    echo "✅ Node.js application is running"
    NODE_VERSION=$(node --version 2>/dev/null)
    echo "Node.js version: $NODE_VERSION"
    
    # Check if app is responding
    if curl -s http://localhost:3000 >/dev/null 2>&1; then
        echo "✅ Application responding on port 3000"
        APP_WORKING=true
    else
        echo "⚠️ Application not responding (may be normal)"
        APP_WORKING=false
    fi
else
    echo "⚠️ Node.js application not running"
    APP_WORKING=false
fi
echo ""

# Check System Resources
log "💾 System Resources"
echo "=================="
echo "Memory: $(free -h | grep Mem | awk '{print $2}') total, $(free -h | grep Mem | awk '{print $7}') available"
echo "Disk: $(df -h / | tail -1 | awk '{print $4}') free space"
echo "Load: $(uptime | awk -F'load average:' '{print $2}')"
echo ""

# Check for Existing SSL Certificates
log "🔒 Existing SSL Configuration"
echo "============================="
if [ -d "/etc/letsencrypt" ]; then
    echo "✅ Let's Encrypt directory exists"
    if [ -d "/etc/letsencrypt/live/clearhold.app" ]; then
        echo "✅ Existing certificates for clearhold.app found"
        EXISTING_CERTS=true
    else
        echo "📋 No certificates for clearhold.app"
        EXISTING_CERTS=false
    fi
else
    echo "📋 No existing Let's Encrypt configuration"
    EXISTING_CERTS=false
fi
echo ""

# Assessment and Recommendations
log "🎯 UPGRADE PATH RECOMMENDATIONS"
echo "==============================="

SCORE=0
COMPLEXITY=0

# Option 1: In-place OpenSSL Update
echo "Option 1: In-place Amazon Linux 2 OpenSSL Upgrade"
echo "------------------------------------------------"
if [ "$AL_VERSION" = "2" ]; then
    if [ "$OPENSSL11_AVAILABLE" = true ]; then
        echo "✅ Feasible - OpenSSL 1.1 packages available"
        echo "✅ Low downtime (~30 minutes)"
        echo "✅ Preserves existing configuration"
        ((SCORE += 3))
        COMPLEXITY=2
    else
        echo "⚠️ Limited - May require manual compilation"
        echo "⚠️ Higher risk of dependency conflicts"
        ((SCORE += 1))
        COMPLEXITY=4
    fi
    echo "Risk Level: Medium"
    echo "Estimated Time: 1-2 hours"
    OPTION1_VIABLE=true
else
    echo "❌ Not applicable (not Amazon Linux 2)"
    OPTION1_VIABLE=false
fi
echo ""

# Option 2: Amazon Linux 2023 Migration
echo "Option 2: Amazon Linux 2023 Migration"
echo "------------------------------------"
echo "✅ Modern OpenSSL 3.0+ guaranteed"
echo "✅ Future-proof and long-term supported"
echo "✅ Clean, modern system"
if [ "$APP_WORKING" = true ]; then
    echo "✅ Application compatibility likely good"
    ((SCORE += 4))
else
    echo "⚠️ Application compatibility needs testing"
    ((SCORE += 2))
fi
echo "⚠️ Requires new EC2 instance and migration"
echo "Risk Level: Low-Medium"
echo "Estimated Time: 2-3 hours"
OPTION2_VIABLE=true
echo ""

# Final Recommendation
echo "🏆 FINAL RECOMMENDATION"
echo "======================"

if [ $SCORE -ge 3 ] && [ "$OPTION1_VIABLE" = true ] && [ $COMPLEXITY -le 3 ]; then
    echo "🎯 RECOMMENDED: In-place OpenSSL Upgrade (Option 1)"
    echo ""
    echo "Reasons:"
    echo "✅ Lower complexity and risk"
    echo "✅ Faster implementation"
    echo "✅ Preserves existing setup"
    echo "✅ Modern OpenSSL packages available"
    echo ""
    echo "Next steps:"
    echo "1. Run: ./upgrade-openssl-al2.sh"
    echo "2. Then: ./modern-ssl-setup.sh"
    echo "3. Finally: ./validate-modern-ssl.sh"
    
elif [ "$OPTION2_VIABLE" = true ]; then
    echo "🎯 RECOMMENDED: Amazon Linux 2023 Migration (Option 2)"
    echo ""
    echo "Reasons:"
    echo "✅ Most future-proof solution"
    echo "✅ Guaranteed modern OpenSSL"
    echo "✅ Clean, updated system"
    echo "✅ Long-term support"
    echo ""
    echo "Next steps:"
    echo "1. Create EC2 snapshot/backup"
    echo "2. Run: ./migrate-to-al2023.sh"
    echo "3. Update DNS to new instance"
    echo "4. Validate with: ./validate-modern-ssl.sh"
    
else
    echo "⚠️ MANUAL ASSESSMENT NEEDED"
    echo ""
    echo "Your system may require custom solutions."
    echo "Consider consulting AWS documentation or support."
fi

echo ""
echo "💾 Backup Recommendations:"
echo "========================="
echo "Before proceeding with any upgrade:"
echo "1. Create EC2 snapshot/AMI"
echo "2. Backup application data"
echo "3. Document current configuration"
echo "4. Test rollback procedures"

echo ""
log "🏁 Assessment completed!"
echo ""
echo "📖 For detailed plans, see: MODERN_OPENSSL_UPGRADE.md" 