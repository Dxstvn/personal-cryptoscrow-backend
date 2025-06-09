#!/bin/bash

# Fix Production Firebase Issues
# This script addresses the AWS Secrets Manager and Firebase authentication problems

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

echo "🔧 Fix Production Firebase Issues"
echo "================================="

# Step 1: Check current AWS configuration
log_info "Step 1: Checking AWS configuration..."

if ! command -v aws &> /dev/null; then
    log_error "AWS CLI not found. Please install AWS CLI first."
    exit 1
fi

# Check if we can access AWS Secrets Manager
if ! aws secretsmanager list-secrets --region us-east-1 &> /dev/null; then
    log_error "Cannot access AWS Secrets Manager. Please check IAM permissions."
    echo ""
    echo "The EC2 instance needs an IAM role with the following policy:"
    echo ""
    cat << 'EOF'
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "secretsmanager:GetSecretValue",
                "secretsmanager:DescribeSecret"
            ],
            "Resource": [
                "arn:aws:secretsmanager:us-east-1:*:secret:CryptoEscrow/Firebase/ServiceAccount*",
                "arn:aws:secretsmanager:us-east-1:*:secret:CryptoEscrow/Staging/Firebase*",
                "arn:aws:secretsmanager:us-east-1:*:secret:CryptoEscrow/Blockchain/Keys*",
                "arn:aws:secretsmanager:us-east-1:*:secret:CryptoEscrow/App/Config*"
            ]
        }
    ]
}
EOF
    echo ""
    log_info "To create and attach this policy:"
    echo "1. Go to AWS IAM Console"
    echo "2. Create a new policy with the above JSON"
    echo "3. Create an IAM role for EC2 with this policy"
    echo "4. Attach the role to your EC2 instance"
    echo ""
    read -p "Press Enter after setting up IAM permissions..."
fi

# Step 2: Check if Firebase service accounts exist in Secrets Manager
log_info "Step 2: Checking Firebase service accounts in AWS Secrets Manager..."

# Check production secret
if aws secretsmanager describe-secret --secret-id "CryptoEscrow/Firebase/ServiceAccount" --region us-east-1 &> /dev/null; then
    log_success "Production Firebase service account secret exists"
    
    # Test if we can retrieve it
    if aws secretsmanager get-secret-value --secret-id "CryptoEscrow/Firebase/ServiceAccount" --region us-east-1 &> /dev/null; then
        log_success "Successfully can access production Firebase service account secret"
    else
        log_error "Cannot retrieve production Firebase service account secret. Check IAM permissions."
        exit 1
    fi
else
    log_warning "Production Firebase service account secret does not exist"
    log_info "Creating placeholder production secret..."
    
    aws secretsmanager create-secret \
        --name "CryptoEscrow/Firebase/ServiceAccount" \
        --description "Firebase service account for production environment (ethescrow-377c6)" \
        --secret-string '{"type":"service_account","project_id":"ethescrow-377c6","private_key_id":"PLACEHOLDER","private_key":"PLACEHOLDER","client_email":"PLACEHOLDER","client_id":"PLACEHOLDER","auth_uri":"https://accounts.google.com/o/oauth2/auth","token_uri":"https://oauth2.googleapis.com/token","auth_provider_x509_cert_url":"https://www.googleapis.com/oauth2/v1/certs","client_x509_cert_url":"PLACEHOLDER"}' \
        --region us-east-1
    
    log_warning "PLACEHOLDER production secret created."
fi

# Check staging secret
if aws secretsmanager describe-secret --secret-id "CryptoEscrow/Staging/Firebase" --region us-east-1 &> /dev/null; then
    log_success "Staging Firebase service account secret exists"
else
    log_warning "Staging Firebase service account secret does not exist"
    log_info "Creating placeholder staging secret..."
    
    aws secretsmanager create-secret \
        --name "CryptoEscrow/Staging/Firebase" \
        --description "Firebase service account for staging environment (escrowstaging)" \
        --secret-string '{"type":"service_account","project_id":"escrowstaging","private_key_id":"PLACEHOLDER","private_key":"PLACEHOLDER","client_email":"PLACEHOLDER","client_id":"PLACEHOLDER","auth_uri":"https://accounts.google.com/o/oauth2/auth","token_uri":"https://oauth2.googleapis.com/token","auth_provider_x509_cert_url":"https://www.googleapis.com/oauth2/v1/certs","client_x509_cert_url":"PLACEHOLDER"}' \
        --region us-east-1
    
    log_warning "PLACEHOLDER staging secret created."
fi

log_info "You need to update both secrets with real Firebase service account credentials."

