# CryptoEscrow Backend

![GitHub License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node.js](https://img.shields.io/badge/Node.js-v18-green.svg)
![Solidity](https://img.shields.io/badge/Solidity-v0.8.20-blue.svg)

## Overview

CryptoEscrow is a backend service and smart contract system designed to facilitate secure, trustless escrow for cryptocurrency-based property transactions. Built with **Node.js**, **Express**, and **Firebase** (Firestore, Authentication, Storage), the backend manages user authentication, deal creation, file uploads, and off-chain state tracking. The `PropertyEscrow` Solidity smart contract, deployed on Ethereum, handles on-chain escrow logic, including fund deposits, condition approvals, and dispute resolution.

The system deploys individual escrow contracts for each deal, ensuring isolated and transparent fund management. It supports flexible off-chain condition tracking (e.g., title clearance, inspections) while focusing on core escrow functionality, making it suitable for real estate, tokenized assets, and other high-value transactions.

## Features

- **Secure Escrow**: Smart contracts hold cryptocurrency (e.g., ETH) until buyer and seller approve conditions or resolve disputes.
- **User Authentication**: Supports email/password and Google Sign-In via Firebase Authentication.
- **Contact Management**: Users can send, accept, or decline contact invitations to facilitate deal collaboration.
- **Deal Creation**: Initiates escrow deals with customizable conditions (e.g., title clearance, inspections) tracked off-chain.
- **File Management**: Upload and download deal-related documents (e.g., title deeds, inspection reports) via Firebase Storage.
- **Dispute Resolution**: Includes a 48-hour final approval period and a 7-day dispute resolution window, with automatic fund refunds if unresolved.
- **Real-Time Tracking**: Firestore provides real-time updates on deal status and conditions.
- **Blockchain Integration**: Deploys and interacts with `PropertyEscrow` contracts using Hardhat and Ethers.js.

## Tech Stack

- **Backend**: Node.js, Express, Firebase Admin SDK (Firestore, Authentication, Storage), Nodemailer
- **Smart Contract**: Solidity, Hardhat, Ethers.js
- **Testing**: Jest, Supertest (backend); Hardhat, Chai (smart contract)
- **Blockchain**: Ethereum (supports testnets like Sepolia or Mainnet)
- **Frontend Integration**: Configurable CORS for frontend apps (set via `FRONTEND_URL`)

## Prerequisites

### Environment Variables

Create a `.env` file in the root directory with the following variables:

```env
# Firebase Admin SDK Credentials
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account-key.json

# Firebase Client SDK Config (for auth in production)
FIREBASE_API_KEY=your-api-key
FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_STORAGE_BUCKET=your-project-id.appspot.com
FIREBASE_MESSAGING_SENDER_ID=your-sender-id
FIREBASE_APP_ID=your-app-id
FIREBASE_MEASUREMENT_ID=your-measurement-id # Optional

# Smart Contract Deployment
DEPLOYER_PRIVATE_KEY=your-private-key # Handle with care
RPC_URL=https://sepolia.infura.io/v3/your-infura-key # Or other network URL

# Optional: Contract Verification and Gas Reporting
ETHERSCAN_API_KEY=your-etherscan-api-key
REPORT_GAS=true
COINMARKETCAP_API_KEY=your-coinmarketcap-api-key

# Frontend CORS
FRONTEND_URL=http://your-frontend-url.com
```

### Dependencies

- Node.js (v18 or higher)
- Hardhat (for smart contract development and deployment)
- Firebase CLI (optional, for emulator setup)
- Ethereum wallet with funds for gas (for deployment)

Install dependencies:

```bash
npm install
```

## Setup

1. **Clone the Repository**:

   ```bash
   git clone https://github.com/Dxstvn/personal-cryptoscrow-backend.git
   cd personal-cryptoscrow-backend
   ```

2. **Configure Environment Variables**:

   Create a `.env` file with the variables listed above. Ensure `DEPLOYER_PRIVATE_KEY` is secure and never committed to version control.

3. **Install Dependencies**:

   ```bash
   npm install
   ```

4. **Run Firebase Emulators (Optional for Development)**:

   Start the Firebase Emulator Suite for Firestore, Authentication, and Storage:

   ```bash
   firebase emulators:start
   ```

5. **Compile Smart Contract**:

   Compile the `PropertyEscrow` contract:

   ```bash
   cd src/contract
   npx hardhat compile
   ```

6. **Run the Backend**:

   Start the Express server:

   ```bash
   npm start
   ```

   The API will be available at `http://localhost:3000` (or your configured port).

## API Endpoints

The backend exposes RESTful APIs for managing users, contacts, deals, and files. All authenticated routes require a Firebase ID Token in the `Authorization` header (Bearer token).

### Authentication (`/auth`)

- **POST `/auth/signUpEmailPass`**: Register a new user with email and password.
- **POST `/auth/signInEmailPass`**: Sign in with email and password.
- **POST `/auth/signInGoogle`**: Authenticate via Google ID token.

### Contacts (`/contact`)

- **POST `/contact/invite`**: Send a contact invitation to another user.
- **GET `/contact/pending`**: List pending invitations.
- **POST `/contact/response`**: Accept or deny an invitation.
- **GET `/contact/contacts`**: Get the user’s contact list.
- **DELETE `/contact/contacts/:contactId`**: Remove a contact.

### Deals (`/deals`)

- **POST `/deals/create`**: Create a new escrow deal, optionally deploying a smart contract.
  - Request Body:
    ```json
    {
      "initiatedBy": "BUYER",
      "propertyAddress": "123 Main St",
      "amount": 1.5,
      "otherPartyEmail": "seller@example.com",
      "buyerWalletAddress": "0x...",
      "sellerWalletAddress": "0x...",
      "initialConditions": [
        { "id": "cond-title", "type": "TITLE_DEED", "description": "Clear title" }
      ],
      "deployToNetwork": "sepolia"
    }
    ```
- **GET `/deals/:transactionId`**: Retrieve deal details.
- **GET `/deals`**: List user’s deals with pagination.
- **PUT `/deals/:transactionId/conditions/:conditionId/buyer-review`**: Update off-chain condition status.
- **PUT `/deals/:transactionId/sync-status`**: Sync backend with smart contract state.

### Files (`/files`)

- **POST `/files/upload`**: Upload deal-related files (PDF, JPG, PNG; max 5MB).
- **GET `/files/my-deals`**: List file metadata for user’s deals.
- **GET `/files/download/:dealId/:fileId`**: Download a specific file.

### Health Check (`/health`)

- **GET `/health`**: Verify backend connectivity to Firestore.

For detailed API documentation, see [API Documentation](docs/api.md) (create this file if needed).

## Smart Contract: `PropertyEscrow`

The `PropertyEscrow` smart contract manages on-chain escrow for a single deal.

### Key Features
- **Fund Management**: Holds buyer’s cryptocurrency until conditions are met.
- **Condition Tracking**: Buyer sets and fulfills conditions (e.g., title clearance).
- **Approval Period**: 48-hour window for final review after conditions are met.
- **Dispute Resolution**: 7-day period if buyer raises a dispute, with refund option if unresolved.
- **States**: AWAITING_CONDITION_SETUP, AWAITING_DEPOSIT, AWAITING_FULFILLMENT, READY_FOR_FINAL_APPROVAL, IN_FINAL_APPROVAL, IN_DISPUTE, COMPLETED, CANCELLED.

### Key Functions
- `setConditions`: Buyer defines conditions.
- `depositFunds`: Buyer deposits escrow amount.
- `fulfillCondition`: Buyer marks conditions as met.
- `startFinalApprovalPeriod`: Starts 48-hour approval period.
- `confirmAndReleaseFunds`: Releases funds to seller.
- `buyerWithdrawConditionApproval`: Raises a dispute.
- `cancelEscrow`: Cancels escrow, refunding buyer.

### Deployment
- **Manual**: Use Hardhat script:
  ```bash
  cd src/contract
  npx hardhat run scripts/deployPropertyEscrow.js --network sepolia
  ```
- **Programmatic**: Handled by backend via `POST /deals/create`.

## Testing

### Backend
Run tests with Firebase Emulators:

```bash
npm run test:emulator
```

Tests are located in `src/api/routes/**/__tests__`, using Jest and Supertest.

### Smart Contract
Run Hardhat tests:

```bash
cd src/contract
npx hardhat test
```

Tests are in `src/contract/test`, using Chai.

## Deployment

1. **Backend**:
   - Deploy on Vercel or another Node.js host.
   - Configure environment variables in the hosting platform.
   - Ensure Firebase services are set up in production mode.

2. **Smart Contract**:
   - Deploy to Ethereum testnet (e.g., Sepolia) or Mainnet.
   - Verify contracts on Etherscan using `ETHERSCAN_API_KEY`.

## Future Enhancements

- **Gas Optimization**: Use a factory contract to reduce deployment costs.
- **Tokenized Assets**: Support on-chain title verification for real estate NFTs.
- **Advanced Disputes**: Integrate mediation or arbitration services.
- **Multi-Asset Support**: Extend to other cryptocurrencies or stablecoins.

## Contributing

Contributions are welcome! Please:
1. Fork the repository.
2. Create a feature branch (`git checkout -b feature/your-feature`).
3. Commit changes (`git commit -m "Add your feature"`).
4. Push to the branch (`git push origin feature/your-feature`).
5. Open a pull request.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

## Contact

For questions or support, contact the maintainer at [your-email@example.com](mailto:your-email@example.com) or open an issue on GitHub.

---

### Notes
- **Customization**: Replace placeholders like `your-email@example.com` with your actual contact information. If you have a specific license or additional contributors, update those sections.
- **Additional Files**: The README references an `API Documentation` file (`docs/api.md`). You can create this by extracting the API routes section from the provided GitHub documentation or let me generate it separately.
- **Badges**: The badges (e.g., license, Node.js version) enhance visual appeal. You can add more (e.g., CI status) if you set up GitHub Actions.
- **Deployment**: The deployment section assumes Vercel due to your use of v0. Adjust if you prefer another platform (e.g., Heroku, AWS).

If you want to refine specific sections, add more details (e.g., frontend integration), or generate the `docs/api.md` file, let me know!