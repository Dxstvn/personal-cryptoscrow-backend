/**
 * Firebase Cloud Function for sending passwordless email links
 * This uses the Firebase Client SDK which has built-in email sending
 * 
 * Deploy this as a Firebase Function:
 * firebase deploy --only functions:sendPasswordlessEmail
 */

const functions = require('firebase-functions');
const { initializeApp } = require('firebase/app');
const { getAuth, sendSignInLinkToEmail } = require('firebase/auth');

// Initialize Firebase app with client SDK
const app = initializeApp({
  apiKey: functions.config().client.api_key,
  authDomain: functions.config().client.auth_domain,
  projectId: functions.config().client.project_id
});

const auth = getAuth(app);

/**
 * Cloud Function to send passwordless email
 * Call this from your backend using Firebase Admin SDK
 */
exports.sendPasswordlessEmail = functions.https.onCall(async (data, context) => {
  const { email, actionCodeSettings } = data;

  // Validate input
  if (!email) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Email is required'
    );
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Invalid email format'
    );
  }

  // Default action code settings if not provided
  const settings = actionCodeSettings || {
    url: `https://app.clearhold.com/auth/email-action`,
    handleCodeInApp: true,
    iOS: {
      bundleId: 'com.clearhold.ios'
    },
    android: {
      packageName: 'com.clearhold.android',
      installApp: true,
      minimumVersion: '12'
    }
  };

  try {
    // Send the email using Firebase Client SDK
    // This will use the email template configured in Firebase Console
    await sendSignInLinkToEmail(auth, email, settings);

    // Log the event
    functions.logger.info('Passwordless email sent', {
      email: maskEmail(email),
      timestamp: new Date().toISOString()
    });

    return {
      success: true,
      message: 'Sign-in link sent successfully'
    };
  } catch (error) {
    functions.logger.error('Failed to send passwordless email', {
      email: maskEmail(email),
      error: error.message,
      code: error.code
    });

    // Handle specific Firebase errors
    if (error.code === 'auth/invalid-email') {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Invalid email address'
      );
    } else if (error.code === 'auth/missing-action-code-settings') {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Action code settings are required'
      );
    } else if (error.code === 'auth/quota-exceeded') {
      throw new functions.https.HttpsError(
        'resource-exhausted',
        'Email quota exceeded. Please try again later.'
      );
    }

    // Generic error
    throw new functions.https.HttpsError(
      'internal',
      'Failed to send email. Please try again.'
    );
  }
});

/**
 * Helper function to mask email for logging
 */
function maskEmail(email) {
  const [localPart, domain] = email.split('@');
  const maskedLocal = localPart.length > 2 
    ? `${localPart.substring(0, 2)}***`
    : '***';
  return `${maskedLocal}@${domain}`;
}