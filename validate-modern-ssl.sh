#!/bin/bash

# Modern SSL Setup Validation Script
# Comprehensive testing of OpenSSL upgrade and SSL certificate setup

echo "🧪 Modern SSL Setup Validation"
echo "=============================="
echo ""

# Function to log with timestamp and status
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

test_result() {
    if [ $? -eq 0 ]; then
        echo "✅ $1"
        return 0
    else
        echo "❌ $1"
        return 1
    fi
}

# Test 1: System Information
log "📋 System Information"
echo "OS: $(cat /etc/os-release | grep PRETTY_NAME | cut -d'"' -f2)"
echo "Kernel: $(uname -r)"
echo "Current User: $(whoami)"
echo "Uptime: $(uptime | awk -F'up ' '{print $2}' | awk -F, '{print $1}')"
echo ""

# Test 2: OpenSSL Validation
log "🔒 OpenSSL Validation"
OPENSSL_VERSION=$(openssl version)
echo "OpenSSL Version: $OPENSSL_VERSION"
echo "OpenSSL Location: $(which openssl)"

if echo "$OPENSSL_VERSION" | grep -q "1.1\|3."; then
    echo "✅ Modern OpenSSL detected"
    OPENSSL_MODERN=true
    
    # Test OpenSSL functionality
    if openssl rand -hex 16 >/dev/null 2>&1; then
        echo "✅ OpenSSL functionality working"
        OPENSSL_WORKING=true
    else
        echo "❌ OpenSSL functionality issues"
        OPENSSL_WORKING=false
    fi
    
    # Check supported protocols
    echo "📋 Supported SSL/TLS protocols:"
    openssl ciphers -v 2>/dev/null | grep -E "TLSv1\.[23]" | head -3 | awk '{print "  - " $2}'
    
else
    echo "❌ Old OpenSSL version detected"
    OPENSSL_MODERN=false
    OPENSSL_WORKING=false
fi

# Check for backup OpenSSL
if [ -f "/usr/bin/openssl.backup" ]; then
    echo "📋 Backup OpenSSL found: $((/usr/bin/openssl.backup version 2>/dev/null) || echo 'Error reading backup')"
fi
echo ""

# Test 3: Python SSL Integration
log "🐍 Python SSL Integration"
echo "Python Version: $(python3 --version 2>/dev/null || echo 'Not found')"

if python3 -c "import ssl; print('Python SSL version:', ssl.OPENSSL_VERSION)" 2>/dev/null; then
    PYTHON_SSL_VERSION=$(python3 -c "import ssl; print(ssl.OPENSSL_VERSION)" 2>/dev/null)
    echo "Python SSL: $PYTHON_SSL_VERSION"
    
    # Check if Python SSL matches system OpenSSL
    if echo "$PYTHON_SSL_VERSION" | grep -q "1.1\|3."; then
        echo "✅ Python using modern OpenSSL"
        PYTHON_SSL_MODERN=true
    else
        echo "⚠️ Python still using old OpenSSL"
        PYTHON_SSL_MODERN=false
    fi
    
    # Test cryptography library
    if python3 -c "import cryptography; print('Cryptography version:', cryptography.__version__)" 2>/dev/null; then
        echo "✅ Cryptography library working"
        CRYPTO_WORKING=true
    else
        echo "❌ Cryptography library issues"
        CRYPTO_WORKING=false
    fi
else
    echo "❌ Python SSL import failed"
    PYTHON_SSL_MODERN=false
    CRYPTO_WORKING=false
fi
echo ""

# Test 4: Certbot Validation
log "🔧 Certbot Validation"
if command -v certbot >/dev/null 2>&1; then
    echo "Certbot Location: $(which certbot)"
    
    if certbot --version >/dev/null 2>&1; then
        CERTBOT_VERSION=$(certbot --version 2>&1 | head -1)
        echo "✅ Certbot working: $CERTBOT_VERSION"
        CERTBOT_WORKING=true
        
        # Test certbot SSL compatibility
        if certbot plugins 2>/dev/null | grep -q nginx; then
            echo "✅ Nginx plugin available"
            CERTBOT_NGINX_OK=true
        else
            echo "⚠️ Nginx plugin not found"
            CERTBOT_NGINX_OK=false
        fi
    else
        echo "❌ Certbot installed but not working"
        CERTBOT_WORKING=false
        CERTBOT_NGINX_OK=false
    fi
