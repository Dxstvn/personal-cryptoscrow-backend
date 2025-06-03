# CryptoEscrow Backend

## Overview

CryptoEscrow is a comprehensive backend system designed to power a secure, trustless escrow platform for cryptocurrency-based property or high-value asset transactions. Leveraging **Node.js**, **Express**, and **Firebase** (Firestore, Authentication, Storage), the backend is responsible for:

*   User identity management (authentication and basic profile data).
*   Secure API endpoints for all client-side operations.
*   **Cross-chain transaction support** with automatic network detection and bridge integration.
*   **Multi-network wallet management** supporting Ethereum, Solana, Bitcoin, and more.
*   Detailed deal (escrow transaction) creation, tracking, and lifecycle management.
*   Off-chain storage and management of deal conditions and related documents.
*   Interaction with the `PropertyEscrow.sol` Solidity smart contract for on-chain escrow logic.
*   Automated monitoring and execution of time-sensitive on-chain actions based on deal deadlines.
*   **Advanced file management** with encryption/decryption capabilities.

The `PropertyEscrow.sol` smart contract, intended for deployment on Ethereum-compatible networks (e.g., Sepolia testnet, Ethereum Mainnet), is the ultimate arbiter of funds, managing deposits, condition-based state transitions, dispute periods, and final fund disbursal or cancellation.

This document serves as a primary guide for frontend developers, outlining how to effectively integrate with the CryptoEscrow backend API and understand its core functionalities.

## Key Features & Frontend Interaction Points

-   **Secure User Authentication**:
    -   **Backend**: Integrates seamlessly with Firebase Authentication, supporting Email/Password and Google Sign-In methods. Manages user sessions and secures API endpoints using Firebase ID Tokens.
    -   **Frontend Interaction**:
        -   Use the Firebase Client SDK to implement user sign-up and sign-in flows.
        -   Upon successful authentication, the Firebase SDK provides an ID Token.
        -   This ID Token **MUST** be included in the `Authorization` header as a Bearer token for all requests to protected backend API routes (e.g., `Authorization: Bearer <YOUR_FIREBASE_ID_TOKEN>`).
        -   The frontend should also handle token refresh scenarios as managed by the Firebase SDK.

-   **Cross-Chain Transaction Support**:
    -   **Backend**: Provides comprehensive cross-chain transaction capabilities including:
        -   Automatic source and destination network detection
        -   Bridge fee estimation and route optimization
        -   Multi-step transaction execution with status tracking
        -   Network compatibility validation
        -   Cross-chain transaction history and monitoring
    -   **Frontend Interaction**:
        -   Implement UI for cross-chain transaction creation with network selection
        -   Display bridge fees and estimated completion times
        -   Show multi-step transaction progress with real-time status updates
        -   Handle cross-chain transaction confirmations and error states
        -   Integrate with wallet switching for different networks

-   **Multi-Network Wallet Management**:
    -   **Backend**: Supports comprehensive wallet operations across multiple blockchain networks:
        -   Ethereum, Solana, Bitcoin, and other major networks
        -   Wallet registration and validation per network
        -   Multi-network balance tracking and synchronization
        -   Cross-chain wallet preparation and compatibility checking
        -   Wallet-specific transaction history
    -   **Frontend Interaction**:
        -   Implement wallet connection flows for multiple networks
        -   Display multi-network wallet balances and transaction histories
        -   Provide network switching capabilities
        -   Show wallet compatibility for cross-chain transactions
        -   Handle wallet registration and validation processes

-   **Contact Management**:
    -   **Backend**: Provides functionality for users to build and manage a list of contacts, facilitating easier selection of parties when initiating new escrow deals. Manages invitations between users.
    -   **Frontend Interaction**:
        -   Develop UI components for sending contact invitations (e.g., by email).
        -   Display lists of pending invitations (both sent and received) with options to accept, decline, or cancel.
        -   Show an authenticated user's established contact list.
        -   Allow users to remove contacts.
        -   Integrate contact selection into the "new deal" creation form.

-   **Enhanced Deal Lifecycle Management**:
    -   **Backend**: Orchestrates the entire lifecycle of an escrow deal with advanced capabilities:
        -   **Deal Creation**: Allows authenticated users to initiate new escrow deals, defining key parameters such as the parties involved, property/asset details, escrow amount, currency, and initial off-chain conditions. Can be configured to deploy a unique `PropertyEscrow` smart contract instance per deal via `contractDeployer.js`.
        -   **Cross-Chain Deal Support**: Enables escrow deals across different blockchain networks with automatic bridge integration.
        -   **Off-Chain Condition Tracking**: Manages a list of user-defined conditions (e.g., title clearance, property inspection, document notarization) within Firestore. Tracks the fulfillment status of these conditions.
        -   **On-Chain State Synchronization**: Reflects the smart contract's state (e.g., `AWAITING_DEPOSIT`, `IN_FINAL_APPROVAL`, `IN_DISPUTE`) in Firestore for easy frontend access. Provides an endpoint for manual state synchronization if needed.
        -   **Automated Deadline Management**: A critical backend process (`scheduledJobs.js`) monitors smart contract deadlines (e.g., final approval window, dispute resolution period). It uses `blockchainService.js` to trigger necessary on-chain transactions (e.g., `releaseFundsAfterApprovalPeriod`, `cancelEscrowAndRefundBuyer`) and `databaseService.js` to update Firestore records accordingly.
        -   **Advanced Transaction Analytics**: Provides detailed transaction metrics, success rates, and performance analytics.
    -   **Frontend Interaction**:
        -   Implement comprehensive forms to capture all required details for deal creation, including cross-chain options. Upon successful creation, clearly display the unique deal ID and its initial status.
        -   Provide UI for the buyer to review and mark their off-chain conditions as fulfilled. Display the current status of all conditions for both parties.
        -   Clearly display the current on-chain synchronized status of the deal. The UI must be reactive to status changes, whether driven by direct user actions, actions of the other party, or automated backend processes.
        -   **Crucially, use Firestore real-time listeners** on deal documents to reflect changes to status, conditions, timeline events, and deadlines promptly in the UI without requiring manual polling.
        -   Inform users about upcoming deadlines and the implications of automated processes.
        -   Display cross-chain transaction progress and multi-network confirmations.

