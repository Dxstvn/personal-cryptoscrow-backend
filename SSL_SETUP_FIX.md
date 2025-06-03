# SSL Certificate Setup - OS Detection and Fix

## ⚠️ IMPORTANT: OpenSSL Compatibility Issue Fix

If you get an error like `urllib3 v2.0 only supports OpenSSL 1.1.1+, currently the 'ssl' module is compiled with 'OpenSSL 1.0.2k-fips'`, your system has an outdated OpenSSL version. Follow these steps:

### Quick Fix for Amazon Linux with Old OpenSSL

```bash
# Check your OpenSSL version
openssl version

# If you have OpenSSL 1.0.2k or older, use these commands:

# Method 1: Use Amazon Linux Extras (Recommended)
sudo amazon-linux-extras install -y epel
sudo yum install -y certbot python2-certbot-nginx

# Method 2: Install compatible certbot version
sudo pip3 uninstall -y certbot certbot-nginx urllib3
sudo pip3 install 'urllib3<2.0' 'certbot<2.0' 'certbot-nginx<2.0'

# Method 3: Add certbot to PATH and fix dependencies
echo 'export PATH="/usr/local/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
sudo pip3 install --upgrade 'urllib3<2.0'
```

### Verify Installation

```bash
# Add /usr/local/bin to PATH if needed
export PATH="/usr/local/bin:$PATH"

# Test certbot
/usr/local/bin/certbot --version
# or if PATH is updated:
certbot --version
```

## Step 1: Identify Your Operating System

Run this command on your EC2 instance to identify your OS:

```bash
cat /etc/os-release
```

Or alternatively:
```bash
uname -a && cat /etc/*release*
```

## Step 2: SSL Setup Based on Your OS

### For Amazon Linux 2 (Most common EC2 default)

```bash
# Update system
sudo yum update -y

# Install snapd
sudo yum install -y snapd
sudo systemctl enable --now snapd.socket
sudo ln -s /var/lib/snapd/snap /snap

# Install certbot
sudo snap install --classic certbot
sudo ln -s /snap/bin/certbot /usr/bin/certbot

# Alternative method for Amazon Linux 2 (if snap doesn't work)
sudo yum install -y python3-pip
sudo pip3 install certbot certbot-nginx
```

### For Amazon Linux 2023 (AL2023)

```bash
# Update system
sudo dnf update -y

# Install certbot directly
sudo dnf install -y certbot python3-certbot-nginx

# Or via snap
sudo dnf install -y snapd
sudo systemctl enable --now snapd.socket
sudo ln -s /var/lib/snapd/snap /snap
sudo snap install --classic certbot
sudo ln -s /snap/bin/certbot /usr/bin/certbot
```

### For CentOS/RHEL 7

```bash
# Update system
sudo yum update -y

# Enable EPEL repository
sudo yum install -y epel-release

# Install certbot
sudo yum install -y certbot python2-certbot-nginx
```

### For CentOS/RHEL 8/9

```bash
# Update system
sudo dnf update -y

# Enable EPEL repository
sudo dnf install -y epel-release

# Install certbot
sudo dnf install -y certbot python3-certbot-nginx
```

### For Ubuntu/Debian (Your original instructions)

```bash
# Update system
sudo apt update

# Install snapd
sudo apt install -y snapd

# Install certbot
sudo snap install --classic certbot
sudo ln -s /snap/bin/certbot /usr/bin/certbot
```

## Step 3: Install Nginx (if not already installed)

### Amazon Linux 2
```bash
sudo yum install -y nginx
sudo systemctl enable nginx
sudo systemctl start nginx
```

### Amazon Linux 2023
```bash
sudo dnf install -y nginx
sudo systemctl enable nginx
sudo systemctl start nginx
```

### Ubuntu/Debian
```bash
sudo apt install -y nginx
sudo systemctl enable nginx
sudo systemctl start nginx
```

## Step 4: Quick Detection Script

Run this script to automatically detect your OS and provide the right commands:

```bash
#!/bin/bash

# Detect OS
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

echo "Detected OS: $OS $VER"

# Provide appropriate commands
case $OS in
    "Amazon Linux"*)
        echo "Run these commands:"
        echo "sudo yum update -y"
        echo "sudo yum install -y nginx snapd"
        echo "sudo systemctl enable --now snapd.socket"
        echo "sudo ln -s /var/lib/snapd/snap /snap"
        echo "sudo snap install --classic certbot"
        echo "sudo ln -s /snap/bin/certbot /usr/bin/certbot"
        ;;
    "CentOS Linux"*|"Red Hat"*)
        if [[ $VER == 7* ]]; then
            echo "Run these commands:"
            echo "sudo yum update -y"
            echo "sudo yum install -y epel-release"
            echo "sudo yum install -y nginx certbot python2-certbot-nginx"
        else
            echo "Run these commands:"
            echo "sudo dnf update -y"
            echo "sudo dnf install -y epel-release"
            echo "sudo dnf install -y nginx certbot python3-certbot-nginx"
        fi
        ;;
    "Ubuntu"*|"Debian"*)
        echo "Run these commands:"
        echo "sudo apt update"
        echo "sudo apt install -y nginx snapd"
        echo "sudo snap install --classic certbot"
        echo "sudo ln -s /snap/bin/certbot /usr/bin/certbot"
        ;;
    *)
        echo "Unsupported OS. Please install certbot and nginx manually."
        ;;
esac
```

## Step 5: Verify Installation

After running the appropriate commands for your OS, verify certbot is installed:

```bash
certbot --version
nginx -v
```

## Step 6: Continue with SSL Setup

Once certbot is installed, you can proceed with the SSL certificate generation:

```bash
# Stop your Node.js app temporarily (if running)
sudo pkill -f node  # or sudo pm2 stop all

# Generate SSL certificate
sudo certbot --nginx -d clearhold.app -d www.clearhold.app

# Restart your Node.js app
# (restart however you normally start your app)
```

## Troubleshooting

### If snap doesn't work on Amazon Linux:
```bash
# Use pip method instead
sudo yum install -y python3-pip
sudo pip3 install certbot certbot-nginx
```

### If you get "command not found" for certbot after installation:
```bash
# Find where certbot was installed
which certbot
find /usr -name "certbot" 2>/dev/null

# Create symlink if needed
sudo ln -s /usr/local/bin/certbot /usr/bin/certbot
```

### Check if ports are open:
```bash
# Check if ports 80 and 443 are accessible
sudo netstat -tlnp | grep -E ':80|:443'
``` 