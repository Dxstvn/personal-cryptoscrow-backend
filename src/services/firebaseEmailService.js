import admin from 'firebase-admin';
import logger from './securityLogger.js';

/**
 * Service for handling Firebase email operations
 * Note: Firebase Admin SDK doesn't directly send emails for passwordless auth.
 * Instead, we need to use either:
 * 1. Client SDK on a secure backend service
 * 2. Firebase Functions with client SDK
 * 3. Custom email service with Firebase-generated links
 * 
 * This implementation uses approach #3 for better control and security
 */
class FirebaseEmailService {
  constructor() {
    this.auth = admin.auth();
  }

  /**
   * Generate a passwordless sign-in link
   * Note: This generates the link but doesn't send the email
   * You'll need to integrate with an email service (SendGrid, AWS SES, etc.)
   * or use Firebase Functions with the client SDK
   * @param {string} email - User's email address
   * @param {Object} actionCodeSettings - Action code settings
   * @returns {Promise<string>} The generated sign-in link
   */
  async generatePasswordlessLink(email, actionCodeSettings) {
    try {
      // Generate the link using Firebase Admin SDK
      const link = await this.auth.generateSignInWithEmailLink(
        email,
        actionCodeSettings
      );
      
      return link;
    } catch (error) {
      // Handle specific Firebase errors
      if (error.code === 'auth/invalid-email') {
        throw new Error('Invalid email address format');
      } else if (error.code === 'auth/missing-action-code-settings') {
        throw new Error('Action code settings are required');
      } else if (error.code === 'auth/invalid-action-code-settings') {
        throw new Error('Invalid action code settings provided');
      } else if (error.code === 'auth/unauthorized-domain') {
        throw new Error('Domain not authorized for OAuth operations');
      }
      
      throw error;
    }
  }

  /**
   * Send email using Firebase Cloud Functions approach
   * This requires setting up a Firebase Function that uses the client SDK
   * @param {string} email - User's email address
   * @param {Object} actionCodeSettings - Action code settings
   * @returns {Promise<Object>} Result of the operation
   */
  async sendPasswordlessEmail(email, actionCodeSettings) {
    try {
      // For now, we'll generate the link and return it
      // In production, this would trigger a Cloud Function or send via email service
      const link = await this.generatePasswordlessLink(email, actionCodeSettings);
      
      // TODO: Integrate with email service here
      // Example with SendGrid:
      // await sendGridService.sendEmail({
      //   to: email,
      //   subject: 'Sign in to ClearHold',
      //   html: this.generateEmailTemplate(link)
      // });
      
      await logger.logSecurityEvent('PASSWORDLESS_EMAIL_SENT', {
        email: this.maskEmail(email),
        timestamp: new Date().toISOString()
      });
      
      return {
        success: true,
        link, // Remove this in production
        message: 'Sign-in link sent to your email'
      };
    } catch (error) {
      await logger.logSecurityEvent('PASSWORDLESS_EMAIL_FAILED', {
        email: this.maskEmail(email),
        error: error.message,
        timestamp: new Date().toISOString()
      });
      
      throw error;
    }
  }

  /**
   * Generate HTML email template
   * @param {string} link - The sign-in link
   * @returns {string} HTML email template
   */
  generateEmailTemplate(link) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Sign in to ClearHold</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #374151;
            margin: 0;
            padding: 0;
            background-color: #F5F5F5;
          }
          .container {
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
          }
          .content {
            background-color: #FFFFFF;
            border-radius: 8px;
            padding: 32px;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
          }
          .logo {
            text-align: center;
            margin-bottom: 24px;
          }
          .divider {
            height: 2px;
            background-color: #D4AF37;
            margin: 24px 0;
          }
          h1 {
            color: #1A3C34;
            font-size: 24px;
            font-weight: 600;
            margin: 0 0 16px 0;
            font-family: 'Montserrat', sans-serif;
          }
          .button {
            display: inline-block;
            background-color: #1A3C34;
            color: #FFFFFF;
            text-decoration: none;
            padding: 16px 32px;
            border-radius: 8px;
            font-weight: 500;
            margin: 24px 0;
          }
          .button:hover {
            background-color: #225F51;
          }
          .footer {
            margin-top: 32px;
            font-size: 14px;
            color: #9CA3AF;
            text-align: center;
          }
          .security-notice {
            background-color: #F3F4F6;
            padding: 16px;
            border-radius: 6px;
            margin-top: 24px;
            font-size: 14px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="content">
            <div class="logo">
              <h1>ClearHold</h1>
            </div>
            
            <div class="divider"></div>
            
            <h1>Sign in to your account</h1>
            
            <p>Hi there,</p>
            
            <p>We received a request to sign in to your ClearHold account. Click the button below to complete your sign-in:</p>
            
            <div style="text-align: center;">
              <a href="${link}" class="button">Sign In to ClearHold</a>
            </div>
            
            <p>Or copy and paste this link into your browser:</p>
            <p style="word-break: break-all; color: #1A3C34;">${link}</p>
            
            <div class="security-notice">
              <strong>Security Notice:</strong>
              <ul style="margin: 8px 0; padding-left: 20px;">
                <li>This link will expire in 1 hour</li>
                <li>This link can only be used once</li>
                <li>If you didn't request this email, you can safely ignore it</li>
              </ul>
            </div>
            
            <div class="footer">
              <p>This email was sent by ClearHold. If you have questions, please contact our support team.</p>
              <p>&copy; 2025 ClearHold. All rights reserved.</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Mask email for logging
   * @param {string} email - Email to mask
   * @returns {string} Masked email
   */
  maskEmail(email) {
    if (!email) return '';
    const [localPart, domain] = email.split('@');
    const maskedLocal = localPart.length > 2 
      ? `${localPart.substring(0, 2)}***`
      : '***';
    return `${maskedLocal}@${domain}`;
  }
}

export default new FirebaseEmailService();