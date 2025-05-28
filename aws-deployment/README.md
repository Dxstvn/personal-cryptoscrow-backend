# AWS EC2 Deployment Guide for CryptoEscrow Backend

This guide will help you deploy your NestJS backend to AWS EC2 with AWS Secrets Manager integration for secure private key management.

## 📋 Prerequisites

Before starting, ensure you have:

1. **AWS Account** with appropriate permissions
2. **AWS CLI** installed and configured
3. **EC2 Key Pair** created in your target region
4. **Domain name** (optional but recommended for production)
5. **Git repository** with your backend code

## 🏗️ Infrastructure Setup

### 1. Create AWS Infrastructure with CloudFormation

```bash
# Navigate to deployment directory
cd aws-deployment

# Deploy the CloudFormation stack
aws cloudformation create-stack \
  --stack-name cryptoescrow-infrastructure \
  --template-body file://cloudformation.yaml \
  --parameters ParameterKey=KeyPairName,ParameterValue=your-key-pair-name \
               ParameterKey=InstanceType,ParameterValue=t3.small \
               ParameterKey=AllowedSSHCIDR,ParameterValue=YOUR_IP/32 \
  --capabilities CAPABILITY_NAMED_IAM \
  --region us-east-1

# Wait for stack creation to complete
aws cloudformation wait stack-create-complete \
  --stack-name cryptoescrow-infrastructure \
  --region us-east-1
```

### 2. Get Stack Outputs

```bash
# Get the public IP and DNS name of your EC2 instance
aws cloudformation describe-stacks \
  --stack-name cryptoescrow-infrastructure \
  --query 'Stacks[0].Outputs' \
  --region us-east-1
```

## 🔐 Configure AWS Secrets Manager

### 1. Update Application Secrets

```bash
# Update application configuration secrets
aws secretsmanager update-secret \
  --secret-id "CryptoEscrow/App/Config" \
  --secret-string '{
    "JWT_SECRET": "your-32-character-jwt-secret-key-here",
    "ENCRYPTION_KEY": "your-32-character-encryption-key-here", 
    "DATABASE_ENCRYPTION_KEY": "your-32-character-db-encryption-key",
    "SMTP_HOST": "smtp.gmail.com",
    "SMTP_PORT": "587",
    "SMTP_USER": "your-email@gmail.com",
    "SMTP_PASS": "your-app-specific-password",
    "INFURA_API_KEY": "your-infura-api-key",
    "ALCHEMY_API_KEY": "your-alchemy-api-key"
  }' \
  --region us-east-1

# Update blockchain private keys
aws secretsmanager update-secret \
  --secret-id "CryptoEscrow/Blockchain/Keys" \
  --secret-string '{
    "DEPLOYER_PRIVATE_KEY": "your-deployer-private-key-without-0x",
    "BACKEND_WALLET_PRIVATE_KEY": "your-backend-wallet-private-key-without-0x"
  }' \
  --region us-east-1
```

### 2. Verify Secrets

```bash
# Verify secrets are stored correctly
aws secretsmanager get-secret-value \
  --secret-id "CryptoEscrow/App/Config" \
  --region us-east-1

aws secretsmanager get-secret-value \
  --secret-id "CryptoEscrow/Blockchain/Keys" \
  --region us-east-1
```

## 🚀 Application Deployment

### 1. Connect to EC2 Instance

```bash
# SSH into your EC2 instance
ssh -i path/to/your-key-pair.pem ec2-user@YOUR_EC2_PUBLIC_IP
```

### 2. Install Dependencies (First Time Only)

The CloudFormation template handles most of the setup, but you may need to install additional dependencies:

```bash
# Install AWS SDK dependencies
npm install @aws-sdk/client-secrets-manager
```

### 3. Deploy Application

```bash
# Upload and run the deployment script
scp -i path/to/your-key-pair.pem aws-deployment/deploy.sh ec2-user@YOUR_EC2_PUBLIC_IP:/home/ec2-user/
ssh -i path/to/your-key-pair.pem ec2-user@YOUR_EC2_PUBLIC_IP

# On the EC2 instance, run the deployment script
chmod +x deploy.sh
./deploy.sh
```

### 4. Configure Environment Variables

```bash
# Create production environment file
cp aws-deployment/env.production.template .env

# Edit the .env file with your specific configuration
nano .env
```

Update the following values in your `.env` file:
- `FRONTEND_URL`: Your frontend domain
- `FIREBASE_PROJECT_ID`: Your Firebase project ID
- `FIREBASE_*`: Other Firebase configuration values
- `RPC_URL`: Your blockchain RPC endpoint
- `ALLOWED_EMAILS`: Comma-separated list of allowed admin emails