-   **Advanced File Management**:
    -   **Backend**: Facilitates secure upload, storage, and download of documents related to escrow deals using Firebase Storage with advanced features:
        -   File encryption and decryption capabilities
        -   Metadata management and indexing
        -   Access control and permissions
        -   File versioning and audit trails
        -   Integration with deal-specific security requirements
    -   **Frontend Interaction**:
        -   Implement UI for file uploads with encryption options
        -   Display secure file metadata and access controls
        -   Provide encrypted file download with proper decryption
        -   Show file version history and audit trails
        -   Handle file permissions and sharing capabilities

-   **Real-Time Updates**:
    -   **Backend**: Leverages Firebase Firestore's real-time capabilities extensively with enhanced monitoring and notification systems.
    -   **Frontend Interaction**: This is a cornerstone of a smooth user experience. The frontend **MUST** subscribe to real-time updates for relevant Firestore documents and collections (especially individual deal documents and lists of deals/contacts/invitations). This ensures the UI always reflects the current state of data without manual polling.

## Tech Stack

-   **Backend**: Node.js, Express.js
-   **Database & Authentication**: Firebase Admin SDK (Firestore, Firebase Authentication, Firebase Storage)
-   **Smart Contract Environment**: Solidity, Hardhat (for development, testing, deployment of `PropertyEscrow.sol` in `src/contract`)
-   **Blockchain Interaction**: Ethers.js (v6)
-   **Scheduled Jobs**: `node-cron`
-   **Email Notifications**: Nodemailer (or similar, for contact invitations, deal notifications - if implemented)
-   **Testing**:
    -   Backend: Jest, Supertest
    -   Smart Contract: Hardhat, Chai, Ethers.js

## Getting Started (Frontend Perspective)

1.  **Backend Base URL**: All API endpoints are relative to a base URL, which will be provided (e.g., `https://your-cryptoescrow-backend.com/api` or `http://localhost:3000/api` for local development).
2.  **Authentication Setup**:
    -   Integrate the Firebase Client SDK into your frontend application. Configure it with the Firebase project credentials matching the backend.
    -   Implement user sign-up and sign-in UI flows (e.g., forms for email/password, buttons for Google Sign-In).
    -   After a user successfully signs in, the Firebase Client SDK will provide an ID Token.
    -   **For every subsequent request to protected backend API endpoints, you must include this ID Token in the `Authorization` HTTP header, prefixed with "Bearer "**:
        `Authorization: Bearer <YOUR_FIREBASE_ID_TOKEN>`
    -   The Firebase Client SDK typically handles automatic token refresh. Ensure your HTTP client interceptors correctly use the latest token.
3.  **CORS (Cross-Origin Resource Sharing)**: The backend needs to be configured with your frontend application's URL in its `FRONTEND_URL` environment variable. This allows your frontend to make requests to the backend API from a different origin. Without this, browsers will block such requests.

## API Endpoints for Frontend Integration

The backend exposes a RESTful API. All routes requiring authentication expect a Firebase ID Token. Standard HTTP status codes are utilized (e.g., `200 OK`, `201 Created`, `400 Bad Request`, `401 Unauthorized`, `403 Forbidden`, `404 Not Found`, `500 Internal Server Error`). Error responses generally follow the format: `{ "error": "A descriptive error message for the user or for debugging." }`.

API routes are modularized within `src/api/routes/`. It's recommended to also review the specific README files within those subdirectories for more granular details.

**⚠️ IMPORTANT: API Endpoint Correction**
The transaction-related endpoints use the `/transaction/` path, NOT `/deals/` as was previously documented.

### Authentication (`/auth`)
*(Managed in `src/api/routes/auth/loginSignUp.js`)*

These endpoints are used to register and sign in users. Note that while the backend handles these, the primary session management and ID token retrieval should be done via the Firebase Client SDK on the frontend.

#### 1. Sign Up with Email & Password
-   **Endpoint**: `POST /auth/signUpEmailPass`
-   **Description**: Registers a new user with the system using their email and password. The backend creates the user in Firebase Authentication and creates a user profile in Firestore.
-   **Request Body**:
    ```json
    {
      "email": "newuser@example.com",
      "password": "SecurePassword123!",
      "walletAddress": "0x1234567890123456789012345678901234567890" // Optional: User's wallet address
    }
    ```
-   **Success Response (201 Created)**:
    ```json
    {
      "message": "User created successfully",
      "user": {
        "uid": "firebaseUserIdGeneratedByFirebase",
        "email": "newuser@example.com"
      }
    }
    ```
