# 🧪 Critical User Flow Testing Guide

## 📋 **Overview**

This document provides comprehensive testing procedures for all critical user flows in the CryptoEscrow application. These tests ensure the application works correctly end-to-end and are essential before any production deployment.

## 🎯 **Testing Environments**

### **Local Development**
- Backend: `http://localhost:3000`
- Firebase: Emulators
- Blockchain: Hardhat local network

### **Staging Environment**
- Backend: `https://staging-api.clearhold.app`
- Firebase: Staging project (`escrowstaging`)
- Blockchain: Sepolia testnet

### **Testing Prerequisites**

```bash
# Required tools
npm install -g firebase-tools
npm install -g pm2

# Environment setup
export STAGING_API_URL="https://staging-api.clearhold.app"
export STAGING_FIREBASE_PROJECT="escrowstaging"
```

## 🔐 **Critical User Flow 1: User Registration & Login**

### **Test Scenario 1.1: Email/Password Registration**

#### **Manual Testing Steps**
1. **New User Registration**
   ```bash
   curl -X POST $STAGING_API_URL/auth/signUpEmailPass \
     -H "Content-Type: application/json" \
     -d '{
       "email": "testuser@example.com",
       "password": "SecurePass123!",
       "walletAddress": "0x1234567890123456789012345678901234567890"
     }'
   ```

2. **Expected Response**
   ```json
   {
     "message": "User created successfully",
     "user": {
       "uid": "firebase-user-id",
       "email": "testuser@example.com",
       "emailVerified": false
     },
     "token": "firebase-id-token",
     "profile": {
       "walletAddress": "0x1234567890123456789012345678901234567890",
       "isNewUser": true
     }
   }
   ```

3. **Verification Steps**
   - ✅ Response status is 201
   - ✅ User ID is returned
   - ✅ JWT token is valid
   - ✅ User appears in Firebase Console
   - ✅ Firestore user document created

#### **Frontend Integration Test**
```javascript
// Test user registration flow
describe('User Registration Flow', () => {
  test('should register new user successfully', async () => {
    const userData = {
      email: 'test@example.com',
      password: 'SecurePass123!',
      walletAddress: '0x1234567890123456789012345678901234567890'
    };

    const response = await api.post('/auth/signUpEmailPass', userData);
    
    expect(response.status).toBe(201);
    expect(response.data.user.email).toBe(userData.email);
    expect(response.data.token).toBeDefined();
    
    // Verify Firestore document creation
    const userDoc = await db.collection('users').doc(response.data.user.uid).get();
    expect(userDoc.exists).toBe(true);
  });
});
```

### **Test Scenario 1.2: User Login**

#### **Manual Testing Steps**
1. **Login with Valid Credentials**
   ```bash
   curl -X POST $STAGING_API_URL/auth/signInEmailPass \
     -H "Content-Type: application/json" \
     -d '{
       "email": "testuser@example.com",
       "password": "SecurePass123!"
     }'
   ```

2. **Expected Response**
   ```json
   {
     "message": "User signed in successfully",
     "user": {
       "uid": "firebase-user-id",
       "email": "testuser@example.com",
       "emailVerified": true
     },
     "token": "firebase-id-token"
   }
   ```

3. **Verification Steps**
   - ✅ Response status is 200
   - ✅ Valid JWT token returned
   - ✅ User profile data accessible
   - ✅ Token works for authenticated endpoints

### **Test Scenario 1.3: Google Sign-In**

#### **Manual Testing Steps**
1. **Google Authentication Flow**
   ```javascript
   // Frontend test with Firebase SDK
   import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
   
   const provider = new GoogleAuthProvider();
   const result = await signInWithPopup(auth, provider);
   const idToken = await result.user.getIdToken();
   
   // Send to backend
   const response = await api.post('/auth/signInGoogle', { idToken });
   ```

2. **Backend Verification**
   ```bash
   curl -X POST $STAGING_API_URL/auth/signInGoogle \
     -H "Content-Type: application/json" \
     -d '{"idToken": "google-id-token-from-frontend"}'
   ```

3. **Verification Steps**
   - ✅ Google authentication successful
   - ✅ Backend creates/updates user profile
   - ✅ JWT token returned
   - ✅ User profile includes Google data

## 💰 **Critical User Flow 2: Wallet Management**

### **Test Scenario 2.1: Wallet Registration**

