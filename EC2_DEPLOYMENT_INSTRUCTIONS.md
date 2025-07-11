# EC2 Deployment Instructions for AWS Secrets Manager

Since we cannot SSH directly with the available key, here are your options to deploy:

## Option 1: Use EC2 Instance Connect (Recommended)

1. **Go to AWS Console** → EC2 → Instances
2. **Select your instance** (i-0b25b44712540fc6b)
3. **Click "Connect"** → Choose "EC2 Instance Connect"
4. **Click "Connect"** to open a browser-based terminal

## Option 2: Use the correct SSH key

If you have the "CryptoZombies!01" key pair (.pem file), use:
```bash
ssh -i CryptoZombies\!01.pem ubuntu@44.203.60.217
```

## Once Connected to EC2

Run these commands in order:

### 1. Navigate to project directory
```bash
cd ~/personal-cryptoscrow-backend
```

### 2. Pull latest code
```bash
git pull origin main
```

### 3. Install dependencies
```bash
npm install
```

### 4. Test AWS Secrets Manager
```bash
export NODE_ENV=production
export USE_AWS_SECRETS=true
export AWS_REGION=us-east-1

node test-aws-secrets.js
```

### 5. If test passes, create PM2 ecosystem file
```bash
cat > ecosystem.production.js << 'EOF'
module.exports = {
  apps: [{
    name: 'cryptoescrow-backend',
    script: './src/server.js',
    instances: 1,
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
      USE_AWS_SECRETS: 'true',
      AWS_REGION: 'us-east-1'
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
    watch: false,
    max_memory_restart: '1G'
  }]
};
EOF
```

### 6. Backup and remove .env file
```bash
# Only if .env exists
if [ -f .env ]; then
    mv .env .env.backup.$(date +%Y%m%d_%H%M%S)
fi
```

### 7. Start with PM2
```bash
# Stop any existing processes
pm2 stop all
pm2 delete all

# Start the application
pm2 start ecosystem.production.js
pm2 save
pm2 startup systemd -u ubuntu --hp /home/ubuntu
```

### 8. Verify deployment
```bash
# Check PM2 status
pm2 status

# Check logs
pm2 logs cryptoescrow-backend

# Test the API
curl http://localhost:3000/api/health
```

## Troubleshooting

### If AWS Secrets Manager test fails:

1. **Check IAM role**:
```bash
curl -s http://169.254.169.254/latest/meta-data/iam/security-credentials/
```

2. **Test AWS credentials**:
```bash
aws sts get-caller-identity
```

3. **Test secret access**:
```bash
aws secretsmanager get-secret-value --secret-id "CryptoEscrow/App/Config" --region us-east-1
```

### If PM2 doesn't start:

1. **Check error logs**:
```bash
pm2 logs --err
cat logs/err.log
```

2. **Run directly to see errors**:
```bash
NODE_ENV=production USE_AWS_SECRETS=true AWS_REGION=us-east-1 node src/server.js
```

## Success Indicators

✅ PM2 shows the app as "online"
✅ API health check returns `{"status":"OK"}`
✅ No .env file in the directory
✅ Logs show "Configuration loaded from AWS Secrets Manager successfully"

## Security Notes

- The .env file should be deleted after confirming AWS Secrets Manager works
- Ensure the EC2 instance has the correct IAM role with `secretsmanager:GetSecretValue` permission
- The instance should be in a security group that allows inbound traffic on port 3000 (or use a load balancer)