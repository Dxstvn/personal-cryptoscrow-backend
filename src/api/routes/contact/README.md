# Contact Management Routes (`src/api/routes/contact`)

## Overview

This directory contains API routes for managing user contacts and invitation systems within the CryptoEscrow platform. The contact system enables users to build trusted networks for escrow transactions, send and receive connection invitations, and manage their professional relationships within the platform.

**Frontend Relevance**: Essential for building contact management interfaces, invitation flows, and user discovery features. These endpoints power social features that help users connect with trusted counterparties for escrow transactions.

## File: `contactRoutes.js`

**Base Path**: `/contact` (mounted at `/contact` in server.js)
**Authentication**: All endpoints require Firebase ID Token (`Authorization: Bearer <TOKEN>`)
**Key Integrations**: Firestore collections (`invitations`, `contacts`), user profile management

## Core Endpoints

### **Contact Invitation Management**

#### `POST /contact/invite`
**Purpose**: Sends a contact invitation to another user by email address.

**Request Body**:
```json
{
  "contactEmail": "colleague@example.com",
  "message": "Hi! I'd like to connect with you on CryptoEscrow for future transactions." // Optional custom message
}
```

**Success Response (201 Created)**:
```json
{
  "message": "Invitation sent successfully",
  "invitation": {
    "id": "invitation-doc-id",
    "fromUserId": "current-user-uid",
    "toEmail": "colleague@example.com",
    "fromUserEmail": "sender@example.com",
    "fromUserName": "John Doe",
    "message": "Hi! I'd like to connect...",
    "status": "pending",
    "sentAt": "2023-10-26T10:00:00.000Z",
    "expiresAt": "2023-11-26T10:00:00.000Z"
  }
}
```

**Error Responses**:
```json
// Email not found (404)
{
  "error": "No user found with email: colleague@example.com"
}

// Already connected (400)
{
  "error": "You are already connected with this user"
}

// Pending invitation exists (400)
{
  "error": "You already have a pending invitation with this user"
}

// Self-invitation attempt (400)
{
  "error": "You cannot send an invitation to yourself"
}
```

**Frontend Actions**:
- Build contact invitation form with email input
- Implement email validation and user lookup
- Show invitation status and confirmation
- Handle duplicate invitation scenarios
- Display invitation history

#### `GET /contact/pending`
**Purpose**: Retrieves all pending invitations (sent and received) for the authenticated user.

**Query Parameters**:
- `type` - Filter by invitation type: "sent", "received", or "all" (default: "all")
- `limit` - Number of results per page (default: 50)
- `startAfter` - Pagination cursor

**Response**:
```json
{
  "invitations": {
    "sent": [
      {
        "id": "invitation-1",
        "toEmail": "colleague@example.com",
        "toUserName": "Jane Smith",
        "message": "Looking forward to working together",
        "status": "pending",
        "sentAt": "2023-10-26T10:00:00.000Z",
        "expiresAt": "2023-11-26T10:00:00.000Z"
      }
    ],
    "received": [
      {
        "id": "invitation-2", 
        "fromUserId": "sender-uid",
        "fromUserEmail": "business@example.com",
        "fromUserName": "Business Partner",
        "message": "Let's connect for property deals",
        "status": "pending",
        "sentAt": "2023-10-25T15:30:00.000Z",
        "expiresAt": "2023-11-25T15:30:00.000Z"
      }
    ]
  },
  "counts": {
    "totalSent": 1,
    "totalReceived": 1,
    "pendingSent": 1,
    "pendingReceived": 1
  }
}
```

**Frontend Actions**:
- Display pending invitations in organized tabs/sections
- Show invitation details and sender/recipient information
- Implement notification badges for new invitations
- Enable bulk actions for invitation management
- Show expiration status and countdown timers

#### `POST /contact/response`
**Purpose**: Responds to a received contact invitation (accept or deny).

**Request Body**:
```json
{
  "invitationId": "invitation-doc-id",
  "action": "accept", // "accept" or "deny"
  "message": "Happy to connect!" // Optional response message
}
```

