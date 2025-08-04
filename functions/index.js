const functions = require('firebase-functions');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');
const { generatePasswordlessEmailTemplate } = require('./emailTemplates/passwordlessEmail');

// Initialize Firebase Admin
admin.initializeApp();

// Also export the HTTP version
const httpFunction = require('./index-http');
exports.sendPasswordlessEmailHTTP = httpFunction.sendPasswordlessEmailHTTP;

/**
 * Cloud Function to send passwordless email with ClearHold branding
 * This function can be called from the backend using Firebase Admin SDK
 * 
 * @param {Object} data - Contains email and actionCodeSettings
 * @param {Object} context - Firebase Functions context
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
    url: functions.config().app?.url || 'https://app.clearhold.com/auth/email-action',
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
    // Generate the sign-in link using Firebase Admin SDK
    const link = await admin.auth().generateSignInWithEmailLink(email, settings);

    // Configure email transport
    // Option 1: Using Gmail (for development/testing)
    // Option 2: Using SendGrid (recommended for production)
    // Option 3: Using AWS SES (alternative for production)
    
    let transporter;
    
    if (functions.config().email?.service === 'sendgrid') {
      // SendGrid configuration
      const sgMail = require('@sendgrid/mail');
      sgMail.setApiKey(functions.config().sendgrid.api_key);
      
      const msg = {
        to: email,
        from: {
          email: functions.config().email.from || 'noreply@clearhold.com',
          name: 'ClearHold'
        },
        subject: 'Sign in to ClearHold',
        html: generatePasswordlessEmailTemplate(link, email)
      };
      
      await sgMail.send(msg);
      
    } else if (functions.config().email?.service === 'ses') {
      // AWS SES configuration
      const AWS = require('aws-sdk');
      const ses = new AWS.SES({
        region: functions.config().aws.region || 'us-east-1'
      });
      
      const params = {
        Destination: {
          ToAddresses: [email]
        },
        Message: {
          Body: {
            Html: {
              Charset: 'UTF-8',
              Data: generatePasswordlessEmailTemplate(link, email)
            }
          },
          Subject: {
            Charset: 'UTF-8',
            Data: 'Sign in to ClearHold'
          }
        },
        Source: functions.config().email.from || 'noreply@clearhold.com'
      };
      
      await ses.sendEmail(params).promise();
      
    } else {
      // Gmail configuration for production
      // Use Google Workspace for better deliverability
      transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 587,
        secure: false, // true for 465, false for other ports
        auth: {
          user: functions.config().gmail?.email || process.env.GMAIL_EMAIL,
          pass: functions.config().gmail?.password || process.env.GMAIL_PASSWORD
        },
        tls: {
          rejectUnauthorized: false
        }
      });
      
      // For production SMTP
      if (functions.config().smtp?.host) {
        transporter = nodemailer.createTransport({
          host: functions.config().smtp.host,
          port: functions.config().smtp.port || 587,
          secure: functions.config().smtp.secure || false,
          auth: {
            user: functions.config().smtp.user,
            pass: functions.config().smtp.password
          }
        });
      }
      
      // Send email using Nodemailer
      const mailOptions = {
        from: {
          name: functions.config().email?.sender_name || 'ClearHold',
          address: functions.config().email?.from || 'noreply@clearhold.app'
        },
        replyTo: functions.config().email?.reply_to || functions.config().email?.from || 'noreply@clearhold.app',
        to: email,
        subject: 'Sign in to ClearHold',
        html: generatePasswordlessEmailTemplate(link, email)
      };
      
      await transporter.sendMail(mailOptions);
    }

    // Log the event
    functions.logger.info('Passwordless email sent', {
      email: maskEmail(email),
      timestamp: new Date().toISOString(),
      service: functions.config().email?.service || 'nodemailer'
    });

    return {
      success: true,
      message: 'Sign-in link sent successfully'
    };
    
  } catch (error) {
    functions.logger.error('Failed to send passwordless email', {
      email: maskEmail(email),
      error: error.message,
      code: error.code,
      stack: error.stack
    });

    // Handle specific errors
    if (error.code === 'auth/invalid-email') {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Invalid email address'
      );
    } else if (error.code === 'auth/user-not-found') {
      // Don't reveal that user doesn't exist
      throw new functions.https.HttpsError(
        'not-found',
        'Failed to send email'
      );
    } else if (error.code === 'auth/too-many-requests') {
      throw new functions.https.HttpsError(
        'resource-exhausted',
        'Too many requests. Please try again later.'
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
 * HTTP endpoint version for testing
 */
exports.sendPasswordlessEmailHttp = functions.https.onRequest(async (req, res) => {
  // Enable CORS
  res.set('Access-Control-Allow-Origin', '*');
  
  if (req.method === 'OPTIONS') {
    res.set('Access-Control-Allow-Methods', 'POST');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    res.set('Access-Control-Max-Age', '3600');
    res.status(204).send('');
    return;
  }
  
  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed');
    return;
  }
  
  try {
    const { email, actionCodeSettings } = req.body;
    const result = await exports.sendPasswordlessEmail.run(
      { email, actionCodeSettings },
      { auth: null }
    );
    res.status(200).json(result);
  } catch (error) {
    res.status(400).json({
      error: error.message
    });
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