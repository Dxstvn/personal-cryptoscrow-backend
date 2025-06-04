# Authentication Routes (`src/api/routes/auth`)

## Overview

This directory is responsible for handling user authentication within the CryptoEscrow backend. It provides API endpoints that integrate with Firebase Authentication to manage user sign-up, sign-in, and session validation via Google ID tokens.

**Frontend Relevance**: These endpoints are the backend counterparts to the authentication actions performed by the user on the frontend using the Firebase Client SDK. While the Firebase Client SDK primarily manages the user's session and ID token on the client-side, these backend routes are essential for:
1.  Registering new users in the Firebase Authentication system.
2.  Performing backend-specific validation or user setup upon authentication (e.g., checking whitelists, setting custom claims).
3.  Validating Google ID tokens provided by the frontend.

## Key Files & Functionality

-   **`loginSignUp.js`**: This is the core file defining the authentication API endpoints.
    -   **`POST /auth/signUpEmailPass`**: Allows new users to register with an email, password, and optional wallet address.
        -   **Frontend Action**: Collect email, password, and (optionally) wallet address. Call this endpoint to create the user in Firebase and Firestore. Handle success (user created) or errors (e.g., email already exists).
    -   **`POST /auth/signInEmailPass`**: Allows existing users to sign in and returns an ID token for subsequent API calls.
        -   **Frontend Action**: Collect email and password. Call this endpoint and store the returned token for authenticated requests. The frontend should also ensure the Firebase Client SDK reflects the authentication state.
    -   **`POST /auth/signInGoogle`**: Facilitates user sign-in or sign-up using a Google ID token obtained by the frontend after a successful Google Sign-In flow. **Note**: Has email whitelisting in production mode.
        -   **Frontend Action**: After Google Sign-In on the client, send the obtained Google ID token to this endpoint. The backend verifies the token, creates a Firebase user if new, and performs authorization checks (like email whitelisting in production).

-   **`admin.js`**: Initializes the Firebase Admin SDK (`adminApp`).
    -   **Significance**: The Admin SDK is crucial for backend operations that require administrative privileges over Firebase services. For authentication, this includes:
        -   Verifying Firebase ID tokens (sent by the frontend in `Authorization` headers for protected routes).
        -   Creating users programmatically (though `loginSignUp.js` seems to use a mix of client and admin SDK functionalities for this).
        -   Setting custom user claims (e.g., an `admin` role).
        -   Looking up user details by UID or email.
    -   **Frontend Implication**: The security of all authenticated API endpoints relies on the token verification performed using this Admin SDK instance.

-   **`authIndex.js`**: Initializes a Firebase client-side app instance (`ethEscrowApp`).
    -   **Significance**: This might seem counterintuitive for a backend, but it's used in `loginSignUp.js` for operations like `createUserWithEmailAndPassword` from the `firebase/auth` (client) SDK. This approach is sometimes used when the backend needs to perform actions as if it were a client app, especially if certain client SDK functionalities are preferred or if it simplifies integration with Firebase emulators.
    -   It also correctly handles connecting to the Firebase Auth and Storage emulators when `NODE_ENV === 'test'`, which is vital for isolated testing.

## Authentication Flow for Frontend Developers

1.  **Client-Side Authentication**: Use the Firebase Client SDK in your frontend application for all user-facing sign-up and sign-in processes (e.g., rendering Google Sign-In button, email/password forms).
2.  **Obtain ID Token**: Upon successful sign-in/sign-up via the Firebase Client SDK, the SDK provides a Firebase ID Token.
3.  **Call Backend Auth Endpoints (if necessary)**:
    -   For **new user registration** (`/auth/signUpEmailPass` or after a new Google Sign-In via `/auth/signInGoogle`), your frontend sends the necessary information (email/password or Google ID token) to these backend endpoints. This allows the backend to officially create the user in Firebase and perform any server-side setup.
    -   For **existing user sign-in**, while the Firebase Client SDK handles the session, calling `/auth/signInEmailPass` or `/auth/signInGoogle` can be a way for the backend to acknowledge the session, perform its own checks, or refresh backend-specific user data if any.
4.  **Secure API Calls**: For *all other protected backend API routes* (e.g., `/deals`, `/contact`), the frontend **MUST** include the Firebase ID Token (obtained from the Firebase Client SDK) in the `Authorization` header of every HTTP request:
    `Authorization: Bearer <FIREBASE_ID_TOKEN>`
5.  **Backend Token Verification**: A middleware on the backend (likely `src/api/middleware/firebaseAuthMiddleware.js`) intercepts these requests. It uses the Firebase Admin SDK (initialized in `admin.js`) to verify the ID token. If the token is valid and not revoked, the middleware allows the request to proceed to the protected route handler. Otherwise, it returns a `401 Unauthorized` or `403 Forbidden` error.
6.  **Token Refresh**: The Firebase Client SDK automatically handles the refreshing of ID tokens. Ensure your frontend HTTP client or request logic always uses the latest token provided by the SDK.

## Important Considerations for Frontend

-   **Error Handling**: The `/auth` endpoints can return specific error codes from Firebase (e.g., `auth/email-already-in-use`, `auth/wrong-password`, `auth/invalid-id-token`). The frontend should catch these errors and display user-friendly messages.
-   **Custom Claims/Roles**: If the backend sets custom claims (like `admin: true`), the Firebase ID token on the frontend will contain these claims. The frontend can decode the ID token (for display or UI control purposes, but *not for security decisions* - security is enforced by backend) or the backend can return user roles in API responses.
-   **Emulator Usage**: During local development and testing, ensure your Firebase Client SDK is configured to point to the Firebase Auth Emulator (default `http://localhost:9099`) if the backend is using it (as configured in `authIndex.js` for test environments).

## Key Dependencies

-   `express`: For routing.
-   `firebase` (client SDK): For `authIndex.js` and parts of `loginSignUp.js`.
-   `firebase-admin`: For `admin.js` and token verification/user management in `loginSignUp.js`.
-   `jsonwebtoken`: Potentially used for custom token generation/handling if any, though primary auth is Firebase-based. 