**Success Response (200 OK)**:
```json
{
  "message": "Invitation accepted successfully",
  "contact": {
    "id": "contact-doc-id",
    "userId": "contact-user-uid",
    "userEmail": "business@example.com",
    "userName": "Business Partner",
    "connectionDate": "2023-10-26T10:15:00.000Z",
    "status": "active",
    "trustLevel": "new", // "new", "verified", "trusted"
    "transactionHistory": {
      "totalDeals": 0,
      "completedDeals": 0,
      "totalValue": "0 ETH"
    }
  }
}
```

**Error Responses**:
```json
// Invitation not found (404)
{
  "error": "Invitation not found or you don't have permission to respond"
}

// Invalid action (400)
{
  "error": "Action must be 'accept' or 'deny'"
}

// Expired invitation (400)
{
  "error": "This invitation has expired"
}

// Already responded (400)
{
  "error": "You have already responded to this invitation"
}
```

**Frontend Actions**:
- Build invitation response interface with accept/deny options
- Show contact details and mutual connections
- Display transaction history if available
- Implement confirmation dialogs for important actions
- Update invitation lists in real-time

### **Contact Management**

#### `GET /contact/contacts`
**Purpose**: Retrieves all active contacts for the authenticated user with filtering and sorting options.

**Query Parameters**:
- `search` - Search contacts by name or email
- `trustLevel` - Filter by trust level: "new", "verified", "trusted"
- `sortBy` - Sort field: "name", "connectionDate", "lastActivity" (default: "name")
- `sortOrder` - "asc" or "desc" (default: "asc")
- `limit` - Results per page (default: 50)
- `startAfter` - Pagination cursor

**Response**:
```json
{
  "contacts": [
    {
      "id": "contact-1",
      "userId": "contact-user-uid-1",
      "userEmail": "partner@example.com",
      "userName": "Business Partner",
      "displayName": "Business Partner",
      "photoURL": "https://...",
      "connectionDate": "2023-10-20T10:00:00.000Z",
      "lastActivity": "2023-10-25T14:30:00.000Z",
      "status": "active",
      "trustLevel": "verified",
      "transactionHistory": {
        "totalDeals": 3,
        "completedDeals": 3,
        "totalValue": "15.5 ETH",
        "averageRating": 4.8
      },
      "preferences": {
        "preferredCurrency": "ETH",
        "preferredNetwork": "ethereum",
        "timeZone": "UTC-8"
      }
    }
  ],
  "pagination": {
    "totalContacts": 25,
    "currentPage": 1,
    "totalPages": 1,
    "hasMore": false
  },
  "summary": {
    "totalContacts": 25,
    "trustLevels": {
      "new": 10,
      "verified": 12,
      "trusted": 3
    },
    "recentConnections": 5
  }
}
```

**Frontend Actions**:
- Build comprehensive contact list with search and filtering
- Display contact cards with trust indicators
- Show transaction history and ratings
- Implement contact detail views
- Enable contact organization and tagging

#### `DELETE /contact/contacts/:contactId`
**Purpose**: Removes a contact connection between the authenticated user and the specified contact.

**URL Parameter**: `:contactId` - The contact document ID or user ID to remove

**Success Response (200 OK)**:
```json
{
  "message": "Contact removed successfully",
  "removedContact": {
    "userId": "removed-user-uid",
    "userName": "Former Contact",
    "connectionDate": "2023-10-20T10:00:00.000Z",
    "removalDate": "2023-10-26T10:30:00.000Z"
  }
}
```

**Error Responses**:
```json
// Contact not found (404)
{
  "error": "Contact not found or you don't have permission to remove"
}

// Active transactions exist (400)
{
  "error": "Cannot remove contact with active transactions. Complete or cancel active deals first."
}
```

**Frontend Actions**:
- Implement contact removal with confirmation dialogs
- Check for active transactions before removal
- Update contact lists immediately
- Show removal confirmation and undo options
- Handle batch contact removal

### **Contact Discovery & Search**

#### `GET /contact/search`
**Purpose**: Searches for users who can be invited as contacts.

**Query Parameters**:
- `query` - Search term (name, email, or partial match)
- `excludeConnected` - Exclude already connected users (default: true)
- `limit` - Results limit (default: 20)

