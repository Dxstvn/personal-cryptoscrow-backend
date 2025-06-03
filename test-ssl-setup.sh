#!/bin/bash

# SSL Setup Validation Script
# Tests all aspects of the SSL setup and system health

echo "🧪 SSL Setup Validation and Testing"
echo "===================================="
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
log "📋 System Information Check"
echo "OS: $(cat /etc/os-release | grep PRETTY_NAME | cut -d'"' -f2)"
echo "OpenSSL: $(openssl version)"
echo "Current User: $(whoami)"
echo "Current Directory: $(pwd)"
echo ""

# Test 2: Node.js Application
log "🚀 Testing Node.js Application"
if pgrep -f "node" > /dev/null; then
    echo "✅ Node.js process running"
    echo "  Process: $(ps aux | grep node | grep -v grep | head -1)"
else
    echo "❌ Node.js process not found"
fi

if netstat -tln 2>/dev/null | grep -q ":3000 " || ss -tln 2>/dev/null | grep -q ":3000 "; then
    echo "✅ Port 3000 is listening"
else
    echo "❌ Port 3000 not listening"
fi

if curl -s http://localhost:3000 >/dev/null 2>&1; then
    echo "✅ Node.js app responding on localhost:3000"
else
    echo "❌ Node.js app not responding on localhost:3000"
fi
echo ""

# Test 3: Nginx Configuration
log "🌐 Testing Nginx Setup"
if command -v nginx >/dev/null 2>&1; then
    echo "✅ Nginx is installed: $(nginx -v 2>&1)"
    
    if systemctl is-active nginx >/dev/null 2>&1; then
        echo "✅ Nginx service is running"
    else
        echo "❌ Nginx service not running"
    fi
    
    if nginx -t >/dev/null 2>&1; then
        echo "✅ Nginx configuration is valid"
    else
        echo "❌ Nginx configuration has errors"
        nginx -t
    fi
    
    if [ -f /etc/nginx/sites-available/clearhold.app ]; then
        echo "✅ clearhold.app nginx config exists"
    else
        echo "❌ clearhold.app nginx config missing"
    fi
    
else
    echo "❌ Nginx not installed"
fi
echo ""

# Test 4: DNS Resolution
log "🌐 Testing DNS Resolution"
CURRENT_IP=$(curl -s http://checkip.amazonaws.com/ 2>/dev/null || curl -s http://whatismyip.org 2>/dev/null || echo "Unable to detect")
echo "Current server IP: $CURRENT_IP"

if command -v dig >/dev/null 2>&1; then
    DOMAIN_IP=$(dig +short clearhold.app 2>/dev/null)
    echo "clearhold.app resolves to: ${DOMAIN_IP:-'Not resolved'}"
    
    if [ "$CURRENT_IP" = "$DOMAIN_IP" ] && [ -n "$CURRENT_IP" ] && [ "$CURRENT_IP" != "Unable to detect" ]; then
        echo "✅ DNS correctly configured"
    else
        echo "❌ DNS not properly configured"
    fi
else
    echo "⚠️ dig not available for DNS testing"
fi
echo ""

# Test 5: HTTP/HTTPS Connectivity
log "🔗 Testing HTTP/HTTPS Connectivity"

# Test HTTP (port 80)
if curl -s --connect-timeout 5 http://localhost:80 >/dev/null 2>&1; then
    echo "✅ HTTP (port 80) responding"
    HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:80)
    echo "  HTTP Status: $HTTP_STATUS"
else
    echo "❌ HTTP (port 80) not responding"
fi

