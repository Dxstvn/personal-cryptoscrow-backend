#!/bin/bash

# Domain Setup Deployment Script for clearhold.app
# This script helps deploy the domain configuration changes

echo "🚀 Starting domain setup deployment for clearhold.app..."

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Detect OS and set package manager
detect_os() {
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        OS=$NAME
        VER=$VERSION_ID
    elif type lsb_release >/dev/null 2>&1; then
        OS=$(lsb_release -si)
        VER=$(lsb_release -sr)
    else
        OS=$(uname -s)
        VER=$(uname -r)
    fi
    
    echo "🔍 Detected OS: $OS $VER"
    
    case $OS in
        "Amazon Linux"*)
            if [[ $VER == 2023* ]]; then
                PKG_MANAGER="dnf"
            else
                PKG_MANAGER="yum"
            fi
            ;;
        "CentOS Linux"*|"Red Hat"*)
            if [[ $VER == 7* ]]; then
                PKG_MANAGER="yum"
            else
                PKG_MANAGER="dnf"
            fi
            ;;
        "Ubuntu"*|"Debian"*)
            PKG_MANAGER="apt"
            ;;
        *)
            echo "❌ Unsupported OS: $OS"
            echo "Please install nginx and certbot manually."
            exit 1
            ;;
    esac
    
    echo "📦 Using package manager: $PKG_MANAGER"
}

# Update system packages
update_system() {
    echo "📦 Updating system packages..."
    case $PKG_MANAGER in
        "apt")
            sudo apt update -y
            ;;
        "yum")
            sudo yum update -y
            ;;
        "dnf")
            sudo dnf update -y
            ;;
    esac
}

# Install nginx
install_nginx() {
    if ! command_exists nginx; then
        echo "🔧 Installing nginx..."
        case $PKG_MANAGER in
            "apt")
                sudo apt install -y nginx
                ;;
            "yum")
                sudo yum install -y nginx
                ;;
            "dnf")
                sudo dnf install -y nginx
                ;;
        esac
        
        # Enable and start nginx
        sudo systemctl enable nginx
        sudo systemctl start nginx
    else
        echo "✅ nginx is already installed"
    fi
}

# Install certbot
install_certbot() {
    if ! command_exists certbot; then
        echo "🔧 Installing certbot..."
        case $PKG_MANAGER in
            "apt")
                sudo apt install -y snapd
                sudo snap install --classic certbot
                sudo ln -sf /snap/bin/certbot /usr/bin/certbot
                ;;
            "yum")
                if [[ $OS == *"Amazon Linux"* ]]; then
                    # Try snap first, fallback to pip
                    sudo yum install -y snapd
                    sudo systemctl enable --now snapd.socket
                    sudo ln -sf /var/lib/snapd/snap /snap
                    sleep 5  # Wait for snapd to initialize
                    if sudo snap install --classic certbot 2>/dev/null; then
                        sudo ln -sf /snap/bin/certbot /usr/bin/certbot
                    else
                        echo "⚠️ Snap failed, using pip method..."
                        sudo yum install -y python3-pip
                        sudo pip3 install certbot certbot-nginx
                    fi
                else
                    # CentOS/RHEL 7
                    sudo yum install -y epel-release
                    sudo yum install -y certbot python2-certbot-nginx
                fi
                ;;
            "dnf")
                if [[ $OS == *"Amazon Linux"* ]]; then
                    # Amazon Linux 2023
                    sudo dnf install -y certbot python3-certbot-nginx
                else
                    # CentOS/RHEL 8+
                    sudo dnf install -y epel-release
                    sudo dnf install -y certbot python3-certbot-nginx
                fi
                ;;
        esac
    else
        echo "✅ certbot is already installed"
    fi
}

# Main execution
detect_os
update_system
install_nginx
install_certbot

# Backup existing Nginx config if it exists
if [ -f /etc/nginx/sites-available/clearhold.app ]; then
    echo "📋 Backing up existing Nginx config..."
    sudo cp /etc/nginx/sites-available/clearhold.app /etc/nginx/sites-available/clearhold.app.backup.$(date +%Y%m%d_%H%M%S)
fi

