import express from 'express';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getAdminApp } from '../auth/admin.js';
import { isAddress } from 'ethers';
import { 
  prepareCrossChainTransaction,
  executeCrossChainStep,
  getCrossChainTransactionStatus,
  estimateTransactionFees,
  areNetworksEVMCompatible,
  getBridgeInfo
} from '../../../services/crossChainService.js';

const router = express.Router();

// Helper function to get Firebase services
async function getFirebaseServices() {
  const adminApp = await getAdminApp();
  return {
    db: getFirestore(adminApp),
    auth: getAuth(adminApp)
  };
}

// Authentication middleware
async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  try {
    const { auth } = await getFirebaseServices();
    const decodedToken = await auth.verifyIdToken(token);
    req.userId = decodedToken.uid;
    next();
  } catch (err) {
    console.error("[WALLET AUTH] Auth Error:", err.message);
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
}

// Validate wallet address based on network
function validateWalletAddress(address, network) {
  if (!address || !network) {
    return { valid: false, error: 'Address and network are required' };
  }

  switch (network) {
    case 'ethereum':
    case 'polygon':
    case 'bsc':
    case 'arbitrum':
    case 'optimism':
      // EVM networks - use ethers validation
      if (!isAddress(address)) {
        return { valid: false, error: 'Invalid EVM wallet address' };
      }
      break;
    
    case 'solana':
      // Solana address validation (base58, 32-44 characters)
      if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) {
        return { valid: false, error: 'Invalid Solana wallet address' };
      }
      break;
    
    case 'bitcoin':
      // Bitcoin address validation (basic patterns for P2PKH, P2SH, Bech32)
      const bitcoinRegex = /^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,59}$/;
      if (!bitcoinRegex.test(address)) {
        return { valid: false, error: 'Invalid Bitcoin wallet address' };
      }
      break;
    
    default:
      return { valid: false, error: 'Unsupported network' };
  }

  return { valid: true };
}

// Register/Update wallet - POST /api/wallets/register
router.post('/register', authenticateToken, async (req, res) => {
  try {
    const { address, name, network, publicKey, isPrimary } = req.body;
    const userId = req.userId;

    // Validate required fields
    if (!address || !name || !network) {
      return res.status(400).json({ 
        error: 'Address, name, and network are required' 
      });
    }

    // Validate wallet address
    const validation = validateWalletAddress(address, network);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    const { db } = await getFirebaseServices();
    
    // Get user document
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    
    if (!userDoc.exists) {
      return res.status(404).json({ error: 'User profile not found' });
    }

    const userData = userDoc.data();
    const currentWallets = userData.wallets || [];

    // Create wallet object
    const walletObject = {
      address: address.toLowerCase(),
      name,
      network,
      isPrimary: isPrimary || false,
      addedAt: FieldValue.serverTimestamp(),
      ...(publicKey && { publicKey })
    };

    // Check if wallet already exists
    const existingWalletIndex = currentWallets.findIndex(
      w => w.address?.toLowerCase() === address.toLowerCase() && w.network === network
    );

    let updatedWallets;
    if (existingWalletIndex >= 0) {
      // Update existing wallet
      updatedWallets = [...currentWallets];
      updatedWallets[existingWalletIndex] = {
        ...updatedWallets[existingWalletIndex],
        ...walletObject
      };
    } else {
      // Add new wallet
      updatedWallets = [...currentWallets, walletObject];
    }

    // If this is set as primary, unset other primary wallets
    if (isPrimary) {
      updatedWallets = updatedWallets.map(w => ({
        ...w,
        isPrimary: w.address?.toLowerCase() === address.toLowerCase() && w.network === network
      }));
    }

    // Update user document
    await userRef.update({
      wallets: updatedWallets,
      updatedAt: FieldValue.serverTimestamp()
    });

    console.log(`[WALLET] Registered wallet for user ${userId}:`, {
      address: address.toLowerCase(),
      name,
      network
    });

    res.status(201).json({
      message: 'Wallet registered successfully',
      wallet: walletObject
    });

  } catch (error) {
    console.error('[WALLET] Error registering wallet:', error);
    res.status(500).json({ error: 'Internal server error while registering wallet' });
  }
});

