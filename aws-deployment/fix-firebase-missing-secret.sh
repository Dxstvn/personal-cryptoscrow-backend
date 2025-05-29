#!/bin/bash

# CryptoEscrow Backend - Quick Fix for Missing Firebase Secret
# This script provides immediate fix for the Firebase service account issue

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🔧 Quick Fix for Firebase Service Account Issue${NC}"
echo "=================================================="

print_status() { echo -e "${GREEN}✅ $1${NC}"; }
print_warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }
print_error() { echo -e "${RED}❌ $1${NC}"; }
print_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }

print_info "This script provides a quick fix for the Firebase service account issue."
print_info "Choose one of the following options:"
echo
echo "1. Use environment variables fallback (Recommended - Quick fix)"
echo "2. Create placeholder Firebase secret in AWS Secrets Manager"
echo "3. Exit and manually configure Firebase service account"
echo

read -p "Choose option (1-3): " choice

case $choice in
    1)
        print_info "Option 1: Setting up environment variables fallback"
        
        # Add Firebase project ID to .env file
        cd /home/ec2-user/cryptoescrow-backend
        
        # Check if .env exists
        if [ ! -f ".env" ]; then
            print_error ".env file not found!"
            exit 1
        fi
        
        # Add Firebase project ID if not present
        if ! grep -q "FIREBASE_PROJECT_ID" .env; then
            echo "" >> .env
            echo "# Firebase configuration (fallback when AWS Secrets Manager doesn't have service account)" >> .env
            echo "FIREBASE_PROJECT_ID=ethescrow-377c6" >> .env
            print_status "Added FIREBASE_PROJECT_ID to .env file"
        else
            print_info "FIREBASE_PROJECT_ID already exists in .env file"
        fi
        
        # Restart the backend
        print_info "Restarting backend to apply changes..."
        pm2 restart cryptoescrow-backend
        
        # Wait and test
        sleep 10
        print_info "Testing health endpoint..."
        if curl -f -s http://localhost:3000/health >/dev/null 2>&1; then
            print_status "🎉 SUCCESS! Backend is now working!"
            echo
            echo "Health check response:"
            curl -s http://localhost:3000/health | head -3
            
            PUBLIC_IP=$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || echo "UNKNOWN")
            echo
            echo -e "${GREEN}🌐 Your backend is accessible at:${NC}"
            echo "• Health Check: http://$PUBLIC_IP:3000/health"
            echo "• Backend API: http://$PUBLIC_IP:3000"
        else
            print_warning "Health check still failing. Check logs:"
            pm2 logs --lines 10
        fi
        ;;
        
    2)
        print_info "Option 2: Creating placeholder Firebase secret"
        
        # Create a minimal Firebase service account secret
        SECRET_NAME="CryptoEscrow/Firebase/ServiceAccount"
        
        FIREBASE_PLACEHOLDER=$(cat << 'EOF'
{
  "type": "service_account",
  "project_id": "ethescrow-377c6",
  "private_key_id": "placeholder",
  "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...\n-----END PRIVATE KEY-----\n",
  "client_email": "firebase-adminsdk@ethescrow-377c6.iam.gserviceaccount.com",
  "client_id": "placeholder",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs/firebase-adminsdk%40ethescrow-377c6.iam.gserviceaccount.com"
}
EOF
)

        print_warning "This creates a placeholder secret that won't work for actual Firebase operations!"
        print_warning "You'll need to replace it with real Firebase service account later."
        read -p "Continue? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            print_info "Cancelled."
            exit 0
        fi
        
        # Create the secret
        if aws secretsmanager create-secret \
            --name "$SECRET_NAME" \
            --description "Placeholder Firebase service account for CryptoEscrow backend" \
            --secret-string "$FIREBASE_PLACEHOLDER" \
            --region us-east-1 >/dev/null 2>&1; then
            print_status "Placeholder Firebase secret created"
        else
            print_error "Failed to create Firebase secret. It might already exist."
        fi
        
        # Restart backend
        print_info "Restarting backend..."
        cd /home/ec2-user/cryptoescrow-backend
        pm2 restart cryptoescrow-backend
        
        sleep 10
        print_info "Testing health endpoint..."
        if curl -f -s http://localhost:3000/health >/dev/null 2>&1; then
            print_status "🎉 Backend is running! (with placeholder Firebase secret)"
            print_warning "Remember to replace with real Firebase service account later!"
        else
            print_warning "Still having issues. Check logs:"
            pm2 logs --lines 10
        fi
        ;;
        
    3)
        print_info "Exiting. You can manually configure Firebase later."
        print_info "Use the create-firebase-secret.sh script when you have your Firebase service account ready."
        exit 0
        ;;
        
    *)
        print_error "Invalid option. Please choose 1, 2, or 3."
        exit 1
        ;;
esac

print_status "Quick fix completed!" 