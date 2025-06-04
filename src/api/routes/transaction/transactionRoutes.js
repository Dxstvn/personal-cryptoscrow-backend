import express from 'express';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getAdminApp } from '../auth/admin.js';
import { deployPropertyEscrowContract } from '../../../services/contractDeployer.js';
import { isAddress, getAddress, parseUnits } from 'ethers'; // This is the import we are interested in
import { Wallet } from 'ethers';
// Import cross-chain services
import { 
  areNetworksEVMCompatible,
  getBridgeInfo,
  estimateTransactionFees,
  prepareCrossChainTransaction,
  executeCrossChainStep,
  getCrossChainTransactionStatus
} from '../../../services/crossChainService.js';

const router = express.Router();

// Helper function to get Firebase services
async function getFirebaseServices() {
  const adminApp = await getAdminApp();
  return {
    db: getFirestore(adminApp),
    auth: getAdminAuth(adminApp)
  };
}

// const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY; // REMOVE
// const RPC_URL = process.env.RPC_URL || process.env.SEPOLIA_RPC_URL; // REMOVE

// Helper function to detect network from wallet address
function detectNetworkFromAddress(address) {
  // EVM addresses (Ethereum, Polygon, BSC, etc.)
  if (address.startsWith('0x') && address.length === 42) {
    return 'ethereum'; // Default to ethereum for EVM addresses
  }
  
  // Bitcoin addresses (check before Solana since bc1 addresses can match Solana regex)
  if (/^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,59}$/.test(address)) {
    return 'bitcoin';
  }
  
  // Solana addresses (base58, 32-44 characters)
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) {
    return 'solana';
  }
  
  // Default to ethereum for EVM-compatible addresses
  return 'ethereum';
}

// Helper function to validate cross-chain wallet address
function validateCrossChainAddress(address) {
  // EVM addresses
  if (address.startsWith('0x')) {
    return isAddress(address);
  }
  
  // Solana addresses
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) {
    return true;
  }
  
  // Bitcoin addresses
  if (/^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,59}$/.test(address)) {
    return true;
  }
  
  return false;
}

async function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    const isTest = process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'e2e_test';
    
    if (!token) {
        return res.status(401).json({ error: 'Authentication token is required.' });
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
        console.error('Authentication error:', err.message);
        return res.status(403).json({ error: 'Authentication failed' });
    }
}

function areAllBackendConditionsFulfilled(conditions = []) {
    if (!conditions || conditions.length === 0) return true;
    return conditions.every(condition => condition.status === 'FULFILLED_BY_BUYER');
}

