#!/bin/bash

# 🔥 FIREBASE STAGING SETUP SCRIPT
# This script helps you configure Firebase service account for staging

set -e

echo "🔥 Firebase Staging Service Account Setup"
echo "========================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Check if Firebase CLI is installed
if ! command -v firebase &> /dev/null; then
    log_error "Firebase CLI is not installed. Please install it first:"
    echo "npm install -g firebase-tools"
    exit 1
fi

log_info "Firebase CLI detected. Checking login status..."
if ! firebase projects:list &> /dev/null; then
    log_warning "You need to login to Firebase CLI first"
    firebase login
fi

# List available projects
log_info "Available Firebase projects:"
firebase projects:list

echo ""
log_info "Based on your .firebaserc, you have these projects configured:"
echo "• Staging: jaspirev4-2f12a"
echo "• Production: ethescrow-377c6"

echo ""
log_warning "TO GET FIREBASE SERVICE ACCOUNT FOR STAGING:"
echo "=============================================="
echo "1. Go to Firebase Console: https://console.firebase.google.com/"
echo "2. Select your staging project: jaspirev4-2f12a"
echo "3. Click on Project Settings (gear icon)"
echo "4. Go to 'Service Accounts' tab"
echo "5. Click 'Generate new private key'"
echo "6. Download the JSON file"
echo "7. Copy the contents of that JSON file"

echo ""
log_info "Once you have the service account JSON, run this command to configure it:"
echo ""
echo "aws secretsmanager update-secret \\"
echo "  --secret-id 'CryptoEscrow/Staging/Firebase' \\"
echo "  --secret-string 'PASTE_YOUR_SERVICE_ACCOUNT_JSON_HERE' \\"
echo "  --region us-east-1"

echo ""
log_info "Example of what the service account JSON looks like:"
cat << 'EOF'
{
  "type": "service_account",
  "project_id": "jaspirev4-2f12a",
  "private_key_id": "abc123...",
  "private_key": "-----BEGIN PRIVATE KEY-----\nYOUR_PRIVATE_KEY_HERE\n-----END PRIVATE KEY-----\n",
  "client_email": "firebase-adminsdk-xxxxx@jaspirev4-2f12a.iam.gserviceaccount.com",
  "client_id": "123456789...",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-xxxxx%40jaspirev4-2f12a.iam.gserviceaccount.com"
}
EOF

echo ""
log_info "SECURITY REMINDER:"
echo "• Never commit service account files to version control"
echo "• Use AWS Secrets Manager for production environments"
echo "• Rotate service account keys regularly"
echo "• Limit service account permissions to minimum required"

echo ""
log_info "After configuring the service account, restart your staging environment:"
echo "pm2 restart cryptoescrow-backend-staging"

echo ""
log_info "To check if the service account is properly configured:"
echo "aws secretsmanager get-secret-value --secret-id 'CryptoEscrow/Staging/Firebase' --region us-east-1" 