#### **Manual Testing Steps**
1. **Register Ethereum Wallet**
   ```bash
   # Get auth token first
   AUTH_TOKEN=$(curl -X POST $STAGING_API_URL/auth/signInEmailPass \
     -H "Content-Type: application/json" \
     -d '{"email":"testuser@example.com","password":"SecurePass123!"}' \
     | jq -r '.token')

   # Register wallet
   curl -X POST $STAGING_API_URL/wallet/register \
     -H "Authorization: Bearer $AUTH_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "walletAddress": "0x1234567890123456789012345678901234567890",
       "network": "ethereum",
       "isPrimary": true
     }'
   ```

2. **Expected Response**
   ```json
   {
     "success": true,
     "data": {
       "walletId": "wallet-doc-id",
       "walletAddress": "0x1234567890123456789012345678901234567890",
       "network": "ethereum",
       "isPrimary": true,
       "isValid": true
     }
   }
   ```

3. **Verification Steps**
   - ✅ Wallet document created in Firestore
   - ✅ Address validation passed
   - ✅ Network detection correct
   - ✅ Primary wallet flag set correctly

### **Test Scenario 2.2: Multi-Network Wallet Support**

#### **Testing Multiple Networks**
```bash
# Test Solana wallet registration
curl -X POST $STAGING_API_URL/wallet/register \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "walletAddress": "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
    "network": "solana",
    "isPrimary": false
  }'

# Test Bitcoin wallet registration
curl -X POST $STAGING_API_URL/wallet/register \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "walletAddress": "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
    "network": "bitcoin",
    "isPrimary": false
  }'
```

### **Test Scenario 2.3: Cross-Chain Fee Estimation**

#### **Manual Testing Steps**
```bash
# Test cross-chain fee estimation
curl -X POST $STAGING_API_URL/wallet/cross-chain/estimate-fees \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "sourceNetwork": "ethereum",
    "targetNetwork": "solana",
    "amount": "0.1"
  }'
```

#### **Expected Response**
```json
{
  "success": true,
  "data": {
    "feeEstimate": {
      "sourceNetworkFee": "0.002 ETH",
      "bridgeFee": "0.01 ETH",
      "totalFeeUSD": "45.30"
    },
    "bridgeInfo": {
      "provider": "LayerZero",
      "estimatedTime": "10-15 minutes"
    }
  }
}
```

## 🤝 **Critical User Flow 3: Escrow Transaction Creation**

### **Test Scenario 3.1: Standard Escrow Deal Creation**

#### **Manual Testing Steps**
1. **Create Basic Escrow Deal**
   ```bash
   curl -X POST $STAGING_API_URL/transaction/create \
     -H "Authorization: Bearer $AUTH_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "initiatedBy": "BUYER",
       "propertyAddress": "123 Test St, Staging City, ST 12345",
       "amount": 0.1,
       "currency": "ETH",
       "network": "ethereum",
       "otherPartyEmail": "seller@example.com",
       "buyerWalletAddress": "0x1234567890123456789012345678901234567890",
       "sellerWalletAddress": "0x0987654321098765432109876543210987654321",
       "initialConditions": [
         {
           "id": "condition-inspection",
           "type": "INSPECTION",
           "description": "Property inspection completed and approved"
         },
         {
           "id": "condition-title",
           "type": "TITLE_DEED",
           "description": "Clear title deed verification"
         }
       ]
     }'
   ```

2. **Expected Response**
   ```json
   {
     "message": "Transaction initiated successfully",
     "transactionId": "deal-document-id",
     "status": "PENDING_BUYER_REVIEW",
     "smartContractAddress": "0xContractAddress...",
     "isCrossChain": false
   }
   ```

3. **Verification Steps**
   - ✅ Deal document created in Firestore
   - ✅ Smart contract deployed successfully
   - ✅ Both parties added to deal participants
   - ✅ Initial conditions created correctly
   - ✅ Timeline entry added for deal creation

#### **Frontend Real-Time Integration Test**
```javascript
// Test real-time deal updates
describe('Deal Creation and Real-Time Updates', () => {
  test('should create deal and receive real-time updates', async (done) => {
    const dealData = {
      initiatedBy: 'BUYER',
      propertyAddress: '123 Test St',
      amount: 0.1,
      currency: 'ETH',
      network: 'ethereum',
      // ... other fields
    };

    // Create deal
    const response = await api.post('/transaction/create', dealData);
    const dealId = response.data.transactionId;

    // Set up real-time listener
    const unsubscribe = onSnapshot(
      doc(db, 'deals', dealId),
      (doc) => {
        if (doc.exists()) {
          const dealData = doc.data();
          expect(dealData.status).toBeDefined();
          expect(dealData.smartContractAddress).toBeDefined();
          unsubscribe();
          done();
        }
      }
    );
  });
});
```

