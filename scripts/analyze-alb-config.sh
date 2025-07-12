#!/bin/bash

# Script to analyze ALB configuration for api.clearhold.app

set -e

echo "🔍 Analyzing ALB configuration for api.clearhold.app..."
echo "=================================================="

# Configuration
REGION="us-east-1"
DOMAIN="api.clearhold.app"
EC2_SECURITY_GROUP="sg-069c85841502a9525"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_section() {
    echo -e "\n${BLUE}$1${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

# Step 1: Find ALB by DNS name
print_section "1. Finding ALB for domain: $DOMAIN"
ALB_INFO=$(aws elbv2 describe-load-balancers --region $REGION --query "LoadBalancers[?DNSName=='$DOMAIN' || contains(DNSName, '$DOMAIN')]" 2>/dev/null || echo "[]")

if [ "$ALB_INFO" = "[]" ]; then
    echo "Direct domain match not found. Searching by tags and DNS records..."
    # Try to find by tags
    ALB_INFO=$(aws elbv2 describe-load-balancers --region $REGION --query "LoadBalancers[*]" 2>/dev/null || echo "[]")
fi

# Parse ALB information
echo "$ALB_INFO" | jq -r '.[] | "Name: \(.LoadBalancerName)\nARN: \(.LoadBalancerArn)\nDNS: \(.DNSName)\nScheme: \(.Scheme)\nType: \(.Type)"' 2>/dev/null || echo "No ALBs found"

# Step 2: Check Route53 for domain
print_section "2. Checking Route53 for $DOMAIN"
HOSTED_ZONES=$(aws route53 list-hosted-zones --query "HostedZones[?contains(Name, 'clearhold.app')]" --region $REGION 2>/dev/null || echo "[]")

if [ "$HOSTED_ZONES" != "[]" ]; then
    ZONE_ID=$(echo "$HOSTED_ZONES" | jq -r '.[0].Id' | cut -d'/' -f3)
    if [ ! -z "$ZONE_ID" ]; then
        echo "Found hosted zone: $ZONE_ID"
        RECORD_SETS=$(aws route53 list-resource-record-sets --hosted-zone-id $ZONE_ID --query "ResourceRecordSets[?Name=='$DOMAIN.' || Name=='$DOMAIN']" 2>/dev/null || echo "[]")
        echo "$RECORD_SETS" | jq -r '.[] | "Type: \(.Type)\nAlias Target: \(.AliasTarget.DNSName // "N/A")"' 2>/dev/null || echo "No records found"
    fi
else
    echo "No hosted zone found for clearhold.app"
fi

# Step 3: Find all ALBs and their security groups
print_section "3. Listing all Application Load Balancers"
ALL_ALBS=$(aws elbv2 describe-load-balancers --region $REGION --query "LoadBalancers[?Type=='application']" 2>/dev/null || echo "[]")

echo "$ALL_ALBS" | jq -r '.[] | "\nName: \(.LoadBalancerName)\nARN: \(.LoadBalancerArn)\nDNS: \(.DNSName)\nSecurity Groups: \(.SecurityGroups | join(", "))"' 2>/dev/null || echo "No ALBs found"

# Step 4: Find target groups
print_section "4. Finding Target Groups"
TARGET_GROUPS=$(aws elbv2 describe-target-groups --region $REGION 2>/dev/null || echo "[]")

echo "$TARGET_GROUPS" | jq -r '.TargetGroups[] | select(.Protocol == "HTTP" or .Protocol == "HTTPS") | "\nName: \(.TargetGroupName)\nPort: \(.Port)\nProtocol: \(.Protocol)\nTarget Type: \(.TargetType)\nARN: \(.TargetGroupArn)"' 2>/dev/null || echo "No target groups found"

# Step 5: Check listeners for ALBs
print_section "5. Checking ALB Listeners and Rules"
if [ "$ALL_ALBS" != "[]" ]; then
    ALB_ARNS=$(echo "$ALL_ALBS" | jq -r '.[].LoadBalancerArn' 2>/dev/null)
    for ALB_ARN in $ALB_ARNS; do
        ALB_NAME=$(echo "$ALL_ALBS" | jq -r ".[] | select(.LoadBalancerArn==\"$ALB_ARN\") | .LoadBalancerName" 2>/dev/null)
        echo -e "\n${YELLOW}ALB: $ALB_NAME${NC}"
        
        LISTENERS=$(aws elbv2 describe-listeners --load-balancer-arn "$ALB_ARN" --region $REGION 2>/dev/null || echo "[]")
        echo "$LISTENERS" | jq -r '.Listeners[] | "  Port: \(.Port), Protocol: \(.Protocol)"' 2>/dev/null || echo "  No listeners found"
    done
fi

# Step 6: Analyze EC2 security group
print_section "6. Analyzing EC2 Security Group: $EC2_SECURITY_GROUP"
SG_INFO=$(aws ec2 describe-security-groups --group-ids $EC2_SECURITY_GROUP --region $REGION 2>/dev/null || echo "{}")

if [ "$SG_INFO" != "{}" ]; then
    echo "Security Group Name: $(echo "$SG_INFO" | jq -r '.SecurityGroups[0].GroupName' 2>/dev/null)"
    echo -e "\n${YELLOW}Inbound Rules:${NC}"
    echo "$SG_INFO" | jq -r '.SecurityGroups[0].IpPermissions[] | "Port: \(.FromPort // "All")-\(.ToPort // "All"), Protocol: \(.IpProtocol), Source: \(.IpRanges[0].CidrIp // .UserIdGroupPairs[0].GroupId // "Unknown")"' 2>/dev/null || echo "No rules found"
fi

# Step 7: Find instances using the security group
print_section "7. EC2 Instances using security group $EC2_SECURITY_GROUP"
INSTANCES=$(aws ec2 describe-instances --filters "Name=instance.group-id,Values=$EC2_SECURITY_GROUP" --region $REGION --query "Reservations[].Instances[]" 2>/dev/null || echo "[]")

echo "$INSTANCES" | jq -r '.[] | "Instance ID: \(.InstanceId)\nState: \(.State.Name)\nPublic IP: \(.PublicIpAddress // "N/A")\nPrivate IP: \(.PrivateIpAddress)"' 2>/dev/null || echo "No instances found"

# Step 8: Check target health for instances
print_section "8. Checking Target Health"
if [ "$TARGET_GROUPS" != "[]" ]; then
    TG_ARNS=$(echo "$TARGET_GROUPS" | jq -r '.TargetGroups[].TargetGroupArn' 2>/dev/null)
    for TG_ARN in $TG_ARNS; do
        TG_NAME=$(echo "$TARGET_GROUPS" | jq -r ".TargetGroups[] | select(.TargetGroupArn==\"$TG_ARN\") | .TargetGroupName" 2>/dev/null)
        echo -e "\n${YELLOW}Target Group: $TG_NAME${NC}"
        
        TARGET_HEALTH=$(aws elbv2 describe-target-health --target-group-arn "$TG_ARN" --region $REGION 2>/dev/null || echo "{}")
        echo "$TARGET_HEALTH" | jq -r '.TargetHealthDescriptions[] | "  Target: \(.Target.Id), Port: \(.Target.Port), State: \(.TargetHealth.State)"' 2>/dev/null || echo "  No targets registered"
    done
fi

# Step 9: Recommendations
print_section "9. Security Recommendations for Port 3000"
echo "To properly secure port 3000 access from ALB only:"
echo ""
echo "1. Identify the ALB security group from the output above"
echo "2. Update the EC2 security group ($EC2_SECURITY_GROUP) inbound rules:"
echo "   - Remove the current 0.0.0.0/0 rule for port 3000"
echo "   - Add a new rule allowing port 3000 from the ALB security group only"
echo ""
echo "Example AWS CLI command:"
echo -e "${GREEN}# Remove current rule allowing port 3000 from anywhere${NC}"
echo "aws ec2 revoke-security-group-ingress \\"
echo "  --group-id $EC2_SECURITY_GROUP \\"
echo "  --protocol tcp \\"
echo "  --port 3000 \\"
echo "  --cidr 0.0.0.0/0 \\"
echo "  --region $REGION"
echo ""
echo -e "${GREEN}# Add rule allowing port 3000 from ALB security group only${NC}"
echo "aws ec2 authorize-security-group-ingress \\"
echo "  --group-id $EC2_SECURITY_GROUP \\"
echo "  --protocol tcp \\"
echo "  --port 3000 \\"
echo "  --source-group ALB_SECURITY_GROUP_ID \\"
echo "  --region $REGION"

echo -e "\n${BLUE}Analysis complete!${NC}"