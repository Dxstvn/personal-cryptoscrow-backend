import { getAuth } from 'firebase-admin/auth';
import logger from './securityLogger.js';
import { getAdminApp } from '../api/routes/auth/admin.js';

/**
 * Service for handling passwordless email link authentication
 * using Firebase Authentication
 */
class EmailLinkService {
  constructor() {
    this._auth = null;
    this.actionCodeSettings = this.configureActionCodeSettings();
  }
  
  /**
   * Get Firebase Auth instance (lazy-loaded)
   */
  async getFirebaseAuth() {
    if (!this._auth) {
      const adminApp = await getAdminApp(); // Ensure admin app is initialized
      this._auth = getAuth(adminApp); // Use the named app instance
    }
    return this._auth;
  }

  /**
   * Configure action code settings for email links
   * @param {string} returnUrl - Optional custom return URL
   * @returns {Object} Action code settings configuration
   */
  configureActionCodeSettings(returnUrl = null) {
    const baseUrl = process.env.FRONTEND_URL || 'https://clearhold.app';
    
    return {
      // The URL where the user will be redirected after clicking the link
      url: returnUrl || `https://clearhold.app/auth/email-action`,
      // This must be true for email link sign-in
      handleCodeInApp: true,
      // iOS app configuration (optional)
      iOS: {
        bundleId: process.env.IOS_BUNDLE_ID || 'com.clearhold.ios'
      },
      // Android app configuration (optional)
      android: {
        packageName: process.env.ANDROID_PACKAGE_NAME || 'com.clearhold.android',
        installApp: true,
        minimumVersion: '12'
      }
      // Note: dynamicLinkDomain removed due to Firebase Dynamic Links deprecation
    };
  }