-   **Error Responses**:
    -   `400 Bad Request`: Missing `email` or `password`, or other validation errors.
    -   `409 Conflict`: Email already in use (`auth/email-already-in-use`).
    -   Other Firebase-specific auth errors.
-   **Frontend Actions**:
    -   Provide a sign-up form to collect email, password, and (optionally) wallet address.
    -   Consider client-side validation for password strength and email format.
    -   Upon form submission, call this backend endpoint.
    -   If successful, the Firebase Client SDK on the frontend (if user also signed in via client SDK) should reflect the new user state. The frontend might then redirect to a "please verify email" page or directly to the app's main interface.

#### 2. Sign In with Email & Password
-   **Endpoint**: `POST /auth/signInEmailPass`
-   **Description**: Signs in an existing user with their email and password and returns an ID token.
-   **Request Body**:
    ```json
    {
      "email": "existinguser@example.com",
      "password": "TheirPassword123"
    }
    ```
-   **Success Response (200 OK)**:
    ```json
    {
      "message": "User signed in successfully",
      "token": "firebaseIdTokenString", // ID token for subsequent API calls
      "user": {
        "uid": "firebaseUserIdOfExistingUser",
        "email": "existinguser@example.com"
      }
    }
    ```
-   **Error Responses**:
    -   `400 Bad Request`: Missing `email` or `password`.
    -   `401 Unauthorized`: Invalid credentials (`auth/wrong-password`, `auth/user-not-found`, `auth/invalid-credential`).
-   **Frontend Actions**:
    -   Provide a sign-in form.
    -   Call this endpoint. The returned `token` should be stored for use in subsequent API calls.
    -   On success, store the ID token and navigate to the authenticated part of the application.
    -   Handle sign-in errors by displaying appropriate messages.

#### 3. Sign In/Up with Google
-   **Endpoint**: `POST /auth/signInGoogle`
-   **Description**: Authenticates a user using a Google ID token obtained from a Google Sign-In flow on the frontend. If the user is new, an account is created. **Note**: This endpoint has email whitelisting for production mode.
-   **Request Body**:
    ```json
    {
      "idToken": "googleIdTokenStringObtainedFromFrontendGoogleSignIn"
    }
    ```
-   **Success Response (200 OK)**:
    ```json
    {
      "message": "User authenticated",
      "uid": "firebaseUserId",
      "isAdmin": true // Boolean indicating admin status
    }
    ```
-   **Error Responses**:
    -   `400 Bad Request`: Missing `idToken`.
    -   `401 Unauthorized`: Invalid or expired Google ID token, or unauthorized user in test mode.
    -   `403 Forbidden`: Email address not authorized (production mode has email whitelisting).
    -   `404 Not Found`: Authenticated user profile not found.
    -   `500 Internal Server Error`: Internal authentication error.
-   **Frontend Actions**:
    -   Implement Google Sign-In using the Firebase Client SDK (recommended) or Google Identity Services.
    -   After the user signs in with Google on the frontend, retrieve the Google ID token.
    -   Send this token to the `/auth/signInGoogle` backend endpoint.
    -   The Firebase Client SDK on the frontend should already reflect the authenticated state. This backend call is often for the backend to perform its own registration/verification steps.

### Contacts (`/contact`)
*(Managed in `src/api/routes/contact/contactRoutes.js`)*

_All endpoints require `Authorization: Bearer <ID_TOKEN>` header._

#### 1. Send Contact Invitation
-   **Endpoint**: `POST /contact/invite`
-   **Description**: Sends a contact invitation from the authenticated user to another person via their email.
-   **Request Body**:
    ```json
    {
      "contactEmail": "friend@example.com"
    }
    ```
-   **Success Response (201 Created)**: `{ "message": "Invitation sent successfully", "invitationId": "generatedInvitationId" }`.
-   **Frontend Actions**: Allow user to input an email address. Handle success/error messages. Update UI if displaying pending sent invitations.

#### 2. List Pending Invitations
-   **Endpoint**: `GET /contact/pending`
-   **Description**: Retrieves a list of contact invitations that are pending for the authenticated user (i.e., invitations they have received).
-   **Success Response (200 OK)**:
    ```json
    {
      "invitations": [
        {
          "id": "invitationDocId1",
          "senderId": "senderFirebaseUid",
          "senderEmail": "sender@example.com",
          "senderFirstName": "John"
        }
        // ... more invitations
      ]
    }
    ```
-   **Frontend Actions**: Display these invitations, providing options to accept or deny each one.

#### 3. Respond to Invitation
-   **Endpoint**: `POST /contact/response`
-   **Description**: Allows the authenticated user to accept or deny a received contact invitation.
-   **Request Body**:
    ```json
    {
      "invitationId": "invitationDocId1",
      "action": "accept" // or "deny"
    }
    ```
-   **Success Response (200 OK)**: `{ "message": "Invitation <accepted/declined>" }`.
-   **Frontend Actions**: Remove the invitation from the pending list. If accepted, add the sender to the user's contact list (or refresh the contact list).

#### 4. Get User's Contact List
-   **Endpoint**: `GET /contact/contacts`
-   **Description**: Retrieves the list of established contacts for the authenticated user.
-   **Success Response (200 OK)**:
    ```json
    {
      "contacts": [
        {
          "id": "contactUid1", // Firebase UID of the contact
          "email": "friend1@example.com",
          "first_name": "Friend",
          "last_name": "One",
          "phone_number": "+1234567890",
          "wallets": ["0x1234567890123456789012345678901234567890"]
        }
        // ... more contacts
      ]
    }
    ```
