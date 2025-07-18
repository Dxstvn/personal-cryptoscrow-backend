# Authentication Routes (`/auth`)

## Overview

This directory contains the authentication API routes for the CryptoEscrow platform. The system uses Firebase Authentication with both email/password and Google Sign-In methods. All endpoints return Firebase ID tokens that must be included in subsequent API requests.

**Base Path**: `/auth`  
**Authentication**: Public endpoints (no authentication required)  
**Response Format**: JSON with ID tokens for authenticated requests

## Core Endpoints

### 1. Email/Password Sign Up
**POST** `/auth/signUpEmailPass`

Creates a new user account with email and password.

**Request Body**:
```json
{
  "email": "user@example.com",
  "password": "SecurePassword123!",
  "walletAddress": "0x1234567890123456789012345678901234567890" // Optional
}
```

**Success Response** (200 OK):
```json
{
  "message": "User created successfully",
  "token": "eyJhbGciOiJSUzI1NiIs...", // Firebase ID token
  "tokenType": "id",
  "userId": "firebase-user-uid",
  "user": {
    "uid": "firebase-user-uid",
    "email": "user@example.com"
  }
}
```

**Error Responses**:
- `400 Bad Request`: Missing email/password, weak password, or invalid email format
- `409 Conflict`: Email already exists

**Backend Actions**:
1. Creates Firebase Authentication user
2. Generates Firestore user profile document
3. Adds wallet to profile if provided
4. Sets admin claims for allowed emails (production only)
5. Returns ID token for immediate use

### 2. Email/Password Sign In
**POST** `/auth/signInEmailPass`

Authenticates existing user with email and password.

**Request Body**:
```json
{
  "email": "user@example.com",
  "password": "SecurePassword123!"
}
```

**Success Response** (200 OK):
```json
{
  "message": "User signed in successfully",
  "token": "eyJhbGciOiJSUzI1NiIs...", // Firebase ID token
  "tokenType": "id",
  "userId": "firebase-user-uid",
  "user": {
    "uid": "firebase-user-uid",
    "email": "user@example.com"
  }
}
```

**Error Responses**:
- `400 Bad Request`: Missing email/password
- `401 Unauthorized`: Invalid credentials
- `403 Forbidden`: Email not in allowed list (production only)

### 3. Google Sign In
**POST** `/auth/signInGoogle`

Authenticates user using Google ID token from Firebase Client SDK.

**Request Body**:
```json
{
  "idToken": "google-id-token-from-firebase-client-sdk"
}
```

**Success Response** (200 OK):
```json
{
  "message": "User signed in successfully via Google",
  "token": "eyJhbGciOiJSUzI1NiIs...", // Same ID token passed in
  "tokenType": "id",
  "userId": "firebase-user-uid",
  "user": {
    "uid": "firebase-user-uid",
    "email": "user@gmail.com"
  }
}
```

**Error Responses**:
- `400 Bad Request`: Missing ID token
- `401 Unauthorized`: Invalid Google ID token
- `403 Forbidden`: Email not in allowed list (production only)

**Backend Actions**:
1. Verifies Google ID token
2. Creates user profile if first sign-in
3. Sets admin claims for allowed emails
4. Returns the same ID token for consistency

### 4. Token Refresh (Not Implemented)
**POST** `/auth/refreshToken`

Currently returns 501 Not Implemented. Use Firebase Client SDK for token refresh.

## User Profile Structure

When users sign up or first sign in with Google, a Firestore document is created:

```javascript
{
  uid: "firebase-user-uid",
  email: "user@example.com",
  first_name: "", // From Google profile or empty
  last_name: "",  // From Google profile or empty
  phone_number: "",
  wallets: [
    {
      address: "0x...",
      name: "Primary Wallet",
      network: "ethereum",
      isPrimary: true,
      addedAt: Date
    }
  ],
  createdAt: Date
}
```

## Frontend Integration Guide

### 1. Initial Setup
```javascript
// Initialize Firebase
import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';

const firebaseConfig = {
  // Your Firebase config
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
```

### 2. Email/Password Registration
```javascript
async function signUp(email, password, walletAddress) {
  const response = await fetch('/auth/signUpEmailPass', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, walletAddress })
  });
  
  const data = await response.json();
  if (response.ok) {
    // Store token for authenticated requests
    localStorage.setItem('authToken', data.token);
    return data;
  }
  throw new Error(data.error);
}
```

