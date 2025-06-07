# Authentication Routes (`src/api/routes/auth`)

## Overview

This directory contains the authentication API routes for the CryptoEscrow platform. These endpoints handle user registration, login, and authentication token management using Firebase Authentication as the backend service. The authentication system supports both email/password and Google Sign-In authentication methods.

**Frontend Relevance**: Critical for building user registration flows, login interfaces, and session management. These endpoints work in conjunction with Firebase Client SDK for comprehensive authentication experiences.

## File: `loginSignUp.js`

**Base Path**: `/auth` (mounted at `/auth` in server.js)
**Authentication**: Public endpoints (no authentication required for these routes)
**Key Integrations**: Firebase Authentication, Firestore user profiles, wallet management

## Core Endpoints

### **Email/Password Authentication**

#### `POST /auth/signUpEmailPass`
**Purpose**: Creates a new user account using email and password credentials.

**Request Body**:
```json
{
  "email": "user@example.com",
  "password": "SecurePassword123!",
  "walletAddress": "0x1234567890123456789012345678901234567890" // Optional
}
```

**Success Response (201 Created)**:
```json
{
  "message": "User created successfully",
  "user": {
    "uid": "firebase-user-id",
    "email": "user@example.com",
    "emailVerified": false,
    "createdAt": "2023-10-26T10:00:00.000Z"
  },
  "token": "firebase-id-token",
  "profile": {
    "walletAddress": "0x1234567890123456789012345678901234567890",
    "isNewUser": true,
    "registrationMethod": "email"
  }
}
```

**Error Responses**:
```json
// Email already exists (400)
{
  "error": "The email address is already in use by another account."
}

// Weak password (400)
{
  "error": "Password should be at least 6 characters"
}

// Invalid email format (400)
{
  "error": "The email address is badly formatted."
}
```

**Frontend Actions**:
- Build registration form with email/password validation
- Handle password strength requirements
- Store returned token for authenticated requests
- Set up user profile with optional wallet address
- Implement email verification flow if required

#### `POST /auth/signInEmailPass`
**Purpose**: Authenticates existing user with email and password credentials.

**Request Body**:
```json
{
  "email": "user@example.com", 
  "password": "SecurePassword123!"
}
```

**Success Response (200 OK)**:
```json
{
  "message": "User signed in successfully",
  "user": {
    "uid": "firebase-user-id",
    "email": "user@example.com",
    "emailVerified": true,
    "lastSignInTime": "2023-10-26T10:00:00.000Z",
    "creationTime": "2023-10-20T09:00:00.000Z"
  },
  "token": "firebase-id-token",
  "profile": {
    "walletAddress": "0x1234567890123456789012345678901234567890",
    "isNewUser": false,
    "hasCompletedOnboarding": true
  }
}
```

**Error Responses**:
```json
// Invalid credentials (401)
{
  "error": "The password is invalid or the user does not have a password."
}

// User not found (401)
{
  "error": "There is no user record corresponding to this identifier."
}

// User disabled (401)
{
  "error": "The user account has been disabled by an administrator."
}
```

**Frontend Actions**:
- Build login form with email/password input
- Store authentication token in secure storage
- Handle "remember me" functionality
- Redirect to dashboard or onboarding flow
- Implement password reset flow

### **Google Sign-In Authentication**

#### `POST /auth/signInGoogle`
**Purpose**: Authenticates user using Google Sign-In ID token from frontend.

**Request Body**:
```json
{
  "idToken": "google-id-token-from-firebase-client-sdk"
}
```

**Success Response (200 OK)**:
```json
{
  "message": "User signed in successfully with Google",
  "user": {
    "uid": "firebase-user-id",
    "email": "user@gmail.com",
    "displayName": "John Doe",
    "photoURL": "https://lh3.googleusercontent.com/...",
    "emailVerified": true,
    "providerData": [
      {
        "providerId": "google.com",
        "uid": "google-user-id",
        "email": "user@gmail.com"
      }
    ]
  },
  "token": "firebase-id-token",
  "profile": {
    "displayName": "John Doe",
    "photoURL": "https://lh3.googleusercontent.com/...",
    "isNewUser": false,
    "registrationMethod": "google"
  }
}
```

