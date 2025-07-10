# Firestore Indexes Required

This document lists all composite indexes required for the CryptoEscrow backend to function properly.

## Required Indexes

### 1. Contact Invitations Index
**Collection:** `contactInvitations`

**Fields:**
- `receiverId` (Ascending)
- `status` (Ascending) 
- `createdAt` (Descending)

**Purpose:** Used by the `/contact/pending` endpoint to efficiently query pending invitations for a user, ordered by creation time.

**Query Pattern:**
```javascript
db.collection('contactInvitations')
  .where('receiverId', '==', userId)
  .where('status', '==', 'pending')
  .orderBy('createdAt', 'desc')
```

## How to Create Indexes

### Option 1: Firebase Console (Recommended)
1. Go to the [Firebase Console](https://console.firebase.google.com)
2. Select your project
3. Navigate to Firestore Database → Indexes
4. Click "Create Index"
5. Enter the collection and fields as specified above
6. Click "Create"

### Option 2: Firebase CLI
1. Update your `firestore.indexes.json` file:
```json
{
  "indexes": [
    {
      "collectionGroup": "contactInvitations",
      "queryScope": "COLLECTION",
      "fields": [
        {
          "fieldPath": "receiverId",
          "order": "ASCENDING"
        },
        {
          "fieldPath": "status",
          "order": "ASCENDING"
        },
        {
          "fieldPath": "createdAt",
          "order": "DESCENDING"
        }
      ]
    }
  ]
}
```

2. Deploy indexes:
```bash
firebase deploy --only firestore:indexes
```

### Option 3: Automatic Creation
When you run the query for the first time, Firebase will throw an error with a direct link to create the required index. Click the link and confirm.

## Testing with Emulators

When using Firebase Emulators (`NODE_ENV=test`), indexes are not required and all queries will work without configuration.

## Additional Notes

- Index creation can take several minutes
- Indexes consume storage quota
- Consider index costs when designing queries
- Always test queries in development before production