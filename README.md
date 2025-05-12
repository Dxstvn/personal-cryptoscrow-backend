
# CryptoEscrow Backend

## Overview

CryptoEscrow is a backend service and smart contract system designed to facilitate secure, trustless escrow for cryptocurrency-based property transactions. Built with **Node.js**, **Express**, and **Firebase** (Firestore, Authentication, Storage), the backend manages user authentication, deal creation and management, file uploads, and off-chain state tracking. The `PropertyEscrow` Solidity smart contract, deployed on an Ethereum-compatible network, handles the on-chain escrow logic, including fund deposits, condition approvals, and dispute resolution.

This document provides guidance for frontend developers on how to interact with the CryptoEscrow backend API.

## Key Features & Frontend Interaction Points

-   **Secure User Authentication**:
    
    -   Integrates with Firebase Authentication (Email/Password & Google Sign-In).
        
    -   **Frontend**: Use Firebase SDK to authenticate users and obtain a Firebase ID Token. This token must be sent in the `Authorization` header as a Bearer token for all protected API routes.
        
-   **Contact Management**:
    
    -   Allows users to build a contact list for easier deal initiation.
        
    -   **Frontend**: UI for sending, viewing pending, accepting/declining invitations, and managing contacts.
        
-   **Deal Lifecycle Management**:
    
    -   **Deal Creation**: Users can initiate escrow deals, defining parties, amounts, and initial off-chain conditions. The backend can deploy a unique `PropertyEscrow` smart contract for each deal.
        
        -   **Frontend**: Forms to capture all deal parameters. Display deal ID and initial status upon creation.
            
    -   **Off-Chain Condition Tracking**: Conditions (e.g., title clearance, inspections) are managed in Firestore.
        
        -   **Frontend**: UI for buyers to mark conditions as fulfilled. Display current status of all conditions.
            
    -   **On-Chain Escrow States**: The smart contract manages distinct states (e.g., `AWAITING_DEPOSIT`, `IN_FINAL_APPROVAL`, `IN_DISPUTE`, `COMPLETED`, `CANCELLED`).
        
        -   **Frontend**: Display the current on-chain synchronized status of the deal. Be prepared for status changes driven by user actions or automated backend processes.
            
    -   **Automated Deadline Management**: Backend jobs (`scheduledJobs.js`) monitor contract deadlines (final approval, dispute resolution).
        
        -   `blockchainService.js` is used to trigger on-chain transactions like `releaseFundsAfterApprovalPeriod` or `cancelEscrowAndRefundBuyer`.
            
        -   `databaseService.js` updates Firestore with the outcomes.
            
        -   **Frontend**: Deal statuses can change automatically (e.g., to `COMPLETED` or `CANCELLED`). Use Firestore real-time listeners to reflect these changes promptly in the UI.
            
-   **File Management**:
    
    -   Securely upload and download deal-related documents using Firebase Storage.
        
    -   **Frontend**: UI for file uploads (e.g., using `FormData`) and listing/downloading associated files for a deal.
        
-   **Real-Time Updates**:
    
    -   Firestore provides real-time updates for deal status, conditions, and timeline events.
        
    -   **Frontend**: Leverage Firestore's real-time capabilities to keep the UI synchronized without manual polling for most deal data.
        

## Tech Stack

-   **Backend**: Node.js, Express, Firebase Admin SDK (Firestore, Authentication, Storage), Nodemailer
    
-   **Smart Contract**: Solidity, Hardhat, Ethers.js (v6)
    
-   **Testing**: Jest, Supertest (backend); Hardhat, Chai (smart contract)
    
-   **Blockchain**: Ethereum (supports testnets like Sepolia or Mainnet)
    

## Getting Started (Frontend Perspective)

1.  **Backend Base URL**: Assume the backend API is hosted at a specific URL (e.g., `https://your-cryptoescrow-backend.com/api`).
    
