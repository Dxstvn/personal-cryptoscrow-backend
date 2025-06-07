# Transaction Management Routes (`src/api/routes/transaction`)

## Overview

This directory contains the core API routes for managing escrow transactions within the CryptoEscrow platform. These endpoints handle the complete lifecycle of escrow deals, from creation to completion, including multi-network support, cross-chain transactions, and smart contract integration.

**Frontend Relevance**: This is the most critical API module for frontend developers. It powers the core user experience including deal creation forms, transaction dashboards, status monitoring, and cross-chain transaction flows. **Real-time Firestore listeners are essential** for responsive UI updates.

## File: `transactionRoutes.js`

**Base Path**: `/transaction` (mounted at `/transaction` in server.js)
**Authentication**: All endpoints require Firebase ID Token (`Authorization: Bearer <TOKEN>`)
**Key Integrations**: Firestore, smart contract deployment, cross-chain services, blockchain monitoring

## Core Endpoints

### **Deal Management**

#### `POST /transaction/create`
**Purpose**: Creates a new escrow deal with automatic network detection and optional cross-chain support.

**Request Body**:
```json
{
  "initiatedBy": "BUYER", // "BUYER" or "SELLER" 
  "propertyAddress": "123 Main St, Anytown, USA",
  "amount": 1.5, // Numeric amount in primary currency
  "currency": "ETH", // Primary currency symbol
  "network": "ethereum", // Primary network
  "otherPartyEmail": "counterparty@example.com",
  "buyerWalletAddress": "0xBuyer...", // Supports multi-network addresses
  "sellerWalletAddress": "0xSeller...", // Supports multi-network addresses
  "initialConditions": [
    {
      "id": "cond-title-v1", 
      "type": "TITLE_DEED", 
      "description": "Clear title deed verification"
    },
    {
      "id": "cond-inspection-v1", 
      "type": "INSPECTION", 
      "description": "Property inspection completion"
    }
  ]
}
```

**Response**:
```json
{
  "message": "Transaction initiated successfully.",
  "transactionId": "firestore-deal-id", // Critical for frontend listeners
  "status": "PENDING_BUYER_REVIEW",
  "smartContractAddress": "0x...", // null if deployment failed
  "isCrossChain": false,
  "crossChainInfo": { // Only if cross-chain detected
    "buyerNetwork": "bitcoin",
    "sellerNetwork": "ethereum", 
    "bridgeInfo": {...},
    "crossChainTransactionId": "cross-chain-tx-id"
  }
}
```

**Frontend Actions**:
- Build comprehensive deal creation form with network selection
- Implement wallet address validation for multiple networks
- Set up immediate Firestore listener using returned `transactionId`
- Handle cross-chain flow if `isCrossChain` is true
- Display smart contract address and deployment status

#### `GET /transaction/:transactionId`
**Purpose**: Retrieves complete deal details from Firestore.

**Response**: Complete deal object with all fields, conditions, timeline, and status information.

**Frontend Usage**: Primary use for initial data load. **Prefer Firestore real-time listeners** for ongoing updates.

#### `GET /transaction`
**Purpose**: Lists all deals for the authenticated user with filtering and pagination.

**Query Parameters**:
- `limit` - Results per page (default: 50)
- `startAfter` - Pagination cursor
- `orderBy` - Sort field (default: 'createdAt')
- `orderDirection` - 'asc' or 'desc' (default: 'desc')
- `network` - Filter by network
- `status` - Filter by deal status

**Frontend Actions**:
- Implement paginated deal dashboards
- Add filtering UI for network and status
- Use Firestore query listeners for real-time list updates

### **Condition Management**

#### `PUT /transaction/:transactionId/conditions/:conditionId/buyer-review`
**Purpose**: Allows buyers to update the status of their off-chain conditions.

**Request Body**:
```json
{
  "newBackendStatus": "FULFILLED_BY_BUYER", // Required status update
  "reviewComment": "Condition completed successfully" // Optional comment
}
```

**Status Options**:
- `FULFILLED_BY_BUYER` - Condition completed
- `PENDING_BUYER_ACTION` - Still working on condition
- `ACTION_WITHDRAWN_BY_BUYER` - Buyer withdrew fulfillment

**Frontend Actions**:
- Build interactive condition management UI
- Show progress indicators for condition completion
- Update immediately via Firestore listeners

### **Smart Contract Synchronization**

#### `PUT /transaction/:transactionId/sync-status`
**Purpose**: Synchronizes backend status with smart contract state changes.