else
    echo "❌ Certbot not found"
    CERTBOT_WORKING=false
    CERTBOT_NGINX_OK=false
fi
echo ""

# Test 5: Node.js Application
log "🚀 Node.js Application"
if pgrep -f "node" > /dev/null; then
    echo "✅ Node.js process running"
    NODE_PROCESS=$(ps aux | grep node | grep -v grep | head -1 | awk '{print $2}')
    echo "  Process ID: $NODE_PROCESS"
    
    if netstat -tln 2>/dev/null | grep -q ":3000 " || ss -tln 2>/dev/null | grep -q ":3000 "; then
        echo "✅ Port 3000 is listening"
        PORT_3000_OK=true
    else
        echo "❌ Port 3000 not listening"
        PORT_3000_OK=false
    fi
    
    if curl -s --connect-timeout 5 http://localhost:3000 >/dev/null 2>&1; then
        echo "✅ Application responding on localhost:3000"
        APP_RESPONDING=true
    else
        echo "❌ Application not responding on localhost:3000"
        APP_RESPONDING=false
    fi
else
    echo "❌ Node.js process not found"
    PORT_3000_OK=false
    APP_RESPONDING=false
fi
echo ""

# Test 6: Nginx Configuration
log "🌐 Nginx Configuration"
if command -v nginx >/dev/null 2>&1; then
    echo "✅ Nginx installed: $(nginx -v 2>&1)"
    
    if systemctl is-active nginx >/dev/null 2>&1; then
        echo "✅ Nginx service running"
        NGINX_RUNNING=true
    else
        echo "❌ Nginx service not running"
        NGINX_RUNNING=false
    fi
    
    if nginx -t >/dev/null 2>&1; then
        echo "✅ Nginx configuration valid"
        NGINX_CONFIG_OK=true
    else
        echo "❌ Nginx configuration errors:"
        nginx -t 2>&1 | head -3
        NGINX_CONFIG_OK=false
    fi
    
    if [ -f /etc/nginx/sites-available/clearhold.app ]; then
        echo "✅ clearhold.app nginx config exists"
        
        # Check if SSL is configured
        if grep -q "listen 443" /etc/nginx/sites-available/clearhold.app; then
            echo "✅ SSL configuration found in nginx"
            NGINX_SSL_CONFIG=true
        else
            echo "📋 No SSL configuration in nginx (HTTP only)"
            NGINX_SSL_CONFIG=false
        fi
    else
        echo "❌ clearhold.app nginx config missing"
        NGINX_SSL_CONFIG=false
    fi
else
    echo "❌ Nginx not installed"
    NGINX_RUNNING=false
    NGINX_CONFIG_OK=false
    NGINX_SSL_CONFIG=false
fi
echo ""

