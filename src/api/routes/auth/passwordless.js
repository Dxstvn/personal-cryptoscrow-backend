import express from 'express';
import admin from 'firebase-admin';
import { getEmailLinkService } from '../../../services/emailLinkService.js';
import { getDb } from '../../../services/databaseService.js';
import securityLogger from '../../../services/securityLogger.js';
import jwt from 'jsonwebtoken';

const router = express.Router();

// Rate limiting for email sends
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60 * 60 * 1000; // 1 hour
const MAX_ATTEMPTS = 3;

/**
 * Check if email send is rate limited
 * @param {string} email - Email to check
 * @returns {boolean} True if rate limited
 */
function isRateLimited(email) {
  const now = Date.now();
  const attempts = rateLimitMap.get(email) || [];
  
  // Clean old attempts
  const recentAttempts = attempts.filter(timestamp => 
    now - timestamp < RATE_LIMIT_WINDOW
  );
  
  rateLimitMap.set(email, recentAttempts);
  
  return recentAttempts.length >= MAX_ATTEMPTS;
}

/**
 * Add rate limit attempt
 * @param {string} email - Email to track
 */
function addRateLimitAttempt(email) {
  const attempts = rateLimitMap.get(email) || [];
  attempts.push(Date.now());
  rateLimitMap.set(email, attempts);
}

/**
 * POST /api/auth/passwordless/send-link
 * Send a passwordless sign-in link to user's email
 */
router.post('/send-link', async (req, res) => {
  const emailLinkService = getEmailLinkService();
  try {
    const { email } = req.body;

    // Validate email
    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required'
      });
    }

    // Check rate limiting
    if (isRateLimited(email)) {
      await securityLogger.logSecurityEvent('PASSWORDLESS_RATE_LIMIT_EXCEEDED', {
        email: emailLinkService.maskEmail(email),
        ip: req.ip,
        timestamp: new Date().toISOString()
      });

      return res.status(429).json({
        success: false,
        error: 'Too many attempts. Please try again later.'
      });
    }

    // Check if user exists or create placeholder
    let userExists = false;
    let userId = null;

    try {
      const existingUser = await emailLinkService.getUserByEmail(email);
      if (existingUser) {
        userExists = true;
        userId = existingUser.uid;
      }
    } catch (error) {
      // User doesn't exist, which is fine for passwordless
    }

    // Generate and send the email link
    const result = await emailLinkService.sendSignInLink(email);

    // Add rate limit attempt
    addRateLimitAttempt(email);

    // Log attempt in database
    const db = await getDb();
    await db.collection('auth_attempts').add({
      email,
      type: 'passwordless',
      userExists,
      userId,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      ip: req.ip,
      userAgent: req.get('user-agent')
    });

    // In development mode, the link is returned for testing
    // In production, only success message is returned
    const response = {
      success: true,
      message: 'Sign-in link sent to your email. Please check your inbox.'
    };
    
    // Include link only in development/test mode
    if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
      response.link = result.link;
    }
    
    res.status(200).json(response);

  } catch (error) {
    console.error('Error sending passwordless link:', error);
    
    await securityLogger.logSecurityEvent('PASSWORDLESS_SEND_ERROR', {
      error: error.message,
      ip: req.ip,
      timestamp: new Date().toISOString()
    });

    res.status(500).json({
      success: false,
      error: 'Failed to send sign-in link. Please try again.'
    });
  }
});

/**
 * POST /api/auth/passwordless/verify-token
 * Verify Firebase ID token after client-side passwordless sign-in
 */
