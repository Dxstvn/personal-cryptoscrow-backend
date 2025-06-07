# CryptoEscrow Backend

## Overview

CryptoEscrow is a comprehensive Node.js backend system designed to power a secure, trustless escrow platform for cryptocurrency-based property or high-value asset transactions. The backend leverages **Express.js**, **Firebase** (Firestore, Authentication, Storage), and **Ethereum smart contracts** to provide a complete escrow solution.

## Core Features

### 🔐 **User Authentication & Management**
- Firebase Authentication integration (Email/Password + Google Sign-In)
- JWT token-based API security
- Contact management and invitation system
- User profile management with wallet integration

### 💰 **Multi-Network Wallet Support**
- **Ethereum** (Mainnet, Testnets) - Full support
- **Solana** - Address validation and integration ready
- **Bitcoin** - Address validation and integration ready
- **Polygon & BSC** - EVM-compatible support
- Cross-chain transaction preparation and monitoring

### 🤝 **Escrow Transaction Management**
- Complete deal lifecycle management
- Smart contract deployment per transaction
- Off-chain condition tracking and verification
- Real-time status synchronization
- Automated deadline enforcement

### 📄 **Advanced File Management**
- Secure file uploads to Firebase Storage
- Deal-specific document management
- File access control and permissions
- Download management with authentication

### ⚡ **Real-Time Features**
- Firestore real-time listeners for live updates
- Automated transaction monitoring
- Status change notifications
- Cross-platform synchronization

## Tech Stack

- **Backend**: Node.js 18+, Express.js
- **Database**: Firebase Firestore
- **Authentication**: Firebase Authentication
- **Storage**: Firebase Storage
- **Blockchain**: Ethers.js v6, Solidity
- **Smart Contract Platform**: Hardhat
- **Testing**: Jest, Supertest
- **Scheduling**: node-cron

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

#### Cross-Chain Fee Estimation
```http
POST /wallet/cross-chain/estimate-fees
Authorization: Bearer <ID_TOKEN>
Content-Type: application/json

{
  "sourceNetwork": "ethereum",
  "targetNetwork": "solana",
  "amount": "1.5"
}
```

#### Prepare Cross-Chain Transaction
```http
POST /wallet/cross-chain/prepare
Authorization: Bearer <ID_TOKEN>
Content-Type: application/json

{
  "sourceNetwork": "ethereum",
  "destinationNetwork": "solana",
  "sourceWalletAddress": "0x1234...",
  "destinationWalletAddress": "9WzDX...",
  "amount": "1.5",
  "currency": "ETH"
}
```

### 🤝 Transaction Management (`/transaction`)

#### Create New Escrow Deal
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
GET /transaction
Authorization: Bearer <ID_TOKEN>

# Optional query parameters:
?limit=10&startAfter=timestamp&orderBy=createdAt&orderDirection=desc&network=ethereum&status=ACTIVE
```

#### Update Condition Status (Buyer)
```http
PUT /transaction/:transactionId/conditions/:conditionId/buyer-review
Authorization: Bearer <ID_TOKEN>
Content-Type: application/json

{
  "newBackendStatus": "FULFILLED_BY_BUYER",
  "reviewComment": "Condition completed successfully"
}
```

#### Sync with Smart Contract
```http
PUT /transaction/:transactionId/sync-status
Authorization: Bearer <ID_TOKEN>
Content-Type: application/json

{
  "newSCStatus": "IN_FINAL_APPROVAL",
  "eventMessage": "Final approval period started",
  "finalApprovalDeadlineISO": "2023-10-27T10:00:00.000Z"
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

## Smart Contract Integration

### PropertyEscrow.sol States

The backend synchronizes with smart contract states:

- `AWAITING_DEPOSIT` - Waiting for buyer to deposit funds
- `AWAITING_FULFILLMENT` - Funds deposited, awaiting condition fulfillment
- `READY_FOR_FINAL_APPROVAL` - All conditions met, ready for approval period
- `IN_FINAL_APPROVAL` - Time-locked approval period (48 hours)
- `IN_DISPUTE` - Buyer raised dispute (7 days resolution period)
- `COMPLETED` - Funds released to seller
- `CANCELLED` - Escrow cancelled, funds refunded

### Automated Processes

The backend includes automated monitoring via `scheduledJobs.js`:

- **Deadline Enforcement**: Automatically releases funds or cancels deals based on deadlines
- **State Synchronization**: Keeps Firestore in sync with smart contract state
- **Cross-Chain Monitoring**: Tracks cross-chain transaction progress

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

### 🌐 Cross-Chain Support

The backend supports multiple blockchain networks:

- **Network Detection**: Automatic detection from wallet addresses
- **Bridge Integration**: Preparation for cross-chain transactions
- **Fee Estimation**: Real-time cross-chain fee calculations
- **Status Tracking**: Multi-step transaction monitoring

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

```bash
# Run all tests
npm test

# Run unit tests only
npm run test:unit

# Run with coverage
npm run test:coverage

# Run specific test
npm test -- --testNamePattern="specific test"
```

## Development Scripts

```bash
# Start development server
npm start

# Run linting
npm run lint

# Run Firebase emulators
npm run emulators

# Clean and reinstall dependencies
npm run clean-install
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

**Note**: This backend is designed to work seamlessly with a frontend application. All features are built with real-time updates and user experience in mind. The system handles complex escrow workflows while maintaining simplicity for frontend integration.