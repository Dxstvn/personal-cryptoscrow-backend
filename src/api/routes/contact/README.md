# Contact Management Routes (`/contact`)

## Overview

This directory contains API routes for managing user contacts and invitation systems within the CryptoEscrow platform. The contact system enables users to build trusted networks for escrow transactions through a secure invitation and acceptance workflow.

**Base Path**: `/contact`  
**Authentication**: All endpoints require Firebase ID Token (`Authorization: Bearer <TOKEN>`)  
**Purpose**: Enable users to connect with trusted counterparties for secure escrow transactions

## Core Endpoints

### 1. Send Contact Invitation
**POST** `/contact/invite`

Sends a contact invitation to another user by email address.

**Request Body**:
```json
{
  "contactEmail": "colleague@example.com"
}
```

**Success Response** (201 Created):
```json
{
  "message": "Invitation sent successfully",
  "invitationId": "invitation-doc-id"
}
```

**Error Responses**:
- `400 Bad Request`: Missing email, self-invitation attempt, or existing invitation
- `404 Not Found`: User with email not found in system

**Backend Logic**:
1. Validates the contact email exists in the system
2. Prevents self-invitations and duplicate invitations
3. Creates invitation document with sender/receiver details
4. Includes wallet information from both users

### 2. Get Pending Invitations
**GET** `/contact/pending`

Retrieves all pending invitations for the authenticated user.

**Success Response** (200 OK):
```json
{
  "invitations": [
    {
      "id": "invitation-doc-id",
      "senderId": "sender-uid",
      "senderEmail": "sender@example.com",
      "senderFirstName": "John"
    }
  ]
}
```

**Notes**:
- Only shows invitations where the user is the receiver
- Ordered by creation date (newest first)
- Only returns pending invitations

### 3. Respond to Invitation
**POST** `/contact/response`

Accept or deny a received contact invitation.

**Request Body**:
```json
{
  "invitationId": "invitation-doc-id",
  "action": "accept"  // or "deny"
}
```

**Success Response** (200 OK):
```json
{
  "message": "Invitation accepted"  // or "Invitation declined"
}
```

**Error Responses**:
- `400 Bad Request`: Invalid action or already processed invitation
- `403 Forbidden`: Not authorized to respond to this invitation
- `404 Not Found`: Invitation not found

**Backend Actions (Accept)**:
1. Creates bidirectional contact relationship
2. Adds contact to both users' contact subcollections
3. Includes all profile data including wallets
4. Updates invitation status to "accepted"

### 4. Get User Contacts
**GET** `/contact/contacts`

Retrieves all accepted contacts for the authenticated user.

**Success Response** (200 OK):
```json
{
  "contacts": [
    {
      "id": "contact-uid",
      "email": "contact@example.com",
      "first_name": "Jane",
      "last_name": "Doe",
      "phone_number": "+1234567890",
      "wallets": [
        {
          "address": "0x...",
          "name": "Primary Wallet",
          "network": "ethereum"
        }
      ]
    }
  ]
}
```

**Notes**:
- Only returns accepted contacts
- Contact ID is the UID of the contact user
- Includes wallet information for escrow transactions

### 5. Remove Contact
**DELETE** `/contact/contacts/:contactId`

Removes a contact relationship between two users.

**URL Parameter**: `:contactId` - The UID of the contact to remove

**Success Response** (200 OK):
```json
{
  "message": "Contact removed successfully"
}
```

**Error Responses**:
- `400 Bad Request`: Invalid contact ID or self-removal attempt

**Backend Actions**:
- Removes contact from both users' contact lists
- Uses batch operation for atomicity

## Data Models

### Contact Invitation Document
```javascript
{
  senderId: "sender-uid",
  senderEmail: "sender@example.com",
  senderFirstName: "John",
  senderLastName: "Doe",
  senderPhone: "+1234567890",
  senderWallets: [...],
  receiverId: "receiver-uid",
  receiverEmail: "receiver@example.com",
  receiverFirstName: "Jane",
  receiverLastName: "Smith",
  receiverPhone: "+0987654321",
  receiverWallets: [...],
  status: "pending",  // "pending", "accepted", "denied"
  createdAt: Timestamp,
  processedAt: Timestamp  // Set when accepted/denied
}
```

### Contact Document (in user subcollection)
```javascript
{
  contactUid: "contact-user-uid",
  email: "contact@example.com",
  first_name: "Jane",
  last_name: "Doe",
  phone_number: "+1234567890",
  wallets: [
    {
      address: "0x...",
      name: "Wallet Name",
      network: "ethereum"
    }
  ],
  accepted: true,
  relationshipCreatedAt: Timestamp
}
```

## Frontend Integration Guide

