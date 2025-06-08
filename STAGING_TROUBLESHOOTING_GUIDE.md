# 🔧 Staging Environment Troubleshooting Guide

## **🚨 Root Cause Analysis**

Based on your diagnostic output and e2e test results, I've identified the exact issues:

### **1. Private Key Format Issue** ⚡ **CRITICAL**
**Problem**: When you copy/paste from Firebase JSON, the `\n` characters are literal strings, not actual newlines.

**What you copied**:
```json
"private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG..."
```

**What Firebase needs**:
```
-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG...
-----END PRIVATE KEY-----
```

### **2. PM2 Process Mismatch** 🔧 **HIGH**
- Your staging process is named `ecosystem.staging` in PM2
- Scripts expect `cryptoescrow-backend-staging`
- This means it wasn't started with the correct ecosystem file

### **3. Port 3001 Conflict** 🚧 **MEDIUM**
- E2E tests failed because port 3001 was in use
- But staging process isn't working
- Something else is using the port

---

## **🚀 Automated Solution**

### **Run the Complete Fix Script**:
```bash
./fix-staging-private-key.sh
```

**This script will**:
- ✅ Kill any process using port 3001
- ✅ Clean up PM2 processes 
- ✅ Fix private key format in AWS Secrets Manager
- ✅ Verify the fix
- ✅ Start staging with correct configuration
- ✅ Test health endpoint

---

## **🛠️ Manual Solution (If Automated Script Fails)**

### **Step 1: Fix Private Key in AWS Secrets Manager**

#### **Option A: Replace `\n` with actual newlines**
1. Get current secret:
```bash
aws secretsmanager get-secret-value --secret-id "CryptoEscrow/Staging/Firebase" --region us-east-1 --query "SecretString" --output text > temp_secret.json
```

2. Edit `temp_secret.json` and replace all `\n` with actual line breaks:
```bash
# Replace \n with actual newlines
sed -i 's/\\n/\n/g' temp_secret.json
```

3. Update the secret:
```bash
aws secretsmanager update-secret --secret-id "CryptoEscrow/Staging/Firebase" --secret-string "$(cat temp_secret.json)" --region us-east-1
rm temp_secret.json
```

#### **Option B: Use your original Firebase JSON file**
```bash
# If you still have the original downloaded file
aws secretsmanager update-secret \
  --secret-id "CryptoEscrow/Staging/Firebase" \
  --secret-string "$(cat path/to/your/firebase-service-account.json)" \
  --region us-east-1
```

### **Step 2: Clean Up Port and Processes**
```bash
# Kill anything on port 3001
lsof -ti:3001 | xargs kill -9 2>/dev/null || true

# Clean up PM2
pm2 stop ecosystem.staging 2>/dev/null || true
pm2 delete ecosystem.staging 2>/dev/null || true
pm2 stop cryptoescrow-backend-staging 2>/dev/null || true
pm2 delete cryptoescrow-backend-staging 2>/dev/null || true
pm2 save
```

### **Step 3: Start Staging Correctly**
```bash
# Start with correct ecosystem file
pm2 start ecosystem.staging.cjs --env staging
pm2 save

# Check status
pm2 status
```

### **Step 4: Verify Health**
```bash
# Test local health endpoint
curl http://localhost:3001/health

# Should return: {"status":"OK"}
```

---

## **🔍 Verification Steps**

### **1. Test Private Key Format**
```bash
# Check if private key has actual newlines (not \n strings)
aws secretsmanager get-secret-value --secret-id "CryptoEscrow/Staging/Firebase" --region us-east-1 --query "SecretString" --output text | jq -r .private_key | head -3

# Should show:
# -----BEGIN PRIVATE KEY-----
# MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDMcAwwsH07sZc+
# ZlaFjsDQxKjiFI/lC+J9BjokxHvDQiWWoA2dixL5F0LXFhDo4Wa3Vh+oOlbuWmjb
```

### **2. Test Firebase Connection**
```bash
./test-staging-firebase-connection.sh
```

### **3. Test PM2 Process**
```bash
pm2 status
# Should show "cryptoescrow-backend-staging" as online
```

### **4. Test Health Endpoint**
```bash
curl http://localhost:3001/health
# Should return: {"status":"OK"}
```

---

## **🎯 Expected Results After Fix**

1. **PM2 Status**: `cryptoescrow-backend-staging` online
2. **Port 3001**: Listening and responding
3. **Health Endpoint**: Returns `{"status":"OK"}`
4. **ALB Health Check**: Will now pass (no more "Request timed out")
5. **External Access**: `https://staging.clearhold.app/health` will work

---

## **🚨 If Still Not Working**

### **Check Logs**:
```bash
# PM2 logs
pm2 logs cryptoescrow-backend-staging --lines 50

# System logs
journalctl -u pm2-ec2-user --since "10 minutes ago"
```

### **Common Error Messages**:

1. **"Failed to load or parse Service Account Key"**
   - Private key format still wrong
   - Re-run private key fix

2. **"EADDRINUSE: address already in use :::3001"**
   - Something else using port 3001
   - Kill with: `lsof -ti:3001 | xargs kill -9`

3. **"Firebase Admin SDK initialization failed"**
   - AWS Secrets Manager permissions issue
   - Check IAM role has SecretsManager access

---

## **🎉 Success Indicators**

When working correctly, you should see:
- ✅ PM2 shows `cryptoescrow-backend-staging` online
- ✅ `curl http://localhost:3001/health` returns `{"status":"OK"}`  
- ✅ ALB target group shows "Healthy"
- ✅ `https://staging.clearhold.app/health` accessible

---

**🚀 Ready to fix? Run `./fix-staging-private-key.sh` to automatically resolve all issues!** 