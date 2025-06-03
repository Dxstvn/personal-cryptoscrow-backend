#!/bin/bash

# Modern SSL Certificate Setup for clearhold.app
# Uses upgraded OpenSSL and modern certbot to generate SSL certificates

echo "🔒 Modern SSL Certificate Setup for clearhold.app"
echo "=================================================="
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

# Pre-flight checks
log "🔍 Pre-flight SSL Setup Checks"
echo "=============================="

# Check OpenSSL version
OPENSSL_VERSION=$(openssl version)
echo "OpenSSL: $OPENSSL_VERSION"

if echo "$OPENSSL_VERSION" | grep -q "1.1\|3."; then
    log "✅ Modern OpenSSL detected"
    OPENSSL_MODERN=true
else
    log "❌ OpenSSL is not modern - run upgrade-openssl-al2.sh first"
    exit 1
fi

# Check certbot
if command -v certbot >/dev/null 2>&1; then
    if certbot --version >/dev/null 2>&1; then
        CERTBOT_VERSION=$(certbot --version 2>&1 | head -1)
        log "✅ Certbot available: $CERTBOT_VERSION"
        CERTBOT_READY=true
    else
        log "❌ Certbot installed but not working"
        CERTBOT_READY=false
    fi
else
    log "❌ Certbot not found - run upgrade-openssl-al2.sh first"
    exit 1
fi

