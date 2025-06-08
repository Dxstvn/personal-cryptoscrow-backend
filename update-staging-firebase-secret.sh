#!/bin/bash

# 🔑 UPDATE STAGING FIREBASE SECRET
# This script helps update the Firebase service account in AWS Secrets Manager

echo "🔑 Updating Staging Firebase Secret in AWS Secrets Manager"
echo "========================================================="

# Path to your downloaded service account file
SERVICE_ACCOUNT_FILE="/Users/dustinjasmin/Downloads/escrowstaging-firebase-adminsdk-fbsvc-91e9302e04.json"

if [ ! -f "$SERVICE_ACCOUNT_FILE" ]; then
    echo "❌ Service account file not found at: $SERVICE_ACCOUNT_FILE"
    echo ""
    echo "Please update the SERVICE_ACCOUNT_FILE path in this script to point to your downloaded Firebase service account JSON file."
    exit 1
fi

echo "✅ Found service account file: $SERVICE_ACCOUNT_FILE"
echo ""
echo "📋 Updating AWS Secrets Manager..."

# Update the secret with the complete service account JSON
aws secretsmanager update-secret \
    --secret-id "CryptoEscrow/Staging/Firebase" \
    --secret-string "$(cat "$SERVICE_ACCOUNT_FILE")" \
    --region us-east-1

if [ $? -eq 0 ]; then
    echo "✅ Successfully updated Firebase service account in AWS Secrets Manager!"
    echo ""
    echo "🧪 Testing the secret..."
    
    # Test that we can retrieve the secret
    aws secretsmanager get-secret-value \
        --secret-id "CryptoEscrow/Staging/Firebase" \
        --region us-east-1 \
        --query "SecretString" \
        --output text | jq .project_id
    
    echo ""
    echo "🚀 Next steps:"
    echo "1. Run your staging environment: ./fix-staging-environment.sh"
    echo "2. Test the health endpoint: curl http://localhost:3001/health"
    echo "3. Check PM2 logs: pm2 logs cryptoescrow-backend-staging"
else
    echo "❌ Failed to update AWS Secrets Manager. Check your AWS credentials and permissions."
fi 