**Error Responses**:
```json
// Invalid ID token (401)
{
  "error": "Invalid ID token"
}

// Token verification failed (401) 
{
  "error": "Firebase ID token has invalid signature"
}

// Expired token (401)
{
  "error": "Firebase ID token has expired"
}
```

**Frontend Actions**:
- Implement Google Sign-In button using Firebase SDK
- Handle Google authentication flow
- Send ID token to backend for verification
- Store returned Firebase token for API authentication
- Update UI with user profile information

## Authentication Flow Integration

### **Frontend Authentication Architecture**

```javascript
// Example: Complete authentication flow
class AuthService {
  constructor() {
    this.currentUser = null;
    this.token = localStorage.getItem('authToken');
  }

  // Email/Password Registration
  async signUpWithEmail(email, password, walletAddress) {
    try {
      const response = await api.post('/auth/signUpEmailPass', {
        email,
        password,
        walletAddress
      });

      this.handleAuthSuccess(response.data);
      return response.data;
    } catch (error) {
      this.handleAuthError(error);
      throw error;
    }
  }

  // Email/Password Login
  async signInWithEmail(email, password) {
    try {
      const response = await api.post('/auth/signInEmailPass', {
        email,
        password
      });

      this.handleAuthSuccess(response.data);
      return response.data;
    } catch (error) {
      this.handleAuthError(error);
      throw error;
    }
  }

  // Google Sign-In
  async signInWithGoogle() {
    try {
      // Get Google ID token from Firebase Client SDK
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const idToken = await result.user.getIdToken();

      // Send to backend for verification
      const response = await api.post('/auth/signInGoogle', {
        idToken
      });

      this.handleAuthSuccess(response.data);
      return response.data;
    } catch (error) {
      this.handleAuthError(error);
      throw error;
    }
  }

  // Handle successful authentication
  handleAuthSuccess(authData) {
    this.currentUser = authData.user;
    this.token = authData.token;
    localStorage.setItem('authToken', authData.token);
    
    // Set up API client with token
    api.defaults.headers.common['Authorization'] = `Bearer ${authData.token}`;
    
    // Set up Firestore listeners with authenticated user
    this.setupFirestoreListeners(authData.user.uid);
  }

  // Handle authentication errors
  handleAuthError(error) {
    console.error('Authentication error:', error);
    
    // Clear any existing auth data
    this.signOut();
    
    // Show user-friendly error message
    this.showAuthError(error.response?.data?.error || 'Authentication failed');
  }

  // Sign out user
  signOut() {
    this.currentUser = null;
    this.token = null;
    localStorage.removeItem('authToken');
    delete api.defaults.headers.common['Authorization'];
  }
}
```

### **Token Management & Storage**

```javascript
// Example: Secure token management
class TokenManager {
  static setToken(token) {
    // Store in secure storage (consider HttpOnly cookies for production)
    localStorage.setItem('authToken', token);
    
    // Set up automatic token refresh
    this.setupTokenRefresh(token);
  }

  static getToken() {
    return localStorage.getItem('authToken');
  }

  static removeToken() {
    localStorage.removeItem('authToken');
    this.clearTokenRefresh();
  }

  static setupTokenRefresh(token) {
    // Parse token to get expiry
    const payload = JSON.parse(atob(token.split('.')[1]));
    const expiryTime = payload.exp * 1000;
    const refreshTime = expiryTime - (5 * 60 * 1000); // Refresh 5 minutes before expiry

    setTimeout(() => {
      this.refreshToken();
    }, refreshTime - Date.now());
  }

  static async refreshToken() {
    try {
      // Get fresh token from Firebase
      const user = auth.currentUser;
      if (user) {
        const newToken = await user.getIdToken(true);
        this.setToken(newToken);
      }
    } catch (error) {
      console.error('Token refresh failed:', error);
      // Redirect to login
      window.location.href = '/login';
    }
  }
}
```

## User Profile Integration

### **Profile Data Structure**

The authentication endpoints also create/update user profile documents in Firestore:

```javascript
// User profile document structure
{
  uid: "firebase-user-id",
  email: "user@example.com",
  displayName: "John Doe", // From Google or manually set
  photoURL: "https://...", // From Google profile
  walletAddress: "0x...", // Primary wallet address
  registrationMethod: "email", // "email" or "google"
  createdAt: timestamp,
  lastLoginAt: timestamp,
  preferences: {
    notifications: true,
    defaultNetwork: "ethereum",
    theme: "dark"
  },
  onboardingCompleted: false,
  emailVerified: true
}
```

