# CryptoEscrow Backend & Smart Contract Documentation

## Overview

This document provides documentation for the backend API and the `PropertyEscrow` smart contract for the CryptoEscrow application. The backend is built using Node.js, Express, and Firebase Admin SDK (Firestore, Auth, Storage). The smart contract is developed using Solidity and Hardhat.

The system facilitates property transactions using cryptocurrency via individual escrow smart contracts deployed for each deal.

## Prerequisites

### Environment Variables

The following environment variables are required to run the backend and deploy contracts:

* **Firebase Admin SDK Credentials:**
    * `GOOGLE_APPLICATION_CREDENTIALS`: Path to the Firebase Admin SDK service account JSON key file (for production/non-emulator environments).
* **Firebase Client SDK Config (for `authIndex.js` in production):**
    * `FIREBASE_API_KEY`
    * `FIREBASE_AUTH_DOMAIN`
    * `FIREBASE_PROJECT_ID`
    * `FIREBASE_STORAGE_BUCKET`
    * `FIREBASE_MESSAGING_SENDER_ID`
    * `FIREBASE_APP_ID`
    * `FIREBASE_MEASUREMENT_ID` (Optional)
* **Smart Contract Deployment:**
    * `DEPLOYER_PRIVATE_KEY`: The private key of the wallet used by the backend to deploy new `PropertyEscrow` contracts. **Handle with extreme care.**
    * `RPC_URL`: The JSON-RPC endpoint URL for the target Ethereum network (e.g., Sepolia, Mainnet, or a local Hardhat node URL like `http://127.0.0.1:8545/`).
* **Contract Verification (Optional):**
    * `ETHERSCAN_API_KEY`: API key for Etherscan to enable automatic contract verification via Hardhat.
* **Gas Reporting (Optional):**
    * `REPORT_GAS`: Set to `true` to enable gas reporting during Hardhat tests.
    * `COINMARKETCAP_API_KEY`: API key for CoinMarketCap to get USD gas cost estimates.
* **Frontend URL (for CORS):**
    * `FRONTEND_URL`: The base URL of your frontend application.

---

## API Routes Documentation

The backend API is built with Express. All routes requiring authentication expect a Firebase ID Token passed as a Bearer token in the `Authorization` header.

**Base URL:** (Assumed based on `quicktest.js`, adjust if different)

### Authentication (`/auth`)

Handles user sign-up and sign-in.

* **`POST /auth/signUpEmailPass`**
    * **Description:** Creates a new user account using email and password. In non-test environments, sets an `admin` custom claim (logic might need review based on actual requirements).
    * **Auth:** None required.
    * **Request Body:**
        ```json
        {
          "email": "user@example.com",
          "password": "yourpassword"
        }
        ```
    * **Success Response (201):**
        ```json
        {
          "message": "User created",
          "uid": "firebase-user-uid"
        }
        ```
    * **Error Responses:**
        * `400 Bad Request`: Missing email or password.
        * `401 Unauthorized`: Email already in use, or other Firebase auth error.

* **`POST /auth/signInEmailPass`**
    * **Description:** Signs in a user with email and password. In non-test environments, checks for an `admin` custom claim (logic might need review).
    * **Auth:** None required.
    * **Request Body:**
        ```json
        {
          "email": "user@example.com",
          "password": "yourpassword"
        }
        ```
    * **Success Response (200):**
        ```json
        {
          "message": "User signed in",
          "uid": "user@example.com" // Note: Currently returns email, might want UID
        }
        ```
    * **Error Responses:**
        * `400 Bad Request`: Missing email or password.
        * `401 Unauthorized`: Invalid password, user not found, not admin (in prod), or other Firebase auth error.

