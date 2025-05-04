import express from 'express';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { adminApp } from '../auth/admin.js';
const router = express.Router();

// Initialize Firestore
const db = getFirestore(adminApp);

// Middleware to verify Firebase ID token and extract userId
const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized: Missing or invalid Authorization header' });
    }

    const idToken = authHeader.split('Bearer ')[1];
    const decodedToken = await getAuth().verifyIdToken(idToken);
    req.userId = decodedToken.uid; // Attach userId to request object
    next();
  } catch (error) {
    console.error('Error verifying ID token:', error);
    res.status(401).json({ error: 'Unauthorized: Invalid ID token' });
  }
};

// POST route to add a wallet to the signed-in user's document in Firestore
router.post('/add-wallet', authMiddleware, async (req, res) => {
  try {
    const userId = req.userId; // Get userId from authMiddleware
    const { walletType, walletID } = req.body;

    // Validate input
    if (!walletType || !walletID) {
      return res.status(400).json({ error: 'walletType and walletID are required' });
    }
    if (!['Metamask', 'Coinbase'].includes(walletType)) {
      return res.status(400).json({ error: 'walletType must be Metamask or Coinbase' });
    }
    if (typeof walletID !== 'string' || walletID.length < 1) {
      return res.status(400).json({ error: 'walletID must be a non-empty string' });
    }

    // Reference to the user's document in the "users" collection
    const userRef = db.collection('users').doc(userId);

    // Check if user exists
    const userDoc = await userRef.get();
    if (!userDoc.exists) {
      // Create a user document if it doesn't exist
      await userRef.set({ wallets: [] }, { merge: true });
    }

    // Get current wallets array
    const userData = (await userRef.get()).data();
    let wallets = userData.wallets || [];

    // Clean up wallets array: remove invalid entries (e.g., empty strings)
    wallets = wallets.filter((wallet) => {
      return typeof wallet === 'object' && wallet.walletType && wallet.walletID;
    });

    // Check for duplicate walletID in the cleaned wallets array
    if (wallets.some((wallet) => wallet.walletID === walletID)) {
      return res.status(409).json({ error: 'WalletID already exists for this user' });
    }

    // Add new wallet to the array
    const newWallet = { walletType, walletID, createdAt: FieldValue.serverTimestamp() };
    wallets.push(newWallet);

    // Update the user's document with the cleaned and updated wallets array
    await userRef.update({
      wallets: wallets,
    });

    // Respond with success
    res.status(201).json({ message: 'Wallet added successfully', wallet: newWallet, wallets });
  } catch (error) {
    console.error('Error adding wallet:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET route to retrieve the signed-in user's wallets from Firestore
router.get('/wallets', authMiddleware, async (req, res) => {
  try {
    const userId = req.userId; // Get userId from authMiddleware

    // Reference to the user's document in the "users" collection
    const userRef = db.collection('users').doc(userId);

    // Get the user document
    const userDoc = await userRef.get();
    if (!userDoc.exists) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Retrieve wallets array
    const userData = userDoc.data();
    const wallets = userData.wallets || [];

    // Respond with the wallets
    res.status(200).json({ wallets });
  } catch (error) {
    console.error('Error retrieving wallets:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;