#!/bin/bash

# Master Deployment Script for CryptoEscrow Backend
# Deploys both staging and production environments to their respective EC2 instances

set -e

echo "🚀 CryptoEscrow Master Deployment Script"
echo "========================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${BLUE}[DEPLOY]${NC} $1"
}

print_success() {
    echo -e "${GREEN}✅${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠️${NC} $1"
}

print_error() {
    echo -e "${RED}❌${NC} $1"
}

# Configuration - UPDATE THESE WITH YOUR EC2 DETAILS
PRODUCTION_EC2_USER="ec2-user"
STAGING_EC2_USER="ec2-user"
PRODUCTION_EC2_HOST=""  # Add your production EC2 IP/hostname
STAGING_EC2_HOST=""     # Add your staging EC2 IP/hostname
EC2_KEY_PATH=""         # Add path to your EC2 key file

# Function to check prerequisites
check_prerequisites() {
    print_status "Checking prerequisites..."
    
    if [ -z "$PRODUCTION_EC2_HOST" ] || [ -z "$STAGING_EC2_HOST" ] || [ -z "$EC2_KEY_PATH" ]; then
        print_error "Please update the configuration variables in this script:"
        echo "- PRODUCTION_EC2_HOST"
        echo "- STAGING_EC2_HOST" 
        echo "- EC2_KEY_PATH"
        exit 1
    fi
    
    if [ ! -f "$EC2_KEY_PATH" ]; then
        print_error "EC2 key file not found: $EC2_KEY_PATH"
        exit 1
    fi
    
    print_success "Prerequisites check passed"
}

# Function to push code and deploy to EC2
deploy_to_ec2() {
    local environment=$1
    local ec2_host=$2
    local ec2_user=$3
    local script_name=$4
    
    print_status "Deploying $environment to $ec2_host..."
    
    # First, commit and push any local changes
    print_status "Ensuring latest code is in git..."
    git add . || true
    git commit -m "Auto-commit before $environment deployment $(date)" || print_warning "Nothing to commit"
    git push origin main || print_warning "Git push failed - continuing"
    
    # Copy the deployment script to EC2
    print_status "Copying deployment script to EC2..."
    scp -i "$EC2_KEY_PATH" "$script_name" "$ec2_user@$ec2_host:/home/$ec2_user/"
    
    # Make it executable and run it
    print_status "Running deployment on EC2..."
    ssh -i "$EC2_KEY_PATH" "$ec2_user@$ec2_host" << EOF
        chmod +x $script_name
        cd /home/$ec2_user/personal-cryptoscrow-backend || {
            echo "Project directory not found. Cloning..."
            git clone https://github.com/Dxstvn/personal-crypto-escrow-backend.git personal-cryptoscrow-backend
            cd personal-cryptoscrow-backend
        }
        
        # Copy the script to project directory and run it
        cp /home/$ec2_user/$script_name .
        ./$script_name
EOF
    
    print_success "$environment deployment completed!"
}

# Function to test remote endpoints
test_endpoints() {
    print_status "Testing remote endpoints..."
    
    print_status "Testing production endpoint..."
    if curl -f -s https://api.clearhold.app/health >/dev/null; then
        PROD_RESPONSE=$(curl -s https://api.clearhold.app/health)
        print_success "Production: $PROD_RESPONSE"
    else
        print_warning "Production endpoint not responding yet (may need a few minutes)"
    fi
    
    print_status "Testing staging endpoint..."
    if curl -f -s https://staging.clearhold.app/health >/dev/null; then
        STAGING_RESPONSE=$(curl -s https://staging.clearhold.app/health)
        print_success "Staging: $STAGING_RESPONSE"
    else
        print_warning "Staging endpoint not responding yet (may need DNS propagation)"
    fi
}

# Main execution
main() {
    echo "Select deployment option:"
    echo "1. Deploy staging only"
    echo "2. Deploy production only"
    echo "3. Deploy both staging and production"
    echo "4. Test endpoints only"
    echo "5. Exit"
    
    read -p "Enter your choice (1-5): " choice
    
    case $choice in
        1)
            check_prerequisites
            deploy_to_ec2 "staging" "$STAGING_EC2_HOST" "$STAGING_EC2_USER" "deploy-staging-to-ec2-updated.sh"
            test_endpoints
            ;;
        2)
            check_prerequisites
            deploy_to_ec2 "production" "$PRODUCTION_EC2_HOST" "$PRODUCTION_EC2_USER" "deploy-production-to-ec2-updated.sh"
            test_endpoints
            ;;
        3)
            check_prerequisites
            deploy_to_ec2 "staging" "$STAGING_EC2_HOST" "$STAGING_EC2_USER" "deploy-staging-to-ec2-updated.sh"
            deploy_to_ec2 "production" "$PRODUCTION_EC2_HOST" "$PRODUCTION_EC2_USER" "deploy-production-to-ec2-updated.sh"
            test_endpoints
            ;;
        4)
            test_endpoints
            ;;
        5)
            print_status "Exiting..."
            exit 0
            ;;
        *)
            print_error "Invalid choice. Please run the script again."
            exit 1
            ;;
    esac
}

# Show current local server status
print_status "Current local server status:"
pm2 list | grep -E "(cryptoescrow|staging)" || echo "No local PM2 processes found"

echo ""
print_warning "IMPORTANT: This will deploy to REMOTE EC2 instances."
print_warning "Your local servers will continue running independently."
echo ""

main

print_success "🎉 Deployment process completed!"

echo "
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 DEPLOYMENT SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 Production: https://api.clearhold.app/health
🎯 Staging: https://staging.clearhold.app/health

📊 To monitor remote servers:
  ssh -i $EC2_KEY_PATH $PRODUCTION_EC2_USER@$PRODUCTION_EC2_HOST 'pm2 status'
  ssh -i $EC2_KEY_PATH $STAGING_EC2_USER@$STAGING_EC2_HOST 'pm2 status'
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
" 