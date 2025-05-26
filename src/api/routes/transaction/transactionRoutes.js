import express from 'express';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { adminApp } from '../auth/admin.js';
import { deployPropertyEscrowContract } from '../../../services/contractDeployer.js';
// Import ethers v6 functions directly
import { isAddress, getAddress, parseUnits } from 'ethers'; // This is the import we are interested in

const router = express.Router();
const db = getFirestore(adminApp);

// const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY; // REMOVE
// const RPC_URL = process.env.RPC_URL || process.env.SEPOLIA_RPC_URL; // REMOVE

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
        req.userEmail = decodedToken.email;
        next();
    } catch (err) {
        console.error('[ROUTE AUTH ERROR] Authentication failed:', err.code || 'Unknown error');
        return res.status(403).json({ error: 'Authentication failed. Invalid or expired token.' });
    }
}

function areAllBackendConditionsFulfilled(conditions = []) {
    if (!conditions || conditions.length === 0) return true;
    return conditions.every(condition => condition.status === 'FULFILLED_BY_BUYER');
}

router.post('/create', authenticateToken, async (req, res) => {
    const initiatorId = req.userId;
    const initiatorEmail = req.userEmail;
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
    if (typeof otherPartyEmail !== 'string' || otherPartyEmail.trim() === '' || !otherPartyEmail.includes('@')) {
        return res.status(400).json({ error: 'Valid other party email is required.' });
    }

    // Wallet address validation
    if (!buyerWalletAddress || !isAddress(buyerWalletAddress)) {
        return res.status(400).json({ error: 'Valid buyer wallet address is required.' });
    }
    if (!sellerWalletAddress || !isAddress(sellerWalletAddress)) {
        return res.status(400).json({ error: 'Valid seller wallet address is required.' });
    }

    if (initialConditions && (!Array.isArray(initialConditions) || !initialConditions.every(c => c && typeof c.id === 'string' && c.id.trim() !== '' && typeof c.description === 'string' && typeof c.type === 'string'))) {
        return res.status(400).json({ error: 'Initial conditions must be an array of objects with non-empty "id", "type", and "description".' });
    }

    console.log(`[ROUTE LOG] /create - Transaction creation request by UID: ${initiatorId} (${initiatorEmail}), Role: ${initiatedBy}`);

    let escrowAmountWeiString;
    try {
        escrowAmountWeiString = parseUnits(String(amount), 'ether').toString();
    } catch (parseError) {
        console.error("[ROUTE ERROR] Error parsing amount to Wei:", parseError);
        return res.status(400).json({ error: `Invalid amount format: ${amount}. ${parseError.message}` });
    }

    try {
        const normalizedOtherPartyEmail = otherPartyEmail.trim().toLowerCase();
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
        const finalBuyerWallet = getAddress(buyerWalletAddress);
        const finalSellerWallet = getAddress(sellerWalletAddress);

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
            otherPartyEmail: normalizedOtherPartyEmail, initiatorEmail: initiatorEmail.toLowerCase(),
            conditions: (initialConditions || []).map(cond => ({
                id: cond.id.trim(), type: cond.type.trim() || 'CUSTOM', description: String(cond.description).trim(),
                status: 'PENDING_BUYER_ACTION', documents: [], createdBy: initiatorId, createdAt: now, updatedAt: now,
            })),
            documents: [],
            timeline: [{ event: `Transaction initiated by ${initiatedBy.toLowerCase()} (${initiatorEmail}). Other party: ${otherPartyData.email}.`, timestamp: now, userId: initiatorId }],
            smartContractAddress: null, fundsDepositedByBuyer: false, fundsReleasedToSeller: false,
            finalApprovalDeadlineBackend: null, disputeResolutionDeadlineBackend: null,
        };
        if (initialConditions && initialConditions.length > 0) {
             newTransactionData.timeline.push({ event: `${initiatedBy.toLowerCase()} specified ${initialConditions.length} initial condition(s) for review.`, timestamp: now, userId: initiatorId });
        }

        let deployedContractAddress = null;

        // Dynamically read env vars for deployment
        const currentDeployerKey = process.env.DEPLOYER_PRIVATE_KEY;
        const currentRpcUrl = process.env.RPC_URL || process.env.SEPOLIA_RPC_URL;

        if (!currentDeployerKey || !currentRpcUrl) {
            console.warn("[ROUTE WARN] Deployment skipped: DEPLOYER_PRIVATE_KEY or RPC_URL not set in .env. Transaction will be off-chain only.");
            newTransactionData.timeline.push({ event: `Smart contract deployment SKIPPED (off-chain only mode).`, timestamp: Timestamp.now(), system: true });
        } else {
            try {
                console.log(`[ROUTE LOG] Attempting to deploy PropertyEscrow contract. Buyer: ${finalBuyerWallet}, Seller: ${finalSellerWallet}, Amount: ${newTransactionData.escrowAmountWei}`);
                deployedContractAddress = await deployPropertyEscrowContract(
                    finalSellerWallet, finalBuyerWallet, newTransactionData.escrowAmountWei,
                    currentDeployerKey, // Use dynamically read key
                    currentRpcUrl       // Use dynamically read URL
                );
                newTransactionData.smartContractAddress = deployedContractAddress;
                newTransactionData.timeline.push({ event: `PropertyEscrow smart contract deployed at ${deployedContractAddress}.`, timestamp: Timestamp.now(), system: true });
                console.log(`[ROUTE LOG] Smart contract deployed: ${deployedContractAddress}`);
            } catch (deployError) {
                console.error('[ROUTE ERROR] Smart contract deployment failed:', deployError.message, deployError.stack);
                newTransactionData.timeline.push({ event: `Smart contract deployment FAILED: ${deployError.message}. Proceeding as off-chain.`, timestamp: Timestamp.now(), system: true });
            }
        }

        const transactionRef = await db.collection('deals').add(newTransactionData);
        console.log(`[ROUTE LOG] Transaction stored in Firestore: ${transactionRef.id}. Status: ${newTransactionData.status}. SC: ${newTransactionData.smartContractAddress || 'None'}`);

        const responsePayload = {
            message: 'Transaction initiated successfully.', transactionId: transactionRef.id,
            status: newTransactionData.status, smartContractAddress: newTransactionData.smartContractAddress,
        };
        if (deployedContractAddress === null && currentDeployerKey && currentRpcUrl) {
            responsePayload.deploymentWarning = "Smart contract deployment was attempted but failed. The transaction has been created for off-chain tracking.";
        }
        res.status(201).json(responsePayload);

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

router.put('/:transactionId/conditions/:conditionId/buyer-review', authenticateToken, async (req, res) => {
    const { transactionId, conditionId } = req.params;
    const { newBackendStatus, reviewComment } = req.body;
    const userId = req.userId;

    if (!newBackendStatus || !['FULFILLED_BY_BUYER', 'PENDING_BUYER_ACTION', 'ACTION_WITHDRAWN_BY_BUYER'].includes(newBackendStatus)) {
        return res.status(400).json({ error: 'Invalid newBackendStatus for condition. Must be FULFILLED_BY_BUYER, PENDING_BUYER_ACTION, or ACTION_WITHDRAWN_BY_BUYER.' });
    }
    // console.log(`[ROUTE LOG] Buyer (UID: ${userId}) updating backend status for condition ${conditionId} in TX ${transactionId} to ${newBackendStatus}`);

    try {
        const transactionRef = db.collection('deals').doc(transactionId);
        const now = Timestamp.now();

        await db.runTransaction(async (t) => {
            const doc = await t.get(transactionRef);
            if (!doc.exists) throw { status: 404, message: 'Transaction not found.' };
            let txData = doc.data();

            if (userId !== txData.buyerId) throw { status: 403, message: 'Only the buyer can update this condition status.' };

            const conditionIndex = (txData.conditions || []).findIndex(c => c.id === conditionId);
            if (conditionIndex === -1) throw { status: 404, message: 'Condition not found within the transaction.' };

            const updatedConditions = JSON.parse(JSON.stringify(txData.conditions || []));
            const oldConditionStatus = updatedConditions[conditionIndex].status;

            updatedConditions[conditionIndex].status = newBackendStatus;
            updatedConditions[conditionIndex].updatedAt = now;
            if (reviewComment !== undefined) {
                updatedConditions[conditionIndex].reviewComment = reviewComment;
            } else {
                delete updatedConditions[conditionIndex].reviewComment;
            }

            const timelineEvent = {
                event: `Buyer (UID: ${userId}) updated backend status for condition "${updatedConditions[conditionIndex].description || conditionId}" from ${oldConditionStatus} to ${newBackendStatus}.`,
                timestamp: now, userId,
            };
             if (reviewComment !== undefined) timelineEvent.comment = reviewComment;

            const updatePayload = {
                conditions: updatedConditions,
                updatedAt: now,
                timeline: FieldValue.arrayUnion(timelineEvent)
            };
            t.update(transactionRef, updatePayload);
        });
        res.status(200).json({ message: `Backend condition status updated to: ${newBackendStatus}.` });
    } catch (error) {
        console.error(`[ROUTE ERROR] Error updating backend condition for TX ${transactionId}, Cond ${conditionId}:`, error.status ? error.message : error.stack);
        res.status(error.status || 500).json({ error: error.message || 'Internal server error.' });
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

export default router;