# Create nginx directory structure if it doesn't exist (for non-Debian systems)
if [ ! -d /etc/nginx/sites-available ]; then
    echo "📁 Creating nginx sites directories..."
    sudo mkdir -p /etc/nginx/sites-available
    sudo mkdir -p /etc/nginx/sites-enabled
    
    # Add include to main nginx.conf if not present
    if ! grep -q "sites-enabled" /etc/nginx/nginx.conf; then
        echo "🔧 Adding sites-enabled to nginx.conf..."
        sudo sed -i '/http {/a\    include /etc/nginx/sites-enabled/*;' /etc/nginx/nginx.conf
    fi
fi

# Create Nginx configuration
echo "⚙️ Creating Nginx configuration..."
sudo tee /etc/nginx/sites-available/clearhold.app > /dev/null <<EOF
server {
    listen 80;
    server_name clearhold.app www.clearhold.app;

    # Temporary configuration for Let's Encrypt
    location /.well-known/acme-challenge/ {
        root /var/www/html;
        allow all;
    }

    # Redirect everything else to Node.js app for now
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF

# Enable the site
echo "🔗 Enabling Nginx site..."
sudo ln -sf /etc/nginx/sites-available/clearhold.app /etc/nginx/sites-enabled/

# Remove default site if it exists
sudo rm -f /etc/nginx/sites-enabled/default

# Test Nginx configuration
echo "🧪 Testing Nginx configuration..."
if sudo nginx -t; then
    echo "✅ Nginx configuration is valid"
    sudo systemctl reload nginx
else
    echo "❌ Nginx configuration error"
    exit 1
fi

# Check if Node.js app is running
echo "🔍 Checking if Node.js app is running on port 3000..."
if netstat -tln 2>/dev/null | grep -q ":3000 " || ss -tln 2>/dev/null | grep -q ":3000 "; then
    echo "✅ Node.js app is running on port 3000"
else
    echo "⚠️ Node.js app doesn't appear to be running on port 3000"
    echo "   Make sure to start your app with: npm start or pm2 start"
fi

# Verify certbot installation
echo "🔍 Verifying certbot installation..."
if command_exists certbot; then
    echo "✅ certbot version: $(certbot --version)"
else
    echo "❌ certbot installation failed"
    echo "Please check SSL_SETUP_FIX.md for manual installation steps"
fi

# Instructions for SSL setup
echo ""
echo "🔒 SSL Certificate Setup Instructions:"
echo "1. Make sure your DNS records are pointing to this server"
echo "2. Wait for DNS propagation (can take up to 48 hours)"
echo "3. Run: sudo certbot --nginx -d clearhold.app -d www.clearhold.app"
echo ""

# Test DNS resolution
echo "🌐 Testing DNS resolution..."
if command_exists dig; then
    CURRENT_IP=$(dig +short myip.opendns.com @resolver1.opendns.com 2>/dev/null)
    DOMAIN_IP=$(dig +short clearhold.app 2>/dev/null)
    echo "Current server IP: $CURRENT_IP"
    echo "Domain resolves to: $DOMAIN_IP"
    
    if [ "$CURRENT_IP" = "$DOMAIN_IP" ] && [ -n "$CURRENT_IP" ]; then
        echo "✅ DNS is correctly configured!"
        echo "🚀 You can now run: sudo certbot --nginx -d clearhold.app -d www.clearhold.app"
    else
        echo "⚠️ DNS not yet propagated or incorrectly configured"
        echo "   Update your DNS A record to point to: $CURRENT_IP"
    fi
else
    echo "⚠️ dig not available for DNS testing"
fi

# Frontend setup instructions
echo ""
echo "📱 Frontend Setup Instructions:"
echo "1. Create frontend/.env.local with:"
echo "   NEXT_PUBLIC_API_URL=https://clearhold.app"
echo "2. Build and deploy your frontend"
echo ""

# Security group reminder
echo "🔐 Security Group Reminder:"
echo "Make sure your EC2 security group allows:"
echo "- Port 80 (HTTP)"
echo "- Port 443 (HTTPS)"
echo "- Port 3000 (Node.js - optional, for direct access)"
echo ""

echo "✅ Domain setup deployment completed!"
echo "📖 For detailed instructions, see DOMAIN_SETUP_INSTRUCTIONS.md"
echo "🔧 For SSL troubleshooting, see SSL_SETUP_FIX.md" 