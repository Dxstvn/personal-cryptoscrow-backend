# Deal Management Routes (`src/api/routes/transaction`)

## Overview

This directory is central to the CryptoEscrow application, containing API routes for managing the entire lifecycle of escrow "deals" (also referred to as transactions). These endpoints enable users to create new deals, view their existing deals, update deal conditions, and interact with the on-chain aspects of the escrow via the backend.

**Frontend Relevance**: This is arguably the most critical API module for the frontend. Frontend developers will build the core user experience around these endpoints: creating detailed deal forms, dashboards listing user deals, detailed views of individual deals showing status and conditions, and interactive elements for users to manage their part in a deal. **Heavy reliance on Firestore real-time listeners for deal data is paramount for a responsive UI.**

## File: `transactionRoutes.js`

-   **Purpose**: Defines all Express.js routes related to the management of escrow deals.
-   **Base Path**: These routes are typically mounted under `/api/deals` (confirm with main router configuration).
-   **Authentication**: All endpoints require a valid Firebase ID Token (`Authorization: Bearer <TOKEN>`).
-   **Key Backend Interactions**: Firestore (for creating, reading, updating, and deleting deal documents in the `deals` collection), `src/services/contractDeployer.js` (for deploying new `PropertyEscrow` contracts when deals are created), `src/services/blockchainService.js` (for querying contract states and triggering on-chain transactions like fund release or dispute actions).

### Key Endpoints & Frontend Interaction Details:

-   **`POST /create`** (e.g., `/api/deals/create`)
    -   **Description**: Initiates a new escrow deal. This is a complex operation involving creating a detailed deal document in Firestore and, if applicable, triggering the deployment of a new `PropertyEscrow` smart contract instance.
    -   **Request Body Example**:
        ```json
        {
          "initiatedBy": "BUYER", // Who is filling this form: "BUYER" or "SELLER"
          "propertyAddress": "123 Main St, Anytown, USA",
          "amount": 1.5, // In ETH as number, backend handles Wei conversion for contract
          "otherPartyEmail": "seller@example.com",
          "buyerWalletAddress": "0xBuyerWalletAddress...",
          "sellerWalletAddress": "0xSellerWalletAddress...",
          "initialConditions": [
            { "id": "cond-title-v1", "type": "TITLE_DEED", "description": "Title deed clear and verified." },
            { "id": "cond-insp-v1", "type": "INSPECTION", "description": "Property inspection satisfactory." }
          ]
        }
        ```
    -   **Backend Logic**: Validates inputs, resolves party UIDs, creates a comprehensive `deal` document in Firestore with an initial status (e.g., `PENDING_BUYER_REVIEW` or `PENDING_SELLER_REVIEW`), and calls `contractDeployer.js` to deploy the smart contract. The new `smartContractAddress` is then saved to the deal document.
    -   **Success Response (201 Created)**:
        ```json
        {
          "message": "Transaction initiated successfully.",
          "transactionId": "firestoreDealIdGeneratedByBackend", // CRUCIAL for frontend listeners
          "smartContractAddress": "0xDeployedContractAddressOrNull", // Null if deployment failed or skipped
          "status": "PENDING_BUYER_REVIEW", // Or "PENDING_SELLER_REVIEW" depending on initiator
          "deploymentWarning": "Smart contract deployment was attempted but failed..." // Only if deployment failed
        }
        ```
    -   **Error Responses**: `400 Bad Request` (validation errors), `404 Not Found` (other party email not found), `500 Internal Server Error` (contract deployment failure, database error).
    -   **Frontend Actions**: 
        -   Provide a multi-step, user-friendly form for deal creation. Validate inputs client-side.
        -   On successful submission, **immediately store the `transactionId`** and use it to set up a Firestore real-time listener for that specific deal document. This listener is how the frontend will receive all future updates to this deal.
        -   Display initial deal status and guide the user on next steps.

-   **`GET /:transactionId`** (e.g., `/api/deals/firestoreDealId123`)
    -   **Description**: Retrieves the full, current details of a specific escrow deal from Firestore.
    -   **URL Parameter**: `:transactionId` is the Firestore document ID of the deal.
    -   **Success Response (200 OK)**: A complete JSON object representing the deal document with all fields converted to appropriate formats (timestamps to ISO strings, etc.).
    -   **Frontend Actions**: While this endpoint can be used for an initial fetch, **primary reliance should be on the Firestore real-time listener** established after deal creation or when viewing a deal.

-   **`GET /`** (e.g., `/api/deals`)
    -   **Description**: Lists all deals where the authenticated user is a participant (either buyer or seller). Supports pagination and sorting.
    -   **Query Parameters (Optional)**:
        -   `?limit=<number>` (e.g., 10, for number of deals per page)
        -   `?startAfter=<firestore_timestamp_or_doc_id>` (for pagination)
        -   `?orderBy=<field_name>` (default: 'createdAt')
        -   `?orderDirection=<asc|desc>` (default: 'desc')
    -   **Success Response (200 OK)**:
        ```json
        [
          {
            "id": "dealId1",
            "propertyAddress": "123 Main St...",
            "amount": 1.5,
            "status": "IN_FINAL_APPROVAL",
            "buyerId": "buyerFirebaseUid",
            "sellerId": "sellerFirebaseUid",
            "createdAt": "2023-10-25T10:00:00.000Z"
            // ... other deal fields
          }
          // ... more deals
        ]
        ```
    -   **Frontend Actions**: Display deals in a dashboard or list. Implement pagination using query parameters. Consider using Firestore query listeners for real-time updates to this list.