// Get all user wallets - GET /api/wallets
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.userId;
    const { db } = await getFirebaseServices();
    
    const userDoc = await db.collection('users').doc(userId).get();
    
    if (!userDoc.exists) {
      return res.status(404).json({ error: 'User profile not found' });
    }

    const userData = userDoc.data();
    const wallets = userData.wallets || [];

    // Transform wallets to frontend format
    const transformedWallets = wallets.map(wallet => ({
      address: wallet.address,
      name: wallet.name,
      network: wallet.network,
      isPrimary: wallet.isPrimary || false,
      publicKey: wallet.publicKey,
      addedAt: wallet.addedAt,
      balance: wallet.balance || '0'
    }));

    res.status(200).json({
      wallets: transformedWallets
    });

  } catch (error) {
    console.error('[WALLET] Error fetching wallets:', error);
    res.status(500).json({ error: 'Internal server error while fetching wallets' });
  }
});

// Remove wallet - DELETE /api/wallets/:address
router.delete('/:address', authenticateToken, async (req, res) => {
  try {
    const userId = req.userId;
    const { address } = req.params;
    const { network } = req.body;

    if (!address || !network) {
      return res.status(400).json({ error: 'Address and network are required' });
    }

    const { db } = await getFirebaseServices();
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    
    if (!userDoc.exists) {
      return res.status(404).json({ error: 'User profile not found' });
    }

    const userData = userDoc.data();
    const currentWallets = userData.wallets || [];

    // Filter out the wallet to remove
    const updatedWallets = currentWallets.filter(
      w => !(w.address?.toLowerCase() === address.toLowerCase() && w.network === network)
    );

    // If we removed the primary wallet, set another as primary
    const removedWallet = currentWallets.find(
      w => w.address?.toLowerCase() === address.toLowerCase() && w.network === network
    );

    if (removedWallet?.isPrimary && updatedWallets.length > 0) {
      updatedWallets[0].isPrimary = true;
    }

    // Update user document
    await userRef.update({
      wallets: updatedWallets,
      updatedAt: FieldValue.serverTimestamp()
    });

    console.log(`[WALLET] Removed wallet for user ${userId}:`, {
      address: address.toLowerCase(),
      network
    });

    res.status(200).json({
      message: 'Wallet removed successfully'
    });

  } catch (error) {
    console.error('[WALLET] Error removing wallet:', error);
    res.status(500).json({ error: 'Internal server error while removing wallet' });
  }
});

// Set primary wallet - PUT /api/wallets/primary
router.put('/primary', authenticateToken, async (req, res) => {
  try {
    const userId = req.userId;
    const { address, network } = req.body;

    if (!address || !network) {
      return res.status(400).json({ error: 'Address and network are required' });
    }

    const { db } = await getFirebaseServices();
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    
    if (!userDoc.exists) {
      return res.status(404).json({ error: 'User profile not found' });
    }

    const userData = userDoc.data();
    const currentWallets = userData.wallets || [];

    // Find the wallet to set as primary
    const walletExists = currentWallets.some(
      w => w.address?.toLowerCase() === address.toLowerCase() && w.network === network
    );

    if (!walletExists) {
      return res.status(404).json({ error: 'Wallet not found in user profile' });
    }

    // Update primary status
    const updatedWallets = currentWallets.map(w => ({
      ...w,
      isPrimary: w.address?.toLowerCase() === address.toLowerCase() && w.network === network
    }));

    // Update user document
    await userRef.update({
      wallets: updatedWallets,
      updatedAt: FieldValue.serverTimestamp()
    });

    console.log(`[WALLET] Set primary wallet for user ${userId}:`, {
      address: address.toLowerCase(),
      network
    });

    res.status(200).json({
      message: 'Primary wallet updated successfully'
    });

  } catch (error) {
    console.error('[WALLET] Error setting primary wallet:', error);
    res.status(500).json({ error: 'Internal server error while setting primary wallet' });
  }
});