**Request Body**:
```json
{
  "newSCStatus": "IN_FINAL_APPROVAL", // Smart contract status
  "eventMessage": "Final approval period started", // Optional
  "finalApprovalDeadlineISO": "2023-10-27T10:00:00.000Z", // Optional
  "disputeResolutionDeadlineISO": "2023-10-29T10:00:00.000Z" // Optional
}
```

**Frontend Usage**: Call after detecting on-chain state changes through Web3 providers.

#### `POST /transaction/:transactionId/sc/start-final-approval`
**Purpose**: Syncs backend when final approval period starts on-chain.

**Request Body**:
```json
{
  "finalApprovalDeadlineISO": "2023-10-27T10:00:00.000Z" // Required deadline
}
```

#### `POST /transaction/:transactionId/sc/raise-dispute`
**Purpose**: Syncs backend when buyer raises dispute on-chain.

**Request Body**:
```json
{
  "disputeResolutionDeadlineISO": "2023-10-29T10:00:00.000Z", // Required
  "conditionId": "cond-title" // Optional related condition
}
```

### **Cross-Chain Transaction Support**

#### `POST /transaction/cross-chain/:dealId/transfer`
**Purpose**: Executes cross-chain fund transfer for escrow deals.

**Request Body**:
```json
{
  "amount": "1.5",
  "fromNetwork": "bitcoin",
  "toNetwork": "ethereum",
  "fromTxHash": "0x..." // Transaction hash from source network
}
```

**Response**:
```json
{
  "message": "Cross-chain transfer initiated successfully",
  "dealId": "deal-id",
  "fromTxHash": "0x...",
  "bridgeTxHash": "0x...", // If bridge required
  "requiresBridge": true
}
```

#### `GET /transaction/cross-chain/estimate-fees`
**Purpose**: Estimates fees for cross-chain transactions.

**Query Parameters**:
- `sourceNetwork` - Source blockchain network
- `targetNetwork` - Destination blockchain network  
- `amount` - Transaction amount

**Response**:
```json
{
  "sourceNetwork": "bitcoin",
  "targetNetwork": "ethereum",
  "amount": "1.5",
  "isEVMCompatible": false,
  "bridgeInfo": {
    "provider": "LayerZero",
    "estimatedTime": "15 minutes",
    "confidence": "high"
  },
  "feeEstimate": {
    "networkFee": "0.001",
    "bridgeFee": "0.01",
    "totalFee": "0.011"
  }
}
```

## Smart Contract Integration

### **Supported Contract States**
The backend synchronizes with these smart contract states:

- `AWAITING_DEPOSIT` - Contract deployed, awaiting buyer deposit
- `AWAITING_FULFILLMENT` - Funds deposited, awaiting condition fulfillment
- `READY_FOR_FINAL_APPROVAL` - Conditions met, ready for approval period
- `IN_FINAL_APPROVAL` - 48-hour approval period active
- `IN_DISPUTE` - Buyer raised dispute, 7-day resolution period
- `COMPLETED` - Funds released to seller
- `CANCELLED` - Deal cancelled, funds refunded

### **Automated Transitions**
The backend automatically handles certain state transitions:

- **Final Approval Timeout**: Automatically releases funds after 48 hours
- **Dispute Timeout**: Automatically cancels deal after 7 days without resolution
- **Cross-Chain Confirmations**: Updates status based on multi-network confirmations

## Cross-Chain Network Support

### **Fully Supported Networks**
- **Ethereum** (Mainnet, Sepolia, Goerli)
- **Polygon** (Mainnet, Mumbai)  
- **BSC** (Mainnet, Testnet)

### **Address Validation Support**
- **Solana** (Mainnet, Devnet)
- **Bitcoin** (Mainnet, Testnet)

### **Bridge Integrations**
- **LayerZero** - Cross-chain messaging
- **Wormhole** - Multi-chain bridge
- **Custom Bridges** - Specialized integrations

## Frontend Integration Patterns

### **🔥 Real-Time Updates (Critical)**

```javascript
// Set up deal listener immediately after creation
const setupDealListener = (dealId) => {
  const unsubscribe = onSnapshot(
    doc(db, 'deals', dealId),
    (doc) => {
      if (doc.exists()) {
        const dealData = doc.data();
        updateDealUI(dealData);
        handleStatusChange(dealData.status);
        updateTimeline(dealData.timeline);
        checkDeadlines(dealData);
      }
    },
    (error) => {
      console.error('Deal listener error:', error);
      // Implement error recovery
    }
  );
  
  return unsubscribe;
};
```

### **🌐 Cross-Chain Flow Implementation**