router.post('/verify-token', async (req, res) => {
  const emailLinkService = getEmailLinkService();
  try {
    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({
        success: false,
        error: 'ID token is required'
      });
    }

    // Verify the Firebase ID token
    const decodedToken = await emailLinkService.verifyUserToken(idToken);

    // Create or update user profile
    const userProfile = await emailLinkService.createOrUpdateUserProfile(decodedToken);

    // Check if user exists in Firestore
    const databaseService = getDb();
    let userData = await databaseService.get('users', decodedToken.uid);

    if (!userData) {
      // Create new user profile in Firestore
      userData = {
        uid: decodedToken.uid,
        email: decodedToken.email,
        emailVerified: decodedToken.email_verified,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        lastLogin: admin.firestore.FieldValue.serverTimestamp(),
        authMethod: 'passwordless',
        profile: {
          displayName: decodedToken.name || '',
          photoURL: decodedToken.picture || ''
        }
      };

      await databaseService.create('users', userData, decodedToken.uid);
    } else {
      // Update existing user
      await databaseService.update('users', decodedToken.uid, {
        lastLogin: admin.firestore.FieldValue.serverTimestamp(),
        emailVerified: decodedToken.email_verified
      });
    }

    // Generate custom JWT token for API access
    const customToken = jwt.sign(
      {
        uid: decodedToken.uid,
        email: decodedToken.email,
        emailVerified: decodedToken.email_verified,
        authMethod: 'passwordless'
      },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '7d' }
    );

    // Log successful authentication
    await databaseService.create('auth_logs', {
      userId: decodedToken.uid,
      type: 'passwordless_success',
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      ip: req.ip,
      userAgent: req.get('user-agent')
    });

    res.status(200).json({
      success: true,
      token: customToken,
      user: {
        uid: decodedToken.uid,
        email: decodedToken.email,
        emailVerified: decodedToken.email_verified,
        ...userData.profile
      }
    });

  } catch (error) {
    console.error('Error verifying passwordless token:', error);

    let errorMessage = 'Authentication failed. Please try again.';
    let statusCode = 401;

    // Handle specific Firebase errors
    if (error.code === 'auth/invalid-id-token') {
      errorMessage = 'Invalid authentication token.';
    } else if (error.code === 'auth/id-token-expired') {
      errorMessage = 'Authentication token expired. Please sign in again.';
    } else if (error.code === 'auth/user-disabled') {
      errorMessage = 'This account has been disabled.';
      statusCode = 403;
    }

    await securityLogger.logSecurityEvent('PASSWORDLESS_VERIFY_ERROR', {
      error: error.message,
      code: error.code,
      ip: req.ip,
      timestamp: new Date().toISOString()
    });

    res.status(statusCode).json({
      success: false,
      error: errorMessage
    });
  }
});

/**
 * GET /api/auth/passwordless/check-email
 * Check if an email exists (used for UI hints)
 */
router.get('/check-email', async (req, res) => {
  try {
    const { email } = req.query;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required'
      });
    }

    // Check if user exists
    const user = await emailLinkService.getUserByEmail(email);

    // Don't expose whether user exists for security
    // Just return success
    res.status(200).json({
      success: true,
      // In production, don't expose user existence
      hint: 'Check your email for sign-in link'
    });

  } catch (error) {
    console.error('Error checking email:', error);
    
    res.status(200).json({
      success: true,
      hint: 'Check your email for sign-in link'
    });
  }
});

/**
 * POST /api/auth/passwordless/resend
 * Resend passwordless link (with stricter rate limiting)
 */
router.post('/resend', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required'
      });
    }

    // Check rate limiting (stricter for resend)
    const attempts = rateLimitMap.get(email) || [];
    const recentAttempts = attempts.filter(timestamp => 
      Date.now() - timestamp < RATE_LIMIT_WINDOW
    );

    if (recentAttempts.length >= 2) { // Stricter limit for resend
      return res.status(429).json({
        success: false,
        error: 'Please wait before requesting another link.'
      });
    }

    // Send the link
    await emailLinkService.sendSignInLink(email);
    addRateLimitAttempt(email);

    res.status(200).json({
      success: true,
      message: 'New sign-in link sent to your email.'
    });

  } catch (error) {
    console.error('Error resending passwordless link:', error);
    
    res.status(500).json({
      success: false,
      error: 'Failed to resend link. Please try again.'
    });
  }
});

export default router;