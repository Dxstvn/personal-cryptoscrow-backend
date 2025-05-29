// src/api/routes/auth/loginSignUp.js
import { getAuth as getAdminAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getAdminApp } from "./admin.js";
import express from "express";
import '../../../config/env.js';

const router = express.Router();

// Helper function to get Firebase services
async function getFirebaseServices() {
  const app = await getAdminApp();
  return {
    auth: getAdminAuth(app),
    db: getFirestore(app)
  };
}

// Email/Password Sign-Up Route
router.post("/signUpEmailPass", async (req, res) => {
  const { email, password, walletAddress } = req.body;
  const currentIsTest = process.env.NODE_ENV === 'test';

  if (!email || !password) {
    console.log("/signUpEmailPass: Email or password missing.");
    return res.status(400).json({ error: "Email and password are required" });
  }

  try {
    const { auth, db } = await getFirebaseServices();
    
    // Create user with Admin SDK
    const userRecord = await auth.createUser({
      email: email.toLowerCase(),
      password: password,
      emailVerified: false
    });
    
    // Create user profile in Firestore
    const userProfileData = {
      email: email.toLowerCase(),
      first_name: '',
      last_name: '',
      phone_number: '',
      wallets: walletAddress ? [walletAddress] : [],
      createdAt: new Date(),
      uid: userRecord.uid
    };
    
    try {
      await db.collection('users').doc(userRecord.uid).set(userProfileData);
      console.log(`/signUpEmailPass: User profile created in Firestore for UID: ${userRecord.uid}`);
    } catch (firestoreError) {
      console.error('/signUpEmailPass: Failed to create Firestore profile:', firestoreError);
      // Note: User is already created in Auth, consider cleanup if this fails
    }
    
    // Set admin claims for non-test environments
    if (!currentIsTest) {
      await auth.setCustomUserClaims(userRecord.uid, { admin: true });
      console.log(`/signUpEmailPass: Admin claims set for user ${userRecord.uid}`);
    }
    
    console.log('/signUpEmailPass: User created successfully:', userRecord.uid);
    res.status(201).json({ 
      message: "User created successfully",
      user: { uid: userRecord.uid, email: userRecord.email }
    });
  } catch (error) {
    console.error('/signUpEmailPass: Sign-up error:', error);
    if (error.code === 'auth/email-already-exists') {
      res.status(409).json({ error: 'Email already in use' });
    } else if (error.code === 'auth/weak-password') {
      res.status(400).json({ error: 'Password is too weak' });
    } else if (error.code === 'auth/invalid-email') {
      res.status(400).json({ error: 'Invalid email address' });
    } else {
      res.status(400).json({ error: error.message || 'An unexpected error occurred during sign-up.' });
    }
  }
});

