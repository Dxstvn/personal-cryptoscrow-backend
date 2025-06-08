#!/bin/bash

# Configure Application Load Balancer for Staging
# This script adds staging.clearhold.app to your existing ALB

set -e

echo "🔧 Configuring ALB for staging.clearhold.app..."

# Get existing resources
ALB_ARN="arn:aws:elasticloadbalancing:us-east-1:407813178514:loadbalancer/app/clearhold-app-alb/24298611ecbe24a1"
LISTENER_ARN="arn:aws:elasticloadbalancing:us-east-1:407813178514:listener/app/clearhold-app-alb/24298611ecbe24a1/19760437ca85ba69"

echo "🔍 Using existing ALB: clearhold-app-alb"
echo "🔍 Using existing HTTPS listener"

# Get VPC ID from existing target group
VPC_ID=$(aws elbv2 describe-target-groups --names "cryptoescrow-backend-3000" --query 'TargetGroups[0].VpcId' --output text)
echo "🌐 VPC ID: $VPC_ID"

# Get existing instance ID from production target group
INSTANCE_ID=$(aws elbv2 describe-target-health --target-group-arn $(aws elbv2 describe-target-groups --names "cryptoescrow-backend-3000" --query 'TargetGroups[0].TargetGroupArn' --output text) --query 'TargetHealthDescriptions[0].Target.Id' --output text)
echo "🖥️  Instance ID: $INSTANCE_ID"

# Create staging target group
echo "📦 Creating staging target group..."
STAGING_TG_ARN=$(aws elbv2 create-target-group \
    --name "cryptoescrow-backend-staging-3001" \
    --protocol HTTP \
    --port 3001 \
    --vpc-id $VPC_ID \
    --health-check-path "/health" \
    --health-check-interval-seconds 30 \
    --health-check-timeout-seconds 5 \
    --healthy-threshold-count 2 \
    --unhealthy-threshold-count 2 \
    --query 'TargetGroups[0].TargetGroupArn' \
    --output text)

echo "✅ Created staging target group: $STAGING_TG_ARN"

# Register EC2 instance with staging target group
echo "🎯 Registering instance with staging target group..."
aws elbv2 register-targets \
    --target-group-arn $STAGING_TG_ARN \
    --targets Id=$INSTANCE_ID,Port=3001

echo "✅ Registered instance $INSTANCE_ID:3001 with staging target group"

# Create listener rule for staging.clearhold.app
echo "📋 Creating listener rule for staging.clearhold.app..."
RULE_ARN=$(aws elbv2 create-rule \
    --listener-arn $LISTENER_ARN \
    --priority 90 \
    --conditions Field=host-header,Values=staging.clearhold.app \
    --actions Type=forward,TargetGroupArn=$STAGING_TG_ARN \
    --query 'Rules[0].RuleArn' \
    --output text)

echo "✅ Created listener rule: $RULE_ARN"

# Wait for target to become healthy
echo "⏳ Waiting for staging target to become healthy..."
echo "This may take 1-2 minutes..."

for i in {1..12}; do
    HEALTH_STATUS=$(aws elbv2 describe-target-health \
        --target-group-arn $STAGING_TG_ARN \
        --targets Id=$INSTANCE_ID,Port=3001 \
        --query 'TargetHealthDescriptions[0].TargetHealth.State' \
        --output text)
    
    echo "Health check $i/12: $HEALTH_STATUS"
    
    if [ "$HEALTH_STATUS" = "healthy" ]; then
        echo "✅ Target is healthy!"
        break
    elif [ "$HEALTH_STATUS" = "unhealthy" ]; then
        echo "❌ Target is unhealthy. Checking logs..."
        # You would need to SSH to instance to check logs
        break
    fi
    
    sleep 10
done

echo "
🎉 ALB Configuration Complete!

✅ Target Group: cryptoescrow-backend-staging-3001
✅ Listener Rule: staging.clearhold.app → port 3001
✅ Instance registered: $INSTANCE_ID:3001

🧪 Test Commands:
# Check target health
aws elbv2 describe-target-health --target-group-arn $STAGING_TG_ARN

# Test staging endpoint (should work in 1-2 minutes)
curl -i https://staging.clearhold.app/health

📋 Next Steps:
1. Ensure your staging app is running on EC2 port 3001
2. Update DNS (if needed) - should use same ALB
3. Test the staging environment
"

# Save important ARNs for reference
echo "# Important ARNs for reference:" > staging-alb-info.txt
echo "ALB_ARN=$ALB_ARN" >> staging-alb-info.txt
echo "STAGING_TG_ARN=$STAGING_TG_ARN" >> staging-alb-info.txt
echo "LISTENER_ARN=$LISTENER_ARN" >> staging-alb-info.txt
echo "RULE_ARN=$RULE_ARN" >> staging-alb-info.txt
echo "INSTANCE_ID=$INSTANCE_ID" >> staging-alb-info.txt

echo "📄 Saved configuration details to staging-alb-info.txt" 