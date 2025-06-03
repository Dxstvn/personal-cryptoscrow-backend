#!/bin/bash

# Comprehensive System Upgrade for SSL/Certbot Compatibility
# This script updates Amazon Linux 2 selectively to support modern SSL certificates

echo "🔧 System Upgrade for SSL/Certbot Compatibility"
echo "================================================"
echo "Domain: clearhold.app"
echo "Strategy: Selective updates with multiple fallback options"
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

# Function to backup important configs
backup_configs() {
    local backup_dir="ssl_upgrade_backup_$(date +%Y%m%d_%H%M%S)"
    mkdir -p "$backup_dir"
    
    log "📋 Creating backup in $backup_dir..."
    
    # Backup package list
    rpm -qa > "$backup_dir/packages_before.txt"
    
    # Backup any existing configs
    [ -d /etc/nginx ] && cp -r /etc/nginx "$backup_dir/" 2>/dev/null
    [ -f /etc/hosts ] && cp /etc/hosts "$backup_dir/"
    
    # Backup Node.js app status
    if pgrep -f "node" > /dev/null; then
        echo "Node.js app was running" > "$backup_dir/app_status.txt"
        ps aux | grep node >> "$backup_dir/app_status.txt"
    fi
    
    echo "$backup_dir" > /tmp/ssl_backup_location
    log "✅ Backup created at: $backup_dir"
}

# Function to test Node.js app
test_nodejs_app() {
    log "🔍 Testing Node.js application..."
    
    if curl -s http://localhost:3000/health >/dev/null 2>&1; then
        log "✅ Node.js app health check passed"
        return 0
    elif curl -s http://localhost:3000 >/dev/null 2>&1; then
        log "✅ Node.js app responding on port 3000"
        return 0
    elif netstat -tln 2>/dev/null | grep -q ":3000 " || ss -tln 2>/dev/null | grep -q ":3000 "; then
        log "✅ Node.js app listening on port 3000"
        return 0
    else
        log "⚠️ Node.js app not detected - please ensure it's running"
        return 1
    fi
}

# Phase 1: Assessment and Backup
log "📋 Phase 1: System Assessment and Backup"
echo "=========================================="

backup_configs

log "🔍 Current system information:"
echo "OS: $(cat /etc/os-release | grep PRETTY_NAME | cut -d'"' -f2)"
echo "OpenSSL: $(openssl version)"
echo "Python: $(python3 --version 2>/dev/null || echo 'Not found')"
echo "Node.js: $(node --version 2>/dev/null || echo 'Not found')"
echo ""

test_nodejs_app
APP_WORKING=$?

# Phase 2: System Updates
log "📦 Phase 2: Selective System Updates"
echo "====================================="

log "🔄 Updating system packages..."
sudo yum update -y
check_status "System package updates"

log "🔍 Checking Amazon Linux Extras..."
sudo amazon-linux-extras list | head -10

# Try to enable newer OpenSSL if available
log "🔧 Attempting to install newer OpenSSL..."
if sudo amazon-linux-extras install -y epel 2>/dev/null; then
    log "✅ EPEL repository enabled"
else
    log "⚠️ EPEL already enabled or not available"
fi

# Install essential tools
log "🛠️ Installing essential tools..."
sudo yum install -y curl wget dig nginx
check_status "Essential tools installation"

# Phase 3: Modern Certbot Installation (Multiple Methods)
log "🔒 Phase 3: Modern SSL Certificate Solution"
echo "==========================================="

SSL_METHOD=""

# Method 1: Try Snap-based Certbot
log "🚀 Method 1: Trying Snap-based Certbot..."
if command -v snapd >/dev/null 2>&1 || sudo yum install -y snapd; then
    sudo systemctl enable --now snapd.socket 2>/dev/null
    sudo ln -sf /var/lib/snapd/snap /snap 2>/dev/null
    
    # Wait a moment for snapd to initialize
    sleep 3
    
    if sudo snap install --classic certbot 2>/dev/null; then
        sudo ln -sf /snap/bin/certbot /usr/bin/certbot
        if /usr/bin/certbot --version >/dev/null 2>&1; then
            log "✅ Snap certbot installed and working!"
            SSL_METHOD="snap"
            CERTBOT_CMD="/usr/bin/certbot"
        fi
    fi
