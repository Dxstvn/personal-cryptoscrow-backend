# Backend Services (`src/services`)

## Overview

This directory is a critical part of the backend, containing service modules that implement the core business logic of the CryptoEscrow application. These services act as a bridge between the API route handlers (`src/api/routes`) and the underlying data sources (Firestore) or external systems (Ethereum blockchain).

**Frontend Relevance**: While the frontend doesn't call these services directly, they dictate the data transformations, business rule enforcement, and interactions that ultimately affect what data and statuses are presented to the user. Understanding their roles helps in comprehending the end-to-end flow of operations initiated from the frontend.

## Key Service Modules

-   **`databaseService.js`**:
    -   **Purpose**: This service is currently focused on specialized database operations, primarily for the `scheduledJobs.js`. It fetches deals that meet specific criteria (e.g., deals past their `finalApprovalDeadlineBackend` or `disputeResolutionDeadlineBackend`) and updates deal statuses in Firestore following automated on-chain actions.
    -   **Key Interactions**: Firestore (via Firebase Admin SDK) - specifically the `deals` collection.
    -   **Used By**: Primarily `scheduledJobs.js`.
    -   **Frontend Implication**: The updates made by this service (e.g., changing a deal status to `COMPLETED` or `CANCELLED` after an automated process) are what the frontend will see via its Firestore real-time listeners. It explains *how* a deal status can change automatically.

-   **`blockchainService.js`**:
    -   **Purpose**: This is the sole gateway for all interactions with the Ethereum blockchain and the deployed `PropertyEscrow` smart contracts. Its responsibilities include:
        -   Initializing the Ethers.js provider and signer (using environment variables for RPC URL and backend wallet private key).
        -   Loading the `PropertyEscrow.sol` contract ABI (from `src/contract/artifacts`).
        -   Providing functions to call specific read-only (`view`/`pure`) methods on the smart contract (e.g., `getContractState`, `getDealDetailsFromChain`).
        -   Providing functions to execute state-changing (transactional) methods on the smart contract (e.g., `triggerReleaseAfterApproval`, `triggerCancelAfterDisputeDeadline`, `raiseDispute`). These functions handle transaction signing, sending, and potentially waiting for receipts.
    -   **Key Interactions**: Ethers.js library, `PropertyEscrow.sol` ABI, Ethereum node (via RPC URL), backend wallet.
    -   **Used By**: `scheduledJobs.js` (for automated on-chain actions), `contractDeployer.js` (for wallet/provider access), and API route handlers in `src/api/routes/transaction/` that need to perform on-chain queries or trigger user-initiated on-chain transactions.
    -   **Frontend Implication**: When a user action on the frontend is intended to cause an on-chain change (e.g., buyer deposits funds, seller initiates final approval), the API endpoint called by the frontend will use this service. The success/failure and transaction hash of these operations, logged by the backend, are critical for the frontend to display.

-   **`scheduledJobs.js`**:
    -   **Purpose**: Manages automated, time-based tasks using `node-cron`. Its primary function is to periodically:
        1.  Query the database (via `databaseService.js`) for deals that are in states like `IN_FINAL_APPROVAL` or `IN_DISPUTE` and whose relevant deadlines have passed.
        2.  For each such deal, call `blockchainService.js` to trigger the appropriate smart contract function (e.g., release funds if final approval period ended without dispute, or cancel/refund if dispute period ended without resolution).
        3.  Update the deal's status and timeline in Firestore (via `databaseService.js`) to reflect the outcome of the automated on-chain action.
    -   **Key Interactions**: `node-cron` library, `databaseService.js`, `blockchainService.js`.
    -   **Frontend Implication**: This service is responsible for many of the "automatic" state changes a user might observe in a deal. The frontend needs to use real-time listeners on Firestore to reflect these changes promptly and accurately. Explaining that deadlines are enforced by automated backend jobs can be helpful for user understanding.

-   **`contractDeployer.js`**:
    -   **Purpose**: Responsible for deploying new instances of the `PropertyEscrow.sol` smart contract. This is typically invoked when a new deal is created through the API, and the system is configured to give each deal its own unique contract instance.
    -   **Key Interactions**: Ethers.js library, `PropertyEscrow.sol` ABI and bytecode (from `src/contract/artifacts`), `blockchainService.js` (for provider/signer access), environment variables (for deployer wallet).
    -   **Used By**: API route handlers in `src/api/routes/transaction/transactionRoutes.js` (specifically the deal creation endpoint).
    -   **Frontend Implication**: The successful deployment of a contract (or failure) during deal creation is a key piece of feedback the frontend needs. The `smartContractAddress` returned by the deal creation API originates from this service's work.

## General Principles & Frontend Considerations

-   **Abstraction**: These services abstract complex operations (like blockchain transactions or specific database queries) from the API route handlers. This keeps the route handlers focused on HTTP request/response management and input validation.
-   **Data Flow**: Frontend -> API Route Handler -> Service(s) -> Database/Blockchain.
    -   The results of service operations (data fetched, success/failure of an action) are returned to the route handler, which then formats the HTTP response for the frontend.
    -   For changes in data state (especially in Firestore), the frontend primarily relies on its real-time listeners rather than explicit data pushes in API responses for these changes.
-   **Error Handling**: Services are responsible for handling errors from their interactions (e.g., blockchain transaction reverted, database query failed) and either resolving them or propagating them in a structured way for the API layer to translate into appropriate HTTP error responses.
    -   **Frontend**: Should be prepared to handle various error responses originating from service-layer failures, displaying user-friendly messages.
-   **Testability**: The modular nature of these services, coupled with their focused responsibilities, enhances testability. The `__tests__` subdirectory within `src/services` contains unit and integration tests for these modules. 