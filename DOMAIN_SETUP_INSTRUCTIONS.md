# Domain Setup and SSL Configuration Guide

## Overview
This guide will help you configure your `clearhold.app` domain to work with your AWS EC2 backend and resolve CORS issues.

## Step 1: DNS Configuration

### In your Domain Management Panel (Namecheap):

1. **Delete existing records:**
   - Remove the CNAME record pointing to `parkingpage.namecheap.com`
   - Remove the URL redirect record

2. **Add A Record for root domain:**
   - **Type**: A Record
   - **Host**: `@` (root domain)
   - **Value**: `YOUR_EC2_PUBLIC_IP` (replace with your actual EC2 IP)
   - **TTL**: 300

3. **Add CNAME Record for www:**
   - **Type**: CNAME Record
   - **Host**: `www`
   - **Value**: `clearhold.app`
   - **TTL**: 300

4. **Optional - Add API subdomain:**
   - **Type**: A Record
   - **Host**: `api`
   - **Value**: `YOUR_EC2_PUBLIC_IP`
   - **TTL**: 300

## Step 2: SSL Certificate Setup (Recommended)

### Option A: Using Let's Encrypt (Free - Recommended)

SSH into your EC2 instance and run:

```bash
# Install Certbot
sudo apt update
sudo apt install snapd
sudo snap install --classic certbot

# Create symbolic link
sudo ln -s /snap/bin/certbot /usr/bin/certbot

# Install SSL certificate for your domain
sudo certbot certonly --standalone --preferred-challenges http -d clearhold.app -d www.clearhold.app

# Note: Make sure to stop your Node.js app temporarily during certificate generation
sudo systemctl stop your-app-name  # Replace with your actual service name

# After certificate is generated, restart your app
sudo systemctl start your-app-name
```

### Option B: Manual SSL Certificate

If you prefer to use a purchased SSL certificate, place the files in:
- Certificate: `/etc/ssl/certs/clearhold.app.crt`
- Private Key: `/etc/ssl/private/clearhold.app.key`

## Step 3: Update Backend to Handle HTTPS

Add SSL configuration to your server if using HTTPS:

```javascript
// Add to your server.js file
import https from 'https';
import fs from 'fs';

// SSL Configuration (only in production with valid certificates)
if (process.env.NODE_ENV === 'production' && process.env.SSL_CERT_PATH) {
  const sslOptions = {
    cert: fs.readFileSync(process.env.SSL_CERT_PATH),
    key: fs.readFileSync(process.env.SSL_KEY_PATH)
  };
  
  const httpsServer = https.createServer(sslOptions, app);
  httpsServer.listen(443, () => {
    console.log('🔒 HTTPS Server running on port 443');
  });
}
```

## Step 4: Nginx Reverse Proxy Setup (Recommended)

Create an Nginx configuration for better SSL handling and performance:

```bash
# Install Nginx
sudo apt install nginx

# Create Nginx configuration
sudo nano /etc/nginx/sites-available/clearhold.app
```

Add this configuration:

```nginx
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
```

Enable the site:

```bash
# Enable the site
sudo ln -s /etc/nginx/sites-available/clearhold.app /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# Restart Nginx
sudo systemctl restart nginx
```

## Step 5: EC2 Security Group Configuration

Make sure your EC2 security group allows:
- **HTTP (Port 80)**: For Let's Encrypt and HTTP redirect
- **HTTPS (Port 443)**: For secure connections
- **Custom Port 3000**: For direct Node.js access (if needed)

## Step 6: Frontend Deployment

### For Development:
Create a `.env.local` file in your frontend directory:

```env
NEXT_PUBLIC_API_URL=http://localhost:3000
```

### For Production:
```env
NEXT_PUBLIC_API_URL=https://clearhold.app
```

## Step 7: Testing the Setup

1. **Test DNS Resolution:**
   ```bash
   nslookup clearhold.app
   dig clearhold.app
   ```

2. **Test Backend API:**
   ```bash
   curl https://clearhold.app/health
   ```

3. **Test CORS:**
   ```bash
   curl -H "Origin: https://clearhold.app" -H "Access-Control-Request-Method: POST" -X OPTIONS https://clearhold.app/auth/signup
   ```

## Step 8: SSL Certificate Auto-Renewal

Set up automatic renewal for Let's Encrypt:

```bash
# Test renewal
sudo certbot renew --dry-run

# Add to crontab for automatic renewal
sudo crontab -e

# Add this line:
0 12 * * * /usr/bin/certbot renew --quiet
```

## Troubleshooting

### CORS Issues:
1. Check that your domain is in the CORS allowedOrigins list
2. Verify the frontend is making requests to the correct URL
3. Check browser developer tools for CORS error details

### SSL Issues:
1. Verify certificate files exist and have correct permissions
2. Check Nginx error logs: `sudo tail -f /var/log/nginx/error.log`
3. Test SSL configuration: `openssl s_client -connect clearhold.app:443`

### DNS Issues:
1. DNS propagation can take up to 48 hours
2. Use online DNS propagation checkers
3. Try flushing your local DNS cache

## Security Checklist

- [ ] SSL certificate installed and configured
- [ ] CORS properly configured with specific origins
- [ ] Security headers enabled
- [ ] Rate limiting configured
- [ ] Firewall rules properly set
- [ ] Regular security updates scheduled

## Maintenance

- Monitor SSL certificate expiration
- Regular security updates
- Monitor application logs
- Backup database regularly
- Monitor domain expiration 