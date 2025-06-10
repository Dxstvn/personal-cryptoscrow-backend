# 🚧 **Staging Environment - CryptoEscrow Backend**

## 🎯 **Current Development Phase: STAGING**

We are currently in the **staging phase** of development, preparing for production deployment. This document outlines the staging environment configuration, testing procedures, and deployment readiness criteria.

## 🌐 **Staging Environment Details**

### **Environment Information**
- **Environment**: `staging`
- **Backend URL**: `https://staging-api.clearhold.app`
- **Frontend URL**: `https://staging.clearhold.app`
- **Firebase Project**: `escrowstaging`
- **Blockchain Network**: `Sepolia Testnet` (Chain ID: 11155111)
- **Infrastructure**: AWS EC2 with Application Load Balancer

### **Key Staging Characteristics**
- ✅ **Real Production Infrastructure**: Same setup as production
- ✅ **Testnet Blockchain**: Safe testing with Sepolia ETH
- ✅ **Separate Firebase Project**: Isolated from production data
- ✅ **Full Feature Testing**: All production features enabled
- ✅ **Performance Monitoring**: Real-world performance testing
- ✅ **Security Testing**: Production-level security measures

## 📋 **Staging Configuration**

### **Environment Variables** (`.env.staging`)
```bash
NODE_ENV=staging
USE_AWS_SECRETS=true
AWS_REGION=us-east-1

# Server Configuration
PORT=5173
FRONTEND_URL=https://staging.clearhold.app

# Firebase Configuration (Staging Project)
FIREBASE_PROJECT_ID=escrowstaging
FIREBASE_STORAGE_BUCKET=escrowstaging.appspot.com
FIREBASE_API_KEY=AIzaSyAEnTHpQpcgzWvDfiusF90-beSGCz5pva8
FIREBASE_AUTH_DOMAIN=escrowstaging.firebaseapp.com
FIREBASE_MESSAGING_SENDER_ID=960491714548
FIREBASE_APP_ID=1:960491714548:web:f1b418ffaddd0ba2cc2ba
FIREBASE_MEASUREMENT_ID=G-07NYQBYP9N

# Blockchain Configuration (Testnet)
CHAIN_ID=11155111
RPC_URL=https://sepolia.infura.io/v3/4af9a8307a914da58937e8da53c602f9

# Admin Configuration
ALLOWED_EMAILS=jasmindustin@gmail.com,dustin.jasmin@jaspire.co,andyrowe00@gmail.com

# Scheduled Jobs (More frequent for testing)
CRON_SCHEDULE_DEADLINE_CHECKS=*/10 * * * *
```

### **PM2 Ecosystem Configuration**
```javascript
// ecosystem.staging.cjs
module.exports = {
  apps: [{
    name: 'cryptoescrow-backend-staging',
    script: 'src/server.js',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'staging',
      USE_AWS_SECRETS: 'true',
      AWS_REGION: 'us-east-1',
      PORT: '5173',
      // ... environment variables
    }
  }]
};
```

## 🧪 **Staging Testing Procedures**

### **Phase 1: Critical User Flow Testing**

#### **1. User Registration & Authentication**
```bash
# Test new user signup
curl -X POST https://staging-api.clearhold.app/auth/signUpEmailPass \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"TestPass123!"}'

# Test user login
curl -X POST https://staging-api.clearhold.app/auth/signInEmailPass \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"TestPass123!"}'
```

#### **2. Wallet Management Testing**
```bash
# Register Ethereum wallet (Sepolia testnet)
curl -X POST https://staging-api.clearhold.app/wallet/register \
  -H "Authorization: Bearer $STAGING_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"walletAddress":"0x...","network":"ethereum","isPrimary":true}'

# Test cross-chain fee estimation
curl -X POST https://staging-api.clearhold.app/wallet/cross-chain/estimate-fees \
  -H "Authorization: Bearer $STAGING_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"sourceNetwork":"ethereum","targetNetwork":"solana","amount":"0.1"}'
```