# Check DNS resolution
log "🌐 Checking DNS resolution..."
CURRENT_IP=$(curl -s http://checkip.amazonaws.com/ 2>/dev/null || echo "Unable to detect")
echo "Current server IP: $CURRENT_IP"

if command -v dig >/dev/null 2>&1; then
    DOMAIN_IP=$(dig +short clearhold.app 2>/dev/null)
    echo "clearhold.app resolves to: ${DOMAIN_IP:-'Not resolved'}"
    
    if [ "$CURRENT_IP" = "$DOMAIN_IP" ] && [ -n "$CURRENT_IP" ] && [ "$CURRENT_IP" != "Unable to detect" ]; then
        log "✅ DNS is correctly configured"
        DNS_READY=true
    else
        log "⚠️ DNS not properly configured - SSL certificate generation may fail"
        echo "  Please update your DNS A record to point to: $CURRENT_IP"
        DNS_READY=false
    fi
else
    log "⚠️ dig not available for DNS testing"
    DNS_READY=false
fi

# Check Node.js app
if pgrep -f "node" > /dev/null && curl -s http://localhost:3000 >/dev/null 2>&1; then
    log "✅ Node.js application is running"
    APP_RUNNING=true
else
    log "⚠️ Node.js application not responding - please start your app"
    APP_RUNNING=false
fi

echo ""

# Phase 1: Nginx Setup
log "🌐 Phase 1: Nginx Configuration"
echo "==============================="

# Install nginx if not present
if ! command -v nginx >/dev/null 2>&1; then
    log "🔧 Installing nginx..."
    sudo yum install -y nginx
    check_status "Nginx installation"
fi

# Create nginx directories
sudo mkdir -p /etc/nginx/sites-available /etc/nginx/sites-enabled /var/www/html

# Add sites-enabled to main config if needed
if ! grep -q "sites-enabled" /etc/nginx/nginx.conf; then
    log "🔧 Adding sites-enabled to nginx.conf..."
    sudo sed -i '/http {/a\    include /etc/nginx/sites-enabled/*;' /etc/nginx/nginx.conf
fi

# Create nginx configuration for clearhold.app
log "⚙️ Creating nginx configuration for clearhold.app..."
sudo tee /etc/nginx/sites-available/clearhold.app > /dev/null <<'EOF'
server {
    listen 80;
    server_name clearhold.app www.clearhold.app;

    # Let's Encrypt challenge location
    location /.well-known/acme-challenge/ {
        root /var/www/html;
        allow all;
    }

    # Proxy to Node.js app
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
EOF

# Enable the site
log "🔗 Enabling nginx site..."
sudo ln -sf /etc/nginx/sites-available/clearhold.app /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# Create web root and set permissions
sudo mkdir -p /var/www/html
sudo chown nginx:nginx /var/www/html

# Test and start nginx
if sudo nginx -t; then
    log "✅ Nginx configuration is valid"
    sudo systemctl enable nginx
    sudo systemctl start nginx
    check_status "Nginx startup"
else
    log "❌ Nginx configuration error"
    sudo nginx -t
    exit 1
fi

# Phase 2: SSL Certificate Generation
log "🔒 Phase 2: SSL Certificate Generation"
echo "====================================="

if [ "$DNS_READY" = true ] || [ "$DNS_READY" = false ]; then
    log "🚀 Attempting SSL certificate generation..."
    
    # Stop nginx temporarily for standalone mode
    sudo systemctl stop nginx
    
    # Generate SSL certificate using standalone mode
    log "📋 Generating SSL certificate for clearhold.app and www.clearhold.app..."
    
    if sudo certbot certonly --standalone --preferred-challenges http \
       -d clearhold.app -d www.clearhold.app \
       --agree-tos --non-interactive --email admin@clearhold.app \
       --verbose; then
        
        log "✅ SSL certificate generated successfully!"
        SSL_SUCCESS=true
        
        # Update nginx configuration with SSL
        log "🔧 Updating nginx configuration with SSL..."
        sudo tee /etc/nginx/sites-available/clearhold.app > /dev/null <<'EOF'
server {
    listen 80;
    server_name clearhold.app www.clearhold.app;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name clearhold.app www.clearhold.app;

    # SSL Configuration
    ssl_certificate /etc/letsencrypt/live/clearhold.app/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/clearhold.app/privkey.pem;
    
    # Modern SSL Settings
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;
    
    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options DENY always;
    add_header X-Content-Type-Options nosniff always;

    # Proxy to Node.js app
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Security headers for proxied content
        proxy_set_header X-Forwarded-Ssl on;
    }
}
EOF
        
        # Test SSL nginx configuration
        if sudo nginx -t; then
            log "✅ SSL nginx configuration is valid"
            sudo systemctl start nginx
            check_status "Nginx SSL startup"
        else
            log "❌ SSL nginx configuration error"
            sudo nginx -t
            # Fall back to HTTP-only config
            sudo systemctl start nginx
            SSL_SUCCESS=false
        fi
        
    else
        log "❌ SSL certificate generation failed"
        SSL_SUCCESS=false
        sudo systemctl start nginx  # Restart nginx anyway
    fi
else
    log "⚠️ Skipping SSL certificate generation - DNS not ready"
    SSL_SUCCESS=false
fi

# Phase 3: Auto-renewal Setup
if [ "$SSL_SUCCESS" = true ]; then
    log "🔄 Phase 3: Setting up SSL certificate auto-renewal"
    echo "=================================================="
    
    # Test renewal
    log "🧪 Testing certificate renewal..."
    if sudo certbot renew --dry-run >/dev/null 2>&1; then
        log "✅ Certificate renewal test successful"
        
        # Set up cron job for auto-renewal
        log "📅 Setting up auto-renewal cron job..."
        
        # Remove any existing certbot cron jobs
        sudo crontab -l 2>/dev/null | grep -v certbot | sudo crontab - 2>/dev/null || true
        
        # Add new cron job for auto-renewal
        (sudo crontab -l 2>/dev/null; echo "0 12 * * * /usr/bin/certbot renew --quiet && systemctl reload nginx") | sudo crontab -
        
        log "✅ Auto-renewal configured to run daily at noon"
        RENEWAL_OK=true
    else
        log "⚠️ Certificate renewal test failed - auto-renewal not configured"
        RENEWAL_OK=false
    fi
else
    log "⚠️ Skipping auto-renewal setup - no SSL certificate"
    RENEWAL_OK=false
fi

# Phase 4: Firewall and Security
log "🛡️ Phase 4: Security Configuration"
echo "=================================="

# Check if firewall is running and configure if needed
if systemctl is-active firewalld >/dev/null 2>&1; then
    log "🔧 Configuring firewall for HTTP/HTTPS..."
    sudo firewall-cmd --permanent --add-service=http
    sudo firewall-cmd --permanent --add-service=https
    sudo firewall-cmd --reload
    log "✅ Firewall configured"
elif command -v ufw >/dev/null 2>&1; then
    log "🔧 Configuring UFW for HTTP/HTTPS..."
    sudo ufw allow 80/tcp
    sudo ufw allow 443/tcp
    log "✅ UFW configured"
else
    log "📋 No firewall detected - ensure ports 80 and 443 are open in security groups"
fi

# Final validation
log "🧪 Phase 5: Final Validation"
echo "============================"

# Test HTTP
if curl -s --connect-timeout 5 http://localhost:80 >/dev/null 2>&1; then
    log "✅ HTTP server responding"
    HTTP_OK=true
else
    log "❌ HTTP server not responding"
    HTTP_OK=false
fi

# Test HTTPS
if [ "$SSL_SUCCESS" = true ]; then
    if curl -k -s --connect-timeout 5 https://localhost:443 >/dev/null 2>&1; then
        log "✅ HTTPS server responding"
        HTTPS_OK=true
    else
        log "❌ HTTPS server not responding"
        HTTPS_OK=false
    fi
else
    HTTPS_OK=false
fi

# Test domain access (if DNS is ready)
if [ "$DNS_READY" = true ]; then
    if curl -s --connect-timeout 10 http://clearhold.app >/dev/null 2>&1; then
        log "✅ Domain HTTP accessible"
        DOMAIN_HTTP_OK=true
    else
        log "⚠️ Domain HTTP not accessible"
        DOMAIN_HTTP_OK=false
    fi
    
    if [ "$SSL_SUCCESS" = true ]; then
        if curl -s --connect-timeout 10 https://clearhold.app >/dev/null 2>&1; then
            log "✅ Domain HTTPS accessible"
            DOMAIN_HTTPS_OK=true
        else
            log "⚠️ Domain HTTPS not accessible"
            DOMAIN_HTTPS_OK=false
        fi
    else
        DOMAIN_HTTPS_OK=false
    fi
fi

# Final Report
echo ""
log "🎯 SSL SETUP COMPLETION REPORT"
log "==============================="
echo "OpenSSL Version: $OPENSSL_VERSION"
echo "Certbot Ready: $([ "$CERTBOT_READY" = true ] && echo "✅ Yes" || echo "❌ No")"
echo "DNS Configuration: $([ "$DNS_READY" = true ] && echo "✅ Ready" || echo "⚠️ Needs attention")"
echo "Node.js App: $([ "$APP_RUNNING" = true ] && echo "✅ Running" || echo "⚠️ Not detected")"
echo "SSL Certificate: $([ "$SSL_SUCCESS" = true ] && echo "✅ Generated" || echo "❌ Failed")"
echo "HTTP Server: $([ "$HTTP_OK" = true ] && echo "✅ Working" || echo "❌ Failed")"
echo "HTTPS Server: $([ "$HTTPS_OK" = true ] && echo "✅ Working" || echo "❌ Not configured")"
echo "Auto-renewal: $([ "$RENEWAL_OK" = true ] && echo "✅ Configured" || echo "❌ Not configured")"

if [ "$DNS_READY" = true ]; then
    echo "Domain HTTP: $([ "$DOMAIN_HTTP_OK" = true ] && echo "✅ Accessible" || echo "⚠️ Issues")"
    echo "Domain HTTPS: $([ "$DOMAIN_HTTPS_OK" = true ] && echo "✅ Accessible" || echo "⚠️ Issues")"
fi

echo ""
if [ "$SSL_SUCCESS" = true ] && [ "$HTTP_OK" = true ] && [ "$HTTPS_OK" = true ]; then
    log "🎉 SUCCESS! SSL certificates are configured and working!"
    echo ""
    log "🌐 Your site is now accessible at:"
    echo "   • https://clearhold.app"
    echo "   • https://www.clearhold.app"
    echo ""
    log "🔒 SSL Certificate Details:"
    if [ -f "/etc/letsencrypt/live/clearhold.app/fullchain.pem" ]; then
        sudo openssl x509 -in /etc/letsencrypt/live/clearhold.app/fullchain.pem -text -noout | grep -E "(Subject:|Not After)" | head -2
    fi
    echo ""
    log "🔄 Auto-renewal: Certificate will renew automatically"
    
elif [ "$SSL_SUCCESS" = true ]; then
    log "✅ SSL certificate generated, but some issues detected"
    echo ""
    log "🔧 Next steps:"
    if [ "$HTTP_OK" = false ]; then
        echo "- Check nginx configuration and restart"
    fi
    if [ "$HTTPS_OK" = false ]; then
        echo "- Verify SSL certificate installation"
    fi
    
else
    log "❌ SSL certificate generation failed"
    echo ""
    log "🔧 Troubleshooting steps:"
    if [ "$DNS_READY" != true ]; then
        echo "1. Update DNS A record to point to: $CURRENT_IP"
        echo "2. Wait for DNS propagation (up to 48 hours)"
    fi
    if [ "$APP_RUNNING" != true ]; then
        echo "3. Start your Node.js application"
    fi
    echo "4. Check firewall and security group settings"
    echo "5. Run: ./validate-modern-ssl.sh for detailed diagnostics"
fi

echo ""
log "🏁 Modern SSL setup completed!"
echo ""
echo "📖 For validation and testing, run: ./validate-modern-ssl.sh" 