import express from 'express';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { adminApp } from '../auth/admin.js';
import { deployPropertyEscrowContract } from '../deployContract/contractDeployer.js'; // Import the deployer

const router = express.Router();
const db = getFirestore(adminApp);

// --- Environment Variables for Deployment ---
const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;
const RPC_URL = process.env.RPC_URL; // e.g., Sepolia RPC URL or your local Hardhat node URL

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

// --- Helper to check if all conditions are fulfilled (off-chain backend perspective) ---
function areAllBackendConditionsFulfilled(conditions = []) {
    if (!conditions || conditions.length === 0) return true;
    // This now reflects the buyer's confirmation in the backend,
    // which should ideally mirror the on-chain fulfillment status.
    return conditions.every(condition => condition.status === 'FULFILLED_BY_BUYER');
}


// --- Route to Create a New Transaction (with Smart Contract Deployment) ---
router.post('/create', authenticateToken, async (req, res) => {
    const initiatorId = req.userId;

    const {
        initiatedBy, // 'BUYER' or 'SELLER'
        propertyAddress,
        amount, // Escrow amount in a standard unit (e.g., ETH, to be converted to Wei for contract)
        otherPartyEmail,
        initialConditions, // Array of objects: [{ type: 'string', description: 'string', id: 'client_generated_id_for_condition' }]
        // New fields for smart contract deployment (assuming buyer and seller provide their wallet addresses)
        buyerWalletAddress, // Wallet address of the buyer
        sellerWalletAddress, // Wallet address of the seller
        deployToNetwork // Optional: 'sepolia', 'mainnet', or defaults to a test/dev network if RPC_URL points there
    } = req.body;

    // --- Input Validations ---
    if (!initiatedBy || (initiatedBy !== 'BUYER' && initiatedBy !== 'SELLER')) {
        return res.status(400).json({ error: 'Invalid "initiatedBy". Must be "BUYER" or "SELLER".' });
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
     if (!buyerWalletAddress || !sellerWalletAddress) { // Basic check, ethers.utils.isAddress for stricter
        return res.status(400).json({ error: 'Buyer and Seller wallet addresses are required for escrow contract.' });
    }
    if (initialConditions && (!Array.isArray(initialConditions) || !initialConditions.every(c => c && c.id && typeof c.description === 'string' && typeof c.type === 'string'))) {
        return res.status(400).json({ error: 'Initial conditions must be an array of objects with "id", "type", and "description".' });
    }
    // Validate wallet addresses (basic check, can be improved with ethers.utils.isAddress)
    if (typeof buyerWalletAddress !== 'string' || buyerWalletAddress.trim() === '' ||
        typeof sellerWalletAddress !== 'string' || sellerWalletAddress.trim() === '') {
        return res.status(400).json({ error: 'Valid buyer and seller wallet addresses are required.' });
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

        let buyerIdFs, sellerIdFs, status; // Firestore UIDs
        let finalBuyerWallet = buyerWalletAddress.trim();
        let finalSellerWallet = sellerWalletAddress.trim();


        if (initiatedBy === 'SELLER') {
            sellerIdFs = initiatorId;
            buyerIdFs = otherPartyId;
            status = 'PENDING_BUYER_REVIEW'; // Buyer needs to review and set conditions on-chain
        } else { // BUYER initiated
            buyerIdFs = initiatorId;
            sellerIdFs = otherPartyId;
            // Buyer sets conditions off-chain first, then on-chain after seller agrees.
            // Or, buyer sets conditions on-chain directly if that's the flow.
            // For now, let's assume buyer sets conditions initially in the backend,
            // and this will be translated to on-chain `setConditions` later.
            status = 'PENDING_SELLER_REVIEW';
        }

        const now = Timestamp.now();
        const newTransactionData = {
            propertyAddress: propertyAddress.trim(),
            amount: Number(amount), // Store the human-readable amount
            sellerId: sellerIdFs,
            buyerId: buyerIdFs,
            buyerWalletAddress: finalBuyerWallet,
            sellerWalletAddress: finalSellerWallet,
            participants: [sellerIdFs, buyerIdFs],
            status,
            createdAt: now,
            updatedAt: now,
            initiatedBy,
            // Conditions are now primarily for off-chain tracking and UI.
            // On-chain conditions are set via buyer's interaction with the smart contract.
            conditions: (initialConditions || []).map(cond => ({
                id: cond.id, // Use client-provided ID or generate one
                type: cond.type.trim() || 'CUSTOM',
                description: String(cond.description).trim(),
                status: 'PENDING_BUYER_ACTION', // Buyer needs to verify/fulfill this off-chain then on-chain
                // 'documents' array might still be useful for general info, not direct fulfillment trigger by seller.
                documents: [],
                createdBy: initiatorId,
                createdAt: now,
                updatedAt: now,
            })),
            documents: [],
            timeline: [{
                event: `Transaction initiated by ${initiatedBy.toLowerCase()} (UID: ${initiatorId}).`,
                timestamp: now, userId: initiatorId,
            }],
            smartContractAddress: null, // To be filled after deployment
            escrowAmountWei: ethers.utils.parseUnits(String(amount), 'ether').toString(), // Convert to Wei for contract
            fundsDepositedByBuyer: false, // Backend tracking, SC is source of truth
            fundsReleasedToSeller: false, // Backend tracking
            finalApprovalDeadlineBackend: null, // For backend tracking of SC timer
            disputeResolutionDeadlineBackend: null, // For backend tracking
        };
        if (initialConditions && initialConditions.length > 0) {
             newTransactionData.timeline.push({
                event: `${initiatedBy.toLowerCase()} specified ${initialConditions.length} initial condition(s) for review.`,
                timestamp: now,
                userId: initiatorId,
            });
        }

        // --- Deploy Smart Contract ---
        let deployedContractAddress = null;
        if (!DEPLOYER_PRIVATE_KEY || !RPC_URL) {
            console.warn("Deployment skipped: DEPLOYER_PRIVATE_KEY or RPC_URL not set in .env");
            // Potentially fail the transaction creation or proceed with a non-escrow deal
            // For this example, we'll allow it to proceed but log a warning.
            // In a real app, you might want to return an error if escrow is mandatory.
            newTransactionData.timeline.push({
                event: `Smart contract deployment SKIPPED due to missing configuration.`,
                timestamp: Timestamp.now(), system: true,
            });
        } else {
            try {
                console.log(`Deploying PropertyEscrow contract for deal...`);
                deployedContractAddress = await deployPropertyEscrowContract(
                    finalSellerWallet, // Seller's Ethereum address
                    finalBuyerWallet,  // Buyer's Ethereum address
                    newTransactionData.escrowAmountWei,
                    DEPLOYER_PRIVATE_KEY,
                    RPC_URL
                );
                newTransactionData.smartContractAddress = deployedContractAddress;
                newTransactionData.status = 'AWAITING_CONDITION_SETUP'; // Initial state of SC
                newTransactionData.timeline.push({
                    event: `PropertyEscrow smart contract deployed at ${deployedContractAddress}. Status: AWAITING_CONDITION_SETUP.`,
                    timestamp: Timestamp.now(), system: true,
                });
                console.log(`Smart contract deployed: ${deployedContractAddress}`);
            } catch (deployError) {
                console.error('Smart contract deployment failed:', deployError);
                // Decide how to handle: fail transaction or proceed without contract?
                // For now, log and proceed without contract address.
                newTransactionData.timeline.push({
                    event: `Smart contract deployment FAILED: ${deployError.message}. Proceeding without on-chain escrow.`,
                    timestamp: Timestamp.now(), system: true,
                });
                 // Optionally, return an error to the client if deployment is critical
                return res.status(500).json({ error: `Failed to deploy escrow contract: ${deployError.message}` });
            }
        }

        const transactionRef = await db.collection('deals').add(newTransactionData);
        console.log(`Transaction stored in Firestore: ${transactionRef.id}`);

        // Prepare response (convert Timestamps)
        const responseDetails = {
            ...newTransactionData,
            id: transactionRef.id,
            createdAt: newTransactionData.createdAt.toDate().toISOString(),
            updatedAt: newTransactionData.updatedAt.toDate().toISOString(),
            timeline: newTransactionData.timeline.map(t => ({ ...t, timestamp: t.timestamp.toDate().toISOString() })),
            conditions: newTransactionData.conditions.map(c => ({ ...c, createdAt: c.createdAt.toDate().toISOString(), updatedAt: c.updatedAt.toDate().toISOString() }))
        };
         if (newTransactionData.finalApprovalDeadlineBackend) {
            responseDetails.finalApprovalDeadlineBackend = newTransactionData.finalApprovalDeadlineBackend.toDate().toISOString();
        }
        if (newTransactionData.disputeResolutionDeadlineBackend) {
            responseDetails.disputeResolutionDeadlineBackend = newTransactionData.disputeResolutionDeadlineBackend.toDate().toISOString();
        }


        res.status(201).json({
            message: 'Transaction initiated successfully.',
            transactionId: transactionRef.id,
            status: newTransactionData.status,
            smartContractAddress: deployedContractAddress,
            transactionDetails: responseDetails
        });

    } catch (error) {
        console.error('Error creating transaction:', error);
        res.status(500).json({ error: 'Internal server error during transaction creation.' });
    }
});

// --- Route to Get a Specific Transaction ---
// (No major changes needed here, but ensure it returns new fields like smartContractAddress)
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
        if (transactionData.finalApprovalDeadlineBackend) {
            responseDetails.finalApprovalDeadlineBackend = transactionData.finalApprovalDeadlineBackend.toDate().toISOString();
        }
        if (transactionData.disputeResolutionDeadlineBackend) {
            responseDetails.disputeResolutionDeadlineBackend = transactionData.disputeResolutionDeadlineBackend.toDate().toISOString();
        }
        res.status(200).json(responseDetails);
    } catch (error) {
        console.error(`Error fetching transaction ${transactionId}:`, error);
        res.status(500).json({ error: 'Internal server error.' });
    }
});