-   **Frontend Actions**: Display the contacts. This list can be used to populate "other party" fields when creating a new deal.

#### 5. Remove a Contact
-   **Endpoint**: `DELETE /contact/contacts/:contactId`
-   **Description**: Removes a contact from the authenticated user's contact list.
-   **URL Parameter**: `:contactId` is the Firebase UID of the contact to be removed.
-   **Success Response (200 OK)**: `{ "message": "Contact removed successfully" }`.
-   **Frontend Actions**: Update the displayed contact list.

### Wallet Management (`/wallet`)
*(Managed in `src/api/routes/wallet/walletRoutes.js`)*

_All endpoints require `Authorization: Bearer <ID_TOKEN>` header._

#### 1. Register User Wallet
-   **Endpoint**: `POST /wallet/register`
-   **Description**: Registers a new wallet for the authenticated user on a specific network.
-   **Request Body**:
    ```json
    {
      "walletAddress": "0x1234567890123456789012345678901234567890",
      "network": "ethereum", // "ethereum", "solana", "bitcoin", etc.
      "isPrimary": true // Optional: set as primary wallet for this network
    }
    ```
-   **Success Response (201 Created)**:
    ```json
    {
      "message": "Wallet registered successfully",
      "walletId": "generatedWalletId",
      "network": "ethereum",
      "address": "0x1234567890123456789012345678901234567890"
    }
    ```
-   **Frontend Actions**: Provide wallet connection UI for multiple networks. Allow users to register wallets per network.

#### 2. Get User Wallets
-   **Endpoint**: `GET /wallet/user-wallets`
-   **Description**: Retrieves all registered wallets for the authenticated user across all networks.
-   **Success Response (200 OK)**:
    ```json
    {
      "wallets": [
        {
          "id": "walletId1",
          "address": "0x1234567890123456789012345678901234567890",
          "network": "ethereum",
          "isPrimary": true,
          "balance": "1.5",
          "lastUpdated": "2023-10-26T10:00:00.000Z"
        },
        {
          "id": "walletId2", 
          "address": "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
          "network": "solana",
          "isPrimary": true,
          "balance": "10.5",
          "lastUpdated": "2023-10-26T10:00:00.000Z"
        }
      ]
    }
    ```
-   **Frontend Actions**: Display user's wallets organized by network. Show balances and primary wallet status.

#### 3. Validate Wallet for Network
-   **Endpoint**: `POST /wallet/validate`
-   **Description**: Validates if a wallet address is compatible with a specific network and transaction requirements.
-   **Request Body**:
    ```json
    {
      "walletAddress": "0x1234567890123456789012345678901234567890",
      "network": "ethereum",
      "transactionType": "escrow" // Optional: for transaction-specific validation
    }
    ```
-   **Success Response (200 OK)**:
    ```json
    {
      "isValid": true,
      "network": "ethereum",
      "networkCompatible": true,
      "hasRequiredBalance": true,
      "validationDetails": {
        "addressFormat": "valid",
        "networkSupport": "full",
        "smartContractCapable": true
      }
    }
    ```
-   **Frontend Actions**: Use for real-time wallet validation during transaction creation.

#### 4. Prepare Cross-Chain Transaction
-   **Endpoint**: `POST /wallet/prepare-cross-chain`
-   **Description**: Prepares wallets and validates requirements for cross-chain transactions.
-   **Request Body**:
    ```json
    {
      "sourceNetwork": "ethereum",
      "destinationNetwork": "solana", 
      "sourceWalletAddress": "0x1234567890123456789012345678901234567890",
      "destinationWalletAddress": "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
      "amount": "1.5",
      "currency": "ETH"
    }
    ```
-   **Success Response (200 OK)**:
    ```json
    {
      "preparationId": "prep-cross-chain-123",
      "bridgeRoute": {
        "bridgeProvider": "LayerZero",
        "estimatedFee": "0.05",
        "estimatedTime": "10-15 minutes",
        "requiredConfirmations": 12
      },
      "networkCompatibility": {
        "sourceSupported": true,
        "destinationSupported": true,
        "bridgeAvailable": true
      }
    }
    ```
-   **Frontend Actions**: Show cross-chain transaction preparation with bridge details and estimated costs.

### Cross-Chain Transactions (`/transaction/cross-chain`)
*(Managed in `src/api/routes/transaction/transactionRoutes.js`)*

_All endpoints require `Authorization: Bearer <ID_TOKEN>` header._

#### 1. Create Cross-Chain Transaction
-   **Endpoint**: `POST /transaction/cross-chain/create`
-   **Description**: Initiates a cross-chain transaction with automatic bridge integration.
-   **Request Body**:
    ```json
    {
      "sourceNetwork": "ethereum",
      "destinationNetwork": "solana",
      "amount": "1.5", 
      "currency": "ETH",
      "sourceWalletAddress": "0x1234567890123456789012345678901234567890",
      "destinationWalletAddress": "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
      "bridgePreference": "fastest" // "fastest", "cheapest", "most_secure"
    }
    ```
