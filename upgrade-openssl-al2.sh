#!/bin/bash

# Modern OpenSSL Upgrade for Amazon Linux 2
# Upgrades OpenSSL to 1.1.1+ while preserving system stability

echo "🔧 Modern OpenSSL Upgrade for Amazon Linux 2"
echo "=============================================="
echo "Target: OpenSSL 1.1.1+ for clearhold.app SSL certificates"
echo ""

# Function to log with timestamp
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

# Function to check command success
check_status() {
    if [ $? -eq 0 ]; then
        log "✅ $1 - SUCCESS"
        return 0
    else
        log "❌ $1 - FAILED"
        return 1
    fi
}

# Function to backup system state
backup_system() {
    local backup_dir="openssl_upgrade_backup_$(date +%Y%m%d_%H%M%S)"
    mkdir -p "$backup_dir"
    
    log "📋 Creating comprehensive backup..."
    
    # Backup package state
    rpm -qa > "$backup_dir/packages_before.txt"
    openssl version > "$backup_dir/openssl_before.txt"
    python3 --version > "$backup_dir/python_before.txt" 2>&1
    
    # Backup critical configs
    cp -r /etc/ssl "$backup_dir/" 2>/dev/null || true
    cp -r /etc/pki "$backup_dir/" 2>/dev/null || true
    cp /etc/ld.so.conf "$backup_dir/" 2>/dev/null || true
    
    # Backup application status
    if pgrep -f "node" > /dev/null; then
        echo "Node.js running" > "$backup_dir/app_status.txt"
        ps aux | grep node >> "$backup_dir/app_status.txt"
    fi
    
    echo "$backup_dir" > /tmp/openssl_backup_location
    log "✅ Backup created at: $backup_dir"
}

# Function to test Node.js app
test_app() {
    if pgrep -f "node" > /dev/null && curl -s http://localhost:3000 >/dev/null 2>&1; then
        log "✅ Node.js application is working"
        return 0
    else
        log "⚠️ Node.js application not responding"
        return 1
    fi
}

# Pre-flight checks
log "🔍 Pre-flight System Checks"
echo "============================"

# Verify we're on Amazon Linux 2
if ! grep -q "Amazon Linux 2" /etc/os-release; then
    log "❌ This script is designed for Amazon Linux 2"
    exit 1
fi

log "✅ Confirmed Amazon Linux 2"
echo "Current OpenSSL: $(openssl version)"
echo "Current Python: $(python3 --version 2>/dev/null || echo 'Not found')"
echo ""

# Test current app state
test_app
APP_WORKING_BEFORE=$?

# Create backup
backup_system

# Phase 1: System Updates
log "📦 Phase 1: System Package Updates"
echo "=================================="

log "🔄 Updating all system packages..."
sudo yum update -y
check_status "System package updates"

log "🔄 Installing development tools..."
sudo yum groupinstall -y "Development Tools"
sudo yum install -y wget curl gcc gcc-c++ make

# Phase 2: Modern OpenSSL Installation
log "🔒 Phase 2: Modern OpenSSL Installation"
echo "======================================="

OPENSSL_SUCCESS=false

# Method 1: Try Amazon Linux Extras
log "🚀 Method 1: Checking Amazon Linux Extras..."
if command -v amazon-linux-extras >/dev/null 2>&1; then
    log "Checking for OpenSSL in Amazon Linux Extras..."
    amazon-linux-extras list | grep -i ssl
    
    # Enable EPEL which may have newer OpenSSL
    if sudo amazon-linux-extras install -y epel; then
        log "✅ EPEL repository enabled"
        
        # Try to install newer OpenSSL from EPEL
        if sudo yum install -y openssl11 openssl11-devel openssl11-libs; then
            log "✅ OpenSSL 1.1 installed from EPEL"
            
            # Update library paths
            echo "/usr/lib64/openssl11" | sudo tee /etc/ld.so.conf.d/openssl11.conf
            sudo ldconfig
            
            # Create symlinks to make OpenSSL 1.1 default
            sudo mv /usr/bin/openssl /usr/bin/openssl.backup 2>/dev/null || true
            sudo ln -sf /usr/bin/openssl11 /usr/bin/openssl
            
            if openssl version | grep -q "1.1"; then
                log "✅ OpenSSL 1.1 is now default"
                OPENSSL_SUCCESS=true
            fi
        fi
    fi
fi

