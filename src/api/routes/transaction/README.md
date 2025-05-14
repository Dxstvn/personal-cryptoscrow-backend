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
    -   **Request Body Example** (See main project README for a more detailed example):
        ```json
        {
          "initiatedBy": "BUYER", // Who is filling this form: "BUYER" or "SELLER"
          "propertyAddress": "123 Main St, Anytown, USA",
          "amount": "1.5", // In ETH, backend handles Wei conversion for contract
          "currency": "ETH",
          "otherPartyEmail": "seller@example.com",
          "buyerWalletAddress": "0xBuyerWalletAddress...",
          "sellerWalletAddress": "0xSellerWalletAddress...",
          "initialConditions": [
            { "id": "cond-title-v1", "type": "TITLE_DEED", "description": "Title deed clear and verified.", "fulfilled": false },
            { "id": "cond-insp-v1", "type": "INSPECTION", "description": "Property inspection satisfactory.", "fulfilled": false }
          ],
          "deployToNetwork": "sepolia" // Optional: Network for smart contract
        }
        ```
    -   **Backend Logic**: Validates inputs, resolves party UIDs (inviting the other party if they are new), creates a comprehensive `deal` document in Firestore with an initial status (e.g., `AWAITING_CONDITION_SETUP` or `AWAITING_DEPOSIT`), and calls `contractDeployer.js` to deploy the smart contract. The new `smartContractAddress` is then saved to the deal document.
    -   **Success Response (201 Created)**:
        ```json
        {
          "message": "Deal created successfully. Contract deployment initiated.",
          "transactionId": "firestoreDealIdGeneratedByBackend", // CRUCIAL for frontend listeners
          "smartContractAddress": "0xDeployedContractAddressOrNull", // Null if deployment is async or failed
          "status": "AWAITING_DEPOSIT", // Initial status
          // May also include the full initial deal object as created in Firestore
        }
        ```
    -   **Error Responses**: `400 Bad Request` (validation errors), `500 Internal Server Error` (contract deployment failure, database error).
    -   **Frontend Actions**: 
        -   Provide a multi-step, user-friendly form for deal creation. Validate inputs client-side.
        -   On successful submission, **immediately store the `transactionId`** and use it to set up a Firestore real-time listener for that specific deal document. This listener is how the frontend will receive all future updates to this deal.
        -   Display initial deal status and guide the user on next steps (e.g., "Waiting for buyer to deposit funds").

-   **`GET /:transactionId`** (e.g., `/api/deals/firestoreDealId123`)
    -   **Description**: Retrieves the full, current details of a specific escrow deal from Firestore.
    -   **URL Parameter**: `:transactionId` is the Firestore document ID of the deal.
    -   **Success Response (200 OK)**: A complete JSON object representing the deal document (see main README for example structure, including parties, status, conditions, timeline, contract address, deadlines).
    -   **Frontend Actions**: While this endpoint can be used for an initial fetch, **primary reliance should be on the Firestore real-time listener** established after deal creation or when viewing a deal. This ensures the UI is always showing the most current data without needing to poll this endpoint.

-   **`GET /`** (e.g., `/api/deals`)
    -   **Description**: Lists all deals where the authenticated user is a participant (either buyer or seller). Supports pagination.
    -   **Query Parameters (Optional)**:
        -   `?lastVisibleId=<firestore_doc_id_of_last_deal>` (for fetching the next page)
        -   `?limit=<number>` (e.g., 10, for number of deals per page)
    -   **Success Response (200 OK)**:
        ```json
        {
          "deals": [
            // Array of deal summary objects (key fields like id, propertyAddress, amount, status, user's role)
          ],
          "nextPageToken": "<firestore_doc_id_of_last_deal_in_this_page_or_null>"
        }
        ```
    -   **Frontend Actions**: Display deals in a dashboard or list. Implement "Load More" or pagination using `nextPageToken`. Consider using Firestore query listeners for real-time updates to this list (e.g., new deals appearing, status changes on existing ones).

-   **`PUT /:transactionId/conditions/:conditionId/buyer-review`**
    -   **Description**: Allows the buyer in a deal to update the fulfillment status of one of their designated off-chain conditions.
    -   **URL Parameters**: `:transactionId`, `:conditionId` (the unique ID of the condition within the deal's `conditions` array).
    -   **Request Body**: `{ "fulfilled": true }` (or `false` to un-fulfill).
    -   **Backend Logic**: Updates the `fulfilled` status (and potentially `fulfilledBy`, `fulfilledAt` fields) of the specific condition within the deal document in Firestore. May trigger checks to see if all conditions are now met, potentially leading to an automatic status transition of the deal (e.g., to `READY_FOR_FINAL_APPROVAL`).
    -   **Success Response (200 OK)**: `{ "message": "Condition status updated successfully." }` (The frontend will see the change via its Firestore listener).
    -   **Frontend Actions**: Provide interactive elements (e.g., checkboxes) for the buyer to manage their conditions. The UI should reflect the updated state based on the Firestore listener. Inform the user of any resulting deal status changes.

-   **`PUT /:transactionId/sync-status`**
    -   **Description**: Manually triggers the backend to query the smart contract for its current state and update the corresponding deal status in Firestore if it has diverged. This is a recovery or refresh mechanism.
    -   **URL Parameter**: `:transactionId`.
    -   **Backend Logic**: Calls `blockchainService.js` to fetch the current state from the deployed smart contract associated with the deal, then updates the `status` field in the Firestore deal document.
    -   **Success Response (200 OK)**: `{ "message": "Deal status synchronization initiated/completed.", "updatedStatus": "ACTUAL_STATUS_FROM_CHAIN", "previousStatus": "STATUS_IN_FIRESTORE_BEFORE_SYNC" }`.
    -   **Frontend Actions**: Offer a "Refresh Status" button on the deal details page. The UI will update via its Firestore listener when the sync completes and Firestore is updated.

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