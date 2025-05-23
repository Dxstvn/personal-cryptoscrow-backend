// src/api/routes/auth/loginSignUp.js
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword } from "firebase/auth";
import { getAuth as getAdminAuth } from "firebase-admin/auth";
import { ethEscrowApp } from "./authIndex.js"; // This will be the mocked version in tests
import { adminApp } from "./admin.js";     // This will be the mocked version in tests
import express from "express";
import 'dotenv/config';

const router = express.Router();

// Email/Password Sign-Up Route
router.post("/signUpEmailPass", async (req, res) => {
  const { email, password } = req.body;
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
    
    if (!currentIsTest) {
      const adminAuthInstance = getAdminAuth(adminApp); // adminApp is the Firebase Admin App instance
      await adminAuthInstance.setCustomUserClaims(user.uid, { admin: true });
      console.log(`/signUpEmailPass: Admin claims set for user ${user.uid}`);
    }
    
    console.log('/signUpEmailPass: User created successfully:', user.uid);
    res.status(201).json({ message: "User created", uid: user.uid });
  } catch (error) {
    console.error('/signUpEmailPass: Sign-up error:', error);
    if (error.code === 'auth/email-already-in-use') {
      res.status(401).json({ error: 'Email already in use' });
    } else {
      res.status(401).json({ error: error.message || 'An unexpected error occurred during sign-up.' });
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
    
    res.status(200).json({ message: "User signed in", uid: user.email });
  } catch (error) {
    console.error('/signInEmailPass: Sign-in error:', error);
    if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
      res.status(401).json({ error: 'Invalid password' });
    } else if (error.code === 'auth/user-not-found') {
      res.status(401).json({ error: 'User not found' });
    } else {
      res.status(401).json({ error: error.message || 'An unexpected error occurred during sign-in.' });
    }
  }
});

// Simplified login route for E2E tests
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    console.log("/login: Email or password missing.");
    return res.status(400).json({ error: "Email and password are required" });
  }

  try {
    const authInstance = getAuth(ethEscrowApp);
    const userCredential = await signInWithEmailAndPassword(authInstance, email, password);
    const user = userCredential.user;
    const idToken = await user.getIdToken();
    
    console.log(`/login: User ${user.uid} signed in successfully.`);
    res.status(200).json({ 
      message: "User signed in successfully", 
      token: idToken,
      user: { uid: user.uid, email: user.email } 
    });
  } catch (error) {
    console.error('/login: Sign-in error:', error);
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

  console.log("/signInGoogle: Received ID Token snippet:", idToken?.substring(0, 10) + "...");

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
      console.log(`/signInGoogle: Test mode - Treating token as UID: ${idToken}`);
      const userRecord = await adminAuthInstance.getUser(idToken);
      const isAdmin = userRecord.customClaims?.admin === true;
      console.log(`/signInGoogle: Test mode - User found. UID: ${userRecord.uid}, isAdmin claim: ${isAdmin}`);
      if (!isAdmin) {
        console.log("/signInGoogle: Test mode - User does not have admin claim.");
        return res.status(401).json({ error: 'Unauthorized user (test mode - admin required)' });
      }
      return res.status(200).json({ message: "User authenticated (test)", uid: userRecord.uid, isAdmin: true });
    } catch (err) {
      console.error('/signInGoogle: Test mode - Error looking up user by UID:', err);
      return res.status(401).json({ error: 'Invalid user UID provided as token (test mode)' });
    }
  } else { // Production mode
    try {
      const adminAuthInstance = getAdminAuth(adminApp);
      console.log("/signInGoogle: Production mode - Verifying ID token...");
      const decodedToken = await adminAuthInstance.verifyIdToken(idToken, true);
      const uid = decodedToken.uid;
      console.log(`/signInGoogle: Production mode - Token verified. UID: ${uid}, Email: ${decodedToken.email}`);

      console.log("/signInGoogle: Production mode - Getting user details...");
      const user = await adminAuthInstance.getUser(uid);
      console.log(`/signInGoogle: Production mode - User email from record: ${user.email}`);

      const allowedEmails = [
        "jasmindustin@gmail.com",
        "dustin.jasmin@jaspire.co",
        "andyrowe00@gmail.com"
      ];
      console.log("/signInGoogle: Production mode - Checking against allowed emails:", allowedEmails);

      if (!user.email || !allowedEmails.includes(user.email.toLowerCase())) {
        console.warn(`/signInGoogle: Production mode - Unauthorized email attempt: ${user.email}`);
        return res.status(403).json({ error: "Access denied. This email address is not authorized." });
      }

      console.log(`/signInGoogle: Production mode - Email ${user.email} is authorized.`);
      const isAdmin = user.email.toLowerCase() === "jasmindustin@gmail.com";
      console.log(`/signInGoogle: Production mode - isAdmin determined as: ${isAdmin}`);

      return res.status(200).json({
        message: "User authenticated",
        uid,
        isAdmin
      });
    } catch (error) {
      console.error('/signInGoogle: Production mode - Google sign-in verification/lookup error:', {
        errorCode: error.code,
        errorMessage: error.message,
        idTokenSnippet: idToken?.substring(0, 50) + '...',
      });

      if (error.code === 'auth/id-token-expired') {
        return res.status(401).json({ error: 'Login session expired, please sign in again.' });
      } else if (error.code === 'auth/argument-error' || (error.message && error.message.includes("invalid signature"))) {
        return res.status(401).json({
          error: 'Invalid authentication token signature. Please ensure the frontend and backend are using the same Firebase project.'
        });
      } else if (error.code === 'auth/user-not-found') {
        return res.status(404).json({ error: 'Authenticated user profile not found.' });
      }
      return res.status(500).json({ error: error.message || 'An internal error occurred during authentication.' });
    }
  }
});

// Simplified signup route for E2E tests
router.post("/signup", async (req, res) => {
  const { email, password, walletAddress } = req.body;
  // Looser check for test environments for this simplified route
  const currentIsTestEnv = process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'e2e_test'; 

  if (!email || !password) {
    console.log("/signup: Email or password missing.");
    return res.status(400).json({ error: "Email and password are required" });
  }

  try {
    const authInstance = getAuth(ethEscrowApp);
    const userCredential = await createUserWithEmailAndPassword(authInstance, email, password);
    const user = userCredential.user;
    
    // For E2E, we might not always set admin claims, or it might be handled differently.
    // Keeping this simple for now.
    if (currentIsTestEnv) {
      console.log(`/signup: E2E/Test user created: ${user.uid}`);
    }
    
    // Respond with a structure that basicFlow.e2e.test.js expects
    res.status(201).json({ 
      message: "User created successfully", 
      user: { uid: user.uid, email: user.email, walletAddress: walletAddress }, // Include walletAddress if needed by client
      // uid: user.uid // The test expects user.uid within a user object
    });
  } catch (error) {
    console.error('/signup: Sign-up error:', error);
    if (error.code === 'auth/email-already-in-use') {
      // Using 409 Conflict as it's more standard for this case than 401
      res.status(409).json({ error: 'Email already in use' }); 
    } else {
      res.status(400).json({ error: error.message || 'An unexpected error occurred during sign-up.' });
    }
  }
});

export default router;
