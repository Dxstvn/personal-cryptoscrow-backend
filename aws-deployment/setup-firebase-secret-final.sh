#!/bin/bash

# Firebase Service Account Secret Setup for AWS Secrets Manager
# Final version with proper JSON handling

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🔐 Firebase Service Account Secret Setup${NC}"
echo "========================================"

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

SECRET_NAME="CryptoEscrow/Firebase/ServiceAccount"
REGION="us-east-1"

print_info "This script will set up your Firebase service account secret in AWS Secrets Manager."
print_info "You can provide the Firebase service account JSON in several ways:"
echo "1. Paste the complete JSON (recommended)"
echo "2. Provide the path to a JSON file"
echo "3. Enter values manually"
echo

# Check if secret already exists
if aws secretsmanager describe-secret --secret-id "$SECRET_NAME" --region "$REGION" &>/dev/null; then
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

echo "Choose input method:"
echo "1. Paste complete Firebase service account JSON"
echo "2. Provide path to JSON file"
echo "3. Enter values manually"
read -p "Enter choice (1-3): " CHOICE

case $CHOICE in
    1)
        print_info "Paste your complete Firebase service account JSON below."
        print_info "Press Ctrl+D when done:"
        echo
        FIREBASE_JSON=$(cat)
        
        # Validate JSON
        if ! echo "$FIREBASE_JSON" | jq . >/dev/null 2>&1; then
            print_error "Invalid JSON format. Please check your input."
            exit 1
        fi
        ;;
    2)
        read -p "Enter path to Firebase service account JSON file: " JSON_FILE_PATH
        if [ ! -f "$JSON_FILE_PATH" ]; then
            print_error "File not found: $JSON_FILE_PATH"
            exit 1
        fi
        
        FIREBASE_JSON=$(cat "$JSON_FILE_PATH")
        
        # Validate JSON
        if ! echo "$FIREBASE_JSON" | jq . >/dev/null 2>&1; then
            print_error "Invalid JSON in file: $JSON_FILE_PATH"
            exit 1
        fi
        ;;
    3)
        print_info "Enter Firebase service account details manually:"
        read -p "Project ID: " PROJECT_ID
        read -p "Private Key ID: " PRIVATE_KEY_ID
        
        print_info "Enter the private key (include -----BEGIN PRIVATE KEY----- and -----END PRIVATE KEY-----):"
        print_info "Press Ctrl+D when done:"
        PRIVATE_KEY=$(cat)
        
        read -p "Client Email: " CLIENT_EMAIL
        read -p "Client ID: " CLIENT_ID
        read -p "Client X509 Cert URL: " CLIENT_CERT_URL
        
        # Create JSON manually
        FIREBASE_JSON=$(jq -n \
            --arg type "service_account" \
            --arg project_id "$PROJECT_ID" \
            --arg private_key_id "$PRIVATE_KEY_ID" \
            --arg private_key "$PRIVATE_KEY" \
            --arg client_email "$CLIENT_EMAIL" \
            --arg client_id "$CLIENT_ID" \
            --arg auth_uri "https://accounts.google.com/o/oauth2/auth" \
            --arg token_uri "https://oauth2.googleapis.com/token" \
            --arg auth_provider_x509_cert_url "https://www.googleapis.com/oauth2/v1/certs" \
            --arg client_x509_cert_url "$CLIENT_CERT_URL" \
            '{
                type: $type,
                project_id: $project_id,
                private_key_id: $private_key_id,
                private_key: $private_key,
                client_email: $client_email,
                client_id: $client_id,
                auth_uri: $auth_uri,
                token_uri: $token_uri,
                auth_provider_x509_cert_url: $auth_provider_x509_cert_url,
                client_x509_cert_url: $client_x509_cert_url
            }')
        ;;
    *)
        print_error "Invalid choice. Exiting."
        exit 1
        ;;
esac

# Validate required fields
if ! echo "$FIREBASE_JSON" | jq -e '.project_id and .private_key and .client_email' >/dev/null; then
    print_error "Missing required fields in Firebase service account JSON (project_id, private_key, client_email)"
    exit 1
fi

print_info "Creating/updating Firebase service account secret..."

if [ "$UPDATE_MODE" = true ]; then
    # Update existing secret
    aws secretsmanager update-secret \
        --secret-id "$SECRET_NAME" \
        --secret-string "$FIREBASE_JSON" \
        --region "$REGION" >/dev/null
    print_status "Firebase service account secret updated successfully!"
else
    # Create new secret
    aws secretsmanager create-secret \
        --name "$SECRET_NAME" \
        --description "Firebase service account for CryptoEscrow backend" \
        --secret-string "$FIREBASE_JSON" \
        --region "$REGION" >/dev/null
    print_status "Firebase service account secret created successfully!"
fi

# Test secret retrieval
print_info "Testing secret retrieval..."
if aws secretsmanager get-secret-value --secret-id "$SECRET_NAME" --region "$REGION" --query 'SecretString' --output text | jq . >/dev/null 2>&1; then
    print_status "Secret retrieval test passed!"
    
    # Extract project ID for verification
    PROJECT_ID_FROM_SECRET=$(aws secretsmanager get-secret-value --secret-id "$SECRET_NAME" --region "$REGION" --query 'SecretString' --output text | jq -r '.project_id')
    print_info "Firebase Project ID: $PROJECT_ID_FROM_SECRET"
else
    print_error "Secret retrieval test failed!"
    exit 1
fi

print_status "🎉 Firebase service account secret is now configured!"
print_info "Your backend will now be able to initialize Firebase Admin SDK properly."
print_info "Restart your backend to apply the changes:"
echo "  pm2 restart cryptoescrow-backend"
echo
print_info "You can verify the secret anytime with:"
echo "  aws secretsmanager get-secret-value --secret-id '$SECRET_NAME' --region '$REGION'" 