### **Profile Setup Flow**

```javascript
// Example: Post-authentication profile setup
const completeUserOnboarding = async (authData) => {
  const { user, profile } = authData;

  // Check if onboarding is needed
  if (profile.isNewUser || !profile.hasCompletedOnboarding) {
    // Redirect to onboarding flow
    router.push('/onboarding');
  } else {
    // Proceed to dashboard
    router.push('/dashboard');
  }

  // Set up wallet connections if wallet address exists
  if (profile.walletAddress) {
    await connectUserWallet(profile.walletAddress);
  }
};
```

## Security Considerations

### **Frontend Security Best Practices**

1. **Token Storage**: Use secure storage mechanisms (consider HttpOnly cookies for production)
2. **Token Validation**: Always validate tokens before making API calls
3. **Automatic Refresh**: Implement automatic token refresh before expiry
4. **HTTPS Only**: Ensure all authentication flows use HTTPS
5. **Input Validation**: Validate email format and password strength client-side
6. **Error Handling**: Don't expose sensitive error details to users

### **Password Requirements**

The backend enforces minimum password requirements:
- Minimum 6 characters (Firebase default)
- Recommend stronger requirements in frontend:
  - 8+ characters
  - Mix of uppercase, lowercase, numbers
  - Special characters

### **Rate Limiting**

Authentication endpoints are protected by rate limiting:
- 5 attempts per 15 minutes per IP for authentication endpoints
- Implement client-side rate limiting feedback

## Error Handling Patterns

### **User-Friendly Error Messages**

```javascript
const getAuthErrorMessage = (errorCode) => {
  const errorMessages = {
    'auth/email-already-in-use': 'This email is already registered. Try signing in instead.',
    'auth/weak-password': 'Password should be at least 6 characters long.',
    'auth/invalid-email': 'Please enter a valid email address.',
    'auth/user-not-found': 'No account found with this email address.',
    'auth/wrong-password': 'Incorrect password. Please try again.',
    'auth/user-disabled': 'This account has been disabled. Contact support.',
    'auth/too-many-requests': 'Too many failed attempts. Please try again later.',
    'auth/network-request-failed': 'Network error. Please check your connection.'
  };

  return errorMessages[errorCode] || 'Authentication failed. Please try again.';
};
```

### **Validation Helpers**

```javascript
// Example: Client-side validation
const validateAuthInput = (email, password) => {
  const errors = {};

  // Email validation
  if (!email) {
    errors.email = 'Email is required';
  } else if (!/\S+@\S+\.\S+/.test(email)) {
    errors.email = 'Please enter a valid email address';
  }

  // Password validation
  if (!password) {
    errors.password = 'Password is required';
  } else if (password.length < 6) {
    errors.password = 'Password must be at least 6 characters';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
};
```

## Testing Integration

### **Authentication Testing Patterns**

```javascript
// Mock authentication for testing
const mockAuth = {
  signUp: jest.fn().mockResolvedValue({
    user: { uid: 'test-uid', email: 'test@example.com' },
    token: 'mock-token'
  }),
  
  signIn: jest.fn().mockResolvedValue({
    user: { uid: 'test-uid', email: 'test@example.com' },
    token: 'mock-token'
  }),
  
  signOut: jest.fn().mockResolvedValue(true)
};

// Test authentication flow
test('should handle successful login', async () => {
  const authService = new AuthService();
  const result = await authService.signInWithEmail('test@example.com', 'password123');
  
  expect(result.user.email).toBe('test@example.com');
  expect(localStorage.getItem('authToken')).toBe('mock-token');
});
```

## Environment Configuration

### **Firebase Configuration**

```javascript
// Firebase config for frontend
const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  // ... other config
};

// Initialize Firebase
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
```

---

**Critical Frontend Integration Notes**:

1. **Use Firebase Client SDK** for initial authentication and token generation
2. **Send tokens to backend** for verification and profile creation
3. **Store tokens securely** with automatic refresh mechanisms
4. **Handle all error states** with user-friendly messages
5. **Implement proper validation** for email and password requirements
6. **Set up Firestore listeners** after successful authentication
7. **Test authentication flows** thoroughly across all platforms
8. **Monitor authentication metrics** for security and user experience 