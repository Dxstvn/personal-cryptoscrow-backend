# Backend Troubleshooting Guide - Comprehensive Fix

## 🚨 Issues Identified

Based on the PM2 logs analysis, several critical issues were preventing the backend from running:

### 1. **Node.js 16 + Firebase Auth Compatibility Issue**
**Error**: `ReferenceError: fetch is not defined`
**Cause**: Firebase Auth requires `fetch` which is only natively available in Node.js 18+
**Impact**: Application crashes immediately on startup

### 2. **Missing Firebase Service Account Secret**
**Error**: `Failed to retrieve secret CryptoEscrow/Firebase/ServiceAccount: Secrets Manager can't find the specified secret`
**Cause**: The Firebase service account secret was never created in AWS Secrets Manager
**Impact**: Firebase Admin SDK cannot initialize, health checks fail

### 3. **Ineffective Fetch Polyfill**
**Error**: Polyfill loading after Firebase modules were already imported
**Cause**: Asynchronous polyfill loading with top-level await issues
**Impact**: Firebase Auth still fails even with polyfill present

### 4. **Missing Dependencies**
**Error**: Various module not found errors
**Cause**: Some dependencies were missing from package.json
**Impact**: Runtime errors when specific modules are imported

## 🔧 **SOLUTION: Run Comprehensive Fix Script**

### **Step 1: Upload and Run the Fix Script**

SSH to your EC2 instance and run:

```bash
# Navigate to your project directory
cd /home/ec2-user/cryptoescrow-backend

# Download the latest code with fixes
git pull origin main

# Make the fix script executable
chmod +x aws-deployment/comprehensive-backend-fix.sh

# Run the comprehensive fix
./aws-deployment/comprehensive-backend-fix.sh
```

### **Step 2: Set Up Firebase Service Account (If Needed)**

If you have Firebase service account credentials, run:

```bash
# Make the Firebase setup script executable
chmod +x aws-deployment/setup-firebase-secret-final.sh

# Run the Firebase secret setup
./aws-deployment/setup-firebase-secret-final.sh
```

Then follow the prompts to:
1. Paste your Firebase service account JSON, or
2. Provide the path to your JSON file, or
3. Enter values manually

## 📋 **What the Fix Script Does**

### 1. **Upgrades Node.js to 18.x**
- Detects current Node.js version
- Upgrades to Node.js 18.x if running 16.x
- Reinstalls PM2 with new Node.js version
- Ensures fetch is natively available

### 2. **Installs Missing Dependencies**
- `node-fetch@3.3.2` - For fetch polyfill
- `node-abort-controller` - For Firebase compatibility
- `firebase` - Client SDK if missing

### 3. **Creates ESM-Compatible PM2 Config**
- Replaces `ecosystem.config.cjs` with `ecosystem.config.mjs`
- Adds proper Node.js arguments for ESM
- Maintains all existing PM2 settings

### 4. **Sets Up Firebase Service Account Secret**
- Creates placeholder secret in AWS Secrets Manager
- Provides instructions for updating with real credentials
- Tests secret retrieval

### 5. **Updates Environment Configuration**
- Ensures `.env` file exists
- Adds missing Firebase project ID
- Verifies environment variables

### 6. **Restarts Services with New Configuration**
- Stops old PM2 processes
- Starts with new ESM configuration
- Verifies application startup

## 🔍 **Manual Verification Steps**

After running the fix script, verify everything is working:

### 1. **Check PM2 Status**
```bash
pm2 status
pm2 logs --lines 20
```

### 2. **Test Health Endpoint**
```bash
curl http://localhost:3000/health
```

### 3. **Verify Node.js Version**
```bash
node --version  # Should show 18.x
```

### 4. **Check Firebase Secret**
```bash
aws secretsmanager get-secret-value --secret-id "CryptoEscrow/Firebase/ServiceAccount" --region us-east-1
```

### 5. **Test External Access**
```bash
# Get your EC2 public IP
curl http://169.254.169.254/latest/meta-data/public-ipv4

# Test from external browser
# http://YOUR_EC2_IP:3000/health
```

## 🚀 **Expected Results After Fix**

### ✅ **Successful Startup Logs**
```
📦 Fetch polyfill loaded for Node.js compatibility
✅ AWS Secrets Manager integration successful
🔧 Production environment variables loaded
🚀 CryptoEscrow Backend server running on port 3000
Environment: production
```

### ✅ **Working Health Check**
```bash
$ curl http://localhost:3000/health
{"status":"OK"}
```

### ✅ **PM2 Online Status**
```bash
$ pm2 status
┌─────┬──────────────────────┬─────────┬─────────┬─────────┬──────────┬────────┬──────┬───────────┬──────────┬──────────┬──────────┬──────────┐
│ id  │ name                 │ mode    │ ↺      │ status   │ cpu      │ memory   │ user │ watching  │ uptime   │          │          │          │
├─────┼──────────────────────┼─────────┼─────────┼─────────┼──────────┼────────┼──────┼───────────┼──────────┼──────────┼──────────┼──────────┤
│ 0   │ cryptoescrow-backend │ fork    │ 0       │ online   │ 0%       │ 50.0mb   │ ec2… │ disabled  │ 5m       │          │          │          │
└─────┴──────────────────────┴─────────┴─────────┴─────────┴──────────┴────────┴──────┴───────────┴──────────┴──────────┴──────────┴──────────┘
```

## 🛠️ **Ecosystem.config.cjs vs ESM Analysis**

### **Original Issue**: 
The `ecosystem.config.cjs` file wasn't directly causing crashes, but it's not optimal for an ESM project.

### **Solution**:
The fix script creates `ecosystem.config.mjs` with:
- Native ESM export syntax
- Proper Node.js arguments for ESM
- Better integration with ES modules

### **Comparison**:

**Before (CJS)**:
```javascript
module.exports = {
  apps: [{
    script: 'src/server.js',
    // ...
  }]
};
```

**After (ESM)**:
```javascript
export default {
  apps: [{
    script: 'src/server.js',
    node_args: '--experimental-specifier-resolution=node',
    // ...
  }]
};
```

## 🔄 **If Issues Persist**

### 1. **Check Specific Error Messages**
```bash
pm2 logs --lines 50 | grep -i error
```

### 2. **Verify Firebase Credentials**
```bash
# Update with real Firebase service account
aws secretsmanager update-secret \
  --secret-id "CryptoEscrow/Firebase/ServiceAccount" \
  --secret-string "$(cat path/to/your/firebase-service-account.json)" \
  --region us-east-1
```

### 3. **Check Environment Variables**
```bash
cat .env | grep FIREBASE
```

### 4. **Restart with Debug Logs**
```bash
pm2 delete all
NODE_ENV=production DEBUG=* pm2 start ecosystem.config.mjs --env production
```

## 📞 **Getting Help**

If the fix script doesn't resolve all issues:

1. **Gather Diagnostic Information**:
   ```bash
   echo "Node.js: $(node --version)"
   echo "NPM: $(npm --version)"
   echo "PM2: $(pm2 --version)"
   pm2 status
   pm2 logs --lines 30
   ```

2. **Check AWS Secrets**:
   ```bash
   aws secretsmanager list-secrets --region us-east-1 | grep CryptoEscrow
   ```

3. **Verify Network Connectivity**:
   ```bash
   curl -I http://localhost:3000
   netstat -tlnp | grep :3000
   ```

---

**🎉 After running the comprehensive fix script, your CryptoEscrow backend should be fully operational with Node.js 18, proper Firebase integration, and ESM compatibility!** 