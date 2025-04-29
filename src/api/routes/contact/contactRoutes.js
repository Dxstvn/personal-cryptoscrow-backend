import express from 'express';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { adminApp } from '../auth/admin.js';

const router = express.Router();
const db = getFirestore(adminApp);

// Authentication middleware
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
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
}

// Send contact invitation
router.post('/invite', authenticateToken, async (req, res) => {
  try {
    const { contactEmail } = req.body;
    const userId = req.userId;

    if (!contactEmail) {
      return res.status(400).json({ error: 'Contact email is required' });
    }

    // Get sender's information
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();

    if (!userData) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if contact already exists
    const contactsRef = db.collection('users').doc(userId).collection('contacts');
    const existingContacts = await contactsRef.where('email', '==', contactEmail).get();

    if (!existingContacts.empty) {
      return res.status(400).json({ error: 'Contact already exists' });
    }

    // Find if the contact email exists in users collection
    const potentialContactSnapshot = await db.collection('users')
      .where('email', '==', contactEmail)
      .get();

    if (potentialContactSnapshot.empty) {
      return res.status(404).json({ error: 'User with this email not found in the system' });
    }

    const contactDoc = potentialContactSnapshot.docs[0];
    const contactUserId = contactDoc.id;
    const contactData = contactDoc.data();

    // Create pending invitation
    const invitationRef = await db.collection('contactInvitations').add({
      senderId: userId,
      senderEmail: userData.email,
      senderName: `${userData.first_name} ${userData.last_name}`,
      senderFirstName: userData.first_name,
      senderLastName: userData.last_name,
      senderPhone: userData.phone_number,
      receiverId: contactUserId,
      receiverEmail: contactEmail,
      receiverFirstName: contactData.first_name,
      receiverLastName: contactData.last_name,
      receiverPhone: contactData.phone_number,
      status: 'pending',
      createdAt: new Date()
    });

    res.status(200).json({ 
      message: 'Invitation sent successfully',
      invitationId: invitationRef.id
    });

  } catch (error) {
    console.error('Error sending invitation:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get pending invitations for current user
router.get('/pending', authenticateToken, async (req, res) => {
  try {
    const userId = req.userId;

    const pendingInvitationsSnapshot = await db.collection('contactInvitations')
      .where('receiverId', '==', userId)
      .where('status', '==', 'pending')
      .get();

    const invitations = pendingInvitationsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    res.status(200).json({ invitations });

  } catch (error) {
    console.error('Error getting pending invitations:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Handle invitation response
router.post('/response', authenticateToken, async (req, res) => {
  try {
    const { invitationId, action } = req.body;
    const userId = req.userId;

    if (!invitationId || !action) {
      return res.status(400).json({ error: 'Missing invitationId or action' });
    }

    // Get the invitation
    const invitationRef = db.collection('contactInvitations').doc(invitationId);
    const invitation = await invitationRef.get();

    if (!invitation.exists) {
      return res.status(404).json({ error: 'Invitation not found' });
    }

    const invitationData = invitation.data();

    // Verify the current user is the receiver
    if (invitationData.receiverId !== userId) {
      return res.status(403).json({ error: 'Not authorized to respond to this invitation' });
    }

    if (invitationData.status !== 'pending') {
      return res.status(400).json({ error: 'Invitation already processed' });
    }

    if (action === 'accept') {
      // Add contact to sender's contacts
      await db.collection('users')
        .doc(invitationData.senderId)
        .collection('contacts')
        .add({
          email: invitationData.receiverEmail,
          first_name: invitationData.receiverFirstName,
          last_name: invitationData.receiverLastName,
          phone_number: invitationData.receiverPhone,
          accepted: true,
          created_at: new Date()
        });

      // Add sender to receiver's contacts
      await db.collection('users')
        .doc(invitationData.receiverId)
        .collection('contacts')
        .add({
          email: invitationData.senderEmail,
          first_name: invitationData.senderFirstName,
          last_name: invitationData.senderLastName,
          phone_number: invitationData.senderPhone,
          accepted: true,
          created_at: new Date()
        });

      // Update invitation status
      await invitationRef.update({ status: 'accepted' });

      res.status(200).json({ message: 'Invitation accepted' });

    } else if (action === 'deny') {
      // Update invitation status
      await invitationRef.update({ status: 'denied' });
      res.status(200).json({ message: 'Invitation declined' });

    } else {
      res.status(400).json({ error: 'Invalid action' });
    }

  } catch (error) {
    console.error('Error processing invitation response:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user's contacts
router.get('/contacts', authenticateToken, async (req, res) => {
  try {
    const userId = req.userId;

    const contactsRef = db.collection('users').doc(userId).collection('contacts');
    const contactsSnapshot = await contactsRef.where('accepted', '==', true).get();

    const contacts = contactsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    res.status(200).json({ contacts });

  } catch (error) {
    console.error('Error getting contacts:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router; 