import express from 'express';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getAdminApp } from '../auth/admin.js';
import { isAddress } from 'ethers';

// Import the new V3 escrow service
import { EscrowServiceV3 } from '../../../services/escrowServiceV3.js';

// Initialize escrow service
const escrowService = new EscrowServiceV3();

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
  const isTest = process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'e2e_test' || process.env.NODE_ENV === 'staging';
  
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
    case 'sepolia':
    case 'polygon':
    case 'polygon-amoy':
    case 'bsc':
    case 'arbitrum':
    case 'arbitrum-sepolia':
    case 'optimism':
    case 'base':
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

// Helper function to determine chain ID from network name
function getChainId(network) {
  const chainMap = {
    'ethereum': 1,
    'sepolia': 11155111,
    'arbitrum': 42161,
    'arbitrum-sepolia': 421614,
    'polygon': 137,
    'polygon-amoy': 80002,
    'optimism': 10,
    'base': 8453
  };
  return chainMap[network.toLowerCase()] || null;
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
      w => w.address.toLowerCase() === address.toLowerCase() && w.network === network
    );

    if (existingWalletIndex !== -1) {
      // Update existing wallet
      currentWallets[existingWalletIndex] = {
        ...currentWallets[existingWalletIndex],
        ...walletObject,
        addedAt: currentWallets[existingWalletIndex].addedAt // Preserve original timestamp
      };
    } else {
      // Add new wallet
      currentWallets.push(walletObject);
    }

    // If this is marked as primary, unmark all others (only one primary allowed)
    if (isPrimary) {
      currentWallets.forEach(w => {
        if (w.address.toLowerCase() !== address.toLowerCase() || w.network !== network) {
          w.isPrimary = false;
        }
      });
    }

    // Update user document
    await userRef.update({
      wallets: currentWallets,
      [`walletAddresses.${network}`]: address // Quick lookup field
    });

    return res.status(201).json({
      message: 'Wallet registered successfully',
      wallet: walletObject
    });
    
  } catch (error) {
    console.error("[WALLET REGISTER] Error:", error);
    return res.status(500).json({ error: 'Failed to register wallet' });
  }
});

// Get user wallets - GET /api/wallets
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

    return res.json({
      wallets
    });
    
  } catch (error) {
    console.error("[WALLET GET] Error:", error);
    return res.status(500).json({ error: 'Failed to get wallets' });
  }
});

// Get supported chains - GET /api/wallets/chains
router.get('/chains', async (req, res) => {
  try {
    await escrowService.initialize();
    
    const chains = Object.entries(escrowService.chainConfigs).map(([chainId, config]) => ({
      chainId: parseInt(chainId),
      name: config.name,
      displayName: config.name.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase()),
      explorerUrl: config.explorerUrl,
      contractAddress: config.contractAddress,
      hasStargate: !!config.stargateRouter,
      hasLayerZero: !!config.layerZeroEndpointId,
      supportedTokens: ['ETH', 'USDC', 'USDT'] // Simplified for now
    }));

    res.json({
      success: true,
      chains
    });
  } catch (error) {
    console.error("[GET CHAINS] Error:", error);
    res.status(500).json({ error: 'Failed to get supported chains' });
  }
});

// Get supported tokens for a chain - GET /api/wallets/tokens/:chainId
router.get('/tokens/:chainId', async (req, res) => {
  try {
    const { chainId } = req.params;
    await escrowService.initialize();
    
    const config = escrowService.chainConfigs[chainId];
    if (!config) {
      return res.status(404).json({ error: 'Chain not supported' });
    }

    // Get common tokens - in production, this would be more comprehensive
    const tokens = [
      {
        address: '0x0000000000000000000000000000000000000000',
        symbol: 'ETH',
        name: 'Ether',
        decimals: 18,
        isNative: true
      }
    ];

    // Add USDC if available
    if (chainId === '11155111') { // Sepolia
      tokens.push({
        address: '0x2F6F07CDcf3588944Bf4C42aC74ff24bF56e7590',
        symbol: 'USDC',
        name: 'USD Coin',
        decimals: 6,
        isNative: false
      });
    } else if (chainId === '421614') { // Arbitrum Sepolia
      tokens.push({
        address: '0x3253a335E7bFfB4790Aa4C25C4250d206E9b9773',
        symbol: 'USDC',
        name: 'USD Coin',
        decimals: 6,
        isNative: false
      });
    }

    res.json({
      success: true,
      tokens
    });
  } catch (error) {
    console.error("[GET TOKENS] Error:", error);
    res.status(500).json({ error: 'Failed to get supported tokens' });
  }
});