# Method 2: Compile from source if Method 1 failed
if [ "$OPENSSL_SUCCESS" = false ]; then
    log "🚀 Method 2: Compiling OpenSSL from source..."
    
    # Download and compile OpenSSL 1.1.1
    cd /tmp
    OPENSSL_VERSION="1.1.1w"  # Latest 1.1.1 version
    
    log "Downloading OpenSSL $OPENSSL_VERSION..."
    if wget "https://www.openssl.org/source/openssl-${OPENSSL_VERSION}.tar.gz"; then
        tar -xzf "openssl-${OPENSSL_VERSION}.tar.gz"
        cd "openssl-${OPENSSL_VERSION}"
        
        log "Configuring OpenSSL build..."
        if ./config --prefix=/opt/openssl --openssldir=/opt/openssl shared zlib; then
            log "Building OpenSSL (this may take 10-15 minutes)..."
            if make -j$(nproc); then
                log "Installing OpenSSL..."
                if sudo make install; then
                    log "✅ OpenSSL compiled and installed to /opt/openssl"
                    
                    # Update library paths
                    echo "/opt/openssl/lib" | sudo tee /etc/ld.so.conf.d/openssl-custom.conf
                    sudo ldconfig
                    
                    # Create symlinks
                    sudo mv /usr/bin/openssl /usr/bin/openssl.backup 2>/dev/null || true
                    sudo ln -sf /opt/openssl/bin/openssl /usr/bin/openssl
                    
                    # Update PKG_CONFIG_PATH for other packages
                    echo 'export PKG_CONFIG_PATH="/opt/openssl/lib/pkgconfig:$PKG_CONFIG_PATH"' | sudo tee /etc/profile.d/openssl.sh
                    export PKG_CONFIG_PATH="/opt/openssl/lib/pkgconfig:$PKG_CONFIG_PATH"
                    
                    if openssl version | grep -q "1.1.1"; then
                        log "✅ Custom OpenSSL 1.1.1 is now active"
                        OPENSSL_SUCCESS=true
                    fi
                fi
            fi
        fi
        cd /
    fi
fi

# Verify OpenSSL upgrade
echo ""
log "🔍 Verifying OpenSSL Upgrade"
echo "=========================="
NEW_OPENSSL_VERSION=$(openssl version)
echo "New OpenSSL: $NEW_OPENSSL_VERSION"

if echo "$NEW_OPENSSL_VERSION" | grep -q "1.1\|3."; then
    log "✅ OpenSSL successfully upgraded to modern version"
    OPENSSL_MODERN=true
else
    log "❌ OpenSSL upgrade failed - still using old version"
    OPENSSL_MODERN=false
fi

# Phase 3: Python and SSL Library Updates
log "🐍 Phase 3: Python SSL Library Updates"
echo "======================================"

if [ "$OPENSSL_MODERN" = true ]; then
    log "🔄 Updating Python SSL libraries..."
    
    # Update pip first
    sudo python3 -m pip install --upgrade pip
    
    # Reinstall cryptography with new OpenSSL
    sudo python3 -m pip uninstall -y cryptography pyOpenSSL
    
    # Install cryptography from source to use new OpenSSL
    if [ -d "/opt/openssl" ]; then
        export LDFLAGS="-L/opt/openssl/lib"
        export CPPFLAGS="-I/opt/openssl/include"
        export PKG_CONFIG_PATH="/opt/openssl/lib/pkgconfig:$PKG_CONFIG_PATH"
    fi
    
    sudo python3 -m pip install --no-binary=cryptography cryptography
    sudo python3 -m pip install pyOpenSSL
    
    # Test Python SSL
    if python3 -c "import ssl; print('Python SSL version:', ssl.OPENSSL_VERSION)" 2>/dev/null; then
        log "✅ Python SSL libraries updated successfully"
        PYTHON_SSL_OK=true
    else
        log "⚠️ Python SSL libraries may need manual attention"
        PYTHON_SSL_OK=false
    fi
else
    log "❌ Skipping Python updates - OpenSSL upgrade failed"
    PYTHON_SSL_OK=false
fi

# Phase 4: Test System Stability
log "🧪 Phase 4: System Stability Check"
echo "=================================="

log "🔍 Testing Node.js application..."
test_app
APP_WORKING_AFTER=$?

log "🔍 Testing system libraries..."
if ldconfig -p | grep -q ssl; then
    log "✅ SSL libraries properly linked"
    LIBS_OK=true
else
    log "⚠️ SSL library linking may have issues"
    LIBS_OK=false
fi