2.  **Authentication**:
    
    -   Implement user sign-up/sign-in using the Firebase Client SDK in your frontend application.
        
    -   Upon successful authentication, Firebase provides an ID Token.
        
    -   For every request to a protected backend API endpoint, include this token in the Authorization header:
        
        Authorization: Bearer <YOUR_FIREBASE_ID_TOKEN>
        
3.  **CORS**: The backend should be configured with your frontend's URL in its `FRONTEND_URL` environment variable to allow Cross-Origin Resource Sharing.
    

## API Endpoints for Frontend Integration

The backend exposes RESTful APIs. All authenticated routes require a Firebase ID Token. Standard HTTP status codes are used (200/201 for success, 4xx for client errors, 5xx for server errors). Error responses typically follow the format: `{ "error": "Descriptive error message" }`.

### Authentication (`/auth`)

#### 1. Sign Up with Email & Password

-   **POST** `/auth/signUpEmailPass`
    
-   **Description**: Registers a new user.
    
-   **Request Body**:
    
    ```
    {
      "email": "user@example.com",
      "password": "password123",
      "displayName": "John Doe"
    }
    
    ```
    
-   **Success Response (201 Created)**:
    
    ```
    {
      "message": "User registered successfully. Please verify your email.",
      "userId": "firebaseUserId"
      // Potentially other user details, but frontend usually gets user from Firebase SDK
    }
    
    ```
    
-   **Frontend Actions**:
    
    -   Collect email, password, display name.
        
    -   Call this endpoint.
        
    -   Inform user to check email for verification (if email verification is enabled in Firebase).
        
    -   The Firebase Client SDK will typically handle the user session after this.
        

#### 2. Sign In with Email & Password

-   **POST** `/auth/signInEmailPass`
    
-   **Description**: Signs in an existing user.
    
-   **Request Body**:
    
    ```
    {
      "email": "user@example.com",
      "password": "password123"
    }
    
    ```
    
-   **Success Response (200 OK)**:
    
    ```
    {
      "message": "User signed in successfully.",
      "userId": "firebaseUserId",
      "idToken": "firebaseIdTokenString" // Backend can optionally return the token
      // Frontend usually gets token directly from Firebase SDK after sign-in.
    }
    
    ```
    
-   **Frontend Actions**:
    
    -   Collect email and password.
        
    -   Call this endpoint (or handle sign-in entirely with Firebase Client SDK, then use the ID token for subsequent backend calls).
        

#### 3. Sign In/Up with Google

-   **POST** `/auth/signInGoogle`
    
-   **Description**: Authenticates a user via a Google ID token obtained from Google Sign-In on the frontend.
    
-   **Request Body**:
    
    ```
    {
      "idToken": "googleIdTokenString" // Token obtained from Google Sign-In on frontend
    }
    
    ```
    
-   **Success Response (200 OK)**:
    
    ```
    {
      "message": "User authenticated successfully with Google.",
      "userId": "firebaseUserId",
      "isNewUser": false, // or true
      "email": "user@example.com",
      "displayName": "John Doe"
    }
    
    ```
    
-   **Frontend Actions**:
    
    -   Implement Google Sign-In using Firebase Client SDK or Google Identity Services.
        
    -   Send the obtained Google ID token to this endpoint.
        
    -   The Firebase Client SDK will manage the user session.
        

### Contacts (`/contact`)

_Requires `Authorization: Bearer <ID_TOKEN>` header._

#### 1. Send Contact Invitation

-   **POST** `/contact/invite`
    
-   **Request Body**:
    
    ```
    {
      "recipientEmail": "friend@example.com"
    }
    
    ```
    
-   **Success Response (200 OK)**: `{ "message": "Invitation sent successfully." }`
    
-   **Frontend Actions**: Allow user to input an email to invite.
    

#### 2. List Pending Invitations

-   **GET** `/contact/pending`
    
