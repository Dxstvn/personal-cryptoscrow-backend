# Transaction Management Routes (`/transaction`)

## Overview

This directory contains the core API routes for managing escrow transactions within the CryptoEscrow platform. These endpoints handle the complete lifecycle of escrow deals with V3 smart contract integration, multi-network support, cross-chain transactions, and real-time blockchain synchronization.

**Base Path**: `/transaction`  
**Authentication**: Most endpoints require Firebase ID Token (`Authorization: Bearer <TOKEN>`)  
**Key Features**: V3 Escrow contracts, cross-chain support, automated dispute resolution, real-time updates

## Core Endpoints

### 1. Create Escrow Deal
**POST** `/transaction/create`

Creates a new escrow deal with automatic smart contract deployment.

**Request Body**:
```json
{
  "amount": 1.5,
  "sellerEmail": "seller@example.com",
  "productDescription": "Property at 123 Main St",
  "productPhotos": ["url1", "url2"],
  "productCategory": "general", // or "real_estate", "vehicle", etc.
  "conditions": [
    "Title deed verification",
    "Property inspection completed"
  ],
  "sellerWalletAddress": "0xSeller...",
  "buyerWalletAddress": "0xBuyer...",
  "isSeller": false, // true if seller is creating the deal
  "contractType": "V3_ESCROW",
  "buyerNetwork": "ethereum",
  "sellerNetwork": "arbitrum",
  "tokenAddress": "0x...", // Optional: specific token
  "depositToken": "0x...", // Optional: token buyer deposits
  "targetToken": "0x..." // Optional: token seller receives
}
```

**Success Response** (200 OK):
```json
{
  "message": "Deal created successfully",
  "dealId": "firestore-deal-id",
  "contractAddress": "0x...",
  "dealData": {
    "id": "firestore-deal-id",
    "escrowId": "blockchain-escrow-id",
    "status": "awaiting_deposit",
    "buyer": "0xBuyer...",
    "seller": "0xSeller...",
    "amount": "1.5",
    "conditions": [
      {
        "text": "Title deed verification",
        "status": "pending",
        "index": 0
      }
    ],
    "createdAt": "2024-01-15T10:00:00.000Z"
  }
}
```

**Backend Actions**:
1. Creates deal in Firestore
2. Deploys V3 escrow contract on blockchain
3. Sets up real-time synchronization
4. Handles cross-chain setup if networks differ

### 2. Update Condition Status
**POST** `/transaction/updateCondition`

Updates the status of a deal condition (seller only).

**Request Body**:
```json
{
  "dealId": "firestore-deal-id",
  "conditionIndex": 0,
  "status": "met" // or "unmet", "pending"
}
```

**Success Response** (200 OK):
```json
{
  "message": "Condition updated successfully",
  "dealData": {
    "conditions": [
      {
        "text": "Title deed verification",
        "status": "met",
        "lastUpdated": "2024-01-15T12:00:00.000Z"
      }
    ]
  }
}
```

**Notes**:
- Only sellers can update conditions
- Updates both Firestore and blockchain
- Triggers automatic state transitions when all conditions are met

### 3. Release Escrow Funds
**POST** `/transaction/releaseEscrow`

Releases escrowed funds to the seller.

**Request Body**:
```json
{
  "dealId": "firestore-deal-id"
}
```

**Success Response** (200 OK):
```json
{
  "message": "Escrow released successfully",
  "transactionHash": "0x...",
  "status": "escrow_released"
}
```

**Notes**:
- Only available after 48-hour dispute window
- Handles cross-chain transfers if needed
- Updates deal status to completed

### 4. Raise Dispute
**POST** `/transaction/raiseDispute`

Allows buyer to raise a dispute during the dispute window.

**Request Body**:
```json
{
  "dealId": "firestore-deal-id",
  "reason": "Inspection failed"
}
```

**Success Response** (200 OK):
```json
{
  "message": "Dispute raised successfully",
  "disputeDeadline": "2024-01-22T12:00:00.000Z",
  "status": "disputed"
}
```

**Notes**:
- Only available during 48-hour window after conditions met
- Starts 7-day resolution period
- Prevents automatic fund release

### 5. Resolve Dispute
**POST** `/transaction/resolveDispute`

Resolves an active dispute (admin/arbitrator only).