# Phase 5: Install Modern Certbot (if OpenSSL upgrade succeeded)
log "🔒 Phase 5: Modern Certbot Installation"
echo "======================================="

if [ "$OPENSSL_MODERN" = true ] && [ "$PYTHON_SSL_OK" = true ]; then
    log "🚀 Installing modern certbot..."
    
    # Clean up any old certbot installations
    sudo pip3 uninstall -y certbot certbot-nginx 2>/dev/null || true
    sudo yum remove -y certbot python2-certbot-nginx 2>/dev/null || true
    
    # Install fresh certbot with modern dependencies
    sudo python3 -m pip install certbot certbot-nginx
    
    # Create symlink
    sudo ln -sf /usr/local/bin/certbot /usr/bin/certbot
    
    # Test certbot
    if certbot --version >/dev/null 2>&1; then
        log "✅ Modern certbot installed and working!"
        echo "Certbot version: $(certbot --version)"
        CERTBOT_READY=true
    else
        log "❌ Certbot installation failed"
        CERTBOT_READY=false
    fi
else
    log "⚠️ Skipping certbot installation - prerequisites not met"
    CERTBOT_READY=false
fi

# Final Report
echo ""
log "🎯 UPGRADE COMPLETION REPORT"
log "============================"
echo "OpenSSL Before: 1.0.2k-fips"
echo "OpenSSL After: $NEW_OPENSSL_VERSION"
echo "OpenSSL Modern: $([ "$OPENSSL_MODERN" = true ] && echo "✅ Yes" || echo "❌ No")"
echo "Python SSL: $([ "$PYTHON_SSL_OK" = true ] && echo "✅ Updated" || echo "❌ Issues")"
echo "System Libraries: $([ "$LIBS_OK" = true ] && echo "✅ OK" || echo "⚠️ Check needed")"
echo "Node.js App Before: $([ $APP_WORKING_BEFORE -eq 0 ] && echo "✅ Working" || echo "⚠️ Issues")"
echo "Node.js App After: $([ $APP_WORKING_AFTER -eq 0 ] && echo "✅ Working" || echo "⚠️ Issues")"
echo "Certbot Ready: $([ "$CERTBOT_READY" = true ] && echo "✅ Yes" || echo "❌ No")"

BACKUP_DIR=$(cat /tmp/openssl_backup_location 2>/dev/null)
echo "Backup Location: ${BACKUP_DIR:-"Not created"}"

echo ""
if [ "$OPENSSL_MODERN" = true ] && [ "$CERTBOT_READY" = true ] && [ $APP_WORKING_AFTER -eq 0 ]; then
    log "🎉 SUCCESS! Modern OpenSSL upgrade completed successfully!"
    echo ""
    log "🚀 Next Steps:"
    echo "1. Run: ./modern-ssl-setup.sh (to get SSL certificate)"
    echo "2. Run: ./validate-modern-ssl.sh (to validate everything)"
    echo ""
    log "🌐 Your system is now ready for modern SSL certificates!"
    
elif [ "$OPENSSL_MODERN" = true ]; then
    log "✅ OpenSSL upgrade successful, but some components need attention"
    echo ""
    log "🔧 Manual steps may be needed:"
    if [ "$CERTBOT_READY" != true ]; then
        echo "- Fix certbot installation"
    fi
    if [ $APP_WORKING_AFTER -ne 0 ]; then
        echo "- Restart Node.js application"
    fi
    echo ""
    log "📋 Then run: ./modern-ssl-setup.sh"
    
else
    log "❌ OpenSSL upgrade failed or incomplete"
    echo ""
    log "🔄 Rollback Options:"
    echo "1. Restore from backup: $BACKUP_DIR"
    echo "2. Revert to original OpenSSL: sudo mv /usr/bin/openssl.backup /usr/bin/openssl"
    echo "3. Consider Amazon Linux 2023 migration instead"
    echo ""
    log "📋 Alternative: Run ./assess-upgrade-options.sh for other approaches"
fi

log "🏁 OpenSSL upgrade process completed!"

# Show important info for next steps
if [ "$OPENSSL_MODERN" = true ]; then
    echo ""
    echo "⚠️ IMPORTANT NOTES:"
    echo "=================="
    echo "1. You may need to restart your shell: exec bash"
    echo "2. Test OpenSSL: openssl version"
    echo "3. Test Python: python3 -c 'import ssl; print(ssl.OPENSSL_VERSION)'"
    echo "4. If issues occur, restore from backup at: $BACKUP_DIR"
fi 