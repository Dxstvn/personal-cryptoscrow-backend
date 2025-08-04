# Google Workspace Alias Setup for ClearHold

## Your Configuration
- **Google Workspace Account**: `@jaspire.co`
- **Email Alias**: `noreply@clearhold.app`
- **Result**: Emails will show as coming from `noreply@clearhold.app` ✅

## Setup Steps

### 1. Generate App Password
1. Log into your Google Workspace account (`your-email@jaspire.co`)
2. Go to https://myaccount.google.com/apppasswords
3. Select "Mail" and generate password
4. Copy the 16-character password

### 2. Configure Firebase Functions

Run the setup script:
```bash
cd functions
firebase functions:config:set \
  gmail.email="your-email@jaspire.co" \
  gmail.password="your-16-char-app-password" \
  email.from="noreply@clearhold.app" \
  email.sender_name="ClearHold" \
  app.url="https://app.clearhold.com/auth/email-action"
```

**Important**: Use your PRIMARY email (`@jaspire.co`) for authentication, but the alias (`@clearhold.app`) for the "from" address.

### 3. DNS Configuration for clearhold.app

Since you're using an alias, you should set up DNS records for `clearhold.app` to improve deliverability:

#### SPF Record
Add this TXT record to `clearhold.app` DNS:
```
Type: TXT
Name: @ (or root)
Value: v=spf1 include:_spf.google.com ~all
TTL: 3600
```

#### DKIM Setup
1. In Google Workspace Admin Console:
   - Sign in with your `@jaspire.co` account
   - Go to Apps → Google Workspace → Gmail
   - Click "Authenticate email"
   - Select domain: `clearhold.app`
   - Generate new record
   
2. Add the DKIM record to `clearhold.app` DNS:
```
Type: TXT
Name: google._domainkey
Value: [Long key provided by Google]
TTL: 3600
```

#### DMARC Record
Add this TXT record to `clearhold.app` DNS:
```
Type: TXT
Name: _dmarc
Value: v=DMARC1; p=none; rua=mailto:dmarc@clearhold.app; pct=100
TTL: 3600
```

### 4. Verify Alias Configuration

In Google Workspace Admin:
1. Go to Users → Your User → User Information
2. Check "Email aliases" section
3. Ensure `noreply@clearhold.app` is listed

### 5. Test Email Sending

After deployment, test with:
```bash
curl -X POST https://us-central1-[PROJECT-ID].cloudfunctions.net/sendPasswordlessEmailHttp \
  -H "Content-Type: application/json" \
  -d '{"email":"your-test@example.com"}'
```

The email should arrive from:
```
From: ClearHold <noreply@clearhold.app>
```

## How It Works

When sending emails:
1. **Authentication**: Uses your `@jaspire.co` credentials
2. **From Address**: Shows as `noreply@clearhold.app`
3. **Reply-To**: Also set to `noreply@clearhold.app`
4. **SPF Pass**: Because Google's servers are authorized

## Troubleshooting

### "From address not allowed"
- Ensure the alias is properly set up in Google Workspace
- The alias domain must be verified in Google Workspace

### Emails going to spam
1. Complete all DNS records (SPF, DKIM, DMARC)
2. Test with https://www.mail-tester.com
3. Start with low volume to build reputation

### Authentication failures
- Use your primary `@jaspire.co` email for login
- Regenerate app password if needed
- Check 2FA is enabled on your account

## Best Practices

1. **Gradual Rollout**: Start with test emails to build reputation
2. **Monitor Bounces**: Set up bounce handling
3. **Track Metrics**: Monitor open rates and spam reports
4. **Consistent Sending**: Regular volume is better than spikes

## Example Configuration

```javascript
// Your Firebase config will look like:
{
  gmail: {
    email: "dustin@jaspire.co",  // Your primary account
    password: "xxxx xxxx xxxx xxxx"  // App password
  },
  email: {
    from: "noreply@clearhold.app",  // Your alias
    sender_name: "ClearHold"
  },
  app: {
    url: "https://app.clearhold.com/auth/email-action"
  }
}
```

## Next Steps

1. Set up DNS records for `clearhold.app`
2. Generate app password from your `@jaspire.co` account
3. Deploy the Cloud Function
4. Test email delivery
5. Monitor initial sends closely

Your setup with Google Workspace + alias is actually BETTER than personal Gmail because:
- Higher sending limits (2,000/day)
- Better deliverability
- Professional appearance
- Full DNS authentication support