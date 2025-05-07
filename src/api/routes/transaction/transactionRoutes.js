import express from 'express';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { adminApp } from '../auth/admin.js';
import { deployPropertyEscrowContract } from '../deployContract/contractDeployer.js';
// Keep the main ethers import
import { ethers } from 'ethers';

const router = express.Router();
const db = getFirestore(adminApp);

// --- Environment Variables ---
const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;
const RPC_URL = process.env.RPC_URL;

// --- Authentication Middleware ---
async function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) {
        return res.status(401).json({ error: 'Authentication token is required.' });
    }
    try {
        const auth = getAdminAuth(adminApp);
        const decodedToken = await auth.verifyIdToken(token);
        req.userId = decodedToken.uid;
        next();
    } catch (err) {
        console.error('Auth: Invalid or expired token.', err.code || err.message);
        return res.status(403).json({ error: 'Authentication failed. Invalid or expired token.' });
    }
}

// --- Helper ---
function areAllBackendConditionsFulfilled(conditions = []) {
    if (!conditions || conditions.length === 0) return true;
    return conditions.every(condition => condition.status === 'FULFILLED_BY_BUYER');
}


// --- Route to Create a New Transaction ---
router.post('/create', authenticateToken, async (req, res) => {
    const initiatorId = req.userId;
    const {
        initiatedBy, propertyAddress, amount, otherPartyEmail,
        initialConditions, buyerWalletAddress, sellerWalletAddress
    } = req.body;

    // --- Input Validations ---
    if (!initiatedBy || (initiatedBy !== 'BUYER' && initiatedBy !== 'SELLER')) {
        return res.status(400).json({ error: 'Invalid "initiatedBy". Must be "BUYER" or "SELLER".' });
    }
    if (typeof propertyAddress !== 'string' || propertyAddress.trim() === '') {
        return res.status(400).json({ error: 'Property address is required.' });
    }
    if (typeof amount !== 'number' || amount <= 0 || !Number.isFinite(amount)) {
        return res.status(400).json({ error: 'Amount must be a positive finite number.' });
    }
    if (typeof otherPartyEmail !== 'string' || otherPartyEmail.trim() === '') {
        return res.status(400).json({ error: 'Other party email is required.' });
    }
    // Use ethers.utils directly
    if (!buyerWalletAddress || !ethers.utils.isAddress(buyerWalletAddress)) {
        return res.status(400).json({ error: 'Valid buyer wallet address is required.' });
    }
     if (!sellerWalletAddress || !ethers.utils.isAddress(sellerWalletAddress)) {
        return res.status(400).json({ error: 'Valid seller wallet address is required.' });
    }
    if (initialConditions && (!Array.isArray(initialConditions) || !initialConditions.every(c => c && c.id && typeof c.description === 'string' && typeof c.type === 'string'))) {
        return res.status(400).json({ error: 'Initial conditions must be an array of objects with "id", "type", and "description".' });
    }

    console.log(`Transaction creation request by UID: ${initiatorId}, Role: ${initiatedBy}`);

    let escrowAmountWeiString;
    try {
        // Use ethers.utils directly
        escrowAmountWeiString = ethers.utils.parseUnits(String(amount), 'ether').toString();
    } catch (parseError) {
        console.error("Error parsing amount to Wei:", parseError);
        return res.status(400).json({ error: `Invalid amount format: ${amount}` });
    }

    try {
        const initiatorDoc = await db.collection('users').doc(initiatorId).get();
        if (!initiatorDoc.exists) {
            return res.status(404).json({ error: 'Initiator user profile not found.' });
        }
        const normalizedOtherPartyEmail = otherPartyEmail.trim().toLowerCase();
        if (initiatorDoc.data().email?.toLowerCase() === normalizedOtherPartyEmail) {
            return res.status(400).json({ error: 'Cannot create a transaction with yourself.' });
        }

        const otherPartyQuery = await db.collection('users').where('email', '==', normalizedOtherPartyEmail).limit(1).get();
        if (otherPartyQuery.empty) {
            return res.status(404).json({ error: `User with email ${otherPartyEmail} not found.` });
        }
        const otherPartyId = otherPartyQuery.docs[0].id;

        let buyerIdFs, sellerIdFs, status;
        // Use ethers.utils directly
        let finalBuyerWallet = ethers.utils.getAddress(buyerWalletAddress);
        let finalSellerWallet = ethers.utils.getAddress(sellerWalletAddress);

        if (finalBuyerWallet === finalSellerWallet) {
             return res.status(400).json({ error: 'Buyer and Seller wallet addresses cannot be the same.' });
        }

        if (initiatedBy === 'SELLER') {
            sellerIdFs = initiatorId; buyerIdFs = otherPartyId; status = 'PENDING_BUYER_REVIEW';
        } else {
            buyerIdFs = initiatorId; sellerIdFs = otherPartyId; status = 'PENDING_SELLER_REVIEW';
        }

        const now = Timestamp.now();
        const newTransactionData = {
            propertyAddress: propertyAddress.trim(), amount: Number(amount), escrowAmountWei: escrowAmountWeiString,
            sellerId: sellerIdFs, buyerId: buyerIdFs, buyerWalletAddress: finalBuyerWallet, sellerWalletAddress: finalSellerWallet,
            participants: [sellerIdFs, buyerIdFs], status, createdAt: now, updatedAt: now, initiatedBy,
            conditions: (initialConditions || []).map(cond => ({
                id: cond.id, type: cond.type.trim() || 'CUSTOM', description: String(cond.description).trim(),
                status: 'PENDING_BUYER_ACTION', documents: [], createdBy: initiatorId, createdAt: now, updatedAt: now,
            })),
            documents: [],
            timeline: [{ event: `Transaction initiated by ${initiatedBy.toLowerCase()} (UID: ${initiatorId}).`, timestamp: now, userId: initiatorId }],
            smartContractAddress: null, fundsDepositedByBuyer: false, fundsReleasedToSeller: false,
            finalApprovalDeadlineBackend: null, disputeResolutionDeadlineBackend: null,
        };
        if (initialConditions && initialConditions.length > 0) {
             newTransactionData.timeline.push({ event: `${initiatedBy.toLowerCase()} specified ${initialConditions.length} initial condition(s) for review.`, timestamp: now, userId: initiatorId });
        }

        let deployedContractAddress = null;
        if (!DEPLOYER_PRIVATE_KEY || !RPC_URL) {
            console.warn("Deployment skipped: DEPLOYER_PRIVATE_KEY or RPC_URL not set in .env");
            newTransactionData.timeline.push({ event: `Smart contract deployment SKIPPED due to missing configuration.`, timestamp: Timestamp.now(), system: true });
        } else {
            try {
                console.log(`Deploying PropertyEscrow contract for deal...`);
                deployedContractAddress = await deployPropertyEscrowContract(
                    finalSellerWallet, finalBuyerWallet, newTransactionData.escrowAmountWei,
                    DEPLOYER_PRIVATE_KEY, RPC_URL
                );
                newTransactionData.smartContractAddress = deployedContractAddress;
                newTransactionData.status = 'AWAITING_CONDITION_SETUP';
                newTransactionData.timeline.push({ event: `PropertyEscrow smart contract deployed at ${deployedContractAddress}. Status: AWAITING_CONDITION_SETUP.`, timestamp: Timestamp.now(), system: true });
                console.log(`Smart contract deployed: ${deployedContractAddress}`);
            } catch (deployError) {
                console.error('Smart contract deployment failed:', deployError);
                 newTransactionData.timeline.push({ event: `Smart contract deployment FAILED: ${deployError.message}.`, timestamp: Timestamp.now(), system: true });
                 console.error("Deal data at time of failed deployment:", newTransactionData);
                return res.status(500).json({ error: `Failed to deploy escrow contract: ${deployError.message}` });
            }
        }

        const transactionRef = await db.collection('deals').add(newTransactionData);
        console.log(`Transaction stored in Firestore: ${transactionRef.id}`);

        const responseDetails = {
            ...newTransactionData, id: transactionRef.id,
            createdAt: newTransactionData.createdAt.toDate().toISOString(),
            updatedAt: newTransactionData.updatedAt.toDate().toISOString(),
            timeline: newTransactionData.timeline.map(t => ({ ...t, timestamp: t.timestamp.toDate().toISOString() })),
            conditions: newTransactionData.conditions.map(c => ({ ...c, createdAt: c.createdAt.toDate().toISOString(), updatedAt: c.updatedAt.toDate().toISOString() }))
        };
         if (newTransactionData.finalApprovalDeadlineBackend) responseDetails.finalApprovalDeadlineBackend = newTransactionData.finalApprovalDeadlineBackend.toDate().toISOString();
         if (newTransactionData.disputeResolutionDeadlineBackend) responseDetails.disputeResolutionDeadlineBackend = newTransactionData.disputeResolutionDeadlineBackend.toDate().toISOString();

        res.status(201).json({
            message: 'Transaction initiated successfully.', transactionId: transactionRef.id,
            status: newTransactionData.status, smartContractAddress: deployedContractAddress,
            transactionDetails: responseDetails
        });

    } catch (error) {
        console.error('Error in /create transaction route:', error);
        res.status(500).json({ error: 'Internal server error during transaction creation.' });
    }
});

