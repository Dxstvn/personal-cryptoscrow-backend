# EC2 Server Setup for Firebase Testing

## Current Requirements (Updated)

**Firebase 11.6.1 requires:**
- Node.js 18.0.0+ (not Node.js > 9)
- npm 8.0.0+ (not npm > 20)

Your previous information was outdated. These are the current requirements.

## SSH Connection

```bash
# Use your existing key
ssh -i "CryptoZombies!01.pem" ec2-user@YOUR_EC2_IP_ADDRESS
```

**Note:** Replace `YOUR_EC2_IP_ADDRESS` with your actual EC2 instance IP address.

## Option 1: Automated Script (Recommended)

1. Copy the `deploy-to-ec2.sh` script to your EC2 server
2. Make it executable and run it:

```bash
chmod +x deploy-to-ec2.sh
./deploy-to-ec2.sh
```

## Option 2: Manual Step-by-Step

### Step 1: Check Current Versions

```bash
# Check current versions
node --version
npm --version
```

### Step 2: Install/Update Node.js (if needed)

If Node.js version is less than 18:

```bash
# Install Node.js 20 LTS on Amazon Linux 2
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo yum install -y nodejs

# Verify installation
node --version
npm --version
```

### Step 3: Update npm

```bash
# Update npm to latest version
sudo npm install -g npm@latest
```

### Step 4: Navigate to Project and Update Code

```bash
# Navigate to your project directory
cd /home/ec2-user/personal-cryptoscrow-backend

# Pull latest changes
git pull origin main
```

### Step 5: Install Dependencies

```bash
# Install npm dependencies
npm install
```

### Step 6: Install Firebase CLI (if needed)

```bash
# Install Firebase CLI globally (if not already installed)
sudo npm install -g firebase-tools

# Verify installation
firebase --version
```

### Step 7: Run Tests

```bash
# Set environment variables
export NODE_ENV=test
export NODE_OPTIONS=--experimental-vm-modules

# Run tests
npm test
```

## Expected Issues and Solutions

### Issue 1: Firebase Version Compatibility

**Error:** `Firebase requires Node.js version X.X.X or higher`

**Solution:**
```bash
# Update Node.js to version 18+
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo yum install -y nodejs
```

### Issue 2: npm Permission Issues

**Error:** `EACCES: permission denied`

**Solution:**
```bash
# Fix npm permissions
sudo chown -R $(whoami) ~/.npm
```

### Issue 3: Module Not Found Errors

**Error:** `Cannot find module 'firebase'`

**Solution:**
```bash
# Clear npm cache and reinstall
npm cache clean --force
rm -rf node_modules package-lock.json
npm install
```

### Issue 4: Test Timeout or Hanging

**Error:** Tests hang or timeout

**Solution:**
```bash
# Check if ports are available
sudo netstat -tulpn | grep :8545
sudo netstat -tulpn | grep :5004
sudo netstat -tulpn | grep :9099

# Kill any hanging processes
pkill -f node
```

## Troubleshooting Commands

```bash
# Check system info
cat /etc/os-release
uname -a

# Check available memory
free -h

# Check disk space
df -h

# Check running Node processes
ps aux | grep node

# Check npm configuration
npm config list

# Check global npm packages
npm list -g --depth=0

# Check local project dependencies
npm list

# Verify Firebase installation
npm list firebase
```

## Post-Setup Verification

After successful setup, verify everything is working:

```bash
# Check versions
echo "Node.js: $(node --version)"
echo "npm: $(npm --version)"
echo "Firebase CLI: $(firebase --version)"

# Check project dependencies
npm list firebase

# Run a quick test
npm test
```

## Contact Points

If you encounter issues:

1. **Node.js Issues:** Check [Node.js official documentation](https://nodejs.org/)
2. **Firebase Issues:** Check [Firebase documentation](https://firebase.google.com/docs)
3. **Amazon Linux 2 Issues:** Check [AWS documentation](https://docs.aws.amazon.com/linux/)

## Security Notes

- Keep your `.pem` key file secure and never share it
- Consider using AWS Systems Manager Session Manager instead of direct SSH for better security
- Regularly update your system: `sudo yum update -y` 