fi

# Method 2: Try acme.sh (Lightweight alternative)
if [ -z "$SSL_METHOD" ]; then
    log "🚀 Method 2: Installing acme.sh (lightweight ACME client)..."
    
    if curl https://get.acme.sh | sh -s email=admin@clearhold.app; then
        source ~/.bashrc
        if ~/.acme.sh/acme.sh --version >/dev/null 2>&1; then
            log "✅ acme.sh installed and working!"
            SSL_METHOD="acme.sh"
        fi
    fi
fi

# Method 3: Try newer pip-based certbot with virtual environment
if [ -z "$SSL_METHOD" ]; then
    log "🚀 Method 3: Trying certbot in Python virtual environment..."
    
    sudo yum install -y python3-venv
    
    if python3 -m venv /opt/certbot-venv; then
        source /opt/certbot-venv/bin/activate
        pip install --upgrade pip
        pip install 'certbot' 'certbot-nginx'
        
        if /opt/certbot-venv/bin/certbot --version >/dev/null 2>&1; then
            sudo ln -sf /opt/certbot-venv/bin/certbot /usr/local/bin/certbot
            log "✅ Virtual environment certbot working!"
            SSL_METHOD="venv"
            CERTBOT_CMD="/usr/local/bin/certbot"
        fi
        deactivate
    fi
fi

# Method 4: Manual certificate approach
if [ -z "$SSL_METHOD" ]; then
    log "🚀 Method 4: Setting up for manual certificate management..."
    SSL_METHOD="manual"
    log "⚠️ Will set up for manual SSL certificate installation"
fi

# Phase 4: Nginx Configuration
log "🌐 Phase 4: Web Server Configuration"
echo "===================================="

log "🔧 Configuring nginx..."

# Create nginx directories
sudo mkdir -p /etc/nginx/sites-available /etc/nginx/sites-enabled /var/www/html

# Add sites-enabled to main config if needed
if ! grep -q "sites-enabled" /etc/nginx/nginx.conf; then
    sudo sed -i '/http {/a\    include /etc/nginx/sites-enabled/*;' /etc/nginx/nginx.conf
fi

# Create basic nginx config for clearhold.app
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
sudo ln -sf /etc/nginx/sites-available/clearhold.app /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# Test nginx config
if sudo nginx -t; then
    sudo systemctl enable nginx
    sudo systemctl start nginx
    log "✅ Nginx configured and started"
else
    log "❌ Nginx configuration error"
fi

# Phase 5: SSL Certificate Generation
log "🔒 Phase 5: SSL Certificate Generation"
echo "======================================"

case $SSL_METHOD in
    "snap"|"venv")
        log "🚀 Generating SSL certificate with certbot..."
        sudo systemctl stop nginx
        
        if sudo $CERTBOT_CMD certonly --standalone --preferred-challenges http \
           -d clearhold.app -d www.clearhold.app \
           --agree-tos --non-interactive --email admin@clearhold.app; then
            
            log "✅ SSL certificate generated successfully!"
            
            # Update nginx config with SSL
            sudo tee /etc/nginx/sites-available/clearhold.app > /dev/null <<'EOF'
