# AWS Secrets Manager Deployment Guide

## Summary of Changes

I've successfully integrated AWS Secrets Manager into your backend. Here's what was done:

### 1. **AWS Secrets Updated** ✅
- **Production Secrets:**
  - `CryptoEscrow/App/Config` - Application configuration
  - `CryptoEscrow/Blockchain/Keys` - Blockchain private keys
  - `CryptoEscrow/Firebase/ServiceAccount` - Firebase service account

- **Staging Secrets:**
  - `CryptoEscrow/Staging/Config` - Staging app configuration
  - `CryptoEscrow/Staging/Blockchain/Keys` - Staging blockchain keys
  - `CryptoEscrow/Staging/Firebase` - Staging Firebase service account

### 2. **Code Changes** ✅
- Created `src/services/awsSecretsManager.js` - AWS Secrets Manager client
- Created `src/config/index.js` - Centralized configuration system
- Updated Firebase initialization to use new config
- Updated all services to use config instead of process.env
- Added `USE_AWS_SECRETS` environment variable to enable/disable

### 3. **Local Testing** ✅
- Created `test-aws-secrets.js` script
- Successfully tested loading secrets without .env file
- Verified all configurations load correctly

## To Complete EC2 Deployment

### 1. Start your EC2 instance
```bash
aws ec2 start-instances --instance-ids i-0199331711137972e --region us-east-1
# Wait for instance to be running
aws ec2 wait instance-running --instance-ids i-0199331711137972e --region us-east-1
```

### 2. Get the public IP
```bash
aws ec2 describe-instances --instance-ids i-0199331711137972e \
  --query "Reservations[0].Instances[0].PublicIpAddress" \
  --output text --region us-east-1
```

### 3. SSH into the instance
```bash
ssh -i ClearHoldKeyPair.pem ubuntu@<EC2_PUBLIC_IP>
```

### 4. On the EC2 instance, run:
```bash
cd ~/personal-cryptoscrow-backend

# Pull latest code
git pull origin main

# Install dependencies
npm install

# Set environment variables
export NODE_ENV=production
export USE_AWS_SECRETS=true
export AWS_REGION=us-east-1

# Test AWS Secrets Manager
node test-aws-secrets.js

# If successful, deploy with PM2
./scripts/deploy-with-aws-secrets.sh
```

### 5. Verify the deployment
```bash
# Check PM2 status
pm2 status

# View logs
pm2 logs cryptoescrow-backend

# Test the API
curl http://localhost:3000/api/health
```

## Important Notes

1. **IAM Role Required**: Your EC2 instance must have an IAM role with these permissions:
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": [
           "secretsmanager:GetSecretValue",
           "secretsmanager:DescribeSecret"
         ],
         "Resource": "arn:aws:secretsmanager:us-east-1:*:secret:CryptoEscrow/*"
       }
     ]
   }
   ```

2. **Environment Variables**: Only these are needed in production:
   - `NODE_ENV=production`
   - `USE_AWS_SECRETS=true`
   - `AWS_REGION=us-east-1`
   - `PORT=3000` (optional)

3. **Deletion of .env**: After confirming everything works on EC2, you can safely delete the .env file.

## Rollback Plan

If you need to rollback to using .env files:
1. Set `USE_AWS_SECRETS=false`
2. Restore the .env file from backup
3. Restart the application

## Security Benefits

- ✅ No secrets stored in code or .env files
- ✅ Automatic secret rotation capability
- ✅ Audit trail for all secret access
- ✅ Fine-grained access control with IAM
- ✅ Encrypted at rest and in transit

## Next Steps

1. Start EC2 instance and complete deployment
2. Monitor application logs for any issues
3. Once confirmed working, delete local .env file
4. Consider setting up secret rotation for enhanced security