# ALB Security Configuration Analysis for api.clearhold.app

## Overview

This document provides a comprehensive analysis of the Application Load Balancer (ALB) configuration for api.clearhold.app and recommendations for securing port 3000 access.

## Current Setup

### EC2 Instance Security Group
- **Security Group ID**: `sg-069c85841502a9525`
- **Current Issue**: Port 3000 is currently open to the entire internet (0.0.0.0/0)
- **Goal**: Restrict port 3000 access to only the ALB

### Infrastructure Components

Based on the codebase analysis:

1. **CloudFormation Template** (`aws-deployment/cloudformation.yaml`):
   - Creates a VPC with public subnet
   - Sets up an EC2 instance with a security group
   - Currently allows port 3000 from 0.0.0.0/0
   - No ALB defined in the base template

2. **Instance Migration Script** (`scripts/create-new-instance.sh`):
   - Shows that ALB and target groups exist
   - Uses `aws elbv2` commands to manage target groups
   - Indicates the infrastructure uses Application Load Balancers

## Analysis Steps

### 1. Find the ALB for api.clearhold.app

Run the analysis script to discover:
```bash
./scripts/analyze-alb-config.sh
```

This script will:
- Search for ALBs by DNS name
- Check Route53 records for api.clearhold.app
- List all ALBs and their security groups
- Find target groups and their configurations
- Analyze the EC2 security group rules

### 2. Identify ALB Security Group

The ALB serving api.clearhold.app will have:
- A specific security group attached to it
- Listeners on ports 80 (HTTP) and/or 443 (HTTPS)
- Target groups pointing to your EC2 instance on port 3000

### 3. Current Traffic Flow

```
Internet → ALB (port 443/80) → EC2 Instance (port 3000)
         ↘                    ↗
           Direct access (INSECURE - needs to be blocked)
```

## Security Configuration Update

### Step 1: Remove Public Access

Remove the current rule allowing port 3000 from anywhere:
```bash
aws ec2 revoke-security-group-ingress \
  --group-id sg-069c85841502a9525 \
  --protocol tcp \
  --port 3000 \
  --cidr 0.0.0.0/0 \
  --region us-east-1
```

### Step 2: Add ALB-Only Access

Add a rule allowing port 3000 only from the ALB security group:
```bash
aws ec2 authorize-security-group-ingress \
  --group-id sg-069c85841502a9525 \
  --protocol tcp \
  --port 3000 \
  --source-group <ALB_SECURITY_GROUP_ID> \
  --region us-east-1
```

### Step 3: Automated Update

Use the provided script to automatically update the security group:
```bash
./scripts/update-ec2-security-group.sh
```

This script will:
1. Find all ALBs routing to your EC2 instance
2. Identify their security groups
3. Remove public access to port 3000
4. Add rules allowing access only from ALB security groups

## Verification

After updating the security group:

1. **Test Direct Access (Should Fail)**:
   ```bash
   curl -I http://<EC2_PUBLIC_IP>:3000/health
   ```

2. **Test ALB Access (Should Work)**:
   ```bash
   curl -I https://api.clearhold.app/health
   ```

3. **Check Target Health**:
   ```bash
   aws elbv2 describe-target-health \
     --target-group-arn <TARGET_GROUP_ARN> \
     --region us-east-1
   ```

## Best Practices

1. **Principle of Least Privilege**: Only allow traffic from known sources (ALB security group)
2. **Regular Audits**: Periodically review security group rules
3. **Monitoring**: Set up CloudWatch alarms for unauthorized access attempts
4. **Documentation**: Keep security group rules documented with descriptions

## Additional Security Recommendations

1. **Enable ALB Access Logs**: Track all requests through the load balancer
2. **WAF Integration**: Consider adding AWS WAF to the ALB for additional protection
3. **SSL/TLS**: Ensure HTTPS is enforced at the ALB level
4. **Security Group Descriptions**: Add meaningful descriptions to all security group rules

## Troubleshooting

If the application becomes inaccessible after the changes:

1. Verify the ALB security group ID is correct
2. Check that the EC2 instance is healthy in the target group
3. Ensure the ALB can reach the EC2 instance on port 3000
4. Review VPC network ACLs (if any)
5. Check application logs for binding issues

## Scripts Provided

1. **analyze-alb-config.sh**: Comprehensive analysis of current ALB setup
2. **update-ec2-security-group.sh**: Automated security group update
3. **create-new-instance.sh**: Existing script showing ALB integration

## Next Steps

1. Run the analysis script to identify the ALB security group
2. Execute the update script to secure port 3000
3. Verify the application remains accessible through the ALB
4. Document the ALB security group ID for future reference
5. Consider implementing additional security layers (WAF, Shield)