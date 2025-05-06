import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword } from "firebase/auth";
import { getAuth as getAdminAuth } from "firebase-admin/auth";
import { ethEscrowApp } from "./authIndex.js";
import { adminApp } from "./admin.js"; // Import the admin app
import express from "express";
import jwt from 'jsonwebtoken';
import 'dotenv/config';

const router = express.Router();
const isTest = process.env.NODE_ENV === 'test';



// Email/Password Sign-Up Route
router.post("/signUpEmailPass", async (req, res) => {
  // Validate inputs before Firebase call
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  try {
    const auth = getAuth(ethEscrowApp);
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    
    // In test environment, we don't need to check admin status
    if (!isTest) {
      const adminAuth = getAdminAuth(adminApp);
      await adminAuth.setCustomUserClaims(user.uid, { admin: true });
    }
    
    console.log('User created via email and password');
    res.status(201).json({ message: "User created", uid: user.uid });
  } catch (error) {
    console.error('Sign-up error:', error);
    if (error.code === 'auth/email-already-in-use') {
      res.status(401).json({ error: 'Email already in use' });
    } else {
      res.status(401).json({ error: error.message });
    }
  }
});

// Email/Password Sign-In Route
router.post("/signInEmailPass", async (req, res) => {
  // Validate inputs before Firebase call
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  try {
    const auth = getAuth(ethEscrowApp);
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    
    // In production, verify admin status
    if (!isTest) {
      const adminAuth = getAdminAuth(adminApp);
      const userRecord = await adminAuth.getUser(user.uid);
      if (!userRecord.customClaims?.admin) {
        return res.status(401).json({ error: 'Unauthorized user' });
      }
    }
    
    console.log("User signed in via email and password");
    res.status(200).json({ message: "User signed in", uid: user.email });
  } catch (error) {
    console.error('Sign-in error:', error);
    if (error.code === 'auth/wrong-password') {
      res.status(401).json({ error: 'Invalid password' });
    } else if (error.code === 'auth/user-not-found') {
      res.status(401).json({ error: 'User not found' });
    } else {
      res.status(401).json({ error: error.message });
    }
  }
});

// Google Sign-In Route
// ... (previous imports and code remain the same)

router.post("/signInGoogle", async (req, res) => {
  // console.log(`API KEY: '${process.env.FIREBASE_API_KEY}'`);
  // console.log(`AUTH DOMAIN: '${process.env.FIREBASE_AUTH_DOMAIN}'`);
  // console.log(`PROJECT ID: '${process.env.FIREBASE_PROJECT_ID}'`);
  // console.log(`STORAGE BUCKET: '${process.env.FIREBASE_STORAGE_BUCKET}'`);
  // console.log(`MESSAGING SENDER ID: '${process.env.FIREBASE_MESSAGING_SENDER_ID}'`);
  // console.log(`APP ID: '${process.env.FIREBASE_APP_ID}'`);
  // console.log(`MEASUREMENT ID: '${process.env.FIREBASE_MEASUREMENT_ID}'`);
  const { idToken } = req.body;
  console.log("Received ID Token snippet:", idToken?.substring(0, 10) + "...");
  if (!idToken) {
    return res.status(400).json({ error: "Missing ID token" });
  }

  const isTest = process.env.NODE_ENV === 'test';
  console.log(`signInGoogle executing in ${isTest ? 'Test' : 'Production'} mode.`);

  if (isTest) {
    // Test mode logic (unchanged)
    if (idToken === 'invalid-token') {
      return res.status(401).json({ error: 'Invalid ID token' });
    }
    const auth = getAdminAuth(adminApp);
    try {
      console.log(`Test mode: Treating token as UID: ${idToken}`);
      const userRecord = await auth.getUser(idToken);
      const isAdmin = userRecord.customClaims?.admin === true;
      console.log(`Test mode: User found. UID: ${userRecord.uid}, isAdmin claim: ${isAdmin}`);
      if (!isAdmin) {
        console.log("Test mode: User does not have admin claim.");
        return res.status(401).json({ error: 'Unauthorized user (test mode - admin required)' });
      }
      return res.status(200).json({ message: "User authenticated (test)", uid: userRecord.uid, isAdmin: true });
    } catch (err) {
      console.error('Error looking up test user by UID:', err);
      return res.status(401).json({ error: 'Invalid user UID provided as token (test mode)' });
    }
  } else {
    try {
      const auth = getAdminAuth(adminApp);
      console.log("Production mode: Verifying ID token...");
      const decodedToken = await auth.verifyIdToken(idToken, true); // Force check for revoked tokens
      const uid = decodedToken.uid;
      console.log(`Production mode: Token verified successfully. Email: ${decodedToken.email}`);

      console.log("Production mode: Getting user details...");
      const user = await auth.getUser(uid);
      console.log(`Production mode: User email: ${user.email}`);

      const allowedEmails = [
        "jasmindustin@gmail.com",
        "dustin.jasmin@jaspire.co",
        "andyrowe00@gmail.com"
      ];
      console.log("Production mode: Checking against allowed emails:");

      if (!user.email || !allowedEmails.includes(user.email.toLowerCase())) {
        console.warn(`Production mode: Unauthorized email attempt - ${user.email}`);
        return res.status(403).json({ error: "Access denied. This email address is not authorized." });
      }

      console.log(`Production mode: Email ${user.email} is authorized.`);
      const isAdmin = user.email.toLowerCase() === "jasmindustin@gmail.com";
      console.log(`Production mode: isAdmin set to ${isAdmin}`);

      return res.status(200).json({
        message: "User authenticated",
        uid,
        isAdmin
      });
    } catch (error) {
      console.error('Google sign-in verification/lookup error:', {
        errorCode: error.code,
        errorMessage: error.message,
        idTokenSnippet: idToken?.substring(0, 50) + '...',
        stack: error.stack
      });

      if (error.code === 'auth/id-token-expired') {
        return res.status(401).json({ error: 'Login session expired, please sign in again.' });
      } else if (error.code === 'auth/argument-error' || error.message.includes("invalid signature")) {
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