// Update wallet balance - PUT /api/wallets/balance
router.put('/balance', authenticateToken, async (req, res) => {
  try {
    const userId = req.userId;
    const { address, network, balance } = req.body;

    if (!address || !network || balance === undefined) {
      return res.status(400).json({ error: 'Address, network, and balance are required' });
    }

    const { db } = await getFirebaseServices();
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    
    if (!userDoc.exists) {
      return res.status(404).json({ error: 'User profile not found' });
    }

    const userData = userDoc.data();
    const currentWallets = userData.wallets || [];

    // Find and update wallet balance
    const updatedWallets = currentWallets.map(w => {
      if (w.address?.toLowerCase() === address.toLowerCase() && w.network === network) {
        return { ...w, balance, lastBalanceUpdate: FieldValue.serverTimestamp() };
      }
      return w;
    });

    // Update user document
    await userRef.update({
      wallets: updatedWallets,
      updatedAt: FieldValue.serverTimestamp()
    });

    res.status(200).json({
      message: 'Wallet balance updated successfully'
    });

  } catch (error) {
    console.error('[WALLET] Error updating wallet balance:', error);
    res.status(500).json({ error: 'Internal server error while updating wallet balance' });
  }
});

// Get wallet preferences - GET /api/wallets/preferences
router.get('/preferences', authenticateToken, async (req, res) => {
  try {
    const userId = req.userId;
    const { db } = await getFirebaseServices();
    
    const userDoc = await db.collection('users').doc(userId).get();
    
    if (!userDoc.exists) {
      return res.status(404).json({ error: 'User profile not found' });
    }

    const userData = userDoc.data();
    const wallets = userData.wallets || [];

    // Find primary wallet
    const primaryWallet = wallets.find(w => w.isPrimary);
    
    // Get preferred networks from user's wallets
    const preferredNetworks = [...new Set(wallets.map(w => w.network))];

    const preferences = {
      primaryWallet: primaryWallet ? {
        address: primaryWallet.address,
        network: primaryWallet.network
      } : null,
      preferredNetworks
    };

    res.status(200).json({
      preferences
    });

  } catch (error) {
    console.error('[WALLET] Error fetching wallet preferences:', error);
    res.status(500).json({ error: 'Internal server error while fetching wallet preferences' });
  }
});

// Send detected wallets to backend - POST /api/wallets/detection
router.post('/detection', authenticateToken, async (req, res) => {
  try {
    const userId = req.userId;
    const { detectedWallets } = req.body;

    if (!detectedWallets) {
      return res.status(400).json({ error: 'Detected wallets data is required' });
    }

    const { db } = await getFirebaseServices();
    
    // Store detection result in user's profile
    const userRef = db.collection('users').doc(userId);
    await userRef.update({
      lastWalletDetection: {
        timestamp: FieldValue.serverTimestamp(),
        evmWallets: detectedWallets.evmWallets?.length || 0,
        solanaWallets: detectedWallets.solanaWallets?.length || 0,
        bitcoinWallets: detectedWallets.bitcoinWallets?.length || 0,
        totalDetected: (detectedWallets.evmWallets?.length || 0) + 
                      (detectedWallets.solanaWallets?.length || 0) + 
                      (detectedWallets.bitcoinWallets?.length || 0)
      },
      updatedAt: FieldValue.serverTimestamp()
    });

    console.log(`[WALLET] Received wallet detection for user ${userId}:`, {
      evm: detectedWallets.evmWallets?.length || 0,
      solana: detectedWallets.solanaWallets?.length || 0,
      bitcoin: detectedWallets.bitcoinWallets?.length || 0
    });

    res.status(200).json({
      message: 'Wallet detection data received successfully'
    });

  } catch (error) {
    console.error('[WALLET] Error processing wallet detection:', error);
    res.status(500).json({ error: 'Internal server error while processing wallet detection' });
  }
});

/**
 * Estimate fees for cross-chain transaction
 */