-   **Success Response (200 OK)**:
    
    ```
    [
      { "invitationId": "inv1", "senderEmail": "sender@example.com", "senderId": "uid1", "sentAt": "timestamp" },
      // ... more invitations
    ]
    
    ```
    
-   **Frontend Actions**: Display pending invitations with options to accept/decline.
    

#### 3. Respond to Invitation

-   **POST** `/contact/response`
    
-   **Request Body**:
    
    ```
    {
      "invitationId": "inv1",
      "action": "accept" // or "decline"
    }
    
    ```
    
-   **Success Response (200 OK)**: `{ "message": "Invitation accepted/declined successfully." }`
    

#### 4. Get User's Contact List

-   **GET** `/contact/contacts`
    
-   **Success Response (200 OK)**:
    
    ```
    [
      { "contactId": "contactRelId1", "userId": "friendUid1", "email": "friend1@example.com", "displayName": "Friend One" },
      // ... more contacts
    ]
    
    ```
    
-   **Frontend Actions**: Display the user's contacts, potentially for selecting as a party in a new deal.
    

#### 5. Remove a Contact

-   **DELETE** `/contact/contacts/:contactId` (e.g., `/contact/contacts/contactRelId1`)
    
-   **Success Response (200 OK)**: `{ "message": "Contact removed successfully." }`
    

### Deals (`/deals`)

_Requires `Authorization: Bearer <ID_TOKEN>` header._

#### 1. Create a New Escrow Deal

-   **POST** `/deals/create`
    
-   **Description**: Initiates a new escrow deal. The backend can be configured to deploy a new smart contract for this deal.
    
-   **Request Body Example**:
    
    ```
    {
      "initiatedBy": "BUYER", // "BUYER" or "SELLER"
      "propertyAddress": "123 Main St, Anytown, AT 12345", // Or other asset identifier
      "amount": "1.5", // Amount in ETH (backend will convert to Wei if necessary for contract)
      "currency": "ETH", // Or other supported currency
      "otherPartyEmail": "seller@example.com", // Email of the other party (must be a registered user or will be invited)
      "buyerWalletAddress": "0xBuyerWalletAddress...", // Buyer's on-chain wallet
      "sellerWalletAddress": "0xSellerWalletAddress...", // Seller's on-chain wallet
      "initialConditions": [ // Off-chain conditions defined by the initiator
        { "id": "cond-title", "type": "TITLE_DEED", "description": "Clear title deed verified", "fulfilled": false },
        { "id": "cond-inspection", "type": "INSPECTION", "description": "Property inspection passed", "fulfilled": false }
      ],
      "deployToNetwork": "sepolia" // Optional: specify network if backend supports multiple
    }
    
    ```
    
-   **Success Response (201 Created)**:
    
    ```
    {
      "message": "Deal created successfully.",
      "transactionId": "firestoreDealId", // ID of the deal in Firestore
      "smartContractAddress": "0xDeployedContractAddressOrNull", // Address if deployed
      "status": "AWAITING_CONDITION_SETUP", // Initial status (or as per contract)
      // ...other initial deal details...
    }
    
    ```
    
-   **Frontend Actions**:
    
    -   Provide a form to collect all deal details.
        
    -   Upon success, store `transactionId` and display initial deal status.
        
    -   Use Firestore listeners on this `transactionId` to get real-time updates.
        

#### 2. Retrieve Deal Details

-   **GET** `/deals/:transactionId` (e.g., `/deals/firestoreDealId`)
    
