# Passwordless Email Authentication - Frontend Integration Guide

## Overview

The ClearHold backend now supports passwordless email authentication using Firebase Authentication's email link (magic link) functionality. This provides a secure, user-friendly authentication method without requiring passwords.

## How It Works

1. User enters their email address
2. Backend sends a branded "magic link" to their email
3. User clicks the link in their email
4. User is automatically signed in to their account
5. If new user, an account is created automatically

## API Endpoints

### 1. Send Sign-In Link

**Endpoint**: `POST /auth/passwordless/send-link`

**Request Body**:
```json
{
  "email": "user@example.com"
}
```

**Success Response** (200):
```json
{
  "success": true,
  "message": "Sign-in link sent to your email. Please check your inbox."
}
```

**Error Responses**:

- **429 Too Many Requests**:
```json
{
  "error": "Too many sign-in attempts. Please try again in 1 hour."
}
```
*Rate limit: 3 attempts per email per hour*

- **400 Bad Request**:
```json
{
  "error": "Invalid email address"
}
```

- **500 Server Error**:
```json
{
  "error": "Failed to send sign-in link. Please try again."
}
```

### 2. Verify Sign-In Link

**Endpoint**: `POST /auth/passwordless/verify`

**Request Body**:
```json
{
  "email": "user@example.com",
  "link": "https://ethescrow-377c6.firebaseapp.com/__/auth/action?..."
}
```

**Success Response** (200):
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "uid": "firebase-uid",
    "email": "user@example.com",
    "displayName": "User Name",
    "walletAddress": "0x1234...",
    "createdAt": "2024-01-01T00:00:00Z"
  },
  "isNewUser": false
}
```

**Error Responses**:

- **400 Bad Request**:
```json
{
  "error": "Invalid or expired sign-in link"
}
```

- **401 Unauthorized**:
```json
{
  "error": "Email does not match the sign-in link"
}
```

## Frontend Implementation

### Step 1: Sign-In Form

```javascript
// Send magic link
const sendSignInLink = async (email) => {
  try {
    const response = await fetch(`${API_URL}/auth/passwordless/send-link`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email })
    });

    const data = await response.json();
    
    if (response.ok) {
      // Show success message
      // Redirect to email sent page
    } else {
      // Handle error (rate limit, invalid email, etc.)
    }
  } catch (error) {
    // Handle network error
  }
};
```

### Step 2: Email Action Handler

Create a route at `/auth/email-action` to handle the magic link callback:

```javascript
// This page handles the magic link redirect
const handleEmailAction = async () => {
  const link = window.location.href;
  const email = localStorage.getItem('emailForSignIn');
  
  if (!email) {
    // Prompt user to enter their email
    // This happens if they open the link on a different device
    return;
  }

  try {
    const response = await fetch(`${API_URL}/auth/passwordless/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email, link })
    });

    const data = await response.json();
    
    if (response.ok) {
      // Store JWT token
      localStorage.setItem('authToken', data.token);
      
      // Clear email from storage
      localStorage.removeItem('emailForSignIn');
      
      // Redirect to dashboard or onboarding
      if (data.isNewUser) {
        // Redirect to onboarding/profile setup
      } else {
        // Redirect to dashboard
      }
    } else {
      // Handle error (invalid link, expired, etc.)
    }
  } catch (error) {
    // Handle network error
  }
};
```

### Step 3: Store Email for Verification

Before sending the link, store the email:

```javascript
// Store email before sending link
localStorage.setItem('emailForSignIn', email);
```

## Email Template

Users receive a professionally branded email with:

- **Subject**: "Sign in to ClearHold"
- **Sender**: noreply@clearhold.app
- **Content**: 
  - ClearHold branding with gold accent
  - Clear call-to-action button
  - Security information
  - Link expiration notice (1 hour)
  - Mobile-responsive design

## Security Features

1. **Rate Limiting**: 3 sign-in attempts per email per hour
2. **Link Expiration**: Links expire after 1 hour
3. **One-Time Use**: Each link can only be used once
4. **Email Verification**: Email must match the one used to request the link
5. **JWT Token**: Successful sign-in returns a JWT for subsequent API calls

## User Experience Flow

### New User Sign-Up
1. User enters email
2. Receives magic link
3. Clicks link
4. Account automatically created
5. Redirected to profile setup

### Existing User Sign-In
1. User enters email
2. Receives magic link
3. Clicks link
4. Redirected to dashboard

### Cross-Device Sign-In
If user opens link on different device:
1. Prompt for email address
2. Verify email matches link
3. Complete sign-in

## Best Practices

1. **Email Storage**: Always store email in localStorage before sending link
2. **Loading States**: Show clear loading indicators during API calls
3. **Error Messages**: Display user-friendly error messages
4. **Success Feedback**: Clearly indicate when email has been sent
5. **Resend Option**: Allow users to resend link after cooldown period

## Testing Locally

For local development:
- Backend runs on `http://localhost:3000`
- Frontend typically on `http://localhost:5173`
- Both origins are whitelisted in CORS
- Emails are sent via configured SMTP (Gmail)

## Firebase Configuration

The backend uses Firebase project: `ethescrow-377c6`
- Authentication method: Email Link (Passwordless)
- Dynamic Links: Configured but will migrate before deprecation (Aug 2025)
- Continue URL: `https://clearhold.app/auth/email-action`

## Common Issues & Solutions

### Rate Limit Reached
- **Issue**: User hits 3 attempt limit
- **Solution**: Wait 1 hour or use different email

### Link Expired
- **Issue**: User clicks link after 1 hour
- **Solution**: Request new link

### Wrong Device
- **Issue**: User opens link on different device
- **Solution**: Prompt for email on action page

### Email Not Received
- **Issue**: Email in spam or delayed
- **Solution**: Check spam folder, whitelist noreply@clearhold.app

## API Authentication

After successful sign-in, include JWT in subsequent requests:

```javascript
headers: {
  'Authorization': `Bearer ${token}`,
  'Content-Type': 'application/json'
}
```

## Migration from Password-Based Auth

Existing users can use passwordless authentication immediately. Their accounts remain unchanged, only the authentication method differs.