// --- Route for Buyer to Update Backend Status of a Condition ---
// This route is now more about the buyer confirming their off-chain due diligence for a condition.
// The actual on-chain `fulfillCondition` or `buyerWithdrawConditionApproval` would be separate client-side transactions.
router.put('/:transactionId/conditions/:conditionId/buyer-review', authenticateToken, async (req, res) => {
    const { transactionId, conditionId } = req.params;
    // 'FULFILLED_BY_BUYER' (buyer confirmed off-chain),
    // 'PENDING_BUYER_ACTION' (buyer needs to act/verify),
    // 'ACTION_WITHDRAWN_BY_BUYER' (buyer previously confirmed but now disputes it before on-chain finalization)
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

            const conditionIndex = txData.conditions.findIndex(c => c.id === conditionId);
            if (conditionIndex === -1) throw { status: 404, message: 'Condition not found.' };

            const updatedConditions = [...txData.conditions];
            const oldConditionStatus = updatedConditions[conditionIndex].status;
            updatedConditions[conditionIndex].status = newBackendStatus;
            updatedConditions[conditionIndex].updatedAt = now;
            if (reviewComment) updatedConditions[conditionIndex].reviewComment = reviewComment;
            else updatedConditions[conditionIndex].reviewComment = FieldValue.delete();


            const timelineEvent = {
                event: `Buyer (UID: ${userId}) updated backend status for condition "${updatedConditions[conditionIndex].description}" from ${oldConditionStatus} to ${newBackendStatus}.`,
                timestamp: now, userId,
            };
             if (reviewComment) timelineEvent.comment = reviewComment;


            const updatePayload = {
                conditions: updatedConditions,
                updatedAt: now,
                timeline: FieldValue.arrayUnion(timelineEvent)
            };

            // Note: Checking `areAllBackendConditionsFulfilled` here is for backend/UI state.
            // The smart contract's `READY_FOR_FINAL_APPROVAL` state is the on-chain truth.
            const allBackendConditionsMet = areAllBackendConditionsFulfilled(updatedConditions);
            if (allBackendConditionsMet && txData.fundsDepositedByBuyer) {
                // This doesn't change SC state, but can update backend status to reflect readiness for SC interaction.
                // For example, update txData.status to something like 'READY_FOR_ONCHAIN_FINAL_APPROVAL_SETUP'
                // if not already in a SC-driven state.
                console.log(`All backend conditions for TX ${transactionId} marked as fulfilled by buyer.`);
            }
             if (newBackendStatus === 'ACTION_WITHDRAWN_BY_BUYER' && txData.status === 'READY_FOR_ONCHAIN_FINAL_APPROVAL_SETUP') {
                // If buyer withdraws a condition approval, backend status might revert
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


// --- Route to Update Overall Transaction Status (Backend Mirror of SC State) ---
// This route is now more about reflecting the smart contract's state in the backend,
// or handling off-chain agreements that might lead to an on-chain state change.
router.put('/:transactionId/sync-status', authenticateToken, async (req, res) => {
    const { transactionId } = req.params;
    // newSCStatus: The status read from the smart contract by the client, or a desired target state.
    // eventMessage: Custom message for the timeline.
    // finalApprovalDeadlineISO: Optional, if syncing SC timer to backend.
    // disputeResolutionDeadlineISO: Optional, if syncing SC timer to backend.
    const { newSCStatus, eventMessage, finalApprovalDeadlineISO, disputeResolutionDeadlineISO } = req.body;
    const userId = req.userId; // User initiating the sync/update

    if (!newSCStatus || typeof newSCStatus !== 'string') {
        return res.status(400).json({ error: 'New Smart Contract status (newSCStatus) is required.' });
    }
    // These are the SC states, ensure they match your SC enum exactly
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
            const currentBackendStatus = txData.status; // This is the backend's mirrored status

            if (!txData.participants?.includes(userId)) {
                throw { status: 403, message: 'Access denied. Not a participant.' };
            }

            const updatePayload = {
                status: newSCStatus, // Update backend status to mirror SC
                updatedAt: now,
                timeline: FieldValue.arrayUnion({
                    event: eventMessage || `Smart contract state synced/updated to ${newSCStatus} by UID: ${userId}.`,
                    timestamp: now,
                    userId: userId,
                })
            };

            if (newSCStatus === 'IN_FINAL_APPROVAL' && finalApprovalDeadlineISO) {
                updatePayload.finalApprovalDeadlineBackend = Timestamp.fromDate(new Date(finalApprovalDeadlineISO));
            }
            if (newSCStatus === 'IN_DISPUTE' && disputeResolutionDeadlineISO) {
                updatePayload.disputeResolutionDeadlineBackend = Timestamp.fromDate(new Date(disputeResolutionDeadlineISO));
            }
            if (newSCStatus === 'AWAITING_FULFILLMENT' && !txData.fundsDepositedByBuyer) {
                // If SC moves to AWAITING_FULFILLMENT, it implies funds were deposited on-chain
                updatePayload.fundsDepositedByBuyer = true;
                 updatePayload.timeline = FieldValue.arrayUnion(...updatePayload.timeline, {
                    event: `Funds confirmed deposited on-chain.`,
                    timestamp: now, system: true
                });
            }
            if (newSCStatus === 'COMPLETED' && !txData.fundsReleasedToSeller) {
                updatePayload.fundsReleasedToSeller = true;
                 updatePayload.timeline = FieldValue.arrayUnion(...updatePayload.timeline, {
                    event: `Funds confirmed released to seller on-chain.`,
                    timestamp: now, system: true
                });
            }


            // Add more specific logic here based on transitions if needed,
            // e.g., if backend status should only change based on certain SC transitions.
            console.log(`Updating backend status for TX ${transactionId} from ${currentBackendStatus} to ${newSCStatus}`);
            t.update(transactionRef, updatePayload);
        });
        res.status(200).json({ message: `Transaction backend status synced/updated to ${newSCStatus}.`});
    } catch (error) {
        console.error(`Error syncing/updating TX ${transactionId} status:`, error.status ? error.message : error);
        res.status(error.status || 500).json({ error: error.message || 'Internal server error.' });
    }
});