-   **Success Response (200 OK)**: Full deal object from Firestore, including status, parties, conditions, timeline, deadlines, etc.
    
    ```
    {
      "id": "firestoreDealId",
      "initiatedBy": "BUYER",
      "propertyAddress": "123 Main St...",
      "amount": "1.5",
      "currency": "ETH",
      "buyerId": "buyerFirebaseUid",
      "sellerId": "sellerFirebaseUid",
      "buyerWalletAddress": "0x...",
      "sellerWalletAddress": "0x...",
      "status": "IN_FINAL_APPROVAL", // Current status
      "smartContractAddress": "0x...",
      "conditions": [
        { "id": "cond-title", "description": "Clear title deed verified", "fulfilled": true, "fulfilledByBuyerAt": "timestamp" },
        { "id": "cond-inspection", "description": "Property inspection passed", "fulfilled": true, "fulfilledByBuyerAt": "timestamp" }
      ],
      "timeline": [
        { "event": "Deal created", "timestamp": "...", "actorId": "buyerFirebaseUid" },
        { "event": "Funds deposited by buyer.", "timestamp": "...", "actorId": "buyerFirebaseUid", "transactionHash": "0x..."}
        // ... more events
      ],
      "finalApprovalDeadlineBackend": "timestamp", // If applicable
      "disputeResolutionDeadlineBackend": "timestamp" // If applicable
      // ... other fields
    }
    
    ```
    
-   **Frontend Actions**: Display detailed deal information. Best practice is to use Firestore real-time listeners for this.
    

#### 3. List User's Deals

-   **GET** `/deals`
    
-   **Query Parameters (Optional for Pagination)**:
    
    -   `?lastVisibleId=<firestore_doc_id>`: For "next page" based on last document ID.
        
    -   `?limit=<number>`: Number of deals per page (e.g., 10).
        
-   **Success Response (200 OK)**:
    
    ```
    {
      "deals": [
        // ...array of deal summary objects...
      ],
      "nextPageToken": "next_page_token_or_null" // Or lastVisibleId for next query
    }
    
    ```
    
-   **Frontend Actions**: Display a list of deals with pagination controls.
    

#### 4. Buyer Updates Off-Chain Condition Status

-   **PUT** `/deals/:transactionId/conditions/:conditionId/buyer-review`
    
-   **Request Body**:
    
    ```
    {
      "fulfilled": true // or false
    }
    
    ```
    
-   **Success Response (200 OK)**: `{ "message": "Condition status updated." }`
    
-   **Frontend Actions**: Allow the buyer to mark their conditions as fulfilled. The UI should update based on Firestore real-time changes. If all conditions are marked fulfilled by the buyer and funds are deposited, the backend/contract logic might transition the deal to `READY_FOR_FINAL_APPROVAL`.
    

#### 5. Sync Backend with Smart Contract State (Optional User Action)

-   **PUT** `/deals/:transactionId/sync-status`
    
-   **Description**: Instructs the backend to query the smart contract for its current state and update the Firestore record if there are discrepancies. This can be useful if there's a suspicion that off-chain and on-chain states are out of sync.
    
-   **Success Response (200 OK)**: `{ "message": "Deal status sync initiated/completed.", "updatedStatus": "SYNCED_STATUS_FROM_CHAIN" }`
    
-   **Frontend Actions**: Could be a manual "Refresh Status" button for the user.
    

### Files (`/files`)

_Requires `Authorization: Bearer <ID_TOKEN>` header._

#### 1. Upload Deal-Related File

-   **POST** `/files/upload`
    
-   **Request Type**: `multipart/form-data`
    
-   **Form Data Fields**:
    
    -   `dealId`: (string) The ID of the deal this file belongs to.
        
    -   `file`: (file) The actual file to upload (e.g., PDF, JPG, PNG; max 5MB).
        
    -   `fileType`: (string, optional) E.g., "TITLE_DEED", "INSPECTION_REPORT".
        
-   **Success Response (201 Created)**:
    
    ```
    {
      "message": "File uploaded successfully.",
      "fileId": "generatedFileId",
      "fileName": "originalFileName.pdf",
      "fileURL": "firebaseStorageDownloadUrl", // Direct download URL
      "filePath": "firebaseStoragePath"
    }
    
    ```
    
-   **Frontend Actions**: Use a file input. Construct `FormData` and send the request. Store file metadata for display.
    

