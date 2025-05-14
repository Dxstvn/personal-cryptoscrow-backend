# API Routes (`src/api/routes`)

## Overview

This directory serves as the entry point and organizational root for all HTTP API endpoints exposed by the CryptoEscrow backend. It modularizes the API into different resource domains, each handled by a specific subdirectory and its corresponding Express router.

**Frontend Relevance**: This is the primary interface for the frontend application to communicate with the backend. Understanding the structure here helps frontend developers locate the relevant route definitions for specific features they are building. The main `README.md` of the project provides a consolidated list of user-facing endpoints, while the READMEs within these subdirectories offer more focused details on each module.

## Structure & Key Route Modules

The API is broken down into the following functional areas, each corresponding to a subdirectory:

-   **`auth/`**: Manages all aspects of user authentication and authorization.
    -   **Key File**: `loginSignUp.js` (handles email/password and Google sign-in/sign-up).
    -   **Frontend Focus**: Endpoints for registering new users and signing in existing ones. While the frontend primarily uses the Firebase Client SDK for auth state, these backend routes are crucial for initial user creation in Firebase and any backend-specific user setup.
    -   See `src/api/routes/auth/README.md` for detailed endpoint descriptions.

-   **`contact/`**: Handles features related to users managing their contact lists and invitations.
    -   **Key File**: `contactRoutes.js`.
    -   **Frontend Focus**: Endpoints for sending/accepting/declining invitations, listing contacts, and removing contacts. Essential for UIs where users interact with other users or select parties for deals.
    -   See `src/api/routes/contact/README.md` for detailed endpoint descriptions.

-   **`database/`** (Primarily for File Management):
    -   **Key File**: `fileUploadDownload.js`.
    -   **Frontend Focus**: Endpoints for uploading files related to deals (e.g., contracts, inspection reports) and downloading them. This directory name might be slightly misleading, as its current primary function is file operations via Firebase Storage, not general database CRUD for all entities.
    -   See `src/api/routes/database/README.md` for detailed endpoint descriptions.

-   **`health/`**: Provides a simple health check endpoint.
    -   **Key File**: `health.js`.
    -   **Frontend Focus**: Generally not directly consumed by the main user-facing UI, but important for system monitoring which ensures backend availability.
    -   See `src/api/routes/health/README.md` for detailed endpoint descriptions.

-   **`transaction/`** (Core Deal/Escrow Management):
    -   **Key File**: `transactionRoutes.js`.
    -   **Frontend Focus**: This is a critical module for the frontend. It handles the creation of new escrow deals, retrieval of deal details (though Firestore listeners are preferred for live updates), listing a user's deals, updating off-chain conditions, and manually syncing deal status with the blockchain.
    -   See `src/api/routes/transaction/README.md` for detailed endpoint descriptions.

## Routing Mechanism & Base Path

-   Each subdirectory (e.g., `auth/`, `contact/`) typically exports an Express `Router` instance.
-   These individual routers are then imported into a main API router (often an `index.js` within `src/api/` or directly in the main server setup file like `app.js` or `server.js`).
-   They are mounted under a common base path, usually `/api`. For example, routes defined in `auth/loginSignUp.js` might be accessible via `/api/auth/...`, and routes from `transaction/transactionRoutes.js` via `/api/deals/...`.

## General Conventions for Frontend Developers

-   **Authentication**: Most routes (excluding public ones like `/api/health` or some `/api/auth` endpoints) are protected and require a Firebase ID Token. This token must be sent in the `Authorization` header with the `Bearer` scheme: `Authorization: Bearer <FIREBASE_ID_TOKEN>`.
    -   A missing or invalid token will typically result in a `401 Unauthorized` or `403 Forbidden` response.
    -   The backend uses authentication middleware (e.g., `firebaseAuthMiddleware.js`, likely located in `src/api/middleware/`) to verify these tokens.
-   **Request/Response Format**: Expect JSON for both request bodies (where applicable, with `Content-Type: application/json`) and API responses.
-   **HTTP Status Codes**: Standard codes are used (e.g., `200` for success, `201` for resource creation, `400` for bad client requests/validation errors, `404` for not found, `500` for server errors).
-   **Error Responses**: Generally, error responses will include a JSON body with an `error` field containing a descriptive message, e.g., `{ "error": "Invalid deal ID format." }`.
-   **Idempotency**: Be mindful of GET (safe, idempotent), POST (often not idempotent - creates resources), PUT (often idempotent - updates/replaces resources), DELETE (idempotent - deletes resources).
-   **Data Fetching vs. Real-time**: While GET endpoints are provided for fetching data (like deal details or contact lists), the primary mechanism for keeping the frontend UI up-to-date with changes in Firestore (e.g., deal status, new messages, contact updates) should be **Firestore real-time listeners**. The GET endpoints are useful for initial data loads or fallbacks. 