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
  getBridgeInfo,
  getOptimalBridgeRoute
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
  const isTest = process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'e2e_test';
  
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  try {
    const { auth } = await getFirebaseServices();
    
    if (isTest) {
      // In test mode, handle various token formats and audience mismatches
      console.log(`🧪 Test mode authentication for token: ${token.substring(0, 50)}...`);
      
      try {
        // First try to verify as ID token - but in test mode, allow different audiences
        const decodedToken = await auth.verifyIdToken(token, false); // Don't check revocation in test
        req.userId = decodedToken.uid;
        console.log(`🧪 Test mode: ID token verified for user ${req.userId}`);
        next();
        return;
      } catch (idTokenError) {
        console.log(`🧪 Test mode: ID token verification failed (${idTokenError.code}), trying fallback methods...`);
        
        // Handle audience mismatch errors gracefully
        if (idTokenError.code === 'auth/argument-error' || 
            idTokenError.message.includes('incorrect "aud"') ||
            idTokenError.message.includes('audience')) {
          try {
            // Manually decode the JWT payload to extract UID for audience mismatch cases
            const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
            console.log(`🧪 Test mode: Manually decoded token payload, checking for UID...`);
            
            if (payload.user_id || payload.uid) {
              const uid = payload.user_id || payload.uid;
              // Verify the user exists in our system
              const userRecord = await auth.getUser(uid);
              req.userId = userRecord.uid;
              console.log(`🧪 Test mode: Audience mismatch handled, verified user ${req.userId}`);
              next();
              return;
            } else if (payload.sub) {
              // Try 'sub' claim as fallback (standard JWT claim)
              const userRecord = await auth.getUser(payload.sub);
              req.userId = userRecord.uid;
              console.log(`🧪 Test mode: Used 'sub' claim for user ${req.userId}`);
              next();
              return;
            }
          } catch (manualDecodeError) {
            console.log(`🧪 Test mode: Manual ID token decode failed: ${manualDecodeError.message}`);
          }
        }
        
        // If still failing, try as custom token
        try {
          const customTokenPayload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
          if (customTokenPayload.uid) {
            // Verify the user exists
            const userRecord = await auth.getUser(customTokenPayload.uid);
            req.userId = userRecord.uid;
            console.log(`🧪 Test mode: Custom token verified for user ${req.userId}`);
            next();
            return;
          } else {
            throw new Error('No UID found in custom token');
          }
        } catch (customTokenError) {
          console.error(`🧪 Test mode: All authentication methods failed:`, {
            idTokenError: idTokenError.code || idTokenError.message,
            customTokenError: customTokenError.message
          });
          return res.status(403).json({ error: 'Invalid or expired token' });
        }
      }
    } else {
      // Production mode - only accept ID tokens
      const decodedToken = await auth.verifyIdToken(token);
      req.userId = decodedToken.uid;
      next();
    }
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
      addedAt: new Date(),
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
        return { ...w, balance, lastBalanceUpdate: new Date() };
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
    const { detectedWallets, walletDetails } = req.body;

    if (!detectedWallets) {
      return res.status(400).json({ error: 'Detected wallets data is required' });
    }

    const { db } = await getFirebaseServices();
    
    // Enhanced storage with chain compatibility info
    const userRef = db.collection('users').doc(userId);
    await userRef.update({
      lastWalletDetection: {
        timestamp: FieldValue.serverTimestamp(),
        evmWallets: detectedWallets.evmWallets?.length || 0,
        solanaWallets: detectedWallets.solanaWallets?.length || 0,
        bitcoinWallets: detectedWallets.bitcoinWallets?.length || 0,
        totalDetected: (detectedWallets.evmWallets?.length || 0) + 
                      (detectedWallets.solanaWallets?.length || 0) + 
                      (detectedWallets.bitcoinWallets?.length || 0),
        // New: Store detailed wallet capabilities
        walletCapabilities: walletDetails || {}
      },
      updatedAt: FieldValue.serverTimestamp()
    });

    // Check LI.FI compatibility for detected wallets
    const compatibilityCheck = await checkLiFiCompatibility(detectedWallets);

    console.log(`[WALLET] Enhanced wallet detection for user ${userId}:`, {
      evm: detectedWallets.evmWallets?.length || 0,
      solana: detectedWallets.solanaWallets?.length || 0,
      bitcoin: detectedWallets.bitcoinWallets?.length || 0,
      lifiCompatible: compatibilityCheck.compatible
    });

    res.status(200).json({
      message: 'Wallet detection data received successfully',
      lifiCompatibility: compatibilityCheck,
      supportedChains: compatibilityCheck.supportedChains || []
    });

  } catch (error) {
    console.error('[WALLET] Error processing wallet detection:', error);
    res.status(500).json({ error: 'Internal server error while processing wallet detection' });
  }
});

