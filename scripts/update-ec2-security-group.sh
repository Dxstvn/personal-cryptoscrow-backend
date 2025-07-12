#!/bin/bash

# Script to update EC2 security group to allow port 3000 only from ALB

set -e

echo "🔒 Updating EC2 Security Group for ALB-only access on port 3000"
echo "=============================================================="

# Configuration
REGION="us-east-1"
EC2_SECURITY_GROUP="sg-069c85841502a9525"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_step() {
    echo -e "\n${BLUE}Step $1:${NC} $2"
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

# Step 1: Find ALB security group
print_step "1" "Finding Application Load Balancer and its security group"

# First, try to find ALBs that might be routing to our EC2 instance
# Look for target groups that contain our instance
INSTANCE_IDS=$(aws ec2 describe-instances \
    --filters "Name=instance.group-id,Values=$EC2_SECURITY_GROUP" \
    --query "Reservations[].Instances[].InstanceId" \
    --output text \
    --region $REGION)

echo "EC2 instances using security group $EC2_SECURITY_GROUP:"
echo "$INSTANCE_IDS"

# Find target groups containing these instances
ALB_SECURITY_GROUPS=""
for INSTANCE_ID in $INSTANCE_IDS; do
    echo -e "\nChecking instance: $INSTANCE_ID"
    
    # Get all target groups this instance is registered to
    TARGET_GROUPS=$(aws elbv2 describe-target-health \
        --query "TargetHealthDescriptions[?Target.Id=='$INSTANCE_ID'].TargetGroupArn" \
        --output text \
        --region $REGION 2>/dev/null || echo "")
    
    if [ ! -z "$TARGET_GROUPS" ]; then
        for TG_ARN in $TARGET_GROUPS; do
            # Get load balancers using this target group
            LB_ARNS=$(aws elbv2 describe-listeners \
                --query "Listeners[?DefaultActions[?TargetGroupArn=='$TG_ARN']].LoadBalancerArn" \
                --output text \
                --region $REGION 2>/dev/null || echo "")
            
            if [ -z "$LB_ARNS" ]; then
                # Try alternative query for rules
                LB_ARNS=$(aws elbv2 describe-rules \
                    --query "Rules[?Actions[?TargetGroupArn=='$TG_ARN']].ListenerArn" \
                    --output text \
                    --region $REGION 2>/dev/null | while read LISTENER_ARN; do
                        aws elbv2 describe-listeners \
                            --listener-arns "$LISTENER_ARN" \
                            --query "Listeners[0].LoadBalancerArn" \
                            --output text \
                            --region $REGION 2>/dev/null
                    done | sort -u)
            fi
            
            for LB_ARN in $LB_ARNS; do
                if [ ! -z "$LB_ARN" ]; then
                    # Get ALB details
                    ALB_INFO=$(aws elbv2 describe-load-balancers \
                        --load-balancer-arns "$LB_ARN" \
                        --query "LoadBalancers[0]" \
                        --region $REGION)
                    
                    ALB_NAME=$(echo "$ALB_INFO" | jq -r '.LoadBalancerName')
                    ALB_DNS=$(echo "$ALB_INFO" | jq -r '.DNSName')
                    ALB_SG=$(echo "$ALB_INFO" | jq -r '.SecurityGroups[]' | head -n1)
                    
                    echo -e "\n${GREEN}Found ALB:${NC}"
                    echo "  Name: $ALB_NAME"
                    echo "  DNS: $ALB_DNS"
                    echo "  Security Group: $ALB_SG"
                    
                    if [ ! -z "$ALB_SG" ]; then
                        ALB_SECURITY_GROUPS="$ALB_SECURITY_GROUPS $ALB_SG"
                    fi
                fi
            done
        done
    fi
done

# Remove duplicates
ALB_SECURITY_GROUPS=$(echo "$ALB_SECURITY_GROUPS" | tr ' ' '\n' | sort -u | tr '\n' ' ')

if [ -z "$ALB_SECURITY_GROUPS" ]; then
    print_error "No ALB security groups found routing to your EC2 instance"
    echo "Please ensure your EC2 instance is registered as a target in an ALB target group"
    exit 1
fi

echo -e "\n${GREEN}ALB Security Groups found:${NC} $ALB_SECURITY_GROUPS"

# Step 2: Check current security group rules
print_step "2" "Checking current inbound rules for port 3000"

CURRENT_RULES=$(aws ec2 describe-security-groups \
    --group-ids $EC2_SECURITY_GROUP \
    --query "SecurityGroups[0].IpPermissions[?FromPort==\`3000\` && ToPort==\`3000\`]" \
    --region $REGION)

echo "Current rules for port 3000:"
echo "$CURRENT_RULES" | jq -r '.[] | "Protocol: \(.IpProtocol), Source: \(.IpRanges[0].CidrIp // .UserIdGroupPairs[0].GroupId // "Unknown")"'

# Step 3: Update security group rules
print_step "3" "Updating security group rules"

# Remove existing rules for port 3000 from 0.0.0.0/0
echo -e "\n${YELLOW}Removing public access to port 3000...${NC}"
aws ec2 revoke-security-group-ingress \
    --group-id $EC2_SECURITY_GROUP \
    --ip-permissions '[{"IpProtocol": "tcp", "FromPort": 3000, "ToPort": 3000, "IpRanges": [{"CidrIp": "0.0.0.0/0"}]}]' \
    --region $REGION 2>/dev/null && print_success "Removed public access" || print_warning "No public access rule found"

# Add rules for each ALB security group
for ALB_SG in $ALB_SECURITY_GROUPS; do
    echo -e "\n${YELLOW}Adding rule for ALB security group: $ALB_SG${NC}"
    
    # Check if rule already exists
    EXISTING_RULE=$(aws ec2 describe-security-groups \
        --group-ids $EC2_SECURITY_GROUP \
        --query "SecurityGroups[0].IpPermissions[?FromPort==\`3000\` && ToPort==\`3000\` && UserIdGroupPairs[?GroupId==\`$ALB_SG\`]]" \
        --region $REGION)
    
    if [ "$EXISTING_RULE" = "[]" ]; then
        aws ec2 authorize-security-group-ingress \
            --group-id $EC2_SECURITY_GROUP \
            --protocol tcp \
            --port 3000 \
            --source-group $ALB_SG \
            --region $REGION && print_success "Added rule for $ALB_SG" || print_error "Failed to add rule for $ALB_SG"
    else
        print_warning "Rule already exists for $ALB_SG"
    fi
done

# Step 4: Verify the changes
print_step "4" "Verifying security group changes"

UPDATED_RULES=$(aws ec2 describe-security-groups \
    --group-ids $EC2_SECURITY_GROUP \
    --query "SecurityGroups[0].IpPermissions[?FromPort==\`3000\` && ToPort==\`3000\`]" \
    --region $REGION)

echo -e "\n${GREEN}Updated rules for port 3000:${NC}"
echo "$UPDATED_RULES" | jq -r '.[] | "Protocol: \(.IpProtocol), Source: \(.UserIdGroupPairs[0].GroupId // .IpRanges[0].CidrIp // "Unknown"), Description: \(.UserIdGroupPairs[0].Description // .IpRanges[0].Description // "ALB access")"'

# Step 5: Test connectivity
print_step "5" "Testing recommendations"

echo -e "\n${BLUE}To test the configuration:${NC}"
echo "1. From the internet (should fail):"
echo "   curl -I http://<EC2-PUBLIC-IP>:3000/health"
echo ""
echo "2. Through the ALB (should work):"
echo "   curl -I https://api.clearhold.app/health"
echo ""
echo "3. Check ALB target health:"
for ALB_SG in $ALB_SECURITY_GROUPS; do
    echo "   aws elbv2 describe-target-health --target-group-arn <TARGET-GROUP-ARN> --region $REGION"
done

print_success "Security group update complete!"
echo -e "\n${YELLOW}Important:${NC} Your application on port 3000 is now only accessible through the ALB."
echo "Direct access from the internet is blocked for security."