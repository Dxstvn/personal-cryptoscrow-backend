# CryptoEscrow Platform

## Overview

CryptoEscrow is a secure, blockchain-powered escrow platform designed for real estate and high-value asset transactions. It provides a trustless environment where buyers and sellers can conduct transactions with confidence, leveraging smart contracts for secure fund management and condition verification.

## Current Status

**IMPORTANT**: This application is currently a **simulation/prototype**. While the user interface and flows are fully functional, the blockchain interactions are simulated, and the backend uses mock data for demonstration purposes. The Firebase authentication and Google Cloud Storage integration are functional, but the smart contract deployment and blockchain transactions are simulated.

## Features

### Authentication & User Management
- Secure user authentication via Firebase Auth
- Email/password and Google sign-in options
- User profile management
- Wallet address association

### Contact Management
- Contact invitation system
- Contact list management
- Secure counterparty selection for transactions

### Wallet Integration
- Connect multiple cryptocurrency wallets
- Support for MetaMask, Coinbase Wallet, and other providers
- Wallet balance display
- Transaction history

### Two-Stage Transaction Process
- **Seller-Initiated Transactions**: 
  - Seller creates transaction details
  - Buyer reviews and adds conditions
  - Buyer deposits funds
  - Seller confirms conditions
  - Smart contract deployment
  
- **Buyer-Initiated Transactions**:
  - Buyer creates transaction with conditions
  - Buyer deposits funds
  - Seller reviews and confirms
  - Smart contract deployment

### Document Management
- Secure document upload and storage via Google Cloud Storage
- Document verification and approval
- Document association with transaction conditions

### Transaction Lifecycle Management
- Comprehensive status tracking
- Timeline visualization
- Condition fulfillment tracking
- Dispute resolution mechanism
- Automated deadline management

### Smart Contract Integration (Simulated)
- Escrow fund management
- Condition verification
- Automated fund release
- Dispute handling

## Technology Stack

### Frontend
- Next.js (App Router)
- React
- TypeScript
- Tailwind CSS
- shadcn/ui components
- Ethers.js for blockchain interactions

### Backend
- Node.js
- Express
- Firebase Admin SDK
- Google Cloud Storage
- Firestore Database

### Authentication
- Firebase Authentication

### Storage
- Google Cloud Storage for document storage
- Firestore for application data

## Getting Started

### Prerequisites
- Node.js 18+ and npm
- Firebase project with Authentication and Firestore enabled
- Google Cloud Storage bucket
- Ethereum wallet (MetaMask, Coinbase Wallet, etc.) for testing

### Environment Variables
Create a `.env.local` file with the following variables:

\`\`\`
# Firebase Configuration
NEXT_PUBLIC_FIREBASE_API_KEY=your_firebase_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_firebase_auth_domain
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_firebase_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_firebase_storage_bucket
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_firebase_messaging_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_firebase_app_id
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=your_firebase_measurement_id

# Google Cloud Storage
GOOGLE_CLOUD_PROJECT_ID=your_google_cloud_project_id
GOOGLE_CLOUD_STORAGE_BUCKET=your_storage_bucket_name

# Backend API
NEXT_PUBLIC_API_URL=http://44.202.141.56:3000
\`\`\`

### Installation

1. Clone the repository:
\`\`\`bash
git clone https://github.com/yourusername/crypto-escrow.git
cd crypto-escrow
\`\`\`

2. Install dependencies:
\`\`\`bash
npm install
\`\`\`

3. Run the development server:
\`\`\`bash
npm run dev
\`\`\`

4. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Transaction Flow

### Seller-Initiated Transaction

1. **Seller Creates Transaction**:
   - Seller provides property details, price, and selects buyer from contacts
   - System assigns status `PENDING_BUYER_REVIEW`
   - Buyer receives notification

2. **Buyer Reviews Transaction**:
   - Buyer reviews property details and price
   - Buyer adds conditions (title deeds, inspections, etc.)
   - Buyer confirms review, status changes to `AWAITING_FUNDS`

3. **Buyer Deposits Funds**:
   - Buyer deposits funds into the smart contract
   - Status changes to `AWAITING_SELLER_CONFIRMATION`

4. **Seller Confirms Conditions**:
   - Seller reviews and confirms buyer's conditions
   - Smart contract is deployed with agreed conditions
   - Status changes to `IN_ESCROW`

5. **Condition Fulfillment**:
   - Seller uploads required documents
   - Buyer verifies and approves each condition
   - When all conditions are met, status changes to `READY_FOR_FINAL_APPROVAL`

6. **Final Approval and Completion**:
   - Final approval period begins (typically 48 hours)
   - If no disputes, funds are released to seller
   - Status changes to `COMPLETED`

### Buyer-Initiated Transaction

1. **Buyer Creates Transaction**:
   - Buyer provides property details, price, conditions
   - Buyer deposits funds into smart contract
   - Status is set to `AWAITING_SELLER_CONFIRMATION`

2. **Seller Confirmation**:
   - Seller reviews transaction details and conditions
   - Upon acceptance, status changes to `IN_ESCROW`

3. **Condition Fulfillment and Completion**:
   - Same as steps 5-6 in the Seller-Initiated flow

## Development Roadmap

### Current Limitations
- Smart contract interactions are simulated
- Limited blockchain network support
- Basic dispute resolution mechanism

### Planned Features
- Real blockchain integration with Ethereum and other networks
- Multi-signature wallet support
- Advanced dispute resolution with arbitration
- Mobile application
- Enhanced analytics and reporting
- Multi-currency support

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgements

- [Next.js](https://nextjs.org/)
- [React](https://reactjs.org/)
- [Tailwind CSS](https://tailwindcss.com/)
- [shadcn/ui](https://ui.shadcn.com/)
- [Firebase](https://firebase.google.com/)
- [Ethers.js](https://docs.ethers.io/)
