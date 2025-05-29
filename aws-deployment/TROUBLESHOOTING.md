# AWS Deployment Troubleshooting Guide

This guide addresses common issues encountered when transitioning from local to AWS-hosted backend.

## 🚨 Common Issues and Solutions

### 1. Module Not Found: node-fetch

**Error:**
```
Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'node-fetch'
```

**Cause:** `node-fetch` was in `devDependencies` instead of `dependencies`

**Solution:**
```bash
# On your EC2 instance
cd /home/ec2-user/cryptoescrow-backend
npm install node-fetch@3.3.2
pm2 restart cryptoescrow-backend
```

**Prevention:** The package.json has been updated to include `node-fetch` in dependencies.

### 2. Stale Files from Previous Deployments

**Error:** References to non-existent files like `start-server.js`

**Solution:**
```bash
# Clean up stale files
cd /home/ec2-user/cryptoescrow-backend
rm -f start-server.js server.js
git clean -fd
```

### 3. PM2 Process Stuck in Error State

**Error:** PM2 shows status as "errored"

**Solution:**
```bash
# Complete PM2 reset
pm2 delete all
pm2 kill
cd /home/ec2-user/cryptoescrow-backend
pm2 start ecosystem.config.cjs --env production
pm2 save
```

### 4. Environment Variables Not Loading

**Error:** AWS Secrets Manager errors or missing environment variables

**Solution:**
1. Verify `.env` file exists:
   ```bash
   ls -la /home/ec2-user/cryptoescrow-backend/.env
   ```

2. Check AWS Secrets Manager access:
   ```bash
   aws secretsmanager get-secret-value --secret-id "CryptoEscrow/App/Config" --region us-east-1
   ```

3. Verify IAM role permissions on EC2 instance

### 5. Dependency Installation Issues

**Error:** Missing dependencies after deployment

**Solution:**
```bash
# Fresh dependency installation
cd /home/ec2-user/cryptoescrow-backend
rm -rf node_modules package-lock.json
npm install --production
```

## 🔧 Quick Fix Commands

### Emergency Recovery
```bash
# Run this if your deployment is completely broken
cd /home/ec2-user/cryptoescrow-backend
wget https://raw.githubusercontent.com/YOUR_REPO/main/aws-deployment/fix-deployment.sh
chmod +x fix-deployment.sh
./fix-deployment.sh
```

### Check Application Health
```bash
# Test if the application is responding
curl -f http://localhost:3000/health

# Check PM2 status
pm2 status
pm2 logs --lines 20
```

### Monitor Application
```bash
# Real-time monitoring
pm2 monit

# View logs in real-time
pm2 logs cryptoescrow-backend --follow
```

## 🛠️ Deployment Verification Checklist

After any deployment or fix, verify:

- [ ] PM2 status shows "online"
- [ ] Health endpoint responds: `curl http://localhost:3000/health`
- [ ] No errors in logs: `pm2 logs --lines 20`
- [ ] AWS Secrets Manager accessible
- [ ] All required dependencies installed
- [ ] Environment variables loaded correctly

## 🔍 Debugging Commands

### Check Node.js Version
```bash
node --version  # Should be 18+
npm --version
```

### Check File Permissions
```bash
ls -la /home/ec2-user/cryptoescrow-backend/
```

### Check Process Information
```bash
ps aux | grep node
netstat -tlnp | grep :3000
```

### Check AWS Configuration
```bash
aws sts get-caller-identity
aws secretsmanager list-secrets --region us-east-1
```

## 📝 Log Analysis

### PM2 Logs Location
- Output: `/home/ec2-user/.pm2/logs/cryptoescrow-backend-out.log`
- Errors: `/home/ec2-user/.pm2/logs/cryptoescrow-backend-error.log`
- Combined: `/home/ec2-user/cryptoescrow-backend/logs/combined.log`

### Common Error Patterns

1. **Module errors:** Look for `Cannot find module` or `ERR_MODULE_NOT_FOUND`
2. **AWS errors:** Look for `SecretsManager` or `AWS` in error messages
3. **Firebase errors:** Look for `Firebase` or authentication errors
4. **Network errors:** Look for `ECONNREFUSED` or timeout errors

## 🚀 Performance Optimization

### Memory Issues
```bash
# Check memory usage
free -h
pm2 monit

# Restart if memory usage is high
pm2 restart cryptoescrow-backend
```

### CPU Issues
```bash
# Check CPU usage
htop
pm2 monit
```

## 📞 Getting Help

If issues persist:

1. Check this troubleshooting guide
2. Review AWS CloudWatch logs
3. Verify AWS Secrets Manager configuration
4. Check security group settings
5. Ensure all environment variables are correctly set

## 🔄 Recovery Procedures

### Complete Fresh Deployment
```bash
# Nuclear option - complete reset
sudo systemctl stop cryptoescrow || true
pm2 delete all || true
pm2 kill || true
cd /home/ec2-user
rm -rf cryptoescrow-backend
git clone https://github.com/YOUR_REPO/personal-cryptoscrow-backend.git cryptoescrow-backend
cd cryptoescrow-backend
cp aws-deployment/env.production.template .env
# Edit .env with your configuration
npm install --production
pm2 start ecosystem.config.cjs --env production
pm2 save
```

### Rollback to Previous Version
```bash
cd /home/ec2-user/cryptoescrow-backend
git log --oneline -10  # Find previous commit
git reset --hard COMMIT_HASH
npm install --production
pm2 restart cryptoescrow-backend
```

---

**Remember:** Always backup your configuration before making changes! 