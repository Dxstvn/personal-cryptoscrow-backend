# CryptoEscrow Backend

## Overview

CryptoEscrow is a comprehensive Node.js backend system designed to power a secure, trustless escrow platform for cryptocurrency-based property or high-value asset transactions. The backend leverages **Express.js**, **Firebase** (Firestore, Authentication, Storage), **EscrowServiceV3**, and **multi-chain smart contracts** to provide a complete escrow solution with real-time blockchain synchronization.

## Core Features

### 🔐 **User Authentication & Management**
- Firebase Authentication integration (Email/Password + Google Sign-In)
- JWT token-based API security
- Contact management and invitation system
- User profile management with wallet integration

### 💰 **Multi-Chain Escrow Support**
- **Ethereum** (Mainnet, Sepolia) - V3 Escrow Contract
- **Arbitrum** - LayerZero cross-chain integration
- **Polygon** - EVM-compatible support
- **Uniswap Integration** - Token swapping for escrow deposits
- Real-time cross-chain transaction monitoring

### 🤝 **Advanced Escrow Management**
- **EscrowServiceV3** - Event-driven architecture with real-time sync
- **Condition Tracking** - Dynamic condition management with blockchain sync
- **Dispute Resolution** - 48-hour dispute window + 7-day resolution period
- **Cross-Chain Escrow** - LayerZero integration for multi-chain deals
- **Automated Release** - Smart contract enforced timing and validation

### 📄 **Advanced File Management**
- Secure file uploads to Firebase Storage
- Deal-specific document management
- File access control and permissions
- Download management with authentication

### ⚡ **Real-Time Blockchain Sync**
- **EventEmitter Architecture** - Real-time condition and dispute updates
- **Blockchain Event Listeners** - Automatic smart contract synchronization
- **Live Status Updates** - Instant deal status changes via Firestore
- **Cross-Chain Monitoring** - Multi-network transaction tracking

## Tech Stack

- **Backend**: Node.js 18+, Express.js
- **Database**: Firebase Firestore (real-time listeners)
- **Authentication**: Firebase Authentication
- **Storage**: Firebase Storage
- **Blockchain**: Ethers.js v6, Solidity, LayerZero, Uniswap
- **Smart Contracts**: Hardhat, EscrowV3, Cross-chain integration
- **Testing**: Vitest, Supertest, Firebase Emulators, Hardhat
- **Event System**: EventEmitter for real-time sync

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn
- Firebase project with Admin SDK credentials
- Ethereum RPC endpoint (Infura, Alchemy, etc.)

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd personal-cryptoscrow-backend

# Install dependencies
npm install

# Set up environment variables
cp env.template .env
# Edit .env with your configuration

# Start development server
npm start
```

### Environment Variables

Required environment variables:

```bash
# Server Configuration
NODE_ENV=development
PORT=3000

# Firebase Configuration
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_API_KEY=your-api-key
FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
FIREBASE_STORAGE_BUCKET=your-project.appspot.com
GOOGLE_APPLICATION_CREDENTIALS=path/to/service-account.json

# Blockchain Configuration
RPC_URL=https://mainnet.infura.io/v3/your-key
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/your-key
CHAIN_ID=1
DEPLOYER_PRIVATE_KEY=your-deployer-private-key
BACKEND_WALLET_PRIVATE_KEY=your-backend-wallet-key

# Cross-Chain & DeFi Integration
LAYERZERO_ENDPOINT=your-layerzero-endpoint
UNISWAP_ROUTER_ADDRESS=your-uniswap-router
ARBITRUM_RPC_URL=https://arb1.arbitrum.io/rpc

# Security
JWT_SECRET=your-jwt-secret
ENCRYPTION_KEY=your-32-char-encryption-key

# CORS
FRONTEND_URL=https://your-frontend-domain.com
```

## API Documentation

The backend exposes a RESTful API with the following main routes:

### Base URL
All endpoints are relative to: `https://your-backend-domain.com` or `http://localhost:3000` for development.

### Authentication Headers
Most endpoints require Firebase ID Token:
```
Authorization: Bearer <FIREBASE_ID_TOKEN>
```

## API Routes

### 🔐 Authentication (`/auth`)

#### Sign Up with Email & Password
```http
POST /auth/signUpEmailPass
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecurePassword123!",
  "walletAddress": "0x1234..." // Optional
}
```

#### Sign In with Email & Password
```http
POST /auth/signInEmailPass
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecurePassword123!"
}
```

#### Google Sign-In
```http
POST /auth/signInGoogle
Content-Type: application/json

{
  "idToken": "google-id-token-from-frontend"
}
```

### 👥 Contact Management (`/contact`)

#### Send Contact Invitation
```http
POST /contact/invite
Authorization: Bearer <ID_TOKEN>
Content-Type: application/json

{
  "contactEmail": "friend@example.com"
}
```

#### Get Pending Invitations
```http
GET /contact/pending
Authorization: Bearer <ID_TOKEN>
```