# Test 7: DNS Resolution
log "🌐 DNS Resolution"
CURRENT_IP=$(curl -s http://checkip.amazonaws.com/ 2>/dev/null || curl -s http://whatismyip.org 2>/dev/null || echo "Unable to detect")
echo "Current server IP: $CURRENT_IP"

if command -v dig >/dev/null 2>&1; then
    DOMAIN_IP=$(dig +short clearhold.app 2>/dev/null)
    WWW_DOMAIN_IP=$(dig +short www.clearhold.app 2>/dev/null)
    
    echo "clearhold.app resolves to: ${DOMAIN_IP:-'Not resolved'}"
    echo "www.clearhold.app resolves to: ${WWW_DOMAIN_IP:-'Not resolved'}"
    
    if [ "$CURRENT_IP" = "$DOMAIN_IP" ] && [ -n "$CURRENT_IP" ] && [ "$CURRENT_IP" != "Unable to detect" ]; then
        echo "✅ DNS correctly configured for clearhold.app"
        DNS_OK=true
    else
        echo "❌ DNS not properly configured for clearhold.app"
        DNS_OK=false
    fi
    
    if [ "$CURRENT_IP" = "$WWW_DOMAIN_IP" ] || [ "$DOMAIN_IP" = "$WWW_DOMAIN_IP" ]; then
        echo "✅ www.clearhold.app DNS configured correctly"
        WWW_DNS_OK=true
    else
        echo "⚠️ www.clearhold.app DNS may need attention"
        WWW_DNS_OK=false
    fi
else
    echo "⚠️ dig not available for DNS testing"
    DNS_OK=false
    WWW_DNS_OK=false
fi
echo ""

# Test 8: SSL Certificate Status
log "🔒 SSL Certificate Status"
if [ -d "/etc/letsencrypt/live/clearhold.app" ]; then
    echo "✅ Let's Encrypt certificate directory exists"
    
    if [ -f "/etc/letsencrypt/live/clearhold.app/fullchain.pem" ]; then
        echo "✅ SSL certificate file exists"
        
        # Check certificate validity and details
        if openssl x509 -in /etc/letsencrypt/live/clearhold.app/fullchain.pem -text -noout >/dev/null 2>&1; then
            echo "✅ SSL certificate is valid"
            
            # Show certificate details
            echo "📋 Certificate Details:"
            CERT_SUBJECT=$(openssl x509 -in /etc/letsencrypt/live/clearhold.app/fullchain.pem -subject -noout 2>/dev/null | cut -d'=' -f2-)
            CERT_EXPIRY=$(openssl x509 -in /etc/letsencrypt/live/clearhold.app/fullchain.pem -enddate -noout 2>/dev/null | cut -d'=' -f2)
            CERT_DOMAINS=$(openssl x509 -in /etc/letsencrypt/live/clearhold.app/fullchain.pem -text -noout 2>/dev/null | grep -A1 "Subject Alternative Name" | tail -1 | sed 's/DNS://g' || echo "clearhold.app")
            
            echo "  Subject: $CERT_SUBJECT"
            echo "  Expires: $CERT_EXPIRY"
            echo "  Domains: $CERT_DOMAINS"
            
            # Check if certificate is close to expiry
            EXPIRY_SECONDS=$(date -d "$CERT_EXPIRY" +%s 2>/dev/null || echo 0)
            CURRENT_SECONDS=$(date +%s)
            DAYS_TO_EXPIRY=$(( (EXPIRY_SECONDS - CURRENT_SECONDS) / 86400 ))
            
            if [ $DAYS_TO_EXPIRY -gt 30 ]; then
                echo "✅ Certificate valid for $DAYS_TO_EXPIRY days"
                CERT_EXPIRY_OK=true
            elif [ $DAYS_TO_EXPIRY -gt 0 ]; then
                echo "⚠️ Certificate expires in $DAYS_TO_EXPIRY days"
                CERT_EXPIRY_OK=false
            else
                echo "❌ Certificate has expired"
                CERT_EXPIRY_OK=false
            fi
            
            SSL_CERT_OK=true
        else
            echo "❌ SSL certificate is invalid"
            SSL_CERT_OK=false
            CERT_EXPIRY_OK=false
        fi
    else
        echo "❌ SSL certificate file missing"
        SSL_CERT_OK=false
        CERT_EXPIRY_OK=false
    fi
else
    echo "❌ No SSL certificate found"
    SSL_CERT_OK=false
    CERT_EXPIRY_OK=false
fi
echo ""

# Test 9: HTTP/HTTPS Connectivity
log "🔗 HTTP/HTTPS Connectivity"

# Test local HTTP
if curl -s --connect-timeout 5 http://localhost:80 >/dev/null 2>&1; then
    HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:80)
    echo "✅ HTTP (port 80) responding - Status: $HTTP_STATUS"
    LOCAL_HTTP_OK=true
else
    echo "❌ HTTP (port 80) not responding"
    LOCAL_HTTP_OK=false
fi

