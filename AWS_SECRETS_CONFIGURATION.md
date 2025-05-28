# 🔐 AWS Secrets Manager Configuration Guide

Your CryptoEscrow backend is properly integrated with AWS Secrets Manager! This guide will help you configure your secrets with actual values.

## ✅ Current Status

- ✅ AWS Secrets Manager integration is working
- ✅ Both secret stores are accessible (`CryptoEscrow/App/Config` & `CryptoEscrow/Blockchain/Keys`)
- ✅ Your backend will automatically load secrets in production
- ✅ Local development continues to use `.env` files

## 🚀 Quick Configuration

### Option 1: Automated Configuration (Recommended)

Use the provided script to configure all secrets interactively:

```bash
cd aws-deployment
./secrets-manager-setup.sh configure
```

This script will:
- Generate secure random keys for JWT and encryption
- Prompt you for your specific secrets (email, API keys, private keys)
- Backup current secrets before updating
- Update both secret stores in AWS
- Test the integration

### Option 2: Manual Configuration

#### 1. Update Application Secrets

```bash
aws secretsmanager update-secret \
  --secret-id "CryptoEscrow/App/Config" \
  --secret-string '{
    "JWT_SECRET": "your-32-character-jwt-secret-here",
    "ENCRYPTION_KEY": "your-32-character-encryption-key-here",
    "DATABASE_ENCRYPTION_KEY": "your-32-character-db-encryption-key-here",
    "SMTP_HOST": "smtp.gmail.com",
    "SMTP_PORT": "587",
    "SMTP_USER": "your-email@gmail.com",
    "SMTP_PASS": "your-gmail-app-password",
    "INFURA_API_KEY": "your-infura-api-key",
    "ALCHEMY_API_KEY": "your-alchemy-api-key"
  }' \
  --region us-east-1
```

#### 2. Update Blockchain Secrets

```bash
aws secretsmanager update-secret \
  --secret-id "CryptoEscrow/Blockchain/Keys" \
  --secret-string '{
    "DEPLOYER_PRIVATE_KEY": "your-deployer-private-key-without-0x",
    "BACKEND_WALLET_PRIVATE_KEY": "your-backend-wallet-private-key-without-0x"
  }' \
  --region us-east-1
```

## 🔑 Required Secrets

### Application Secrets (`CryptoEscrow/App/Config`)