// --- REMOVING/ADAPTING Seller Document Upload Route ---
// This route's original purpose (seller uploads doc to fulfill condition) is less relevant.
// It could be repurposed for general document sharing related to a condition,
// but the fulfillment itself is buyer-driven on-chain.
// For now, let's comment it out or simplify its impact. If kept, it should NOT
// automatically change a condition's status to 'PENDING_BUYER_VERIFICATION' in a way
// that implies the seller fulfilled it.

/*
router.post('/:transactionId/conditions/:conditionId/documents', authenticateToken, async (req, res) => {
    // ... (previous validation for fileId, etc.)
    // This route would now just add a document to the condition for informational purposes.
    // It should NOT change the condition.status or the overall transaction.status directly.
    // The buyer would review this (off-chain) and then call `fulfillCondition` on the SC.
    // ...
    // updatedConditions[conditionIndex].status = 'PENDING_BUYER_VERIFICATION'; // REMOVE or change this logic
    // ...
});
*/

// --- Endpoints for new SC interactions (Conceptual - client triggers on-chain, then calls these to sync backend) ---

// Example: Client calls SC `startFinalApprovalPeriod`, then calls this to sync backend.
router.post('/:transactionId/sc/start-final-approval', authenticateToken, async (req, res) => {
    const { transactionId } = req.params;
    const { finalApprovalDeadlineISO } = req.body; // Deadline timestamp from SC event or client calculation
    const userId = req.userId;

    if (!finalApprovalDeadlineISO) {
        return res.status(400).json({ error: "finalApprovalDeadlineISO is required." });
    }

    try {
        const transactionRef = db.collection('deals').doc(transactionId);
        const now = Timestamp.now();
        await transactionRef.update({
            status: 'IN_FINAL_APPROVAL', // Mirror SC state
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

// Example: Client calls SC `buyerWithdrawConditionApproval`, then calls this.
router.post('/:transactionId/sc/raise-dispute', authenticateToken, async (req, res) => {
    const { transactionId } = req.params;
    const { conditionId, disputeResolutionDeadlineISO } = req.body;
    const userId = req.userId;

    if (!conditionId || !disputeResolutionDeadlineISO) {
        return res.status(400).json({ error: "conditionId and disputeResolutionDeadlineISO are required." });
    }
    // You might want to fetch the condition description for a better timeline message
    try {
        const transactionRef = db.collection('deals').doc(transactionId);
        const now = Timestamp.now();

         // Also update the specific condition's backend status
        const doc = await transactionRef.get();
        if (!doc.exists) throw new Error("Transaction not found for dispute sync.");
        const txData = doc.data();
        const conditionIndex = txData.conditions.findIndex(c => c.id === conditionId);
        let updatedConditions = [...txData.conditions];
        if (conditionIndex !== -1) {
            updatedConditions[conditionIndex].status = 'ACTION_WITHDRAWN_BY_BUYER'; // Or a specific "DISPUTED_BY_BUYER"
            updatedConditions[conditionIndex].updatedAt = now;
        }


        await transactionRef.update({
            status: 'IN_DISPUTE', // Mirror SC state
            conditions: updatedConditions, // Update the specific condition's status
            disputeResolutionDeadlineBackend: Timestamp.fromDate(new Date(disputeResolutionDeadlineISO)),
            updatedAt: now,
            timeline: FieldValue.arrayUnion({
                event: `Dispute raised on-chain for condition ID ${conditionId}. Backend synced by UID: ${userId}.`,
                timestamp: now,
                userId: userId
            })
        });
        res.status(200).json({ message: "Backend synced: Dispute raised." });
    } catch (error) {
        console.error(`Error syncing raise-dispute for TX ${transactionId}:`, error);
        res.status(500).json({ error: 'Internal server error.' });
    }
});


export default router;