**Response**:
```json
{
  "users": [
    {
      "userId": "potential-contact-uid",
      "email": "newuser@example.com",
      "displayName": "New User",
      "photoURL": "https://...",
      "joinDate": "2023-10-15T10:00:00.000Z",
      "isConnected": false,
      "hasInvitation": false,
      "publicProfile": {
        "businessType": "Real Estate",
        "location": "New York, NY",
        "verificationLevel": "basic"
      },
      "mutualConnections": 2
    }
  ],
  "totalResults": 15,
  "suggestions": [
    "Consider connecting with verified real estate professionals",
    "Users with mutual connections are often more trustworthy"
  ]
}
```

**Frontend Actions**:
- Build user discovery interface with search
- Show user profiles and mutual connections
- Display invitation status and connection options
- Implement user filtering and sorting
- Show suggestions for trusted connections

## Contact Data Models

### **Contact Document Structure**
```javascript
{
  id: "contact-doc-id",
  userId1: "user-uid-1", // Always the lexicographically smaller UID
  userId2: "user-uid-2", // Always the lexicographically larger UID
  user1Email: "user1@example.com",
  user2Email: "user2@example.com",
  user1Name: "User One",
  user2Name: "User Two",
  connectionDate: timestamp,
  status: "active", // "active", "blocked", "removed"
  trustLevel: "verified", // "new", "verified", "trusted"
  lastActivity: timestamp,
  transactionHistory: {
    totalDeals: 5,
    completedDeals: 5,
    cancelledDeals: 0,
    totalValue: "25.5 ETH",
    averageRating: 4.9
  },
  notes: "Reliable business partner",
  tags: ["real-estate", "verified"],
  createdAt: timestamp,
  updatedAt: timestamp
}
```

### **Invitation Document Structure**
```javascript
{
  id: "invitation-doc-id",
  fromUserId: "sender-uid",
  toUserId: "recipient-uid", // null if recipient not registered
  toEmail: "recipient@example.com",
  fromUserEmail: "sender@example.com",
  fromUserName: "Sender Name",
  message: "Custom invitation message",
  status: "pending", // "pending", "accepted", "denied", "expired"
  sentAt: timestamp,
  respondedAt: timestamp, // null if not responded
  expiresAt: timestamp, // 30 days from sentAt
  remindersSent: 1,
  lastReminderAt: timestamp,
  createdAt: timestamp,
  updatedAt: timestamp
}
```

## Frontend Integration Patterns

### **🔔 Real-Time Invitation Updates**

```javascript
// Example: Real-time invitation monitoring
const useInvitationUpdates = (userId) => {
  const [invitations, setInvitations] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!userId) return;

    // Listen to received invitations
    const receivedQuery = query(
      collection(db, 'invitations'),
      where('toUserId', '==', userId),
      where('status', '==', 'pending'),
      orderBy('sentAt', 'desc')
    );

    const unsubscribe = onSnapshot(receivedQuery, (snapshot) => {
      const newInvitations = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      setInvitations(newInvitations);
      setUnreadCount(newInvitations.filter(inv => !inv.read).length);
    });

    return unsubscribe;
  }, [userId]);

  return { invitations, unreadCount };
};
```

### **👥 Contact List Management**

```javascript
// Example: Contact list with search and filtering
const ContactList = () => {
  const [contacts, setContacts] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [trustFilter, setTrustFilter] = useState('all');
  const [loading, setLoading] = useState(false);

  const fetchContacts = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        search: searchTerm,
        trustLevel: trustFilter === 'all' ? '' : trustFilter,
        sortBy: 'name',
        limit: '50'
      });

      const response = await api.get(`/contact/contacts?${params}`);
      setContacts(response.data.contacts);
    } catch (error) {
      console.error('Failed to fetch contacts:', error);
    } finally {
      setLoading(false);
    }
  };

  // Debounced search
  useEffect(() => {
    const timeoutId = setTimeout(fetchContacts, 300);
    return () => clearTimeout(timeoutId);
  }, [searchTerm, trustFilter]);

  const removeContact = async (contactId) => {
    if (!confirm('Are you sure you want to remove this contact?')) return;

    try {
      await api.delete(`/contact/contacts/${contactId}`);
      setContacts(prev => prev.filter(c => c.id !== contactId));
    } catch (error) {
      console.error('Failed to remove contact:', error);
    }
  };

  return (
    <ContactListInterface
      contacts={contacts}
      loading={loading}
      searchTerm={searchTerm}
      onSearchChange={setSearchTerm}
      trustFilter={trustFilter}
      onTrustFilterChange={setTrustFilter}
      onRemoveContact={removeContact}
    />
  );
};
```