#### 2. List File Metadata for User's Deals

-   **GET** `/files/my-deals`
    
-   **Description**: Retrieves metadata for all files associated with deals the current user is part of.
    
-   **Success Response (200 OK)**:
    
    ```
    [
      { "fileId": "...", "dealId": "...", "fileName": "...", "fileType": "...", "uploadedBy": "uid", "uploadedAt": "...", "fileURL": "..." },
      // ... more files
    ]
    
    ```
    
-   **Frontend Actions**: Display a list of all relevant files, perhaps grouped by deal.
    

#### 3. Download a Specific File

-   **GET** `/files/download/:dealId/:fileId`
    
-   **Description**: The backend provides a signed URL or streams the file for download.
    
-   **Success Response**: The file itself (e.g., `application/pdf`). The browser will typically handle the download.
    
-   **Frontend Actions**: Provide a download link/button. Can be a direct `<a>` tag pointing to this endpoint or a programmatic fetch that initiates the download.
    

### Health Check (`/health`)

#### 1. Verify Backend Connectivity

-   **GET** `/health`
    
-   **Success Response (200 OK)**: `{ "status": "healthy", "message": "Backend services are operational.", "firestoreConnected": true }`
    
-   **Frontend Actions**: Typically not called directly by the main user-facing frontend, but useful for monitoring or diagnostics.
    

## Smart Contract States & Frontend Implications

The `PropertyEscrow.sol` contract has several states. The frontend should ideally display a user-friendly interpretation of these states, which are updated in Firestore by the backend.

-   `AWAITING_CONDITION_SETUP`: Buyer needs to define off-chain conditions.
    
-   `AWAITING_DEPOSIT`: Conditions set; waiting for buyer to deposit funds (on-chain action).
    
-   `AWAITING_FULFILLMENT`: Funds deposited; buyer marks off-chain conditions as fulfilled via API.
    
-   `READY_FOR_FINAL_APPROVAL`: All conditions met, funds in. Either party can trigger the start of the 48hr approval period (on-chain action or via API that triggers on-chain).
    
-   `IN_FINAL_APPROVAL`: 48hr countdown. Buyer can raise a dispute (on-chain action or via API). If no dispute, backend job will trigger fund release after deadline.
    
-   `IN_DISPUTE`: 7-day countdown. Buyer can re-fulfill conditions to resolve. If deadline passes, backend job will trigger refund to buyer.
    
-   `COMPLETED`: Funds released to seller. Deal ends.
    
-   `CANCELLED`: Escrow cancelled (mutually or by deadline). Funds (if any) returned to buyer. Deal ends.
    

**Frontend should listen to Firestore for changes to the `deal.status` field and other relevant deadline fields to provide a dynamic and accurate UI.**

## Automated Backend Processes

Be aware that `scheduledJobs.js` runs periodically (e.g., every 30 minutes) to:

1.  Check deals in `IN_FINAL_APPROVAL` past their `finalApprovalDeadlineBackend`. If found, it calls `blockchainService.triggerReleaseAfterApproval`.
    
2.  Check deals in `IN_DISPUTE` past their `disputeResolutionDeadlineBackend`. If found, it calls `blockchainService.triggerCancelAfterDisputeDeadline`.
    

These automated actions will result in on-chain transactions and subsequent updates to the deal's status and timeline in Firestore. The frontend should reflect these changes through its real-time listeners.

## Environment Variables (Recap for Frontend Context)

-   `FRONTEND_URL`: The backend uses this for CORS configuration. Ensure it matches your frontend's domain.
    

## Further Development

-   **Detailed API Documentation (`docs/api.md`)**: Consider generating or requesting a more detailed API spec (e.g., OpenAPI/Swagger) if complex request/response schemas are involved.
    
-   **WebSockets/Real-time**: While Firestore offers real-time, for specific non-Firestore notifications, WebSockets could be an addition.
    