// Set primary wallet - PUT /api/wallets/primary
router.put('/primary', authenticateToken, async (req, res) => {
  try {
    const { address, network } = req.body;
    const userId = req.userId;

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
    const wallets = userData.wallets || [];

    // Find the wallet to set as primary
    const walletIndex = wallets.findIndex(
      w => w.address.toLowerCase() === address.toLowerCase() && w.network === network
    );

    if (walletIndex === -1) {
      return res.status(404).json({ error: 'Wallet not found in user profile' });
    }

    // Update primary status - only one primary across all networks
    wallets.forEach((w, index) => {
      w.isPrimary = (index === walletIndex);
    });

    await userRef.update({ wallets });

    return res.json({
      success: true,
      message: 'Primary wallet updated successfully'
    });
  } catch (error) {
    console.error("[SET PRIMARY] Error:", error);
    return res.status(500).json({ error: 'Failed to set primary wallet' });
  }
});

// Update wallet balance - PUT /api/wallets/balance
router.put('/balance', authenticateToken, async (req, res) => {
  try {
    const { address, network, balance } = req.body;
    const userId = req.userId;

    if (!address || !network) {
      return res.status(400).json({ error: 'Address and network are required' });
    }

    if (balance === undefined || balance === null) {
      return res.status(400).json({ error: 'Address, network, and balance are required' });
    }

    const { db } = await getFirebaseServices();
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return res.status(404).json({ error: 'User profile not found' });
    }

    const userData = userDoc.data();
    const wallets = userData.wallets || [];

    const walletIndex = wallets.findIndex(
      w => w.address.toLowerCase() === address.toLowerCase() && w.network === network
    );

    if (walletIndex === -1) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    wallets[walletIndex].balance = balance;
    wallets[walletIndex].lastBalanceUpdate = new Date();

    await userRef.update({ wallets });

    return res.json({
      success: true,
      message: 'Wallet balance updated successfully'
    });
  } catch (error) {
    console.error("[UPDATE BALANCE] Error:", error);
    return res.status(500).json({ error: 'Failed to update wallet balance' });
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
    
    // Get primary wallet
    const primaryWallet = wallets.find(w => w.isPrimary);
    const preferredNetworks = [...new Set(wallets.map(w => w.network))];

    return res.json({
      success: true,
      preferences: {
        primaryWallet: primaryWallet ? {
          address: primaryWallet.address,
          network: primaryWallet.network
        } : null,
        preferredNetworks
      }
    });
  } catch (error) {
    console.error("[GET PREFERENCES] Error:", error);
    return res.status(500).json({ error: 'Failed to get wallet preferences' });
  }
});

// Process wallet detection - POST /api/wallets/detection
router.post('/detection', authenticateToken, async (req, res) => {
  try {
    const { detectedWallets } = req.body;
    const userId = req.userId;

    if (!detectedWallets) {
      return res.status(400).json({ error: 'Detected wallets data is required' });
    }

    const { db } = await getFirebaseServices();
    const userRef = db.collection('users').doc(userId);
    
    // Store detection data for processing
    const evmWallets = detectedWallets.evmWallets?.length || 0;
    const solanaWallets = detectedWallets.solanaWallets?.length || 0;
    const bitcoinWallets = detectedWallets.bitcoinWallets?.length || 0;
    const totalDetected = evmWallets + solanaWallets + bitcoinWallets;
    
    await userRef.update({
      lastWalletDetection: {
        timestamp: new Date(),
        evmWallets,
        solanaWallets,
        bitcoinWallets,
        totalDetected
      }
    });

    return res.json({
      success: true,
      message: 'Wallet detection data received successfully'
    });
  } catch (error) {
    console.error("[WALLET DETECTION] Error:", error);
    return res.status(500).json({ error: 'Failed to process wallet detection' });
  }
});


// Delete wallet - DELETE /api/wallets/:address
router.delete('/:address', authenticateToken, async (req, res) => {
  try {
    const { address } = req.params;
    const { network } = req.body;
    const userId = req.userId;

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

    // Find and filter out the wallet to delete
    const walletToDelete = currentWallets.find(
      w => w.address.toLowerCase() === address.toLowerCase() && w.network === network
    );
    
    if (!walletToDelete) {
      return res.status(404).json({ error: 'Wallet not found' });
    }
    
    const updatedWallets = currentWallets.filter(
      w => !(w.address.toLowerCase() === address.toLowerCase() && w.network === network)
    );

    // If the deleted wallet was primary and there are remaining wallets, set another as primary
    if (walletToDelete.isPrimary && updatedWallets.length > 0) {
      updatedWallets[0].isPrimary = true;
    }

    // Update user document
    const updateData = {
      wallets: updatedWallets
    };

    // Remove from quick lookup if it was the registered address for this network
    if (userData.walletAddresses && userData.walletAddresses[network] === address) {
      updateData[`walletAddresses.${network}`] = FieldValue.delete();
    }

    await userRef.update(updateData);

    return res.json({
      success: true,
      message: 'Wallet removed successfully'
    });
    
  } catch (error) {
    console.error("[WALLET DELETE] Error:", error);
    return res.status(500).json({ error: 'Failed to delete wallet' });
  }
});

export default router;