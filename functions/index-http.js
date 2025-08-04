const functions = require('firebase-functions');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');
const { generatePasswordlessEmailTemplate } = require('./emailTemplates/passwordlessEmail');

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  admin.initializeApp();
}

/**
 * HTTP Cloud Function to send passwordless email with ClearHold branding
 * This version accepts regular HTTP requests without Firebase Auth
 */
exports.sendPasswordlessEmailHTTP = functions.https.onRequest(async (req, res) => {
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
    const { data } = req.body;
    const { email, actionCodeSettings } = data || {};

    // Validate input
    if (!email) {
      res.status(400).json({
        error: { message: 'Email is required' }
      });
      return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      res.status(400).json({
        error: { message: 'Invalid email format' }
      });
      return;
    }

    // Generate the sign-in link using Firebase Admin SDK
    const link = await admin.auth().generateSignInWithEmailLink(
      email, 
      actionCodeSettings || {
        url: functions.config().app?.url || 'https://clearhold.app/auth/email-action',
        handleCodeInApp: true,
      }
    );

    // Get email configuration
    const config = functions.config();
    const gmailEmail = config.gmail?.email;
    const gmailPassword = config.gmail?.password;
    const fromEmail = config.email?.from || 'noreply@clearhold.app';
    const senderName = config.email?.sender_name || 'ClearHold';

    if (!gmailEmail || !gmailPassword) {
      console.error('Gmail configuration missing');
      res.status(500).json({
        error: { message: 'Email service not configured' }
      });
      return;
    }

    // Create reusable transporter
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: gmailEmail,
        pass: gmailPassword
      }
    });

    // Generate branded email template
    const emailHtml = generatePasswordlessEmailTemplate(email, link);

    // Email options
    const mailOptions = {
      from: `"${senderName}" <${fromEmail}>`,
      to: email,
      subject: 'Sign in to ClearHold',
      html: emailHtml,
      text: `Sign in to ClearHold\n\nClick the link below to sign in:\n${link}\n\nIf you didn't request this, please ignore this email.`
    };

    // Send email
    await transporter.sendMail(mailOptions);

    console.log(`Passwordless email sent to ${email}`);
    
    res.status(200).json({
      result: {
        success: true,
        message: 'Sign-in link sent successfully'
      }
    });

  } catch (error) {
    console.error('Error sending passwordless email:', error);
    res.status(500).json({
      error: {
        message: error.message || 'Failed to send sign-in link'
      }
    });
  }
});