-   **Success Response (201 Created)**:
    ```json
    {
      "transactionId": "cross-chain-tx-123",
      "bridgeTransactionId": "bridge-123", 
      "status": "INITIATED",
      "steps": [
        {
          "stepNumber": 1,
          "network": "ethereum", 
          "status": "PENDING",
          "description": "Initiate bridge transaction on Ethereum"
        },
        {
          "stepNumber": 2,
          "network": "bridge",
          "status": "WAITING",
          "description": "Bridge processing and validation"
        },
        {
          "stepNumber": 3,
          "network": "solana",
          "status": "WAITING", 
          "description": "Complete transaction on Solana"
        }
      ],
      "estimatedCompletionTime": "2023-10-26T10:15:00.000Z"
    }
    ```
-   **Frontend Actions**: Display multi-step transaction progress. Show each step's status and estimated completion.

#### 2. Get Cross-Chain Transaction Status
-   **Endpoint**: `GET /transaction/cross-chain/:transactionId/status`
-   **Description**: Retrieves the current status of a cross-chain transaction.
-   **Success Response (200 OK)**:
    ```json
    {
      "transactionId": "cross-chain-tx-123",
      "overallStatus": "IN_PROGRESS",
      "currentStep": 2,
      "steps": [
        {
          "stepNumber": 1,
          "network": "ethereum",
          "status": "COMPLETED",
          "txHash": "0xabc123...",
          "completedAt": "2023-10-26T10:05:00.000Z"
        },
        {
          "stepNumber": 2, 
          "network": "bridge",
          "status": "IN_PROGRESS",
          "estimatedCompletion": "2023-10-26T10:12:00.000Z"
        },
        {
          "stepNumber": 3,
          "network": "solana", 
          "status": "WAITING",
          "estimatedStart": "2023-10-26T10:12:00.000Z"
        }
      ]
    }
    ```
-   **Frontend Actions**: Update transaction progress in real-time. Use with Firestore listeners for live updates.

### Transactions (`/transaction`) - Managing Escrow Transactions
*(Managed in `src/api/routes/transaction/transactionRoutes.js`)*

**⚠️ CRITICAL: These endpoints use `/transaction/`, NOT `/deals/`**

_All endpoints require `Authorization: Bearer <ID_TOKEN>` header._

#### 1. Create a New Escrow Deal
-   **Endpoint**: `POST /transaction/create`
-   **Description**: Initiates a new escrow deal, creating a record in Firestore and potentially deploying a dedicated smart contract.
-   **Request Body Example**:
    ```json
    {
      "initiatedBy": "BUYER", // "BUYER" or "SELLER" - who is filling out this form
      "propertyAddress": "123 Main St, Anytown, USA", // Or other asset identifier
      "amount": 1.5, // Amount in ETH as number (backend converts to Wei for contract)
      "currency": "ETH", // Could be extended for other ERC20s if contract supports
      "network": "ethereum", // Network for the transaction
      "otherPartyEmail": "seller@example.com", // Email of the other party
      "buyerWalletAddress": "0xBuyerWalletAddress...", // Buyer's wallet address
      "sellerWalletAddress": "0xSellerWalletAddress...", // Seller's wallet address
      "crossChainEnabled": false, // Optional: enable cross-chain capabilities
      "initialConditions": [ // Off-chain conditions defined by the initiator
        { "id": "cond-title", "type": "TITLE_DEED", "description": "Clear title deed verified by buyer" },
        { "id": "cond-inspection", "type": "INSPECTION", "description": "Property inspection passed and approved by buyer" }
      ]
    }
    ```
-   **Success Response (201 Created)**:
    ```json
    {
      "message": "Transaction initiated successfully.",
      "transactionId": "firestoreDealIdGeneratedByBackend", // Crucial ID for Firestore listeners
      "smartContractAddress": "0xDeployedContractAddressOrNull", // Address if deployed, null otherwise
      "status": "PENDING_BUYER_REVIEW", // Or "PENDING_SELLER_REVIEW" depending on who initiated
      "network": "ethereum",
      "crossChainSupported": false,
      "deploymentWarning": "Smart contract deployment was attempted but failed..." // Only if deployment failed
    }
    ```
-   **Frontend Actions**:
    -   Provide a comprehensive form to capture all deal parameters. Use contact list for easy "other party" selection.
    -   Include network selection and cross-chain options.
    -   Validate inputs client-side (e.g., wallet address format, amount).
    -   On success, store the `transactionId`. **Immediately set up a Firestore real-time listener** for this `transactionId` to receive live updates.
    -   Display the initial deal status and details. Inform the user about next steps (e.g., waiting for other party, depositing funds).

