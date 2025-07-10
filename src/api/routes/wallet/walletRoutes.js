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

    // If this is marked as primary, unmark others for the same network
    if (isPrimary) {
      currentWallets.forEach(w => {
        if (w.network === network && w.address !== address) {
          w.isPrimary = false;
        }
      });
    }

    // Update user document
    await userRef.update({
      wallets: currentWallets,
      [`walletAddresses.${network}`]: address // Quick lookup field
    });

    return res.json({
      success: true,
      wallet: walletObject,
      message: existingWalletIndex !== -1 ? 'Wallet updated' : 'Wallet registered'
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
      success: true,
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

// Estimate transaction fees - POST /api/wallets/estimate-fees
router.post('/estimate-fees', authenticateToken, async (req, res) => {
  try {
    const { amount, sourceNetwork, targetNetwork, depositToken, targetToken } = req.body;

    if (!amount || !sourceNetwork || !targetNetwork) {
      return res.status(400).json({ 
        error: 'Amount, source network, and target network are required' 
      });
    }

    const sourceChainId = getChainId(sourceNetwork);
    const targetChainId = getChainId(targetNetwork);

    if (!sourceChainId || !targetChainId) {
      return res.status(400).json({ 
        error: 'Unsupported network' 
      });
    }

    await escrowService.initialize();

    const fees = await escrowService.estimateTotalFees({
      amount,
      sourceChainId,
      targetChainId,
      requiresSwap: depositToken !== targetToken
    });

    res.json({
      success: true,
      fees: {
        ...fees,
        sourceNetwork,
        targetNetwork,
        isEnhanced: fees.isEnhanced
      }
    });

  } catch (error) {
    console.error("[ESTIMATE FEES] Error:", error);
    res.status(500).json({ error: 'Failed to estimate fees' });
  }
});

// Get cross-chain quote - POST /api/wallets/quote
router.post('/quote', authenticateToken, async (req, res) => {
  try {
    const { amount, sourceChainId, targetChainId, tokenAddress } = req.body;

    if (!amount || !sourceChainId || !targetChainId) {
      return res.status(400).json({ 
        error: 'Amount, source chain ID, and target chain ID are required' 
      });
    }

    // Ensure service is initialized before use
    await escrowService.initialize();

    const quote = await escrowService.getCrossChainQuote({
      sourceChainId: parseInt(sourceChainId),
      targetChainId: parseInt(targetChainId),
      tokenAddress: tokenAddress || '0x0000000000000000000000000000000000000000',
      amount: amount,
      contractAddress: escrowService.chainConfigs[parseInt(sourceChainId)]?.contractAddress
    });

    res.json({
      success: true,
      quote
    });

  } catch (error) {
    console.error("[GET QUOTE] Error:", error);
    res.status(500).json({ error: 'Failed to get quote' });
  }
});

// Get transaction route info - POST /api/wallets/route
router.post('/route', authenticateToken, async (req, res) => {
  try {
    const { sourceNetwork, targetNetwork, amount, depositToken, targetToken } = req.body;

    if (!sourceNetwork || !targetNetwork || !amount) {
      return res.status(400).json({ 
        error: 'Source network, target network, and amount are required' 
      });
    }

    const sourceChainId = getChainId(sourceNetwork);
    const targetChainId = getChainId(targetNetwork);

    if (!sourceChainId || !targetChainId) {
      return res.status(400).json({ 
        error: 'Unsupported network' 
      });
    }

    await escrowService.initialize();

    const sourceConfig = escrowService.chainConfigs[sourceChainId];
    const targetConfig = escrowService.chainConfigs[targetChainId];

    if (!sourceConfig || !targetConfig) {
      return res.status(400).json({ 
        error: 'Chain configuration not found' 
      });
    }

    // Determine the best route
    const isSameChain = sourceChainId === targetChainId;
    const requiresSwap = depositToken !== targetToken;
    
    let route = {
      type: isSameChain ? 'same-chain' : 'cross-chain',
      method: 'direct',
      steps: []
    };

    if (isSameChain) {
      if (requiresSwap) {
        route.method = 'uniswap';
        route.steps = [
          { action: 'swap', from: depositToken, to: targetToken, via: 'Uniswap' },
          { action: 'transfer', to: 'seller' }
        ];
      } else {
        route.steps = [
          { action: 'transfer', to: 'seller' }
        ];
      }
    } else {
      // Check available cross-chain methods
      const hasStargate = sourceConfig.stargateRouter && targetConfig.stargateRouter;
      const hasLayerZero = sourceConfig.layerZeroEndpointId && targetConfig.layerZeroEndpointId;
      
      if (hasStargate) {
        route.method = 'stargate';
        route.steps = [
          { action: 'bridge', from: sourceNetwork, to: targetNetwork, via: 'Stargate' }
        ];
        
        if (requiresSwap) {
          route.steps.push({ action: 'swap', from: depositToken, to: targetToken, via: 'Uniswap' });
        }
        
        route.steps.push({ action: 'transfer', to: 'seller' });
      } else if (hasLayerZero) {
        route.method = 'layerzero';
        route.steps = [
          { action: 'bridge', from: sourceNetwork, to: targetNetwork, via: 'LayerZero OFT' }
        ];
        
        if (requiresSwap) {
          route.steps.push({ action: 'swap', from: depositToken, to: targetToken, via: 'Uniswap' });
        }
        
        route.steps.push({ action: 'transfer', to: 'seller' });
      } else {
        route.method = 'unsupported';
        route.error = 'No cross-chain bridge available for this route';
      }
    }

    res.json({
      success: true,
      route
    });

  } catch (error) {
    console.error("[GET ROUTE] Error:", error);
    res.status(500).json({ error: 'Failed to get route info' });
  }
});

// Delete wallet - DELETE /api/wallets/:address
router.delete('/:address', authenticateToken, async (req, res) => {
  try {
    const { address } = req.params;
    const { network } = req.query;
    const userId = req.userId;

    if (!network) {
      return res.status(400).json({ error: 'Network parameter is required' });
    }

    const { db } = await getFirebaseServices();
    
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    
    if (!userDoc.exists) {
      return res.status(404).json({ error: 'User profile not found' });
    }

    const userData = userDoc.data();
    const currentWallets = userData.wallets || [];

    // Filter out the wallet to delete
    const updatedWallets = currentWallets.filter(
      w => !(w.address.toLowerCase() === address.toLowerCase() && w.network === network)
    );

    if (updatedWallets.length === currentWallets.length) {
      return res.status(404).json({ error: 'Wallet not found' });
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
      message: 'Wallet deleted successfully'
    });
    
  } catch (error) {
    console.error("[WALLET DELETE] Error:", error);
    return res.status(500).json({ error: 'Failed to delete wallet' });
  }
});

export default router;