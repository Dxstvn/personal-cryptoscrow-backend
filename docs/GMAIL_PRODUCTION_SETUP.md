# Gmail Production Setup Guide for ClearHold

## Overview
This guide explains how to properly configure Gmail for production use with passwordless authentication, including domain authentication to avoid spam filters.

## Option 1: Google Workspace (Recommended for Production)

### Benefits:
- Professional email address (noreply@clearhold.com)
- Better deliverability
- Full domain authentication support
- Higher sending limits
- Business support

### Setup Steps:

1. **Sign up for Google Workspace**
   - Go to https://workspace.google.com
   - Choose a plan (Business Starter is sufficient)
   - Add your domain (clearhold.com)

2. **Verify Domain Ownership**
   - Add TXT record provided by Google to your DNS

3. **Create Service Account**
   - Create user: noreply@clearhold.com
   - Enable 2-factor authentication
   - Generate app password

4. **Configure DNS Records**

## Option 2: Personal Gmail (Development/Low Volume)

### Setup Steps:

1. **Enable 2-Factor Authentication**
   - Go to https://myaccount.google.com/security
   - Enable 2-Step Verification

2. **Generate App Password**
   - Go to https://myaccount.google.com/apppasswords
   - Select "Mail" as the app
   - Copy the 16-character password

3. **Configure Firebase Functions**
   ```bash
   firebase functions:config:set \
     gmail.email="your-email@gmail.com" \
     gmail.password="your-16-char-app-password"
   ```

## Domain Authentication (Critical for Deliverability)

### 1. SPF Record
Add to your DNS as TXT record:
```
Name: @ (or leave blank)
Type: TXT
Value: v=spf1 include:_spf.google.com ~all
TTL: 3600
```

### 2. DKIM Setup (Google Workspace Only)
1. In Google Admin Console:
   - Apps → Google Workspace → Gmail
   - Authenticate email → Generate new record
2. Add the DKIM TXT record to DNS:
   ```
   Name: google._domainkey
   Type: TXT
   Value: [Long key provided by Google]
   TTL: 3600
   ```

### 3. DMARC Record
Add to your DNS as TXT record:
```
Name: _dmarc
Type: TXT
Value: v=DMARC1; p=none; rua=mailto:dmarc@clearhold.com
TTL: 3600
```

Start with `p=none`, then move to `p=quarantine` after testing.

### 4. Custom Return-Path (Advanced)
For personal Gmail, consider adding:
```
Name: mail
Type: TXT
Value: v=spf1 include:_spf.google.com ~all
```

## Email Best Practices for Better Deliverability

### 1. From Address
```javascript
// Good - matches authenticated domain
from: 'ClearHold <noreply@clearhold.com>'

// Okay - but less professional
from: 'ClearHold <clearhold.app@gmail.com>'

// Bad - mismatched domain
from: 'ClearHold <noreply@clearhold.com>' // when using personal Gmail
```

### 2. Email Headers
The Cloud Function already includes good practices:
- Proper From name
- Clear subject line
- HTML and text versions

### 3. Content Guidelines
- Avoid spam trigger words
- Include physical address (in footer)
- Add unsubscribe link (for marketing emails)
- Keep image-to-text ratio balanced

## Testing Email Deliverability

### 1. Mail Tester
Send a test email to: https://www.mail-tester.com
- Checks SPF, DKIM, DMARC
- Analyzes spam score
- Provides improvement suggestions

### 2. Google Postmaster Tools
- Sign up at: https://postmaster.google.com
- Add and verify your domain
- Monitor reputation and delivery issues

### 3. Check DNS Records
```bash
# Check SPF
dig TXT clearhold.com | grep spf

# Check DKIM
dig TXT google._domainkey.clearhold.com

# Check DMARC
dig TXT _dmarc.clearhold.com
```

## Gmail SMTP Configuration

### For Personal Gmail:
```javascript
{
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: 'your-email@gmail.com',
    pass: 'your-app-password' // 16-character app password
  }
}
```

### For Google Workspace:
```javascript
{
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: 'noreply@clearhold.com',
    pass: 'your-app-password'
  }
}
```

## Monitoring and Limits

### Gmail Sending Limits:
- Personal Gmail: 500 emails/day
- Google Workspace: 2,000 emails/day
- Rate limit: ~20 emails/minute

### Monitor Usage:
1. Track daily email count in your database
2. Set up alerts at 80% of limit
3. Have backup email service ready

### Code to Track Usage:
```javascript
// Add to your emailLinkService.js
async trackEmailSent(email) {
  const today = new Date().toISOString().split('T')[0];
  const docRef = db.collection('email_usage').doc(today);
  
  await docRef.set({
    count: admin.firestore.FieldValue.increment(1),
    timestamp: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
  
  // Check if approaching limit
  const doc = await docRef.get();
  if (doc.data()?.count > 400) {
    console.warn('Approaching Gmail daily limit!');
  }
}
```

## Troubleshooting

### Emails Going to Spam:
1. Check mail-tester.com score
2. Verify all DNS records are correct
3. Ensure "from" address matches authentication
4. Check email content for spam triggers

### Authentication Failures:
1. Regenerate app password
2. Check 2FA is still enabled
3. Verify no security alerts on Google account
4. Try with "less secure app access" (not recommended)

### Rate Limiting:
1. Implement exponential backoff
2. Queue emails during high volume
3. Spread sends throughout the day
4. Consider upgrading to Google Workspace

## Production Checklist

- [ ] Domain DNS records configured (SPF, DKIM, DMARC)
- [ ] Google Workspace account (recommended) or Gmail with app password
- [ ] Email tracking implemented
- [ ] Rate limiting in place
- [ ] Monitoring alerts configured
- [ ] Tested with mail-tester.com (score >8/10)
- [ ] Backup email service identified
- [ ] Physical address in email footer
- [ ] Clear "from" name and address

## Next Steps

1. Choose Gmail type (Workspace vs Personal)
2. Configure DNS records
3. Generate app password
4. Update Firebase config
5. Test with mail-tester.com
6. Monitor initial sends carefully
7. Adjust based on deliverability

Remember: Start with a small volume and gradually increase to build sender reputation!