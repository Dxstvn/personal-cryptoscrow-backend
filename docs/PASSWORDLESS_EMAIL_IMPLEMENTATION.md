# Passwordless Email Implementation with Firebase Cloud Functions

## Overview
This implementation provides a complete passwordless email authentication system using Firebase Cloud Functions with ClearHold's brand design guidelines.

## What's Been Implemented

### 1. Cloud Functions Structure
```
functions/
├── index.js                    # Main Cloud Function
├── package.json               # Dependencies
├── emailTemplates/
│   └── passwordlessEmail.js   # Branded email template
├── setup.sh                   # Automated setup script
├── DEPLOYMENT_GUIDE.md        # Deployment instructions
└── .env.example              # Environment configuration example
```

### 2. Branded Email Template
The email template (`emailTemplates/passwordlessEmail.js`) follows ClearHold's brand guidelines:

- **Colors**: Deep Teal (#1A3C34) and Soft Gold (#D4AF37)
- **Typography**: Montserrat for headings, Open Sans for body
- **Mobile-responsive**: Optimized for all devices
- **Security notices**: Clear security information
- **Professional design**: Clean, trustworthy appearance

### 3. Email Service Support
The Cloud Function supports multiple email services:

1. **Gmail** (Development/Testing)
   - Uses app passwords
   - Quick setup for development

2. **SendGrid** (Recommended for Production)
   - Professional email delivery
   - Advanced analytics

3. **AWS SES** (Alternative for Production)
   - Cost-effective at scale
   - AWS integration

4. **Custom SMTP**
   - Any SMTP provider
   - Full control

### 4. Backend Integration
The `emailLinkService.js` has been updated to use Cloud Functions when enabled:

```javascript
// Enable in .env
USE_CLOUD_FUNCTIONS=true
FIREBASE_FUNCTIONS_URL=https://[region]-[project].cloudfunctions.net/sendPasswordlessEmail
```

## Quick Start

### 1. Run Setup Script
```bash
cd functions
./setup.sh
```

This interactive script will:
- Install Firebase CLI
- Configure email service
- Deploy functions
- Provide testing instructions

### 2. Manual Setup
If you prefer manual setup:

```bash
# Install dependencies
cd functions
npm install

# Configure email service (example for Gmail)
firebase functions:config:set \
  gmail.email="your-email@gmail.com" \
  gmail.password="your-app-password" \
  email.from="noreply@clearhold.com"

# Deploy
firebase deploy --only functions
```

### 3. Enable in Backend
Update your backend `.env`:
```
USE_CLOUD_FUNCTIONS=true
```

## Testing

### Test HTTP Endpoint
```bash
curl -X POST https://[region]-[project].cloudfunctions.net/sendPasswordlessEmailHttp \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}'
```

### Test from Backend
The passwordless routes will automatically use Cloud Functions when enabled.

## Email Preview

The branded email includes:
- ClearHold logo and tagline
- Clear sign-in button
- Security information
- Mobile-responsive design
- Alternative text link
- Support links in footer

## Security Features

1. **Link expiration**: 1 hour
2. **One-time use**: Links can only be used once
3. **Email masking**: Logs mask email addresses
4. **Rate limiting**: Built into backend
5. **Error handling**: User-friendly error messages

## Monitoring

### View Logs
```bash
firebase functions:log --only sendPasswordlessEmail
```

### Firebase Console
- View execution metrics
- Set up alerts
- Monitor errors

## Production Checklist

- [ ] Choose production email service (SendGrid/SES)
- [ ] Verify sender domain
- [ ] Configure SPF/DKIM records
- [ ] Test on multiple email clients
- [ ] Set up monitoring alerts
- [ ] Configure backup email service
- [ ] Test rate limiting
- [ ] Review security settings

## Cost Considerations

- **Firebase Functions**: First 2M invocations/month free
- **Email costs**: Varies by service
  - Gmail: Free (limited volume)
  - SendGrid: 100 emails/day free
  - AWS SES: $0.10 per 1000 emails

## Troubleshooting

### Email Not Sending
1. Check function logs: `firebase functions:log`
2. Verify email service configuration
3. Check sender domain verification
4. Review Firebase quotas

### Function Not Deploying
1. Check Node.js version (must be 18)
2. Verify Firebase authentication
3. Check project permissions

### CORS Errors
- HTTP endpoint includes CORS headers
- For production, use callable function

## Next Steps

1. Deploy the Cloud Function
2. Configure your preferred email service
3. Test with real email addresses
4. Monitor delivery rates
5. Set up email analytics

The implementation is now complete and ready for deployment!