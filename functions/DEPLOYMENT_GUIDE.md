# Firebase Cloud Functions Deployment Guide

## Prerequisites

1. **Firebase CLI**: Install globally if not already installed
   ```bash
   npm install -g firebase-tools
   ```

2. **Firebase Project**: Ensure you have a Firebase project created

3. **Authentication**: Login to Firebase
   ```bash
   firebase login
   ```

## Initial Setup

1. **Initialize Functions** (if not already done):
   ```bash
   cd /path/to/personal-cryptoscrow-backend
   firebase init functions
   ```
   - Select your Firebase project
   - Choose JavaScript
   - Do NOT overwrite existing files

2. **Install Dependencies**:
   ```bash
   cd functions
   npm install
   ```

## Configuration

### Set Environment Variables

Firebase Functions uses environment configuration for sensitive data.

#### Option 1: Gmail (Development/Testing)
```bash
firebase functions:config:set gmail.email="your-email@gmail.com" \
  gmail.password="your-app-password" \
  email.from="noreply@clearhold.com" \
  app.url="https://app.clearhold.com/auth/email-action"
```

#### Option 2: SendGrid (Recommended for Production)
```bash
firebase functions:config:set email.service="sendgrid" \
  sendgrid.api_key="your-sendgrid-api-key" \
  email.from="noreply@clearhold.com" \
  app.url="https://app.clearhold.com/auth/email-action"
```

#### Option 3: AWS SES (Alternative for Production)
```bash
firebase functions:config:set email.service="ses" \
  aws.region="us-east-1" \
  aws.access_key_id="your-access-key" \
  aws.secret_access_key="your-secret-key" \
  email.from="noreply@clearhold.com" \
  app.url="https://app.clearhold.com/auth/email-action"
```

#### Option 4: Custom SMTP
```bash
firebase functions:config:set email.service="smtp" \
  smtp.host="smtp.your-provider.com" \
  smtp.port="587" \
  smtp.secure="false" \
  smtp.user="your-username" \
  smtp.password="your-password" \
  email.from="noreply@clearhold.com" \
  app.url="https://app.clearhold.com/auth/email-action"
```

### View Current Configuration
```bash
firebase functions:config:get
```

## Email Service Setup

### Gmail Setup (Development)
1. Enable 2-factor authentication on your Gmail account
2. Generate an App Password:
   - Go to Google Account settings
   - Security > 2-Step Verification > App passwords
   - Generate a password for "Mail"
3. Use this app password in the configuration

### SendGrid Setup (Production)
1. Create a SendGrid account
2. Verify your sender domain
3. Create an API key with "Mail Send" permissions
4. Add the API key to Firebase config

### AWS SES Setup (Production)
1. Verify your domain in AWS SES
2. Move out of sandbox mode for production
3. Create IAM credentials with SES send permissions
4. Add credentials to Firebase config

## Deployment

### Deploy Functions Only
```bash
firebase deploy --only functions
```

### Deploy Specific Function
```bash
firebase deploy --only functions:sendPasswordlessEmail
```

### Test Deployment
```bash
# For development, you can test the HTTP endpoint:
curl -X POST https://[YOUR-REGION]-[YOUR-PROJECT].cloudfunctions.net/sendPasswordlessEmailHttp \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}'
```

## Local Testing

1. **Start Functions Emulator**:
   ```bash
   cd functions
   npm run serve
   ```

2. **Set Local Config** (for emulator):
   ```bash
   firebase functions:config:get > .runtimeconfig.json
   ```

3. **Test Locally**:
   The function will be available at:
   ```
   http://localhost:5001/[YOUR-PROJECT]/us-central1/sendPasswordlessEmail
   ```

## Monitoring

### View Logs
```bash
firebase functions:log
```

### View Specific Function Logs
```bash
firebase functions:log --only sendPasswordlessEmail
```

### Firebase Console
- Go to Firebase Console > Functions
- View execution count, errors, and performance
- Set up alerts for failures

## Troubleshooting

### Common Issues

1. **"Permission Denied"**
   - Ensure you're logged in: `firebase login`
   - Check project permissions in Firebase Console

2. **"Function deployment failed"**
   - Check Node.js version (should be 18)
   - Review function logs for syntax errors
   - Ensure all dependencies are in package.json

3. **"Email not sending"**
   - Verify email service configuration
   - Check function logs for specific errors
   - Ensure sender domain is verified (for production)

4. **"CORS errors"**
   - The HTTP endpoint includes CORS headers
   - For callable functions, use Firebase SDK

## Security Best Practices

1. **Never commit `.runtimeconfig.json`** - Add to .gitignore
2. **Use Firebase config** for all sensitive data
3. **Implement rate limiting** in production
4. **Monitor for unusual activity**
5. **Keep dependencies updated**

## Production Checklist

- [ ] Email service configured (SendGrid/SES)
- [ ] Sender domain verified
- [ ] SPF/DKIM records configured
- [ ] Error alerting set up
- [ ] Rate limiting implemented
- [ ] Monitoring dashboard created
- [ ] Backup email service configured
- [ ] Email templates tested on multiple clients

## Cost Optimization

- Firebase Functions: First 2M invocations/month free
- Monitor usage in Firebase Console
- Implement caching where possible
- Use regional deployments for lower latency

## Next Steps

1. Update backend code to use the deployed function
2. Test with real email addresses
3. Monitor delivery rates
4. Set up email analytics
5. Implement bounce handling