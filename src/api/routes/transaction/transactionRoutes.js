import express from 'express';
import { getFirestore, FieldValue, Timestamp }
from 'firebase-admin/firestore';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { adminApp } from '../auth/admin.js'; // Adjust path as per your project structure

const router = express.Router();
const db = getFirestore(adminApp);

// --- Authentication Middleware ---
async function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) {
        console.warn('Auth: No token provided.');
        return res.status(401).json({ error: 'Authentication token is required.' });
    }
    try {
        const auth = getAdminAuth(adminApp);
        const decodedToken = await auth.verifyIdToken(token);
        req.userId = decodedToken.uid;
        console.log(`Auth: Token verified for UID: ${req.userId}`);
        next();
    } catch (err) {
        console.error('Auth: Invalid or expired token.', err.code || err.message);
        return res.status(403).json({ error: 'Authentication failed. Invalid or expired token.' });
    }
}

// --- Helper to check if all conditions are fulfilled ---
function areAllConditionsFulfilled(conditions = []) {
    if (!conditions || conditions.length === 0) return true; // No conditions means all (zero) are fulfilled
    return conditions.every(condition => condition.status === 'FULFILLED');
}


// --- Route to Create a New Transaction ---
router.post('/create', authenticateToken, async (req, res) => {
    const initiatorId = req.userId;

    const {
        initiatedBy,
        propertyAddress,
        amount,
        otherPartyEmail,
        initialConditions // Array of objects: [{ type: 'string', description: 'string' }]
    } = req.body;

    if (!initiatedBy || (initiatedBy !== 'BUYER' && initiatedBy !== 'SELLER')) {
        return res.status(400).json({ error: 'Invalid or missing "initiatedBy" field. Must be "BUYER" or "SELLER".' });
    }
    if (typeof propertyAddress !== 'string' || propertyAddress.trim() === '') {
        return res.status(400).json({ error: 'Property address is required.' });
    }
    if (typeof amount !== 'number' || amount <= 0) {
        return res.status(400).json({ error: 'Amount must be a positive number.' });
    }
    if (typeof otherPartyEmail !== 'string' || otherPartyEmail.trim() === '') {
        return res.status(400).json({ error: 'Other party email is required.' });
    }
    if (initialConditions && (!Array.isArray(initialConditions) || !initialConditions.every(c => c && typeof c.description === 'string' && typeof c.type === 'string'))) {
        return res.status(400).json({ error: 'Initial conditions must be an array of objects with "type" and "description".' });
    }

    console.log(`Transaction creation by UID: ${initiatorId}, Role: ${initiatedBy}, Other party: ${otherPartyEmail}`);

    try {
        const initiatorDoc = await db.collection('users').doc(initiatorId).get();
        if (!initiatorDoc.exists) {
            return res.status(404).json({ error: 'Initiator user profile not found.' });
        }
        if (initiatorDoc.data().email?.toLowerCase() === otherPartyEmail.trim().toLowerCase()) {
            return res.status(400).json({ error: 'Cannot create a transaction with yourself.' });
        }

        const otherPartyQuery = await db.collection('users').where('email', '==', otherPartyEmail.trim().toLowerCase()).limit(1).get();
        if (otherPartyQuery.empty) {
            return res.status(404).json({ error: `User with email ${otherPartyEmail} not found.` });
        }
        const otherPartyId = otherPartyQuery.docs[0].id;

        let buyerId, sellerId, status;
        if (initiatedBy === 'SELLER') {
            sellerId = initiatorId;
            buyerId = otherPartyId;
            status = 'PENDING_BUYER_REVIEW';
        } else {
            buyerId = initiatorId;
            sellerId = otherPartyId;
            status = 'PENDING_SELLER_REVIEW'; // Buyer might add conditions and deposit funds next
        }

        const now = Timestamp.now();
        const newTransactionData = {
            propertyAddress: propertyAddress.trim(),
            amount: Number(amount),
            sellerId,
            buyerId,
            participants: [sellerId, buyerId],
            status,
            createdAt: now,
            updatedAt: now,
            initiatedBy,
            conditions: (initialConditions || []).map((cond, index) => ({
                id: `cond_${Date.now()}_${index}_${Math.random().toString(36).substring(2, 7)}`,
                type: cond.type.trim() || 'CUSTOM',
                description: String(cond.description).trim(),
                status: 'PENDING',
                documents: [], // Initialize documents array for the condition
                createdBy: initiatorId,
                createdAt: now,
                updatedAt: now,
            })),
            documents: [], // General transaction documents, distinct from condition documents
            timeline: [{
                event: `Transaction initiated by ${initiatedBy.toLowerCase()} (UID: ${initiatorId}).`,
                timestamp: now,
                userId: initiatorId,
            }],
            smartContractAddress: null,
            escrowAmount: 0,
            fundsDepositedByBuyer: false,
            fundsReleasedToSeller: false,
        };
        if (initialConditions && initialConditions.length > 0) {
             newTransactionData.timeline.push({
                event: `${initiatedBy.toLowerCase()} added ${initialConditions.length} initial condition(s).`,
                timestamp: now,
                userId: initiatorId,
            });
        }


        const transactionRef = await db.collection('deals').add(newTransactionData);
        console.log(`Transaction created: ${transactionRef.id}`);

        const responseDetails = {
            ...newTransactionData,
            id: transactionRef.id,
            createdAt: newTransactionData.createdAt.toDate().toISOString(),
            updatedAt: newTransactionData.updatedAt.toDate().toISOString(),
            timeline: newTransactionData.timeline.map(t => ({ ...t, timestamp: t.timestamp.toDate().toISOString() })),
            conditions: newTransactionData.conditions.map(c => ({ ...c, createdAt: c.createdAt.toDate().toISOString(), updatedAt: c.updatedAt.toDate().toISOString() }))
        };

        res.status(201).json({
            message: 'Transaction initiated successfully.',
            transactionId: transactionRef.id,
            status: newTransactionData.status,
            transactionDetails: responseDetails
        });

    } catch (error) {
        console.error('Error creating transaction:', error);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// --- Route to Get a Specific Transaction ---
router.get('/:transactionId', authenticateToken, async (req, res) => {
    const { transactionId } = req.params;
    const userId = req.userId;
    console.log(`Fetching transaction ID: ${transactionId} for user UID: ${userId}`);
    try {
        const doc = await db.collection('deals').doc(transactionId).get();
        if (!doc.exists) {
            return res.status(404).json({ error: 'Transaction not found.' });
        }
        const transactionData = doc.data();
        if (!transactionData.participants?.includes(userId)) {
            return res.status(403).json({ error: 'Access denied.' });
        }
        const responseDetails = {
            ...transactionData,
            id: doc.id,
            createdAt: transactionData.createdAt.toDate().toISOString(),
            updatedAt: transactionData.updatedAt.toDate().toISOString(),
            timeline: transactionData.timeline.map(t => ({ ...t, timestamp: t.timestamp.toDate().toISOString() })),
            conditions: transactionData.conditions.map(c => ({ ...c, createdAt: c.createdAt.toDate().toISOString(), updatedAt: c.updatedAt.toDate().toISOString(), documents: c.documents || [] }))
        };
        res.status(200).json(responseDetails);
    } catch (error) {
        console.error(`Error fetching transaction ${transactionId}:`, error);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// --- Route for Batch Retrieval of Transactions ---
router.get('/', authenticateToken, async (req, res) => {
    const userId = req.userId;
    const { limit = 10, startAfter, orderBy = 'createdAt', orderDirection = 'desc' } = req.query;
    console.log(`Fetching transactions for UID: ${userId}, limit: ${limit}, orderBy: ${orderBy}`);
    try {
        let query = db.collection('deals')
            .where('participants', 'array-contains', userId)
            .orderBy(orderBy, orderDirection.toLowerCase() === 'asc' ? 'asc' : 'desc')
            .limit(Number(limit));
        if (startAfter) {
            if (orderBy === 'createdAt' || orderBy === 'updatedAt') {
                query = query.startAfter(Timestamp.fromDate(new Date(startAfter)));
            } else {
                query = query.startAfter(startAfter);
            }
        }
        const snapshot = await query.get();
        if (snapshot.empty) return res.status(200).json([]);
        const transactions = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id, ...data,
                createdAt: data.createdAt.toDate().toISOString(),
                updatedAt: data.updatedAt.toDate().toISOString(),
                timeline: data.timeline.map(t => ({ ...t, timestamp: t.timestamp.toDate().toISOString() })),
                conditions: data.conditions.map(c => ({ ...c, createdAt: c.createdAt.toDate().toISOString(), updatedAt: c.updatedAt.toDate().toISOString(), documents: c.documents || [] }))
            };
        });
        res.status(200).json(transactions);
    } catch (error) {
        console.error(`Error fetching transactions for UID ${userId}:`, error);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// --- Route to Update Overall Transaction Status ---
router.put('/:transactionId/status', authenticateToken, async (req, res) => {
    const { transactionId } = req.params;
    const { newStatus, eventMessage } = req.body; // eventMessage is optional
    const userId = req.userId;

    if (!newStatus || typeof newStatus !== 'string') {
        return res.status(400).json({ error: 'New status is required.' });
    }
    const ALLOWED_STATUSES = [
        'PENDING_BUYER_REVIEW', 'PENDING_SELLER_REVIEW', 'AWAITING_PAYMENT',
        'PENDING_CONDITIONS', 'AWAITING_SELLER_CONFIRMATION', 'IN_PROGRESS',
        'COMPLETED', 'CANCELLED', 'DISPUTED'
    ];
    if (!ALLOWED_STATUSES.includes(newStatus)) {
        return res.status(400).json({ error: `Invalid status value: ${newStatus}.` });
    }

    console.log(`Status update for TX ID: ${transactionId} to "${newStatus}" by UID: ${userId}`);

    try {
        const transactionRef = db.collection('deals').doc(transactionId);
        const now = Timestamp.now();

        await db.runTransaction(async (t) => {
            const doc = await t.get(transactionRef);
            if (!doc.exists) throw { status: 404, message: 'Transaction not found.' };

            const txData = doc.data();
            const currentStatus = txData.status;

            if (!txData.participants?.includes(userId)) {
                throw { status: 403, message: 'Access denied. Not a participant.' };
            }

            let authorizedTransition = false;
            const updatePayload = { status: newStatus, updatedAt: now };

            // --- Status Transition Logic ---
            switch (currentStatus) {
                case 'PENDING_BUYER_REVIEW': // Seller initiated, buyer acts
                    if (userId === txData.buyerId) {
                        // Buyer might cancel or confirm they've added conditions/deposited funds (which changes status via other routes/logic)
                        // This generic status update is less likely for this specific user action.
                        // Typically, POST /:transactionId/conditions sets status to AWAITING_SELLER_CONFIRMATION.
                        // A separate "buyerDepositsFunds" action would set fundsDepositedByBuyer and potentially change status.
                        if (newStatus === 'CANCELLED') authorizedTransition = true;
                        // If newStatus is AWAITING_SELLER_CONFIRMATION, it's usually set by the /conditions endpoint
                    }
                    break;
                case 'PENDING_SELLER_REVIEW': // Buyer initiated, seller acts
                    if (userId === txData.sellerId) {
                        if (newStatus === 'AWAITING_PAYMENT' || newStatus === 'CANCELLED') authorizedTransition = true;
                    }
                    break;
                case 'AWAITING_PAYMENT': // Both agreed, buyer deposits
                    if (userId === txData.buyerId && newStatus === 'PENDING_CONDITIONS') {
                        // This implies buyer is confirming fund deposit
                        updatePayload.fundsDepositedByBuyer = true;
                        authorizedTransition = true;
                    } else if (newStatus === 'CANCELLED' && (userId === txData.buyerId || userId === txData.sellerId)) {
                        authorizedTransition = true;
                    }
                    break;
                case 'AWAITING_SELLER_CONFIRMATION': // Buyer added conditions/deposited, seller confirms
                    if (userId === txData.sellerId) {
                        if (newStatus === 'IN_PROGRESS' || newStatus === 'PENDING_BUYER_REVIEW' || newStatus === 'CANCELLED') authorizedTransition = true;
                    }
                    break;
                case 'PENDING_CONDITIONS':
                case 'IN_PROGRESS':
                    if (newStatus === 'COMPLETED') {
                        if (!areAllConditionsFulfilled(txData.conditions)) {
                            throw { status: 400, message: 'Cannot complete: Not all conditions are fulfilled.' };
                        }
                        if (!txData.fundsDepositedByBuyer) {
                             throw { status: 400, message: 'Cannot complete: Buyer funds not marked as deposited.' };
                        }
                        // Assuming either party can mark as complete once conditions met & funds deposited.
                        // Or, this might be a system-triggered status after fund release.
                        if (userId === txData.buyerId || userId === txData.sellerId) {
                             updatePayload.fundsReleasedToSeller = true; // Conceptual
                             authorizedTransition = true;
                        }
                    } else if ((newStatus === 'CANCELLED' || newStatus === 'DISPUTED') && (userId === txData.buyerId || userId === txData.sellerId)) {
                        authorizedTransition = true;
                    }
                    break;
                case 'COMPLETED':
                case 'CANCELLED':
                    throw { status: 400, message: `Transaction is already in a final state (${currentStatus}).` };
                default:
                    console.warn(`Unhandled status transition from: ${currentStatus} to ${newStatus}`);
            }

            if (!authorizedTransition) {
                throw { status: 403, message: `Action not allowed or invalid status transition from "${currentStatus}" to "${newStatus}" by user.` };
            }

            updatePayload.timeline = FieldValue.arrayUnion({
                event: eventMessage || `Status changed from ${currentStatus} to ${newStatus} by UID: ${userId}.`,
                timestamp: now,
                userId: userId,
            });
            t.update(transactionRef, updatePayload);
        });
        res.status(200).json({ message: `Transaction status updated to ${newStatus}.`});
    } catch (error) {
        console.error(`Error updating TX ${transactionId} status:`, error.status ? error.message : error);
        res.status(error.status || 500).json({ error: error.message || 'Internal server error.' });
    }
});

// --- Route for Buyer to Add Conditions (Seller-Initiated TX) ---
router.post('/:transactionId/conditions', authenticateToken, async (req, res) => {
    const { transactionId } = req.params;
    const { conditions } = req.body; // Array of { type: string, description: string }
    const userId = req.userId;

    if (!Array.isArray(conditions) || conditions.length === 0 || !conditions.every(c => c && typeof c.description === 'string' && c.description.trim() !== '' && typeof c.type === 'string' && c.type.trim() !== '')) {
        return res.status(400).json({ error: 'Conditions must be a non-empty array of objects with "type" and "description".' });
    }
    console.log(`Adding conditions to TX ID: ${transactionId} by UID: ${userId}`);
    try {
        const transactionRef = db.collection('deals').doc(transactionId);
        const now = Timestamp.now();
        await db.runTransaction(async (t) => {
            const doc = await t.get(transactionRef);
            if (!doc.exists) throw { status: 404, message: 'Transaction not found.' };
            const txData = doc.data();
            if (txData.initiatedBy !== 'SELLER') throw { status: 403, message: 'Only for seller-initiated transactions.' };
            if (userId !== txData.buyerId) throw { status: 403, message: 'Only the buyer can add conditions.' };
            if (txData.status !== 'PENDING_BUYER_REVIEW') throw { status: 400, message: `Cannot add conditions in status "${txData.status}".` };

            const newConditions = conditions.map((cond, index) => ({
                id: `cond_${Date.now()}_${index}_${Math.random().toString(36).substring(2, 7)}`,
                type: cond.type.trim(), description: cond.description.trim(),
                status: 'PENDING', documents: [], createdBy: userId, createdAt: now, updatedAt: now,
            }));
            const timelineEvent = {
                event: `Buyer (UID: ${userId}) added ${newConditions.length} condition(s).`,
                timestamp: now, userId,
            };
            // This action implies the buyer has reviewed and is ready for seller to confirm these new conditions.
            // Buyer also needs to deposit funds. This status change signifies conditions are set.
            // The next step for the buyer after this would be to trigger a status update indicating fund deposit.
            t.update(transactionRef, {
                conditions: FieldValue.arrayUnion(...newConditions),
                status: 'AWAITING_SELLER_CONFIRMATION', // Buyer has acted, now seller's turn
                updatedAt: now,
                timeline: FieldValue.arrayUnion(timelineEvent)
            });
        });
        res.status(200).json({ message: 'Conditions added. Transaction awaiting seller confirmation.'});
    } catch (error) {
        console.error(`Error adding conditions for TX ${transactionId}:`, error.status ? error.message : error);
        res.status(error.status || 500).json({ error: error.message || 'Internal server error.' });
    }
});

// --- Route for Seller to Attach a Document to a Condition ---
router.post('/:transactionId/conditions/:conditionId/documents', authenticateToken, async (req, res) => {
    const { transactionId, conditionId } = req.params;
    const { fileId, fileName, fileUrl, contentType, fileSize } = req.body; // Info from file upload service
    const userId = req.userId; // Should be the seller

    if (!fileId || !fileName || !fileUrl || !contentType || typeof fileSize !== 'number') {
        return res.status(400).json({ error: 'Missing required file information (fileId, fileName, fileUrl, contentType, fileSize).' });
    }
    console.log(`Attaching document ${fileId} to condition ${conditionId} in TX ${transactionId} by UID ${userId}`);

    try {
        const transactionRef = db.collection('deals').doc(transactionId);
        const now = Timestamp.now();

        await db.runTransaction(async (t) => {
            const doc = await t.get(transactionRef);
            if (!doc.exists) throw { status: 404, message: 'Transaction not found.' };
            const txData = doc.data();

            if (userId !== txData.sellerId) throw { status: 403, message: 'Only the seller can attach documents to conditions.' };
            // Allow attaching documents if transaction is in a state where seller needs to provide them
            if (!['IN_PROGRESS', 'PENDING_CONDITIONS', 'AWAITING_SELLER_CONFIRMATION'].includes(txData.status)) {
                 throw { status: 400, message: `Cannot attach documents when transaction status is "${txData.status}".` };
            }

            const conditionIndex = txData.conditions.findIndex(c => c.id === conditionId);
            if (conditionIndex === -1) throw { status: 404, message: 'Condition not found within the transaction.' };

            const newDocument = {
                id: fileId, // Use the ID from the file upload service
                name: fileName,
                url: fileUrl,
                contentType,
                size: fileSize,
                uploadedBy: userId,
                uploadedAt: now, // Or use timestamp from file upload service if available
                status: 'PENDING_BUYER_VERIFICATION', // Document submitted, awaiting buyer's review
            };

            // Create a new conditions array with the updated condition
            const updatedConditions = [...txData.conditions];
            if (!updatedConditions[conditionIndex].documents) {
                updatedConditions[conditionIndex].documents = [];
            }
            updatedConditions[conditionIndex].documents.push(newDocument);
            updatedConditions[conditionIndex].status = 'PENDING_BUYER_VERIFICATION'; // Update condition status
            updatedConditions[conditionIndex].updatedAt = now;


            const timelineEvent = {
                event: `Seller (UID: ${userId}) attached document "${fileName}" to condition "${updatedConditions[conditionIndex].description}".`,
                timestamp: now, userId,
            };

            t.update(transactionRef, {
                conditions: updatedConditions,
                updatedAt: now,
                timeline: FieldValue.arrayUnion(timelineEvent)
            });
        });
        res.status(200).json({ message: 'Document attached to condition successfully.' });
    } catch (error) {
        console.error(`Error attaching document for TX ${transactionId}, Cond ${conditionId}:`, error.status ? error.message : error);
        res.status(error.status || 500).json({ error: error.message || 'Internal server error.' });
    }
});


// --- Route for Buyer to Review/Approve/Reject a Condition (after documents are submitted) ---
router.put('/:transactionId/conditions/:conditionId/review', authenticateToken, async (req, res) => {
    const { transactionId, conditionId } = req.params;
    const { reviewStatus, reviewComment } = req.body; // reviewStatus: 'FULFILLED' or 'REJECTED'
    const userId = req.userId; // Should be the buyer

    if (!reviewStatus || (reviewStatus !== 'FULFILLED' && reviewStatus !== 'REJECTED')) {
        return res.status(400).json({ error: 'Invalid review status. Must be "FULFILLED" or "REJECTED".' });
    }
    console.log(`Reviewing condition ${conditionId} in TX ${transactionId} by UID ${userId} with status ${reviewStatus}`);

    try {
        const transactionRef = db.collection('deals').doc(transactionId);
        const now = Timestamp.now();

        await db.runTransaction(async (t) => {
            const doc = await t.get(transactionRef);
            if (!doc.exists) throw { status: 404, message: 'Transaction not found.' };
            let txData = doc.data();

            if (userId !== txData.buyerId) throw { status: 403, message: 'Only the buyer can review conditions.' };
            if (!['IN_PROGRESS', 'PENDING_CONDITIONS', 'PENDING_BUYER_VERIFICATION'].includes(txData.conditions.find(c => c.id === conditionId)?.status)) {
                 // Allow review if condition is pending buyer verification or overall transaction is in progress/pending conditions
            }


            const conditionIndex = txData.conditions.findIndex(c => c.id === conditionId);
            if (conditionIndex === -1) throw { status: 404, message: 'Condition not found.' };

            // Create a new conditions array to update
            const updatedConditions = [...txData.conditions];
            updatedConditions[conditionIndex].status = reviewStatus;
            updatedConditions[conditionIndex].updatedAt = now;
            if (reviewComment) updatedConditions[conditionIndex].reviewComment = reviewComment;


            const timelineEvent = {
                event: `Buyer (UID: ${userId}) reviewed condition "${updatedConditions[conditionIndex].description}" and set status to ${reviewStatus}.`,
                timestamp: now, userId,
            };

            const updatePayload = {
                conditions: updatedConditions,
                updatedAt: now,
                timeline: FieldValue.arrayUnion(timelineEvent)
            };

            // Check if all conditions are now fulfilled
            const allMet = areAllConditionsFulfilled(updatedConditions);
            if (allMet && (txData.status === 'IN_PROGRESS' || txData.status === 'PENDING_CONDITIONS')) {
                if (!txData.fundsDepositedByBuyer) {
                     console.warn(`TX ${transactionId}: All conditions met, but funds not marked as deposited. Status remains ${txData.status}.`);
                     // Or throw error: throw { status: 400, message: 'Cannot complete: Buyer funds not marked as deposited.' };
                } else {
                    updatePayload.status = 'COMPLETED'; // Transition overall transaction status
                    updatePayload.fundsReleasedToSeller = true; // Conceptual
                    updatePayload.timeline = FieldValue.arrayUnion(...updatePayload.timeline, {
                         event: `All conditions met. Transaction COMPLETED. Funds released to seller (UID: ${txData.sellerId}).`,
                         timestamp: now, system: true // Indicate a system-driven event
                    });
                    console.log(`All conditions for TX ${transactionId} are fulfilled. Updating status to COMPLETED.`);
                }
            }

            t.update(transactionRef, updatePayload);
        });
        res.status(200).json({ message: `Condition review submitted. Status: ${reviewStatus}.` });
    } catch (error) {
        console.error(`Error reviewing condition for TX ${transactionId}, Cond ${conditionId}:`, error.status ? error.message : error);
        res.status(error.status || 500).json({ error: error.message || 'Internal server error.' });
    }
});


export default router;