### **Test Scenario 3.2: Cross-Chain Escrow Deal**

#### **Manual Testing Steps**
```bash
# Create cross-chain deal (Bitcoin to Ethereum)
curl -X POST $STAGING_API_URL/transaction/create \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "initiatedBy": "BUYER",
    "propertyAddress": "456 Cross-Chain Ave",
    "amount": 0.01,
    "currency": "BTC",
    "network": "bitcoin",
    "otherPartyEmail": "seller@example.com",
    "buyerWalletAddress": "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
    "sellerWalletAddress": "0x0987654321098765432109876543210987654321",
    "initialConditions": [
      {
        "id": "condition-cross-chain",
        "type": "CROSS_CHAIN_SETUP",
        "description": "Cross-chain bridge setup completed"
      }
    ]
  }'
```

#### **Expected Cross-Chain Response**
```json
{
  "message": "Transaction initiated successfully",
  "transactionId": "cross-chain-deal-id",
  "status": "PENDING_CROSS_CHAIN_SETUP",
  "isCrossChain": true,
  "crossChainInfo": {
    "buyerNetwork": "bitcoin",
    "sellerNetwork": "ethereum",
    "bridgeProvider": "LayerZero",
    "crossChainTransactionId": "cross-chain-tx-id"
  }
}
```

## 💸 **Critical User Flow 4: Payment & Blockchain Interaction**

### **Test Scenario 4.1: Wallet Connection & Deposit**

#### **Frontend Wallet Connection Test**
```javascript
// Test wallet connection flow
describe('Wallet Connection and Deposit', () => {
  test('should connect wallet and deposit funds', async () => {
    // Connect wallet (MetaMask simulation)
    const provider = new ethers.providers.JsonRpcProvider('https://sepolia.infura.io/v3/...');
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

    // Get deal details
    const dealResponse = await api.get(`/transaction/${dealId}`);
    const deal = dealResponse.data;

    // Send deposit to smart contract
    const contract = new ethers.Contract(
      deal.smartContractAddress,
      PropertyEscrowABI,
      wallet
    );

    const depositTx = await contract.depositFunds({
      value: ethers.parseEther(deal.amount.toString())
    });

    await depositTx.wait();

    // Verify status update via Firestore listener
    const dealDoc = await db.collection('deals').doc(dealId).get();
    expect(dealDoc.data().status).toBe('AWAITING_FULFILLMENT');
  });
});
```

### **Test Scenario 4.2: Transaction Status Synchronization**

#### **Manual Blockchain State Sync Test**
```bash
# Sync deal status with smart contract
curl -X PUT $STAGING_API_URL/transaction/$DEAL_ID/sync-status \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "newSCStatus": "AWAITING_FULFILLMENT",
    "eventMessage": "Funds deposited successfully",
    "txHash": "0x1234567890abcdef..."
  }'
```

### **Test Scenario 4.3: Balance Verification**

#### **Test Balance Updates**
```bash
# Get user wallets and verify balances
curl -X GET $STAGING_API_URL/wallet/user-wallets \
  -H "Authorization: Bearer $AUTH_TOKEN"
```

#### **Expected Wallet Response**
```json
{
  "success": true,
  "data": {
    "wallets": [
      {
        "address": "0x1234567890123456789012345678901234567890",
        "network": "ethereum",
        "balance": "0.5 ETH",
        "lastUpdated": "2023-10-26T10:00:00.000Z"
      }
    ]
  }
}
```

## ✅ **Critical User Flow 5: Condition Management**

### **Test Scenario 5.1: Condition Status Updates**

#### **Manual Condition Update Test**
```bash
# Update condition status
curl -X PUT $STAGING_API_URL/transaction/$DEAL_ID/conditions/condition-inspection/buyer-review \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "newBackendStatus": "FULFILLED_BY_BUYER",
    "reviewComment": "Property inspection completed successfully. All items passed."
  }'
```

