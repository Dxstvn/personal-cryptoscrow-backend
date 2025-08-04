# Email Verification Implementation Plan

## Overview
This document outlines the implementation plan for adding email verification to the ClearHold platform's existing sign-up functionality using Firebase Authentication.

## Phase 1: Backend Integration

### 1.1 Update User Registration Flow (`src/api/routes/auth/register.js`)

**Modify existing registration endpoint:**
- After `createUserWithEmailAndPassword`
- Call `sendEmailVerification(user)` immediately
- Firebase automatically tracks verification status (no need to manually set)
- Return success with verification prompt
- Note: `user.emailVerified` property is automatically managed by Firebase

### 1.2 Create Verification Service (`src/services/emailVerificationService.js`)

**Core functionality:**
- `sendVerificationEmail(user)` - Wrapper for Firebase's `sendEmailVerification()`
- `checkVerificationStatus(user)` - Check `user.emailVerified` after calling `user.reload()`
- `resendVerificationEmail(user)` - Handle resend with Firebase's built-in rate limiting
- `refreshUserToken(user)` - Force token refresh after verification with `user.getIdToken(true)`
- Note: Firebase automatically updates verification status - no manual callback needed

### 1.3 Add Verification Middleware

```javascript
// middleware/requireVerifiedEmail.js
```
- Check `user.emailVerified` on protected routes
- Return 403 with verification reminder
- Allow access to profile/verification pages
- Whitelist certain routes for unverified users

## Phase 2: Frontend Implementation

### 2.1 Email Verification Banner Component

```typescript
// components/auth/EmailVerificationBanner.tsx
```
- Persistent banner for unverified users
- "Resend Email" button with cooldown
- Success toast on email sent
- Auto-refresh verification status
- Dismiss option with localStorage persistence

### 2.2 Verification Success Page

```typescript
// pages/auth/verify-success.tsx
```
- Success animation/illustration
- Welcome message with user's name
- CTA to complete profile or start escrow
- Auto-redirect after 5 seconds

### 2.3 Update Protected Routes
- Check verification status on mount
- Refresh user object with `await user.reload()` to get latest status
- Force token refresh if verified: `await user.getIdToken(true)`
- Redirect unverified users to verification prompt
- Allow limited access (view-only mode)
- Show verification banner on allowed pages

## Phase 3: Email Template Design

### 3.1 Verification Email Template

**Note:** Firebase provides limited email template customization through the Firebase Console. For full HTML customization, consider using Firebase Extensions or integrating a third-party email service.

**Firebase Console Template Settings:**
- Navigate to: Authentication > Templates > Email address verification
- Subject Line: "Verify your ClearHold account"
- Sender Name: "ClearHold"

**Template Variables Available:**
- `%DISPLAY_NAME%` - User's display name
- `%EMAIL%` - User's email address
- `%LINK%` - Verification link

**Basic Template Structure (Firebase Console):**
```
Hi %DISPLAY_NAME%,

Welcome to ClearHold! Please verify your email address to secure your account and start creating escrow deals.

Click here to verify: %LINK%

This link will expire in 24 hours for security reasons.

If you didn't create a ClearHold account, please ignore this email.

Best regards,
The ClearHold Team
```

**For Full HTML Customization:**
Consider using:
1. Firebase Extensions (e.g., Trigger Email extension)
2. SendGrid, Mailgun, or other email service integration
3. Cloud Functions to send custom emails

### 3.2 Design Specifications