### 1. Sending Invitations
```javascript
async function sendContactInvitation(email) {
  try {
    const response = await fetch('/contact/invite', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({ contactEmail: email })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error);
    }
    
    const data = await response.json();
    return data.invitationId;
  } catch (error) {
    // Handle specific errors
    if (error.message.includes('already in your contacts')) {
      showNotification('This user is already your contact', 'info');
    } else if (error.message.includes('not found')) {
      showNotification('User not found', 'error');
    } else {
      showNotification('Failed to send invitation', 'error');
    }
    throw error;
  }
}
```

### 2. Managing Invitations
```javascript
// Fetch pending invitations
async function getPendingInvitations() {
  const response = await authenticatedFetch('/contact/pending');
  const data = await response.json();
  return data.invitations;
}

// Respond to invitation
async function respondToInvitation(invitationId, accept) {
  const response = await fetch('/contact/response', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`
    },
    body: JSON.stringify({
      invitationId,
      action: accept ? 'accept' : 'deny'
    })
  });
  
  if (!response.ok) {
    throw new Error('Failed to respond to invitation');
  }
  
  return response.json();
}
```

### 3. Contact List Management
```javascript
// Get all contacts
async function getContacts() {
  const response = await authenticatedFetch('/contact/contacts');
  const data = await response.json();
  return data.contacts;
}

// Remove a contact
async function removeContact(contactId) {
  const response = await fetch(`/contact/contacts/${contactId}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${authToken}`
    }
  });
  
  if (!response.ok) {
    throw new Error('Failed to remove contact');
  }
}
```

### 4. Real-time Updates with Firestore
```javascript
// Listen for invitation updates
function listenForInvitations(userId) {
  const q = query(
    collection(db, 'contactInvitations'),
    where('receiverId', '==', userId),
    where('status', '==', 'pending')
  );
  
  return onSnapshot(q, (snapshot) => {
    const invitations = [];
    snapshot.forEach((doc) => {
      invitations.push({ id: doc.id, ...doc.data() });
    });
    updateInvitationBadge(invitations.length);
  });
}

// Listen for contact changes
function listenForContacts(userId) {
  const contactsRef = collection(db, 'users', userId, 'contacts');
  const q = query(contactsRef, where('accepted', '==', true));
  
  return onSnapshot(q, (snapshot) => {
    const contacts = [];
    snapshot.forEach((doc) => {
      contacts.push({ id: doc.id, ...doc.data() });
    });
    updateContactList(contacts);
  });
}
```

## Security Considerations

### Authentication & Authorization
- All endpoints require valid Firebase ID token
- Users can only access their own invitations and contacts
- Contact removal is bidirectional and atomic

### Data Privacy
- Email addresses are only shared after invitation acceptance
- Wallet information is included for escrow functionality
- Users cannot see pending invitations they sent (only received)

### Validation & Error Handling
- Email normalization (lowercase) for consistent matching
- Prevention of self-invitations
- Duplicate invitation prevention
- Transaction-based operations for data consistency

## Testing Support

The authentication middleware includes special handling for test environments:
- Accepts various token formats (ID tokens, custom tokens)
- Handles audience mismatch errors gracefully
- Allows manual token decoding for test scenarios

## UI/UX Recommendations

### Invitation Flow
1. **Email Search**: Implement email autocomplete with debouncing
2. **Validation**: Show real-time validation for email format
3. **Feedback**: Clear success/error messages for all actions
4. **Status**: Show invitation status (pending, accepted, denied)

### Contact Management
1. **Contact Cards**: Display name, email, and wallet count
2. **Quick Actions**: One-click remove with confirmation
3. **Search**: Filter contacts by name or email
4. **Wallet Display**: Show primary wallet address

### Real-time Features
1. **Notifications**: Badge for new invitations
2. **Live Updates**: Automatic UI refresh on changes
3. **Offline Support**: Cache contacts for offline viewing

## Common Issues & Solutions

### Issue: "User not found" when sending invitation
**Solution**: Ensure the email exactly matches a registered user (case-insensitive)

### Issue: Duplicate invitations
**Solution**: Check for existing pending invitations before sending

### Issue: Contact not appearing after acceptance
**Solution**: Ensure Firestore listeners are set up for real-time updates

### Issue: Token authentication failures in tests
**Solution**: Use the test environment's flexible token handling

## Next Steps for Frontend

1. **Build Invitation UI**: Create forms for sending/responding to invitations
2. **Contact List View**: Display contacts with wallet information
3. **Real-time Integration**: Set up Firestore listeners
4. **Search Functionality**: Implement user search by email
5. **Notification System**: Alert users of new invitations
6. **Contact Analytics**: Show transaction history between contacts