#### 2. Retrieve Deal Details
-   **Endpoint**: `GET /transaction/:transactionId`
-   **Description**: Fetches the complete current details of a specific escrow deal from Firestore.
-   **URL Parameter**: `:transactionId` is the Firestore document ID of the deal.
-   **Success Response (200 OK)**: A full deal object.
    ```json
    {
      "id": "firestoreDealId",
      "initiatedBy": "BUYER",
      "propertyAddress": "123 Main St...",
      "amount": 1.5, // As number
      "currency": "ETH",
      "network": "ethereum",
      "buyerId": "buyerFirebaseUid",
      "sellerId": "sellerFirebaseUid",
      "buyerWalletAddress": "0x...",
      "sellerWalletAddress": "0x...",
      "status": "IN_FINAL_APPROVAL", // Current on-chain synchronized status
      "smartContractAddress": "0xDeployedContractAddress",
      "crossChainEnabled": false,
      "conditions": [
        { 
          "id": "cond-title", 
          "type": "TITLE_DEED", 
          "description": "Clear title deed verified by buyer", 
          "status": "FULFILLED_BY_BUYER",
          "createdAt": "2023-10-25T10:00:00.000Z",
          "updatedAt": "2023-10-26T10:00:00.000Z"
        }
      ],
      "timeline": [
        { "event": "Transaction initiated by buyer", "timestamp": "2023-10-25T10:00:00.000Z", "userId": "buyerFirebaseUid" }
      ],
      "finalApprovalDeadlineBackend": "2023-10-27T10:00:00.000Z", // Backend calculated, reflects on-chain if applicable
      "disputeResolutionDeadlineBackend": "2023-10-29T10:00:00.000Z", // Backend calculated
      "createdAt": "2023-10-25T10:00:00.000Z",
      "updatedAt": "2023-10-26T10:00:00.000Z"
    }
    ```
-   **Frontend Actions**: Primarily, the frontend should rely on its Firestore real-time listener for the deal document rather than calling this endpoint repeatedly. This endpoint can be useful for an initial load if a listener isn't immediately available or as a fallback.

#### 3. List User's Deals
-   **Endpoint**: `GET /transaction`
-   **Description**: Retrieves a list of deals where the authenticated user is either the buyer or the seller.
-   **Query Parameters (Optional)**:
    -   `?limit=<number_of_deals_per_page>` (e.g., 10)
    -   `?startAfter=<firestore_timestamp_or_document_id>` (for pagination)
    -   `?orderBy=<field_name>` (default: 'createdAt')
    -   `?orderDirection=<asc|desc>` (default: 'desc')
    -   `?network=<network_name>` (filter by network)
    -   `?status=<status>` (filter by transaction status)
-   **Success Response (200 OK)**:
    ```json
    [
      {
        "id": "firestoreDealId1",
        "propertyAddress": "123 Main St...",
        "amount": 1.5,
        "currency": "ETH",
        "network": "ethereum",
        "status": "IN_FINAL_APPROVAL",
        "buyerId": "buyerFirebaseUid",
        "sellerId": "sellerFirebaseUid",
        "crossChainEnabled": false,
        "createdAt": "2023-10-25T10:00:00.000Z"
      }
      // ... more deals
    ]
    ```
-   **Frontend Actions**: Display deals in a list or dashboard. Implement pagination using query parameters. Add filtering by network and status. Firestore real-time listeners can also be used on queries for live updates to the list.

