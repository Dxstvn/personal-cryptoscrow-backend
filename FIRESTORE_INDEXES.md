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

### 2. KYC Status Index
**Collection:** `users`

**Fields:**
- `kycStatus.status` (Ascending)
- `kycStatus.lastUpdated` (Descending)

**Purpose:** Query users by KYC status, ordered by last update time.

### 3. KYC Level and Risk Index
**Collection:** `users`

**Fields:**
- `kycStatus.level` (Ascending)
- `riskProfile.overallRisk` (Ascending)

**Purpose:** Query users by KYC level and risk profile for compliance monitoring.

### 4. Manual Review Queue Index
**Collection:** `users`

**Fields:**
- `riskProfile.requiresManualReview` (Ascending)
- `kycStatus.lastUpdated` (Descending)

**Purpose:** Efficiently query users requiring manual KYC review.

### 5. KYC Sessions by User Index
**Collection:** `kycSessions`

**Fields:**
- `userId` (Ascending)
- `startedAt` (Descending)

**Purpose:** Query KYC sessions for a specific user.

### 6. KYC Sessions by Status Index
**Collection:** `kycSessions`

**Fields:**
- `status` (Ascending)
- `startedAt` (Descending)

**Purpose:** Query active or abandoned KYC sessions.

### 7. Compliance Audits by User Index
**Collection:** `complianceAudits`

**Fields:**
- `userId` (Ascending)
- `timestamp` (Descending)

**Purpose:** Query audit history for a specific user.

### 8. Compliance Audits by Action Index
**Collection:** `complianceAudits`

**Fields:**
- `action` (Ascending)
- `timestamp` (Descending)

**Purpose:** Query audits by specific actions (e.g., manual reviews).

### 9. AML Watchlists Index
**Collection:** `amlWatchlists`

**Fields:**
- `listType` (Ascending)
- `source` (Ascending)

**Purpose:** Efficiently query specific watchlist types and sources.

### 10. Document Hash Index
**Collection:** `documentHashes`

**Fields:**
- `hash` (Ascending)

**Purpose:** Check for document reuse across accounts.

## How to Create Indexes

### Option 1: Firebase Console (Recommended)
1. Go to the [Firebase Console](https://console.firebase.google.com)
2. Select your project
3. Navigate to Firestore Database → Indexes
4. Click "Create Index"
5. Enter the collection and fields as specified above
6. Click "Create"

### Option 2: Firebase CLI
1. Update your `firestore.indexes.json` file with all required indexes:
```json
{
  "indexes": [
    {
      "collectionGroup": "contactInvitations",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "receiverId", "order": "ASCENDING" },
        { "fieldPath": "status", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "users",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "kycStatus.status", "order": "ASCENDING" },
        { "fieldPath": "kycStatus.lastUpdated", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "users",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "kycStatus.level", "order": "ASCENDING" },
        { "fieldPath": "riskProfile.overallRisk", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "users",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "riskProfile.requiresManualReview", "order": "ASCENDING" },
        { "fieldPath": "kycStatus.lastUpdated", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "kycSessions",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "userId", "order": "ASCENDING" },
        { "fieldPath": "startedAt", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "kycSessions",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "status", "order": "ASCENDING" },
        { "fieldPath": "startedAt", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "complianceAudits",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "userId", "order": "ASCENDING" },
        { "fieldPath": "timestamp", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "complianceAudits",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "action", "order": "ASCENDING" },
        { "fieldPath": "timestamp", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "amlWatchlists",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "listType", "order": "ASCENDING" },
        { "fieldPath": "source", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "documentHashes",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "hash", "order": "ASCENDING" }
      ]
    }
  ],
  "fieldOverrides": []
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