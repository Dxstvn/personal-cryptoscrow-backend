# 🚀 Production Deployment Checklist

## ⚠️ CRITICAL: Read This Before Any Production Deployment

This checklist ensures your CryptoEscrow backend runs in proper production mode and doesn't accidentally use test configurations.

## 📋 Pre-Deployment Checklist

### ✅ Environment Configuration
- [ ] **NODE_ENV is set to `production`** in your deployment environment
- [ ] **AWS_REGION is set** (e.g., `us-east-1`)
- [ ] **USE_AWS_SECRETS is set to `true`**
- [ ] **FIREBASE_PROJECT_ID points to your production Firebase project** (NOT `demo-test`)
- [ ] **NO emulator environment variables are set:**
  - [ ] `FIRESTORE_EMULATOR_HOST` is NOT set
  - [ ] `FIREBASE_AUTH_EMULATOR_HOST` is NOT set
  - [ ] `FIREBASE_STORAGE_EMULATOR_HOST` is NOT set

### ✅ Security Validation
- [ ] **NO test private keys in environment variables:**
  - [ ] NOT using `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80`
  - [ ] NOT using `0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d`
- [ ] **Firebase service account stored in AWS Secrets Manager** (not in files)
- [ ] **Backend wallet private key stored in AWS Secrets Manager**
- [ ] **All blockchain RPC URLs point to production networks** (not localhost:8545)

### ✅ AWS Configuration
- [ ] **AWS Secrets Manager secrets created for:**
  - [ ] `CryptoEscrow/Production/FirebaseServiceAccount`
  - [ ] `CryptoEscrow/Production/BackendWallet`
  - [ ] `CryptoEscrow/Production/BlockchainConfig`
- [ ] **EC2 instance has proper IAM role** to access secrets
- [ ] **AWS CLI configured** on deployment server

### ✅ Firebase Configuration
- [ ] **Production Firebase project created**
- [ ] **Firestore security rules deployed**
- [ ] **Firebase Storage rules deployed**
- [ ] **Authentication providers configured**

## 🛠️ Deployment Commands

### Step 1: Validate Environment
```bash
# Run validation script
npm run validate:production
```

### Step 2: Deploy to Production
```bash
# Option A: AWS EC2 Deployment
chmod +x aws-deployment/deploy.sh
./aws-deployment/deploy.sh

# Option B: Manual Deployment
NODE_ENV=production npm start
```

### Step 3: Post-Deployment Verification
```bash
# Check health endpoint
curl https://your-domain.com/health

# Verify environment mode
curl https://your-domain.com/api/health | grep -i environment

# Check logs for production mode confirmation
pm2 logs cryptoescrow-backend | grep "production"
```

## 🚨 Emergency: If Test Mode Detected in Production

If you discover the application is running in test mode in production:

1. **IMMEDIATELY stop the application:**
   ```bash
   pm2 stop cryptoescrow-backend
   ```

2. **Check environment variables:**
   ```bash
   env | grep NODE_ENV
   cat .env | grep NODE_ENV
   ```

3. **Fix the issue and redeploy:**
   ```bash
   export NODE_ENV=production
   npm run validate:production
   pm2 restart cryptoescrow-backend
   ```

## 🔍 How to Verify Production Mode

### Application Logs Should Show:
```
✅ Environment validation passed - running in production mode
✅ Firebase Project: your-production-project-id
✅ AWS Region: us-east-1
✅ Using AWS Secrets Manager for credentials
Using Production configuration for Admin SDK with AWS Secrets Manager
```

### Application Should NOT Show:
```
🧪 Setting up TEST MODE configuration...
🧪 Admin SDK connecting to emulators
Using Test configuration for Admin SDK with emulators
```

## 📞 Support

If you encounter issues:
1. Check application logs: `pm2 logs cryptoescrow-backend`
2. Run validation: `npm run validate:production`
3. Verify AWS credentials: `aws sts get-caller-identity`
4. Check Firebase project: `firebase projects:list`

## 🔒 Security Notes

- **Never commit production credentials to git**
- **Always use AWS Secrets Manager in production**
- **Regularly rotate credentials**
- **Monitor application logs for security issues**
- **Set up CloudWatch monitoring for production**