#### **3. Escrow Transaction Flow**
```bash
# Create escrow deal
curl -X POST https://staging-api.clearhold.app/transaction/create \
  -H "Authorization: Bearer $STAGING_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "initiatedBy":"BUYER",
    "propertyAddress":"123 Test St, Staging City",
    "amount":0.1,
    "currency":"ETH",
    "network":"ethereum",
    "otherPartyEmail":"seller@example.com",
    "buyerWalletAddress":"0x...",
    "sellerWalletAddress":"0x...",
    "initialConditions":[{"id":"test-condition","type":"INSPECTION","description":"Test inspection"}]
  }'
```

#### **4. File Upload & Management**
```bash
# Test file upload
curl -X POST https://staging-api.clearhold.app/files/upload \
  -H "Authorization: Bearer $STAGING_TOKEN" \
  -F "dealId=test-deal-id" \
  -F "file=@test-document.pdf"
```

#### **5. Contact Management**
```bash
# Send contact invitation
curl -X POST https://staging-api.clearhold.app/contact/invite \
  -H "Authorization: Bearer $STAGING_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"contactEmail":"contact@example.com","message":"Test invitation"}'
```

### **Phase 2: Blockchain Integration Testing**

#### **Smart Contract Deployment**
- Deploy test contracts on Sepolia testnet
- Verify contract deployment addresses
- Test contract state synchronization

#### **Testnet Token Management**
- Acquire Sepolia ETH from faucets
- Test deposit functionality
- Verify transaction confirmations

#### **Automated Process Testing**
- Test deadline enforcement (shortened timeframes for testing)
- Verify dispute resolution workflows
- Check cross-chain transaction monitoring

### **Phase 3: Performance & Load Testing**

#### **API Endpoint Performance**
```bash
# Test concurrent API calls
for i in {1..10}; do
  curl -X GET https://staging-api.clearhold.app/health &
done
wait
```

#### **Real-Time Updates Testing**
- Connect multiple clients to Firestore
- Test real-time synchronization
- Verify listener performance under load

#### **File Upload Stress Testing**
- Test multiple concurrent file uploads
- Verify file size limits
- Test upload progress tracking

### **Phase 4: Security Testing**

#### **Rate Limiting Verification**
```bash
# Test rate limiting (should be blocked after limits)
for i in {1..20}; do
  curl -X POST https://staging-api.clearhold.app/auth/signInEmailPass \
    -H "Content-Type: application/json" \
    -d '{"email":"test@example.com","password":"wrong"}'
done
```

#### **Authentication Testing**
```bash
# Test with invalid token
curl -X GET https://staging-api.clearhold.app/transaction \
  -H "Authorization: Bearer invalid-token"

# Test with missing token
curl -X GET https://staging-api.clearhold.app/transaction
```

#### **Input Validation Testing**
```bash
# Test with malicious input
curl -X POST https://staging-api.clearhold.app/transaction/create \
  -H "Authorization: Bearer $STAGING_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"amount":"<script>alert(\"xss\")</script>"}'
```

## 🔍 **Monitoring & Health Checks**

### **Health Check Endpoints**
```bash
# Basic health check
curl https://staging-api.clearhold.app/health

# Expected response: {"status":"OK"}
```

### **Application Metrics**
- **Response Times**: Monitor API endpoint response times
- **Error Rates**: Track 4xx and 5xx responses
- **Throughput**: Monitor requests per second
- **Database Performance**: Monitor Firestore query performance
- **Blockchain Connectivity**: Verify RPC endpoint status

### **Log Monitoring**
```bash
# View staging logs
pm2 logs cryptoescrow-backend-staging

# Monitor error logs
tail -f logs/staging-error.log

# Monitor access logs
tail -f logs/staging-access.log
```

## 🚀 **Deployment Commands**

### **Start Staging Environment**
```bash
# Start staging server
npm run start:staging

# Or manually with PM2
pm2 start ecosystem.staging.cjs --env staging
```

### **Update Staging Deployment**
```bash
# Pull latest code
git pull origin main

# Install dependencies
npm install

# Restart staging server
npm run restart:staging
```

### **Stop Staging Environment**
```bash
# Stop staging server
npm run stop:staging

# Or manually with PM2
pm2 stop cryptoescrow-backend-staging
```

## 📊 **Testing Checklist**

