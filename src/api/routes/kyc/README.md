# KYC API Routes

This module provides endpoints for Know Your Customer (KYC) and Anti-Money Laundering (AML) verification processes.

## Endpoints

### 1. Start KYC Session
**POST** `/api/kyc/session/start`

Initiates a new KYC verification session for the authenticated user.

**Request Body:**
```json
{
  "requiredLevel": "basic" // Options: "basic", "enhanced", "full"
}
```

**Response:**
```json
{
  "success": true,
  "session": {
    "sessionId": "uuid",
    "requiredLevel": "basic",
    "requiredDocuments": ["identity"],
    "steps": {
      "documentUpload": { "status": "pending", "completedAt": null },
      "livenessCheck": { "status": "pending", "completedAt": null },
      "dataVerification": { "status": "pending", "completedAt": null },
      "amlScreening": { "status": "pending", "completedAt": null }
    },
    "status": "active"
  }
}
```

### 2. Upload Document
**POST** `/api/kyc/document/upload`

Uploads a document for KYC verification.

**Request:** Multipart form data
- `sessionId` (string): KYC session ID
- `documentType` (string): Type of document (passport, drivers_license, national_id, utility_bill, etc.)
- `document` (file): Document file (JPEG, PNG, or PDF, max 10MB)

**Response:**
```json
{
  "success": true,
  "result": {
    "documentId": "uuid",
    "documentType": "passport",
    "status": "pending_verification",
    "extractedData": {
      "fullName": "John Doe",
      "documentNumber": "AB123456",
      "dateOfBirth": "1990-01-01",
      "expiryDate": "2030-01-01"
    },
    "temporaryUrl": "https://...",
    "expiresAt": "2024-01-01T00:00:00Z"
  }
}
```

### 3. Perform Liveness Check
**POST** `/api/kyc/liveness/check`

Performs liveness detection on a selfie image.

**Request Body:**
```json
{
  "sessionId": "uuid",
  "imageData": "base64_encoded_image"
}
```

**Response:**
```json
{
  "success": true,
  "result": {
    "isLive": true,
    "confidence": 0.95,
    "checks": {
      "faceDetected": true,
      "faceSizeValid": true,
      "faceCentered": true,
      "faceQuality": true,
      "expressionNatural": true,
      "landmarksValid": true,
      "lightingConsistent": true
    },
    "selfieUrl": "https://...",
    "sessionUpdated": true
  }
}
```

### 4. Submit Personal Information
**POST** `/api/kyc/personal`

Submits personal information for KYC verification.

**Request Body:**
```json
{
  "sessionId": "uuid",
  "personalInfo": {
    "firstName": "John",
    "lastName": "Doe",
    "dateOfBirth": "1990-01-01",
    "nationality": "US",
    "countryOfResidence": "US",
    "address": "123 Main St, City, State 12345"
  }
}
```

### 5. Get KYC Status
**GET** `/api/kyc/status`

Retrieves the current KYC status for the authenticated user.

**Response:**
```json
{
  "success": true,
  "status": {
    "status": {
      "level": "basic",
      "status": "approved",
      "lastUpdated": "2024-01-01T00:00:00Z",
      "expiryDate": "2025-01-01T00:00:00Z",
      "reviewRequired": false
    },
    "riskProfile": {
      "overallRisk": "low",
      "factors": {
        "geographic": 10,
        "transactional": 5,
        "behavioral": 8,
        "documentary": 12
      }
    },
    "activeSession": null,
    "documents": {
      "identity": {
        "type": "passport",
        "verified": true,
        "uploadedAt": "2024-01-01T00:00:00Z"
      }
    }
  }
}
```

### 6. Complete KYC Session
**POST** `/api/kyc/session/complete`

Completes the KYC verification session and calculates risk score.

**Request Body:**
```json
{
  "sessionId": "uuid"
}
```

**Response:**
```json
{
  "success": true,
  "result": {
    "status": "approved",
    "riskScore": "low",
    "requiresManualReview": false,
    "expiryDate": "2025-01-01T00:00:00Z"
  }
}
```

## Rate Limits

- Start session: 5 requests per hour
- Document upload: 10 requests per 15 minutes
- Liveness check: 20 requests per 5 minutes
- Personal info: 10 requests per hour
- Complete session: 3 requests per hour

## Authentication

All endpoints require authentication via Bearer token in the Authorization header:
```
Authorization: Bearer <jwt_token>
```

## KYC Levels

### Basic
- Required documents: Identity document only
- Transaction limits: $1,000 per transaction, $10,000 per month
- Suitable for: Small transactions, low-risk users

### Enhanced
- Required documents: Identity + Proof of address
- Additional checks: AML screening, liveness verification
- Transaction limits: $10,000 per transaction, $100,000 per month
- Suitable for: Regular users, medium transactions

### Full
- Required documents: All documents + enhanced due diligence
- Additional checks: Source of funds, PEP screening
- Transaction limits: No limits
- Suitable for: High-value transactions, business accounts

## Error Responses

All errors follow this format:
```json
{
  "success": false,
  "error": "Error message"
}
```

Common HTTP status codes:
- 400: Bad Request (missing or invalid parameters)
- 401: Unauthorized (invalid or missing token)
- 403: Forbidden (insufficient permissions)
- 429: Too Many Requests (rate limit exceeded)
- 500: Internal Server Error

## Security Notes

1. All documents are encrypted at rest using AES-256-GCM
2. Documents are automatically deleted after 90 days
3. Signed URLs expire after 24 hours by default
4. All uploads are scanned for file type validation
5. Duplicate documents are detected and rejected
6. All actions are logged for compliance auditing