server {
    listen 80;
    server_name clearhold.app www.clearhold.app;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name clearhold.app www.clearhold.app;

    ssl_certificate /etc/letsencrypt/live/clearhold.app/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/clearhold.app/privkey.pem;
    
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

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
            
            if sudo nginx -t; then
                sudo systemctl start nginx
                
                # Set up auto-renewal
                (sudo crontab -l 2>/dev/null; echo "0 12 * * * $CERTBOT_CMD renew --quiet") | sudo crontab -
                
                SSL_SUCCESS=true
            fi
        fi
        ;;
        
    "acme.sh")
        log "🚀 Generating SSL certificate with acme.sh..."
        sudo systemctl stop nginx
        
        if ~/.acme.sh/acme.sh --issue -d clearhold.app -d www.clearhold.app --standalone; then
            # Install certificates to standard location
            sudo mkdir -p /etc/ssl/certs /etc/ssl/private
            
            if ~/.acme.sh/acme.sh --install-cert -d clearhold.app \
               --cert-file /etc/ssl/certs/clearhold.app.pem \
               --key-file /etc/ssl/private/clearhold.app.key \
               --fullchain-file /etc/ssl/certs/clearhold.app.fullchain.pem; then
                
                log "✅ SSL certificate generated with acme.sh!"
                
                # Update nginx config for acme.sh certificates
                sudo tee /etc/nginx/sites-available/clearhold.app > /dev/null <<'EOF'
server {
    listen 80;
    server_name clearhold.app www.clearhold.app;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name clearhold.app www.clearhold.app;

    ssl_certificate /etc/ssl/certs/clearhold.app.fullchain.pem;
    ssl_certificate_key /etc/ssl/private/clearhold.app.key;
    
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

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
                
                if sudo nginx -t; then
                    sudo systemctl start nginx
                    SSL_SUCCESS=true
                fi
            fi
        fi
        ;;
        
    "manual")
        log "⚠️ Manual certificate setup required"
        sudo systemctl start nginx
        SSL_SUCCESS=false
        ;;
esac

# Phase 6: Validation
log "🧪 Phase 6: System Validation"
echo "=============================="

log "🔍 Testing Node.js application after upgrade..."
test_nodejs_app
APP_WORKING_AFTER=$?

log "🔍 Testing web server..."
if curl -s http://localhost:80 >/dev/null 2>&1; then
    log "✅ HTTP server responding"
    HTTP_OK=true
else
    log "⚠️ HTTP server not responding"
    HTTP_OK=false
fi

if [ "$SSL_SUCCESS" = true ]; then
    if curl -k -s https://localhost:443 >/dev/null 2>&1; then
        log "✅ HTTPS server responding"
        HTTPS_OK=true
    else
        log "⚠️ HTTPS server not responding"
        HTTPS_OK=false
    fi
fi

# Final Report
echo ""
log "🎯 UPGRADE COMPLETION REPORT"
log "============================"
echo "SSL Method Used: $SSL_METHOD"
echo "Node.js App Before: $([ $APP_WORKING -eq 0 ] && echo "✅ Working" || echo "⚠️ Issues")"
echo "Node.js App After: $([ $APP_WORKING_AFTER -eq 0 ] && echo "✅ Working" || echo "⚠️ Issues")"
echo "HTTP Server: $([ "$HTTP_OK" = true ] && echo "✅ Working" || echo "❌ Failed")"
echo "HTTPS Server: $([ "$HTTPS_OK" = true ] && echo "✅ Working" || echo "❌ Not configured")"
echo "SSL Certificate: $([ "$SSL_SUCCESS" = true ] && echo "✅ Installed" || echo "❌ Not installed")"

BACKUP_DIR=$(cat /tmp/ssl_backup_location 2>/dev/null)
echo "Backup Location: ${BACKUP_DIR:-"Not created"}"

echo ""
if [ "$SSL_SUCCESS" = true ] && [ $APP_WORKING_AFTER -eq 0 ]; then
    log "🎉 SUCCESS! Your system is now SSL-ready!"
    log "🌐 Your site should be accessible at: https://clearhold.app"
    log "🔒 SSL certificate will auto-renew"
else
    log "⚠️ Partial success - some manual steps may be needed"
    
    if [ $APP_WORKING_AFTER -ne 0 ]; then
        log "❗ Node.js app needs attention"
    fi
    
    if [ "$SSL_SUCCESS" != true ]; then
        log "❗ SSL certificate needs manual setup"
        log "📋 For manual SSL setup, see: DOMAIN_SETUP_INSTRUCTIONS.md"
    fi
fi

log "🏁 System upgrade completed!" 