**Layout:**
- Mobile-responsive (max-width: 600px)
- Center-aligned container
- White background with light gray (#F5F5F5) page background

**Typography:**
- Headings: Montserrat, 24px, #1A3C34
- Body text: Open Sans, 16px, #374151
- Small text: Open Sans, 14px, #9CA3AF

**Spacing:**
- Section padding: 32px
- Element spacing: 16px
- Button margin: 24px top/bottom

**Brand Elements:**
- Logo height: 48px
- Accent line: 2px solid #D4AF37
- Shadow on button: 0 2px 4px rgba(0,0,0,0.1)

## Phase 4: User Flow & States

### 4.1 Verification States

**Unverified State:**
- Limited access to platform
- Persistent verification banner
- Cannot create escrow deals
- Can view public content only

**Pending Verification:**
- Email sent confirmation
- Resend button with 60-second cooldown
- Help text for email delivery issues

**Verified State:**
- Full platform access
- Verification badge on profile
- No verification prompts

### 4.2 Reminder Strategy

**24 Hours After Registration:**
- Send reminder email if unverified
- Include direct verification link
- Highlight benefits of verification

**48 Hours After Registration:**
- Final reminder email
- Warning about potential account limitations
- Clear CTA to verify

**7 Days After Registration:**
- Account limitation notice
- Verification required to continue
- Option to contact support

## Phase 5: Technical Implementation

### 5.1 Database Schema Updates

```javascript
// users collection update
{
  email: string,
  emailVerified: boolean,
  emailVerificationSentAt: timestamp,
  emailVerificationAttempts: number,
  verificationCompletedAt: timestamp,
  accountStatus: 'unverified' | 'verified' | 'suspended'
}
```

### 5.2 API Endpoints

**GET /api/auth/verification-status**
- Call `user.reload()` to get latest status from Firebase
- Return `user.emailVerified` status
- Include resend availability based on Firebase rate limits

**POST /api/auth/resend-verification**
- Call `sendEmailVerification(user)` again
- Firebase automatically handles rate limiting
- Return appropriate error if rate limit exceeded
- No need for custom timestamp tracking

**Note:** No verify-callback endpoint needed - Firebase automatically updates `emailVerified` when user clicks the link

### 5.3 Security Considerations

- Firebase provides built-in rate limiting for email verification
- Additional custom rate limiting can be layered on top
- Log all verification attempts for monitoring
- Monitor for abuse patterns
- Consider CAPTCHA after multiple failed attempts
- Firebase automatically prevents email enumeration attacks

## Phase 6: Monitoring & Analytics

### 6.1 Key Metrics to Track

**Verification Metrics:**
- Verification email delivery rate
- Time to verification (median/average)
- Verification completion rate
- Resend email frequency
- Drop-off rate by time period

**User Behavior:**
- Actions attempted while unverified
- Most common verification issues
- Support tickets related to verification

### 6.2 Dashboard Implementation
- Real-time verification statistics
- Daily/weekly/monthly trends
- Cohort analysis by registration source
- Email deliverability monitoring

## Implementation Code Examples

### Backend Implementation
```javascript
// src/services/emailVerificationService.js
const { getAuth } = require('firebase-admin/auth');
const { sendEmailVerification } = require('firebase/auth');

class EmailVerificationService {
  async sendVerificationEmail(user) {
    try {
      await sendEmailVerification(user);
      return { success: true, message: 'Verification email sent' };
    } catch (error) {
      if (error.code === 'auth/too-many-requests') {
        throw new Error('Too many requests. Please try again later.');
      }
      throw error;
    }
  }

  async checkVerificationStatus(user) {
    // Reload user to get latest status
    await user.reload();
    return {
      isVerified: user.emailVerified,
      email: user.email
    };
  }

  async refreshUserToken(user) {
    if (user.emailVerified) {
      // Force token refresh to update claims
      const newToken = await user.getIdToken(true);
      return newToken;
    }
    return null;
  }
}
```

### Frontend Implementation
```typescript
// components/auth/EmailVerificationBanner.tsx
import { useState, useEffect } from 'react';
import { sendEmailVerification } from 'firebase/auth';
import { useAuth } from '@/contexts/AuthContext';

export function EmailVerificationBanner() {
  const { user } = useAuth();
  const [sending, setSending] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    const interval = setInterval(async () => {
      if (user && !user.emailVerified) {
        await user.reload();
        if (user.emailVerified) {
          // Force token refresh
          await user.getIdToken(true);
          // Reload page or update UI
          window.location.reload();
        }
      }
    }, 5000); // Check every 5 seconds

    return () => clearInterval(interval);
  }, [user]);

  const handleResend = async () => {
    setSending(true);
    try {
      await sendEmailVerification(user);
      setCooldown(60); // 60 second cooldown
      toast.success('Verification email sent!');
    } catch (error) {
      if (error.code === 'auth/too-many-requests') {
        toast.error('Too many attempts. Please try again later.');
      }
    } finally {
      setSending(false);
    }
  };

  if (!user || user.emailVerified) return null;

  return (
    <div className="bg-amber-50 border-amber-200 p-4">
      <p>Please verify your email address to access all features.</p>
      <button 
        onClick={handleResend}
        disabled={sending || cooldown > 0}
        className="mt-2 px-4 py-2 bg-teal-600 text-white rounded"
      >
        {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend Email'}
      </button>
    </div>
  );
}
```

### Registration Flow Update
```javascript
// src/api/routes/auth/register.js
const { createUserWithEmailAndPassword, sendEmailVerification } = require('firebase/auth');

router.post('/register', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Create user
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    
    // Send verification email immediately
    await sendEmailVerification(userCredential.user);
    
    // Create user profile in Firestore
    await db.collection('users').doc(userCredential.user.uid).set({
      email,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      emailVerified: false // This will be synced with Firebase Auth
    });
    
    res.status(201).json({
      success: true,
      message: 'Account created! Please check your email to verify your account.',
      requiresVerification: true
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});
```

## Implementation Timeline

### Week 1-2: Backend Development
- Implement verification service
- Update registration flow
- Create verification middleware
- Set up email templates in Firebase

### Week 3: Frontend Integration
- Build verification components
- Integrate with backend APIs
- Implement verification flows
- Add state management

### Week 4: Testing & Refinement
- End-to-end testing
- Email deliverability testing
- Cross-browser testing
- UX improvements based on feedback

### Week 5: Deployment & Monitoring
- Staged rollout to subset of users
- Monitor metrics and adjust
- Full production deployment
- Set up alerting for issues

## Success Criteria

- 95%+ email delivery rate
- 80%+ verification rate within 24 hours
- < 2% support tickets related to verification
- < 30 seconds average time to verify
- 99.9% uptime for verification service

## Error Handling

### Common Issues & Solutions

**Email Not Received:**
- Check spam folder prompt
- Resend option after 60 seconds
- Alternative email option
- Support contact for persistent issues

**Link Expired:**
- Clear error message
- One-click resend option
- Explanation of security reasons

**Already Verified:**
- Redirect to dashboard
- Success message
- Clear next steps

**Technical Errors:**
- Graceful fallback
- Error logging
- User-friendly messages
- Support contact option