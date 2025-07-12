#!/bin/bash

# Script to create a new EC2 instance with correct key pair and migrate settings

set -e

echo "🚀 Creating new EC2 instance with correct key pair..."

# Configuration
OLD_INSTANCE_ID="i-0b25b44712540fc6b"
KEY_NAME="ClearHoldKeyPair"
REGION="us-east-1"

# Step 1: Get current instance details
echo "📋 Getting current instance configuration..."
INSTANCE_INFO=$(aws ec2 describe-instances --instance-ids $OLD_INSTANCE_ID --region $REGION --query 'Reservations[0].Instances[0]')

# Extract important details
INSTANCE_TYPE=$(echo $INSTANCE_INFO | jq -r '.InstanceType')
SUBNET_ID=$(echo $INSTANCE_INFO | jq -r '.SubnetId')
SECURITY_GROUP_IDS=$(echo $INSTANCE_INFO | jq -r '.SecurityGroups[].GroupId' | tr '\n' ' ')
IAM_ROLE=$(echo $INSTANCE_INFO | jq -r '.IamInstanceProfile.Arn' | cut -d'/' -f2)
AVAILABILITY_ZONE=$(echo $INSTANCE_INFO | jq -r '.Placement.AvailabilityZone')

echo "Instance Type: $INSTANCE_TYPE"
echo "Subnet: $SUBNET_ID"
echo "Security Groups: $SECURITY_GROUP_IDS"
echo "IAM Role: $IAM_ROLE"
echo "AZ: $AVAILABILITY_ZONE"

# Step 2: Create AMI from current instance
echo -e "\n📸 Creating AMI from current instance..."
AMI_NAME="ClearHoldBackend-Migration-$(date +%Y%m%d-%H%M%S)"
AMI_ID=$(aws ec2 create-image \
    --instance-id $OLD_INSTANCE_ID \
    --name "$AMI_NAME" \
    --description "Migration AMI for ClearHold Backend" \
    --no-reboot \
    --region $REGION \
    --query 'ImageId' \
    --output text)

echo "AMI ID: $AMI_ID"
echo "⏳ Waiting for AMI to be available (this may take a few minutes)..."

aws ec2 wait image-available --image-ids $AMI_ID --region $REGION
echo "✅ AMI is ready!"

# Step 3: Launch new instance
echo -e "\n🚀 Launching new instance with correct key pair..."
NEW_INSTANCE_ID=$(aws ec2 run-instances \
    --image-id $AMI_ID \
    --instance-type $INSTANCE_TYPE \
    --key-name $KEY_NAME \
    --subnet-id $SUBNET_ID \
    --security-group-ids $SECURITY_GROUP_IDS \
    --iam-instance-profile Name=$IAM_ROLE \
    --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=ClearHoldBackend-New}]" \
    --region $REGION \
    --query 'Instances[0].InstanceId' \
    --output text)

echo "New Instance ID: $NEW_INSTANCE_ID"
echo "⏳ Waiting for instance to be running..."

aws ec2 wait instance-running --instance-ids $NEW_INSTANCE_ID --region $REGION
echo "✅ Instance is running!"

# Get new instance public IP
NEW_PUBLIC_IP=$(aws ec2 describe-instances \
    --instance-ids $NEW_INSTANCE_ID \
    --region $REGION \
    --query 'Reservations[0].Instances[0].PublicIpAddress' \
    --output text)

echo "New Instance Public IP: $NEW_PUBLIC_IP"

# Step 4: Get target group ARNs
echo -e "\n🎯 Finding target groups..."
TARGET_GROUP_ARNS=$(aws elbv2 describe-target-groups \
    --region $REGION \
    --query "TargetGroups[?contains(TargetGroupName, 'cryptoescrow')].TargetGroupArn" \
    --output text)

# Step 5: Update target groups
echo -e "\n🔄 Updating target groups..."
for TG_ARN in $TARGET_GROUP_ARNS; do
    TG_NAME=$(aws elbv2 describe-target-groups --target-group-arns $TG_ARN --region $REGION --query 'TargetGroups[0].TargetGroupName' --output text)
    echo "Updating target group: $TG_NAME"
    
    # Deregister old instance
    aws elbv2 deregister-targets \
        --target-group-arn $TG_ARN \
        --targets Id=$OLD_INSTANCE_ID \
        --region $REGION || true
    
    # Register new instance
    aws elbv2 register-targets \
        --target-group-arn $TG_ARN \
        --targets Id=$NEW_INSTANCE_ID \
        --region $REGION
done

echo -e "\n✅ Migration complete!"
echo "=====================================
echo "New Instance Details:"
echo "  ID: $NEW_INSTANCE_ID"
echo "  Public IP: $NEW_PUBLIC_IP"
echo "  Key Pair: $KEY_NAME"
echo ""
echo "Next Steps:"
echo "1. SSH into new instance:"
echo "   ssh -i ${KEY_NAME}.pem ubuntu@${NEW_PUBLIC_IP}"
echo ""
echo "2. Verify application is running:"
echo "   pm2 status"
echo ""
echo "3. Check target group health:"
echo "   aws elbv2 describe-target-health --target-group-arn <ARN> --region $REGION"
echo ""
echo "4. Once verified, stop old instance:"
echo "   aws ec2 stop-instances --instance-ids $OLD_INSTANCE_ID --region $REGION"
echo ""
echo "5. After testing, terminate old instance:"
echo "   aws ec2 terminate-instances --instance-ids $OLD_INSTANCE_ID --region $REGION"
echo "====================================="