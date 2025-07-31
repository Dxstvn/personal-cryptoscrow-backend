// src/api/routes/auth/loginSignUpFixed.js
// Fixed version that returns ID tokens instead of custom tokens

import { getAuth as getAdminAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getAdminApp } from "./admin.js";
import { getAuth, signInWithCustomToken } from "firebase/auth";
import { ethEscrowApp } from "./authIndex.js";
import express from "express";
import config from '../../../config/index.js';

const router = express.Router();

// Ensure config is initialized
let configInitialized = false;
async function ensureConfig() {
  if (!configInitialized) {
    await config.initialize();
    configInitialized = true;
  }
}

// Helper function to get Firebase services
async function getFirebaseServices() {
  const app = await getAdminApp();
  return {
    auth: getAdminAuth(app),
    db: getFirestore(app)
  };
}

// Helper function to convert custom token to ID token
async function getIdTokenFromCustomToken(customToken) {
  try {
    // Get client auth instance
    const clientAuth = getAuth(ethEscrowApp);
    
    // Sign in with custom token to get ID token
    const userCredential = await signInWithCustomToken(clientAuth, customToken);
    
    // Get the ID token
    const idToken = await userCredential.user.getIdToken();
    
    return idToken;
  } catch (error) {
    console.error('Error converting custom token to ID token:', error);
    throw error;
  }
}