### 5. Start the Application

```bash
# Start with PM2
pm2 start ecosystem.config.js --env production

# Save PM2 configuration
pm2 save

# Set up PM2 to start on boot
pm2 startup
```

## 🌐 Configure Nginx and SSL

### 1. Set Up Nginx

```bash
# Install and configure Nginx
sudo cp aws-deployment/nginx.conf /etc/nginx/nginx.conf

# Update server_name in nginx.conf with your domain
sudo nano /etc/nginx/nginx.conf

# Test Nginx configuration
sudo nginx -t

# Start and enable Nginx
sudo systemctl start nginx
sudo systemctl enable nginx
```

### 2. Set Up SSL with Let's Encrypt

```bash
# Install Certbot
sudo yum install -y certbot python3-certbot-nginx

# Obtain SSL certificate
sudo certbot --nginx -d your-domain.com -d www.your-domain.com

# Test automatic renewal
sudo certbot renew --dry-run
```

## 🔧 Configuration Files

### Key Files Created:

1. **`cloudformation.yaml`**: AWS infrastructure as code
2. **`ecosystem.config.js`**: PM2 configuration for process management
3. **`src/config/awsSecretsManager.js`**: AWS Secrets Manager integration
4. **`aws-deployment/nginx.conf`**: Nginx reverse proxy configuration
5. **`aws-deployment/deploy.sh`**: Automated deployment script

## 📊 Monitoring and Logs

### View Application Logs

```bash
# PM2 logs
pm2 logs cryptoescrow-backend

# View specific log files
tail -f logs/out.log
tail -f logs/err.log

# Nginx logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

### Monitor Application Status

```bash
# PM2 status
pm2 status
pm2 monit

# System resources
htop
free -h
df -h
```

## 🚦 Health Checks

Your application will be available at:

- **HTTP**: `http://YOUR_EC2_PUBLIC_IP:3000/health`
- **HTTPS**: `https://your-domain.com/health` (after SSL setup)

## 🔄 Updates and Maintenance

### Deploy Updates

```bash
# SSH to your EC2 instance
ssh -i path/to/your-key-pair.pem ec2-user@YOUR_EC2_PUBLIC_IP

# Navigate to app directory
cd /home/ec2-user/app

# Pull latest changes
git pull origin main

# Install any new dependencies
npm install --production

# Reload application
pm2 reload ecosystem.config.js --env production
```

### Update Secrets

```bash
# Update secrets in AWS Secrets Manager
aws secretsmanager update-secret \
  --secret-id "CryptoEscrow/App/Config" \
  --secret-string '{"KEY": "NEW_VALUE"}' \
  --region us-east-1

# Restart application to pick up new secrets
pm2 restart cryptoescrow-backend
```

## 🛡️ Security Best Practices

1. **Restrict SSH Access**: Update the `AllowedSSHCIDR` parameter to your specific IP
2. **Use IAM Roles**: The EC2 instance uses IAM roles instead of storing AWS credentials
3. **Rotate Secrets**: Regularly rotate your private keys and API keys
4. **Monitor Access**: Use CloudTrail to monitor access to your secrets
5. **Keep Updated**: Regularly update your system and dependencies

## 🆘 Troubleshooting

### Common Issues:

1. **Application won't start**:
   ```bash
   # Check logs
   pm2 logs cryptoescrow-backend
   
   # Check if secrets are accessible
   aws secretsmanager get-secret-value --secret-id "CryptoEscrow/App/Config"
   ```

2. **Can't access from frontend**:
   - Check Security Group rules in AWS Console
   - Verify CORS settings in your application
   - Check nginx configuration

3. **SSL issues**:
   ```bash
   # Check nginx configuration
   sudo nginx -t
   
   # Renew SSL certificate
   sudo certbot renew
   ```

## 💰 Cost Optimization

- **Instance Type**: Start with `t3.micro` for testing, scale up as needed
- **Reserved Instances**: Consider reserved instances for production
- **Auto Scaling**: Implement auto scaling for high availability
- **Monitoring**: Use CloudWatch to monitor resource usage

## 🔗 Frontend Integration

Your frontend can now communicate with your backend using:

- **Development**: `http://YOUR_EC2_PUBLIC_IP:3000`
- **Production**: `https://your-domain.com`

Update your frontend's API base URL to point to your deployed backend.

## 📝 Next Steps

1. Set up monitoring with CloudWatch
2. Configure automated backups
3. Implement CI/CD pipeline
4. Set up staging environment
5. Configure auto-scaling groups for high availability

---

**🎉 Congratulations!** Your CryptoEscrow backend is now deployed on AWS EC2 with secure private key management through AWS Secrets Manager! 