| Secret | Description | How to Get |
|--------|-------------|------------|
| `JWT_SECRET` | 32+ character random string for JWT signing | Generate: `openssl rand -hex 32` |
| `ENCRYPTION_KEY` | 32+ character key for data encryption | Generate: `openssl rand -hex 32` |
| `DATABASE_ENCRYPTION_KEY` | 32+ character key for database encryption | Generate: `openssl rand -hex 32` |
| `SMTP_HOST` | Email server host | Usually `smtp.gmail.com` |
| `SMTP_PORT` | Email server port | Usually `587` |
| `SMTP_USER` | Your email address | Your Gmail address |
| `SMTP_PASS` | Email password | Gmail App Password (not your regular password) |
| `INFURA_API_KEY` | Infura API key for blockchain access | Get from [infura.io](https://infura.io) |
| `ALCHEMY_API_KEY` | Alchemy API key (optional) | Get from [alchemy.com](https://alchemy.com) |

### Blockchain Secrets (`CryptoEscrow/Blockchain/Keys`)

| Secret | Description | How to Get |
|--------|-------------|------------|
| `DEPLOYER_PRIVATE_KEY` | Private key for deploying smart contracts | Your wallet's private key (without 0x prefix) |
| `BACKEND_WALLET_PRIVATE_KEY` | Private key for backend blockchain operations | Different wallet's private key (without 0x prefix) |

## 🛡️ Security Best Practices

### 1. Generate Secure Keys

```bash
# Generate JWT secret
openssl rand -hex 32

# Generate encryption key
openssl rand -hex 32

# Generate database encryption key
openssl rand -hex 32
```

### 2. Gmail App Password Setup

1. Enable 2-Factor Authentication on your Gmail account
2. Go to Gmail Settings → Security → 2-Step Verification
3. Generate an App Password specifically for this application
4. Use the app password, not your regular Gmail password

### 3. Infura API Key Setup

1. Sign up at [infura.io](https://infura.io)
2. Create a new project
3. Copy the Project ID (this is your API key)
4. Use the Sepolia endpoint for testing: `https://sepolia.infura.io/v3/YOUR_API_KEY`

### 4. Private Key Security

⚠️ **CRITICAL SECURITY WARNINGS:**
- Never commit private keys to version control
- Use separate wallets for deployer and backend operations
- Keep private keys in AWS Secrets Manager only
- Regularly rotate your private keys
- Monitor wallet balances for unauthorized transactions

## 🧪 Testing Your Configuration

### Test AWS Secrets Manager Integration

```bash
cd aws-deployment
./secrets-manager-setup.sh test
```

### Test Your Backend Locally with AWS Secrets

```bash
# Set environment to use AWS secrets
export NODE_ENV=production
export USE_AWS_SECRETS=true

# Start your backend
npm start
```

## 📝 Environment Variables Summary

### Public Configuration (in `production.env`)
- `NODE_ENV=production`
- `USE_AWS_SECRETS=true`
- `AWS_REGION=us-east-1`
- `FRONTEND_URL` - Your frontend domain
- `FIREBASE_*` - Firebase configuration
- `RPC_URL` - Blockchain RPC endpoints
- `ALLOWED_EMAILS` - Admin email addresses

### Secret Configuration (in AWS Secrets Manager)
- All sensitive keys, passwords, and private keys
- Automatically loaded when `USE_AWS_SECRETS=true`
- Cached for 5 minutes to improve performance
- Fallback to environment variables in development

## 🔄 Updating Secrets

### Update Individual Secrets

```bash
# Update just the JWT secret
aws secretsmanager update-secret \
  --secret-id "CryptoEscrow/App/Config" \
  --secret-string "$(aws secretsmanager get-secret-value --secret-id "CryptoEscrow/App/Config" --query SecretString --output text | jq '. + {"JWT_SECRET": "new-jwt-secret"}')" \
  --region us-east-1
```

### Backup Before Changes

```bash
cd aws-deployment
./secrets-manager-setup.sh backup
```

## 🚨 Troubleshooting

### Common Issues

1. **"Cannot access secrets"**
   - Check AWS credentials: `aws sts get-caller-identity`
   - Verify region: should be `us-east-1`
   - Check IAM permissions for Secrets Manager

2. **"Secrets not loading in production"**
   - Ensure `USE_AWS_SECRETS=true` in production
   - Check EC2 IAM role has Secrets Manager permissions
   - Verify secret names match exactly

3. **"Backend fails to start"**
   - Check logs for specific error messages
   - Verify all required secrets are present
   - Test secrets access with the test script

### Debug Commands

```bash
# Check if secrets exist
aws secretsmanager describe-secret --secret-id "CryptoEscrow/App/Config"
aws secretsmanager describe-secret --secret-id "CryptoEscrow/Blockchain/Keys"

# View secret structure (without values)
cd aws-deployment && ./secrets-manager-setup.sh structure

# Test integration
cd aws-deployment && ./secrets-manager-setup.sh test
```

## 🎯 Next Steps

1. **Configure your secrets** using the automated script or manual commands
2. **Test the integration** to ensure everything works
3. **Deploy to EC2** following the deployment guide
4. **Monitor your application** logs for any secret-related issues
5. **Set up secret rotation** for enhanced security

## 📞 Support

If you encounter issues:
1. Run the test script to identify problems
2. Check the troubleshooting section
3. Review AWS CloudWatch logs
4. Verify IAM permissions and secret names

---

**🔒 Remember: Keep your secrets secret! Never share private keys or API keys publicly.** 