* **`POST /auth/signInGoogle`**
    * **Description:** Authenticates a user via a Google ID token obtained from the frontend Google Sign-In flow. In production, checks if the user's email is in an allowlist.
    * **Auth:** None required (token is passed in body).
    * **Request Body:**
        ```json
        {
          "idToken": "google-id-token-string"
        }
        ```
    * **Success Response (200):**
        ```json
        {
          "message": "User authenticated",
          "uid": "firebase-user-uid",
          "isAdmin": true // Or false based on email check
        }
        ```
    * **Error Responses:**
        * `400 Bad Request`: Missing ID token.
        * `401 Unauthorized`: Invalid/expired token, signature mismatch.
        * `403 Forbidden`: Email not in allowlist (production).
        * `404 Not Found`: User profile not found in Firebase Auth after token verification.
        * `500 Internal Server Error`: Backend error during verification.

### Contacts (`/contact`)

Manages user contacts and invitations.

* **`POST /contact/invite`**
    * **Description:** Sends a contact invitation from the authenticated user to another registered user identified by email. Creates a `pending` invitation document in the `contactInvitations` collection.
    * **Auth:** Required (Sender's token).
    * **Request Body:**
        ```json
        {
          "contactEmail": "receiver@example.com"
        }
        ```
    * **Success Response (201):**
        ```json
        {
          "message": "Invitation sent successfully",
          "invitationId": "firestore-invitation-doc-id"
        }
        ```
    * **Error Responses:**
        * `400 Bad Request`: Missing/invalid email, self-invitation, already contacts, invitation already pending.
        * `401 Unauthorized`: Invalid/missing token.
        * `404 Not Found`: Sender or receiver user profile not found.
        * `500 Internal Server Error`: Database error.

* **`GET /contact/pending`**
    * **Description:** Retrieves all pending contact invitations where the authenticated user is the receiver.
    * **Auth:** Required (Receiver's token).
    * **Success Response (200):**
        ```json
        {
          "invitations": [
            {
              "id": "firestore-invitation-doc-id",
              "senderId": "sender-uid",
              "senderEmail": "sender@example.com",
              "senderFirstName": "Sender"
              // ... other sender details as needed
            }
            // ... more invitations
          ]
        }
        ```
    * **Error Responses:**
        * `401 Unauthorized`: Invalid/missing token.
        * `500 Internal Server Error`: Database error.

* **`POST /contact/response`**
    * **Description:** Allows the authenticated user (receiver) to accept or deny a pending contact invitation. If accepted, adds each user to the other's `contacts` subcollection in Firestore and updates the invitation status. If denied, updates the invitation status.
    * **Auth:** Required (Receiver's token).
    * **Request Body:**
        ```json
        {
          "invitationId": "firestore-invitation-doc-id",
          "action": "accept" // or "deny"
        }
        ```
    * **Success Response (200):**
        ```json
        {
          "message": "Invitation accepted" // or "Invitation declined"
        }
        ```
    * **Error Responses:**
        * `400 Bad Request`: Missing/invalid `invitationId` or `action`, invitation already processed.
        * `401 Unauthorized`: Invalid/missing token.
        * `403 Forbidden`: User is not the receiver of the invitation.
        * `404 Not Found`: Invitation document not found.
        * `500 Internal Server Error`: Database error during transaction.

* **`GET /contact/contacts`**
    * **Description:** Retrieves the list of accepted contacts for the authenticated user.
    * **Auth:** Required.
    * **Success Response (200):**
        ```json
        {
          "contacts": [
            {
              "id": "contact-user-uid",
              "email": "contact@example.com",
              "first_name": "ContactFirstName",
              "last_name": "ContactLastName",
              "phone_number": "1234567890",
              "wallets": ["wallet_address_1", "..."]
              // ... other fields
            }
            // ... more contacts
          ]
        }
        ```
    * **Error Responses:**
        * `401 Unauthorized`: Invalid/missing token.
        * `500 Internal Server Error`: Database error.

* **`DELETE /contact/contacts/:contactId`**
    * **Description:** Removes a contact relationship. Deletes the contact entry from both the authenticated user's and the specified contact's `contacts` subcollection.
    * **Auth:** Required.
    * **URL Parameter:**
        * `contactId`: The Firebase UID of the contact to remove.
    * **Success Response (200):**
        ```json
        {
          "message": "Contact removed successfully"
        }
        ```
    * **Error Responses:**
        * `400 Bad Request`: Invalid `contactId`, attempting to remove self.
        * `401 Unauthorized`: Invalid/missing token.
        * `500 Internal Server Error`: Database error during batch delete.

### Transactions/Deals (`/deals`)

Manages the creation and state of property escrow deals.

* **`POST /deals/create`**
    * **Description:** Initiates a new escrow deal between the authenticated user and another user (identified by email). Deploys a new `PropertyEscrow` smart contract instance if backend configuration (`DEPLOYER_PRIVATE_KEY`, `RPC_URL`) is present. Stores deal details and the contract address (if deployed) in Firestore.
    * **Auth:** Required (Initiator's token).
    * **Request Body:**
        ```json
        {
          "initiatedBy": "BUYER", // or "SELLER"
          "propertyAddress": "123 Main St, Anytown",
          "amount": 1.5, // Amount in standard unit (e.g., ETH)
          "otherPartyEmail": "otherparty@example.com",
          "buyerWalletAddress": "0xBuyerWallet...", // Required
          "sellerWalletAddress": "0xSellerWallet...", // Required
          "initialConditions": [ // Optional: Conditions buyer wants seller to fulfill (tracked off-chain initially)
            { "id": "cond-inspect", "type": "INSPECTION", "description": "Pass home inspection" },
            { "id": "cond-title", "type": "TITLE_DEED", "description": "Provide clear title deed" }
          ],
          "deployToNetwork": "sepolia" // Optional: Specify network if multiple RPC URLs are configured backend-side
        }
        ```
    * **Success Response (201):**
        ```json
        {
          "message": "Transaction initiated successfully.",
          "transactionId": "firestore-deal-doc-id",
          "status": "AWAITING_CONDITION_SETUP", // Initial SC state if deployed, otherwise backend state like PENDING_SELLER_REVIEW
          "smartContractAddress": "0xDeployedContractAddress..." // or null if deployment skipped/failed
          "transactionDetails": { /* Full deal object with ISO timestamps */ }
        }
        ```
    * **Error Responses:**
        * `400 Bad Request`: Invalid input (missing fields, invalid roles, self-transaction, invalid addresses/amount).
        * `401 Unauthorized`: Invalid/missing token.
        * `404 Not Found`: Initiator or other party user profile not found.
        * `500 Internal Server Error`: Database error, or critical deployment error (if configured to fail).

* **`GET /deals/:transactionId`**
    * **Description:** Retrieves the details of a specific transaction/deal document from Firestore.
    * **Auth:** Required (User must be a participant in the deal).
    * **URL Parameter:**
        * `transactionId`: The Firestore document ID of the deal.
    * **Success Response (200):** Returns the full deal object with ISO timestamps (similar to `transactionDetails` in the POST response).
    * **Error Responses:**
        * `401 Unauthorized`: Invalid/missing token.
        * `403 Forbidden`: User is not a participant in the deal.
        * `404 Not Found`: Transaction document not found.
        * `500 Internal Server Error`: Database error.

* **`GET /deals`**
    * **Description:** Retrieves a list of deals the authenticated user is participating in, with pagination and ordering.
    * **Auth:** Required.
    * **Query Parameters:**
        * `limit` (number, default 10): Max number of deals to return.
        * `orderBy` (string, default 'createdAt'): Field to order by (e.g., 'createdAt', 'updatedAt', 'status').
        * `orderDirection` (string, default 'desc'): 'asc' or 'desc'.
        * `startAfter` (string): Value of the `orderBy` field of the last item from the previous page (use ISO date string for timestamps).
    * **Success Response (200):** An array of deal objects with ISO timestamps.
    * **Error Responses:**
        * `401 Unauthorized`: Invalid/missing token.
        * `500 Internal Server Error`: Database error.

* **`PUT /deals/:transactionId/conditions/:conditionId/buyer-review`**
    * **Description:** Allows the **buyer** to update the *backend status* of a specific condition after their off-chain due diligence. This **does not** directly interact with the smart contract. The buyer must separately call the smart contract's `fulfillCondition` or `buyerWithdrawConditionApproval` function via their wallet.
    * **Auth:** Required (Buyer's token).
    * **URL Parameters:**
        * `transactionId`: The Firestore document ID of the deal.
        * `conditionId`: The ID of the condition (must match an ID in the deal's `conditions` array).
    * **Request Body:**
        ```json
        {
          "newBackendStatus": "FULFILLED_BY_BUYER", // or "PENDING_BUYER_ACTION", "ACTION_WITHDRAWN_BY_BUYER"
          "reviewComment": "Appraisal value confirmed." // Optional
        }
        ```
    * **Success Response (200):**
        ```json
        {
          "message": "Backend condition status updated to: FULFILLED_BY_BUYER."
        }
        ```
    * **Error Responses:**
        * `400 Bad Request`: Invalid `newBackendStatus`.
        * `401 Unauthorized`: Invalid/missing token.
        * `403 Forbidden`: Caller is not the buyer.
        * `404 Not Found`: Transaction or condition not found.
        * `500 Internal Server Error`: Database error.

* **`PUT /deals/:transactionId/sync-status`**
    * **Description:** Updates the backend's deal status and potentially deadline timestamps to reflect the *current state of the smart contract*. This should typically be called by the frontend after detecting an on-chain state change (e.g., via events or polling).
    * **Auth:** Required (Participant's token).
    * **URL Parameter:**
        * `transactionId`: The Firestore document ID of the deal.
    * **Request Body:**
        ```json
        {
          "newSCStatus": "IN_FINAL_APPROVAL", // The current state read from the smart contract
          "eventMessage": "User confirmed final approval period start.", // Optional custom message
          "finalApprovalDeadlineISO": "2025-05-09T12:00:00Z", // Optional: ISO timestamp from SC event/calculation
          "disputeResolutionDeadlineISO": "2025-05-16T12:00:00Z" // Optional: ISO timestamp from SC event/calculation
        }
        ```
    * **Success Response (200):**
        ```json
        {
          "message": "Transaction backend status synced/updated to IN_FINAL_APPROVAL."
        }
        ```
    * **Error Responses:**
        * `400 Bad Request`: Missing or invalid `newSCStatus`.
        * `401 Unauthorized`: Invalid/missing token.
        * `403 Forbidden`: User is not a participant.
        * `404 Not Found`: Transaction not found.
        * `500 Internal Server Error`: Database error.

* **Conceptual Sync Endpoints (Examples):**
    * `POST /deals/:transactionId/sc/start-final-approval`: Called by frontend after successful on-chain `startFinalApprovalPeriod` call. Updates backend status and `finalApprovalDeadlineBackend`.
    * `POST /deals/:transactionId/sc/raise-dispute`: Called by frontend after successful on-chain `buyerWithdrawConditionApproval` call. Updates backend status, condition status, and `disputeResolutionDeadlineBackend`.

### File Management (`/files`)

Handles uploading and downloading files associated with deals.

* **`POST /files/upload`**
    * **Description:** Uploads a file (PDF, JPG, PNG, max 5MB) associated with a specific deal. Stores the file in Firebase Storage and metadata (including storage path) in the deal's `files` subcollection in Firestore.
    * **Auth:** Required.
    * **Request Body:** `multipart/form-data` containing:
        * `file`: The file to upload.
        * `dealId`: The Firestore document ID of the associated deal.
    * **Success Response (200):**
        ```json
        {
          "message": "File uploaded successfully",
          "fileId": "firestore-file-doc-id",
          "url": "public-download-url-from-firebase-storage"
        }
        ```
    * **Error Responses:**
        * `400 Bad Request`: Missing file, `dealId`, invalid file type, file size limit exceeded.
        * `401 Unauthorized`: Invalid/missing token.
        * `404 Not Found`: Deal not found.
        * `500 Internal Server Error`: Upload or database error.

* **`GET /files/my-deals`**
    * **Description:** Retrieves metadata for all files associated with deals the authenticated user is participating in.
    * **Auth:** Required.
    * **Success Response (200):**
        ```json
        [
          {
            "dealId": "deal-doc-id-1",
            "fileId": "file-doc-id-1",
            "filename": "document.pdf",
            "contentType": "application/pdf",
            "size": 123456,
            "uploadedAt": "2025-05-07T14:30:00Z",
            "uploadedBy": "uploader-user-uid",
            "downloadPath": "/files/download/deal-doc-id-1/file-doc-id-1"
          }
          // ... more files
        ]
        ```
    * **Error Responses:**
        * `401 Unauthorized`: Invalid/missing token.
        * `500 Internal Server Error`: Database error.

* **`GET /files/download/:dealId/:fileId`**
    * **Description:** Downloads a specific file associated with a deal. Verifies the user is a participant in the deal.
    * **Auth:** Required.
    * **URL Parameters:**
        * `dealId`: The Firestore document ID of the deal.
        * `fileId`: The Firestore document ID of the file within the deal's `files` subcollection.
    * **Success Response (200):** The file content with appropriate `Content-Type` and `Content-Disposition` headers.
    * **Error Responses:**
        * `401 Unauthorized`: Invalid/missing token.
        * `403 Forbidden`: User is not a participant in the deal.
        * `404 Not Found`: Deal or file document not found.
        * `500 Internal Server Error`: Error retrieving file from storage or streaming.

### Health Check (`/health`)

* **`GET /health`**
    * **Description:** Checks the backend's connectivity to the Firestore database.
    * **Auth:** None required.
    * **Success Response (200):**
        ```json
        {
          "status": "OK"
        }
        ```
    * **Error Response (500):**
        ```json
        {
          "error": "Internal Server Error"
        }
        ```

---

## Smart Contract Documentation (`PropertyEscrow.sol`)

This contract manages the on-chain escrow process for a single property deal.

### Overview

* Holds funds deposited by the buyer.
* Tracks conditions set by the buyer that must be fulfilled.
* Includes a final approval period (48 hours) after conditions are met, allowing parties to review or raise disputes.
* Includes a dispute resolution period (7 days) if a dispute is raised.
* Releases funds to the seller if the approval period passes without dispute, or if both parties explicitly confirm release.
* Refunds funds to the buyer if the escrow is cancelled or if the dispute resolution period expires without resolution.

### States (`enum State`)

1.  `AWAITING_CONDITION_SETUP`: Initial state. Contract deployed, waiting for buyer to call `setConditions`.
2.  `AWAITING_DEPOSIT`: Buyer has set conditions, waiting for buyer to call `depositFunds`.
3.  `AWAITING_FULFILLMENT`: Funds deposited, waiting for buyer to call `fulfillCondition` for all required conditions.
4.  `READY_FOR_FINAL_APPROVAL`: All conditions fulfilled by buyer, funds deposited. Waiting for `startFinalApprovalPeriod` to be called.
5.  `IN_FINAL_APPROVAL`: 48-hour review period started. Parties can call `confirmAndReleaseFunds` or buyer can call `buyerWithdrawConditionApproval`. Funds released automatically if deadline passes without dispute.
6.  `IN_DISPUTE`: Buyer called `buyerWithdrawConditionApproval`. 7-day resolution timer started. Buyer can call `buyerReFulfillCondition` or both parties can call `confirmAndReleaseFunds` to resolve. Buyer can call `cancelEscrow` after deadline.
7.  `COMPLETED`: Funds successfully released to the seller. Final state.
8.  `CANCELLED`: Escrow cancelled by a party or due to dispute timeout. Funds (if any) returned to buyer. Final state.

### Key Functions

* `constructor(address _seller, address _buyer, uint256 _escrowAmount)`: Initializes the contract with parties and amount.
* `setConditions(bytes32[] memory _conditionIds)`: **Buyer only.** Called once in `AWAITING_CONDITION_SETUP` to define required condition IDs. Moves state to `AWAITING_DEPOSIT`.
* `depositFunds()`: **Buyer only.** Payable function called in `AWAITING_DEPOSIT`. Buyer sends `escrowAmount`. Moves state to `AWAITING_FULFILLMENT`.
* `fulfillCondition(bytes32 _conditionId)`: **Buyer only.** Called in `AWAITING_FULFILLMENT`. Marks a specific condition as met. If all conditions become met, moves state to `READY_FOR_FINAL_APPROVAL`.
* `startFinalApprovalPeriod()`: **Buyer or Seller.** Called in `READY_FOR_FINAL_APPROVAL`. Starts the 48-hour timer. Moves state to `IN_FINAL_APPROVAL`.
* `buyerWithdrawConditionApproval(bytes32 _conditionId)`: **Buyer only.** Called in `IN_FINAL_APPROVAL`. Reverts a condition's fulfillment status, raises a dispute, starts the 7-day timer. Moves state to `IN_DISPUTE`.
* `buyerReFulfillCondition(bytes32 _conditionId)`: **Buyer only.** Called in `IN_DISPUTE`. Marks a previously disputed condition as fulfilled again. If all conditions become met, moves state back to `READY_FOR_FINAL_APPROVAL`.
* `confirmAndReleaseFunds()`: **Buyer or Seller.** Called in `IN_FINAL_APPROVAL` or `IN_DISPUTE`. Records explicit approval. Releases funds if both approve, or if `finalApprovalDeadline` passes while in `IN_FINAL_APPROVAL`.
* `cancelEscrow()`: **Buyer or Seller.** Can be called in various states (before completion/cancellation). Refunds buyer if funds were deposited. Special logic allows buyer refund if `disputeResolutionDeadline` passes while `IN_DISPUTE`.

### Events

* `EscrowCreated`: On deployment.
* `ConditionsSetByBuyer`: When buyer sets conditions.
* `FundsDeposited`: When buyer deposits funds.
* `ConditionFulfilled`: When buyer marks a condition fulfilled.
* `ConditionFulfilledReversed`: When buyer withdraws approval during final review.
* `FinalApprovalPeriodStarted`: When the 48hr timer starts.
* `DisputeRaised`: When buyer withdraws approval.
* `ReleaseConfirmed`: When a party calls `confirmAndReleaseFunds`.
* `FundsReleasedToSeller`: When funds are sent to the seller.
* `EscrowCancelled`: When the escrow is cancelled.

---

## Deployment

### Manual Hardhat Deployment

* The script `src/contract/scripts/deployPropertyEscrow.js` can be used for manual deployment via Hardhat CLI.
* It uses placeholder values for seller, buyer, and amount.
* Useful for testing on testnets or local nodes.
* Command: `npx hardhat run src/contract/scripts/deployPropertyEscrow.js --network <network_name>` (e.g., `sepolia`).

### Backend Programmatic Deployment

* The utility `src/utils/contractDeployer.js` handles programmatic deployment.
* It's called by the `POST /deals/create` backend route.
* Requires `DEPLOYER_PRIVATE_KEY` and `RPC_URL` environment variables.
* Uses `ethers.js` and the contract artifact (`PropertyEscrow.json`) to deploy a new instance for each deal.
* The deployer account specified by the private key pays the gas fees.

---

## Testing

* **Backend:** Unit/integration tests for API routes are located in `src/api/routes/**/__tests__`. They use Jest and Supertest, interacting with Firebase Emulators. Run using `npm run test:emulator` or specific test scripts in `package.json`.
* **Smart Contract:** Solidity tests are in `src/contract/test`. They use Hardhat, Ethers.js, and Chai. Run using `cd src/contract && npx hardhat test`.