```javascript
// Handle cross-chain deal creation
const createCrossChainDeal = async (dealData) => {
  // 1. Create deal
  const response = await api.post('/transaction/create', dealData);
  
  if (response.data.isCrossChain) {
    // 2. Set up cross-chain monitoring
    setupCrossChainTracking(response.data.crossChainInfo);
    
    // 3. Guide user through multi-network setup
    showNetworkSwitchingGuide(response.data.crossChainInfo);
  }
  
  // 4. Set up standard deal listener
  return setupDealListener(response.data.transactionId);
};
```

### **📊 Status Management**

```javascript
// Handle all possible deal states
const handleStatusChange = (newStatus) => {
  switch(newStatus) {
    case 'AWAITING_DEPOSIT':
      showDepositInstructions();
      break;
    case 'IN_FINAL_APPROVAL':
      showApprovalCountdown();
      enableDisputeButton();
      break;
    case 'IN_DISPUTE':
      showDisputeResolutionUI();
      break;
    case 'COMPLETED':
      showCompletionCelebration();
      break;
    // Handle all states...
  }
};
```

## Error Handling

### **Common Error Responses**

```json
// Validation Error (400)
{
  "error": "Valid buyer wallet address is required."
}

// Authentication Error (401)
{
  "error": "No token provided"
}

// Not Found (404)
{
  "error": "Deal not found or access denied"
}

// Server Error (500)
{
  "error": "Internal server error during transaction creation."
}
```

### **Frontend Error Handling Strategy**

```javascript
const handleTransactionError = (error) => {
  switch(error.status) {
    case 400:
      showValidationErrors(error.data.error);
      break;
    case 401:
      redirectToLogin();
      break;
    case 404:
      showDealNotFound();
      break;
    case 500:
      showServerError();
      enableRetry();
      break;
  }
};
```

## Data Models

### **Deal Document Structure**
```javascript
{
  id: "firestore-document-id",
  initiatedBy: "BUYER",
  propertyAddress: "123 Main St...",
  amount: 1.5,
  currency: "ETH", 
  network: "ethereum",
  buyerId: "firebase-uid",
  sellerId: "firebase-uid",
  buyerWalletAddress: "0x...",
  sellerWalletAddress: "0x...",
  status: "IN_FINAL_APPROVAL",
  smartContractAddress: "0x...",
  isCrossChain: false,
  crossChainTransactionId: null,
  conditions: [
    {
      id: "cond-title-v1",
      type: "TITLE_DEED", 
      description: "Clear title deed verification",
      status: "FULFILLED_BY_BUYER",
      createdAt: timestamp,
      updatedAt: timestamp
    }
  ],
  timeline: [
    {
      event: "Deal created by buyer",
      timestamp: timestamp,
      userId: "firebase-uid",
      system: false
    }
  ],
  finalApprovalDeadlineBackend: timestamp,
  disputeResolutionDeadlineBackend: timestamp,
  createdAt: timestamp,
  updatedAt: timestamp
}
```

## Performance Optimization

### **Frontend Optimization Tips**

1. **Pagination**: Always use pagination for deal lists
2. **Selective Listeners**: Only listen to specific deal documents when needed
3. **Debounced Updates**: Debounce rapid status changes for better UX
4. **Optimistic Updates**: Update UI immediately, sync with backend
5. **Error Recovery**: Implement automatic retry for failed operations

### **Caching Strategy**

```javascript
// Cache deal data for offline access
const cacheDealData = (dealId, dealData) => {
  localStorage.setItem(`deal_${dealId}`, JSON.stringify({
    data: dealData,
    timestamp: Date.now(),
    ttl: 5 * 60 * 1000 // 5 minutes
  }));
};
```

## Testing Integration

### **Frontend Testing Patterns**

```javascript
// Mock deal creation for testing
const mockDealCreation = () => {
  jest.spyOn(api, 'post').mockImplementation((endpoint, data) => {
    if (endpoint === '/transaction/create') {
      return Promise.resolve({
        data: {
          transactionId: 'mock-deal-id',
          status: 'PENDING_BUYER_REVIEW',
          smartContractAddress: '0x123...'
        }
      });
    }
  });
};
```

---

**Critical Frontend Integration Notes**:

1. **Always use Firestore real-time listeners** for deal updates
2. **Handle cross-chain flows** with clear user guidance
3. **Implement comprehensive error handling** for all scenarios
4. **Show clear status indicators** and deadline countdowns
5. **Provide transaction hash links** to blockchain explorers
6. **Cache data appropriately** for offline access
7. **Test all state transitions** thoroughly
8. **Monitor performance** with large deal lists 