// Email/Password Sign-Up Route
router.post("/signUpEmailPass", async (req, res) => {
  await ensureConfig();
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
    
    // Create user profile in Firestore with KYC fields
    const userProfileData = {
      email: email.toLowerCase(),
      first_name: '',
      last_name: '',
      phone_number: '',
      wallets: walletAddress ? [{
        address: walletAddress.toLowerCase(),
        name: 'Primary Wallet',
        network: 'ethereum',
        isPrimary: true,
        addedAt: new Date()
      }] : [],
      createdAt: new Date(),
      uid: userRecord.uid,
      reputationScore: 1000, // New users start with full reputation
      lastReputationUpdate: new Date(),
      
      // KYC/AML fields
      kycStatus: {
        level: 'none',
        status: 'pending',
        lastUpdated: new Date(),
        expiryDate: null,
        reviewRequired: false
      },
      kycDocuments: {
        identity: {
          type: null,
          documentId: null,
          verified: false,
          extractedData: {
            documentNumber: null,
            fullName: null,
            dateOfBirth: null,
            expiryDate: null,
            nationality: null,
            mrz: null
          },
          uploadedAt: null,
          verifiedAt: null
        },
        proofOfAddress: {
          type: null,
          documentId: null,
          verified: false,
          extractedAddress: null,
          uploadedAt: null
        },
        selfie: {
          imageId: null,
          livenessScore: 0,
          faceMatchScore: 0,
          uploadedAt: null
        }
      },
      amlStatus: {
        lastScreened: null,
        riskScore: 0,
        sanctions: {
          checked: false,
          matches: [],
          lastChecked: null
        },
        pep: {
          isPEP: false,
          details: null,
          lastChecked: null
        },
        adverseMedia: {
          hasAdverseMedia: false,
          sources: [],
          lastChecked: null
        }
      },
      verificationHistory: [],
      riskProfile: {
        overallRisk: 'low',
        factors: {
          geographic: 0,
          transactional: 0,
          behavioral: 0,
          documentary: 0
        },
        requiresManualReview: false,
        lastCalculated: new Date()
      }
    };
    
    try {
      await db.collection('users').doc(userRecord.uid).set(userProfileData);
      console.log(`/signUpEmailPass: User profile created in Firestore for UID: ${userRecord.uid}`);
    } catch (firestoreError) {
      console.error('/signUpEmailPass: Error creating user profile in Firestore:', firestoreError);
    }
    
    // For production environments, add admin claim
    if (!currentIsTest && config.get('ALLOWED_EMAILS')) {
      const allowedEmails = config.get('ALLOWED_EMAILS').split(',').map(e => e.trim().toLowerCase());
      if (allowedEmails.includes(email.toLowerCase())) {
        await auth.setCustomUserClaims(userRecord.uid, { admin: true });
        console.log(`/signUpEmailPass: Admin claims set for user ${userRecord.uid}`);
      }
    }
    
    // Create a custom token first
    const customToken = await auth.createCustomToken(userRecord.uid);
    
    // Convert custom token to ID token
    const idToken = await getIdTokenFromCustomToken(customToken);
    
    console.log(`/signUpEmailPass: User created successfully: ${userRecord.uid}`);
    res.status(200).json({ 
      message: "User created successfully", 
      token: idToken,  // Return ID token instead of custom token
      tokenType: 'id', // Indicate this is an ID token
      userId: userRecord.uid,
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
  await ensureConfig();
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
    if (!currentIsTest && config.get('ALLOWED_EMAILS')) {
      const allowedEmails = config.get('ALLOWED_EMAILS').split(',').map(e => e.trim().toLowerCase());
      if (!allowedEmails.includes(email.toLowerCase())) {
        console.log(`/signInEmailPass: Email not in allowed list: ${email}`);
        return res.status(403).json({ error: 'Access denied' });
      }
      console.log(`/signInEmailPass: Admin user ${userRecord.uid} signed in.`);
    } else {
      console.log(`/signInEmailPass: Test user ${userRecord.uid} signed in.`);
    }

    // Create a custom token
    const customToken = await auth.createCustomToken(userRecord.uid);
    
    // Convert custom token to ID token
    const idToken = await getIdTokenFromCustomToken(customToken);
    
    res.status(200).json({ 
      message: "User signed in successfully", 
      token: idToken,  // Return ID token instead of custom token
      tokenType: 'id', // Indicate this is an ID token
      userId: userRecord.uid,
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
  await ensureConfig();
  const { idToken } = req.body;
  const currentIsTest = process.env.NODE_ENV === 'test';

  if (!idToken) {
    console.log("/signInGoogle: ID token missing.");
    return res.status(400).json({ error: "ID token is required" });
  }

  try {
    const { auth, db } = await getFirebaseServices();
    
    // Verify the Google ID token
    const decodedToken = await auth.verifyIdToken(idToken);
    const uid = decodedToken.uid;
    const email = decodedToken.email;

    console.log(`/signInGoogle: User ${uid} signed in via Google.`);

    // Check if this is the user's first sign-in
    let userProfile;
    try {
      const profileDoc = await db.collection('users').doc(uid).get();
      if (!profileDoc.exists) {
        // Create user profile for first-time Google sign-in with KYC fields
        userProfile = {
          email: email,
          first_name: decodedToken.name ? decodedToken.name.split(' ')[0] : '',
          last_name: decodedToken.name ? decodedToken.name.split(' ').slice(1).join(' ') : '',
          phone_number: '',
          wallets: [],
          createdAt: new Date(),
          uid: uid,
          reputationScore: 1000, // New users start with full reputation
          lastReputationUpdate: new Date(),
          
          // KYC/AML fields
          kycStatus: {
            level: 'none',
            status: 'pending',
            lastUpdated: new Date(),
            expiryDate: null,
            reviewRequired: false
          },
          kycDocuments: {
            identity: {
              type: null,
              documentId: null,
              verified: false,
              extractedData: {
                documentNumber: null,
                fullName: null,
                dateOfBirth: null,
                expiryDate: null,
                nationality: null,
                mrz: null
              },
              uploadedAt: null,
              verifiedAt: null
            },
            proofOfAddress: {
              type: null,
              documentId: null,
              verified: false,
              extractedAddress: null,
              uploadedAt: null
            },
            selfie: {
              imageId: null,
              livenessScore: 0,
              faceMatchScore: 0,
              uploadedAt: null
            }
          },
          amlStatus: {
            lastScreened: null,
            riskScore: 0,
            sanctions: {
              checked: false,
              matches: [],
              lastChecked: null
            },
            pep: {
              isPEP: false,
              details: null,
              lastChecked: null
            },
            adverseMedia: {
              hasAdverseMedia: false,
              sources: [],
              lastChecked: null
            }
          },
          verificationHistory: [],
          riskProfile: {
            overallRisk: 'low',
            factors: {
              geographic: 0,
              transactional: 0,
              behavioral: 0,
              documentary: 0
            },
            requiresManualReview: false,
            lastCalculated: new Date()
          }
        };
        await db.collection('users').doc(uid).set(userProfile);
        console.log(`/signInGoogle: Created profile for new Google user ${uid}`);
      } else {
        userProfile = profileDoc.data();
      }
    } catch (profileError) {
      console.error('/signInGoogle: Error managing user profile:', profileError);
    }

    // For production environments, verify admin claims
    if (!currentIsTest && config.get('ALLOWED_EMAILS')) {
      const allowedEmails = config.get('ALLOWED_EMAILS').split(',').map(e => e.trim().toLowerCase());
      if (!allowedEmails.includes(email.toLowerCase())) {
        console.log(`/signInGoogle: Email not in allowed list: ${email}`);
        return res.status(403).json({ error: 'Access denied' });
      }
      
      // Set admin claim if needed
      const userRecord = await auth.getUser(uid);
      if (!userRecord.customClaims?.admin) {
        await auth.setCustomUserClaims(uid, { admin: true });
        console.log(`/signInGoogle: Admin claims set for user ${uid}`);
      }
    }

    // Since we already have an ID token from Google, we can return it directly
    res.status(200).json({ 
      message: "User signed in successfully via Google",
      token: idToken, // This is already an ID token
      tokenType: 'id',
      userId: uid,
      user: { uid: uid, email: email }
    });
  } catch (error) {
    console.error('/signInGoogle: Google sign-in error:', error);
    res.status(401).json({ error: 'Invalid Google ID token' });
  }
});

// Token refresh endpoint
router.post("/refreshToken", async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(400).json({ error: "Refresh token is required" });
  }

  try {
    // In a real implementation, you would verify the refresh token
    // and issue a new ID token. For now, we'll return an error
    // indicating this endpoint needs implementation
    res.status(501).json({ 
      error: "Token refresh not implemented. Please sign in again." 
    });
  } catch (error) {
    console.error('/refreshToken: Error:', error);
    res.status(401).json({ error: 'Invalid refresh token' });
  }
});

export default router;