router.post('/cross-chain/estimate-fees', async (req, res) => {
  try {
    const { sourceNetwork, targetNetwork, amount } = req.body;

    if (!sourceNetwork || !targetNetwork || !amount) {
      return res.status(400).json({
        success: false,
        message: 'Source network, target network, and amount are required'
      });
    }

    const feeEstimate = await estimateTransactionFees(sourceNetwork, targetNetwork, amount);
    const isEVMCompatible = areNetworksEVMCompatible(sourceNetwork, targetNetwork);
    const bridgeInfo = getBridgeInfo(sourceNetwork, targetNetwork);

    console.log(`[WALLET] Cross-chain fee estimate: ${sourceNetwork} -> ${targetNetwork}`);

    res.json({
      success: true,
      data: {
        feeEstimate,
        isEVMCompatible,
        bridgeInfo,
        requiresBridge: !isEVMCompatible
      }
    });
  } catch (error) {
    console.error('[WALLET] Error estimating cross-chain fees:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to estimate fees',
      error: error.message
    });
  }
});

/**
 * Prepare a cross-chain transaction for escrow
 */
router.post('/cross-chain/prepare', async (req, res) => {
  try {
    const {
      fromAddress,
      toAddress,
      amount,
      sourceNetwork,
      targetNetwork,
      dealId
    } = req.body;

    // Validate required fields
    if (!fromAddress || !toAddress || !amount || !sourceNetwork || !targetNetwork || !dealId) {
      return res.status(400).json({
        success: false,
        message: 'All transaction parameters are required'
      });
    }

    // Get user ID from session/token (assuming it's available in req.user)
    const userId = req.user?.uid || 'anonymous';

    const transaction = await prepareCrossChainTransaction({
      fromAddress,
      toAddress,
      amount,
      sourceNetwork,
      targetNetwork,
      dealId,
      userId
    });

    console.log(`[WALLET] Prepared cross-chain transaction: ${transaction.id}`);

    res.json({
      success: true,
      data: transaction
    });
  } catch (error) {
    console.error('[WALLET] Error preparing cross-chain transaction:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to prepare transaction',
      error: error.message
    });
  }
});

/**
 * Execute a step in cross-chain transaction
 */
router.post('/cross-chain/:transactionId/execute-step', async (req, res) => {
  try {
    const { transactionId } = req.params;
    const { stepNumber, txHash } = req.body;

    if (!stepNumber) {
      return res.status(400).json({
        success: false,
        message: 'Step number is required'
      });
    }

    const result = await executeCrossChainStep(transactionId, stepNumber, txHash);

    console.log(`[WALLET] Executed step ${stepNumber} for transaction ${transactionId}`);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('[WALLET] Error executing cross-chain step:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to execute transaction step',
      error: error.message
    });
  }
});

/**
 * Get cross-chain transaction status
 */
router.get('/cross-chain/:transactionId/status', async (req, res) => {
  try {
    const { transactionId } = req.params;

    const transaction = await getCrossChainTransactionStatus(transactionId);

    res.json({
      success: true,
      data: transaction
    });
  } catch (error) {
    console.error('[WALLET] Error getting cross-chain transaction status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get transaction status',
      error: error.message
    });
  }
});

/**
 * Get supported networks and bridge information
 */
router.get('/cross-chain/networks', async (req, res) => {
  try {
    const networks = {
      ethereum: { name: 'Ethereum', symbol: 'ETH', isEVM: true },
      polygon: { name: 'Polygon', symbol: 'MATIC', isEVM: true },
      bsc: { name: 'Binance Smart Chain', symbol: 'BNB', isEVM: true },
      solana: { name: 'Solana', symbol: 'SOL', isEVM: false },
      bitcoin: { name: 'Bitcoin', symbol: 'BTC', isEVM: false }
    };

    res.json({
      success: true,
      data: { networks }
    });
  } catch (error) {
    console.error('[WALLET] Error getting networks:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get networks',
      error: error.message
    });
  }
});

export default router; 