-   **`PUT /:transactionId/conditions/:conditionId/buyer-review`**
    -   **Description**: Allows the buyer in a deal to update the status of one of their designated off-chain conditions.
    -   **URL Parameters**: `:transactionId`, `:conditionId` (the unique ID of the condition within the deal's `conditions` array).
    -   **Request Body**: 
        ```json
        {
          "newBackendStatus": "FULFILLED_BY_BUYER", // Required: "FULFILLED_BY_BUYER", "PENDING_BUYER_ACTION", or "ACTION_WITHDRAWN_BY_BUYER"
          "reviewComment": "Optional comment about the condition" // Optional
        }
        ```
    -   **Backend Logic**: Updates the condition's status and timestamps within the deal document in Firestore. May trigger checks to see if all conditions are now met, potentially leading to an automatic status transition of the deal.
    -   **Success Response (200 OK)**: `{ "message": "Backend condition status updated to: FULFILLED_BY_BUYER." }` (The frontend will see the change via its Firestore listener).
    -   **Frontend Actions**: Provide interactive elements (e.g., checkboxes, buttons) for the buyer to manage their conditions. The UI should reflect the updated state based on the Firestore listener.

-   **`PUT /:transactionId/sync-status`**
    -   **Description**: Updates the backend deal status to sync with smart contract state, with optional deadline management.
    -   **URL Parameter**: `:transactionId`.
    -   **Request Body**:
        ```json
        {
          "newSCStatus": "IN_FINAL_APPROVAL", // Required: valid smart contract status
          "eventMessage": "Custom timeline message", // Optional
          "finalApprovalDeadlineISO": "2023-10-27T10:00:00.000Z", // Optional: for IN_FINAL_APPROVAL status
          "disputeResolutionDeadlineISO": "2023-10-29T10:00:00.000Z" // Optional: for IN_DISPUTE status
        }
        ```
    -   **Success Response (200 OK)**: `{ "message": "Transaction backend status synced/updated to IN_FINAL_APPROVAL." }`.
    -   **Frontend Actions**: Use this endpoint when the frontend detects that on-chain state has changed and needs to update the backend. The UI will update via its Firestore listener when the sync completes.

-   **`POST /:transactionId/sc/start-final-approval`**
    -   **Description**: Syncs the backend when the final approval period has been started on-chain.
    -   **URL Parameter**: `:transactionId`.
    -   **Request Body**:
        ```json
        {
          "finalApprovalDeadlineISO": "2023-10-27T10:00:00.000Z" // Required: deadline in ISO format
        }
        ```
    -   **Backend Logic**: Updates deal status to `IN_FINAL_APPROVAL`, sets the deadline, and adds a timeline event.
    -   **Success Response (200 OK)**: `{ "message": "Backend synced: Final approval period started." }`.
    -   **Frontend Actions**: Call this endpoint after the user successfully triggers the final approval period on-chain.

-   **`POST /:transactionId/sc/raise-dispute`**
    -   **Description**: Syncs the backend when a dispute has been raised on-chain by the buyer.
    -   **URL Parameter**: `:transactionId`.
    -   **Request Body**:
        ```json
        {
          "disputeResolutionDeadlineISO": "2023-10-29T10:00:00.000Z", // Required: deadline in ISO format
          "conditionId": "cond-title" // Optional: ID of condition related to dispute
        }
        ```
    -   **Backend Logic**: Updates deal status to `IN_DISPUTE`, sets the resolution deadline, and optionally marks the related condition as `ACTION_WITHDRAWN_BY_BUYER`.
    -   **Success Response (200 OK)**: `{ "message": "Backend synced: Dispute raised." }`.
    -   **Error Responses**: `400 Bad Request` (invalid deal state for dispute), `403 Forbidden` (only buyer can raise disputes).
    -   **Frontend Actions**: Call this endpoint after the buyer successfully raises a dispute on-chain.

## Firestore Data Model (`deals` collection)

A typical deal document (`/deals/{transactionId}`) might contain:
-   `buyerId`, `sellerId` (Firebase UIDs)
-   `buyerWalletAddress`, `sellerWalletAddress` (Strings)
-   `propertyAddress`, `amount`, `currency`
-   `smartContractAddress` (String, address of the deployed `PropertyEscrow` contract)
-   `status` (String, e.g., `AWAITING_DEPOSIT`, `IN_FINAL_APPROVAL`, `COMPLETED` - reflects contract state)
-   `conditions`: Array of objects, each with `id`, `description`, `type`, `fulfilled` (boolean), `fulfilledBy` (UID), `fulfilledAt` (Timestamp).
-   `timeline`: Array of event objects (e.g., `{ event: "Deal Created", actorId: "uid", timestamp: Timestamp }`).
-   `createdAt`, `updatedAt` (Timestamps)
-   `finalApprovalDeadlineBackend`, `disputeResolutionDeadlineBackend` (Timestamps, managed by backend reflecting contract logic).

## Critical Frontend Considerations

-   **Real-time Firestore Listeners**: This cannot be overstated. For a fluid and accurate user experience, the frontend **MUST** use Firestore's real-time capabilities to listen for changes to individual deal documents and lists of deals. This is how the UI will reflect status changes, condition updates, new timeline events, etc., whether they are initiated by the current user, the other party, or automated backend jobs.
-   **User Guidance for On-Chain Actions**: When a user needs to perform an on-chain action (e.g., buyer depositing funds, any party initiating dispute), the frontend needs to clearly guide them. This might involve:
    -   Displaying the smart contract address and function to call.
    -   Providing links to block explorers.
    -   Explaining gas fees and wallet interactions (e.g., MetaMask, WalletConnect).
    -   The backend API itself might not directly perform these on-chain actions for the user if they require the user's private key. Instead, the API prepares the deal state, and the frontend guides the user to interact with the blockchain using their own wallet.
-   **Error Handling**: Be prepared for errors from API calls (validation, server issues) and provide clear feedback to the user. 