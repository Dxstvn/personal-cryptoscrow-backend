#!/bin/bash

# Final Fix for Certbot SSL Setup on Amazon Linux 2
# This script cleans up conflicting installations and sets up SSL for clearhold.app

echo "🔧 Final Certbot SSL Fix for clearhold.app"
echo "=============================================="

# Function to log with timestamp
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

log "Starting certbot cleanup and SSL setup..."

# Step 1: Clean up conflicting pip3 certbot installations
log "🧹 Cleaning up conflicting pip3 certbot installations..."
sudo pip3 uninstall -y certbot certbot-nginx acme urllib3 2>/dev/null || true
sudo pip3 uninstall -y certbot certbot-nginx acme urllib3 2>/dev/null || true  # Run twice to be sure

# Remove pip3 certbot binary if it exists
sudo rm -f /usr/local/bin/certbot 2>/dev/null || true

# Step 2: Verify system certbot installation
log "🔍 Checking system certbot installation..."
if rpm -q certbot >/dev/null 2>&1; then
    log "✅ System certbot is installed: $(rpm -q certbot)"
else
    log "❌ System certbot not found, installing..."
    sudo yum install -y certbot python2-certbot-nginx
fi

# Step 3: Create symlink to system certbot
log "🔗 Setting up system certbot..."
sudo ln -sf /usr/bin/certbot /usr/local/bin/certbot 2>/dev/null || true

# Step 4: Test system certbot
log "🧪 Testing system certbot..."
if /usr/bin/certbot --version 2>/dev/null; then
    log "✅ System certbot is working!"
    CERTBOT_CMD="/usr/bin/certbot"
else
    log "❌ System certbot test failed"
    exit 1
fi

# Step 5: Install and configure nginx if not present
log "🔧 Setting up nginx..."
if ! command -v nginx >/dev/null 2>&1; then
    sudo yum install -y nginx
fi

sudo systemctl enable nginx
sudo systemctl start nginx

# Step 6: Create nginx directories if they don't exist
if [ ! -d /etc/nginx/sites-available ]; then
    log "📁 Creating nginx sites directories..."
    sudo mkdir -p /etc/nginx/sites-available
    sudo mkdir -p /etc/nginx/sites-enabled
    
    # Add include to main nginx.conf if not present
    if ! grep -q "sites-enabled" /etc/nginx/nginx.conf; then
        log "🔧 Adding sites-enabled to nginx.conf..."
        sudo sed -i '/http {/a\    include /etc/nginx/sites-enabled/*;' /etc/nginx/nginx.conf
    fi
fi