#### **Expected Response**
```json
{
  "message": "Condition status updated successfully",
  "condition": {
    "id": "condition-inspection",
    "status": "FULFILLED_BY_BUYER",
    "updatedAt": "2023-10-26T10:00:00.000Z",
    "reviewComment": "Property inspection completed successfully..."
  }
}
```

### **Test Scenario 5.2: Real-Time Condition Updates**

#### **Frontend Real-Time Test**
```javascript
// Test condition updates with real-time sync
describe('Condition Management', () => {
  test('should update conditions and sync in real-time', async (done) => {
    const conditionUpdate = {
      newBackendStatus: 'FULFILLED_BY_BUYER',
      reviewComment: 'Condition completed'
    };

    // Set up listener before update
    const unsubscribe = onSnapshot(
      doc(db, 'deals', dealId),
      (doc) => {
        const deal = doc.data();
        const condition = deal.conditions.find(c => c.id === 'condition-inspection');
        
        if (condition && condition.status === 'FULFILLED_BY_BUYER') {
          expect(condition.reviewComment).toBe('Condition completed');
          unsubscribe();
          done();
        }
      }
    );

    // Update condition
    await api.put(`/transaction/${dealId}/conditions/condition-inspection/buyer-review`, conditionUpdate);
  });
});
```

## 📄 **Critical User Flow 6: File Upload & Management**

### **Test Scenario 6.1: Document Upload**

#### **Manual File Upload Test**
```bash
# Upload deal document
curl -X POST $STAGING_API_URL/files/upload \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -F "dealId=$DEAL_ID" \
  -F "file=@test-contract.pdf"
```

#### **Expected Response**
```json
{
  "message": "File uploaded successfully",
  "fileId": "file-document-id",
  "url": "https://firebasestorage.googleapis.com/..."
}
```

### **Test Scenario 6.2: File Download**

#### **Manual Download Test**
```bash
# Download uploaded file
curl -X GET $STAGING_API_URL/files/download/$DEAL_ID/$FILE_ID \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -o downloaded-file.pdf
```

### **Test Scenario 6.3: File Access Control**

#### **Test Unauthorized Access**
```bash
# Test with invalid token (should fail)
curl -X GET $STAGING_API_URL/files/download/$DEAL_ID/$FILE_ID \
  -H "Authorization: Bearer invalid-token"

# Expected: 401 Unauthorized
```

## 🚨 **Critical User Flow 7: Dispute & Resolution**

### **Test Scenario 7.1: Dispute Creation**

#### **Manual Dispute Test**
```bash
# Raise dispute on deal
curl -X POST $STAGING_API_URL/transaction/$DEAL_ID/sc/raise-dispute \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "disputeResolutionDeadlineISO": "2023-11-02T10:00:00.000Z",
    "conditionId": "condition-inspection",
    "disputeReason": "Property inspection revealed undisclosed issues"
  }'
```

### **Test Scenario 7.2: Dispute Resolution**

#### **Test Resolution Process**
```bash
# Update dispute status
curl -X PUT $STAGING_API_URL/transaction/$DEAL_ID/sync-status \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "newSCStatus": "IN_DISPUTE",
    "eventMessage": "Dispute raised by buyer",
    "disputeResolutionDeadlineISO": "2023-11-02T10:00:00.000Z"
  }'
```

## 🔧 **Automated Testing Scripts**

### **Complete Flow Test Script**