#### Respond to Invitation
```http
POST /contact/response
Authorization: Bearer <ID_TOKEN>
Content-Type: application/json

{
  "invitationId": "invitation-id",
  "action": "accept" // or "deny"
}
```

#### Get Contacts List
```http
GET /contact/contacts
Authorization: Bearer <ID_TOKEN>
```

#### Remove Contact
```http
DELETE /contact/contacts/:contactId
Authorization: Bearer <ID_TOKEN>
```

### 💼 Wallet Management (`/wallet`)

#### Register User Wallet
```http
POST /wallet/register
Authorization: Bearer <ID_TOKEN>
Content-Type: application/json

{
  "walletAddress": "0x1234...",
  "network": "ethereum", // "ethereum", "solana", "bitcoin", etc.
  "isPrimary": true
}
```

#### Get User Wallets
```http
GET /wallet/user-wallets
Authorization: Bearer <ID_TOKEN>
```

#### Validate Wallet
```http
POST /wallet/validate
Authorization: Bearer <ID_TOKEN>
Content-Type: application/json

{
  "walletAddress": "0x1234...",
  "network": "ethereum",
  "transactionType": "escrow"
}
```


### 🤝 Transaction Management (`/transaction`)

#### Create New V3 Escrow Deal
```http
POST /transaction/create
Authorization: Bearer <ID_TOKEN>
Content-Type: application/json

{
  "initiatedBy": "BUYER", // or "SELLER"
  "propertyAddress": "123 Main St, Anytown, USA",
  "amount": 1.5,
  "currency": "ETH",
  "network": "ethereum",
  "otherPartyEmail": "seller@example.com",
  "buyerWalletAddress": "0xBuyer...",
  "sellerWalletAddress": "0xSeller...",
  "buyerChainId": 1, // Ethereum Mainnet
  "sellerChainId": 42161, // Arbitrum (for cross-chain)
  "contractType": "V3_ESCROW",
  "initialConditions": [
    {
      "id": "cond-title", 
      "type": "TITLE_DEED", 
      "description": "Clear title deed verified"
    }
  ]
}
```

#### Get Deal Details
```http
GET /transaction/:transactionId
Authorization: Bearer <ID_TOKEN>
```

#### List User's Deals
```http
GET /transaction/transactions
Authorization: Bearer <ID_TOKEN>

# Optional query parameters:
?limit=10&startAfter=timestamp&orderBy=createdAt&orderDirection=desc&network=ethereum&status=ACTIVE
```

#### Update Deal Condition (Real-time Sync)
```http
PUT /transaction/:dealId/update-condition
Authorization: Bearer <ID_TOKEN>
Content-Type: application/json

{
  "conditionId": "cond-title",
  "newStatus": "FULFILLED",
  "description": "Title deed verification completed",
  "metadata": { "verificationHash": "0x..." }
}
```

#### Raise Deal Dispute
```http
POST /transaction/:dealId/raise-dispute
Authorization: Bearer <ID_TOKEN>
Content-Type: application/json

{
  "reason": "CONDITION_NOT_MET",
  "description": "Title verification failed",
  "evidence": ["file1.pdf", "file2.jpg"]
}
```

#### Resolve Deal Dispute
```http
POST /transaction/:dealId/resolve-dispute
Authorization: Bearer <ID_TOKEN>
Content-Type: application/json

{
  "resolution": "RELEASE_TO_SELLER", // or "REFUND_TO_BUYER"
  "resolutionNotes": "Evidence supports seller's claim"
}
```

#### Release Escrow (48-hour window enforced)
```http
POST /transaction/:dealId/release-escrow
Authorization: Bearer <ID_TOKEN>
Content-Type: application/json

{
  "releaseType": "STANDARD" // or "EMERGENCY"
}
```

### 📄 File Management (`/files`)

#### Upload File
```http
POST /files/upload
Authorization: Bearer <ID_TOKEN>
Content-Type: multipart/form-data

Form Data:
- dealId: "deal-id"
- file: [file-binary]
```

#### Download File
```http
GET /files/download/:dealId/:fileId
Authorization: Bearer <ID_TOKEN>
```

#### Get User's Files
```http
GET /files/my-deals
Authorization: Bearer <ID_TOKEN>
```

### 🏥 Health Check (`/health`)

#### Health Status
```http
GET /health
# No authentication required

Response:
{
  "status": "OK"
}
```

## Smart Contract Integration (V3)

### EscrowV3 Contract States

The backend synchronizes with V3 smart contract states:

- `AWAITING_DEPOSIT` - Waiting for buyer to deposit funds
- `AWAITING_FULFILLMENT` - Funds deposited, awaiting condition fulfillment
- `DISPUTE_WINDOW` - 48-hour period after conditions met (dispute allowed)
- `IN_DISPUTE` - Active dispute (7-day resolution period)
- `COMPLETED` - Funds released to seller
- `CANCELLED` - Escrow cancelled, funds refunded

