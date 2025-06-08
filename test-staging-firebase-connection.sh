#!/bin/bash

# 🧪 TEST STAGING FIREBASE CONNECTION
# This script tests if the Firebase service account is properly configured

echo "🧪 Testing Staging Firebase Configuration"
echo "========================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

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

log_info "Step 1: Testing AWS Secrets Manager access..."

# Test if we can access the staging Firebase secret
if aws secretsmanager get-secret-value --secret-id "CryptoEscrow/Staging/Firebase" --region us-east-1 >/dev/null 2>&1; then
    log_success "Can access CryptoEscrow/Staging/Firebase secret"
    
    # Get the project ID from the secret
    PROJECT_ID=$(aws secretsmanager get-secret-value --secret-id "CryptoEscrow/Staging/Firebase" --region us-east-1 --query "SecretString" --output text | jq -r .project_id)
    
    if [ "$PROJECT_ID" = "escrowstaging" ]; then
        log_success "Project ID matches: $PROJECT_ID"
    else
        log_warning "Project ID mismatch. Found: $PROJECT_ID, Expected: escrowstaging"
    fi
    
    # Check if all required fields are present
    SECRET_JSON=$(aws secretsmanager get-secret-value --secret-id "CryptoEscrow/Staging/Firebase" --region us-east-1 --query "SecretString" --output text)
    
    log_info "Step 2: Checking required Firebase service account fields..."
    
    REQUIRED_FIELDS=("type" "project_id" "private_key_id" "private_key" "client_email" "client_id")
    
    for field in "${REQUIRED_FIELDS[@]}"; do
        if echo "$SECRET_JSON" | jq -e ".$field" >/dev/null 2>&1; then
            VALUE=$(echo "$SECRET_JSON" | jq -r ".$field")
            if [ "$VALUE" != "null" ] && [ "$VALUE" != "PLACEHOLDER" ] && [ -n "$VALUE" ]; then
                log_success "Field '$field' is present and has value"
            else
                log_error "Field '$field' is missing or has placeholder value"
            fi
        else
            log_error "Field '$field' is missing from secret"
        fi
    done
    
    # Check private key format
    PRIVATE_KEY=$(echo "$SECRET_JSON" | jq -r .private_key)
    if [[ "$PRIVATE_KEY" == "-----BEGIN PRIVATE KEY-----"* ]] && [[ "$PRIVATE_KEY" == *"-----END PRIVATE KEY-----" ]]; then
        log_success "Private key has correct PEM format"
    else
        log_error "Private key does not have correct PEM format"
    fi
    
else
    log_error "Cannot access CryptoEscrow/Staging/Firebase secret"
    echo ""
    echo "Make sure you have:"
    echo "1. Configured AWS credentials"
    echo "2. Created the secret in AWS Secrets Manager"
    echo "3. Set the correct region (us-east-1)"
    exit 1
fi

log_info "Step 3: Testing staging app config secret..."

if aws secretsmanager get-secret-value --secret-id "CryptoEscrow/Staging/Config" --region us-east-1 >/dev/null 2>&1; then
    log_success "Can access CryptoEscrow/Staging/Config secret"
else
    log_warning "CryptoEscrow/Staging/Config secret not found (will be created by fix script)"
fi

echo ""
echo "🎯 TEST RESULTS SUMMARY"
echo "======================"

if [ "$PROJECT_ID" = "escrowstaging" ]; then
    log_success "Firebase staging configuration looks correct!"
    echo ""
    log_info "Next steps:"
    echo "1. Run the staging environment: ./fix-staging-environment.sh"
    echo "2. Test the health endpoint: curl http://localhost:3001/health"
    echo "3. Check logs: pm2 logs cryptoescrow-backend-staging"
else
    log_error "Firebase configuration has issues. Please review and fix."
fi 