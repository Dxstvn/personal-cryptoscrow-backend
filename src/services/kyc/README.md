# KYC/AML Implementation

## Phase 1.1 Completed: Database Schema Updates

This phase implements the foundational database schema for KYC/AML compliance in the ClearHold platform.

### What Was Implemented

#### 1. **User Collection Enhancement**
Updated the `users` collection with comprehensive KYC/AML fields:

- **kycStatus**: Tracks verification level (none/basic/enhanced/full) and status
- **kycDocuments**: Stores document references and extracted data
  - Identity document (passport/license/ID)
  - Proof of address
  - Selfie for liveness verification
- **amlStatus**: Anti-money laundering screening results
  - Sanctions checking
  - PEP (Politically Exposed Person) status
  - Adverse media screening
- **verificationHistory**: Audit trail of all verification events
- **riskProfile**: Risk assessment and manual review flags

#### 2. **New Collections Created**

- **kycSessions**: Tracks individual KYC verification sessions
- **amlWatchlists**: Caches sanctions and watchlist data
- **complianceAudits**: Records all compliance-related actions
- **documentHashes**: Prevents document reuse across accounts

#### 3. **Integration Points**

- Modified `loginSignUp.js` to include KYC fields for new user registrations
- Updated both email/password and Google sign-in flows
- Created migration scripts for existing users

#### 4. **Database Indexes**

Added 10 composite indexes for efficient querying:
- KYC status and review queues
- Compliance audit trails
- Document hash lookups
- Session management

### File Structure

```
src/services/kyc/
├── README.md                    # This file
├── schemas/
│   └── kycSchemas.js           # Schema definitions
├── migrations/
│   └── addKYCFields.js         # Migration helpers
└── config/
    └── firestoreIndexes.json   # Index configurations

src/scripts/
└── setupKYCDatabase.js         # Setup script
```

### Running the Migration

To set up the KYC database schema:

```bash
# Run the setup script
node src/scripts/setupKYCDatabase.js
```

This will:
1. Create all required collections with sample documents
2. Add KYC fields to existing users
3. Set up proper defaults for all fields

### Schema Details

#### KYC Levels and Requirements

- **Basic**: Identity document only, <$1,000 per transaction
- **Enhanced**: ID + proof of address + AML screening, <$10,000 per transaction  
- **Full**: All documents + enhanced due diligence, no limits

#### Risk Scoring

Risk is calculated based on:
- Geographic factors (country risk)
- Transaction patterns
- Document quality
- AML screening results

### Next Steps

Phase 1.2 will implement:
- Core KYC orchestrator service
- Document processing with OCR
- Face verification services
- AML screening integration

### Important Notes

1. **Privacy**: All sensitive data fields are marked for encryption
2. **Compliance**: Audit trail maintained for all actions
3. **Performance**: Indexes optimized for common query patterns
4. **Extensibility**: Schema supports multiple document types and verification methods