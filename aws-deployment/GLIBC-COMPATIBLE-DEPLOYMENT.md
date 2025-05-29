# GLIBC-Compatible AWS Deployment Guide

This guide provides a robust solution for deploying the CryptoEscrow backend on AWS EC2 without GLIBC compatibility issues.

## 🚨 Problem Overview

The original deployment encountered GLIBC compatibility issues:
```
node: /lib64/libm.so.6: version `GLIBC_2.27' not found (required by node)
node: /lib64/libc.so.6: version `GLIBC_2.28' not found (required by node)
```

This happens when Node.js versions require newer GLIBC than what's available on Amazon Linux 2023.

## ✅ Solution Overview

This fixed deployment approach:

1. **Uses Amazon Linux 2023's native package manager** (`dnf`) for Node.js installation
2. **Provides fallback to Node.js 16** (better GLIBC compatibility) if needed
3. **Includes comprehensive error handling** and recovery mechanisms
4. **Updated AMI mappings** for latest Amazon Linux 2023 versions

## 🚀 Quick Fix for Existing Deployment

If you already have a problematic deployment, run this fix script:

```bash
# SSH to your existing instance
ssh -i your-key.pem ec2-user@YOUR_IP

# Download and run the GLIBC fix script
wget https://raw.githubusercontent.com/YOUR_REPO/main/aws-deployment/fix-glibc-node-compatibility.sh
chmod +x fix-glibc-node-compatibility.sh
./fix-glibc-node-compatibility.sh
```

## 🏗️ New Infrastructure Deployment

### 1. Deploy GLIBC-Compatible Infrastructure

```bash
# Deploy the fixed CloudFormation stack
aws cloudformation create-stack \
  --stack-name cryptoescrow-glibc-fixed \
  --template-body file://cloudformation-glibc-fixed.yaml \
  --parameters ParameterKey=KeyPairName,ParameterValue=YOUR_KEY_PAIR \
               ParameterKey=InstanceType,ParameterValue=t3.small \
               ParameterKey=AllowedSSHCIDR,ParameterValue=YOUR_IP/32 \
  --capabilities CAPABILITY_NAMED_IAM \
  --region us-east-1

# Wait for completion
aws cloudformation wait stack-create-complete \
  --stack-name cryptoescrow-glibc-fixed \
  --region us-east-1

# Get outputs
aws cloudformation describe-stacks \
  --stack-name cryptoescrow-glibc-fixed \
  --query 'Stacks[0].Outputs' \
  --region us-east-1
```

### 2. Complete Deployment on Instance

```bash
# SSH to the new instance
ssh -i your-key.pem ec2-user@NEW_INSTANCE_IP

# Run the automated deployment script created during instance launch
./complete-deployment.sh

# Check status
pm2 status
curl http://localhost:3000/health
```

## 🔧 Technical Details

### Node.js Installation Strategy

1. **Primary Method**: Use `dnf install nodejs npm`
   - Most compatible with Amazon Linux 2023
   - Automatically handles GLIBC dependencies

2. **Fallback Method**: Pre-compiled Node.js 16 binary
   - Better compatibility with older GLIBC versions
   - Installed to `/opt/nodejs` with proper PATH setup

### AMI Updates

The fixed CloudFormation template uses the latest Amazon Linux 2023 AMIs:

| Region | AMI ID |
|--------|--------|
| us-east-1 | ami-0e2c8caa4b6378d8c |
| us-east-2 | ami-036841078a4b68e14 |
| us-west-1 | ami-0d5ae5525eb033d0a |
| us-west-2 | ami-0c94855ba95b798c7 |

### Package Manager Changes

- **Before**: Used NodeSource repository (`setup_18.x`)
- **After**: Uses Amazon Linux's native `dnf` package manager
- **Benefits**: Better system integration and compatibility

## 📊 Troubleshooting

### Check System Information

```bash
# Check OS version
cat /etc/os-release

# Check GLIBC version
ldd --version

# Check Node.js installation
node --version
npm --version
which node
```

### Common Issues and Solutions

#### 1. Node.js Still Fails After Fix

```bash
# Remove all Node.js installations
sudo dnf remove -y nodejs npm
rm -rf ~/.nvm
sudo rm -rf /opt/nodejs

# Run the fix script again
./fix-glibc-node-compatibility.sh
```

#### 2. PM2 Process Errors

```bash
# Complete PM2 reset
pm2 delete all
pm2 kill
cd /home/ec2-user/cryptoescrow-backend
pm2 start ecosystem.config.cjs --env production
```

#### 3. Missing Dependencies

```bash
# Clean reinstall
rm -rf node_modules package-lock.json
npm install --production

# Install specific missing packages
npm install node-fetch@3.3.2 @aws-sdk/client-secrets-manager
```

## 🎯 Verification Checklist

After deployment, verify:

- [ ] Node.js version shows correctly: `node --version`
- [ ] No GLIBC errors in output
- [ ] PM2 shows "online" status: `pm2 status`
- [ ] Health endpoint responds: `curl http://localhost:3000/health`
- [ ] Application logs show no errors: `pm2 logs`
- [ ] AWS Secrets Manager accessible: Test with `aws secretsmanager get-secret-value --secret-id "CryptoEscrow/App/Config"`

## 🔄 Migration from Problematic Deployment

If you have an existing problematic deployment:

1. **Backup your configuration**:
   ```bash
   # Backup your .env file
   scp -i your-key.pem ec2-user@OLD_IP:/home/ec2-user/cryptoescrow-backend/.env ./backup.env
   ```

2. **Deploy new fixed infrastructure**:
   ```bash
   # Use the cloudformation-glibc-fixed.yaml template
   ```

3. **Restore configuration**:
   ```bash
   # Copy your backed up .env to the new instance
   scp -i your-key.pem ./backup.env ec2-user@NEW_IP:/home/ec2-user/cryptoescrow-backend/.env
   ```

## 📈 Performance Optimization

The fixed deployment includes:

- **Optimized instance size**: t3.small default (better for Node.js)
- **CloudWatch logging**: Automatic log aggregation
- **Log rotation**: PM2 log rotation to prevent disk space issues
- **Health monitoring**: Built-in health check endpoints

## 🛡️ Security Improvements

- **Latest AMI**: Updated to latest Amazon Linux 2023 AMIs
- **CloudWatch integration**: Enhanced logging and monitoring
- **Proper IAM roles**: Fine-grained permissions for Secrets Manager

## 📞 Support

If you encounter issues:

1. Check the troubleshooting section above
2. Review CloudWatch logs in AWS Console
3. Run the diagnostic commands in the verification checklist
4. Use the fix script for common issues

---

**🎉 Success!** Your CryptoEscrow backend should now be running without GLIBC compatibility issues! 