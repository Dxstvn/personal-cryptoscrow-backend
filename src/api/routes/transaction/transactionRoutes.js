import express from 'express';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getAdminApp } from '../auth/admin.js';
import { isAddress, getAddress, parseUnits, JsonRpcProvider, formatEther, parseEther } from 'ethers';
import { Wallet } from 'ethers';
import config from '../../../config/index.js';

// Import the new V3 escrow service
import { EscrowServiceV3 } from '../../../services/escrowServiceV3.js';

// Initialize escrow service
const escrowService = new EscrowServiceV3();

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
  const adminApp = await getAdminApp();
  return {
    db: getFirestore(adminApp),
    auth: getAdminAuth(adminApp)
  };
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

// Helper function to validate address for network
function validateAddressForNetwork(address, network) {
  // EVM networks
  if (['ethereum', 'sepolia', 'arbitrum', 'arbitrum-sepolia', 'polygon', 'polygon-amoy', 'optimism', 'base'].includes(network.toLowerCase())) {
    return isAddress(address);
  }
  
  // Non-EVM networks - basic validation
  if (network === 'solana') {
    return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
  }
  
  if (network === 'bitcoin') {
    return /^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,62}$/.test(address);
  }
  
  // Unknown network - assume valid
  return true;
}

// Get fee quote endpoint
router.get('/api/v3/quote', async (req, res) => {
  try {
    const { sourceChainId, targetChainId, amount, depositToken, targetToken } = req.query;
    
    if (!sourceChainId || !targetChainId || !amount) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required parameters: sourceChainId, targetChainId, amount' 
      });
    }

    // Ensure service is initialized
    await escrowService.initialize();

    const quote = await escrowService.getCrossChainQuote({
      sourceChainId: parseInt(sourceChainId),
      targetChainId: parseInt(targetChainId),
      tokenAddress: depositToken || '0x0000000000000000000000000000000000000000',
      amount: amount,
      contractAddress: escrowService.chainConfigs[parseInt(sourceChainId)]?.contractAddress
    });

    res.json({
      success: true,
      quote
    });
  } catch (error) {
    console.error('[QUOTE ERROR]', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Create Deal endpoint - updated to use V3 contracts
router.post('/api/createDeal', async (req, res) => {
    try {
        await ensureConfig();
        console.log('[ROUTE LOG] Deal creation request received:', { ...req.body, authHeader: req.headers.authorization ? 'present' : 'missing' });

        const idToken = req.headers.authorization?.split('Bearer ')[1];
        if (!idToken) {
            console.error('[AUTH ERROR] No authorization token provided');
            return res.status(401).json({ success: false, error: 'No authorization token provided' });
        }

        const { auth } = await getFirebaseServices();
        let initiatorId;
        try {
            const decodedToken = await auth.verifyIdToken(idToken);
            initiatorId = decodedToken.uid;
            console.log(`[AUTH SUCCESS] User authenticated: ${initiatorId}`);
        } catch (authError) {
            console.error('[AUTH ERROR] Invalid token:', authError.message);
            return res.status(401).json({ success: false, error: 'Invalid authorization token' });
        }

        const {
            amount,
            sellerEmail,
            productDescription,
            productPhotos,
            conditions,
            sellerWalletAddress,
            buyerWalletAddress,
            isSeller,
            contractType,
            productCategory,
            buyerNetwork,
            sellerNetwork,
            tokenAddress,
            depositToken,
            targetToken
        } = req.body;

        // Input validation
        if (!amount || !sellerEmail || !productDescription || !conditions || 
            !buyerWalletAddress || !sellerWalletAddress || !buyerNetwork || !sellerNetwork) {
            console.error('[VALIDATION ERROR] Missing required fields');
            return res.status(400).json({ success: false, error: 'Missing required fields' });
        }

        // Validate addresses for their respective networks
        if (!validateAddressForNetwork(buyerWalletAddress, buyerNetwork)) {
            return res.status(400).json({ 
                success: false, 
                error: `Invalid buyer wallet address for ${buyerNetwork} network` 
            });
        }

        if (!validateAddressForNetwork(sellerWalletAddress, sellerNetwork)) {
            return res.status(400).json({ 
                success: false, 
                error: `Invalid seller wallet address for ${sellerNetwork} network` 
            });
        }

        // Determine chain IDs
        const buyerChainId = getChainId(buyerNetwork);
        const sellerChainId = getChainId(sellerNetwork);
        
        if (!buyerChainId || !sellerChainId) {
            return res.status(400).json({ 
                success: false, 
                error: 'Unsupported network. Supported networks: ethereum, sepolia, arbitrum, arbitrum-sepolia, polygon, polygon-amoy, optimism, base' 
            });
        }

        const isCrossChain = buyerChainId !== sellerChainId;
        console.log(`[ROUTE LOG] Transaction type: ${isCrossChain ? 'Cross-chain' : 'Same-chain'}`);

        const { db } = await getFirebaseServices();

        // Create the transaction document
        const newTransactionData = {
            initiatorId: initiatorId,
            isSeller: Boolean(isSeller),
            amount: parseFloat(amount),
            sellerEmail: sellerEmail.toLowerCase(),
            buyerEmail: null,
            productDescription,
            productPhotos: productPhotos || [],
            conditions: typeof conditions === 'string' ? [{ text: conditions, status: 'pending' }] : conditions,
            status: 'awaiting_buyer_payment',
            createdAt: Timestamp.now(),
            lastUpdated: Timestamp.now(),
            timeline: [{
                event: 'Deal created by ' + (isSeller ? 'seller' : 'buyer'),
                timestamp: Timestamp.now(),
                system: true
            }],
            sellerWalletAddress,
            buyerWalletAddress,
            contractType: 'V3_ESCROW',
            isCrossChain,
            buyerNetwork,
            sellerNetwork,
            buyerChainId,
            sellerChainId,
            productCategory: productCategory || 'general',
            depositToken: depositToken || '0x0000000000000000000000000000000000000000',
            targetToken: targetToken || depositToken || '0x0000000000000000000000000000000000000000',
            // Add participants array for file upload authorization
            participants: [initiatorId]
        };

        // Deploy V3 escrow contract
        try {
            await escrowService.initialize();
            
            // Create escrow on buyer's chain
            const escrowResult = await escrowService.createEscrow({
                chainId: buyerChainId,
                seller: sellerWalletAddress,
                depositToken: newTransactionData.depositToken,
                amount: amount,
                targetToken: newTransactionData.targetToken,
                targetChainId: sellerChainId,
                signerPrivateKey: config.get('BACKEND_WALLET_PRIVATE_KEY')
            });

            newTransactionData.smartContractAddress = escrowResult.contractAddress;
            newTransactionData.escrowId = escrowResult.escrowId;
            newTransactionData.deploymentTxHash = escrowResult.txHash;
            newTransactionData.blockNumber = escrowResult.blockNumber;
            
            // Calculate fees
            const fees = await escrowService.estimateTotalFees({
                amount,
                sourceChainId: buyerChainId,
                targetChainId: sellerChainId,
                requiresSwap: newTransactionData.depositToken !== newTransactionData.targetToken
            });
            
            newTransactionData.fees = fees;
            
            newTransactionData.timeline.push({
                event: `V3 Escrow created on ${buyerNetwork} network. Contract: ${escrowResult.contractAddress}, Escrow ID: ${escrowResult.escrowId}`,
                timestamp: Timestamp.now(),
                system: true,
                txHash: escrowResult.txHash
            });
            
            console.log(`[ROUTE LOG] V3 Escrow created:`, escrowResult);
        } catch (deployError) {
            console.error('[DEPLOYMENT ERROR]', deployError);
            newTransactionData.timeline.push({
                event: `Escrow creation failed: ${deployError.message}`,
                timestamp: Timestamp.now(),
                system: true,
                error: true
            });
            // Continue without contract - can be deployed later
        }

        // Store the deal
        const transactionRef = await db.collection('deals').add(newTransactionData);
        console.log(`[ROUTE LOG] Transaction stored: ${transactionRef.id}`);

        res.json({
            success: true,
            dealId: transactionRef.id,
            escrowId: newTransactionData.escrowId,
            contractAddress: newTransactionData.smartContractAddress,
            fees: newTransactionData.fees,
            transactionData: {
                ...newTransactionData,
                id: transactionRef.id
            }
        });

    } catch (error) {
        console.error('[ROUTE ERROR] Deal creation failed:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message || 'Failed to create deal' 
        });
    }
});

// Update deal conditions
router.post('/api/updateCondition', async (req, res) => {
    try {
        await ensureConfig();
        const { dealId, conditionIndex, status } = req.body;
        
        if (!dealId || conditionIndex === undefined || !status) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: dealId, conditionIndex, status'
            });
        }

        const { db } = await getFirebaseServices();
        const dealRef = db.collection('deals').doc(dealId);
        const dealDoc = await dealRef.get();
        
        if (!dealDoc.exists) {
            return res.status(404).json({
                success: false,
                error: 'Deal not found'
            });
        }

        const dealData = dealDoc.data();
        const conditions = [...dealData.conditions];
        
        if (conditionIndex < 0 || conditionIndex >= conditions.length) {
            return res.status(400).json({
                success: false,
                error: 'Invalid condition index'
            });
        }

        // Update condition
        conditions[conditionIndex] = {
            ...conditions[conditionIndex],
            status: status,
            updatedAt: Timestamp.now()
        };

        // Check if all conditions are met
        const allConditionsMet = conditions.every(c => c.status === 'met');
        
        // Update contract if needed
        if (dealData.escrowId && dealData.smartContractAddress && dealData.buyerChainId) {
            try {
                await escrowService.updateCondition(
                    dealData.buyerChainId,
                    dealData.escrowId,
                    allConditionsMet,
                    config.get('BACKEND_WALLET_PRIVATE_KEY')
                );
                
                // If using V3Disputes contract, update with dispute window tracking
                if (allConditionsMet && dealData.contractType === 'V3_ESCROW') {
                    await escrowService.updateConditionWithDispute(
                        dealData.escrowId,
                        true,
                        {
                            chainId: dealData.buyerChainId,
                            contractAddress: dealData.smartContractAddress
                        }
                    );
                }
            } catch (contractError) {
                console.error('[CONTRACT UPDATE ERROR]', contractError);
                // Continue - database update is still valid
            }
        }

        // Update database
        await dealRef.update({
            conditions,
            allConditionsMet,
            lastUpdated: Timestamp.now(),
            timeline: FieldValue.arrayUnion({
                event: `Condition ${conditionIndex + 1} marked as ${status}`,
                timestamp: Timestamp.now(),
                system: true
            })
        });

        res.json({
            success: true,
            conditions,
            allConditionsMet
        });

    } catch (error) {
        console.error('[UPDATE CONDITION ERROR]', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Release escrow
router.post('/api/releaseEscrow', async (req, res) => {
    try {
        await ensureConfig();
        const { dealId, crossChainFee } = req.body;
        
        if (!dealId) {
            return res.status(400).json({
                success: false,
                error: 'Missing required field: dealId'
            });
        }

        const { db } = await getFirebaseServices();
        const dealRef = db.collection('deals').doc(dealId);
        const dealDoc = await dealRef.get();
        
        if (!dealDoc.exists) {
            return res.status(404).json({
                success: false,
                error: 'Deal not found'
            });
        }

        const dealData = dealDoc.data();
        
        // Validate deal state
        if (!dealData.allConditionsMet) {
            return res.status(400).json({
                success: false,
                error: 'Cannot release escrow: conditions not met'
            });
        }

        if (!dealData.escrowId || !dealData.smartContractAddress || !dealData.buyerChainId) {
            return res.status(400).json({
                success: false,
                error: 'No escrow contract found for this deal'
            });
        }

        // Check if can release (dispute window)
        if (dealData.contractType === 'V3_ESCROW') {
            const canReleaseResult = await escrowService.canReleaseEscrow(
                dealData.escrowId,
                {
                    chainId: dealData.buyerChainId,
                    contractAddress: dealData.smartContractAddress
                }
            );
            
            if (!canReleaseResult.canRelease) {
                return res.status(400).json({
                    success: false,
                    error: canReleaseResult.reason
                });
            }
        }

        // Calculate required value for cross-chain transfers
        let value = 0n;
        if (dealData.isCrossChain) {
            const fees = await escrowService.estimateTotalFees({
                amount: dealData.amount,
                sourceChainId: dealData.buyerChainId,
                targetChainId: dealData.sellerChainId,
                requiresSwap: dealData.depositToken !== dealData.targetToken
            });
            
            value = parseEther(crossChainFee || fees.crossChainFee || '0');
        }

        // Release escrow
        const releaseResult = await escrowService.releaseEscrow(
            dealData.buyerChainId,
            dealData.escrowId,
            value,
            config.get('BACKEND_WALLET_PRIVATE_KEY')
        );

        // Update database
        await dealRef.update({
            status: 'completed',
            releaseTxHash: releaseResult.txHash,
            releaseMethod: releaseResult.method,
            lastUpdated: Timestamp.now(),
            timeline: FieldValue.arrayUnion({
                event: `Escrow released. Method: ${releaseResult.method}. Tx: ${releaseResult.txHash}`,
                timestamp: Timestamp.now(),
                system: true
            })
        });

        res.json({
            success: true,
            txHash: releaseResult.txHash,
            method: releaseResult.method,
            isCompose: releaseResult.isCompose,
            guid: releaseResult.guid
        });

    } catch (error) {
        console.error('[RELEASE ESCROW ERROR]', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Raise dispute
router.post('/api/raiseDispute', async (req, res) => {
    try {
        await ensureConfig();
        const { dealId, reason } = req.body;
        
        if (!dealId || !reason) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: dealId, reason'
            });
        }

        const { db } = await getFirebaseServices();
        const dealRef = db.collection('deals').doc(dealId);
        const dealDoc = await dealRef.get();
        
        if (!dealDoc.exists) {
            return res.status(404).json({
                success: false,
                error: 'Deal not found'
            });
        }

        const dealData = dealDoc.data();
        
        if (!dealData.escrowId || !dealData.smartContractAddress || !dealData.buyerChainId) {
            return res.status(400).json({
                success: false,
                error: 'No escrow contract found for this deal'
            });
        }

        // Raise dispute on contract
        const disputeResult = await escrowService.raiseDispute(
            dealData.escrowId,
            reason,
            {
                chainId: dealData.buyerChainId,
                contractAddress: dealData.smartContractAddress,
                signerPrivateKey: config.get('BACKEND_WALLET_PRIVATE_KEY')
            }
        );

        // Update database
        await dealRef.update({
            status: 'disputed',
            disputeReason: reason,
            disputeTxHash: disputeResult.txHash,
            lastUpdated: Timestamp.now(),
            timeline: FieldValue.arrayUnion({
                event: `Dispute raised: ${reason}`,
                timestamp: Timestamp.now(),
                system: true
            })
        });

        res.json({
            success: true,
            txHash: disputeResult.txHash
        });

    } catch (error) {
        console.error('[RAISE DISPUTE ERROR]', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Resolve dispute
router.post('/api/resolveDispute', async (req, res) => {
    try {
        await ensureConfig();
        const { dealId, releaseFunds } = req.body;
        
        if (!dealId || releaseFunds === undefined) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: dealId, releaseFunds'
            });
        }

        const { db } = await getFirebaseServices();
        const dealRef = db.collection('deals').doc(dealId);
        const dealDoc = await dealRef.get();
        
        if (!dealDoc.exists) {
            return res.status(404).json({
                success: false,
                error: 'Deal not found'
            });
        }

        const dealData = dealDoc.data();
        
        if (!dealData.escrowId || !dealData.smartContractAddress || !dealData.buyerChainId) {
            return res.status(400).json({
                success: false,
                error: 'No escrow contract found for this deal'
            });
        }

        // Resolve dispute on contract
        const resolveResult = await escrowService.resolveDispute(
            dealData.escrowId,
            releaseFunds,
            {
                chainId: dealData.buyerChainId,
                contractAddress: dealData.smartContractAddress,
                signerPrivateKey: config.get('BACKEND_WALLET_PRIVATE_KEY')
            }
        );

        // Update database
        await dealRef.update({
            status: releaseFunds ? 'completed' : 'refunded',
            disputeResolved: true,
            disputeResolution: releaseFunds ? 'released_to_seller' : 'refunded_to_buyer',
            resolveTxHash: resolveResult.txHash,
            lastUpdated: Timestamp.now(),
            timeline: FieldValue.arrayUnion({
                event: `Dispute resolved: ${releaseFunds ? 'Funds released to seller' : 'Funds refunded to buyer'}`,
                timestamp: Timestamp.now(),
                system: true
            })
        });

        res.json({
            success: true,
            txHash: resolveResult.txHash,
            resolution: releaseFunds ? 'released_to_seller' : 'refunded_to_buyer'
        });

    } catch (error) {
        console.error('[RESOLVE DISPUTE ERROR]', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get deal details
router.get('/api/deal/:dealId', async (req, res) => {
    try {
        const { dealId } = req.params;
        
        const { db } = await getFirebaseServices();
        const dealDoc = await db.collection('deals').doc(dealId).get();
        
        if (!dealDoc.exists) {
            return res.status(404).json({
                success: false,
                error: 'Deal not found'
            });
        }

        const dealData = dealDoc.data();
        
        // Get dispute info if contract exists
        if (dealData.escrowId && dealData.smartContractAddress && dealData.buyerChainId) {
            try {
                const disputeInfo = await escrowService.getDisputeInfo(
                    dealData.escrowId,
                    {
                        chainId: dealData.buyerChainId,
                        contractAddress: dealData.smartContractAddress
                    }
                );
                dealData.disputeInfo = disputeInfo;
            } catch (error) {
                console.error('[DISPUTE INFO ERROR]', error);
            }
        }

        res.json({
            success: true,
            deal: {
                id: dealId,
                ...dealData
            }
        });

    } catch (error) {
        console.error('[GET DEAL ERROR]', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

export default router;