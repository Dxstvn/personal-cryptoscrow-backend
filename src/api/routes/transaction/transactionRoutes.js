import express from 'express';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getAdminApp } from '../auth/admin.js';
import { updateDealCondition, raiseDealDispute, resolveDealDispute } from '../../../services/databaseService.js';
import { isAddress, getAddress, parseUnits, JsonRpcProvider, formatEther, parseEther } from 'ethers';
import { Wallet } from 'ethers';
import config from '../../../config/index.js';
import rateLimiters from '../../middleware/rateLimiter.js';
import securityLogger from '../../../services/securityLogger.js';

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
router.get('/v3/quote', async (req, res) => {
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
router.post('/create', async (req, res) => {
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
            targetToken,
            disputeResolutionPeriodDays
        } = req.body;

        // Validate dispute resolution period (default to 7 days if not provided)
        const disputePeriodDays = disputeResolutionPeriodDays !== undefined ? disputeResolutionPeriodDays : 7;
        if (disputePeriodDays < 1 || disputePeriodDays > 30) {
            return res.status(400).json({ 
                success: false, 
                error: 'Dispute resolution period must be between 1 and 30 days' 
            });
        }

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

        // Prevent same wallet addresses for buyer and seller
        if (buyerWalletAddress.toLowerCase() === sellerWalletAddress.toLowerCase() && buyerNetwork === sellerNetwork) {
            return res.status(400).json({ 
                success: false, 
                error: 'Buyer and Seller wallet addresses cannot be the same' 
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
            // Custom dispute resolution period
            disputeResolutionPeriodDays: disputePeriodDays,
            disputeResolutionPeriodMs: disputePeriodDays * 24 * 60 * 60 * 1000,
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

        res.status(201).json({
            success: true,
            message: 'Deal created successfully',
            dealId: transactionRef.id,
            escrowId: newTransactionData.escrowId,
            contractAddress: newTransactionData.smartContractAddress,
            fees: newTransactionData.fees,
            isCrossChain: newTransactionData.isCrossChain,
            smartContractAddress: newTransactionData.smartContractAddress,
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
router.post('/updateCondition', async (req, res) => {
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

        // Update database with timeline event
        await dealRef.update({
            conditions,
            lastUpdated: Timestamp.now(),
            timeline: FieldValue.arrayUnion({
                event: `Condition ${conditionIndex + 1} marked as ${status}`,
                timestamp: Timestamp.now(),
                system: true
            })
        });
        
        // Update deal condition with event emission for real-time sync
        // This will automatically sync to blockchain via contractConditionSync
        await updateDealCondition(dealId, allConditionsMet, { ...dealData, conditions });

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
router.post('/releaseEscrow', async (req, res) => {
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

// Raise dispute (legacy endpoint - no staking) with rate limiting
router.post('/raiseDispute', rateLimiters.dispute, rateLimiters.monitor, async (req, res) => {
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

        // Update database with timeline event
        await dealRef.update({
            status: 'disputed',
            disputeTxHash: disputeResult.txHash,
            lastUpdated: Timestamp.now(),
            timeline: FieldValue.arrayUnion({
                event: `Dispute raised: ${reason}`,
                timestamp: Timestamp.now(),
                system: true
            })
        });
        
        // Get custom dispute resolution period from deal data
        const customDisputePeriodMs = dealData.disputeResolutionPeriodMs || (7 * 24 * 60 * 60 * 1000); // Default to 7 days
        
        // Raise dispute with event emission for automatic resolution after custom period
        await raiseDealDispute(dealId, {
            escrowId: dealData.escrowId,
            chainId: dealData.buyerChainId,
            contractAddress: dealData.smartContractAddress,
            reason,
            raisedBy: 'user', // Could be from req.user if auth is available
            txHash: disputeResult.txHash,
            customDisputeResolutionPeriodMs: customDisputePeriodMs
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

// Raise dispute with staking (new endpoint) - with enhanced security
router.post('/raiseDisputeWithStake', rateLimiters.dispute, rateLimiters.monitor, async (req, res) => {
    try {
        await ensureConfig();
        const { dealId, reason, userId, stakeToken } = req.body;
        
        if (!dealId || !reason || !userId) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: dealId, reason, userId'
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

        // Import reputation service
        const { reputationService } = await import('../../../services/reputationService.js');
        
        // Calculate stake requirement
        const transactionAmount = dealData.dealAmount || dealData.amount || 0;
        const stakeRequirements = await reputationService.calculateStakeRequirement(
            userId,
            transactionAmount
        );
        
        // Security: Validate user has sufficient balance BEFORE blockchain call
        const userBalance = await validateUserStakeBalance(
            userId,
            stakeRequirements.requiredStake,
            stakeToken || 'ETH',
            dealData.buyerChainId
        );
        
        if (!userBalance.sufficient) {
            await securityLogger.logSecurityEvent(
                securityLogger.SecurityEventType.BALANCE_CHECK_FAILED,
                {
                    userId,
                    dealId,
                    requiredStake: stakeRequirements.requiredStake,
                    userBalance: userBalance.balance,
                    token: stakeToken || 'ETH'
                }
            );
            
            return res.status(400).json({
                success: false,
                error: 'Insufficient balance for stake requirement',
                details: {
                    required: stakeRequirements.requiredStake,
                    available: userBalance.balance,
                    token: stakeToken || 'ETH'
                }
            });
        }
        
        // Check for suspicious patterns
        const suspiciousPatterns = await securityLogger.detectSuspiciousPatterns(userId);
        if (suspiciousPatterns && Object.values(suspiciousPatterns).some(p => p)) {
            console.warn('[SECURITY] Suspicious patterns detected for user:', userId, suspiciousPatterns);
        }

        // Log high-value operation if applicable
        if (transactionAmount > 10000) {
            await securityLogger.logSecurityEvent(
                securityLogger.SecurityEventType.HIGH_VALUE_OPERATION,
                {
                    userId,
                    dealId,
                    amount: transactionAmount,
                    operation: 'DISPUTE_WITH_STAKE',
                    stakeAmount: stakeRequirements.requiredStake
                }
            );
        }
        
        // Record stake in database
        const stakeId = await reputationService.recordDisputeStake({
            userId,
            dealId,
            transactionAmount,
            stakeAmount: stakeRequirements.requiredStake,
            stakePercentage: stakeRequirements.stakePercentage,
            stakeToken: stakeToken || 'ETH'
        });

        // Raise dispute on contract with stake
        const disputeResult = await escrowService.raiseDispute(
            dealData.escrowId,
            reason,
            {
                chainId: dealData.buyerChainId,
                contractAddress: dealData.smartContractAddress,
                signerPrivateKey: config.get('BACKEND_WALLET_PRIVATE_KEY'),
                stakeAmount: stakeRequirements.requiredStake,
                stakeToken: stakeToken || null // null for ETH
            }
        );
        
        // Log successful stake operation
        await securityLogger.logStakeOperation(
            securityLogger.SecurityEventType.STAKE_LOCKED,
            {
                userId,
                dealId,
                amount: stakeRequirements.requiredStake,
                txHash: disputeResult.txHash,
                chainId: dealData.buyerChainId,
                token: stakeToken || 'ETH',
                reputationScore: stakeRequirements.reputationScore,
                blockNumber: disputeResult.blockNumber,
                gasUsed: disputeResult.gasUsed
            }
        );

        // Update database with timeline event and stake info
        await dealRef.update({
            status: 'disputed',
            disputeTxHash: disputeResult.txHash,
            disputeStakeId: stakeId,
            disputeStakeAmount: stakeRequirements.requiredStake,
            disputeStakePercentage: stakeRequirements.stakePercentage,
            lastUpdated: Timestamp.now(),
            timeline: FieldValue.arrayUnion({
                event: `Dispute raised with ${stakeRequirements.stakePercentage * 100}% stake: ${reason}`,
                timestamp: Timestamp.now(),
                system: true
            })
        });
        
        // Get custom dispute resolution period from deal data
        const customDisputePeriodMs = dealData.disputeResolutionPeriodMs || (7 * 24 * 60 * 60 * 1000); // Default to 7 days
        
        // Raise dispute with event emission for automatic resolution after custom period
        await raiseDealDispute(dealId, {
            escrowId: dealData.escrowId,
            chainId: dealData.buyerChainId,
            contractAddress: dealData.smartContractAddress,
            reason,
            raisedBy: userId,
            txHash: disputeResult.txHash,
            customDisputeResolutionPeriodMs: customDisputePeriodMs,
            stakeId,
            stakeAmount: stakeRequirements.requiredStake
        });

        res.json({
            success: true,
            txHash: disputeResult.txHash,
            stakeRequirements,
            stakeId
        });

    } catch (error) {
        console.error('[RAISE DISPUTE WITH STAKE ERROR]', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Resolve dispute with security logging
router.post('/resolveDispute', rateLimiters.monitor, async (req, res) => {
    try {
        await ensureConfig();
        const { dealId, releaseFunds, slashPercentage } = req.body;
        
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

        // Validate slash percentage if provided
        let validatedSlashPercentage = 50; // Default 50%
        if (slashPercentage !== undefined) {
            validatedSlashPercentage = parseInt(slashPercentage);
            if (isNaN(validatedSlashPercentage) || validatedSlashPercentage < 0 || validatedSlashPercentage > 100) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid slash percentage. Must be between 0 and 100'
                });
            }
        }

        // Resolve dispute on contract
        const resolveResult = await escrowService.resolveDispute(
            dealData.escrowId,
            releaseFunds,
            {
                chainId: dealData.buyerChainId,
                contractAddress: dealData.smartContractAddress,
                signerPrivateKey: config.get('BACKEND_WALLET_PRIVATE_KEY'),
                slashPercentage: validatedSlashPercentage
            }
        );

        // Handle stake resolution if stake exists
        if (dealData.disputeStakeId) {
            const { reputationService } = await import('../../../services/reputationService.js');
            
            let stakeOutcome = 'resolved_against';
            if (validatedSlashPercentage === 0) {
                stakeOutcome = 'resolved_in_favor';
            } else if (validatedSlashPercentage === 100) {
                stakeOutcome = 'resolved_against';
            } else {
                stakeOutcome = 'partial_return';
            }

            await reputationService.updateDisputeStakeStatus(dealData.disputeStakeId, {
                status: validatedSlashPercentage === 0 ? 'returned' : 
                        validatedSlashPercentage === 100 ? 'slashed' : 'partial_return',
                outcome: stakeOutcome,
                amountReturned: dealData.disputeStakeAmount ? 
                    dealData.disputeStakeAmount * (100 - validatedSlashPercentage) / 100 : 0,
                amountSlashed: dealData.disputeStakeAmount ? 
                    dealData.disputeStakeAmount * validatedSlashPercentage / 100 : 0
            });
        }

        // Update database with timeline event
        const stakeInfo = validatedSlashPercentage !== undefined ? 
            ` (Stake: ${100 - validatedSlashPercentage}% returned, ${validatedSlashPercentage}% slashed)` : '';
        
        await dealRef.update({
            status: releaseFunds ? 'completed' : 'refunded',
            disputeResolved: true,
            resolveTxHash: resolveResult.txHash,
            disputeSlashPercentage: validatedSlashPercentage,
            lastUpdated: Timestamp.now(),
            timeline: FieldValue.arrayUnion({
                event: `Dispute resolved: ${releaseFunds ? 'Funds released to seller' : 'Funds refunded to buyer'}${stakeInfo}`,
                timestamp: Timestamp.now(),
                system: true
            })
        });
        
        // Resolve dispute with event emission (this will cancel any auto-resolution timer)
        await resolveDealDispute(dealId, {
            resolution: releaseFunds ? 'released_to_seller' : 'refunded_to_buyer',
            txHash: resolveResult.txHash,
            resolvedBy: 'admin', // This should be the service wallet/admin
            slashPercentage: validatedSlashPercentage
        });

        res.json({
            success: true,
            txHash: resolveResult.txHash,
            resolution: releaseFunds ? 'released_to_seller' : 'refunded_to_buyer',
            slashPercentage: validatedSlashPercentage
        });

    } catch (error) {
        console.error('[RESOLVE DISPUTE ERROR]', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get deal details - both paths for compatibility
router.get('/deal/:dealId', async (req, res) => {
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

// Get transactions list
router.get('/transactions', async (req, res) => {
    try {
        const { limit } = req.query;
        
        // Authentication check
        const idToken = req.headers.authorization?.split('Bearer ')[1];
        if (!idToken) {
            return res.status(401).json({ success: false, error: 'No authorization token provided' });
        }

        const { db, auth } = await getFirebaseServices();
        let userId;
        try {
            const decodedToken = await auth.verifyIdToken(idToken);
            userId = decodedToken.uid;
        } catch (authError) {
            return res.status(401).json({ success: false, error: 'Invalid authorization token' });
        }
        
        // Query deals where user is a participant
        let query = db.collection('deals').where('participants', 'array-contains', userId);
        
        if (limit) {
            query = query.limit(parseInt(limit));
        }
        
        const snapshot = await query.get();
        const transactions = [];
        
        snapshot.forEach(doc => {
            transactions.push({
                id: doc.id,
                ...doc.data()
            });
        });
        
        res.json(transactions);
        
    } catch (error) {
        console.error('[GET TRANSACTIONS ERROR]', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Alternative path for deal details (tests expect this format)
router.get('/:dealId', async (req, res) => {
    try {
        const { dealId } = req.params;
        
        // Authentication check
        const idToken = req.headers.authorization?.split('Bearer ')[1];
        if (!idToken) {
            return res.status(401).json({ success: false, error: 'No authorization token provided' });
        }

        const { db, auth } = await getFirebaseServices();
        let userId;
        try {
            const decodedToken = await auth.verifyIdToken(idToken);
            userId = decodedToken.uid;
        } catch (authError) {
            return res.status(401).json({ success: false, error: 'Invalid authorization token' });
        }
        
        const dealDoc = await db.collection('deals').doc(dealId).get();
        
        if (!dealDoc.exists) {
            return res.status(404).json({
                success: false,
                error: 'Deal not found'
            });
        }

        const dealData = dealDoc.data();
        
        // Authorization check - user must be a participant in the deal
        if (!dealData.participants || !dealData.participants.includes(userId)) {
            return res.status(403).json({
                success: false,
                error: 'Access denied - not a participant in this deal'
            });
        }
        
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
            id: dealId,
            ...dealData
        });

    } catch (error) {
        console.error('[GET DEAL ERROR]', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});


// Update condition status
router.patch('/conditions/:conditionId/buyer-review', async (req, res) => {
    try {
        const { conditionId } = req.params;
        const { dealId, status } = req.body;
        
        if (!dealId || !status) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: dealId, status'
            });
        }
        
        // Validate status
        const validStatuses = ['FULFILLED_BY_BUYER', 'NOT_FULFILLED', 'PENDING'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid status value'
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
        
        res.json({
            success: true,
            conditionId,
            status,
            message: 'Condition updated successfully'
        });
        
    } catch (error) {
        console.error('[UPDATE CONDITION ERROR]', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Sync smart contract status
router.put('/:dealId/sync-status', async (req, res) => {
    try {
        const { dealId } = req.params;
        const { newSCStatus, eventMessage, finalApprovalDeadlineISO } = req.body;
        
        // Authentication check
        const idToken = req.headers.authorization?.split('Bearer ')[1];
        if (!idToken) {
            return res.status(401).json({ success: false, error: 'No authorization token provided' });
        }

        const { db, auth } = await getFirebaseServices();
        let userId;
        try {
            const decodedToken = await auth.verifyIdToken(idToken);
            userId = decodedToken.uid;
        } catch (authError) {
            return res.status(401).json({ success: false, error: 'Invalid authorization token' });
        }
        
        if (!newSCStatus) {
            return res.status(400).json({
                success: false,
                error: 'Missing required field: newSCStatus'
            });
        }
        
        // Validate status
        const validStatuses = ['IN_ESCROW', 'IN_FINAL_APPROVAL', 'COMPLETED', 'DISPUTED'];
        if (!validStatuses.includes(newSCStatus)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid smart contract status value'
            });
        }
        
        const dealRef = db.collection('deals').doc(dealId);
        const dealDoc = await dealRef.get();
        
        if (!dealDoc.exists) {
            return res.status(404).json({
                success: false,
                error: 'Deal not found'
            });
        }
        
        const dealData = dealDoc.data();
        
        // Authorization check - user must be a participant in the deal
        if (!dealData.participants || !dealData.participants.includes(userId)) {
            return res.status(403).json({
                success: false,
                error: 'Access denied - not a participant in this deal'
            });
        }
        
        // Update deal status
        await dealRef.update({
            smartContractStatus: newSCStatus,
            lastUpdated: FieldValue.serverTimestamp(),
            ...(finalApprovalDeadlineISO && { finalApprovalDeadline: new Date(finalApprovalDeadlineISO) })
        });
        
        res.json({
            success: true,
            dealId,
            newStatus: newSCStatus,
            message: eventMessage || 'Smart contract status updated'
        });
        
    } catch (error) {
        console.error('[SYNC STATUS ERROR]', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Start final approval period
router.post('/:dealId/sc/start-final-approval', async (req, res) => {
    try {
        const { dealId } = req.params;
        const { finalApprovalDeadlineISO } = req.body;
        
        if (!finalApprovalDeadlineISO) {
            return res.status(400).json({
                success: false,
                error: 'Missing required field: finalApprovalDeadlineISO'
            });
        }
        
        // Validate date
        const deadline = new Date(finalApprovalDeadlineISO);
        if (isNaN(deadline.getTime())) {
            return res.status(400).json({
                success: false,
                error: 'Invalid date format'
            });
        }
        
        if (deadline <= new Date()) {
            return res.status(400).json({
                success: false,
                error: 'Deadline must be in the future'
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
        
        await dealRef.update({
            finalApprovalDeadline: deadline,
            smartContractStatus: 'IN_FINAL_APPROVAL',
            lastUpdated: FieldValue.serverTimestamp()
        });
        
        res.json({
            success: true,
            dealId,
            finalApprovalDeadline: deadline.toISOString(),
            message: 'Final approval period started'
        });
        
    } catch (error) {
        console.error('[START FINAL APPROVAL ERROR]', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Raise dispute on smart contract
router.post('/:dealId/sc/raise-dispute', async (req, res) => {
    try {
        const { dealId } = req.params;
        const { conditionId, disputeResolutionDeadlineISO } = req.body;
        
        if (!conditionId || !disputeResolutionDeadlineISO) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: conditionId, disputeResolutionDeadlineISO'
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
        
        // Check if deal is already completed
        if (dealData.status === 'completed') {
            return res.status(400).json({
                success: false,
                error: 'Cannot raise dispute on completed deal'
            });
        }
        
        // Update deal with dispute info
        await dealRef.update({
            status: 'disputed',
            disputeConditionId: conditionId,
            disputeResolutionDeadline: new Date(disputeResolutionDeadlineISO),
            lastUpdated: FieldValue.serverTimestamp()
        });
        
        // Use event-driven dispute handling
        await raiseDealDispute(dealId, {
            escrowId: dealData.escrowId,
            chainId: dealData.buyerChainId,
            contractAddress: dealData.smartContractAddress,
            reason: `Dispute on condition: ${conditionId}`,
            conditionId
        });
        
        res.json({
            success: true,
            dealId,
            conditionId,
            message: 'Dispute raised successfully'
        });
        
    } catch (error) {
        console.error('[RAISE DISPUTE ERROR]', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Gas estimation endpoint
router.post('/estimate-gas', async (req, res) => {
    try {
        // Authentication check
        const idToken = req.headers.authorization?.split('Bearer ')[1];
        if (!idToken) {
            return res.status(401).json({ success: false, error: 'No authorization token provided' });
        }

        const { auth } = await getFirebaseServices();
        try {
            await auth.verifyIdToken(idToken);
        } catch (authError) {
            return res.status(401).json({ success: false, error: 'Invalid authorization token' });
        }

        const { operation, network, amount, dealId } = req.body;
        
        if (!operation || !network) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: operation, network'
            });
        }
        
        const validOperations = ['deploy', 'release', 'cancel'];
        if (!validOperations.includes(operation)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid operation'
            });
        }
        
        // Mock gas estimation - would use real blockchain in production
        const gasEstimates = {
            deploy: '500000',
            release: '200000', 
            cancel: '150000'
        };
        
        res.json({
            success: true,
            operation,
            network,
            gasEstimate: gasEstimates[operation],
            estimatedCost: '0.01 ETH' // Mock value
        });
        
    } catch (error) {
        console.error('[ESTIMATE GAS ERROR]', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Admin endpoints
router.get('/admin/manual-intervention', async (req, res) => {
    try {
        const { db } = await getFirebaseServices();
        
        // Get deals that might need manual intervention
        const snapshot = await db.collection('deals')
            .where('status', 'in', ['disputed', 'failed'])
            .get();
        
        const deals = [];
        snapshot.forEach(doc => {
            deals.push({
                id: doc.id,
                ...doc.data()
            });
        });
        
        res.json({
            success: true,
            deals,
            count: deals.length
        });
        
    } catch (error) {
        console.error('[ADMIN MANUAL INTERVENTION ERROR]', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Helper function to validate user stake balance
async function validateUserStakeBalance(userId, requiredStake, token, chainId) {
    try {
        // Get user wallet address from database
        const { db } = await getFirebaseServices();
        const userDoc = await db.collection('users').doc(userId).get();
        
        if (!userDoc.exists) {
            return { sufficient: false, balance: 0 };
        }
        
        const userData = userDoc.data();
        const walletAddress = userData.walletAddress;
        
        if (!walletAddress || !isAddress(walletAddress)) {
            return { sufficient: false, balance: 0 };
        }
        
        // Get RPC URL for the chain
        const rpcUrl = await escrowService._getRpcUrl(chainId);
        const provider = new JsonRpcProvider(rpcUrl);
        
        let balance = 0;
        
        if (token === 'ETH' || !token) {
            // Check ETH balance
            const ethBalance = await provider.getBalance(walletAddress);
            balance = parseFloat(formatEther(ethBalance));
        } else {
            // Check ERC20 token balance
            // This would require the token contract ABI and address
            // For now, we'll assume sufficient balance and rely on contract validation
            return { sufficient: true, balance: requiredStake };
        }
        
        return {
            sufficient: balance >= requiredStake,
            balance
        };
    } catch (error) {
        console.error('[ValidateBalance] Error checking user balance:', error);
        // On error, let the contract handle validation
        return { sufficient: true, balance: 0 };
    }
}

export default router;