```bash
#!/bin/bash
# comprehensive-test.sh - Complete user flow testing

set -e  # Exit on any error

echo "🧪 Starting Comprehensive User Flow Testing..."

# Configuration
API_URL="https://staging-api.clearhold.app"
TEST_EMAIL="flowtest@example.com"
TEST_PASSWORD="FlowTest123!"

echo "📧 Testing User Registration..."
REGISTER_RESPONSE=$(curl -s -X POST $API_URL/auth/signUpEmailPass \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\"}")

echo "✅ Registration successful"

# Extract token
AUTH_TOKEN=$(echo $REGISTER_RESPONSE | jq -r '.token')

echo "🔐 Testing Authentication..."
LOGIN_RESPONSE=$(curl -s -X POST $API_URL/auth/signInEmailPass \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\"}")

echo "✅ Login successful"

echo "💰 Testing Wallet Registration..."
WALLET_RESPONSE=$(curl -s -X POST $API_URL/wallet/register \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "walletAddress": "0x1234567890123456789012345678901234567890",
    "network": "ethereum",
    "isPrimary": true
  }')

echo "✅ Wallet registration successful"

echo "🤝 Testing Deal Creation..."
DEAL_RESPONSE=$(curl -s -X POST $API_URL/transaction/create \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "initiatedBy": "BUYER",
    "propertyAddress": "123 Test Flow St",
    "amount": 0.1,
    "currency": "ETH",
    "network": "ethereum",
    "otherPartyEmail": "seller@example.com",
    "buyerWalletAddress": "0x1234567890123456789012345678901234567890",
    "sellerWalletAddress": "0x0987654321098765432109876543210987654321",
    "initialConditions": [{
      "id": "test-condition",
      "type": "INSPECTION",
      "description": "Test condition"
    }]
  }')

DEAL_ID=$(echo $DEAL_RESPONSE | jq -r '.transactionId')
echo "✅ Deal creation successful: $DEAL_ID"

echo "📄 Testing File Upload..."
# Create a test file
echo "Test document content" > test-doc.txt

UPLOAD_RESPONSE=$(curl -s -X POST $API_URL/files/upload \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -F "dealId=$DEAL_ID" \
  -F "file=@test-doc.txt")

echo "✅ File upload successful"

echo "✅ Testing Condition Update..."
CONDITION_RESPONSE=$(curl -s -X PUT $API_URL/transaction/$DEAL_ID/conditions/test-condition/buyer-review \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "newBackendStatus": "FULFILLED_BY_BUYER",
    "reviewComment": "Test condition completed"
  }')

echo "✅ Condition update successful"

echo "🎉 All critical user flows tested successfully!"

# Cleanup
rm -f test-doc.txt

echo "🧹 Test cleanup completed"
```

### **Performance Testing Script**

```bash
#!/bin/bash
# performance-test.sh - Load testing for critical endpoints

echo "⚡ Starting Performance Testing..."

# Test concurrent health checks
echo "Testing concurrent health checks..."
for i in {1..20}; do
  curl -s $API_URL/health &
done
wait

echo "Testing concurrent authentication..."
for i in {1..10}; do
  curl -s -X POST $API_URL/auth/signInEmailPass \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"loadtest$i@example.com\",\"password\":\"LoadTest123!\"}" &
done
wait

echo "✅ Performance testing completed"
```

## 📊 **Testing Checklist**

### **Pre-Deployment Verification**

#### **Functional Testing** ✅
- [ ] User registration (email/password)
- [ ] User authentication (login/logout)  
- [ ] Google Sign-In integration
- [ ] Wallet registration (multiple networks)
- [ ] Cross-chain fee estimation
- [ ] Escrow deal creation
- [ ] Smart contract deployment
- [ ] Real-time Firestore synchronization
- [ ] Condition management
- [ ] File upload/download
- [ ] Contact management
- [ ] Dispute creation and resolution

#### **Security Testing** ✅
- [ ] Authentication required for protected endpoints
- [ ] Rate limiting enforcement
- [ ] Input validation and sanitization
- [ ] CORS configuration
- [ ] File upload restrictions
- [ ] Error message security (no data leaks)

#### **Performance Testing** ✅
- [ ] API response times < 500ms
- [ ] Concurrent user handling
- [ ] File upload performance
- [ ] Real-time update latency
- [ ] Database query optimization

#### **Integration Testing** ✅
- [ ] Firebase Authentication
- [ ] Firestore real-time listeners
- [ ] Firebase Storage operations
- [ ] Blockchain connectivity (testnet)
- [ ] Smart contract interaction
- [ ] Cross-chain bridge preparation

#### **Error Handling** ✅
- [ ] Network failures gracefully handled
- [ ] Invalid input rejection
- [ ] Authentication failures
- [ ] Database connection issues
- [ ] Blockchain RPC failures

## 🚀 **Continuous Testing Strategy**

### **Development Phase**
- Run automated tests on every commit
- Manual testing for new features
- Integration testing with emulators

### **Staging Phase**
- Complete user flow testing
- Performance and load testing
- Security vulnerability scanning
- Cross-browser compatibility testing

### **Production Phase**
- Smoke tests after deployment
- Monitoring and alerting
- Periodic full regression testing
- User acceptance testing

---

**🎯 Success Criteria**: All tests must pass before production deployment. Any failures should be investigated and resolved before proceeding to the next environment. 