**Request Body**:
```json
{
  "dealId": "firestore-deal-id",
  "resolution": "refund_buyer" // or "release_to_seller"
}
```

**Success Response** (200 OK):
```json
{
  "message": "Dispute resolved successfully",
  "resolution": "refund_buyer",
  "transactionHash": "0x..."
}
```

### 6. Get Deal Details
**GET** `/transaction/deal/:dealId`

Retrieves deal details (public endpoint, no auth required).

**Success Response** (200 OK):
```json
{
  "id": "firestore-deal-id",
  "amount": "1.5",
  "currency": "ETH",
  "status": "awaiting_deposit",
  "buyer": "0xBuyer...",
  "seller": "0xSeller...",
  "productDescription": "Property at 123 Main St",
  "conditions": [...],
  "escrowDetails": {
    "contractAddress": "0x...",
    "escrowId": "1",
    "buyerDeposited": false,
    "sellerDeposited": false,
    "allConditionsMet": false,
    "disputeRaised": false,
    "escrowReleased": false,
    "escrowCancelled": false,
    "releaseTime": "0",
    "disputeDeadline": "0"
  }
}
```

### 7. List User Transactions
**GET** `/transaction/transactions`

Lists all deals for the authenticated user.

**Query Parameters**:
- `page` - Page number (default: 1)
- `limit` - Results per page (default: 10)
- `status` - Filter by status
- `role` - Filter by user role ("buyer" or "seller")

**Success Response** (200 OK):
```json
{
  "transactions": [
    {
      "id": "deal-id",
      "amount": "1.5",
      "status": "awaiting_deposit",
      "role": "buyer",
      "createdAt": "2024-01-15T10:00:00.000Z",
      "productDescription": "Property at 123 Main St"
    }
  ],
  "pagination": {
    "currentPage": 1,
    "totalPages": 5,
    "totalItems": 45
  }
}
```

### 8. Cross-Chain Fee Quote
**GET** `/transaction/v3/quote`

Gets fee estimates for cross-chain transactions.

**Query Parameters**:
- `fromNetwork` - Source network (e.g., "ethereum")
- `toNetwork` - Target network (e.g., "arbitrum")
- `amount` - Transaction amount
- `fromToken` - Source token address (optional)
- `toToken` - Target token address (optional)

**Success Response** (200 OK):
```json
{
  "quote": {
    "estimatedGas": "500000",
    "estimatedGasCost": "0.05",
    "bridgeFee": "0.01",
    "totalFee": "0.06",
    "estimatedTime": "15 minutes",
    "route": "LayerZero"
  }
}
```

### 9. Estimate Gas
**POST** `/transaction/estimate-gas`

Estimates gas for various escrow operations.

**Request Body**:
```json
{
  "dealId": "firestore-deal-id",
  "operation": "deposit" // or "release", "cancel", "updateCondition"
}
```

**Success Response** (200 OK):
```json
{
  "estimatedGas": "150000",
  "estimatedCost": "0.015",
  "network": "ethereum"
}
```

### 10. Sync Smart Contract Status
**PUT** `/transaction/:dealId/sync-status`

Synchronizes backend with smart contract state.

**Request Body**:
```json
{
  "newSCStatus": "conditions_met",
  "eventMessage": "All conditions fulfilled",
  "finalApprovalDeadlineISO": "2024-01-17T10:00:00.000Z"
}
```

**Notes**:
- Used internally by blockchain monitoring services
- Updates Firestore to match on-chain state

### 11. Admin: Manual Intervention
**GET** `/transaction/admin/manual-intervention`

Lists deals requiring manual intervention (admin only).

**Success Response** (200 OK):
```json
{
  "deals": [
    {
      "id": "deal-id",
      "status": "disputed",
      "disputeDeadline": "2024-01-22T12:00:00.000Z",
      "amount": "1.5",
      "buyer": "0xBuyer...",
      "seller": "0xSeller...",
      "requiresAction": "resolve_dispute"
    }
  ]
}
```

## Deal Status Flow

### Status Values
- `awaiting_deposit` - Contract deployed, waiting for buyer deposit
- `deposit_pending` - Deposit transaction submitted
- `conditions_pending` - Deposit confirmed, awaiting condition fulfillment
- `conditions_met` - All conditions met, dispute window active
- `ready_for_release` - Dispute window passed, ready for release
- `disputed` - Dispute raised, resolution pending
- `escrow_released` - Funds released to seller
- `escrow_cancelled` - Deal cancelled, funds refunded