// Email/Password Sign-In Route  
router.post("/signInEmailPass", async (req, res) => {
  const { email, password } = req.body;
  const currentIsTest = process.env.NODE_ENV === 'test';

  if (!email || !password) {
    console.log("/signInEmailPass: Email or password missing.");
    return res.status(400).json({ error: "Email and password are required" });
  }

  try {
    const { auth } = await getFirebaseServices();
    
    // For server-side authentication, we need to verify the user exists and create a custom token
    let userRecord;
    try {
      // Get user by email to verify they exist
      userRecord = await auth.getUserByEmail(email.toLowerCase());
    } catch (userError) {
      if (userError.code === 'auth/user-not-found') {
        console.log(`/signInEmailPass: User not found for email: ${email}`);
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      throw userError;
    }

    // For production environments, verify admin claims
    if (!currentIsTest) {
      if (!userRecord.customClaims?.admin) {
        console.log(`/signInEmailPass: Unauthorized attempt by non-admin user ${userRecord.uid}`);
        return res.status(401).json({ error: 'Unauthorized user' });
      }
      console.log(`/signInEmailPass: Admin user ${userRecord.uid} signed in.`);
    } else {
      console.log(`/signInEmailPass: Test user ${userRecord.uid} signed in.`);
    }

    // Create a custom token for the frontend
    const customToken = await auth.createCustomToken(userRecord.uid);
    
    res.status(200).json({ 
      message: "User signed in successfully", 
      token: customToken,
      user: { uid: userRecord.uid, email: userRecord.email } 
    });
  } catch (error) {
    console.error('/signInEmailPass: Sign-in error:', error);
    
    // For security, don't reveal too much information about why sign-in failed
    if (error.code === 'auth/user-not-found' || error.code === 'auth/invalid-email') {
      res.status(401).json({ error: 'Invalid credentials' });
    } else {
      res.status(400).json({ error: 'An unexpected error occurred during sign-in.' });
    }
  }
});

// Google Sign-In Route
router.post("/signInGoogle", async (req, res) => {
  const { idToken } = req.body;
  const currentIsTest = process.env.NODE_ENV === 'test';

  if (!idToken) {
    console.log("/signInGoogle: Missing ID token.");
    return res.status(400).json({ error: "Missing ID token" });
  }

  console.log(`/signInGoogle: Executing in ${currentIsTest ? 'Test' : 'Production'} mode.`);

  try {
    const { auth } = await getFirebaseServices();

    if (currentIsTest) {
      // In test mode, treat idToken as a UID directly
      if (idToken === 'invalid-token') {
        console.log("/signInGoogle: Test mode - invalid-token received.");
        return res.status(401).json({ error: 'Invalid ID token' });
      }
      
      try {
        console.log(`/signInGoogle: Test mode - Processing user authentication`);
        const userRecord = await auth.getUser(idToken);
        const isAdmin = userRecord.customClaims?.admin === true;
        console.log(`/signInGoogle: Test mode - User authenticated, admin status: ${isAdmin}`);
        
        if (!isAdmin) {
          console.log("/signInGoogle: Test mode - User does not have admin claim.");
          return res.status(401).json({ error: 'Unauthorized user (test mode - admin required)' });
        }
        return res.status(200).json({ 
          message: "User authenticated (test)", 
          uid: userRecord.uid, 
          isAdmin: true 
        });
      } catch (err) {
        console.error('/signInGoogle: Test mode - Authentication error:', err);
        return res.status(401).json({ error: 'Invalid user UID provided as token (test mode)' });
      }
    } else {
      // Production mode - verify the actual Google ID token
      console.log("/signInGoogle: Production mode - Verifying ID token...");
      const decodedToken = await auth.verifyIdToken(idToken, true);
      const uid = decodedToken.uid;
      console.log(`/signInGoogle: Production mode - Token verified for user`);

      console.log("/signInGoogle: Production mode - Getting user details...");
      const user = await auth.getUser(uid);

      // Get allowed emails from environment variable
      const allowedEmailsString = process.env.ALLOWED_EMAILS || "jasmindustin@gmail.com,dustin.jasmin@jaspire.co,andyrowe00@gmail.com";
      const allowedEmails = allowedEmailsString.split(',').map(email => email.trim().toLowerCase());

      if (!user.email || !allowedEmails.includes(user.email.toLowerCase())) {
        console.warn(`/signInGoogle: Production mode - Unauthorized email attempt`);
        return res.status(403).json({ error: "Access denied. This email address is not authorized." });
      }

      console.log(`/signInGoogle: Production mode - Email authorized`);
      const isAdmin = user.email.toLowerCase() === "jasmindustin@gmail.com";
      console.log(`/signInGoogle: Production mode - Admin status determined`);

      return res.status(200).json({
        message: "User authenticated",
        uid,
        isAdmin
      });
    }
  } catch (error) {
    console.error('/signInGoogle: Authentication error:', error.code || 'Unknown error');

    if (error.code === 'auth/id-token-expired') {
      return res.status(401).json({ error: 'Login session expired, please sign in again.' });
    } else if (error.code === 'auth/argument-error' || (error.message && error.message.includes("invalid signature"))) {
      return res.status(401).json({
        error: 'Invalid authentication token signature. Please ensure the frontend and backend are using the same Firebase project.'
      });
    } else if (error.code === 'auth/user-not-found') {
      return res.status(404).json({ error: 'Authenticated user profile not found.' });
    }
    return res.status(500).json({ error: 'An internal error occurred during authentication.' });
  }
});

export default router;
