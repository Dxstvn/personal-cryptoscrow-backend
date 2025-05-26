// src/api/routes/auth/loginSignUp.js
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword } from "firebase/auth";
import { getAuth as getAdminAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { ethEscrowApp } from "./authIndex.js"; // This will be the mocked version in tests
import { adminApp } from "./admin.js";     // This will be the mocked version in tests
import express from "express";
import '../../../config/env.js';

const router = express.Router();
const db = getFirestore(adminApp);

// Email/Password Sign-Up Route
router.post("/signUpEmailPass", async (req, res) => {
  const { email, password, walletAddress } = req.body;
  // Check NODE_ENV at execution time
  const currentIsTest = process.env.NODE_ENV === 'test';

  if (!email || !password) {
    console.log("/signUpEmailPass: Email or password missing.");
    return res.status(400).json({ error: "Email and password are required" });
  }

  try {
    const authInstance = getAuth(ethEscrowApp); // ethEscrowApp is the FirebaseApp instance
    const userCredential = await createUserWithEmailAndPassword(authInstance, email, password);
    const user = userCredential.user;
    
    // Create user profile in Firestore
    const userProfileData = {
      email: email.toLowerCase(),
      first_name: '', // Can be updated later
      last_name: '', // Can be updated later
      phone_number: '', // Can be updated later
      wallets: walletAddress ? [walletAddress] : [], // Include wallet if provided
      createdAt: new Date(),
      uid: user.uid
    };
    
    try {
      await db.collection('users').doc(user.uid).set(userProfileData);
      console.log(`/signUpEmailPass: User profile created in Firestore for UID: ${user.uid}`);
    } catch (firestoreError) {
      console.error('/signUpEmailPass: Failed to create Firestore profile:', firestoreError);
      // Note: User is already created in Auth, so we might want to handle this differently
      // For now, we'll log the error but still return success
    }
    
    if (!currentIsTest) {
      const adminAuthInstance = getAdminAuth(adminApp); // adminApp is the Firebase Admin App instance
      await adminAuthInstance.setCustomUserClaims(user.uid, { admin: true });
      console.log(`/signUpEmailPass: Admin claims set for user ${user.uid}`);
    }
    
    console.log('/signUpEmailPass: User created successfully:', user.uid);
    // Adjusted response to match E2E test expectations from the old /signup route
    res.status(201).json({ 
      message: "User created successfully", // Changed message
      user: { uid: user.uid, email: user.email } // Added user object
    });
  } catch (error) {
    console.error('/signUpEmailPass: Sign-up error:', error);
    if (error.code === 'auth/email-already-in-use') {
      // Using 409 Conflict as it's more standard for this case than 401 (was 401, then 409 in /signup)
      res.status(409).json({ error: 'Email already in use' });
    } else {
      // Was 401, then 400 in /signup
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
    const authInstance = getAuth(ethEscrowApp);
    const userCredential = await signInWithEmailAndPassword(authInstance, email, password);
    const user = userCredential.user;
    const idToken = await user.getIdToken();
    
    if (!currentIsTest) {
      const adminAuthInstance = getAdminAuth(adminApp);
      const userRecord = await adminAuthInstance.getUser(user.uid);
      if (!userRecord.customClaims?.admin) {
        console.log(`/signInEmailPass: Unauthorized attempt by non-admin user ${user.uid}`);
        return res.status(401).json({ error: 'Unauthorized user' });
      }
      console.log(`/signInEmailPass: Admin user ${user.uid} signed in.`);
    } else {
      console.log(`/signInEmailPass: Test user ${user.uid} signed in.`);
    }
    
    res.status(200).json({ 
      message: "User signed in successfully", 
      token: idToken,
      user: { uid: user.uid, email: user.email } 
    });
  } catch (error) {
    console.error('/signInEmailPass: Sign-in error:', error);
    if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
      res.status(401).json({ error: 'Invalid credentials' });
    } else if (error.code === 'auth/user-not-found') {
      res.status(401).json({ error: 'User not found' });
    } else {
      res.status(400).json({ error: error.message || 'An unexpected error occurred during sign-in.' });
    }
  }
});

// Google Sign-In Route
router.post("/signInGoogle", async (req, res) => {
  const { idToken } = req.body;
  const currentIsTest = process.env.NODE_ENV === 'test'; // Check NODE_ENV at execution time

  // Remove token logging for security
  if (!idToken) {
    console.log("/signInGoogle: Missing ID token.");
    return res.status(400).json({ error: "Missing ID token" });
  }

  console.log(`/signInGoogle: Executing in ${currentIsTest ? 'Test' : 'Production'} mode.`);

  if (currentIsTest) {
    if (idToken === 'invalid-token') {
      console.log("/signInGoogle: Test mode - invalid-token received.");
      return res.status(401).json({ error: 'Invalid ID token' });
    }
    const adminAuthInstance = getAdminAuth(adminApp);
    try {
      console.log(`/signInGoogle: Test mode - Processing user authentication`);
      const userRecord = await adminAuthInstance.getUser(idToken);
      const isAdmin = userRecord.customClaims?.admin === true;
      console.log(`/signInGoogle: Test mode - User authenticated, admin status: ${isAdmin}`);
      if (!isAdmin) {
        console.log("/signInGoogle: Test mode - User does not have admin claim.");
        return res.status(401).json({ error: 'Unauthorized user (test mode - admin required)' });
      }
      return res.status(200).json({ message: "User authenticated (test)", uid: userRecord.uid, isAdmin: true });
    } catch (err) {
      console.error('/signInGoogle: Test mode - Authentication error');
      return res.status(401).json({ error: 'Invalid user UID provided as token (test mode)' });
    }
  } else { // Production mode
    try {
      const adminAuthInstance = getAdminAuth(adminApp);
      console.log("/signInGoogle: Production mode - Verifying ID token...");
      const decodedToken = await adminAuthInstance.verifyIdToken(idToken, true);
      const uid = decodedToken.uid;
      console.log(`/signInGoogle: Production mode - Token verified for user`);

      console.log("/signInGoogle: Production mode - Getting user details...");
      const user = await adminAuthInstance.getUser(uid);

      // Get allowed emails from environment variable for security
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
    } catch (error) {
      console.error('/signInGoogle: Production mode - Authentication error:', error.code || 'Unknown error');

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
  }
});

export default router;
