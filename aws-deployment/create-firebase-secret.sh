#!/bin/bash

# CryptoEscrow Backend - Create Firebase Service Account Secret
# This script creates the Firebase service account secret in AWS Secrets Manager

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🔐 Creating Firebase Service Account Secret in AWS Secrets Manager${NC}"
echo "=================================================================="

print_status() { echo -e "${GREEN}✅ $1${NC}"; }
print_warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }
print_error() { echo -e "${RED}❌ $1${NC}"; }
print_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }

# Check if AWS CLI is available
if ! command -v aws &> /dev/null; then
    print_error "AWS CLI is not installed. Please install it first."
    exit 1
fi

# Check AWS credentials
if ! aws sts get-caller-identity &> /dev/null; then
    print_error "AWS credentials not configured. Run 'aws configure' first."
    exit 1
fi

print_info "This script will create a Firebase service account secret in AWS Secrets Manager."
print_info "You need to provide your Firebase service account JSON content."

# Check if secret already exists
SECRET_NAME="CryptoEscrow/Firebase/ServiceAccount"
if aws secretsmanager describe-secret --secret-id "$SECRET_NAME" --region us-east-1 &>/dev/null; then
    print_warning "Secret $SECRET_NAME already exists."
    read -p "Do you want to update it? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_info "Exiting without changes."
        exit 0
    fi
    UPDATE_MODE=true
else
    UPDATE_MODE=false
fi

print_info "Please provide your Firebase service account details:"
echo "You can get these from the Firebase Console:"
echo "1. Go to Project Settings > Service Accounts"
echo "2. Generate new private key"
echo "3. Download the JSON file and use its contents"
echo

# Collect Firebase service account details
read -p "Firebase Project ID: " PROJECT_ID
read -p "Firebase Private Key ID: " PRIVATE_KEY_ID
read -s -p "Firebase Private Key (paste the full key including -----BEGIN/END-----): " PRIVATE_KEY
echo
read -p "Firebase Client Email: " CLIENT_EMAIL
read -p "Firebase Client ID: " CLIENT_ID
read -p "Firebase Client X509 Cert URL: " CLIENT_CERT_URL

# Create the Firebase service account JSON
FIREBASE_SERVICE_ACCOUNT=$(cat << EOF
{
  "type": "service_account",
  "project_id": "$PROJECT_ID",
  "private_key_id": "$PRIVATE_KEY_ID",
  "private_key": "$PRIVATE_KEY",
  "client_email": "$CLIENT_EMAIL",
  "client_id": "$CLIENT_ID",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "$CLIENT_CERT_URL"
}
EOF
)

# Validate JSON
if ! echo "$FIREBASE_SERVICE_ACCOUNT" | jq . >/dev/null 2>&1; then
    print_error "Invalid JSON format. Please check your inputs."
    exit 1
fi

print_info "Creating/updating Firebase service account secret..."

if [ "$UPDATE_MODE" = true ]; then
    # Update existing secret
    aws secretsmanager update-secret \
        --secret-id "$SECRET_NAME" \
        --secret-string "$FIREBASE_SERVICE_ACCOUNT" \
        --region us-east-1
    print_status "Firebase service account secret updated successfully!"
else
    # Create new secret
    aws secretsmanager create-secret \
        --name "$SECRET_NAME" \
        --description "Firebase service account for CryptoEscrow backend" \
        --secret-string "$FIREBASE_SERVICE_ACCOUNT" \
        --region us-east-1
    print_status "Firebase service account secret created successfully!"
fi

print_info "Testing secret retrieval..."
if aws secretsmanager get-secret-value --secret-id "$SECRET_NAME" --region us-east-1 --query 'SecretString' --output text | jq . >/dev/null 2>&1; then
    print_status "Secret retrieval test passed!"
else
    print_error "Secret retrieval test failed!"
    exit 1
fi

print_status "🎉 Firebase service account secret is now configured!"
print_info "Your backend should now be able to initialize Firebase Admin SDK properly."
print_info "Restart your backend to apply the changes: pm2 restart cryptoescrow-backend" 