import express from 'express';
import { getFirestore, FieldValue } from 'firebase-admin/firestore'; // Import FieldValue
import { getAuth } from 'firebase-admin/auth';
import { adminApp } from '../auth/admin.js'; // Assuming this path is correct

const router = express.Router();
const db = getFirestore(adminApp);

// Authentication middleware (keep as is)
async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });
  try {
    const auth = getAuth(adminApp);
    const decodedToken = await auth.verifyIdToken(token);
    req.userId = decodedToken.uid;
    next();
  } catch (err) {
    // Log the specific error for debugging if needed
    // console.error("Auth Error:", err);
    console.error("[LOG AUTH MIDDLEWARE] Auth Error in middleware catch:", err.message);
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
}

// Send contact invitation
router.post('/invite', authenticateToken, async (req, res) => {
  try {
    const { contactEmail } = req.body;
    const userId = req.userId; // Sender's UID

    if (!contactEmail || typeof contactEmail !== 'string') {
      return res.status(400).json({ error: 'Contact email is required and must be a string' });
    }
    const normalizedContactEmail = contactEmail.trim().toLowerCase(); // Normalize email

    if (!normalizedContactEmail) {
        return res.status(400).json({ error: 'Contact email is required' });
    }


    // Get sender's information
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();

    if (!userDoc.exists || !userData) {
      // This case might be rare if authenticateToken works, but good practice
      return res.status(404).json({ error: 'Sender user profile not found' });
    }

    // Prevent self-invitation
    if (userData.email && userData.email.toLowerCase() === normalizedContactEmail) {
        return res.status(400).json({ error: 'You cannot invite yourself' });
    }


    // Find if the contact email exists in users collection
    const potentialContactSnapshot = await db.collection('users')
      .where('email', '==', normalizedContactEmail) // Use normalized email for lookup
      .limit(1) // Only need one match
      .get();

    if (potentialContactSnapshot.empty) {
      return res.status(404).json({ error: 'User with this email not found in the system' });
    }

    const contactDoc = potentialContactSnapshot.docs[0];
    const contactUserId = contactDoc.id; // Receiver's UID
    const contactData = contactDoc.data();

    // Check if contact (by UID) is already in sender's contacts subcollection
    const senderContactsRef = db.collection('users').doc(userId).collection('contacts');
    // A simple way is to use the contact's UID as the document ID if possible,
    // otherwise query by a 'contactUid' field. Let's assume we query by email for now.
    const existingSenderContact = await senderContactsRef.where('email', '==', normalizedContactEmail).limit(1).get();

    if (!existingSenderContact.empty) {
        // Check if it's an accepted contact
        if (existingSenderContact.docs[0].data().accepted === true) {
             return res.status(400).json({ error: 'This user is already in your contacts' });
        }
         // Optionally handle cases where an unaccepted contact exists, maybe resend?
         // For now, we'll just prevent adding if already accepted.
    }

    // Check if an identical pending invitation already exists
    const existingInvitationSnapshot = await db.collection('contactInvitations')
        .where('senderId', '==', userId)
        .where('receiverId', '==', contactUserId)
        .where('status', '==', 'pending')
        .limit(1)
        .get();

     if (!existingInvitationSnapshot.empty) {
        return res.status(400).json({ error: 'An invitation to this user is already pending' });
     }


    // Create pending invitation - Include wallets
    const invitationRef = await db.collection('contactInvitations').add({
      senderId: userId,
      senderEmail: userData.email || null, // Handle cases where sender might lack profile data
      senderFirstName: userData.first_name || '',
      senderLastName: userData.last_name || '',
      senderPhone: userData.phone_number || '',
      senderWallets: userData.wallets || [], // *** Include sender wallets ***
      receiverId: contactUserId,
      receiverEmail: contactData.email || null, // Handle cases where contact might lack profile data
      receiverFirstName: contactData.first_name || '',
      receiverLastName: contactData.last_name || '',
      receiverPhone: contactData.phone_number || '',
      receiverWallets: contactData.wallets || [], // *** Include receiver wallets ***
      status: 'pending',
      createdAt: FieldValue.serverTimestamp() // Use server timestamp
    });

    res.status(201).json({ // Use 201 Created for successful resource creation
      message: 'Invitation sent successfully',
      invitationId: invitationRef.id
    });

  } catch (error) {
    console.error('Error sending invitation:', error);
    res.status(500).json({ error: 'Internal server error while sending invitation' });
  }
});

// Get pending invitations for current user
router.get('/pending', authenticateToken, async (req, res) => {
  try {
    const userId = req.userId;

    // Order by creation time for consistent results
    const pendingInvitationsSnapshot = await db.collection('contactInvitations')
      .where('receiverId', '==', userId)
      .where('status', '==', 'pending')
      .orderBy('createdAt', 'desc') // Example: show newest first
      .get();

    const invitations = pendingInvitationsSnapshot.docs.map(doc => {
        const data = doc.data();
        // Convert timestamp if needed, or handle on client
        return {
            id: doc.id,
            senderId: data.senderId,
            senderEmail: data.senderEmail,
            senderFirstName: data.senderFirstName,
            // Add other fields as needed by the frontend
        };
    });


    res.status(200).json({ invitations });

  } catch (error) {
    console.error('Error getting pending invitations:', error);
    res.status(500).json({ error: 'Internal server error while getting invitations' });
  }
});