  /**
   * Send a passwordless sign-in link to the user's email
   * This implementation provides multiple approaches:
   * 1. For development/testing: Generate link only (no email sent)
   * 2. For production: Use Firebase Cloud Function or email service
   * @param {string} email - User's email address
   * @param {Object} customSettings - Optional custom action code settings
   * @returns {Promise<Object>} Result of the operation
   */
  async sendSignInLink(email, customSettings = null) {
    try {
      // Validate email format
      if (!this.isValidEmail(email)) {
        throw new Error('Invalid email format');
      }

      // Use custom settings if provided, otherwise use default
      const actionCodeSettings = customSettings || this.actionCodeSettings;

      // Approach 1: Generate link using Admin SDK (for development/testing)
      const auth = await this.getFirebaseAuth();
      const link = await auth.generateSignInWithEmailLink(
        email,
        actionCodeSettings
      );

      // Approach 2: Use custom SMTP directly (most reliable)
      if (process.env.USE_CUSTOM_SMTP === 'true') {
        try {
          const customEmailService = await import('./customEmailService.js');
          await customEmailService.default.sendPasswordlessEmail(email, link);
          
          await logger.logSecurityEvent('PASSWORDLESS_EMAIL_SENT', {
            email: this.maskEmail(email),
            method: 'custom_smtp'
          });
          
          return {
            success: true,
            message: 'Sign-in link sent to your email',
            link: process.env.NODE_ENV === 'development' ? link : undefined
          };
        } catch (smtpError) {
          console.error('Custom SMTP failed:', smtpError);
          // Fall through to next option
        }
      }
      
      // Approach 3: Use Firebase Cloud Function (if custom SMTP fails)
      if (process.env.USE_CLOUD_FUNCTIONS === 'true') {
        try {
          // Using fetch to call the Cloud Function
          const functionUrl = process.env.FIREBASE_FUNCTIONS_URL || 
            `https://us-central1-${process.env.FIREBASE_PROJECT_ID}.cloudfunctions.net/sendPasswordlessEmail`;
          
          const response = await fetch(functionUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              data: { email, actionCodeSettings }
            })
          });
          
          const result = await response.json();
          
          if (result.result?.success) {
            await logger.logSecurityEvent('PASSWORDLESS_LINK_SENT', {
              email: this.maskEmail(email),
              timestamp: new Date().toISOString(),
              method: 'cloud-function'
            });
            
            return {
              success: true,
              message: 'Sign-in link sent successfully to your email'
            };
          } else {
            throw new Error(result.error?.message || 'Failed to send email');
          }
        } catch (cloudFunctionError) {
          console.error('Cloud Function error:', cloudFunctionError);
          // Fall through to generate link locally
        }
      }

      // Approach 3: Use external email service (e.g., SendGrid, AWS SES)
      // This would be implemented in firebaseEmailService.js

      // For now, return the generated link (development mode)
      // In production, remove the link from response
      await logger.logSecurityEvent('PASSWORDLESS_LINK_GENERATED', {
        email: this.maskEmail(email),
        timestamp: new Date().toISOString(),
        mode: 'development'
      });

      return {
        success: true,
        message: 'Sign-in link generated successfully',
        link: process.env.NODE_ENV === 'development' ? link : undefined
      };
    } catch (error) {
      await logger.logSecurityEvent('PASSWORDLESS_LINK_FAILED', {
        email: this.maskEmail(email),
        error: error.message,
        timestamp: new Date().toISOString()
      });

      // Provide user-friendly error messages
      if (error.code === 'auth/invalid-email') {
        throw new Error('Invalid email address format');
      } else if (error.code === 'auth/missing-action-code-settings') {
        throw new Error('Configuration error. Please contact support.');
      } else if (error.code === 'auth/unauthorized-domain') {
        throw new Error('Domain not authorized. Please contact support.');
      }

      throw error;
    }
  }

  /**
   * Verify a Firebase ID token after passwordless sign-in
   * @param {string} idToken - Firebase ID token
   * @returns {Promise<Object>} Decoded token with user information
   */
  async verifyUserToken(idToken) {
    try {
      if (!idToken) {
        throw new Error('ID token is required');
      }

      // Verify the ID token
      const auth = await this.getFirebaseAuth();
      const decodedToken = await auth.verifyIdToken(idToken);

      // Log successful verification
      await logger.logSecurityEvent('PASSWORDLESS_TOKEN_VERIFIED', {
        userId: decodedToken.uid,
        timestamp: new Date().toISOString()
      });

      return decodedToken;
    } catch (error) {
      await logger.logSecurityEvent('PASSWORDLESS_TOKEN_VERIFICATION_FAILED', {
        error: error.message,
        timestamp: new Date().toISOString()
      });

      throw error;
    }
  }

  /**
   * Create or update user profile after passwordless sign-in
   * @param {Object} decodedToken - Decoded Firebase token
   * @returns {Promise<Object>} User profile
   */
  async createOrUpdateUserProfile(decodedToken) {
    try {
      const { uid, email, email_verified } = decodedToken;

      // Get the user record from Firebase Auth
      const auth = await this.getFirebaseAuth();
      const userRecord = await auth.getUser(uid);

      // Prepare user data
      const userData = {
        uid,
        email,
        emailVerified: email_verified,
        signInProvider: userRecord.providerData[0]?.providerId || 'email',
        lastSignIn: new Date().toISOString(),
        metadata: {
          creationTime: userRecord.metadata.creationTime,
          lastSignInTime: userRecord.metadata.lastSignInTime
        }
      };

      // Log profile update
      await logger.logSecurityEvent('PASSWORDLESS_PROFILE_UPDATED', {
        userId: uid,
        timestamp: new Date().toISOString()
      });

      return userData;
    } catch (error) {
      await logger.logSecurityEvent('PASSWORDLESS_PROFILE_UPDATE_FAILED', {
        userId: decodedToken.uid,
        error: error.message,
        timestamp: new Date().toISOString()
      });

      throw error;
    }
  }

  /**
   * Validate email format
   * @param {string} email - Email to validate
   * @returns {boolean} True if valid
   */
  isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Mask email for logging (security best practice)
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

  /**
   * Check if a user exists by email
   * @param {string} email - User's email
   * @returns {Promise<Object|null>} User record or null
   */
  async getUserByEmail(email) {
    try {
      const auth = await this.getFirebaseAuth();
      const userRecord = await auth.getUserByEmail(email);
      return userRecord;
    } catch (error) {
      if (error.code === 'auth/user-not-found') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Set custom claims for a user (e.g., roles, permissions)
   * @param {string} uid - User ID
   * @param {Object} claims - Custom claims to set
   * @returns {Promise<void>}
   */
  async setCustomClaims(uid, claims) {
    try {
      const auth = await this.getFirebaseAuth();
      await auth.setCustomUserClaims(uid, claims);
      
      await logger.logSecurityEvent('CUSTOM_CLAIMS_SET', {
        userId: uid,
        claims: Object.keys(claims), // Log claim keys only, not values
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      await logger.logSecurityEvent('CUSTOM_CLAIMS_SET_FAILED', {
        userId: uid,
        error: error.message,
        timestamp: new Date().toISOString()
      });

      throw error;
    }
  }
}

// Export the class, not an instance
export default EmailLinkService;

// Create a singleton instance getter
let instance = null;
export function getEmailLinkService() {
  if (!instance) {
    instance = new EmailLinkService();
  }
  return instance;
}