router.post('/create', authenticateToken, async (req, res) => {
    const initiatorId = req.userId;
    const {
        initiatedBy, propertyAddress, amount, otherPartyEmail,
        initialConditions, buyerWalletAddress, sellerWalletAddress
    } = req.body;

    try {
        const { db } = await getFirebaseServices();
        
        // Get the initiator's email from the database using userId
        const initiatorDoc = await db.collection('users').doc(initiatorId).get();
        if (!initiatorDoc.exists) {
            return res.status(404).json({ error: 'User profile not found.' });
        }
        const initiatorData = initiatorDoc.data();
        const initiatorEmail = initiatorData.email;
        
        if (!initiatorEmail) {
            return res.status(400).json({ error: 'User profile missing email address.' });
        }
        
        // --- Input Validations - VALIDATE BEFORE USING ---
        if (!initiatedBy || (initiatedBy !== 'BUYER' && initiatedBy !== 'SELLER')) {
            return res.status(400).json({ error: 'Invalid "initiatedBy". Must be "BUYER" or "SELLER".' });
        }
        if (typeof propertyAddress !== 'string' || propertyAddress.trim() === '') {
            return res.status(400).json({ error: 'Property address is required.' });
        }
        if (typeof amount !== 'number' || amount <= 0 || !Number.isFinite(amount)) {
            return res.status(400).json({ error: 'Amount must be a positive finite number.' });
        }
        if (typeof otherPartyEmail !== 'string' || otherPartyEmail.trim() === '' || !otherPartyEmail.includes('@')) {
            return res.status(400).json({ error: 'Valid other party email is required.' });
        }

        // NOW safe to use trim() after validation
        const normalizedOtherPartyEmail = otherPartyEmail.trim().toLowerCase();

        // Enhanced wallet address validation for cross-chain support
        if (!buyerWalletAddress || !validateCrossChainAddress(buyerWalletAddress)) {
            return res.status(400).json({ error: 'Valid buyer wallet address is required.' });
        }
        if (!sellerWalletAddress || !validateCrossChainAddress(sellerWalletAddress)) {
            return res.status(400).json({ error: 'Valid seller wallet address is required.' });
        }

        if (initialConditions && (!Array.isArray(initialConditions) || !initialConditions.every(c => c && typeof c.id === 'string' && c.id.trim() !== '' && typeof c.description === 'string' && typeof c.type === 'string'))) {
            return res.status(400).json({ error: 'Initial conditions must be an array of objects with non-empty "id", "type", and "description".' });
        }

        console.log(`[ROUTE LOG] /create - Transaction creation request by UID: ${initiatorId} (${initiatorEmail}), Role: ${initiatedBy}`);

        // Detect networks from wallet addresses
        const buyerNetwork = detectNetworkFromAddress(buyerWalletAddress);
        const sellerNetwork = detectNetworkFromAddress(sellerWalletAddress);
        const isCrossChain = !areNetworksEVMCompatible(buyerNetwork, sellerNetwork);

        console.log(`[CROSS-CHAIN] Network detection: Buyer=${buyerNetwork}, Seller=${sellerNetwork}, CrossChain=${isCrossChain}`);

        let escrowAmountWeiString;
        try {
            escrowAmountWeiString = parseUnits(String(amount), 'ether').toString();
        } catch (parseError) {
            console.error("[ROUTE ERROR] Error parsing amount to Wei:", parseError);
            return res.status(400).json({ error: `Invalid amount format: ${amount}. ${parseError.message}` });
        }

        try {
            if (initiatorEmail.toLowerCase() === normalizedOtherPartyEmail) {
                return res.status(400).json({ error: 'Cannot create a transaction with yourself.' });
            }

            const otherPartyQuery = await db.collection('users').where('email', '==', normalizedOtherPartyEmail).limit(1).get();
            if (otherPartyQuery.empty) {
                return res.status(404).json({ error: `User with email ${otherPartyEmail} not found.` });
            }
            const otherPartyId = otherPartyQuery.docs[0].id;
            const otherPartyData = otherPartyQuery.docs[0].data();

            let buyerIdFs, sellerIdFs, status;
            // For cross-chain, we preserve the original addresses
            const finalBuyerWallet = buyerWalletAddress;
            const finalSellerWallet = sellerWalletAddress;

            // Ensure addresses are different
            if (finalBuyerWallet.toLowerCase() === finalSellerWallet.toLowerCase()) {
                return res.status(400).json({ error: 'Buyer and Seller wallet addresses cannot be the same.' });
            }

            if (initiatedBy === 'SELLER') {
                sellerIdFs = initiatorId; buyerIdFs = otherPartyId; status = 'PENDING_BUYER_REVIEW';
            } else {
                buyerIdFs = initiatorId; sellerIdFs = otherPartyId; status = 'PENDING_SELLER_REVIEW';
            }

            const now = Timestamp.now();
            
            // Prepare cross-chain specific conditions if needed
            let enhancedConditions = [...(initialConditions || [])];
            let crossChainTransactionId = null;
            let crossChainInfo = null;

            if (isCrossChain) {
                // Add cross-chain specific conditions
                const crossChainConditions = [
                    {
                        id: 'cross_chain_network_validation',
                        type: 'CROSS_CHAIN',
                        description: `Network compatibility validated (${buyerNetwork} to ${sellerNetwork})`
                    },
                    {
                        id: 'cross_chain_bridge_setup',
                        type: 'CROSS_CHAIN',
                        description: 'Cross-chain bridge connection established'
                    },
                    {
                        id: 'cross_chain_funds_locked',
                        type: 'CROSS_CHAIN',
                        description: `Funds locked on source network (${buyerNetwork})`
                    }
                ];

                // Add bridge-specific condition if bridge is required
                const bridgeInfo = getBridgeInfo(buyerNetwork, sellerNetwork);
                if (bridgeInfo) {
                    crossChainConditions.push({
                        id: 'cross_chain_bridge_transfer',
                        type: 'CROSS_CHAIN',
                        description: `Bridge transfer via ${bridgeInfo.bridge} completed`
                    });
                    crossChainInfo = bridgeInfo;
                }

                enhancedConditions = [...crossChainConditions, ...enhancedConditions];
                console.log(`[CROSS-CHAIN] Added ${crossChainConditions.length} cross-chain conditions`);
            }

            const newTransactionData = {
                propertyAddress: propertyAddress.trim(), 
                amount: Number(amount), 
                escrowAmountWei: escrowAmountWeiString,
                sellerId: sellerIdFs, 
                buyerId: buyerIdFs, 
                buyerWalletAddress: finalBuyerWallet, 
                sellerWalletAddress: finalSellerWallet,
                // Cross-chain specific fields
                buyerNetwork,
                sellerNetwork,
                isCrossChain,
                crossChainTransactionId,
                crossChainInfo,
                participants: [sellerIdFs, buyerIdFs], 
                status, 
                createdAt: now, 
                updatedAt: now, 
                initiatedBy,
                otherPartyEmail: normalizedOtherPartyEmail, 
                initiatorEmail: initiatorEmail.toLowerCase(),
                conditions: enhancedConditions.map(cond => ({
                    id: cond.id.trim(), 
                    type: cond.type.trim() || 'CUSTOM', 
                    description: String(cond.description).trim(),
                    status: 'PENDING_BUYER_ACTION', 
                    documents: [], 
                    createdBy: initiatorId, 
                    createdAt: now, 
                    updatedAt: now,
                })),
                documents: [],
                timeline: [
                    { 
                        event: `Transaction initiated by ${initiatedBy.toLowerCase()} (${initiatorEmail}). Other party: ${otherPartyData.email}.`, 
                        timestamp: now, 
                        userId: initiatorId 
                    }
                ],
                smartContractAddress: null, 
                fundsDepositedByBuyer: false, 
                fundsReleasedToSeller: false,
                finalApprovalDeadlineBackend: null, 
                disputeResolutionDeadlineBackend: null,
            };

            if (isCrossChain) {
                newTransactionData.timeline.push({
                    event: `Cross-chain transaction detected: ${buyerNetwork} → ${sellerNetwork}${crossChainInfo ? ` via ${crossChainInfo.bridge}` : ''}`,
                    timestamp: now,
                    system: true
                });
            }

            if (enhancedConditions && enhancedConditions.length > 0) {
                 newTransactionData.timeline.push({ 
                     event: `${initiatedBy.toLowerCase()} specified ${enhancedConditions.length} condition(s) for review${isCrossChain ? ' (including cross-chain conditions)' : ''}.`, 
                     timestamp: now, 
                     userId: initiatorId 
                 });
            }

            let deployedContractAddress = null;

            // Smart contract deployment (only for EVM-compatible scenarios)
            const currentDeployerKey = process.env.DEPLOYER_PRIVATE_KEY;
            const currentRpcUrl = process.env.RPC_URL || process.env.SEPOLIA_RPC_URL;

            if (!currentDeployerKey || !currentRpcUrl) {
                console.warn("[ROUTE WARN] Deployment skipped: DEPLOYER_PRIVATE_KEY or RPC_URL not set in .env. Transaction will be off-chain only.");
                newTransactionData.timeline.push({ event: `Smart contract deployment SKIPPED (off-chain only mode).`, timestamp: Timestamp.now(), system: true });
            } else if (isCrossChain && buyerNetwork !== 'ethereum' && sellerNetwork !== 'ethereum') {
                console.log("[ROUTE LOG] Cross-chain transaction with no EVM networks - smart contract deployment skipped");
                newTransactionData.timeline.push({ 
                    event: `Smart contract deployment SKIPPED for cross-chain transaction (${buyerNetwork} → ${sellerNetwork}).`, 
                    timestamp: Timestamp.now(), 
                    system: true 
                });
            } else {
                try {
                    console.log(`[ROUTE LOG] Attempting to deploy PropertyEscrow contract. Buyer: ${finalBuyerWallet}, Seller: ${finalSellerWallet}, Amount: ${newTransactionData.escrowAmountWei}`);
                    
                    // For cross-chain, use EVM-compatible addresses or convert
                    let contractBuyerAddress = finalBuyerWallet;
                    let contractSellerAddress = finalSellerWallet;
                    
                    // If cross-chain involves non-EVM, use a representative EVM address
                    if (isCrossChain) {
                        if (buyerNetwork !== 'ethereum' && !buyerWalletAddress.startsWith('0x')) {
                            // Use a deterministic EVM address derived from the non-EVM address
                            contractBuyerAddress = '0x' + '1'.repeat(40); // Placeholder - in production, use proper derivation
                        }
                        if (sellerNetwork !== 'ethereum' && !sellerWalletAddress.startsWith('0x')) {
                            contractSellerAddress = '0x' + '2'.repeat(40); // Placeholder - in production, use proper derivation
                        }
                    }
                    
                    const deployerWallet = new Wallet(currentDeployerKey);
                    const serviceWalletAddress = deployerWallet.address;
                    console.log(`[ROUTE LOG] Using service wallet: ${serviceWalletAddress} (derived from deployer key)`);
                    
                    const deploymentResult = await deployPropertyEscrowContract(
                        contractSellerAddress, 
                        contractBuyerAddress, 
                        newTransactionData.escrowAmountWei,
                        currentDeployerKey,
                        currentRpcUrl,
                        serviceWalletAddress
                    );
                    
                    deployedContractAddress = deploymentResult.contractAddress;
                    newTransactionData.smartContractAddress = deployedContractAddress;
                    newTransactionData.timeline.push({ 
                        event: `PropertyEscrow smart contract deployed at ${deployedContractAddress} with 2% service fee to ${serviceWalletAddress}${isCrossChain ? ' (cross-chain compatible)' : ''}.`, 
                        timestamp: Timestamp.now(), 
                        system: true 
                    });
                    console.log(`[ROUTE LOG] Smart contract deployed: ${deployedContractAddress} with service wallet: ${serviceWalletAddress}`);
                } catch (deployError) {
                    console.error('[ROUTE ERROR] Smart contract deployment failed:', deployError.message, deployError.stack);
                    newTransactionData.timeline.push({ 
                        event: `Smart contract deployment FAILED: ${deployError.message}. Proceeding as off-chain.`, 
                        timestamp: Timestamp.now(), 
                        system: true 
                    });
                }
            }

            // Store the deal first
            const transactionRef = await db.collection('deals').add(newTransactionData);
            console.log(`[ROUTE LOG] Transaction stored in Firestore: ${transactionRef.id}. Status: ${newTransactionData.status}. SC: ${newTransactionData.smartContractAddress || 'None'}`);

            // Prepare cross-chain transaction if needed
            if (isCrossChain) {
                try {
                    const crossChainTx = await prepareCrossChainTransaction({
                        fromAddress: finalBuyerWallet,
                        toAddress: finalSellerWallet,
                        amount: String(amount),
                        sourceNetwork: buyerNetwork,
                        targetNetwork: sellerNetwork,
                        dealId: transactionRef.id,
                        userId: initiatorId
                    });

                    // Update the deal with cross-chain transaction ID
                    await transactionRef.update({
                        crossChainTransactionId: crossChainTx.id,
                        timeline: FieldValue.arrayUnion({
                            event: `Cross-chain transaction prepared: ${crossChainTx.id}. Bridge required: ${crossChainTx.needsBridge}`,
                            timestamp: Timestamp.now(),
                            system: true
                        })
                    });

                    console.log(`[CROSS-CHAIN] Prepared cross-chain transaction: ${crossChainTx.id} for deal: ${transactionRef.id}`);
                } catch (crossChainError) {
                    console.error('[CROSS-CHAIN] Error preparing cross-chain transaction:', crossChainError);
                    await transactionRef.update({
                        timeline: FieldValue.arrayUnion({
                            event: `Cross-chain transaction preparation FAILED: ${crossChainError.message}`,
                            timestamp: Timestamp.now(),
                            system: true
                        })
                    });
                }
            }

            const responsePayload = {
                message: 'Transaction initiated successfully.', 
                transactionId: transactionRef.id,
                status: newTransactionData.status, 
                smartContractAddress: newTransactionData.smartContractAddress,
                isCrossChain,
                crossChainInfo: isCrossChain ? {
                    buyerNetwork,
                    sellerNetwork,
                    bridgeInfo: crossChainInfo,
                    crossChainTransactionId: newTransactionData.crossChainTransactionId
                } : null
            };
            
            if (deployedContractAddress === null && currentDeployerKey && currentRpcUrl) {
                responsePayload.deploymentWarning = "Smart contract deployment was attempted but failed. The transaction has been created for off-chain tracking.";
            }
            
            res.status(201).json(responsePayload);

        } catch (error) {
            console.error('[ROUTE ERROR] Error in /create transaction route:', error.message, error.stack);
            res.status(500).json({ error: 'Internal server error during transaction creation.' });
        }
    } catch (error) {
        console.error('[ROUTE ERROR] Error in /create transaction route:', error.message, error.stack);
        res.status(500).json({ error: 'Internal server error during transaction creation.' });
    }
});