// New: Dynamic wallet capability endpoint - GET /api/wallets/capabilities/:walletAddress
router.get('/capabilities/:walletAddress', authenticateToken, async (req, res) => {
  try {
    const { walletAddress } = req.params;
    const { network } = req.query;

    // Validate wallet address
    const validation = validateWalletAddress(walletAddress, network);
    if (!validation.valid) {
      return res.status(400).json({ 
        success: false, 
        error: validation.error 
      });
    }

    // Check what chains this wallet can access through LI.FI
    const capabilities = await analyzeDynamicWalletCapabilities(walletAddress, network);

    res.json({
      success: true,
      wallet: walletAddress,
      network: network,
      capabilities,
      availableBridges: capabilities.bridges || [],
      supportedChains: capabilities.chains || []
    });

  } catch (error) {
    console.error('[WALLET] Error analyzing wallet capabilities:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to analyze wallet capabilities' 
    });
  }
});

// New: Get LI.FI supported chains - GET /api/wallets/supported-chains
router.get('/supported-chains', async (req, res) => {
  try {
    // This will eventually call LI.FI API
    const supportedChains = await getLiFiSupportedChains();
    
    res.json({
      success: true,
      chains: supportedChains,
      bridgeCount: 14,
      dexCount: 33,
      lastUpdated: new Date().toISOString()
    });

  } catch (error) {
    console.error('[WALLET] Error fetching supported chains:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch supported chains'
    });
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

// Helper functions for enhanced wallet detection
async function checkLiFiCompatibility(detectedWallets) {
  try {
    // Import and use actual LI.FI service
    const { initializeLiFiChains } = await import('../../../services/crossChainService.js');
    
    const supportedChains = await initializeLiFiChains();
    
    return {
      compatible: true,
      supportedChains: supportedChains.map(chain => chain.name.toLowerCase()),
      bridgeCount: 14, // LI.FI aggregates 14+ bridges
      dexCount: 33,    // LI.FI aggregates 33+ DEXs
      evmSupported: (detectedWallets.evmWallets?.length || 0) > 0,
      solanaSupported: (detectedWallets.solanaWallets?.length || 0) > 0,
      chainsAvailable: supportedChains.length
    };
  } catch (error) {
    console.error('[WALLET] LI.FI compatibility check failed:', error);
    // Fallback to basic compatibility
    return {
      compatible: true,
      supportedChains: ['ethereum', 'polygon', 'bsc', 'arbitrum', 'optimism'],
      bridgeCount: 14,
      dexCount: 33,
      evmSupported: (detectedWallets.evmWallets?.length || 0) > 0,
      solanaSupported: (detectedWallets.solanaWallets?.length || 0) > 0,
      error: 'Using fallback data - LI.FI service unavailable'
    };
  }
}

async function analyzeDynamicWalletCapabilities(walletAddress, network) {
  try {
    // Import LI.FI service for real capability analysis
    const LiFiBridgeService = await import('../../../services/lifiService.js');
    const lifiService = new LiFiBridgeService.default();
    
    const capabilities = {
      network,
      walletAddress,
      canBridge: true,
      estimatedTime: '15-45 minutes'
    };

    // Get real supported chains from LI.FI
    const supportedChains = await lifiService.getSupportedChains();
    const currentChainId = getChainIdFromNetwork(network);
    
    // Find current chain in LI.FI data
    const currentChain = supportedChains.find(chain => 
      chain.chainId === currentChainId || 
      chain.name.toLowerCase() === network.toLowerCase()
    );

    if (currentChain) {
      // Get chains that can bridge to/from current network
      const compatibleChains = supportedChains
        .filter(chain => chain.chainId !== currentChainId)
        .map(chain => chain.name.toLowerCase())
        .slice(0, 10); // Limit to top 10 for performance

      capabilities.chains = compatibleChains;
      capabilities.bridges = ['lifi', 'across', 'stargate', 'hop', 'connext']; // LI.FI aggregated bridges
      capabilities.nativeToken = currentChain.nativeCurrency?.symbol || 'ETH';
      capabilities.lifiSupported = true;
    } else {
      // Fallback for unsupported networks
      capabilities.chains = getDefaultCompatibleChains(network);
      capabilities.bridges = ['lifi'];
      capabilities.lifiSupported = false;
      capabilities.warning = 'Network not fully supported by LI.FI';
    }

    // Add real fee estimation if possible
    try {
      if (capabilities.chains.length > 0) {
        const sampleRoute = await lifiService.estimateBridgeFees({
          fromChainId: network,
          toChainId: capabilities.chains[0],
          fromTokenAddress: '0x0000000000000000000000000000000000000000', // Native token
          amount: '1000000000000000000', // 1 ETH equivalent
          fromAddress: walletAddress
        });
        
        capabilities.estimatedFees = `$${sampleRoute.totalFees.toFixed(2)}`;
        capabilities.estimatedTime = `${Math.round(sampleRoute.estimatedTime / 60)} minutes`;
      }
    } catch (feeError) {
      console.warn('[WALLET] Fee estimation failed:', feeError.message);
      capabilities.estimatedFees = 'Unavailable';
    }

    return capabilities;
  } catch (error) {
    console.error('[WALLET] Dynamic capability analysis failed:', error);
    // Fallback to static analysis
    return getStaticWalletCapabilities(walletAddress, network);
  }
}

async function getLiFiSupportedChains() {
  try {
    // Import and use actual LI.FI service
    const LiFiBridgeService = await import('../../../services/lifiService.js');
    const lifiService = new LiFiBridgeService.default();
    
    const chains = await lifiService.getSupportedChains();
    
    return chains.map(chain => ({
      chainId: chain.chainId,
      name: chain.name,
      symbol: chain.nativeCurrency?.symbol || 'ETH',
      isEVM: chain.chainId < 1000000, // Simple heuristic for EVM chains
      bridgeSupported: chain.bridgeSupported,
      dexSupported: chain.dexSupported
    }));
  } catch (error) {
    console.error('[WALLET] Failed to get LI.FI supported chains:', error);
    // Return fallback chain list
    return [
      { chainId: 1, name: 'Ethereum', symbol: 'ETH', isEVM: true, bridgeSupported: true },
      { chainId: 137, name: 'Polygon', symbol: 'MATIC', isEVM: true, bridgeSupported: true },
      { chainId: 56, name: 'BSC', symbol: 'BNB', isEVM: true, bridgeSupported: true },
      { chainId: 42161, name: 'Arbitrum', symbol: 'ETH', isEVM: true, bridgeSupported: true },
      { chainId: 10, name: 'Optimism', symbol: 'ETH', isEVM: true, bridgeSupported: true },
      { chainId: 43114, name: 'Avalanche', symbol: 'AVAX', isEVM: true, bridgeSupported: true },
      { chainId: 250, name: 'Fantom', symbol: 'FTM', isEVM: true, bridgeSupported: true },
      { name: 'Solana', symbol: 'SOL', isEVM: false, bridgeSupported: true }
    ];
  }
}

// Helper functions
function getChainIdFromNetwork(network) {
  const networkMapping = {
    'ethereum': 1,
    'polygon': 137,
    'bsc': 56,
    'arbitrum': 42161,
    'optimism': 10,
    'avalanche': 43114,
    'fantom': 250
  };
  return networkMapping[network.toLowerCase()] || 1;
}

function getDefaultCompatibleChains(network) {
  // Static fallback compatibility mapping
  const chainMappings = {
    'ethereum': ['polygon', 'bsc', 'arbitrum', 'optimism', 'avalanche'],
    'polygon': ['ethereum', 'bsc', 'arbitrum', 'avalanche'],
    'bsc': ['ethereum', 'polygon', 'avalanche'],
    'arbitrum': ['ethereum', 'polygon', 'optimism'],
    'optimism': ['ethereum', 'arbitrum', 'polygon'],
    'avalanche': ['ethereum', 'polygon', 'bsc'],
    'solana': ['ethereum', 'polygon', 'bsc'],
    'fantom': ['ethereum', 'polygon']
  };
  return chainMappings[network.toLowerCase()] || ['ethereum'];
}

function getStaticWalletCapabilities(walletAddress, network) {
  // Fallback static analysis
  return {
    network,
    walletAddress,
    canBridge: true,
    estimatedTime: '15-45 minutes',
    chains: getDefaultCompatibleChains(network),
    bridges: ['lifi'],
    estimatedFees: 'Estimate unavailable',
    lifiSupported: false,
    fallbackMode: true
  };
}

// New: Get optimal bridge route between buyer and seller wallets - POST /api/wallets/optimal-route
router.post('/optimal-route', authenticateToken, async (req, res) => {
  try {
    const userId = req.userId;
    const { 
      buyerWallet, 
      sellerWallet, 
      amount, 
      tokenAddress, 
      dealId 
    } = req.body;

    // Validate required fields
    if (!buyerWallet || !sellerWallet || !amount) {
      return res.status(400).json({
        success: false,
        error: 'Buyer wallet, seller wallet, and amount are required'
      });
    }

    // Validate wallet addresses
    const buyerValidation = validateWalletAddress(buyerWallet.address, buyerWallet.network);
    const sellerValidation = validateWalletAddress(sellerWallet.address, sellerWallet.network);

    if (!buyerValidation.valid) {
      return res.status(400).json({
        success: false,
        error: `Invalid buyer wallet: ${buyerValidation.error}`
      });
    }

    if (!sellerValidation.valid) {
      return res.status(400).json({
        success: false,
        error: `Invalid seller wallet: ${sellerValidation.error}`
      });
    }

    // Import cross-chain service
    const { getOptimalBridgeRoute, estimateTransactionFees } = await import('../../../services/crossChainService.js');

    let route = null;
    let feeEstimate = null;

    // Check if bridge is needed
    if (buyerWallet.network !== sellerWallet.network) {
      try {
        // Get optimal route using LI.FI
        route = await getOptimalBridgeRoute({
          sourceNetwork: buyerWallet.network,
          targetNetwork: sellerWallet.network,
          amount,
          tokenAddress: tokenAddress || '0x0000000000000000000000000000000000000000',
          fromAddress: buyerWallet.address,
          toAddress: sellerWallet.address,
          dealId: dealId || `route-${Date.now()}`
        });

        // Estimate fees
        feeEstimate = await estimateTransactionFees(
          buyerWallet.network,
          sellerWallet.network,
          amount,
          tokenAddress,
          buyerWallet.address
        );

      } catch (error) {
        console.error('[WALLET] Optimal route finding failed:', error);
        return res.status(400).json({
          success: false,
          error: `No bridge route available: ${error.message}`,
          fallback: {
            route: null,
            bridgeNeeded: true,
            supported: false
          }
        });
      }
    } else {
      // Same network - no bridge needed
      feeEstimate = await estimateTransactionFees(
        buyerWallet.network,
        sellerWallet.network,
        amount,
        tokenAddress,
        buyerWallet.address
      );
    }

    res.json({
      success: true,
      buyerWallet: {
        address: buyerWallet.address,
        network: buyerWallet.network
      },
      sellerWallet: {
        address: sellerWallet.address,
        network: sellerWallet.network
      },
      bridgeNeeded: buyerWallet.network !== sellerWallet.network,
      route,
      feeEstimate,
      escrowNetwork: 'ethereum', // Always use Ethereum for escrow contracts
      totalTime: route?.estimatedTime || feeEstimate?.estimatedTime || '1-5 minutes',
      confidence: route?.confidence || feeEstimate?.confidence || '95%'
    });

  } catch (error) {
    console.error('[WALLET] Error finding optimal route:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to find optimal route'
    });
  }
});

// New: Prepare cross-chain escrow transaction - POST /api/wallets/prepare-escrow
router.post('/prepare-escrow', authenticateToken, async (req, res) => {
  try {
    const userId = req.userId;
    const {
      buyerWallet,
      sellerWallet,
      amount,
      tokenAddress,
      propertyAddress,
      dealId
    } = req.body;

    // Validate required fields
    if (!buyerWallet || !sellerWallet || !amount || !dealId) {
      return res.status(400).json({
        success: false,
        error: 'Buyer wallet, seller wallet, amount, and deal ID are required'
      });
    }

    // Import cross-chain service
    const { prepareCrossChainTransaction } = await import('../../../services/crossChainService.js');

    console.log(`[WALLET] Preparing escrow transaction for deal ${dealId}`);

    // Prepare the cross-chain transaction using LI.FI
    const transaction = await prepareCrossChainTransaction({
      fromAddress: buyerWallet.address,
      toAddress: sellerWallet.address,
      amount,
      tokenAddress: tokenAddress || '0x0000000000000000000000000000000000000000',
      sourceNetwork: buyerWallet.network,
      targetNetwork: sellerWallet.network,
      dealId,
      userId,
      propertyAddress
    });

    res.json({
      success: true,
      transaction: {
        id: transaction.id,
        dealId: transaction.dealId,
        fromAddress: transaction.fromAddress,
        toAddress: transaction.toAddress,
        amount: transaction.amount,
        sourceNetwork: transaction.sourceNetwork,
        targetNetwork: transaction.targetNetwork,
        needsBridge: transaction.needsBridge,
        bridgeInfo: transaction.bridgeInfo,
        feeEstimate: transaction.feeEstimate,
        steps: transaction.steps,
        status: transaction.status
      },
      nextSteps: {
        userAction: transaction.needsBridge 
          ? 'Initiate bridge transfer through your wallet'
          : 'Execute direct transfer',
        estimatedTime: transaction.feeEstimate?.estimatedTime || '15-45 minutes'
      }
    });

  } catch (error) {
    console.error('[WALLET] Error preparing escrow transaction:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to prepare escrow transaction',
      details: error.message
    });
  }
});