// --- GET /deals/:transactionId ---
router.get('/:transactionId', authenticateToken, async (req, res) => {
    const { transactionId } = req.params;
    const userId = req.userId;
    try {
        const doc = await db.collection('deals').doc(transactionId).get();
        if (!doc.exists) {
            return res.status(404).json({ error: 'Transaction not found.' });
        }
        const transactionData = doc.data();
        if (!Array.isArray(transactionData.participants) || !transactionData.participants.includes(userId)) {
            console.warn(`Access denied for user ${userId} on deal ${transactionId}`);
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
        console.error(`Error fetching transaction ${transactionId}:`, error);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// --- GET /deals ---
router.get('/', authenticateToken, async (req, res) => {
    const userId = req.userId;
    const { limit = 10, startAfter, orderBy = 'createdAt', orderDirection = 'desc' } = req.query;
    try {
        let query = db.collection('deals')
            .where('participants', 'array-contains', userId)
            .orderBy(orderBy, orderDirection.toLowerCase() === 'asc' ? 'asc' : 'desc')
            .limit(Number(limit) || 10);

        if (startAfter) {
             if (orderBy === 'createdAt' || orderBy === 'updatedAt') {
                 try {
                    const startAfterTimestamp = Timestamp.fromDate(new Date(startAfter));
                    query = query.startAfter(startAfterTimestamp);
                 } catch (dateError) {
                     console.warn("Invalid startAfter date format:", startAfter, dateError);
                     return res.status(400).json({ error: "Invalid startAfter date format. Use ISO 8601." });
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
        console.error(`Error fetching transactions for UID ${userId}:`, error);
        if (error.code === 'invalid-argument' && error.message.includes('order by')) {
             return res.status(400).json({ error: `Invalid orderBy field: ${orderBy}. Ensure it exists and is indexed if needed.` });
        }
        res.status(500).json({ error: 'Internal server error.' });
    }
});


// --- PUT /deals/:transactionId/conditions/:conditionId/buyer-review ---
router.put('/:transactionId/conditions/:conditionId/buyer-review', authenticateToken, async (req, res) => {
    const { transactionId, conditionId } = req.params;
    const { newBackendStatus, reviewComment } = req.body;
    const userId = req.userId;

    if (!newBackendStatus || !['FULFILLED_BY_BUYER', 'PENDING_BUYER_ACTION', 'ACTION_WITHDRAWN_BY_BUYER'].includes(newBackendStatus)) {
        return res.status(400).json({ error: 'Invalid newBackendStatus for condition.' });
    }
    console.log(`Buyer (UID: ${userId}) updating backend status for condition ${conditionId} in TX ${transactionId} to ${newBackendStatus}`);

    try {
        const transactionRef = db.collection('deals').doc(transactionId);
        const now = Timestamp.now();

        await db.runTransaction(async (t) => {
            const doc = await t.get(transactionRef);
            if (!doc.exists) throw { status: 404, message: 'Transaction not found.' };
            let txData = doc.data();

            if (userId !== txData.buyerId) throw { status: 403, message: 'Only the buyer can update condition status.' };

            const conditionIndex = (txData.conditions || []).findIndex(c => c.id === conditionId);
            if (conditionIndex === -1) throw { status: 404, message: 'Condition not found.' };

            const updatedConditions = [...(txData.conditions || [])];
            const oldConditionStatus = updatedConditions[conditionIndex].status;
            updatedConditions[conditionIndex].status = newBackendStatus;
            updatedConditions[conditionIndex].updatedAt = now;
            if (reviewComment) updatedConditions[conditionIndex].reviewComment = reviewComment;
            else updatedConditions[conditionIndex].reviewComment = FieldValue.delete();

            const timelineEvent = {
                event: `Buyer (UID: ${userId}) updated backend status for condition "${updatedConditions[conditionIndex].description || conditionId}" from ${oldConditionStatus} to ${newBackendStatus}.`,
                timestamp: now, userId,
            };
             if (reviewComment) timelineEvent.comment = reviewComment;

            const updatePayload = {
                conditions: updatedConditions,
                updatedAt: now,
                timeline: FieldValue.arrayUnion(timelineEvent)
            };

            const allBackendConditionsMet = areAllBackendConditionsFulfilled(updatedConditions);
            if (allBackendConditionsMet && txData.fundsDepositedByBuyer) {
                console.log(`All backend conditions for TX ${transactionId} marked as fulfilled by buyer.`);
            }
             if (newBackendStatus === 'ACTION_WITHDRAWN_BY_BUYER' && txData.status === 'READY_FOR_ONCHAIN_FINAL_APPROVAL_SETUP') {
                // updatePayload.status = 'AWAITING_BUYER_CONDITION_CONFIRMATION'; // Example
            }

            t.update(transactionRef, updatePayload);
        });
        res.status(200).json({ message: `Backend condition status updated to: ${newBackendStatus}.` });
    } catch (error) {
        console.error(`Error updating backend condition for TX ${transactionId}, Cond ${conditionId}:`, error.status ? error.message : error);
        res.status(error.status || 500).json({ error: error.message || 'Internal server error.' });
    }
});


// --- PUT /deals/:transactionId/sync-status ---
router.put('/:transactionId/sync-status', authenticateToken, async (req, res) => {
    const { transactionId } = req.params;
    const { newSCStatus, eventMessage, finalApprovalDeadlineISO, disputeResolutionDeadlineISO } = req.body;
    const userId = req.userId;

    if (!newSCStatus || typeof newSCStatus !== 'string') {
        return res.status(400).json({ error: 'New Smart Contract status (newSCStatus) is required.' });
    }
    const ALLOWED_SC_STATUSES = [
        'AWAITING_CONDITION_SETUP', 'AWAITING_DEPOSIT', 'AWAITING_FULFILLMENT',
        'READY_FOR_FINAL_APPROVAL', 'IN_FINAL_APPROVAL', 'IN_DISPUTE',
        'COMPLETED', 'CANCELLED'
    ];
    if (!ALLOWED_SC_STATUSES.includes(newSCStatus)) {
        return res.status(400).json({ error: `Invalid smart contract status value: ${newSCStatus}.` });
    }

    console.log(`Syncing/Updating status for TX ID: ${transactionId} to SC State "${newSCStatus}" by UID: ${userId}`);

    try {
        const transactionRef = db.collection('deals').doc(transactionId);
        const now = Timestamp.now();

        await db.runTransaction(async (t) => {
            const doc = await t.get(transactionRef);
            if (!doc.exists) throw { status: 404, message: 'Transaction not found.' };

            const txData = doc.data();
            const currentBackendStatus = txData.status;

            if (!Array.isArray(txData.participants) || !txData.participants.includes(userId)) {
                throw { status: 403, message: 'Access denied. Not a participant.' };
            }

            const updatePayload = {
                status: newSCStatus,
                updatedAt: now,
            };

            // Prepare timeline events to add
            const timelineEventsToAdd = [];
            timelineEventsToAdd.push({
                event: eventMessage || `Smart contract state synced/updated to ${newSCStatus} by UID: ${userId}.`,
                timestamp: now,
                userId: userId,
            });


            if (newSCStatus === 'IN_FINAL_APPROVAL' && finalApprovalDeadlineISO) {
                try {
                    updatePayload.finalApprovalDeadlineBackend = Timestamp.fromDate(new Date(finalApprovalDeadlineISO));
                } catch (e) { console.warn("Invalid finalApprovalDeadlineISO format"); }
            }
            if (newSCStatus === 'IN_DISPUTE' && disputeResolutionDeadlineISO) {
                 try {
                    updatePayload.disputeResolutionDeadlineBackend = Timestamp.fromDate(new Date(disputeResolutionDeadlineISO));
                 } catch (e) { console.warn("Invalid disputeResolutionDeadlineISO format"); }
            }
            // Check flags *before* potential update
            const needsFundsDepositedUpdate = newSCStatus === 'AWAITING_FULFILLMENT' && !txData.fundsDepositedByBuyer;
            const needsFundsReleasedUpdate = newSCStatus === 'COMPLETED' && !txData.fundsReleasedToSeller;

            if (needsFundsDepositedUpdate) {
                updatePayload.fundsDepositedByBuyer = true;
                timelineEventsToAdd.push({
                    event: `Funds confirmed deposited on-chain.`,
                    timestamp: now, system: true
                });
            }
            if (needsFundsReleasedUpdate) {
                updatePayload.fundsReleasedToSeller = true;
                 timelineEventsToAdd.push({
                    event: `Funds confirmed released to seller on-chain.`,
                    timestamp: now, system: true
                });
            }

            // Add all timeline events using arrayUnion
            updatePayload.timeline = FieldValue.arrayUnion(...timelineEventsToAdd);

            console.log(`Updating backend status for TX ${transactionId} from ${currentBackendStatus} to ${newSCStatus}`);
            t.update(transactionRef, updatePayload);
        });
        res.status(200).json({ message: `Transaction backend status synced/updated to ${newSCStatus}.`});
    } catch (error) {
        console.error(`Error syncing/updating TX ${transactionId} status:`, error.status ? error.message : error);
        res.status(error.status || 500).json({ error: error.message || 'Internal server error.' });
    }
});


// Conceptual Sync Endpoints
router.post('/:transactionId/sc/start-final-approval', authenticateToken, async (req, res) => {
    const { transactionId } = req.params;
    const { finalApprovalDeadlineISO } = req.body;
    const userId = req.userId;

    if (!finalApprovalDeadlineISO) {
        return res.status(400).json({ error: "finalApprovalDeadlineISO is required." });
    }

    try {
        const transactionRef = db.collection('deals').doc(transactionId);
        const now = Timestamp.now();
        const doc = await transactionRef.get();
        if (!doc.exists) return res.status(404).json({ error: "Transaction not found." });
        if (!doc.data().participants?.includes(userId)) return res.status(403).json({ error: "Access denied." });

        await transactionRef.update({
            status: 'IN_FINAL_APPROVAL',
            finalApprovalDeadlineBackend: Timestamp.fromDate(new Date(finalApprovalDeadlineISO)),
            updatedAt: now,
            timeline: FieldValue.arrayUnion({
                event: `Final approval period started on-chain. Backend synced by UID: ${userId}.`,
                timestamp: now,
                userId: userId
            })
        });
        res.status(200).json({ message: "Backend synced: Final approval period started." });
    } catch (error) {
        console.error(`Error syncing start-final-approval for TX ${transactionId}:`, error);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

router.post('/:transactionId/sc/raise-dispute', authenticateToken, async (req, res) => {
    const { transactionId } = req.params;
    const { conditionId, disputeResolutionDeadlineISO } = req.body;
    const userId = req.userId;

    if (!conditionId || !disputeResolutionDeadlineISO) {
        return res.status(400).json({ error: "conditionId and disputeResolutionDeadlineISO are required." });
    }

    try {
        const transactionRef = db.collection('deals').doc(transactionId);
        const now = Timestamp.now();

        await db.runTransaction(async (t) => {
            const doc = await t.get(transactionRef);
            if (!doc.exists) throw { status: 404, message: "Transaction not found for dispute sync." };
            const txData = doc.data();

            if (!txData.participants?.includes(userId)) {
                 throw { status: 403, message: "Access denied. Not a participant." };
            }
             if (txData.buyerId !== userId) {
                 throw { status: 403, message: "Only the buyer can raise a dispute via this sync endpoint." };
             }

            const conditionIndex = (txData.conditions || []).findIndex(c => c.id === conditionId);
            let updatedConditions = [...(txData.conditions || [])];
            let conditionDescription = conditionId;

            if (conditionIndex !== -1) {
                updatedConditions[conditionIndex].status = 'ACTION_WITHDRAWN_BY_BUYER';
                updatedConditions[conditionIndex].updatedAt = now;
                conditionDescription = updatedConditions[conditionIndex].description || conditionId;
            } else {
                 console.warn(`Condition ID ${conditionId} not found in deal ${transactionId} during dispute sync.`);
            }

            t.update(transactionRef, {
                status: 'IN_DISPUTE',
                conditions: updatedConditions,
                disputeResolutionDeadlineBackend: Timestamp.fromDate(new Date(disputeResolutionDeadlineISO)),
                updatedAt: now,
                timeline: FieldValue.arrayUnion({
                    event: `Dispute raised on-chain for condition "${conditionDescription}". Backend synced by UID: ${userId}.`,
                    timestamp: now,
                    userId: userId
                })
            });
        });

        res.status(200).json({ message: "Backend synced: Dispute raised." });
    } catch (error) {
        console.error(`Error syncing raise-dispute for TX ${transactionId}:`, error.status ? error.message : error);
        res.status(error.status || 500).json({ error: error.message || 'Internal server error.' });
    }
});


export default router;

