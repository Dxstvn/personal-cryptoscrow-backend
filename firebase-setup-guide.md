# Firebase Service Account Setup Guide

## 🔥 Getting Your Firebase Service Account Key

### Step 1: Access Firebase Console

#### For Production (ethescrow-377c6):
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your **ethescrow-377c6** project

#### For Staging (escrowstaging):
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your **escrowstaging** project

### Step 2: Generate Service Account Key
1. Click on the **gear icon** (Settings) → **Project settings**
2. Go to the **Service accounts** tab
3. Select **Firebase Admin SDK**
4. Click **Generate new private key**
5. Click **Generate key** to download the JSON file

### Step 3: Prepare the Service Account JSON
The downloaded file should look like this:
```json
{
  "type": "service_account",
  "project_id": "ethescrow-377c6",
  "private_key_id": "abc123def456...",
  "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvwIBADANBgkqhkiG9w0BAQEFAASCBKkwggSlAgEAAoIBAQC...\n-----END PRIVATE KEY-----\n",
  "client_email": "firebase-adminsdk-xxxxx@ethescrow-377c6.iam.gserviceaccount.com",
  "client_id": "123456789012345678901",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-xxxxx%40ethescrow-377c6.iam.gserviceaccount.com"
}
```

### Step 4: Update AWS Secrets Manager

#### Option A: Using AWS CLI (Recommended)

**For Production:**
```bash
# Replace 'PASTE_PRODUCTION_JSON_HERE' with your ethescrow-377c6 service account JSON
aws secretsmanager update-secret \
  --secret-id 'CryptoEscrow/Firebase/ServiceAccount' \
  --secret-string 'PASTE_PRODUCTION_JSON_HERE' \
  --region us-east-1
```

**For Staging:**
```bash
# Replace 'PASTE_STAGING_JSON_HERE' with your escrowstaging service account JSON
aws secretsmanager update-secret \
  --secret-id 'CryptoEscrow/Staging/Firebase' \
  --secret-string 'PASTE_STAGING_JSON_HERE' \
  --region us-east-1
```

#### Option B: Using AWS Console

**For Production:**
1. Go to [AWS Secrets Manager Console](https://console.aws.amazon.com/secretsmanager/)
2. Find **CryptoEscrow/Firebase/ServiceAccount**
3. Click **Retrieve secret value** → **Edit**
4. Paste your **ethescrow-377c6** service account JSON in the secret value field
5. Click **Save**

**For Staging:**
1. Go to [AWS Secrets Manager Console](https://console.aws.amazon.com/secretsmanager/)
2. Find **CryptoEscrow/Staging/Firebase**
3. Click **Retrieve secret value** → **Edit**
4. Paste your **escrowstaging** service account JSON in the secret value field
5. Click **Save**

### Step 5: Update Fallback File (Alternative)
If AWS Secrets Manager is not working, update the fallback file on your EC2 instance:

```bash
# On your EC2 instance:
sudo nano /opt/cryptoescrow/config/firebase-service-account.json

# Paste your service account JSON, then save
```

## ⚡ Quick Fix Commands

### Run the automatic fix script:
```bash
./fix-production-firebase.sh
```

### Test if it's working:
```bash
# Check if both servers are running
pm2 status

# Test health endpoints
curl http://localhost:3000/health     # Production
curl http://localhost:5173/health     # Staging

# Check logs for Firebase errors
pm2 logs cryptoescrow-backend | grep -i firebase         # Production
pm2 logs cryptoescrow-backend-staging | grep -i firebase # Staging
```

### Restart after updating credentials:
```bash
pm2 restart cryptoescrow-backend                 # Production
pm2 restart cryptoescrow-backend-staging         # Staging
```

## 🔒 Security Notes

- **Never commit** service account files to version control
- **Rotate keys** regularly (every 90 days recommended)
- **Use IAM roles** instead of keys when possible
- **Monitor access** to your secrets

## 🐛 Troubleshooting

### Issue: "Secrets Manager can't find the specified secret"
- **Cause**: Wrong secret path or secret doesn't exist
- **Fix**: Run `./fix-production-firebase.sh` to create the secret

### Issue: "Could not load the default credentials"
- **Cause**: No valid Firebase service account configured
- **Fix**: Update AWS Secrets Manager or fallback file with real credentials

### Issue: IAM permissions denied
- **Cause**: EC2 instance doesn't have proper IAM role
- **Fix**: Attach the IAM policy shown in the fix script

### Issue: "Firebase service account missing required fields"
- **Cause**: Placeholder values still in the service account
- **Fix**: Replace with real Firebase service account JSON

## 📞 Getting Help

If you're still having issues:

1. **Check logs**: `pm2 logs cryptoescrow-backend`
2. **Verify secret**: `aws secretsmanager get-secret-value --secret-id 'CryptoEscrow/Firebase/ServiceAccount' --region us-east-1`
3. **Test Firebase**: Try authenticating with the Firebase Admin SDK directly
4. **Check IAM**: Verify your EC2 instance has the correct IAM role attached 