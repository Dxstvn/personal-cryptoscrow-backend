#!/bin/bash

# Script to test AWS Secrets Manager deployment on EC2

echo "🔌 Testing EC2 deployment with AWS Secrets Manager..."

# EC2 instance details
PEM_FILE="./ClearHoldKeyPair.pem"
EC2_USER="ubuntu"  # Change if using different AMI (e.g., ec2-user for Amazon Linux)

# Get EC2 instance IP from AWS
echo "🔍 Finding EC2 instance..."
INSTANCE_IP=$(aws ec2 describe-instances \
    --filters "Name=tag:Name,Values=CryptoEscrow*" "Name=instance-state-name,Values=running" \
    --query "Reservations[0].Instances[0].PublicIpAddress" \
    --output text \
    --region us-east-1)

if [ "$INSTANCE_IP" == "None" ] || [ -z "$INSTANCE_IP" ]; then
    echo "❌ No running EC2 instance found with tag Name=CryptoEscrow*"
    echo "Please specify the EC2 instance IP manually:"
    read -p "EC2 Instance IP: " INSTANCE_IP
fi

echo "📍 EC2 Instance IP: $INSTANCE_IP"

# Test SSH connection
echo "🔐 Testing SSH connection..."
ssh -o StrictHostKeyChecking=no -i "$PEM_FILE" "$EC2_USER@$INSTANCE_IP" "echo '✅ SSH connection successful'"

if [ $? -ne 0 ]; then
    echo "❌ SSH connection failed"
    echo "Please check:"
    echo "1. PEM file permissions (should be 400)"
    echo "2. Security group allows SSH (port 22)"
    echo "3. Instance IP is correct"
    exit 1
fi

# Copy deployment files to EC2
echo "📤 Copying deployment files to EC2..."
scp -i "$PEM_FILE" test-aws-secrets.js "$EC2_USER@$INSTANCE_IP":~/personal-cryptoscrow-backend/
scp -i "$PEM_FILE" scripts/deploy-with-aws-secrets.sh "$EC2_USER@$INSTANCE_IP":~/personal-cryptoscrow-backend/scripts/

# Run deployment on EC2
echo "🚀 Running deployment on EC2..."
ssh -i "$PEM_FILE" "$EC2_USER@$INSTANCE_IP" << 'EOF'
cd ~/personal-cryptoscrow-backend

# Make scripts executable
chmod +x test-aws-secrets.js
chmod +x scripts/deploy-with-aws-secrets.sh

# Test AWS Secrets Manager
echo "🔐 Testing AWS Secrets Manager on EC2..."
export NODE_ENV=production
export USE_AWS_SECRETS=true
export AWS_REGION=us-east-1

node test-aws-secrets.js

if [ $? -eq 0 ]; then
    echo "✅ AWS Secrets Manager working on EC2!"
    
    # Check PM2 status
    pm2 status
    
    echo "Ready to deploy with: ./scripts/deploy-with-aws-secrets.sh"
else
    echo "❌ AWS Secrets Manager test failed on EC2"
    echo "Checking IAM role..."
    curl -s http://169.254.169.254/latest/meta-data/iam/security-credentials/
fi
EOF

echo "✅ EC2 deployment test complete!"