// Handle invitation response
router.post('/response', authenticateToken, async (req, res) => {
  try {
    const { invitationId, action } = req.body; // action should be 'accept' or 'deny'
    const userId = req.userId; // This is the receiver responding

    if (!invitationId || typeof invitationId !== 'string' || !invitationId.trim()) {
        return res.status(400).json({ error: 'Missing or invalid invitationId' });
    }
    if (!action || (action !== 'accept' && action !== 'deny')) {
      return res.status(400).json({ error: 'Invalid action provided. Must be "accept" or "deny".' });
    }

    const invitationIdTrimmed = invitationId.trim();

    // Use a transaction for atomicity
    await db.runTransaction(async (transaction) => {
        const invitationRef = db.collection('contactInvitations').doc(invitationIdTrimmed);
        const invitationDoc = await transaction.get(invitationRef);

        if (!invitationDoc.exists) {
            // Throw error inside transaction to abort
            throw { status: 404, message: 'Invitation not found' };
        }

        const invitationData = invitationDoc.data();

        // Verify the current user is the receiver
        if (invitationData.receiverId !== userId) {
            throw { status: 403, message: 'Not authorized to respond to this invitation' };
        }

        if (invitationData.status !== 'pending') {
            throw { status: 400, message: 'Invitation already processed' };
        }

        if (action === 'accept') {
            const senderContactRef = db.collection('users').doc(invitationData.senderId).collection('contacts').doc(invitationData.receiverId); // Use receiver UID as doc ID
            const receiverContactRef = db.collection('users').doc(invitationData.receiverId).collection('contacts').doc(invitationData.senderId); // Use sender UID as doc ID

            // Add receiver to sender's contacts
            transaction.set(senderContactRef, {
                contactUid: invitationData.receiverId, // Store UID
                email: invitationData.receiverEmail,
                first_name: invitationData.receiverFirstName,
                last_name: invitationData.receiverLastName,
                phone_number: invitationData.receiverPhone,
                wallets: invitationData.receiverWallets || [], // *** Add wallets ***
                accepted: true,
                relationshipCreatedAt: FieldValue.serverTimestamp() // Timestamp of acceptance
            });

            // Add sender to receiver's contacts
            transaction.set(receiverContactRef, {
                contactUid: invitationData.senderId, // Store UID
                email: invitationData.senderEmail,
                first_name: invitationData.senderFirstName,
                last_name: invitationData.senderLastName,
                phone_number: invitationData.senderPhone,
                wallets: invitationData.senderWallets || [], // *** Add wallets ***
                accepted: true,
                relationshipCreatedAt: FieldValue.serverTimestamp()
            });

            // Update invitation status
            transaction.update(invitationRef, { status: 'accepted', processedAt: FieldValue.serverTimestamp() });

        } else { // action === 'deny'
            // Update invitation status
            transaction.update(invitationRef, { status: 'denied', processedAt: FieldValue.serverTimestamp() });
        }
    });

    res.status(200).json({ message: `Invitation ${action === 'accept' ? 'accepted' : 'declined'}` });


  } catch (error) {
     // Handle specific transaction errors or general errors
     if (error.status) {
         // Error thrown from transaction logic
         console.warn(`Invitation response error (${error.status}): ${error.message}`);
         res.status(error.status).json({ error: error.message });
     } else {
         // Generic internal error
        console.error('Error processing invitation response:', error);
        res.status(500).json({ error: 'Internal server error processing response' });
     }
  }
});

// Get user's contacts
router.get('/contacts', authenticateToken, async (req, res) => {
  try {
    const userId = req.userId;

    const contactsRef = db.collection('users').doc(userId).collection('contacts');
    // Only retrieve contacts marked as accepted
    const contactsSnapshot = await contactsRef.where('accepted', '==', true).get();

    const contacts = contactsSnapshot.docs.map(doc => ({
      id: doc.id, // This is the contact's UID if using UID as doc ID
      email: doc.data().email,
      first_name: doc.data().first_name,
      last_name: doc.data().last_name,
      phone_number: doc.data().phone_number,
      wallets: doc.data().wallets || [],
      // Add other fields as needed
    }));

    res.status(200).json({ contacts });

  } catch (error) {
    console.error('Error getting contacts:', error);
    res.status(500).json({ error: 'Internal server error while getting contacts' });
  }
});

// Delete a contact
router.delete('/contacts/:contactId', authenticateToken, async (req, res) => {
  try {
    const userId = req.userId; // Authenticated user's UID
    const contactId = req.params.contactId; // UID of the contact to remove

    // Validate contactId
    if (!contactId || typeof contactId !== 'string' || contactId.trim() === '') {
      return res.status(400).json({ error: 'Invalid contact ID' });
    }

    // Prevent self-deletion
    if (contactId === userId) {
      return res.status(400).json({ error: 'Cannot remove yourself as a contact' });
    }

    // Use a batch write to delete the contact from both users' contact lists
    const batch = db.batch();

    const userContactRef = db.collection('users').doc(userId).collection('contacts').doc(contactId);
    const contactUserRef = db.collection('users').doc(contactId).collection('contacts').doc(userId);

    batch.delete(userContactRef);
    batch.delete(contactUserRef);

    await batch.commit();

    res.status(200).json({ message: 'Contact removed successfully' });
  } catch (error) {
    console.error('Error removing contact:', error);
    res.status(500).json({ error: 'Internal server error while removing contact' });
  }
});

export default router;