### **📨 Invitation Flow Management**

```javascript
// Example: Complete invitation flow
const InvitationFlow = () => {
  const [step, setStep] = useState('compose'); // 'compose', 'confirm', 'sent'
  const [invitationData, setInvitationData] = useState({});

  const sendInvitation = async (contactEmail, message) => {
    try {
      const response = await api.post('/contact/invite', {
        contactEmail,
        message
      });

      setInvitationData(response.data.invitation);
      setStep('sent');
      
      // Show success notification
      showNotification('Invitation sent successfully!', 'success');
    } catch (error) {
      // Handle specific error cases
      if (error.response?.status === 404) {
        showNotification('User not found with that email', 'error');
      } else if (error.response?.status === 400) {
        showNotification(error.response.data.error, 'warning');
      } else {
        showNotification('Failed to send invitation', 'error');
      }
    }
  };

  const respondToInvitation = async (invitationId, action) => {
    try {
      const response = await api.post('/contact/response', {
        invitationId,
        action
      });

      if (action === 'accept') {
        // Add new contact to local state
        addContactToList(response.data.contact);
        showNotification('Invitation accepted!', 'success');
      } else {
        showNotification('Invitation declined', 'info');
      }
    } catch (error) {
      showNotification('Failed to respond to invitation', 'error');
    }
  };

  return (
    <InvitationInterface
      step={step}
      onSendInvitation={sendInvitation}
      onRespondToInvitation={respondToInvitation}
      invitationData={invitationData}
    />
  );
};
```

## Security & Privacy

### **Privacy Controls**
- Users can only see their own contacts and invitations
- Email addresses are only shared upon mutual consent
- Contact removal is immediate and bilateral
- Transaction history sharing is controlled by privacy settings

### **Anti-Spam Measures**
- Rate limiting on invitation sending (5 per hour per user)
- Invitation expiration (30 days)
- User blocking and reporting capabilities
- Automatic spam detection for invitation messages

### **Data Protection**
- Contact data is encrypted at rest
- Personal information is only shared between connected users
- Users can export their contact data
- Contact removal permanently deletes shared data

## Testing Integration

### **Contact Management Testing**

```javascript
// Mock contact operations for testing
const mockContactAPI = {
  sendInvitation: jest.fn().mockResolvedValue({
    invitation: { id: 'test-invitation-id', status: 'pending' }
  }),
  
  respondToInvitation: jest.fn().mockResolvedValue({
    contact: { id: 'test-contact-id', status: 'active' }
  }),
  
  removeContact: jest.fn().mockResolvedValue({
    message: 'Contact removed successfully'
  })
};

// Test invitation flow
test('should send invitation successfully', async () => {
  const result = await mockContactAPI.sendInvitation('test@example.com', 'Hello!');
  expect(result.invitation.status).toBe('pending');
});
```

## Performance Optimization

### **Frontend Optimization Tips**
1. **Pagination**: Always paginate contact lists for large networks
2. **Search Debouncing**: Debounce search queries to reduce API calls
3. **Caching**: Cache contact data for offline access
4. **Real-time Updates**: Use Firestore listeners for live invitation updates
5. **Lazy Loading**: Implement lazy loading for contact details

### **Data Synchronization**
```javascript
// Example: Efficient contact synchronization
const syncContactData = async () => {
  const lastSyncTime = localStorage.getItem('lastContactSync');
  const params = lastSyncTime ? { updatedAfter: lastSyncTime } : {};
  
  const response = await api.get('/contact/contacts', { params });
  
  // Update local cache
  updateLocalContactCache(response.data.contacts);
  localStorage.setItem('lastContactSync', new Date().toISOString());
};
```

---

**Critical Frontend Integration Notes**:

1. **Real-Time Updates**: Use Firestore listeners for invitation and contact updates
2. **Search & Discovery**: Implement efficient user search with suggestions
3. **Privacy Awareness**: Respect user privacy settings throughout the UI
4. **Trust Indicators**: Show clear trust levels and transaction history
5. **Bulk Operations**: Enable efficient management of large contact lists
6. **Mobile Optimization**: Ensure contact features work well on mobile devices
7. **Offline Support**: Cache contact data for offline access
8. **Security Validation**: Validate all user inputs and handle edge cases 