### Event-Driven Architecture

Real-time blockchain synchronization via EventEmitter:

- **Condition Updates**: Instant propagation of condition status changes
- **Dispute Events**: Real-time dispute creation and resolution
- **Cross-Chain Sync**: LayerZero message bridging for multi-chain deals
- **Automatic Release**: Smart contract enforced 48-hour + 7-day timing

### Timing Mechanisms

- **48-Hour Dispute Window**: After all conditions met, buyers can raise disputes
- **7-Day Resolution**: If dispute raised, 7-day period for resolution
- **Automatic Release**: If no disputes in 48 hours, funds auto-release to seller

## Frontend Integration Guide

### 🔥 Real-Time Updates (Critical)

**ALWAYS use Firestore real-time listeners** for live data updates:

```javascript
// Example: Listen to deal updates
import { doc, onSnapshot } from 'firebase/firestore';

const unsubscribe = onSnapshot(
  doc(db, 'deals', dealId), 
  (doc) => {
    if (doc.exists()) {
      const dealData = doc.data();
      // Update UI with new deal status
      updateDealUI(dealData);
    }
  }
);
```

### 🔐 Authentication Flow

1. **Frontend**: Use Firebase Client SDK for user authentication
2. **Get ID Token**: Extract Firebase ID token after successful auth
3. **API Calls**: Include token in Authorization header for all protected endpoints
4. **Real-time**: Set up Firestore listeners for live data updates

### 🌐 Cross-Chain & DeFi Integration

The backend supports advanced multi-chain functionality:

- **LayerZero Integration**: Cross-chain message passing for escrow sync
- **Uniswap Integration**: Token swapping for escrow deposits
- **Multi-Network Support**: Ethereum, Arbitrum, Polygon
- **Real-time Monitoring**: Cross-chain transaction status tracking

### 📱 Error Handling

Standard HTTP status codes with JSON error responses:

```javascript
// Error response format
{
  "error": "Descriptive error message",
  "code": "ERROR_CODE" // Optional
}
```

### 🔄 State Management

- **Initial Load**: Use GET endpoints for first data fetch
- **Live Updates**: Firestore listeners for real-time changes
- **User Actions**: API calls for state modifications
- **Optimistic Updates**: Update UI immediately, sync with backend

## Testing

### Comprehensive Test Suite

```bash
# Run all tests (Vitest)
npm test

# Run unit tests with mocks
npm run test:unit

# Run integration tests with Firebase emulators
npm run test:integration

# Run real integration tests with Hardhat + Firebase
npm run test:real-integration

# Run with coverage
npm run test:coverage
```

### Test Architecture

- **Unit Tests**: Fully mocked dependencies (24 tests)
- **Integration Tests**: Firebase emulators only  
- **Real Integration Tests**: Hardhat blockchain + Firebase emulators (21 tests)
- **Coverage**: Authentication, escrow operations, dispute resolution, cross-chain

## Development Scripts

```bash
# Start development server
npm start

# Run linting
npm run lint

# Run Firebase emulators
npm run emulators

# Start Hardhat local blockchain
cd src/contract && npx hardhat node

# Deploy contracts to local Hardhat
cd src/contract && npx hardhat run scripts/deploy.js --network localhost
```

## Security Features

- **Rate Limiting**: Per-endpoint rate limiting with health check exemptions
- **Input Sanitization**: XSS protection and input validation
- **CORS Protection**: Configured allowed origins
- **Helmet Security**: Comprehensive security headers
- **Error Handling**: Secure error responses that don't leak sensitive data

## Deployment

The backend supports deployment to various platforms:

- **AWS EC2**: Production deployment scripts available
- **Firebase Functions**: Alternative serverless deployment
- **Docker**: Containerization support
- **Local Development**: Complete local development setup

## Support & Documentation

- **API Endpoints**: All endpoints documented with request/response examples
- **Real-time Integration**: Firestore listener setup guides
- **Error Handling**: Comprehensive error response documentation
- **Testing**: Complete test suite with examples

## Contributing

1. Fork the repository
2. Create a feature branch
3. Implement changes with tests
4. Submit a pull request

## License

[License information]

---

## Key Features Summary

- **V3 Escrow Architecture**: Event-driven real-time blockchain synchronization
- **Multi-Chain Support**: Ethereum, Arbitrum, Polygon with LayerZero bridging
- **DeFi Integration**: Uniswap token swapping for flexible escrow deposits  
- **Dispute Resolution**: 48-hour dispute window + 7-day resolution enforcement
- **Comprehensive Testing**: 45+ tests across unit, integration, and real blockchain scenarios
- **Real-Time Sync**: EventEmitter architecture for instant status updates

**Note**: This V3 backend provides a complete escrow solution with advanced blockchain integration, real-time synchronization, and comprehensive test coverage. The system enforces secure timing mechanisms while maintaining seamless frontend integration.