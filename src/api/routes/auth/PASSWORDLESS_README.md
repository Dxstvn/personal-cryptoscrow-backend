# Passwordless Authentication Implementation

## Overview
This implementation provides passwordless email link authentication using Firebase Authentication, allowing users to sign in without passwords by clicking a secure link sent to their email.

## Implementation Details

### Backend Components

#### 1. Email Link Service (`/src/services/emailLinkService.js`)
- Handles Firebase email link generation and verification
- Manages user profiles and custom claims
- Provides security logging and email masking

Key methods:
- `sendSignInLink(email, customSettings)` - Generates and sends sign-in link
- `verifyUserToken(idToken)` - Verifies Firebase ID token
- `createOrUpdateUserProfile(decodedToken)` - Manages user profile
- `getUserByEmail(email)` - Checks if user exists
- `setCustomClaims(uid, claims)` - Sets custom user claims

#### 2. API Routes (`/src/api/routes/auth/passwordless.js`)

**POST `/auth/passwordless/send-link`**
- Sends sign-in link to user's email
- Rate limited to 3 attempts per hour
- Logs authentication attempts
- Returns success message (doesn't expose user existence)

**POST `/auth/passwordless/verify-token`**
- Verifies Firebase ID token after client-side authentication
- Creates or updates user profile in Firestore
- Returns custom JWT token for API access
- Logs successful authentication

**GET `/auth/passwordless/check-email`**
- Security endpoint that always returns success
- Prevents user enumeration attacks

**POST `/auth/passwordless/resend`**
- Resends sign-in link with stricter rate limiting
- Maximum 2 resends per hour

#### 3. Authentication Middleware Updates
The authentication middleware (`/src/api/middleware/authMiddleware.js`) now supports:
- Custom JWT tokens from passwordless authentication
- Firebase ID tokens (existing functionality)
- Test tokens for development

### Security Features

1. **Rate Limiting**
   - 3 email sends per hour per email address
   - 2 resends per hour (stricter limit)
   - IP-based tracking for additional security

2. **Email Security**
   - Email masking in logs (e.g., `te***@example.com`)
   - No user existence disclosure
   - One-time use links

3. **Token Security**
   - JWT tokens with 7-day expiration
   - Firebase ID token verification
   - Custom claims support

4. **Logging**
   - All authentication attempts logged
   - Security events tracked
   - Failed attempts monitored

### Configuration

Required environment variables:
```bash
# Frontend URL for email links
FRONTEND_URL=https://app.clearhold.com

# JWT secret for custom tokens
JWT_SECRET=your-secret-key

# Optional mobile app configuration
IOS_BUNDLE_ID=com.clearhold.ios
ANDROID_PACKAGE_NAME=com.clearhold.android
```

### Usage Example

#### 1. Send Sign-In Link
```bash
POST /auth/passwordless/send-link
Content-Type: application/json

{
  "email": "user@example.com"
}
```

Response:
```json
{
  "success": true,
  "message": "Sign-in link sent to your email. Please check your inbox."
}
```

#### 2. Verify Token (after user clicks link)
```bash
POST /auth/passwordless/verify-token
Content-Type: application/json

{
  "idToken": "firebase-id-token-from-client"
}
```

Response:
```json
{
  "success": true,
  "token": "custom-jwt-token",
  "user": {
    "uid": "user-id",
    "email": "user@example.com",
    "emailVerified": true
  }
}
```

### Frontend Integration

The frontend should:
1. Collect user's email
2. Call `/auth/passwordless/send-link`
3. Store email in localStorage: `window.localStorage.setItem('emailForSignIn', email)`
4. Handle the email action URL
5. Use Firebase SDK to complete sign-in
6. Send the resulting ID token to `/auth/passwordless/verify-token`
7. Store the returned JWT token for API calls

### Testing

Unit tests are provided in `/src/api/routes/auth/__tests__/unit/passwordless.unit.test.js`

Run tests:
```bash
npm test passwordless.unit.test.js
```

### Next Steps

1. **Email Service Integration**
   - Currently, the service generates links but doesn't send emails
   - Integrate with SendGrid, AWS SES, or other email service
   - Update `sendSignInLink` method to actually send emails

2. **Email Templates**
   - Create branded HTML email templates
   - Follow ClearHold design guidelines
   - Include security notices and support links

3. **Frontend Components**
   - Build passwordless login component
   - Create email action handler page
   - Update auth context for passwordless flow

4. **Monitoring**
   - Set up alerts for failed authentication attempts
   - Monitor rate limit violations
   - Track email delivery rates