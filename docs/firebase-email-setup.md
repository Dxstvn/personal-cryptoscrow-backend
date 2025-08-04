# Firebase Email Configuration for Passwordless Authentication

## Overview
Firebase provides email sending capabilities, but with some limitations. This guide explains how to set up email sending for passwordless authentication.

## Important Note: Firebase Email Limitations

**Firebase Admin SDK cannot directly send passwordless sign-in emails.** The `sendSignInLinkToEmail` method is only available in the Firebase Client SDK, not the Admin SDK. This means backend services need to use one of these approaches:

1. **Firebase Cloud Functions** (Recommended)
2. **External Email Service** (SendGrid, AWS SES, etc.)
3. **Development Mode** (Generate links without sending)

## Approach 1: Firebase Cloud Functions (Recommended)

### Step 1: Deploy the Cloud Function

1. Initialize Firebase Functions in your project:
```bash
firebase init functions
```

2. Copy the provided Cloud Function:
```bash
cp functions/sendPasswordlessEmail.js functions/index.js
```

3. Set configuration:
```bash
firebase functions:config:set client.api_key="YOUR_API_KEY" \
  client.auth_domain="YOUR_AUTH_DOMAIN" \
  client.project_id="YOUR_PROJECT_ID"
```

4. Deploy the function:
```bash
firebase deploy --only functions:sendPasswordlessEmail
```

### Step 2: Update Backend Code

Uncomment the Cloud Function code in `emailLinkService.js`:

```javascript
const functions = this.auth.app.functions();
const sendPasswordlessEmail = functions.httpsCallable('sendPasswordlessEmail');
const result = await sendPasswordlessEmail({ email, actionCodeSettings });
```

## Approach 2: External Email Service

### Using SendGrid

1. Install SendGrid:
```bash
npm install @sendgrid/mail
```

2. Create email service:
```javascript
import sgMail from '@sendgrid/mail';
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

async function sendPasswordlessEmail(email, link) {
  const msg = {
    to: email,
    from: 'noreply@clearhold.com',
    subject: 'Sign in to ClearHold',
    html: generateEmailTemplate(link)
  };
  await sgMail.send(msg);
}
```

### Using AWS SES

1. Install AWS SDK:
```bash
npm install @aws-sdk/client-ses
```

2. Configure and send emails using SES.

## Approach 3: Development Mode (Current Implementation)

The current implementation generates links but doesn't send emails. This is suitable for:
- Development and testing
- MVP/prototype phase
- Local development

Links are returned in the API response only in development mode.

## Firebase Console Email Template Configuration

While Firebase Console has email templates, they **cannot be used for passwordless authentication** from the backend. The templates are only for:
- Email verification
- Password reset
- Email address change

To customize these templates:

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select your project
3. Navigate to Authentication > Templates
4. Customize the templates (limited HTML support)

## Production Recommendations

1. **Use Firebase Cloud Functions** for seamless integration
2. **Set up proper email authentication** (SPF, DKIM, DMARC)
3. **Monitor email delivery rates**
4. **Implement email bounce handling**
5. **Add unsubscribe links** for compliance

## Email Template Design

The provided HTML template (`firebaseEmailService.js`) follows ClearHold brand guidelines:
- Deep Teal (#1A3C34) for primary elements
- Soft Gold (#D4AF37) for accents
- Montserrat font for headings
- Mobile-responsive design

## Security Considerations

1. **Link Expiration**: Links expire after 1 hour
2. **One-time Use**: Each link can only be used once
3. **Domain Whitelisting**: Configure authorized domains in Firebase Console
4. **Rate Limiting**: Implement rate limiting to prevent abuse

## Testing

### Local Testing
```bash
# Set environment variable
export NODE_ENV=development

# Test the endpoint
curl -X POST http://localhost:3000/auth/passwordless/send-link \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}'
```

### Production Testing
1. Deploy Cloud Function
2. Test with real email addresses
3. Monitor Firebase Functions logs
4. Check email delivery metrics

## Troubleshooting

### Common Issues

1. **"auth/unauthorized-domain"**
   - Add domain to Firebase Console > Authentication > Settings > Authorized domains

2. **"auth/missing-action-code-settings"**
   - Ensure actionCodeSettings includes required fields

3. **Email not received**
   - Check spam folder
   - Verify email service configuration
   - Check Firebase quotas

4. **"generateSignInWithEmailLink is not a function"**
   - This confirms you're using Admin SDK
   - Switch to Cloud Functions approach

## Next Steps

1. Choose your email sending approach
2. Configure email authentication (SPF/DKIM)
3. Test with real email addresses
4. Monitor delivery rates
5. Set up email analytics