# Test local HTTPS
if curl -k -s --connect-timeout 5 https://localhost:443 >/dev/null 2>&1; then
    HTTPS_STATUS=$(curl -k -s -o /dev/null -w "%{http_code}" https://localhost:443)
    echo "✅ HTTPS (port 443) responding - Status: $HTTPS_STATUS"
    LOCAL_HTTPS_OK=true
else
    echo "❌ HTTPS (port 443) not responding"
    LOCAL_HTTPS_OK=false
fi

# Test domain connectivity (if DNS is ready)
if [ "$DNS_OK" = true ]; then
    if curl -s --connect-timeout 10 http://clearhold.app >/dev/null 2>&1; then
        DOMAIN_HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://clearhold.app)
        echo "✅ Domain HTTP accessible - Status: $DOMAIN_HTTP_STATUS"
        DOMAIN_HTTP_OK=true
    else
        echo "⚠️ Domain HTTP not accessible"
        DOMAIN_HTTP_OK=false
    fi
    
    if curl -s --connect-timeout 10 https://clearhold.app >/dev/null 2>&1; then
        DOMAIN_HTTPS_STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://clearhold.app)
        echo "✅ Domain HTTPS accessible - Status: $DOMAIN_HTTPS_STATUS"
        DOMAIN_HTTPS_OK=true
        
        # Test SSL certificate from domain
        if openssl s_client -connect clearhold.app:443 -servername clearhold.app </dev/null 2>/dev/null | openssl x509 -noout -text | grep -q "clearhold.app"; then
            echo "✅ SSL certificate correctly served from domain"
            DOMAIN_SSL_OK=true
        else
            echo "⚠️ SSL certificate issues from domain"
            DOMAIN_SSL_OK=false
        fi
    else
        echo "⚠️ Domain HTTPS not accessible"
        DOMAIN_HTTPS_OK=false
        DOMAIN_SSL_OK=false
    fi
else
    echo "⚠️ Skipping domain tests - DNS not ready"
    DOMAIN_HTTP_OK=false
    DOMAIN_HTTPS_OK=false
    DOMAIN_SSL_OK=false
fi
echo ""

# Test 10: Auto-renewal Configuration
log "🔄 Auto-renewal Configuration"
if sudo crontab -l 2>/dev/null | grep -q "certbot"; then
    echo "✅ Certbot auto-renewal cron job found"
    echo "📋 Cron configuration:"
    sudo crontab -l 2>/dev/null | grep certbot | head -2
    
    # Test renewal
    log "🧪 Testing certificate renewal..."
    if sudo certbot renew --dry-run >/dev/null 2>&1; then
        echo "✅ Certificate renewal test successful"
        RENEWAL_OK=true
    else
        echo "❌ Certificate renewal test failed"
        RENEWAL_OK=false
    fi
else
    echo "❌ No auto-renewal cron job found"
    RENEWAL_OK=false
fi
echo ""

# Test 11: Security and Performance
log "🛡️ Security and Performance"

# Check listening ports
echo "📋 Listening ports:"
if command -v netstat >/dev/null 2>&1; then
    netstat -tln | grep -E ":80|:443|:3000" | head -5
elif command -v ss >/dev/null 2>&1; then
    ss -tln | grep -E ":80|:443|:3000" | head -5
fi

# Check SSL configuration quality (if HTTPS is working)
if [ "$LOCAL_HTTPS_OK" = true ]; then
    echo "🔒 SSL Configuration Test:"
    if echo | openssl s_client -connect localhost:443 -cipher HIGH 2>/dev/null | grep -q "Cipher is"; then
        CIPHER=$(echo | openssl s_client -connect localhost:443 2>/dev/null | grep "Cipher is" | awk '{print $4}')
        echo "✅ Strong cipher in use: $CIPHER"
        SSL_STRONG=true
    else
        echo "⚠️ Could not verify cipher strength"
        SSL_STRONG=false
    fi
else
    SSL_STRONG=false
fi
echo ""

# Final Scoring and Summary
log "🎯 VALIDATION SUMMARY"
echo "===================="

SCORE=0
TOTAL=0

# Core functionality tests
if [ "$OPENSSL_MODERN" = true ]; then ((SCORE++)); fi; ((TOTAL++))
if [ "$OPENSSL_WORKING" = true ]; then ((SCORE++)); fi; ((TOTAL++))
if [ "$PYTHON_SSL_MODERN" = true ]; then ((SCORE++)); fi; ((TOTAL++))
if [ "$CERTBOT_WORKING" = true ]; then ((SCORE++)); fi; ((TOTAL++))
if [ "$APP_RESPONDING" = true ]; then ((SCORE++)); fi; ((TOTAL++))
if [ "$NGINX_RUNNING" = true ]; then ((SCORE++)); fi; ((TOTAL++))
if [ "$DNS_OK" = true ]; then ((SCORE++)); fi; ((TOTAL++))
if [ "$SSL_CERT_OK" = true ]; then ((SCORE++)); fi; ((TOTAL++))
if [ "$LOCAL_HTTPS_OK" = true ]; then ((SCORE++)); fi; ((TOTAL++))
if [ "$DOMAIN_HTTPS_OK" = true ]; then ((SCORE++)); fi; ((TOTAL++))

echo "✅ Successful Tests: $SCORE/$TOTAL"

# Detailed status
echo ""
echo "📋 Component Status:"
echo "==================="
echo "Modern OpenSSL: $([ "$OPENSSL_MODERN" = true ] && echo "✅ Working" || echo "❌ Failed")"
echo "Python SSL: $([ "$PYTHON_SSL_MODERN" = true ] && echo "✅ Updated" || echo "❌ Old version")"
echo "Certbot: $([ "$CERTBOT_WORKING" = true ] && echo "✅ Working" || echo "❌ Issues")"
echo "Node.js App: $([ "$APP_RESPONDING" = true ] && echo "✅ Running" || echo "❌ Issues")"
echo "Nginx: $([ "$NGINX_RUNNING" = true ] && echo "✅ Running" || echo "❌ Issues")"
echo "DNS: $([ "$DNS_OK" = true ] && echo "✅ Configured" || echo "❌ Issues")"
echo "SSL Certificate: $([ "$SSL_CERT_OK" = true ] && echo "✅ Valid" || echo "❌ Issues")"
echo "HTTPS Local: $([ "$LOCAL_HTTPS_OK" = true ] && echo "✅ Working" || echo "❌ Failed")"
echo "HTTPS Domain: $([ "$DOMAIN_HTTPS_OK" = true ] && echo "✅ Working" || echo "❌ Failed")"
echo "Auto-renewal: $([ "$RENEWAL_OK" = true ] && echo "✅ Configured" || echo "❌ Issues")"

echo ""
if [ $SCORE -eq $TOTAL ]; then
    echo "🎉 PERFECT! All systems are working flawlessly!"
    echo "🌐 Your site is fully functional at: https://clearhold.app"
    echo "🔒 SSL certificates are properly configured and will auto-renew"
elif [ $SCORE -ge $((TOTAL * 4 / 5)) ]; then
    echo "😊 EXCELLENT! Most systems working well - minor issues only"
    echo "🌐 Your site should be accessible at: https://clearhold.app"
elif [ $SCORE -ge $((TOTAL * 3 / 5)) ]; then
    echo "👍 GOOD! Core functionality working - some optimization needed"
elif [ $SCORE -ge $((TOTAL / 2)) ]; then
    echo "⚠️ PARTIAL: Basic functionality present - several issues need attention"
else
    echo "❌ NEEDS WORK: Multiple critical issues detected"
fi

echo ""
echo "🔧 Recommendations:"
echo "=================="

if [ "$OPENSSL_MODERN" != true ]; then
    echo "❗ CRITICAL: Run ./upgrade-openssl-al2.sh to upgrade OpenSSL"
fi

if [ "$DNS_OK" != true ]; then
    echo "🌐 Update DNS A record to point to: $CURRENT_IP"
fi

if [ "$APP_RESPONDING" != true ]; then
    echo "🚀 Start/restart your Node.js application"
fi

if [ "$SSL_CERT_OK" != true ] && [ "$OPENSSL_MODERN" = true ]; then
    echo "🔒 Run ./modern-ssl-setup.sh to generate SSL certificate"
fi

if [ "$RENEWAL_OK" != true ] && [ "$SSL_CERT_OK" = true ]; then
    echo "🔄 Set up auto-renewal: sudo crontab -e"
fi

echo ""
echo "📖 Next Steps:"
if [ $SCORE -eq $TOTAL ]; then
    echo "🎯 Your SSL setup is complete! Monitor renewal and enjoy HTTPS!"
elif [ "$OPENSSL_MODERN" = true ] && [ "$SSL_CERT_OK" = true ]; then
    echo "🎯 Core SSL working - address remaining issues for optimization"
else
    echo "🎯 Follow recommendations above in order of priority"
fi

echo ""
log "🏁 Validation completed!" 