# Step 7: Create nginx configuration for clearhold.app
log "⚙️ Creating nginx configuration for clearhold.app..."
sudo tee /etc/nginx/sites-available/clearhold.app > /dev/null <<'EOF'
server {
    listen 80;
    server_name clearhold.app www.clearhold.app;

    # Allow Let's Encrypt challenges
    location /.well-known/acme-challenge/ {
        root /var/www/html;
        allow all;
    }

    # Proxy everything else to Node.js app
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

# Step 8: Enable the site
log "🔗 Enabling nginx site..."
sudo ln -sf /etc/nginx/sites-available/clearhold.app /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# Create web root directory
sudo mkdir -p /var/www/html
sudo chown nginx:nginx /var/www/html

# Test and reload nginx
if sudo nginx -t; then
    log "✅ Nginx configuration is valid"
    sudo systemctl reload nginx
else
    log "❌ Nginx configuration error"
    exit 1
fi

# Step 9: Check DNS resolution
log "🌐 Checking DNS resolution..."
CURRENT_IP=$(curl -s http://checkip.amazonaws.com/ 2>/dev/null || curl -s http://whatismyip.org 2>/dev/null || echo "Unable to detect")
log "Current server IP: $CURRENT_IP"

if command -v dig >/dev/null 2>&1; then
    DOMAIN_IP=$(dig +short clearhold.app 2>/dev/null || echo "DNS lookup failed")
    log "clearhold.app resolves to: $DOMAIN_IP"
    
    if [ "$CURRENT_IP" = "$DOMAIN_IP" ] && [ -n "$CURRENT_IP" ] && [ "$CURRENT_IP" != "Unable to detect" ]; then
        DNS_READY=true
        log "✅ DNS is correctly configured!"
    else
        DNS_READY=false
        log "⚠️ DNS not yet propagated or incorrectly configured"
        log "   Update your DNS A record to point to: $CURRENT_IP"
    fi
else
    DNS_READY=false
    log "⚠️ dig not available for DNS testing"
fi

# Step 10: Check if Node.js app is running
log "🔍 Checking Node.js application..."
if netstat -tln 2>/dev/null | grep -q ":3000 " || ss -tln 2>/dev/null | grep -q ":3000 "; then
    log "✅ Node.js app is running on port 3000"
    APP_RUNNING=true
else
    log "⚠️ Node.js app doesn't appear to be running on port 3000"
    log "   You may need to start your app before getting SSL certificate"
    APP_RUNNING=false
fi

# Step 11: SSL Certificate Generation
log "🔒 SSL Certificate Setup..."

if [ "$DNS_READY" = true ]; then
    log "🚀 DNS is ready, attempting SSL certificate generation..."
    
    # Stop any conflicting services temporarily
    sudo systemctl stop nginx 2>/dev/null || true
    
    # Generate SSL certificate using standalone mode (more reliable)
    if sudo $CERTBOT_CMD certonly --standalone --preferred-challenges http -d clearhold.app -d www.clearhold.app --agree-tos --non-interactive --email admin@clearhold.app; then
        log "✅ SSL certificate generated successfully!"
        
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
    
    # SSL Settings
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

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
        
        # Test and restart nginx
        if sudo nginx -t; then
            sudo systemctl start nginx
            log "✅ Nginx restarted with SSL configuration"
        else
            log "❌ SSL nginx configuration error"
            sudo systemctl start nginx  # Start with old config
        fi
        
        # Set up auto-renewal
        log "🔄 Setting up SSL certificate auto-renewal..."
        (sudo crontab -l 2>/dev/null; echo "0 12 * * * $CERTBOT_CMD renew --quiet") | sudo crontab -
        
        SSL_SUCCESS=true
    else
        log "❌ SSL certificate generation failed"
        sudo systemctl start nginx  # Restart nginx anyway
        SSL_SUCCESS=false
    fi
else
    log "⚠️ Skipping SSL certificate generation - DNS not ready"
    log "   Run this command manually when DNS is ready:"
    log "   sudo $CERTBOT_CMD certonly --standalone --preferred-challenges http -d clearhold.app -d www.clearhold.app --agree-tos --non-interactive --email admin@clearhold.app"
    SSL_SUCCESS=false
fi

# Final status report
echo ""
log "🎯 FINAL STATUS REPORT"
log "======================"
log "System: Amazon Linux 2"
log "OpenSSL: $(openssl version)"
log "Certbot: $($CERTBOT_CMD --version 2>/dev/null || echo 'Error')"
log "Nginx: $(nginx -v 2>&1 || echo 'Error')"
log "Current IP: $CURRENT_IP"
log "DNS Ready: $DNS_READY"
log "App Running: $APP_RUNNING"
log "SSL Success: ${SSL_SUCCESS:-false}"

echo ""
if [ "$SSL_SUCCESS" = true ]; then
    log "🎉 SUCCESS! Your SSL certificate is installed and working."
    log "🌐 Your site should now be accessible at: https://clearhold.app"
    log "🔒 Certificate will auto-renew via cron job"
else
    log "⚠️ SSL certificate not installed yet."
    if [ "$DNS_READY" != true ]; then
        log "📋 Next steps:"
        log "1. Update your DNS A record to point to: $CURRENT_IP"
        log "2. Wait for DNS propagation (up to 48 hours)"
        log "3. Re-run this script or run the manual certbot command shown above"
    fi
    if [ "$APP_RUNNING" != true ]; then
        log "4. Make sure your Node.js app is running on port 3000"
    fi
fi

echo ""
log "📖 For detailed documentation, see:"
log "   - DOMAIN_SETUP_INSTRUCTIONS.md"
log "   - SSL_SETUP_FIX.md"

log "�� Script completed!" 