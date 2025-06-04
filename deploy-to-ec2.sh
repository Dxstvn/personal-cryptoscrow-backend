#!/bin/bash

# EC2 Firebase Deployment Script
# Run this script on your EC2 server to update Node.js, npm, and test Firebase

set -e  # Exit on any error

echo "🚀 EC2 Firebase Deployment Script"
echo "=================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check current versions
echo ""
print_status "Checking current versions..."

if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    print_status "Current Node.js version: $NODE_VERSION"
else
    print_warning "Node.js not found"
    NODE_VERSION=""
fi

if command -v npm &> /dev/null; then
    NPM_VERSION=$(npm --version)
    print_status "Current npm version: $NPM_VERSION"
else
    print_warning "npm not found"
    NPM_VERSION=""
fi

# Check if we need to update Node.js
REQUIRED_NODE_MAJOR=18
CURRENT_NODE_MAJOR=0

if [[ ! -z "$NODE_VERSION" ]]; then
    CURRENT_NODE_MAJOR=$(echo $NODE_VERSION | sed 's/v\([0-9]*\).*/\1/')
fi

echo ""
if [[ $CURRENT_NODE_MAJOR -lt $REQUIRED_NODE_MAJOR ]]; then
    print_warning "Node.js $REQUIRED_NODE_MAJOR+ required for Firebase 11.6.1"
    print_status "Installing Node.js 20 LTS via NodeSource repository..."
    
    # Install Node.js 20 LTS on Amazon Linux 2
    curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
    sudo yum install -y nodejs
    
    # Verify installation
    NEW_NODE_VERSION=$(node --version)
    NEW_NPM_VERSION=$(npm --version)
    print_status "✅ Updated Node.js to: $NEW_NODE_VERSION"
    print_status "✅ Updated npm to: $NEW_NPM_VERSION"
else
    print_status "✅ Node.js version is compatible"
fi

# Ensure we have the latest npm
print_status "Updating npm to latest version..."
sudo npm install -g npm@latest

echo ""
print_status "Final versions:"
node --version
npm --version

# Navigate to project directory
echo ""
print_status "Navigating to project directory..."
cd /home/ec2-user/personal-cryptoscrow-backend || {
    print_error "Project directory not found. Please update the path in this script."
    exit 1
}

# Git pull latest changes
echo ""
print_status "Pulling latest code from git..."
git pull origin main || {
    print_warning "Git pull failed. Please check git configuration and try manually."
}

# Install/update dependencies
echo ""
print_status "Installing npm dependencies..."
npm install

# Check if Firebase CLI is installed globally
echo ""
if ! command -v firebase &> /dev/null; then
    print_status "Installing Firebase CLI globally..."
    sudo npm install -g firebase-tools
else
    print_status "✅ Firebase CLI already installed"
    firebase --version
fi

# Check if Jest is available (for running tests)
echo ""
if npm list jest &> /dev/null; then
    print_status "✅ Jest is available for testing"
else
    print_warning "Jest not found in dependencies"
fi

# Try running tests
echo ""
print_status "Attempting to run tests..."
echo "=========================="

# Set environment variables that might be needed
export NODE_ENV=test
export NODE_OPTIONS=--experimental-vm-modules

# Run tests with timeout and error handling
timeout 300 npm test || {
    EXIT_CODE=$?
    if [[ $EXIT_CODE -eq 124 ]]; then
        print_error "Tests timed out after 5 minutes"
    else
        print_error "Tests failed with exit code: $EXIT_CODE"
    fi
    
    echo ""
    print_status "Checking for common Firebase issues..."
    
    # Check Node.js version in case it changed
    print_status "Node.js version: $(node --version)"
    print_status "npm version: $(npm --version)"
    
    # Check if firebase package is properly installed
    if npm list firebase &> /dev/null; then
        FIREBASE_VERSION=$(npm list firebase --depth=0 | grep firebase | sed 's/.*firebase@\([0-9.]*\).*/\1/')
        print_status "Firebase version: $FIREBASE_VERSION"
    else
        print_error "Firebase package not found in dependencies"
    fi
    
    # Check common Firebase version compatibility issues
    print_status "Checking Firebase compatibility..."
    
    echo ""
    print_status "Common solutions for Firebase version issues:"
    echo "1. Ensure you're using Node.js 18+ (current: $(node --version))"
    echo "2. Clear npm cache: npm cache clean --force"
    echo "3. Delete node_modules and reinstall: rm -rf node_modules && npm install"
    echo "4. Check if all Firebase dependencies are compatible"
    
    exit $EXIT_CODE
}

echo ""
print_status "🎉 All tests passed successfully!"
print_status "Your EC2 server is now ready with Firebase $(npm list firebase --depth=0 | grep firebase | sed 's/.*firebase@\([0-9.]*\).*/\1/' || echo 'unknown')" 