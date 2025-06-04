#!/bin/bash

# setup-hardhat-ec2.sh
# Script to install Hardhat dependencies on EC2 (Amazon Linux)

echo "🔧 Setting up Hardhat dependencies on EC2..."

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check if we're running on Amazon Linux
if [[ -f /etc/os-release ]]; then
    . /etc/os-release
    if [[ "$ID" != "amzn" ]]; then
        echo -e "${YELLOW}⚠️  Warning: This script is designed for Amazon Linux. You may need to adjust package names.${NC}"
    fi
fi

echo -e "${YELLOW}📦 Installing system dependencies...${NC}"

# Update system packages
sudo yum update -y

# Install development tools needed for node-gyp and native modules
sudo yum groupinstall -y "Development Tools"
sudo yum install -y gcc-c++ make python3 python3-pip git

# Install Node.js if not present (should be from previous setup)
if ! command_exists node; then
    echo -e "${YELLOW}📦 Installing Node.js...${NC}"
    # Install Node.js 18.x (LTS)
    curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
    sudo yum install -y nodejs
else
    echo -e "${GREEN}✅ Node.js is already installed: $(node --version)${NC}"
fi

# Install npm if not present
if ! command_exists npm; then
    echo -e "${RED}❌ npm is not available${NC}"
    exit 1
else
    echo -e "${GREEN}✅ npm is available: $(npm --version)${NC}"
fi

# Check Node.js version compatibility
NODE_VERSION=$(node --version | cut -d'v' -f2)
MAJOR_VERSION=$(echo $NODE_VERSION | cut -d'.' -f1)

if [ "$MAJOR_VERSION" -lt 16 ]; then
    echo -e "${RED}❌ Node.js version $NODE_VERSION is too old. Hardhat requires Node.js 16 or higher.${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Node.js version $NODE_VERSION is compatible with Hardhat${NC}"

# Navigate to project directory
if [[ ! -d "src/contract" ]]; then
    echo -e "${RED}❌ Contract directory not found. Make sure you're in the project root.${NC}"
    exit 1
fi

cd src/contract

# Install contract dependencies
echo -e "${YELLOW}📦 Installing Hardhat and contract dependencies...${NC}"
npm install

# Check if Hardhat is properly installed
if ! npx hardhat --version >/dev/null 2>&1; then
    echo -e "${RED}❌ Hardhat installation failed${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Hardhat installed successfully: $(npx hardhat --version)${NC}"

# Go back to project root
cd ../..

# Install main project dependencies if not done already
echo -e "${YELLOW}📦 Installing main project dependencies...${NC}"
npm install

# Create a test script to verify Hardhat works
echo -e "${YELLOW}🧪 Testing Hardhat installation...${NC}"

cd src/contract

# Try to compile contracts
echo -e "${YELLOW}📝 Compiling contracts...${NC}"
if npx hardhat compile; then
    echo -e "${GREEN}✅ Contract compilation successful${NC}"
else
    echo -e "${RED}❌ Contract compilation failed${NC}"
    exit 1
fi

# Check if we can start Hardhat node (just test, don't keep running)
echo -e "${YELLOW}🔍 Testing Hardhat node startup...${NC}"
timeout 10s npx hardhat node --help >/dev/null 2>&1
if [ $? -eq 0 ] || [ $? -eq 124 ]; then
    echo -e "${GREEN}✅ Hardhat node command is available${NC}"
else
    echo -e "${RED}❌ Hardhat node command failed${NC}"
    exit 1
fi

cd ../..

echo -e "${GREEN}🎉 Hardhat setup completed successfully!${NC}"
echo -e "${GREEN}✅ You can now run blockchain tests with: npm run test:blockchainService:integration${NC}"
echo -e "${GREEN}✅ You can start a Hardhat node with: cd src/contract && npx hardhat node${NC}"

# Display helpful information
echo -e "\n${YELLOW}📋 Test Commands Available:${NC}"
echo -e "  ${GREEN}Non-Hardhat tests:${NC}"
echo -e "    npm run test:unit                              # Unit tests only"
echo -e "    npm run test:auth:unit:standalone              # Auth unit tests"
echo -e "    npm run test:blockchainService:unit:standalone # Blockchain unit tests (mocked)"
echo -e ""
echo -e "  ${GREEN}Hardhat-dependent tests:${NC}"
echo -e "    npm run test:blockchainService:integration     # Blockchain integration tests"
echo -e "    npm run test:contractDeployer:integration      # Contract deployment tests"
echo -e "    npm run test:e2e                               # Full E2E tests"
echo -e ""
echo -e "  ${GREEN}Full test suite (requires Hardhat + Firebase emulators):${NC}"
echo -e "    npm run test:all                               # All tests with services"

echo -e "\n${YELLOW}📋 Port Usage:${NC}"
echo -e "  8545  - Hardhat blockchain node"
echo -e "  9099  - Firebase Auth emulator"
echo -e "  5004  - Firestore emulator"
echo -e "  9199  - Firebase Storage emulator"
echo -e "  3001  - Application server (tests)"

echo -e "\n${GREEN}🔥 Setup complete! Your EC2 instance is ready for blockchain testing.${NC}" 