// New: Get user's preferred wallets for escrow - GET /api/wallets/preferred-for-escrow
router.get('/preferred-for-escrow', authenticateToken, async (req, res) => {
  try {
    const userId = req.userId;
    const { amount, counterpartyNetwork } = req.query;

    const { db } = await getFirebaseServices();
    const userDoc = await db.collection('users').doc(userId).get();
    
    if (!userDoc.exists) {
      return res.status(404).json({ error: 'User profile not found' });
    }

    const userData = userDoc.data();
    const wallets = userData.wallets || [];

    if (wallets.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No wallets found. Please connect a wallet first.'
      });
    }

    // Analyze wallets for escrow suitability
    const walletAnalysis = await Promise.all(
      wallets.map(async (wallet) => {
        try {
          const capabilities = await analyzeDynamicWalletCapabilities(wallet.address, wallet.network);
          
          // Calculate suitability score
          let suitabilityScore = 0;
          
          // Primary wallet bonus
          if (wallet.isPrimary) suitabilityScore += 20;
          
          // LI.FI support bonus
          if (capabilities.lifiSupported) suitabilityScore += 30;
          
          // Counterparty compatibility
          if (counterpartyNetwork && capabilities.chains.includes(counterpartyNetwork.toLowerCase())) {
            suitabilityScore += 25;
          }
          
          // Fee efficiency (estimated)
          if (capabilities.estimatedFees && capabilities.estimatedFees !== 'Unavailable') {
            const feeAmount = parseFloat(capabilities.estimatedFees.replace('$', ''));
            if (feeAmount < 10) suitabilityScore += 15;
            else if (feeAmount < 50) suitabilityScore += 10;
            else suitabilityScore += 5;
          }

          // Speed bonus
          if (capabilities.estimatedTime.includes('15-45')) suitabilityScore += 10;

          return {
            ...wallet,
            capabilities,
            suitabilityScore,
            recommended: suitabilityScore >= 50
          };
        } catch (error) {
          console.warn(`[WALLET] Failed to analyze wallet ${wallet.address}:`, error);
          return {
            ...wallet,
            capabilities: { error: 'Analysis failed' },
            suitabilityScore: 0,
            recommended: false
          };
        }
      })
    );

    // Sort by suitability score
    const sortedWallets = walletAnalysis.sort((a, b) => b.suitabilityScore - a.suitabilityScore);
    
    // Get the best wallet for escrow
    const recommendedWallet = sortedWallets[0];

    res.json({
      success: true,
      wallets: sortedWallets,
      recommended: recommendedWallet,
      totalWallets: wallets.length,
      analysis: {
        amount: amount || 'Not specified',
        counterpartyNetwork: counterpartyNetwork || 'Not specified',
        bestScore: recommendedWallet?.suitabilityScore || 0,
        lifiCompatibleWallets: sortedWallets.filter(w => w.capabilities.lifiSupported).length
      }
    });

  } catch (error) {
    console.error('[WALLET] Error analyzing preferred wallets:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to analyze wallet preferences'
    });
  }
});

export default router; 