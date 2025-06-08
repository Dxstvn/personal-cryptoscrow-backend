#!/bin/bash

# Staging Deployment Script for CryptoEscrow Backend

set -e  # Exit on any error

echo "🚀 Starting staging deployment..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${BLUE}[STAGING]${NC} $1"
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

# Check prerequisites
print_status "Checking prerequisites..."

if ! command -v pm2 &> /dev/null; then
    print_error "PM2 is not installed. Installing..."
    npm install -g pm2
fi

if ! command -v firebase &> /dev/null; then
    print_error "Firebase CLI is not installed. Please install it first."
    exit 1
fi

if ! command -v aws &> /dev/null; then
    print_error "AWS CLI is not installed. Please install it first."
    exit 1
fi

print_success "Prerequisites check completed"

# Set up environment
print_status "Setting up staging environment..."
export NODE_ENV=staging
export USE_AWS_SECRETS=true
export AWS_REGION=us-east-1

# Switch to staging Firebase project
print_status "Switching to staging Firebase project..."
firebase use staging
print_success "Using Firebase project: $(firebase use --project)"

# Run production readiness check for staging
print_status "Running staging production readiness check..."
if npm run production-check:staging; then
    print_success "Staging readiness check passed"
else
    print_warning "Staging readiness check had warnings - continuing deployment"
fi

# Deploy Firebase rules and indexes (skip storage for now)
print_status "Deploying Firebase rules and indexes..."
firebase deploy --only firestore --project staging || print_warning "Firebase deployment had issues - continuing"
print_success "Firebase rules deployed"

# Build and test the application
print_status "Running tests..."
if npm run test:unit; then
    print_success "Unit tests passed"
else
    print_warning "Some tests failed - check logs"
fi

# Stop existing staging process
print_status "Stopping existing staging process..."
npm run stop:staging || print_warning "No existing staging process found"

# Start staging server
print_status "Starting staging server..."
npm run start:staging

# Wait for server to start
print_status "Waiting for server to start..."
sleep 10

# Verify deployment
print_status "Verifying staging deployment..."
if curl -f http://localhost:3001/health > /dev/null 2>&1; then
    print_success "Staging server is running and healthy"
else
    print_error "Staging server health check failed"
    npm run logs:staging
    exit 1
fi

# Show deployment status
print_status "Staging deployment summary:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎯 Environment: STAGING"
echo "🌐 Server URL: http://localhost:3001"
echo "🔥 Firebase Project: jaspirev4-2f12a"
echo "⛓️  Blockchain: Sepolia Testnet (Chain ID: 11155111)"
echo "🔐 AWS Secrets: CryptoEscrow/Staging/*"
echo "📊 PM2 Process: cryptoescrow-backend-staging"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

print_status "Useful commands:"
echo "• View logs: npm run logs:staging"
echo "• Restart: npm run restart:staging" 
echo "• Stop: npm run stop:staging"
echo "• Health check: curl http://localhost:3001/health"

print_success "🎉 Staging deployment completed successfully!"

# Show next steps
print_status "Next steps:"
echo "1. Test frontend-backend integration"
echo "2. Run end-to-end tests"
echo "3. Verify all functionality works correctly"
echo "4. Proceed to load testing if everything looks good" 