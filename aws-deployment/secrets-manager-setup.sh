#!/bin/bash

# AWS Secrets Manager Configuration Script for CryptoEscrow Backend
# This script helps you configure your secrets in AWS Secrets Manager

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🔐 AWS Secrets Manager Configuration for CryptoEscrow${NC}"
echo "========================================================"

print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

# Function to generate secure random keys
generate_secure_key() {
    openssl rand -hex 32
}

# Function to check if secret exists
check_secret_exists() {
    local secret_name=$1
    if aws secretsmanager describe-secret --secret-id "$secret_name" --region us-east-1 &>/dev/null; then
        return 0
    else
        return 1
    fi
}

# Function to create secret if it doesn't exist
create_secret_if_not_exists() {
    local secret_name=$1
    local description=$2
    local secret_value=$3
    
    if check_secret_exists "$secret_name"; then
        print_info "Secret $secret_name already exists"
    else
        print_info "Creating secret $secret_name..."
        aws secretsmanager create-secret \
            --name "$secret_name" \
            --description "$description" \
            --secret-string "$secret_value" \
            --region us-east-1
        print_status "Created secret $secret_name"
    fi
}

# Function to update secret
update_secret() {
    local secret_name=$1
    local secret_value=$2
    
    aws secretsmanager update-secret \
        --secret-id "$secret_name" \
        --secret-string "$secret_value" \
        --region us-east-1
    print_status "Updated secret $secret_name"
}

# Function to validate environment
validate_environment() {
    print_info "Validating AWS environment..."
    
    # Check AWS CLI
    if ! command -v aws &> /dev/null; then
        print_error "AWS CLI is not installed"
        exit 1
    fi
    
    # Check AWS credentials
    if ! aws sts get-caller-identity &>/dev/null; then
        print_error "AWS credentials not configured"
        exit 1
    fi
    
    print_status "AWS environment is ready"
}