### **✅ Pre-Production Readiness Criteria**

#### **Functional Testing**
- [ ] All API endpoints respond correctly
- [ ] User authentication flows work
- [ ] Wallet registration and validation
- [ ] Escrow transaction creation and management
- [ ] File upload and download functionality
- [ ] Contact management features
- [ ] Real-time updates via Firestore
- [ ] Smart contract deployment
- [ ] Cross-chain transaction preparation

#### **Performance Testing**
- [ ] API response times < 500ms for 95th percentile
- [ ] File uploads work for files up to 10MB
- [ ] Concurrent user simulation (10+ users)
- [ ] Database query performance optimization
- [ ] Memory usage stays below 800MB
- [ ] CPU usage stays below 80%

#### **Security Testing**
- [ ] Rate limiting enforced correctly
- [ ] Authentication required for protected endpoints
- [ ] Input validation prevents XSS/injection
- [ ] CORS configuration allows only approved origins
- [ ] Error messages don't leak sensitive information
- [ ] File upload restrictions enforced

#### **Integration Testing**
- [ ] Firebase Authentication integration
- [ ] Firestore real-time synchronization
- [ ] Firebase Storage file operations
- [ ] Sepolia testnet blockchain connectivity
- [ ] Smart contract deployment and interaction
- [ ] Email notification system (if implemented)

#### **Reliability Testing**
- [ ] Automatic restart after crashes
- [ ] Graceful handling of network interruptions
- [ ] Proper error logging and monitoring
- [ ] Database connection recovery
- [ ] Blockchain RPC failover (if configured)

## 🎯 **Production Readiness Goals**

### **Performance Benchmarks**
- **API Response Time**: 95th percentile < 200ms
- **File Upload Speed**: 1MB/second minimum
- **Concurrent Users**: Support 100+ simultaneous connections
- **Uptime**: 99.9% availability target
- **Error Rate**: < 0.1% of requests result in 5xx errors

### **Security Standards**
- **Zero Critical Vulnerabilities**: No high-risk security issues
- **Rate Limiting**: Effective protection against abuse
- **Data Encryption**: All sensitive data encrypted at rest and in transit
- **Access Control**: Proper authentication and authorization
- **Audit Trail**: Complete logging of security-relevant events

### **Operational Readiness**
- **Monitoring**: Comprehensive health checks and alerting
- **Backup Strategy**: Regular database and file backups
- **Disaster Recovery**: Documented recovery procedures
- **Scaling Plan**: Ability to handle increased load
- **Documentation**: Complete API and operational documentation

## 🚨 **Known Issues & Limitations**

### **Current Staging Limitations**
- **Testnet Only**: Limited to Sepolia testnet (no mainnet testing)
- **Single Instance**: Not testing horizontal scaling
- **Limited Cross-Chain**: Full cross-chain bridges not implemented
- **Email Notifications**: May be using test email configuration

### **Areas for Future Testing**
- **Load Balancing**: Test with multiple backend instances
- **CDN Integration**: Test with content delivery network
- **Advanced Security**: Penetration testing and security audit
- **Disaster Recovery**: Test backup and recovery procedures
- **Mobile Testing**: Test mobile-specific functionality

## 📞 **Support & Troubleshooting**

### **Common Staging Issues**
1. **503 Service Unavailable**: Check PM2 process status
2. **Firebase Auth Errors**: Verify staging project configuration
3. **Blockchain Connectivity**: Check Sepolia RPC endpoint status
4. **File Upload Failures**: Verify Firebase Storage permissions

### **Debug Commands**
```bash
# Check PM2 status
pm2 status

# View detailed logs
pm2 logs cryptoescrow-backend-staging --lines 100

# Monitor real-time metrics
pm2 monit

# Restart if needed
pm2 restart cryptoescrow-backend-staging
```

### **Contact Information**
- **Technical Issues**: Check logs first, then contact development team
- **Access Issues**: Verify AWS credentials and permissions
- **Performance Issues**: Review monitoring metrics and logs

---

**🎯 Next Steps**: Complete all testing phases successfully to proceed to production deployment. Ensure all checklist items are verified before promoting to production environment. 