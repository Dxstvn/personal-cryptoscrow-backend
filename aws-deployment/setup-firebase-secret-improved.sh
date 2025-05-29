#!/bin/bash

# CryptoEscrow Backend - Improved Firebase Service Account Setup
# This script creates the Firebase service account secret in AWS Secrets Manager

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🔐 Firebase Service Account Setup for AWS Secrets Manager${NC}"
echo "================================================================"

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

print_info "This script will set up your Firebase service account in AWS Secrets Manager."
print_info "You have two options for providing the Firebase service account:"
echo
echo "1. Paste the entire JSON content"
echo "2. Enter individual fields manually"
echo "3. Upload JSON file from path"
echo

read -p "Choose option (1-3): " input_method

SECRET_NAME="CryptoEscrow/Firebase/ServiceAccount"

# Check if secret already exists
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

case $input_method in
    1)
        print_info "Option 1: Paste the entire JSON content"
        print_warning "Make sure to paste the COMPLETE JSON including all braces { }"
        echo "Paste your Firebase service account JSON and press Ctrl+D when done:"
        echo "(The input will be hidden for security)"
        
        # Read multi-line input until EOF
        FIREBASE_SERVICE_ACCOUNT=""
        while IFS= read -r line; do
            FIREBASE_SERVICE_ACCOUNT+="$line"$'\n'
        done
        
        # Remove the trailing newline
        FIREBASE_SERVICE_ACCOUNT=${FIREBASE_SERVICE_ACCOUNT%$'\n'}
        ;;
        
    2)
        print_info "Option 2: Enter individual fields manually"
        echo "Get these values from your Firebase service account JSON:"
        echo
        
        read -p "Project ID (e.g., ethescrow-377c6): " PROJECT_ID
        read -p "Private Key ID: " PRIVATE_KEY_ID
        echo "Private Key (paste the full key including -----BEGIN/END----- lines):"
        echo "Press Ctrl+D when done:"
        PRIVATE_KEY=""
        while IFS= read -r line; do
            PRIVATE_KEY+="$line\n"
        done
        # Remove trailing \n
        PRIVATE_KEY=${PRIVATE_KEY%\\n}
        
        read -p "Client Email: " CLIENT_EMAIL
        read -p "Client ID: " CLIENT_ID
        read -p "Client X509 Cert URL: " CLIENT_CERT_URL
        
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
        ;;
        
    3)
        print_info "Option 3: Upload JSON file from path"
        read -p "Enter the full path to your Firebase service account JSON file: " JSON_FILE_PATH
        
        if [ ! -f "$JSON_FILE_PATH" ]; then
            print_error "File not found: $JSON_FILE_PATH"
            exit 1
        fi
        
        FIREBASE_SERVICE_ACCOUNT=$(cat "$JSON_FILE_PATH")
        ;;
        
    *)
        print_error "Invalid option. Please choose 1, 2, or 3."
        exit 1
        ;;
esac

# Validate JSON
print_info "Validating JSON format..."
if ! echo "$FIREBASE_SERVICE_ACCOUNT" | jq . >/dev/null 2>&1; then
    print_error "Invalid JSON format. Please check your input."
    echo "JSON content preview (first 200 chars):"
    echo "${FIREBASE_SERVICE_ACCOUNT:0:200}..."
    exit 1
fi

# Extract and validate required fields
PROJECT_ID_CHECK=$(echo "$FIREBASE_SERVICE_ACCOUNT" | jq -r '.project_id // empty')
CLIENT_EMAIL_CHECK=$(echo "$FIREBASE_SERVICE_ACCOUNT" | jq -r '.client_email // empty')
PRIVATE_KEY_CHECK=$(echo "$FIREBASE_SERVICE_ACCOUNT" | jq -r '.private_key // empty')

if [ -z "$PROJECT_ID_CHECK" ] || [ -z "$CLIENT_EMAIL_CHECK" ] || [ -z "$PRIVATE_KEY_CHECK" ]; then
    print_error "Missing required fields in Firebase service account JSON."
    echo "Required fields: project_id, client_email, private_key"
    exit 1
fi

print_status "JSON validation passed!"
print_info "Project ID: $PROJECT_ID_CHECK"
print_info "Client Email: $CLIENT_EMAIL_CHECK"

# Create or update the secret
print_info "Creating/updating Firebase service account secret in AWS Secrets Manager..."

if [ "$UPDATE_MODE" = true ]; then
    # Update existing secret
    aws secretsmanager update-secret \
        --secret-id "$SECRET_NAME" \
        --secret-string "$FIREBASE_SERVICE_ACCOUNT" \
        --region us-east-1 >/dev/null
    print_status "Firebase service account secret updated successfully!"
else
    # Create new secret
    aws secretsmanager create-secret \
        --name "$SECRET_NAME" \
        --description "Firebase service account for CryptoEscrow backend" \
        --secret-string "$FIREBASE_SERVICE_ACCOUNT" \
        --region us-east-1 >/dev/null
    print_status "Firebase service account secret created successfully!"
fi

# Test secret retrieval
print_info "Testing secret retrieval..."
RETRIEVED_SECRET=$(aws secretsmanager get-secret-value --secret-id "$SECRET_NAME" --region us-east-1 --query 'SecretString' --output text)

if echo "$RETRIEVED_SECRET" | jq . >/dev/null 2>&1; then
    RETRIEVED_PROJECT_ID=$(echo "$RETRIEVED_SECRET" | jq -r '.project_id')
    print_status "Secret retrieval test passed!"
    print_info "Retrieved project ID: $RETRIEVED_PROJECT_ID"
else
    print_error "Secret retrieval test failed!"
    exit 1
fi

print_status "🎉 Firebase service account secret is now configured in AWS Secrets Manager!"
print_info ""
print_info "Next steps:"
print_info "1. The secret is stored as: $SECRET_NAME"
print_info "2. Your backend will automatically use this secret"
print_info "3. Restart your backend: pm2 restart cryptoescrow-backend"
print_info ""
print_warning "Keep your Firebase service account JSON file secure and do not share it!"

# Optional: Test the backend connection
read -p "Would you like to restart the backend now to test the connection? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    print_info "Restarting backend to test Firebase connection..."
    
    # Check if we're on the EC2 instance
    if [ -d "/home/ec2-user/cryptoescrow-backend" ]; then
        cd /home/ec2-user/cryptoescrow-backend
        pm2 restart cryptoescrow-backend
        
        print_info "Waiting for backend to start..."
        sleep 10
        
        print_info "Testing health endpoint..."
        if curl -f -s http://localhost:3000/health >/dev/null 2>&1; then
            print_status "🎉 SUCCESS! Backend is running with Firebase!"
            echo
            echo "Health check response:"
            curl -s http://localhost:3000/health | head -3
            
            PUBLIC_IP=$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || echo "UNKNOWN")
            echo
            echo -e "${GREEN}🌐 Your backend is accessible at:${NC}"
            echo "• Health Check: http://$PUBLIC_IP:3000/health"
            echo "• Backend API: http://$PUBLIC_IP:3000"
        else
            print_warning "Health check failed. Check the logs:"
            pm2 logs --lines 10
        fi
    else
        print_info "Run this command on your EC2 instance to restart the backend:"
        print_info "pm2 restart cryptoescrow-backend"
    fi
fi

print_status "Setup completed!" 