# Step 3: Create fallback service account file on EC2
log_info "Step 3: Setting up fallback Firebase service account file..."

# Create service account directory
sudo mkdir -p /opt/cryptoescrow/config
sudo chown ec2-user:ec2-user /opt/cryptoescrow/config

# Create a template service account file
cat > /opt/cryptoescrow/config/firebase-service-account.json << 'EOF'
{
  "type": "service_account",
  "project_id": "ethescrow-377c6",
  "private_key_id": "PLACEHOLDER",
  "private_key": "PLACEHOLDER",
  "client_email": "PLACEHOLDER",
  "client_id": "PLACEHOLDER",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "PLACEHOLDER"
}
EOF

# Update ecosystem.production.js to include fallback
log_info "Step 4: Updating production ecosystem configuration..."

cat > ecosystem.production.js << 'EOF'
module.exports = {
  apps: [{
    name: 'cryptoescrow-backend',
    script: 'src/server.js',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env_production: {
      NODE_ENV: 'production',
      USE_AWS_SECRETS: 'true',
      AWS_REGION: 'us-east-1',
      PORT: 3000,
      
      // Firebase configuration
      FIREBASE_PROJECT_ID: 'ethescrow-377c6',
      FIREBASE_STORAGE_BUCKET: 'ethescrow-377c6.firebasestorage.app',
      FIREBASE_API_KEY: 'AIzaSyCmiddab4u_voTUPEsIDxHr_M3LY6bJvRY',
      FIREBASE_AUTH_DOMAIN: 'ethescrow-377c6.firebaseapp.com',
      FIREBASE_MESSAGING_SENDER_ID: '103629169564',
      FIREBASE_APP_ID: '1:103629169564:web:2450fa1239dd476afc5e59',
      FIREBASE_MEASUREMENT_ID: 'G-GXB1ZWVPMN',
      
      // Fallback service account file
      GOOGLE_APPLICATION_CREDENTIALS: '/opt/cryptoescrow/config/firebase-service-account.json',
      
      // Blockchain configuration
      CHAIN_ID: '11155111',
      
      // Frontend URL
      FRONTEND_URL: 'https://clearhold.app'
    },
    error_file: './logs/production-error.log',
    out_file: './logs/production-out.log',
    log_file: './logs/production.log',
    time: true,
    merge_logs: true,
    max_restarts: 10,
    min_uptime: '10s'
  }]
};
EOF

log_success "Updated ecosystem.production.js with fallback configuration"

# Step 5: Test the configuration
log_info "Step 5: Testing current configuration..."

# Stop current processes
pm2 stop all 2>/dev/null || true

# Start production
log_info "Starting production server..."
pm2 start ecosystem.production.js --env production

# Wait a moment
sleep 5

# Check if it's running
if pm2 list | grep -q "online.*cryptoescrow-backend"; then
    log_success "Production server started successfully"
    
    # Test health endpoint
    sleep 3
    if curl -f http://localhost:3000/api/health &> /dev/null; then
        log_success "✅ Production health check PASSED"
    else
        log_warning "❌ Production health check failed, but server is running"
        log_info "Check logs with: pm2 logs cryptoescrow-backend"
    fi
else
    log_error "❌ Production server failed to start"
    log_info "Check logs with: pm2 logs cryptoescrow-backend"
fi

echo ""
log_info "📋 Next Steps:"
echo "1. Update AWS Secrets Manager with real Firebase service accounts:"
echo ""
echo "   For PRODUCTION (ethescrow-377c6 project):"
echo "   aws secretsmanager update-secret --secret-id 'CryptoEscrow/Firebase/ServiceAccount' --secret-string 'PASTE_PRODUCTION_SERVICE_ACCOUNT_JSON_HERE' --region us-east-1"
echo ""
echo "   For STAGING (escrowstaging project):"
echo "   aws secretsmanager update-secret --secret-id 'CryptoEscrow/Staging/Firebase' --secret-string 'PASTE_STAGING_SERVICE_ACCOUNT_JSON_HERE' --region us-east-1"
echo ""
echo "2. Or update the fallback service account file:"
echo "   sudo nano /opt/cryptoescrow/config/firebase-service-account.json"
echo ""
echo "3. After updating credentials, restart both servers:"
echo "   pm2 restart cryptoescrow-backend                  # Production"
echo "   pm2 restart cryptoescrow-backend-staging          # Staging"
echo ""
echo "4. Monitor logs:"
echo "   pm2 logs cryptoescrow-backend                     # Production logs"
echo "   pm2 logs cryptoescrow-backend-staging             # Staging logs"

echo ""
log_success "✅ Production Firebase configuration fix completed!" 