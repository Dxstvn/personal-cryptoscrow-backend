# Passwordless Login Implementation Plan

## Overview
This document outlines the implementation plan for adding passwordless email link authentication to the ClearHold platform using Firebase Authentication.

## Phase 1: Backend Setup (API Routes)

### 1.1 Create Email Link Service (`src/services/emailLinkService.js`)

**Core functionality:**
- `sendSignInLink(email, actionCodeSettings)` - Send sign-in link using Firebase
- `isValidSignInLink(link)` - Check if URL is a valid sign-in link using Firebase's `isSignInWithEmailLink()`
- `completeSignIn(email, link)` - Complete sign-in using `signInWithEmailLink()`
- `configureActionCodeSettings(returnUrl)` - Configure action code settings
- `verifyUserToken(idToken)` - Verify Firebase ID token using Admin SDK

### 1.2 Create API Routes (`src/api/routes/auth/passwordless.js`)

**POST /api/auth/passwordless/send-link**
- Validate email format
- Check if user exists or create placeholder
- Generate secure action code settings
- Send email link via Firebase
- Log attempt in database

**POST /api/auth/passwordless/verify-token**
- Receive Firebase ID token from client after successful sign-in
- Verify token using Firebase Admin SDK's `verifyIdToken()`
- Create/update user profile in Firestore
- Generate and return custom JWT token for API access
- Note: Client handles the actual link validation and sign-in