# Test HTTPS (port 443)
if curl -k -s --connect-timeout 5 https://localhost:443 >/dev/null 2>&1; then
    echo "✅ HTTPS (port 443) responding"
    HTTPS_STATUS=$(curl -k -s -o /dev/null -w "%{http_code}" https://localhost:443)
    echo "  HTTPS Status: $HTTPS_STATUS"
else
    echo "❌ HTTPS (port 443) not responding"
fi

# Test domain connectivity (if DNS is ready)
if [ "$CURRENT_IP" = "$DOMAIN_IP" ] && [ -n "$CURRENT_IP" ]; then
    if curl -s --connect-timeout 10 http://clearhold.app >/dev/null 2>&1; then
        echo "✅ Domain HTTP accessible: http://clearhold.app"
    else
        echo "⚠️ Domain HTTP not accessible yet (may need time for DNS propagation)"
    fi
    
    if curl -k -s --connect-timeout 10 https://clearhold.app >/dev/null 2>&1; then
        echo "✅ Domain HTTPS accessible: https://clearhold.app"
    else
        echo "⚠️ Domain HTTPS not accessible yet"
    fi
fi
echo ""

# Test 6: SSL Certificate Status
log "🔒 Testing SSL Certificate"

# Check for Let's Encrypt certificates
if [ -d "/etc/letsencrypt/live/clearhold.app" ]; then
    echo "✅ Let's Encrypt certificate directory exists"
    
    if [ -f "/etc/letsencrypt/live/clearhold.app/fullchain.pem" ]; then
        echo "✅ SSL certificate file exists"
        
        # Check certificate validity
        if openssl x509 -in /etc/letsencrypt/live/clearhold.app/fullchain.pem -text -noout >/dev/null 2>&1; then
            echo "✅ SSL certificate is valid"
            
            # Show certificate details
            echo "📋 Certificate Details:"
            openssl x509 -in /etc/letsencrypt/live/clearhold.app/fullchain.pem -text -noout | grep -E "(Subject:|Not After|DNS:)" | head -5
        else
            echo "❌ SSL certificate is invalid"
        fi
    else
        echo "❌ SSL certificate file missing"
    fi
    
# Check for acme.sh certificates
elif [ -f "/etc/ssl/certs/clearhold.app.fullchain.pem" ]; then
    echo "✅ acme.sh certificate exists"
    
    if openssl x509 -in /etc/ssl/certs/clearhold.app.fullchain.pem -text -noout >/dev/null 2>&1; then
        echo "✅ acme.sh certificate is valid"
        echo "📋 Certificate Details:"
        openssl x509 -in /etc/ssl/certs/clearhold.app.fullchain.pem -text -noout | grep -E "(Subject:|Not After|DNS:)" | head -5
    else
        echo "❌ acme.sh certificate is invalid"
    fi
    
else
    echo "❌ No SSL certificate found"
fi
echo ""

# Test 7: SSL Tools Status
log "🔧 Testing SSL Tools"

# Test certbot
if command -v certbot >/dev/null 2>&1; then
    if certbot --version >/dev/null 2>&1; then
        echo "✅ certbot working: $(certbot --version 2>&1 | head -1)"
    else
        echo "❌ certbot installed but not working"
    fi
else
    echo "⚠️ certbot not in PATH"
fi

# Test acme.sh
if [ -f ~/.acme.sh/acme.sh ]; then
    if ~/.acme.sh/acme.sh --version >/dev/null 2>&1; then
        echo "✅ acme.sh working: $(~/.acme.sh/acme.sh --version 2>&1 | head -1)"
    else
        echo "❌ acme.sh installed but not working"
    fi
else
    echo "⚠️ acme.sh not installed"
fi
echo ""

# Test 8: Auto-renewal Setup
log "🔄 Testing Auto-renewal Setup"
if sudo crontab -l 2>/dev/null | grep -q "certbot\|acme.sh"; then
    echo "✅ Auto-renewal cron job configured"
    echo "📋 Cron jobs:"
    sudo crontab -l 2>/dev/null | grep -E "certbot|acme.sh"
else
    echo "⚠️ No auto-renewal cron job found"
fi
echo ""

# Test 9: Security Group / Firewall
log "🛡️ Testing Network Connectivity"
echo "Testing external connectivity..."

# Test if ports are accessible externally (simple check)
if command -v netstat >/dev/null 2>&1; then
    echo "📋 Listening ports:"
    netstat -tln | grep -E ":80|:443|:3000" | head -10
elif command -v ss >/dev/null 2>&1; then
    echo "📋 Listening ports:"
    ss -tln | grep -E ":80|:443|:3000" | head -10
fi
echo ""

# Final Summary
log "🎯 VALIDATION SUMMARY"
echo "===================="

SCORE=0
TOTAL=0

# Count successful tests
if pgrep -f "node" > /dev/null; then ((SCORE++)); fi; ((TOTAL++))
if systemctl is-active nginx >/dev/null 2>&1; then ((SCORE++)); fi; ((TOTAL++))
if nginx -t >/dev/null 2>&1; then ((SCORE++)); fi; ((TOTAL++))
if [ "$CURRENT_IP" = "$DOMAIN_IP" ] && [ -n "$CURRENT_IP" ]; then ((SCORE++)); fi; ((TOTAL++))
if curl -s http://localhost:80 >/dev/null 2>&1; then ((SCORE++)); fi; ((TOTAL++))
if curl -k -s https://localhost:443 >/dev/null 2>&1; then ((SCORE++)); fi; ((TOTAL++))
if [ -f "/etc/letsencrypt/live/clearhold.app/fullchain.pem" ] || [ -f "/etc/ssl/certs/clearhold.app.fullchain.pem" ]; then ((SCORE++)); fi; ((TOTAL++))

echo "✅ Successful Tests: $SCORE/$TOTAL"

if [ $SCORE -eq $TOTAL ]; then
    echo "🎉 EXCELLENT! All systems are working perfectly!"
    echo "🌐 Your site should be fully accessible at: https://clearhold.app"
elif [ $SCORE -ge $((TOTAL * 3 / 4)) ]; then
    echo "😊 GOOD! Most systems are working. Minor issues may need attention."
elif [ $SCORE -ge $((TOTAL / 2)) ]; then
    echo "⚠️ PARTIAL: Some systems working, others need attention."
else
    echo "❌ NEEDS WORK: Multiple issues detected. Review the test results above."
fi

echo ""
echo "📋 Next Steps:"
if [ $SCORE -lt $TOTAL ]; then
    echo "1. Review failed tests above"
    echo "2. Check logs: sudo journalctl -u nginx -f"
    echo "3. Verify Node.js app: systemctl status your-app-service"
    echo "4. Test SSL: openssl s_client -connect clearhold.app:443"
fi

echo "5. Monitor auto-renewal: sudo certbot renew --dry-run"
echo "6. Check https://clearhold.app in browser"
echo ""

log "🏁 Validation completed!" 