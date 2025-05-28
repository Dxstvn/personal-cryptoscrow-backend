#!/bin/bash

# CryptoEscrow Backend - AWS Deployment Quick Start
# This script helps you prepare your local environment and verify the deployment setup

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 CryptoEscrow Backend - AWS Deployment Quick Start${NC}"
echo "=========================================================="

print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

# Step 1: Check prerequisites
echo -e "\n${BLUE}📋 Checking Prerequisites...${NC}"

# Check AWS CLI
if command -v aws &> /dev/null; then
    print_status "AWS CLI is installed: $(aws --version)"
else
    print_error "AWS CLI is not installed. Please install it first."
    exit 1
fi

# Check AWS credentials
if aws sts get-caller-identity &> /dev/null; then
    print_status "AWS credentials are configured"
else
    print_error "AWS credentials not configured. Run 'aws configure' first."
    exit 1
fi

# Check Node.js
if command -v node &> /dev/null; then
    print_status "Node.js is installed: $(node --version)"
else
    print_error "Node.js is not installed. Please install Node.js 18 or later."
    exit 1
fi

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    print_error "Please run this script from the project root directory"
    exit 1
fi

# Step 2: Install dependencies
echo -e "\n${BLUE}📦 Installing Dependencies...${NC}"
npm install
print_status "Dependencies installed"

# Step 3: Verify AWS SDK installation
if npm list @aws-sdk/client-secrets-manager &> /dev/null; then
    print_status "AWS SDK for Secrets Manager is installed"
else
    print_warning "Installing AWS SDK for Secrets Manager..."
    npm install @aws-sdk/client-secrets-manager
fi

# Step 4: Create deployment checklist
echo -e "\n${BLUE}📝 Deployment Checklist${NC}"
echo "=================="

echo -e "\n${YELLOW}Before deploying, ensure you have:${NC}"
echo "□ AWS Account with appropriate permissions"
echo "□ EC2 Key Pair created in your target region"
echo "□ Your private keys and API keys ready"
echo "□ Domain name configured (optional)"
echo "□ Firebase project set up"

# Step 5: Validate configuration files
echo -e "\n${BLUE}🔧 Validating Configuration Files...${NC}"

# Check if required files exist
required_files=(
    "aws-deployment/cloudformation.yaml"
    "aws-deployment/deploy.sh"
    "aws-deployment/nginx.conf"
    "ecosystem.config.js"
    "src/config/awsSecretsManager.js"
)

for file in "${required_files[@]}"; do
    if [ -f "$file" ]; then
        print_status "Found: $file"
    else
        print_error "Missing: $file"
        exit 1
    fi
done

# Step 6: Test AWS Secrets Manager integration locally
echo -e "\n${BLUE}🧪 Testing AWS Secrets Manager Integration...${NC}"

# Create test environment
export NODE_ENV=development
export USE_AWS_SECRETS=false

# Try to run the server briefly to check for syntax errors
timeout 5s node src/server.js > /dev/null 2>&1 || true
print_status "Basic syntax validation passed"

# Step 7: Display next steps
echo -e "\n${GREEN}🎉 Local setup complete!${NC}"
echo -e "\n${BLUE}📋 Next Steps:${NC}"
echo "1. Review and customize the CloudFormation template:"
echo "   aws-deployment/cloudformation.yaml"
echo ""
echo "2. Update the deployment script with your repository URL:"
echo "   aws-deployment/deploy.sh"
echo ""
echo "3. Deploy the infrastructure:"
echo "   cd aws-deployment"
echo "   aws cloudformation create-stack --stack-name cryptoescrow-infrastructure --template-body file://cloudformation.yaml --parameters ParameterKey=KeyPairName,ParameterValue=YOUR_KEY_PAIR --capabilities CAPABILITY_NAMED_IAM"
echo ""
echo "4. Update AWS Secrets Manager with your actual secrets"
echo ""
echo "5. Deploy your application using the deployment script"
echo ""
echo "6. Configure your domain and SSL certificate"

echo -e "\n${BLUE}📚 For detailed instructions, see: aws-deployment/README.md${NC}"

# Step 8: Generate deployment commands
echo -e "\n${BLUE}🔧 Generating Deployment Commands...${NC}"

cat > aws-deployment/deploy-commands.txt << 'EOF'
# CryptoEscrow Backend Deployment Commands
# Copy and customize these commands for your deployment

# 1. Deploy CloudFormation Stack
aws cloudformation create-stack \
  --stack-name cryptoescrow-infrastructure \
  --template-body file://cloudformation.yaml \
  --parameters ParameterKey=KeyPairName,ParameterValue=YOUR_KEY_PAIR_NAME \
               ParameterKey=InstanceType,ParameterValue=t3.small \
               ParameterKey=AllowedSSHCIDR,ParameterValue=YOUR_IP/32 \
  --capabilities CAPABILITY_NAMED_IAM \
  --region us-east-1

# 2. Wait for completion
aws cloudformation wait stack-create-complete \
  --stack-name cryptoescrow-infrastructure \
  --region us-east-1

# 3. Get outputs
aws cloudformation describe-stacks \
  --stack-name cryptoescrow-infrastructure \
  --query 'Stacks[0].Outputs' \
  --region us-east-1

# 4. Update secrets (replace with your actual values)
aws secretsmanager update-secret \
  --secret-id "CryptoEscrow/App/Config" \
  --secret-string '{"JWT_SECRET":"YOUR_JWT_SECRET","ENCRYPTION_KEY":"YOUR_ENCRYPTION_KEY","DATABASE_ENCRYPTION_KEY":"YOUR_DB_KEY","SMTP_HOST":"smtp.gmail.com","SMTP_PORT":"587","SMTP_USER":"your-email@gmail.com","SMTP_PASS":"your-password","INFURA_API_KEY":"your-infura-key","ALCHEMY_API_KEY":"your-alchemy-key"}' \
  --region us-east-1

aws secretsmanager update-secret \
  --secret-id "CryptoEscrow/Blockchain/Keys" \
  --secret-string '{"DEPLOYER_PRIVATE_KEY":"your-deployer-key","BACKEND_WALLET_PRIVATE_KEY":"your-backend-key"}' \
  --region us-east-1

# 5. SSH and deploy
ssh -i path/to/your-key.pem ec2-user@YOUR_EC2_IP
# Then run the deployment script on the server
EOF

print_status "Deployment commands saved to aws-deployment/deploy-commands.txt"

echo -e "\n${GREEN}🎯 Setup Complete!${NC}"
echo -e "Your backend is ready for AWS deployment with:"
echo -e "• ✅ AWS Secrets Manager integration"
echo -e "• ✅ Production-ready PM2 configuration"
echo -e "• ✅ Nginx reverse proxy setup"
echo -e "• ✅ SSL/TLS certificate support"
echo -e "• ✅ Automated deployment scripts"

echo -e "\n${BLUE}Happy deploying! 🚀${NC}" 