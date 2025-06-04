#!/bin/bash

# Script to copy the deployment script to EC2 and run it
# Usage: ./deploy-script-to-ec2.sh EC2_IP_ADDRESS

set -e

if [ $# -eq 0 ]; then
    echo "Usage: $0 EC2_IP_ADDRESS"
    echo "Example: $0 12.34.56.78"
    exit 1
fi

EC2_IP=$1
KEY_FILE="CryptoZombies!01.pem"

echo "🚀 Copying deployment script to EC2 server..."

# Check if key file exists
if [ ! -f "$KEY_FILE" ]; then
    echo "❌ Key file '$KEY_FILE' not found in current directory"
    echo "Please make sure the key file is in the current directory"
    exit 1
fi

# Set correct permissions on key file
chmod 400 "$KEY_FILE"

# Copy the deployment script to EC2
echo "📤 Copying deploy-to-ec2.sh to EC2 server..."
scp -i "$KEY_FILE" deploy-to-ec2.sh ec2-user@$EC2_IP:/home/ec2-user/

# SSH into EC2 and run the script
echo "🔌 Connecting to EC2 server and running deployment script..."
ssh -i "$KEY_FILE" ec2-user@$EC2_IP << 'EOF'
    # Make the script executable
    chmod +x /home/ec2-user/deploy-to-ec2.sh
    
    # Run the deployment script
    /home/ec2-user/deploy-to-ec2.sh
EOF

echo "✅ Deployment complete!" 