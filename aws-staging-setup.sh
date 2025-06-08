#!/bin/bash

# AWS Staging Infrastructure Setup Script
# This sets up staging.clearhold.app with your existing SSL certificate

echo "🚀 Setting up staging.clearhold.app infrastructure..."

# Step 1: Deploy to EC2 (if not already deployed)
echo "Step 1: Deploying to EC2..."
# You can deploy your staging app to EC2 or use AWS App Runner

# Step 2: Create Application Load Balancer
echo "Step 2: Creating Application Load Balancer..."
# ALB will use your existing SSL certificate from Certificate Manager

# Step 3: Update DNS
echo "Step 3: Update DNS to point staging.clearhold.app to ALB..."

# For immediate deployment, you can use:
# 1. AWS EC2 + Application Load Balancer (recommended)
# 2. AWS App Runner (simpler, but less control)
# 3. AWS Elastic Beanstalk (middle ground)

echo "
🎯 RECOMMENDED: AWS App Runner (Simplest)

1. Go to AWS App Runner console
2. Create service from source code
3. Connect to your GitHub repo
4. Configure:
   - Source: GitHub
   - Branch: staging
   - Build command: npm install
   - Start command: npm run start:staging
   - Port: 3001
5. Add custom domain: staging.clearhold.app
6. Select your existing SSL certificate

This will automatically:
✅ Deploy your staging app
✅ Use your SSL certificate  
✅ Handle auto-scaling
✅ Provide HTTPS endpoint
✅ Cost ~$5-10/month for staging

Alternative: AWS EC2 + ALB (more control, ~$15-20/month)
"

echo "✅ Script ready! Choose your deployment method above." 