// ... (rest of the routes: GET /, GET /:transactionId, PUTs, POSTs for SC interactions) ...
// Make sure no other routes are accidentally duplicated or malformed.

// Example for GET /:transactionId (ensure logging is not excessive here unless debugging this route)
router.get('/:transactionId', authenticateToken, async (req, res) => {
    const { transactionId } = req.params;
    const userId = req.userId;
    try {
        const { db } = await getFirebaseServices();
        const doc = await db.collection('deals').doc(transactionId).get();
        if (!doc.exists) {
            return res.status(404).json({ error: 'Transaction not found.' });
        }
        const transactionData = doc.data();
        if (!Array.isArray(transactionData.participants) || !transactionData.participants.includes(userId)) {
            console.warn(`[ROUTE WARN] Access denied for user ${userId} on deal ${transactionId}`);
            return res.status(403).json({ error: 'Access denied.' });
        }
        const responseDetails = {
            ...transactionData, id: doc.id,
            createdAt: transactionData.createdAt?.toDate()?.toISOString() ?? null,
            updatedAt: transactionData.updatedAt?.toDate()?.toISOString() ?? null,
            timeline: (transactionData.timeline || []).map(t => ({ ...t, timestamp: t.timestamp?.toDate()?.toISOString() ?? null })),
            conditions: (transactionData.conditions || []).map(c => ({ ...c, createdAt: c.createdAt?.toDate()?.toISOString() ?? null, updatedAt: c.updatedAt?.toDate()?.toISOString() ?? null, documents: c.documents || [] }))
        };
         if (transactionData.finalApprovalDeadlineBackend) responseDetails.finalApprovalDeadlineBackend = transactionData.finalApprovalDeadlineBackend.toDate().toISOString();
         if (transactionData.disputeResolutionDeadlineBackend) responseDetails.disputeResolutionDeadlineBackend = transactionData.disputeResolutionDeadlineBackend.toDate().toISOString();
        res.status(200).json(responseDetails);
    } catch (error) {
        console.error(`[ROUTE ERROR] Error fetching transaction ${transactionId}:`, error);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

router.get('/', authenticateToken, async (req, res) => {
    const userId = req.userId;
    const { limit = 10, startAfter, orderBy = 'createdAt', orderDirection = 'desc' } = req.query;
    try {
        const { db } = await getFirebaseServices();
        let query = db.collection('deals')
            .where('participants', 'array-contains', userId)
            .orderBy(orderBy, orderDirection.toLowerCase() === 'asc' ? 'asc' : 'desc')
            .limit(Number(limit) || 10);

        if (startAfter) {
             if (orderBy === 'createdAt' || orderBy === 'updatedAt') {
                 try {
                    let startDate = new Date(startAfter);
                    if (isNaN(startDate.getTime())) {
                        const parts = startAfter.match(/seconds=(\d+).*nanoseconds=(\d+)/);
                        if (parts) {
                           startDate = new Timestamp(parseInt(parts[1], 10), parseInt(parts[2], 10)).toDate();
                        } else {
                             throw new Error("Unrecognized startAfter format for timestamp field.");
                        }
                    }
                    const startAfterTimestamp = Timestamp.fromDate(startDate);
                    query = query.startAfter(startAfterTimestamp);
                 } catch (dateError) {
                     console.warn("[ROUTE WARN] Invalid startAfter format for timestamp:", startAfter, dateError.message);
                     return res.status(400).json({ error: "Invalid startAfter format for timestamp field. Use ISO 8601 or Firestore Timestamp string." });
                 }
            } else {
                 query = query.startAfter(startAfter);
             }
        }

        const snapshot = await query.get();
        if (snapshot.empty) return res.status(200).json([]);

        const transactions = snapshot.docs.map(doc => {
            const data = doc.data();
            const responseDetails = {
                 ...data, id: doc.id,
                createdAt: data.createdAt?.toDate()?.toISOString() ?? null,
                updatedAt: data.updatedAt?.toDate()?.toISOString() ?? null,
                timeline: (data.timeline || []).map(t => ({ ...t, timestamp: t.timestamp?.toDate()?.toISOString() ?? null })),
                conditions: (data.conditions || []).map(c => ({ ...c, createdAt: c.createdAt?.toDate()?.toISOString() ?? null, updatedAt: c.updatedAt?.toDate()?.toISOString() ?? null, documents: c.documents || [] }))
            };
             if (data.finalApprovalDeadlineBackend) responseDetails.finalApprovalDeadlineBackend = data.finalApprovalDeadlineBackend.toDate().toISOString();
             if (data.disputeResolutionDeadlineBackend) responseDetails.disputeResolutionDeadlineBackend = data.disputeResolutionDeadlineBackend.toDate().toISOString();
            return responseDetails;
        });
        res.status(200).json(transactions);
    } catch (error) {
        console.error(`[ROUTE ERROR] Error fetching transactions for UID ${userId}:`, error.message, error.stack);
        if (error.message.includes('order by') || error.message.includes('invalid-argument')) {
             return res.status(400).json({ error: `Invalid orderBy field or query: ${orderBy}. Ensure it exists and is indexed if needed.` });
        }
        res.status(500).json({ error: 'Internal server error.' });
    }
});

router.patch('/conditions/:conditionId/buyer-review', authenticateToken, async (req, res) => {
    const { conditionId } = req.params;
    const { 
        transactionId, 
        status, 
        dealId, 
        notes,
        // Cross-chain specific fields
        crossChainTxHash,
        crossChainStepNumber
    } = req.body;
    const userId = req.userId;

    try {
        const { db } = await getFirebaseServices();

        // Validate status
        const validStatuses = ['FULFILLED_BY_BUYER', 'ACTION_WITHDRAWN_BY_BUYER'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ error: 'Invalid status. Must be "FULFILLED_BY_BUYER" or "ACTION_WITHDRAWN_BY_BUYER".' });
        }

        // Determine collection and ID
        const collectionName = dealId ? 'deals' : 'transactions';
        const documentId = dealId || transactionId;

        if (!documentId) {
            return res.status(400).json({ error: 'Either dealId or transactionId is required.' });
        }

        // Get the document
        const docRef = db.collection(collectionName).doc(documentId);
        const docSnapshot = await docRef.get();

        if (!docSnapshot.exists) {
            return res.status(404).json({ error: `${dealId ? 'Deal' : 'Transaction'} not found.` });
        }

        const docData = docSnapshot.data();

        // Check if user is authorized
        if (!docData.participants.includes(userId)) {
            return res.status(403).json({ error: 'Access denied. User is not a participant in this transaction.' });
        }

        // Find and update the condition
        const conditions = [...docData.conditions];
        const conditionIndex = conditions.findIndex(c => c.id === conditionId);

        if (conditionIndex === -1) {
            return res.status(404).json({ error: 'Condition not found.' });
        }

        const condition = conditions[conditionIndex];

        // Handle cross-chain conditions differently
        const isCrossChainCondition = condition.type === 'CROSS_CHAIN';
        
        if (isCrossChainCondition && docData.isCrossChain) {
            // For cross-chain conditions, also update the cross-chain transaction if provided
            if (crossChainTxHash && crossChainStepNumber && docData.crossChainTransactionId) {
                try {
                    await executeCrossChainStep(docData.crossChainTransactionId, crossChainStepNumber, crossChainTxHash);
                    console.log(`[CROSS-CHAIN] Updated step ${crossChainStepNumber} for condition ${conditionId}`);
                } catch (crossChainError) {
                    console.error('[CROSS-CHAIN] Error updating cross-chain step:', crossChainError);
                    // Continue with condition update even if cross-chain step fails
                }
            }
        }

        // Update condition
        conditions[conditionIndex] = {
            ...condition,
            status,
            notes: notes || condition.notes,
            updatedAt: Timestamp.now(),
            updatedBy: userId,
            ...(isCrossChainCondition && crossChainTxHash && { crossChainTxHash }),
            ...(isCrossChainCondition && crossChainStepNumber && { crossChainStepNumber })
        };

        // Prepare update data
        const updateData = {
            conditions,
            updatedAt: Timestamp.now(),
            timeline: FieldValue.arrayUnion({
                event: `Condition "${condition.description}" updated to ${status}${isCrossChainCondition ? ' (cross-chain)' : ''}${notes ? ` with notes: ${notes}` : ''}`,
                timestamp: Timestamp.now(),
                userId,
                conditionId,
                ...(isCrossChainCondition && { crossChain: true })
            })
        };

        // Check if all conditions are fulfilled for status progression
        const allConditionsFulfilled = areAllBackendConditionsFulfilled(conditions);
        
        if (allConditionsFulfilled && docData.status === 'AWAITING_CONDITION_FULFILLMENT') {
            updateData.status = 'READY_FOR_FINAL_APPROVAL';
            updateData.timeline = FieldValue.arrayUnion(
                updateData.timeline.arrayUnion[0], // Keep the condition update event
                {
                    event: `All conditions fulfilled${docData.isCrossChain ? ' (including cross-chain conditions)' : ''}. Deal ready for final approval.`,
                    timestamp: Timestamp.now(),
                    system: true,
                    statusChange: { from: 'AWAITING_CONDITION_FULFILLMENT', to: 'READY_FOR_FINAL_APPROVAL' }
                }
            );
        }

        // Update the document
        await docRef.update(updateData);

        console.log(`[ROUTE LOG] Condition ${conditionId} updated to ${status} for ${collectionName} ${documentId}${isCrossChainCondition ? ' (cross-chain)' : ''}`);

        res.json({ 
            message: 'Condition updated successfully', 
            conditionId, 
            status,
            isCrossChain: isCrossChainCondition,
            allConditionsFulfilled,
            ...(updateData.status && { newDealStatus: updateData.status })
        });

    } catch (error) {
        console.error('[ROUTE ERROR] Error updating condition:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.put('/:transactionId/sync-status', authenticateToken, async (req, res) => {
    const { transactionId } = req.params;
    const { newSCStatus, eventMessage, finalApprovalDeadlineISO, disputeResolutionDeadlineISO } = req.body;
    const userId = req.userId;

    if (!newSCStatus || typeof newSCStatus !== 'string') {
        return res.status(400).json({ error: 'New Smart Contract status (newSCStatus) is required and must be a string.' });
    }
    const ALLOWED_SC_STATUSES = [
        'AWAITING_CONDITION_SETUP', 'PENDING_BUYER_REVIEW', 'PENDING_SELLER_REVIEW',
        'AWAITING_DEPOSIT', 'IN_ESCROW', 'AWAITING_FULFILLMENT',
        'READY_FOR_FINAL_APPROVAL', 'IN_FINAL_APPROVAL', 'IN_DISPUTE',
        'COMPLETED', 'CANCELLED'
    ];
    if (!ALLOWED_SC_STATUSES.includes(newSCStatus)) {
        return res.status(400).json({ error: `Invalid smart contract status value: ${newSCStatus}.` });
    }

    // console.log(`[ROUTE LOG] Syncing/Updating backend status for TX ID: ${transactionId} to SC State "${newSCStatus}" by UID: ${userId}`);

    try {
        const { db } = await getFirebaseServices();
        const transactionRef = db.collection('deals').doc(transactionId);
        const now = Timestamp.now();

        await db.runTransaction(async (t) => {
            const doc = await t.get(transactionRef);
            if (!doc.exists) throw { status: 404, message: 'Transaction not found.' };

            const txData = doc.data();
            const currentBackendStatus = txData.status;

            if (!Array.isArray(txData.participants) || !txData.participants.includes(userId)) {
                throw { status: 403, message: 'Access denied. Not a participant of this transaction.' };
            }

            const updatePayload = { status: newSCStatus, updatedAt: now };
            const timelineEventsToAdd = [];
            const baseEventMessage = eventMessage || `Backend status synced to ${newSCStatus} based on smart contract state.`;
            timelineEventsToAdd.push({
                event: `${baseEventMessage} Synced by UID: ${userId}.`,
                timestamp: now, userId, systemTriggered: !eventMessage
            });

            if (newSCStatus === 'IN_FINAL_APPROVAL' && finalApprovalDeadlineISO) {
                try {
                    updatePayload.finalApprovalDeadlineBackend = Timestamp.fromDate(new Date(finalApprovalDeadlineISO));
                    timelineEventsToAdd.push({ event: `Final approval deadline set/updated to ${finalApprovalDeadlineISO}.`, timestamp: now, system: true });
                } catch (e) { console.warn("[ROUTE WARN] Invalid finalApprovalDeadlineISO format during sync:", finalApprovalDeadlineISO); }
            }
            if (newSCStatus === 'IN_DISPUTE' && disputeResolutionDeadlineISO) {
                 try {
                    updatePayload.disputeResolutionDeadlineBackend = Timestamp.fromDate(new Date(disputeResolutionDeadlineISO));
                    timelineEventsToAdd.push({ event: `Dispute resolution deadline set/updated to ${disputeResolutionDeadlineISO}.`, timestamp: now, system: true });
                 } catch (e) { console.warn("[ROUTE WARN] Invalid disputeResolutionDeadlineISO format during sync:", disputeResolutionDeadlineISO); }
            }

            const fundsDepositedStates = ['AWAITING_FULFILLMENT', 'READY_FOR_FINAL_APPROVAL', 'IN_FINAL_APPROVAL', 'COMPLETED'];
            if (fundsDepositedStates.includes(newSCStatus) && !txData.fundsDepositedByBuyer) {
                updatePayload.fundsDepositedByBuyer = true;
                timelineEventsToAdd.push({ event: `Funds confirmed deposited (synced from SC).`, timestamp: now, system: true });
            }
            if (newSCStatus === 'COMPLETED' && !txData.fundsReleasedToSeller) {
                updatePayload.fundsReleasedToSeller = true;
                timelineEventsToAdd.push({ event: `Funds confirmed released to seller (synced from SC).`, timestamp: now, system: true });
            }

            updatePayload.timeline = FieldValue.arrayUnion(...timelineEventsToAdd);
            // console.log(`[ROUTE LOG] Updating backend status for TX ${transactionId} from ${currentBackendStatus} to ${newSCStatus}.`);
            t.update(transactionRef, updatePayload);
        });
        res.status(200).json({ message: `Transaction backend status synced/updated to ${newSCStatus}.`});
    } catch (error) {
        console.error(`[ROUTE ERROR] Error syncing/updating TX ${transactionId} status:`, error.status ? error.message : error.stack);
        res.status(error.status || 500).json({ error: error.message || 'Internal server error.' });
    }
});

router.post('/:transactionId/sc/start-final-approval', authenticateToken, async (req, res) => {
    const { transactionId } = req.params;
    const { finalApprovalDeadlineISO } = req.body;
    const userId = req.userId;

    if (!finalApprovalDeadlineISO) {
        return res.status(400).json({ error: "finalApprovalDeadlineISO is required (ISO string format)." });
    }

    try {
        const { db } = await getFirebaseServices();
        const transactionRef = db.collection('deals').doc(transactionId);
        const now = Timestamp.now();
        let finalApprovalTimestamp;
        try {
             finalApprovalTimestamp = Timestamp.fromDate(new Date(finalApprovalDeadlineISO));
             if (finalApprovalTimestamp.toDate() <= now.toDate()) {
                throw new Error("Final approval deadline must be in the future.");
             }
        } catch (e) {
             console.warn("[ROUTE WARN] Invalid finalApprovalDeadlineISO:", finalApprovalDeadlineISO, e.message);
             return res.status(400).json({ error: `Invalid finalApprovalDeadlineISO format or value: ${e.message}` });
        }

        await db.runTransaction(async (t) => {
            const doc = await t.get(transactionRef);
            if (!doc.exists) throw { status: 404, message: "Transaction not found." };
            const txData = doc.data();

            if (!txData.participants?.includes(userId)) {
                throw { status: 403, message: "Access denied. Not a participant." };
            }
            t.update(transactionRef, {
                status: 'IN_FINAL_APPROVAL',
                finalApprovalDeadlineBackend: finalApprovalTimestamp,
                updatedAt: now,
                timeline: FieldValue.arrayUnion({
                    event: `Final approval period started (synced from on-chain action by UID: ${userId}). Deadline: ${finalApprovalDeadlineISO}.`,
                    timestamp: now,
                    userId: userId
                })
            });
        });
        res.status(200).json({ message: "Backend synced: Final approval period started." });
    } catch (error) {
        console.error(`[ROUTE ERROR] Error syncing start-final-approval for TX ${transactionId}:`, error.status ? error.message : error.stack);
        res.status(error.status || 500).json({ error: error.message || 'Internal server error.' });
    }
});

router.post('/:transactionId/sc/raise-dispute', authenticateToken, async (req, res) => {
    const { transactionId } = req.params;
    const { conditionId, disputeResolutionDeadlineISO } = req.body;
    const userId = req.userId;

    if (!disputeResolutionDeadlineISO) {
        return res.status(400).json({ error: "disputeResolutionDeadlineISO is required (ISO string format)." });
    }

    try {
        const { db } = await getFirebaseServices();
        const transactionRef = db.collection('deals').doc(transactionId);
        const now = Timestamp.now();
        let disputeDeadlineTimestamp;
        try {
            disputeDeadlineTimestamp = Timestamp.fromDate(new Date(disputeResolutionDeadlineISO));
            if (disputeDeadlineTimestamp.toDate() <= now.toDate()) {
                throw new Error("Dispute resolution deadline must be in the future.");
            }
        } catch (e) {
            console.warn("[ROUTE WARN] Invalid disputeResolutionDeadlineISO:", disputeResolutionDeadlineISO, e.message);
            return res.status(400).json({ error: `Invalid disputeResolutionDeadlineISO format or value: ${e.message}` });
        }

        await db.runTransaction(async (t) => {
            const doc = await t.get(transactionRef);
            if (!doc.exists) throw { status: 404, message: "Transaction not found for dispute sync." };
            const txData = doc.data();
            const currentStatus = txData.status;

            if (currentStatus === 'IN_DISPUTE' || currentStatus === 'COMPLETED' || currentStatus === 'CANCELLED') {
                throw { status: 400, message: `Deal is not in a state where a dispute can be raised (current status: ${currentStatus}).` };
            }
            if (!txData.participants?.includes(userId)) {
                throw { status: 403, message: "Access denied. Not a participant." };
            }
            if (txData.buyerId !== userId) {
                throw { status: 403, message: "Only the buyer can raise a dispute via this sync endpoint." };
            }

            const updatePayload = {
                status: 'IN_DISPUTE',
                disputeResolutionDeadlineBackend: disputeDeadlineTimestamp,
                updatedAt: now,
                timeline: FieldValue.arrayUnion({
                    event: `Dispute raised (synced from on-chain action by UID: ${userId})${conditionId ? ` regarding condition ID: ${conditionId}` : ''}. Deadline: ${disputeResolutionDeadlineISO}.`,
                    timestamp: now,
                    userId: userId
                })
            };

            if (conditionId) {
                const conditionIndex = (txData.conditions || []).findIndex(c => c.id === conditionId);
                if (conditionIndex !== -1) {
                    let updatedConditions = JSON.parse(JSON.stringify(txData.conditions));
                    updatedConditions[conditionIndex].status = 'ACTION_WITHDRAWN_BY_BUYER';
                    updatedConditions[conditionIndex].updatedAt = now;
                    updatedConditions[conditionIndex].disputeComment = `Dispute raised by UID ${userId} at ${now.toDate().toISOString()}`;
                    updatePayload.conditions = updatedConditions;
                    console.log(`[ROUTE LOG] Condition ${conditionId} in TX ${transactionId} marked due to dispute.`);
                } else {
                    console.warn(`[ROUTE WARN] Condition ID ${conditionId} not found in deal ${transactionId} during dispute sync, but proceeding with deal status update.`);
                }
            }
            t.update(transactionRef, updatePayload);
            console.log(`[ROUTE LOG] TX ${transactionId} status updated to IN_DISPUTE by UID ${userId}.`);
        });
        res.status(200).json({ message: "Backend synced: Dispute raised." });
    } catch (error) {
        console.error(`[ROUTE ERROR] Error syncing raise-dispute for TX ${transactionId}:`, error.status ? error.message : error.stack);
        res.status(error.status || 500).json({ error: error.message || 'Internal server error.' });
    }
});

// Cross-Chain Transaction Management Endpoints

// Execute cross-chain transaction step
router.post('/cross-chain/:dealId/execute-step', authenticateToken, async (req, res) => {
    const { dealId } = req.params;
    const { stepNumber, txHash } = req.body;
    const userId = req.userId;

    try {
        const { db } = await getFirebaseServices();
        
        // Validate input
        if (!stepNumber || typeof stepNumber !== 'number') {
            return res.status(400).json({ error: 'Valid step number is required.' });
        }

        // Get the deal
        const dealDoc = await db.collection('deals').doc(dealId).get();
        if (!dealDoc.exists) {
            return res.status(404).json({ error: 'Deal not found.' });
        }

        const dealData = dealDoc.data();
        
        // Check if user is participant
        if (!dealData.participants.includes(userId)) {
            return res.status(403).json({ error: 'Access denied. User is not a participant in this deal.' });
        }

        // Check if this is a cross-chain transaction
        if (!dealData.isCrossChain || !dealData.crossChainTransactionId) {
            return res.status(400).json({ error: 'This is not a cross-chain transaction.' });
        }

        // Execute the cross-chain step
        const result = await executeCrossChainStep(dealData.crossChainTransactionId, stepNumber, txHash);

        // Update deal timeline
        await db.collection('deals').doc(dealId).update({
            timeline: FieldValue.arrayUnion({
                event: `Cross-chain step ${stepNumber} executed${txHash ? ` (tx: ${txHash})` : ''}`,
                timestamp: Timestamp.now(),
                userId
            }),
            updatedAt: Timestamp.now()
        });

        // If all steps completed, update cross-chain specific conditions
        if (result.status === 'completed') {
            await updateCrossChainConditions(dealId, dealData);
        }

        res.json({
            message: `Cross-chain step ${stepNumber} executed successfully`,
            status: result.status,
            txHash
        });

    } catch (error) {
        console.error('[CROSS-CHAIN] Error executing step:', error);
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
});

// Get cross-chain transaction status
router.get('/cross-chain/:dealId/status', authenticateToken, async (req, res) => {
    const { dealId } = req.params;
    const userId = req.userId;

    try {
        const { db } = await getFirebaseServices();
        
        // Get the deal
        const dealDoc = await db.collection('deals').doc(dealId).get();
        if (!dealDoc.exists) {
            return res.status(404).json({ error: 'Deal not found.' });
        }

        const dealData = dealDoc.data();
        
        // Check if user is participant
        if (!dealData.participants.includes(userId)) {
            return res.status(403).json({ error: 'Access denied. User is not a participant in this deal.' });
        }

        // Check if this is a cross-chain transaction
        if (!dealData.isCrossChain || !dealData.crossChainTransactionId) {
            return res.status(400).json({ error: 'This is not a cross-chain transaction.' });
        }

        // Get cross-chain transaction status
        const crossChainStatus = await getCrossChainTransactionStatus(dealData.crossChainTransactionId);

        // Get cross-chain conditions status
        const crossChainConditions = dealData.conditions.filter(c => c.type === 'CROSS_CHAIN');

        res.json({
            dealId,
            crossChainTransaction: crossChainStatus,
            crossChainConditions,
            buyerNetwork: dealData.buyerNetwork,
            sellerNetwork: dealData.sellerNetwork,
            bridgeInfo: dealData.crossChainInfo
        });

    } catch (error) {
        console.error('[CROSS-CHAIN] Error getting status:', error);
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
});

// Update cross-chain specific condition
router.patch('/cross-chain/:dealId/conditions/:conditionId', authenticateToken, async (req, res) => {
    const { dealId, conditionId } = req.params;
    const { status, notes } = req.body;
    const userId = req.userId;

    try {
        const { db } = await getFirebaseServices();
        
        // Validate status
        const validStatuses = ['PENDING_BUYER_ACTION', 'FULFILLED_BY_BUYER', 'ACTION_WITHDRAWN_BY_BUYER'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ error: 'Invalid status.' });
        }

        // Get the deal
        const dealDoc = await db.collection('deals').doc(dealId).get();
        if (!dealDoc.exists) {
            return res.status(404).json({ error: 'Deal not found.' });
        }

        const dealData = dealDoc.data();
        
        // Check if user is participant
        if (!dealData.participants.includes(userId)) {
            return res.status(403).json({ error: 'Access denied. User is not a participant in this deal.' });
        }

        // Check if this is a cross-chain transaction
        if (!dealData.isCrossChain) {
            return res.status(400).json({ error: 'This is not a cross-chain transaction.' });
        }

        // Find and update the condition
        const conditions = [...dealData.conditions];
        const conditionIndex = conditions.findIndex(c => c.id === conditionId);
        
        if (conditionIndex === -1) {
            return res.status(404).json({ error: 'Condition not found.' });
        }

        const condition = conditions[conditionIndex];
        
        // Verify this is a cross-chain condition
        if (condition.type !== 'CROSS_CHAIN') {
            return res.status(400).json({ error: 'This is not a cross-chain condition.' });
        }

        // Update condition
        conditions[conditionIndex] = {
            ...condition,
            status,
            notes: notes || condition.notes,
            updatedAt: Timestamp.now(),
            updatedBy: userId
        };

        // Update deal
        await db.collection('deals').doc(dealId).update({
            conditions,
            timeline: FieldValue.arrayUnion({
                event: `Cross-chain condition "${condition.description}" updated to ${status}${notes ? ` with notes: ${notes}` : ''}`,
                timestamp: Timestamp.now(),
                userId
            }),
            updatedAt: Timestamp.now()
        });

        res.json({
            message: 'Cross-chain condition updated successfully',
            condition: conditions[conditionIndex]
        });

    } catch (error) {
        console.error('[CROSS-CHAIN] Error updating condition:', error);
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
});

// Execute cross-chain fund transfer
router.post('/cross-chain/:dealId/transfer', authenticateToken, async (req, res) => {
    const { dealId } = req.params;
    const { fromTxHash, bridgeTxHash } = req.body;
    const userId = req.userId;

    try {
        const { db } = await getFirebaseServices();
        
        // Get the deal
        const dealDoc = await db.collection('deals').doc(dealId).get();
        if (!dealDoc.exists) {
            return res.status(404).json({ error: 'Deal not found.' });
        }

        const dealData = dealDoc.data();
        
        // Check if user is participant
        if (!dealData.participants.includes(userId)) {
            return res.status(403).json({ error: 'Access denied. User is not a participant in this deal.' });
        }

        // Check if this is a cross-chain transaction
        if (!dealData.isCrossChain || !dealData.crossChainTransactionId) {
            return res.status(400).json({ error: 'This is not a cross-chain transaction.' });
        }

        // Check if all conditions are fulfilled
        if (!areAllBackendConditionsFulfilled(dealData.conditions)) {
            return res.status(400).json({ error: 'All conditions must be fulfilled before executing transfer.' });
        }

        // Get cross-chain transaction status
        const crossChainTx = await getCrossChainTransactionStatus(dealData.crossChainTransactionId);
        
        if (crossChainTx.needsBridge) {
            // Execute multi-step bridge transfer
            let currentStep = 1;
            
            // Step 1: Lock funds on source network
            if (fromTxHash) {
                await executeCrossChainStep(dealData.crossChainTransactionId, currentStep, fromTxHash);
                currentStep++;
            }
            
            // Step 2: Bridge transfer
            if (bridgeTxHash) {
                await executeCrossChainStep(dealData.crossChainTransactionId, currentStep, bridgeTxHash);
                currentStep++;
            }
            
            // Step 3: Release funds on target network (this would be handled by the bridge/target network)
            // For now, we mark it as pending external confirmation
            await db.collection('deals').doc(dealId).update({
                timeline: FieldValue.arrayUnion({
                    event: `Cross-chain bridge transfer initiated. Awaiting release on ${dealData.sellerNetwork}`,
                    timestamp: Timestamp.now(),
                    userId
                }),
                updatedAt: Timestamp.now()
            });
        } else {
            // Direct EVM-to-EVM transfer
            if (fromTxHash) {
                await executeCrossChainStep(dealData.crossChainTransactionId, 1, fromTxHash);
                
                await db.collection('deals').doc(dealId).update({
                    fundsDepositedByBuyer: true,
                    timeline: FieldValue.arrayUnion({
                        event: `Direct cross-chain transfer completed (tx: ${fromTxHash})`,
                        timestamp: Timestamp.now(),
                        userId
                    }),
                    updatedAt: Timestamp.now()
                });
            }
        }

        res.json({
            message: 'Cross-chain transfer initiated successfully',
            dealId,
            fromTxHash,
            bridgeTxHash,
            requiresBridge: crossChainTx.needsBridge
        });

    } catch (error) {
        console.error('[CROSS-CHAIN] Error executing transfer:', error);
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
});

// Estimate cross-chain transaction fees
router.get('/cross-chain/estimate-fees', authenticateToken, async (req, res) => {
    const { sourceNetwork, targetNetwork, amount } = req.query;

    try {
        if (!sourceNetwork || !targetNetwork || !amount) {
            return res.status(400).json({ error: 'sourceNetwork, targetNetwork, and amount are required.' });
        }

        const feeEstimate = await estimateTransactionFees(sourceNetwork, targetNetwork, amount);
        const bridgeInfo = getBridgeInfo(sourceNetwork, targetNetwork);
        const isEVMCompatible = areNetworksEVMCompatible(sourceNetwork, targetNetwork);

        res.json({
            sourceNetwork,
            targetNetwork,
            amount,
            isEVMCompatible,
            bridgeInfo,
            feeEstimate
        });

    } catch (error) {
        console.error('[CROSS-CHAIN] Error estimating fees:', error);
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
});

// Helper function to update cross-chain conditions when transaction completes
async function updateCrossChainConditions(dealId, dealData) {
    const { db } = await getFirebaseServices();
    
    const conditions = [...dealData.conditions];
    let updated = false;

    // Auto-fulfill cross-chain conditions when transaction is completed
    const crossChainConditionIds = ['cross_chain_network_validation', 'cross_chain_bridge_setup', 'cross_chain_funds_locked', 'cross_chain_bridge_transfer'];
    
    conditions.forEach(condition => {
        if (crossChainConditionIds.includes(condition.id) && condition.status === 'PENDING_BUYER_ACTION') {
            condition.status = 'FULFILLED_BY_BUYER';
            condition.updatedAt = Timestamp.now();
            condition.autoFulfilledAt = Timestamp.now();
            updated = true;
        }
    });

    if (updated) {
        await db.collection('deals').doc(dealId).update({
            conditions,
            timeline: FieldValue.arrayUnion({
                event: 'Cross-chain conditions auto-fulfilled upon transaction completion',
                timestamp: Timestamp.now(),
                system: true
            }),
            updatedAt: Timestamp.now()
        });
    }
}

export default router;