# Function to test AWS Secrets Manager integration
test_integration() {
    print_info "Testing AWS Secrets Manager integration..."
    
    # Test script
    cat > test-secrets.js << 'EOF'
import awsSecretsManager from '../src/config/awsSecretsManager.js';

async function testSecrets() {
    try {
        // Test environment detection
        process.env.NODE_ENV = 'production';
        process.env.USE_AWS_SECRETS = 'true';
        
        console.log('🧪 Testing AWS Secrets Manager integration...');
        console.log('Environment check:', awsSecretsManager.isAWSEnvironment());
        
        // Test app secrets
        console.log('📱 Loading app secrets...');
        const appSecrets = await awsSecretsManager.getAppSecrets();
        console.log('✅ App secrets loaded:', Object.keys(appSecrets));
        
        // Test blockchain secrets  
        console.log('⛓️  Loading blockchain secrets...');
        const blockchainSecrets = await awsSecretsManager.getBlockchainSecrets();
        console.log('✅ Blockchain secrets loaded:', Object.keys(blockchainSecrets));
        
        console.log('🎉 AWS Secrets Manager integration test successful!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        process.exit(1);
    }
}

testSecrets();
EOF

    # Run test
    if node test-secrets.js; then
        print_status "AWS Secrets Manager integration test passed"
    else
        print_error "AWS Secrets Manager integration test failed"
    fi
    
    # Cleanup
    rm -f test-secrets.js
}

# Main configuration function
configure_secrets() {
    print_info "Starting AWS Secrets Manager configuration..."
    
    # Generate secure keys if not provided
    JWT_SECRET=${JWT_SECRET:-$(generate_secure_key)}
    ENCRYPTION_KEY=${ENCRYPTION_KEY:-$(generate_secure_key)}
    DATABASE_ENCRYPTION_KEY=${DATABASE_ENCRYPTION_KEY:-$(generate_secure_key)}
    
    # Prompt for missing values
    if [ -z "$SMTP_USER" ]; then
        print_warning "Please provide your email configuration:"
        read -p "SMTP User (email): " SMTP_USER
    fi
    
    if [ -z "$SMTP_PASS" ]; then
        read -s -p "SMTP Password (app password): " SMTP_PASS
        echo
    fi
    
    if [ -z "$INFURA_API_KEY" ]; then
        read -p "Infura API Key: " INFURA_API_KEY
    fi
    
    if [ -z "$DEPLOYER_PRIVATE_KEY" ]; then
        print_warning "Please provide your blockchain private keys:"
        read -s -p "Deployer Private Key (without 0x): " DEPLOYER_PRIVATE_KEY
        echo
    fi
    
    if [ -z "$BACKEND_WALLET_PRIVATE_KEY" ]; then
        read -s -p "Backend Wallet Private Key (without 0x): " BACKEND_WALLET_PRIVATE_KEY
        echo
    fi
    
    # Create App Config secret
    APP_CONFIG_JSON=$(cat << EOF
{
    "JWT_SECRET": "$JWT_SECRET",
    "ENCRYPTION_KEY": "$ENCRYPTION_KEY",
    "DATABASE_ENCRYPTION_KEY": "$DATABASE_ENCRYPTION_KEY",
    "SMTP_HOST": "${SMTP_HOST:-smtp.gmail.com}",
    "SMTP_PORT": "${SMTP_PORT:-587}",
    "SMTP_USER": "$SMTP_USER",
    "SMTP_PASS": "$SMTP_PASS",
    "INFURA_API_KEY": "$INFURA_API_KEY",
    "ALCHEMY_API_KEY": "${ALCHEMY_API_KEY:-}"
}
EOF
)
    
    # Create Blockchain Keys secret
    BLOCKCHAIN_KEYS_JSON=$(cat << EOF
{
    "DEPLOYER_PRIVATE_KEY": "$DEPLOYER_PRIVATE_KEY",
    "BACKEND_WALLET_PRIVATE_KEY": "$BACKEND_WALLET_PRIVATE_KEY"
}
EOF
)
    
    # Update secrets
    print_info "Updating CryptoEscrow/App/Config..."
    update_secret "CryptoEscrow/App/Config" "$APP_CONFIG_JSON"
    
    print_info "Updating CryptoEscrow/Blockchain/Keys..."
    update_secret "CryptoEscrow/Blockchain/Keys" "$BLOCKCHAIN_KEYS_JSON"
    
    print_status "All secrets have been configured successfully!"
}

# Function to display current secret structure (without values)
show_secret_structure() {
    print_info "Current AWS Secrets Manager structure:"
    echo
    echo "📱 CryptoEscrow/App/Config:"
    echo "  - JWT_SECRET"
    echo "  - ENCRYPTION_KEY" 
    echo "  - DATABASE_ENCRYPTION_KEY"
    echo "  - SMTP_HOST"
    echo "  - SMTP_PORT"
    echo "  - SMTP_USER"
    echo "  - SMTP_PASS"
    echo "  - INFURA_API_KEY"
    echo "  - ALCHEMY_API_KEY"
    echo
    echo "⛓️  CryptoEscrow/Blockchain/Keys:"
    echo "  - DEPLOYER_PRIVATE_KEY"
    echo "  - BACKEND_WALLET_PRIVATE_KEY"
    echo
}

# Function to backup current secrets
backup_secrets() {
    print_info "Creating backup of current secrets..."
    
    timestamp=$(date +"%Y%m%d_%H%M%S")
    backup_dir="secrets_backup_$timestamp"
    mkdir -p "$backup_dir"
    
    # Backup app config
    aws secretsmanager get-secret-value \
        --secret-id "CryptoEscrow/App/Config" \
        --query 'SecretString' \
        --output text > "$backup_dir/app_config.json" 2>/dev/null || true
    
    # Backup blockchain keys
    aws secretsmanager get-secret-value \
        --secret-id "CryptoEscrow/Blockchain/Keys" \
        --query 'SecretString' \
        --output text > "$backup_dir/blockchain_keys.json" 2>/dev/null || true
    
    print_status "Backup created in $backup_dir"
}

# Function to display help
show_help() {
    echo "Usage: $0 [OPTION]"
    echo
    echo "Options:"
    echo "  configure     Configure AWS Secrets Manager with your actual secrets"
    echo "  test          Test AWS Secrets Manager integration"
    echo "  structure     Show current secret structure"
    echo "  backup        Backup current secrets"
    echo "  validate      Validate AWS environment"
    echo "  help          Show this help message"
    echo
    echo "Environment Variables (optional):"
    echo "  JWT_SECRET                    Custom JWT secret"
    echo "  ENCRYPTION_KEY               Custom encryption key"
    echo "  DATABASE_ENCRYPTION_KEY      Custom database encryption key"
    echo "  SMTP_USER                    Email address for SMTP"
    echo "  SMTP_PASS                    App password for SMTP"
    echo "  INFURA_API_KEY              Infura API key"
    echo "  ALCHEMY_API_KEY             Alchemy API key (optional)"
    echo "  DEPLOYER_PRIVATE_KEY        Blockchain deployer private key"
    echo "  BACKEND_WALLET_PRIVATE_KEY  Backend wallet private key"
}

# Parse command line arguments
case "${1:-help}" in
    configure)
        validate_environment
        backup_secrets
        configure_secrets
        test_integration
        ;;
    test)
        validate_environment
        test_integration
        ;;
    structure)
        show_secret_structure
        ;;
    backup)
        validate_environment
        backup_secrets
        ;;
    validate)
        validate_environment
        ;;
    help|*)
        show_help
        ;;
esac 