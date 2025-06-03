#!/bin/bash

# Quick Fix for Certbot OpenSSL Compatibility Issue
# Run this script to fix the urllib3/OpenSSL version conflict

echo "🔧 Fixing Certbot OpenSSL compatibility issue..."

# Check current OpenSSL version
echo "🔍 Current OpenSSL version:"
openssl version

# Method 1: Try Amazon Linux Extras (most reliable)
echo "🚀 Attempting Method 1: Amazon Linux Extras..."
if sudo amazon-linux-extras install -y epel 2>/dev/null; then
    echo "✅ EPEL installed via Amazon Linux Extras"
    if sudo yum install -y certbot python2-certbot-nginx; then
        echo "✅ Certbot installed via yum - this should work!"
        echo "🧪 Testing certbot..."
        if certbot --version; then
            echo "🎉 SUCCESS! Certbot is working via Method 1"
            exit 0
        fi
    fi
fi

echo "⚠️ Method 1 failed, trying Method 2..."

# Method 2: Fix the pip installation with compatible versions
echo "🚀 Attempting Method 2: Compatible pip versions..."
sudo pip3 uninstall -y certbot certbot-nginx urllib3 2>/dev/null
sudo pip3 install 'urllib3<2.0' 'certbot<2.0' 'certbot-nginx<2.0'

# Add to PATH
export PATH="/usr/local/bin:$PATH"
echo 'export PATH="/usr/local/bin:$PATH"' >> ~/.bashrc

echo "🧪 Testing certbot with Method 2..."
if /usr/local/bin/certbot --version; then
    echo "🎉 SUCCESS! Certbot is working via Method 2"
    echo "📝 Note: You may need to run 'source ~/.bashrc' or restart your session"
    exit 0
fi

echo "⚠️ Method 2 failed, trying Method 3..."

# Method 3: Try system certbot if available
echo "🚀 Attempting Method 3: System packages..."
if sudo yum install -y certbot python2-certbot-nginx 2>/dev/null; then
    echo "🧪 Testing system certbot..."
    if certbot --version; then
        echo "🎉 SUCCESS! System certbot is working"
        exit 0
    fi
fi

echo "❌ All methods failed. Please check SSL_SETUP_FIX.md for manual solutions."
echo "Your system appears to have OpenSSL compatibility issues that require manual intervention."

# Show current status
echo ""
echo "📊 Current Status:"
echo "OpenSSL version: $(openssl version)"
echo "Python version: $(python3 --version)"
echo "Certbot locations:"
which certbot 2>/dev/null || echo "  - Not in PATH"
ls -la /usr/local/bin/certbot 2>/dev/null || echo "  - Not in /usr/local/bin"
ls -la /usr/bin/certbot 2>/dev/null || echo "  - Not in /usr/bin" 