#### 4. Buyer Updates Off-Chain Condition Status
-   **Endpoint**: `PUT /transaction/:transactionId/conditions/:conditionId/buyer-review`
-   **Description**: Allows the buyer in a deal to update the status of one of their off-chain conditions.
-   **URL Parameters**: `:transactionId`, `:conditionId` (ID of the condition within the deal's `conditions` array).
-   **Request Body**:
    ```json
    {
      "newBackendStatus": "FULFILLED_BY_BUYER", // "FULFILLED_BY_BUYER", "PENDING_BUYER_ACTION", or "ACTION_WITHDRAWN_BY_BUYER"
      "reviewComment": "Optional comment about the condition" // Optional
    }
    ```
-   **Success Response (200 OK)**: `{ "message": "Backend condition status updated to: FULFILLED_BY_BUYER." }` (The deal document in Firestore will be updated, triggering real-time listeners).
-   **Frontend Actions**: Provide checkboxes or buttons for the buyer to update condition statuses. The UI should react to the Firestore update. If all buyer conditions are met and funds are deposited, the backend/contract logic might automatically transition the deal state.

#### 5. Sync Backend with Smart Contract State
-   **Endpoint**: `PUT /transaction/:transactionId/sync-status`
-   **Description**: Updates the backend deal status to match smart contract state, with optional deadline updates.
-   **URL Parameter**: `:transactionId`.
-   **Request Body**:
    ```json
    {
      "newSCStatus": "IN_FINAL_APPROVAL", // Required: new status from smart contract
      "eventMessage": "Custom message for timeline", // Optional
      "finalApprovalDeadlineISO": "2023-10-27T10:00:00.000Z", // Optional: for IN_FINAL_APPROVAL status
      "disputeResolutionDeadlineISO": "2023-10-29T10:00:00.000Z" // Optional: for IN_DISPUTE status
    }
    ```
-   **Success Response (200 OK)**: `{ "message": "Transaction backend status synced/updated to IN_FINAL_APPROVAL." }`.
-   **Frontend Actions**: Use this endpoint when the frontend detects that on-chain state has changed and needs to update the backend.

#### 6. Start Final Approval Period (Smart Contract Sync)
-   **Endpoint**: `POST /transaction/:transactionId/sc/start-final-approval`
-   **Description**: Syncs the backend when the final approval period has been started on-chain.
-   **URL Parameter**: `:transactionId`.
-   **Request Body**:
    ```json
    {
      "finalApprovalDeadlineISO": "2023-10-27T10:00:00.000Z" // Required: deadline in ISO format
    }
    ```
-   **Success Response (200 OK)**: `{ "message": "Backend synced: Final approval period started." }`.
-   **Frontend Actions**: Call this endpoint after the user successfully triggers the final approval period on-chain.

#### 7. Raise Dispute (Smart Contract Sync)
-   **Endpoint**: `POST /transaction/:transactionId/sc/raise-dispute`
-   **Description**: Syncs the backend when a dispute has been raised on-chain.
-   **URL Parameter**: `:transactionId`.
-   **Request Body**:
    ```json
    {
      "disputeResolutionDeadlineISO": "2023-10-29T10:00:00.000Z", // Required: deadline in ISO format
      "conditionId": "cond-title" // Optional: ID of condition related to dispute
    }
    ```
-   **Success Response (200 OK)**: `{ "message": "Backend synced: Dispute raised." }`.
-   **Frontend Actions**: Call this endpoint after the buyer successfully raises a dispute on-chain.

### Advanced File Management (`/files`)
*(Managed in `src/api/routes/database/fileUploadDownload.js`)*

_All endpoints require `Authorization: Bearer <ID_TOKEN>` header._

#### 1. Upload Deal-Related File with Encryption
-   **Endpoint**: `POST /files/upload`
-   **Request Type**: `multipart/form-data`
-   **Description**: Uploads a file associated with a specific deal with optional encryption.
-   **Form Data Fields**:
    -   `dealId` (string): The Firestore ID of the deal.
    -   `file` (file object): The actual file data.
    -   `encrypt` (boolean): Whether to encrypt the file (optional, default: false).
    -   `accessLevel` (string): Access level - "public", "parties_only", "private" (optional, default: "parties_only").
-   **Success Response (200 OK)**:
    ```json
    {
      "message": "File uploaded successfully",
      "fileId": "generatedFileIdInFirestore", // ID of the file metadata document
      "url": "https://firebasestorage.googleapis.com/...", // Public download URL (if not encrypted)
      "encrypted": true,
      "accessLevel": "parties_only",
      "encryptionKeyId": "key-123" // Only if encrypted
    }
    ```
-   **Frontend Actions**: Use a file input element with encryption options. Construct `FormData` object. Handle upload progress if possible. On success, update the deal's file list in the UI.

#### 2. Download Encrypted File
-   **Endpoint**: `GET /files/download/:dealId/:fileId`
-   **Description**: Downloads a specific file with automatic decryption if required.
-   **URL Parameters**: `:dealId`, `:fileId`.
-   **Query Parameters (Optional)**:
    -   `?decrypt=true` (for encrypted files)
-   **Success Response**: The file itself with appropriate `Content-Type` and `Content-Disposition` headers. Encrypted files are automatically decrypted if user has permission.
-   **Frontend Actions**: Provide download links with automatic decryption handling for encrypted files.

## Enhanced Smart Contract States & Cross-Chain Implications

The `PropertyEscrow.sol` contract dictates the on-chain lifecycle. The backend synchronizes this state to Firestore (in the `deal.status` field). For cross-chain transactions, additional states and monitoring are required.

Enhanced States (including cross-chain):

-   `AWAITING_CONDITION_SETUP` / `PENDING_BUYER_SETUP`: Deal created, buyer (or initiator) might need to finalize off-chain conditions or review terms.
-   `CROSS_CHAIN_PREPARATION`: For cross-chain deals, wallets and bridge routes are being prepared.
-   `AWAITING_DEPOSIT`: All initial setup complete. Waiting for the buyer to deposit the escrow amount into the smart contract.
    -   **Frontend**: Guide buyer to make the on-chain deposit. Display clear instructions and potentially link to a wallet. For cross-chain deals, show multi-network requirements.
-   `CROSS_CHAIN_BRIDGE_IN_PROGRESS`: Funds are being bridged between networks.
    -   **Frontend**: Display bridge progress, estimated completion time, and current network confirmations.
-   `AWAITING_FULFILLMENT` / `DEPOSIT_RECEIVED`: Funds are in escrow. Buyer now needs to mark their off-chain conditions as fulfilled via the backend API.
    -   **Frontend**: Enable UI for buyer to mark conditions. Show progress to both parties.
-   `READY_FOR_FINAL_APPROVAL` / `CONDITIONS_MET`: Buyer has marked all conditions as fulfilled. The deal is ready for the final approval period to begin. Either party might need to trigger this on-chain or via an API call.
    -   **Frontend**: Indicate this state. Explain the upcoming approval period.
-   `IN_FINAL_APPROVAL`: A fixed-duration countdown (e.g., 48 hours) has started. During this time, the buyer can raise a dispute if they find issues. If no dispute is raised and the timer expires, funds can be released to the seller.
    -   **Frontend**: Clearly display the countdown. Provide a prominent option for the buyer to raise a dispute (which would involve an on-chain transaction).
-   `IN_DISPUTE`: The buyer has formally raised a dispute on-chain. A longer fixed-duration countdown (e.g., 7 days) begins for resolution (e.g., buyer re-fulfilling conditions, mutual agreement).
    -   **Frontend**: Clearly indicate "Dispute Active." Display the dispute resolution deadline. Guide users on potential actions.
-   `CROSS_CHAIN_RELEASE_IN_PROGRESS`: For cross-chain deals, funds are being released across networks.
    -   **Frontend**: Show cross-network release progress and confirmation status.
-   `COMPLETED` / `FUNDS_RELEASED`: The deal has concluded successfully; funds released to the seller (either automatically after `IN_FINAL_APPROVAL` or after dispute resolution).
    -   **Frontend**: Congratulatory message. Show transaction hash for fund release. Deal is closed. For cross-chain deals, show completion across all networks.
-   `CANCELLED` / `REFUNDED`: Escrow cancelled. Funds (if deposited) returned to the buyer. This can happen due to mutual agreement, expired dispute deadline without resolution, or other cancellation conditions in the contract.
    -   **Frontend**: Inform users of cancellation. Show transaction hash for refund if applicable. Deal is closed.

**It is paramount that the frontend uses Firestore real-time listeners to observe `deal.status` and relevant deadline fields (`finalApprovalDeadlineBackend`, `disputeResolutionDeadlineBackend`) to provide a dynamic, accurate, and timely UI reflecting the true state of the escrow, including cross-chain transaction progress.**

## Advanced Backend Processes

### Cross-Chain Transaction Monitoring
The backend includes sophisticated monitoring for cross-chain transactions:

1.  **Bridge Status Tracking**: Monitors bridge transaction progress across different providers
2.  **Network Confirmation Tracking**: Tracks confirmations on both source and destination networks  
3.  **Failed Bridge Recovery**: Handles failed bridge transactions with retry mechanisms
4.  **Cross-Chain Deadline Management**: Manages timeouts and deadlines across multiple networks

### Enhanced Automated Processes (`scheduledJobs.js`)
The frontend should be aware that certain state transitions can happen **automatically** due to backend cron jobs:

1.  **Post-Final Approval Release**: If a deal is in `IN_FINAL_APPROVAL` and its `finalApprovalDeadlineBackend` passes without a dispute, the backend job will call `blockchainService.triggerReleaseAfterApproval`.
2.  **Post-Dispute Cancellation/Refund**: If a deal is in `IN_DISPUTE` and its `disputeResolutionDeadlineBackend` passes without resolution, the backend job will call `blockchainService.triggerCancelAfterDisputeDeadline` (which typically refunds the buyer).
3.  **Cross-Chain Bridge Monitoring**: Continuous monitoring of bridge transactions with automatic status updates.
4.  **Multi-Network Wallet Balance Updates**: Regular synchronization of wallet balances across all supported networks.
5.  **Failed Transaction Recovery**: Automatic retry mechanisms for failed cross-chain transactions.

These automated actions result in on-chain transactions, and the backend updates the deal's status and timeline in Firestore. The frontend, through its real-time listeners, will see these changes and should update the UI accordingly, informing the user that an automated process has occurred.

## Network Support & Compatibility

The backend supports multiple blockchain networks:

### Primary Networks:
- **Ethereum** (Mainnet, Testnets)
- **Solana** (Mainnet, Devnet) 
- **Bitcoin** (Mainnet, Testnet)
- **Polygon** (Mainnet, Mumbai)
- **Binance Smart Chain** (Mainnet, Testnet)

### Cross-Chain Bridges Supported:
- LayerZero
- Wormhole
- Multichain (Anyswap)
- Custom bridge implementations

### Frontend Integration Requirements:
- Implement network switching capabilities
- Handle multi-network wallet connections
- Display network-specific transaction fees and times
- Show cross-chain bridge options and costs
- Handle network-specific error states

## Critical Frontend Integration Checklist

### ⚠️ Immediate Actions Required:

1. **Fix API Endpoints**: Update all frontend API calls from `/deals/` to `/transaction/`
2. **Add Authentication Headers**: Ensure all API requests include `Authorization: Bearer <ID_TOKEN>`
3. **Implement Cross-Chain UI**: Build interfaces for cross-chain transaction creation and monitoring
4. **Add Wallet Management**: Implement multi-network wallet registration and management
5. **Setup Real-Time Listeners**: Use Firestore listeners for live data updates
6. **Handle Advanced File Management**: Implement encryption/decryption for secure file handling

### 🔧 Enhanced Features to Implement:

1. **Cross-Chain Transaction Flow**: Multi-step transaction progress tracking
2. **Network Switching**: Wallet network detection and switching capabilities  
3. **Bridge Integration**: Display bridge options, fees, and estimated times
4. **Advanced Analytics**: Transaction success rates and performance metrics
5. **Real-Time Notifications**: Push notifications for transaction state changes
6. **Error Recovery**: Sophisticated error handling for cross-chain failures

## Environment Variables (Updated)

-   `FRONTEND_URL`: Crucial for CORS. The backend uses this to allow requests from your frontend's domain.
-   Firebase Client SDK configuration keys (API Key, Auth Domain, etc.): The frontend will need these to initialize the Firebase SDK. They must match the Firebase project used by the backend.
-   **New Environment Variables**:
    -   Cross-chain bridge API keys and endpoints
    -   Multi-network RPC endpoints
    -   Encryption key management settings

## Further Development & Considerations

-   **Cross-Chain Bridge Integration**: Frontend needs to handle multiple bridge providers and their specific requirements
-   **Multi-Network Wallet Support**: Implement robust wallet switching and network detection
-   **Advanced Error Handling**: Handle cross-chain transaction failures and recovery mechanisms
-   **Real-Time Cross-Chain Monitoring**: Display live progress for multi-network transactions
-   **Enhanced Security**: Implement advanced file encryption and secure key management
-   **Analytics and Reporting**: Provide detailed transaction analytics and success metrics
-   **API Versioning**: As the API evolves, versioning (e.g., `/api/v1/...`) might be introduced.
-   **WebSocket Integration**: Consider WebSocket connections for real-time cross-chain transaction updates
-   **Mobile Optimization**: Ensure cross-chain flows work smoothly on mobile wallet integrations