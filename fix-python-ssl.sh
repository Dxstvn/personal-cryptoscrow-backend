#!/bin/bash

# Python SSL Fix for Let's Encrypt (Alternative to AWS ACM)
# Note: AWS Certificate Manager + ALB is still the recommended approach

echo "🔧 Attempting Python SSL Fix for Let's Encrypt"
echo "=============================================="
echo "⚠️  RECOMMENDATION: Use AWS Certificate Manager instead (see AWS_SSL_SOLUTION.md)"
echo ""

read -p "Continue with Let's Encrypt fix? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Exiting. Consider AWS Certificate Manager for easier SSL setup."
    exit 0
fi

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

# Method 1: Try Python 3.8+ from Amazon Linux Extras
log "🐍 Method 1: Installing Python 3.8+ from Amazon Linux Extras"

if sudo amazon-linux-extras list | grep -q python3.8; then
    log "Installing Python 3.8..."
    sudo amazon-linux-extras install -y python3.8
    
    # Set Python 3.8 as alternative
    sudo alternatives --install /usr/bin/python3 python3 /usr/bin/python3.8 2
    
    # Test Python SSL
    if python3 -c "import ssl; print('Python SSL:', ssl.OPENSSL_VERSION)" 2>/dev/null; then
        PYTHON_SSL_VERSION=$(python3 -c "import ssl; print(ssl.OPENSSL_VERSION)" 2>/dev/null)
        if echo "$PYTHON_SSL_VERSION" | grep -q "1.1\|3."; then
            log "✅ Python 3.8 has modern SSL support"
            PYTHON_FIXED=true
        else
            log "⚠️ Python 3.8 still using old SSL"
            PYTHON_FIXED=false
        fi
    else
        log "❌ Python 3.8 SSL test failed"
        PYTHON_FIXED=false
    fi
else
    log "⚠️ Python 3.8 not available in Amazon Linux Extras"
    PYTHON_FIXED=false
fi

# Method 2: Virtual Environment with specific Python build
if [ "$PYTHON_FIXED" != true ]; then
    log "🐍 Method 2: Creating isolated Python environment"
    
    # Install pyenv for Python version management
    if ! command -v pyenv >/dev/null 2>&1; then
        log "Installing pyenv..."
        curl https://pyenv.run | bash
        
        # Add to PATH
        export PYENV_ROOT="$HOME/.pyenv"
        export PATH="$PYENV_ROOT/bin:$PATH"
        eval "$(pyenv init -)"
        
        # Add to bashrc
        echo 'export PYENV_ROOT="$HOME/.pyenv"' >> ~/.bashrc
        echo 'export PATH="$PYENV_ROOT/bin:$PATH"' >> ~/.bashrc
        echo 'eval "$(pyenv init -)"' >> ~/.bashrc
    fi
    
    # Set environment variables for building Python with new OpenSSL
    export LDFLAGS="-L/usr/lib64/openssl11"
    export CPPFLAGS="-I/usr/include/openssl11"
    export PKG_CONFIG_PATH="/usr/lib64/pkgconfig/openssl11"
    
    # Install Python 3.9 with new OpenSSL
    log "Building Python 3.9 with modern OpenSSL (this may take 10-15 minutes)..."
    pyenv install 3.9.18
    
    if [ $? -eq 0 ]; then
        # Create virtual environment
        pyenv global 3.9.18
        python3 -m venv certbot_env
        source certbot_env/bin/activate
        
        # Test SSL in new environment
        if python -c "import ssl; print('SSL:', ssl.OPENSSL_VERSION)" | grep -q "1.1\|3."; then
            log "✅ Virtual environment has modern SSL"
            
            # Install certbot in virtual environment
            pip install --upgrade pip
            pip install certbot certbot-nginx
            
            # Create wrapper script
            cat > /tmp/certbot_wrapper.sh << 'EOF'
#!/bin/bash
source ~/certbot_env/bin/activate
exec certbot "$@"
EOF
            
            sudo mv /tmp/certbot_wrapper.sh /usr/local/bin/certbot
            sudo chmod +x /usr/local/bin/certbot
            
            PYTHON_FIXED=true
        else
            log "❌ Virtual environment still has SSL issues"
            PYTHON_FIXED=false
        fi
    else
        log "❌ Failed to build Python with new OpenSSL"
        PYTHON_FIXED=false
    fi
fi

# Method 3: Use certbot-auto (deprecated but might work)
if [ "$PYTHON_FIXED" != true ]; then
    log "🐍 Method 3: Using certbot-auto (legacy)"
    
    wget https://dl.eff.org/certbot-auto
    chmod a+x certbot-auto
    sudo mv certbot-auto /usr/local/bin/certbot
    
    # Test certbot-auto
    if /usr/local/bin/certbot --version >/dev/null 2>&1; then
        log "✅ certbot-auto working"
        PYTHON_FIXED=true
    else
        log "❌ certbot-auto failed"
        PYTHON_FIXED=false
    fi
fi

# Test final result
echo ""
log "🧪 Final Test Results"
echo "===================="

if [ "$PYTHON_FIXED" = true ]; then
    if certbot --version >/dev/null 2>&1; then
        CERTBOT_VERSION=$(certbot --version 2>&1 | head -1)
        log "✅ Certbot working: $CERTBOT_VERSION"
        
        echo ""
        log "🚀 Now you can generate SSL certificate:"
        echo "sudo systemctl stop nginx"
        echo "sudo certbot certonly --standalone -d clearhold.app -d www.clearhold.app"
        echo "sudo systemctl start nginx"
        echo ""
        echo "Then run: ./modern-ssl-setup.sh"
    else
        log "❌ Certbot still not working after all attempts"
        echo ""
        log "🎯 RECOMMENDATION: Switch to AWS Certificate Manager"
        echo "See AWS_SSL_SOLUTION.md for the easier approach"
    fi
else
    log "❌ All Python SSL fix attempts failed"
    echo ""
    log "🎯 STRONG RECOMMENDATION: Use AWS Certificate Manager"
    echo "The Python/OpenSSL compatibility issue on Amazon Linux 2 is complex."
    echo "AWS Certificate Manager will give you SSL in 15 minutes without these issues."
    echo ""
    echo "See AWS_SSL_SOLUTION.md for the recommended approach."
fi

log "🏁 Python SSL fix attempt completed!" 