### 3. Google Sign-In Flow
```javascript
async function signInWithGoogle() {
  // Step 1: Get Google ID token using Firebase Client SDK
  const provider = new GoogleAuthProvider();
  const result = await signInWithPopup(auth, provider);
  const idToken = await result.user.getIdToken();
  
  // Step 2: Send to backend for verification
  const response = await fetch('/auth/signInGoogle', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken })
  });
  
  const data = await response.json();
  if (response.ok) {
    localStorage.setItem('authToken', data.token);
    return data;
  }
  throw new Error(data.error);
}
```

### 4. Using Tokens in API Requests
```javascript
// Set up authenticated requests
const authenticatedFetch = (url, options = {}) => {
  const token = localStorage.getItem('authToken');
  return fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      'Authorization': `Bearer ${token}`
    }
  });
};

// Example: Fetch user's deals
const deals = await authenticatedFetch('/transaction/deals');
```

### 5. Token Refresh Strategy
```javascript
// Use Firebase Client SDK for token refresh
auth.onIdTokenChanged(async (user) => {
  if (user) {
    const token = await user.getIdToken();
    localStorage.setItem('authToken', token);
  } else {
    localStorage.removeItem('authToken');
  }
});

// Force refresh when needed
async function refreshToken() {
  const user = auth.currentUser;
  if (user) {
    const token = await user.getIdToken(true);
    localStorage.setItem('authToken', token);
    return token;
  }
  throw new Error('No authenticated user');
}
```

## Security Considerations

### Authentication Flow
1. **Email/Password**: Backend creates custom token, converts to ID token
2. **Google Sign-In**: Frontend gets ID token, backend verifies and returns it
3. **Token Storage**: Store securely (consider HttpOnly cookies for production)
4. **Token Expiry**: Firebase ID tokens expire after 1 hour
5. **Auto-Refresh**: Use Firebase Client SDK's built-in refresh mechanism

### Production Environment
- **Allowed Emails**: Set `ALLOWED_EMAILS` environment variable for access control
- **Admin Claims**: Automatically set for allowed emails
- **HTTPS Only**: Ensure all authentication requests use HTTPS
- **Rate Limiting**: Authentication endpoints are rate-limited (5 attempts/15 minutes)

### Error Handling
```javascript
const handleAuthError = (error) => {
  const errorMessages = {
    'Email already in use': 'This email is already registered',
    'Password is too weak': 'Please use a stronger password',
    'Invalid credentials': 'Incorrect email or password',
    'Access denied': 'Your email is not authorized to access this system'
  };
  
  return errorMessages[error.message] || 'Authentication failed';
};
```

## Testing Authentication

### Mock Authentication Service
```javascript
// For testing without backend
const mockAuth = {
  signUp: async (email, password) => ({
    token: 'mock-token',
    userId: 'mock-user-id',
    user: { uid: 'mock-user-id', email }
  }),
  
  signIn: async (email, password) => ({
    token: 'mock-token',
    userId: 'mock-user-id',
    user: { uid: 'mock-user-id', email }
  })
};
```

### Integration Testing
```javascript
// Test with Firebase Emulators
const testAuth = async () => {
  // Connect to emulators
  connectAuthEmulator(auth, 'http://localhost:9099');
  
  // Test sign up
  const result = await signUp('test@example.com', 'password123');
  expect(result.token).toBeDefined();
  expect(result.user.email).toBe('test@example.com');
};
```

## Common Issues & Solutions

### Issue: "Email not in allowed list"
**Solution**: In production, add email to `ALLOWED_EMAILS` environment variable

### Issue: Token expired errors
**Solution**: Implement automatic token refresh using Firebase Client SDK

### Issue: CORS errors
**Solution**: Ensure frontend URL is in backend CORS configuration

### Issue: Custom token to ID token conversion fails
**Solution**: Check Firebase project configuration and service account permissions

## Next Steps for Frontend

1. **Implement Authentication UI**: Login/signup forms with validation
2. **Set Up Token Management**: Automatic refresh and secure storage
3. **Handle Authentication States**: Loading, authenticated, unauthenticated
4. **Add Social Login**: Extend Google Sign-In with other providers
5. **Implement Profile Management**: Allow users to update their information
6. **Add Wallet Connection**: Link crypto wallets after authentication