### Automated Transitions
1. **48-Hour Dispute Window**: After all conditions met
2. **7-Day Dispute Resolution**: Auto-refund if not resolved
3. **Cross-Chain Confirmations**: Status updates on confirmations

## Frontend Integration Guide

### 1. Deal Creation Flow
```javascript
async function createEscrowDeal(dealData) {
  try {
    const response = await fetch('/transaction/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify(dealData)
    });
    
    const result = await response.json();
    
    // Set up Firestore listener immediately
    const unsubscribe = onSnapshot(
      doc(db, 'deals', result.dealId),
      (doc) => {
        updateDealUI(doc.data());
      }
    );
    
    return { dealId: result.dealId, unsubscribe };
  } catch (error) {
    handleError(error);
  }
}
```

### 2. Real-time Status Updates
```javascript
function monitorDealStatus(dealId) {
  return onSnapshot(
    doc(db, 'deals', dealId),
    (snapshot) => {
      const deal = snapshot.data();
      
      // Update UI based on status
      switch(deal.status) {
        case 'awaiting_deposit':
          showDepositPrompt(deal);
          break;
        case 'conditions_met':
          startDisputeWindowCountdown(deal.finalApprovalDeadline);
          break;
        case 'disputed':
          showDisputeInfo(deal);
          break;
        case 'escrow_released':
          showCompletionMessage();
          break;
      }
    }
  );
}
```

### 3. Condition Management
```javascript
async function updateCondition(dealId, conditionIndex, status) {
  const response = await fetch('/transaction/updateCondition', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`
    },
    body: JSON.stringify({
      dealId,
      conditionIndex,
      status
    })
  });
  
  // UI will update automatically via Firestore listener
  return response.json();
}
```

### 4. Cross-Chain Integration
```javascript
async function getQuoteForCrossChain(fromNetwork, toNetwork, amount) {
  const params = new URLSearchParams({
    fromNetwork,
    toNetwork,
    amount
  });
  
  const response = await fetch(`/transaction/v3/quote?${params}`, {
    headers: {
      'Authorization': `Bearer ${authToken}`
    }
  });
  
  const quote = await response.json();
  displayQuoteToUser(quote);
  return quote;
}
```

## Security Considerations

### Authentication & Authorization
- All endpoints except `/deal/:dealId` require authentication
- Deal participants can only access their own deals
- Only sellers can update conditions
- Only buyers can raise disputes
- Admin endpoints require special permissions

### Input Validation
- Wallet addresses validated for correct format
- Amount must be positive number
- Networks must be supported
- Conditions cannot be empty

### Smart Contract Security
- V3 contracts are audited and battle-tested
- Automatic refunds on dispute timeout
- No funds can be locked indefinitely

## Error Handling

### Common Errors
- `400 Bad Request`: Invalid input data
- `401 Unauthorized`: Missing or invalid token
- `403 Forbidden`: User not authorized for action
- `404 Not Found`: Deal not found
- `500 Internal Server Error`: Blockchain or database error

### Error Response Format
```json
{
  "error": "Detailed error message",
  "code": "ERROR_CODE",
  "details": {} // Optional additional information
}
```

## Testing Support

The module includes special handling for test environments:
- Uses blockchain test networks (Sepolia, Mumbai)
- Mock gas estimation for faster tests
- Flexible authentication in test mode

## Performance Tips

### Frontend Optimization
1. Use Firestore listeners instead of polling
2. Cache deal data locally
3. Batch condition updates when possible
4. Show optimistic UI updates
5. Implement retry logic for blockchain operations

### Blockchain Considerations
1. Show gas estimates before transactions
2. Handle transaction pending states
3. Implement transaction speed options
4. Show blockchain explorer links

## Next Steps for Frontend

1. **Build Deal Creation Wizard**: Multi-step form with validation
2. **Implement Status Dashboard**: Real-time deal tracking
3. **Add Condition Manager**: UI for sellers to update conditions
4. **Create Dispute Interface**: Buyer dispute and resolution UI
5. **Show Transaction History**: Blockchain transaction links
6. **Add Notification System**: Push notifications for status changes
7. **Implement Cross-Chain UI**: Network switching and bridging guides