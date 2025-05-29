# Immediate Fix Commands for GLIBC Issues

## 🚨 Quick Fix for Current Deployment

Copy and paste these commands in order on your EC2 instance:

### 1. Download and Apply Fix Script

```bash
# SSH to your instance (replace with your actual IP)
ssh -i ~/.ssh/your-key.pem ec2-user@44.202.141.56

# Download the fix script
cd /home/ec2-user
wget https://raw.githubusercontent.com/Dxstvn/personal-cryptoscrow-backend/main/aws-deployment/fix-glibc-node-compatibility.sh
chmod +x fix-glibc-node-compatibility.sh

# Run the fix
./fix-glibc-node-compatibility.sh
```

### 2. Alternative Manual Fix (if script fails)

```bash
# Stop everything
pm2 delete all || true
pm2 kill || true

# Clean up Node.js installations
rm -rf ~/.nvm
sudo dnf remove -y nodejs npm
sudo yum clean all

# Install Node.js via dnf (most compatible)
sudo dnf update -y
sudo dnf install -y nodejs npm

# Verify installation
node --version
npm --version

# If still fails, use Node.js 16 fallback
if ! node --version; then
    cd /tmp
    wget https://nodejs.org/dist/v16.20.2/node-v16.20.2-linux-x64.tar.xz
    tar -xf node-v16.20.2-linux-x64.tar.xz
    sudo mkdir -p /opt/nodejs
    sudo cp -r node-v16.20.2-linux-x64/* /opt/nodejs/
    sudo ln -sf /opt/nodejs/bin/node /usr/local/bin/node
    sudo ln -sf /opt/nodejs/bin/npm /usr/local/bin/npm
    echo 'export PATH="/opt/nodejs/bin:$PATH"' >> ~/.bashrc
    source ~/.bashrc
fi

# Install PM2
sudo npm install -g pm2

# Go to app directory and clean install
cd /home/ec2-user/cryptoescrow-backend
rm -rf node_modules package-lock.json
npm install --production

# Start application
pm2 start ecosystem.config.cjs --env production
pm2 save
```

### 3. Verification Commands

```bash
# Check Node.js
node --version
npm --version

# Check PM2 status
pm2 status
pm2 logs --lines 10

# Test health endpoint
curl http://localhost:3000/health

# Check for GLIBC errors in logs
pm2 logs | grep -i glibc
```

### 4. If Using New Infrastructure

```bash
# Deploy new GLIBC-compatible stack
aws cloudformation create-stack \
  --stack-name cryptoescrow-glibc-fixed \
  --template-body file://aws-deployment/cloudformation-glibc-fixed.yaml \
  --parameters ParameterKey=KeyPairName,ParameterValue=YOUR_KEY_PAIR \
               ParameterKey=InstanceType,ParameterValue=t3.small \
  --capabilities CAPABILITY_NAMED_IAM \
  --region us-east-1
```

## 📋 Expected Output

After the fix, you should see:

```bash
$ node --version
v16.20.2  # or similar without GLIBC errors

$ pm2 status
┌─────┬─────────────────────────┬─────────────┬─────────┬─────────┬──────────┬────────┬──────┬───────────┬──────────┬──────────┬──────────┬──────────┐
│ id  │ name                    │ namespace   │ version │ mode    │ pid      │ uptime │ ↺    │ status    │ cpu      │ mem      │ user     │ watching │
├─────┼─────────────────────────┼─────────────┼─────────┼─────────┼──────────┼────────┼──────┼───────────┼──────────┼──────────┼──────────┼──────────┤
│ 0   │ cryptoescrow-backend    │ default     │ 1.0.0   │ fork    │ 12345    │ 30s    │ 0    │ online    │ 0%       │ 50.0mb   │ ec2-user │ disabled │
└─────┴─────────────────────────┴─────────────┴─────────┴─────────┴──────────┴────────┴──────┴───────────┴──────────┴──────────┴──────────┴──────────┘

$ curl http://localhost:3000/health
{"status":"healthy","timestamp":"2024-12-19T..."}
```

## 🆘 Emergency Contacts

If the fix doesn't work:

1. Check system info: `cat /etc/os-release && ldd --version`
2. Check application logs: `pm2 logs cryptoescrow-backend --lines 50`
3. Check startup test: `timeout 10s node src/server.js`

---

**⚡ This should resolve the GLIBC compatibility issues immediately!** 