### 1.3 Update Email Templates
- Create branded HTML template for passwordless login
- Include ClearHold logo and brand colors
- Clear CTA button with deep teal background (#1A3C34)
- Security notice about one-time use

## Phase 2: Frontend Implementation

### 2.1 Passwordless Login Component
```typescript
// components/auth/PasswordlessLogin.tsx
```
- Email input form
- Loading states during email send
- Success message with email check prompt
- Error handling for invalid emails

### 2.2 Email Link Handler Page
```typescript
// pages/auth/email-action.tsx
```
- Use `isSignInWithEmailLink(auth, window.location.href)` to detect valid link
- Retrieve stored email from localStorage or prompt user
- Complete authentication with `signInWithEmailLink(auth, email, window.location.href)`
- Send ID token to backend `/api/auth/passwordless/verify-token`
- Handle Firebase-specific errors (e.g., `auth/invalid-action-code`, `auth/expired-action-code`)
- Clear stored email and redirect to dashboard on success

### 2.3 Update Auth Context
- Add passwordless methods
- Handle email storage in localStorage
- Update authentication flow

## Phase 3: Security & UX Enhancements

### 3.1 Security Measures
- Rate limiting on email sends (max 3 per hour)
- IP-based throttling
- Email domain validation
- Secure token generation
- HTTPS-only links
- One-time use enforcement

### 3.2 User Experience
- "Check your email" animation/illustration
- Resend email option (after 60 seconds)
- Different device handling
- Deep linking for mobile apps
- Clear error messages
- Progress indicators

## Phase 4: Technical Implementation Details

### 4.1 Action Code Settings Configuration
```javascript
const actionCodeSettings = {
  // The URL where the user will be redirected after clicking the link
  url: 'https://app.clearhold.com/auth/email-action',
  // This must be true for email link sign-in
  handleCodeInApp: true,
  // iOS and Android app configuration (optional)
  iOS: {
    bundleId: 'com.clearhold.ios'
  },
  android: {
    packageName: 'com.clearhold.android',
    installApp: true,
    minimumVersion: '12'
  }
  // Note: dynamicLinkDomain removed due to Firebase Dynamic Links deprecation
};
```

### 4.2 Email Storage Strategy
- Use localStorage for same-device flows
- Implement email confirmation prompt for different devices
- Clear stored email after successful authentication
- Handle browser privacy modes

### 4.3 Error Handling

**Firebase-Specific Error Codes:**
- `auth/invalid-email` - Invalid email format
- `auth/invalid-action-code` - Invalid or malformed link
- `auth/expired-action-code` - Link has expired
- `auth/user-disabled` - User account is disabled
- `auth/argument-error` - Missing required parameters
- `auth/network-request-failed` - Network connectivity issues

**Custom Error Handling:**
- Rate limit exceeded (implement custom tracking)
- Email not matching stored email
- Different device authentication flow

## Phase 5: Implementation Code Examples

### 5.1 Backend Service Implementation
```javascript
// src/services/emailLinkService.js
const { getAuth } = require('firebase-admin/auth');
const { auth } = require('firebase/auth');

class EmailLinkService {
  async sendSignInLink(email, actionCodeSettings) {
    try {
      // Using Firebase Client SDK (for frontend) or Admin SDK (for backend)
      await auth.sendSignInLinkToEmail(auth, email, actionCodeSettings);
      return { success: true };
    } catch (error) {
      console.error('Error sending sign-in link:', error);
      throw error;
    }
  }

  async verifyUserToken(idToken) {
    try {
      const decodedToken = await getAuth().verifyIdToken(idToken);
      return decodedToken;
    } catch (error) {
      console.error('Error verifying token:', error);
      throw error;
    }
  }
}
```

### 5.2 Frontend Implementation
```typescript
// pages/auth/email-action.tsx
import { isSignInWithEmailLink, signInWithEmailLink } from 'firebase/auth';

useEffect(() => {
  if (isSignInWithEmailLink(auth, window.location.href)) {
    let email = window.localStorage.getItem('emailForSignIn');
    
    if (!email) {
      // Prompt user for email
      email = window.prompt('Please provide your email for confirmation');
    }
    
    signInWithEmailLink(auth, email, window.location.href)
      .then(async (result) => {
        window.localStorage.removeItem('emailForSignIn');
        
        // Get ID token and send to backend
        const idToken = await result.user.getIdToken();
        const response = await fetch('/api/auth/passwordless/verify-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken })
        });
        
        if (response.ok) {
          router.push('/dashboard');
        }
      })
      .catch((error) => {
        // Handle specific Firebase errors
        if (error.code === 'auth/invalid-action-code') {
          setError('This sign-in link is invalid or has expired.');
        }
      });
  }
}, []);
```

## Phase 6: Testing Strategy

### 5.1 Unit Tests
- Email validation logic
- Action code settings generation
- Link validation logic

### 5.2 Integration Tests
- End-to-end email sending flow
- Link verification process
- Cross-device authentication
- Rate limiting behavior

### 5.3 Security Tests
- Link expiration
- One-time use enforcement
- XSS prevention
- CSRF protection

## Implementation Timeline

### Week 1: Backend Development
- Implement email link service
- Create API routes
- Set up rate limiting

### Week 2: Frontend Development
- Build login component
- Create email action handler
- Update auth context

### Week 3: Email Templates & Testing
- Design and implement email templates
- Conduct thorough testing
- Security review

### Week 4: Deployment & Monitoring
- Deploy to staging environment
- Monitor email delivery rates
- Gather user feedback
- Production deployment

## Success Metrics

- Email delivery rate > 99%
- Link click-through rate > 80%
- Authentication success rate > 95%
- Time to complete authentication < 2 minutes
- User satisfaction score > 4.5/5

## Considerations

### Firebase Dynamic Links Deprecation
Firebase Dynamic Links will be shut down on August 25, 2025. This implementation uses direct URLs instead of Dynamic Links, making it future-proof. For mobile app deep linking, consider using:
- iOS: Universal Links
- Android: App Links
- Cross-platform: Branch.io or similar services

### Localhost Development
For projects created after April 28, 2025, localhost is not included as an authorized domain by default. Add it manually in Firebase Console for development.

### Email Deliverability
- Use proper SPF, DKIM, and DMARC records
- Monitor email reputation
- Implement email warm-up if needed
- Consider using a dedicated email service for better deliverability