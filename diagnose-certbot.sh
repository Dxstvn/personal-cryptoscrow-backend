#!/bin/bash

# Quick Diagnostic Script for Certbot Issues
# Run this to understand the current state before applying fixes

echo "🔍 Certbot and SSL Diagnostic Report"
echo "===================================="
echo ""

# System Info
echo "📋 System Information:"
echo "OS: $(cat /etc/os-release | grep PRETTY_NAME | cut -d'"' -f2)"
echo "OpenSSL: $(openssl version)"
echo "Python: $(python3 --version 2>/dev/null || echo 'Not found')"
echo ""

# Certbot Installations
echo "🔧 Certbot Installations:"
echo "System certbot (yum): $(rpm -q certbot 2>/dev/null || echo 'Not installed')"
echo "Pip3 certbot locations:"
find /usr/local -name "certbot" -type f 2>/dev/null | head -5
echo ""

# Certbot executables
echo "🎯 Certbot Executables:"
which -a certbot 2>/dev/null || echo "No certbot in PATH"
echo ""

# Test different certbot locations
echo "🧪 Testing Certbot Functionality:"
for certbot_path in "/usr/bin/certbot" "/usr/local/bin/certbot" "certbot"; do
    if [ -x "$certbot_path" ] || command -v "$certbot_path" >/dev/null 2>&1; then
        echo "Testing $certbot_path:"
        if $certbot_path --version >/dev/null 2>&1; then
            echo "  ✅ Works: $($certbot_path --version 2>&1 | head -1)"
        else
            echo "  ❌ Failed: $($certbot_path --version 2>&1 | head -1)"
        fi
    else
        echo "$certbot_path: Not found"
    fi
done
echo ""

# Nginx status
echo "🌐 Nginx Status:"
if command -v nginx >/dev/null 2>&1; then
    echo "Nginx: $(nginx -v 2>&1)"
    echo "Status: $(systemctl is-active nginx 2>/dev/null || echo 'Not running')"
    if [ -f /etc/nginx/sites-available/clearhold.app ]; then
        echo "clearhold.app config: ✅ Exists"
    else
        echo "clearhold.app config: ❌ Missing"
    fi
else
    echo "Nginx: ❌ Not installed"
fi
echo ""

# DNS Check
echo "🌐 DNS Status:"
CURRENT_IP=$(curl -s http://checkip.amazonaws.com/ 2>/dev/null || echo "Unable to detect")
echo "Current server IP: $CURRENT_IP"

if command -v dig >/dev/null 2>&1; then
    DOMAIN_IP=$(dig +short clearhold.app 2>/dev/null)
    echo "clearhold.app resolves to: ${DOMAIN_IP:-'Not resolved'}"
    
    if [ "$CURRENT_IP" = "$DOMAIN_IP" ] && [ -n "$CURRENT_IP" ] && [ "$CURRENT_IP" != "Unable to detect" ]; then
        echo "DNS Status: ✅ Correctly configured"
    else
        echo "DNS Status: ⚠️ Not properly configured"
    fi
else
    echo "dig: Not available for testing"
fi
echo ""

# App Status
echo "🚀 Application Status:"
if netstat -tln 2>/dev/null | grep -q ":3000 " || ss -tln 2>/dev/null | grep -q ":3000 "; then
    echo "Node.js app on port 3000: ✅ Running"
else
    echo "Node.js app on port 3000: ⚠️ Not detected"
fi
echo ""

# SSL Certificate Status
echo "🔒 SSL Certificate Status:"
if [ -d "/etc/letsencrypt/live/clearhold.app" ]; then
    echo "SSL Certificate: ✅ Exists"
    echo "Certificate details:"
    sudo openssl x509 -in /etc/letsencrypt/live/clearhold.app/fullchain.pem -text -noout | grep -E "(Subject:|Not After|DNS:)" 2>/dev/null || echo "  Cannot read certificate details"
else
    echo "SSL Certificate: ❌ Not found"
fi
echo ""

# Conflicting Python packages
echo "🐍 Python Package Conflicts:"
pip3 list | grep -E "(certbot|urllib3|acme)" 2>/dev/null || echo "No relevant pip3 packages found"
echo ""

# Recommendations
echo "💡 Recommendations:"
echo "========================"

# Check for specific issues from the terminal output provided
if rpm -q certbot >/dev/null 2>&1; then
    if ! /usr/bin/certbot --version >/dev/null 2>&1; then
        echo "❌ System certbot is installed but not working due to pip3 conflicts"
        echo "   → Run fix-certbot-final.sh to clean up conflicts"
    else
        echo "✅ System certbot is working properly"
    fi
else
    echo "❌ No working certbot installation found"
    echo "   → Run fix-certbot-final.sh to install and configure"
fi

if [ "$CURRENT_IP" != "$DOMAIN_IP" ] || [ -z "$DOMAIN_IP" ]; then
    echo "⚠️ DNS not properly configured"
    echo "   → Update DNS A record to point to: $CURRENT_IP"
fi

if ! netstat -tln 2>/dev/null | grep -q ":3000 " && ! ss -tln 2>/dev/null | grep -q ":3000 "; then
    echo "⚠️ Node.js app not running"
    echo "   → Start your application before getting SSL certificate"
fi

echo ""
echo "🚀 To fix all issues, run: ./fix-certbot-final.sh" 