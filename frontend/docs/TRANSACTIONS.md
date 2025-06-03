# CryptoEscrow Transactions Feature

## Overview

The Transactions feature is the core functionality of the CryptoEscrow platform, enabling secure property transactions between buyers and sellers using blockchain technology. This document provides a comprehensive guide to the transactions system, including its workflow, technical implementation, and customization options.

## Two-Stage Transaction Process

The CryptoEscrow platform implements a sophisticated two-stage transaction process that accommodates both seller-initiated and buyer-initiated transactions, ensuring flexibility and security for all parties involved.

### Seller-Initiated Transaction Flow

1. **Transaction Creation**: 
   - Seller creates a transaction with property details, price, and initial conditions
   - System assigns status `PENDING_BUYER_REVIEW`
   - Buyer receives notification to review the transaction

2. **Buyer Review**:
   - Buyer reviews property details and price
   - Buyer can add or modify conditions (title deeds, inspections, appraisals)
   - Buyer confirms review, status changes to `AWAITING_FUNDS`

3. **Fund Deposit**:
   - Buyer deposits funds into the smart contract
   - System updates status to `AWAITING_SELLER_CONFIRMATION`
   - Seller receives notification of fund deposit

4. **Seller Confirmation**:
   - Seller reviews and confirms buyer's conditions
   - Smart contract is deployed with agreed conditions
   - Status changes to `IN_ESCROW`

5. **Condition Fulfillment**:
   - Seller provides required documentation
   - Buyer verifies and approves each condition
   - When all conditions are met, status changes to `READY_FOR_FINAL_APPROVAL`

6. **Final Approval Period**:
   - A fixed-duration countdown begins (typically 48 hours)
   - Buyer can raise disputes during this period
   - If no disputes, funds are released to seller at end of period

7. **Transaction Completion**:
   - Funds are released to seller
   - Status changes to `COMPLETED`
   - Transaction record is maintained for reference

### Buyer-Initiated Transaction Flow

1. **Transaction Creation**:
   - Buyer creates transaction with property details, price, and conditions
   - Buyer deposits funds into smart contract
   - Status is set to `AWAITING_SELLER_CONFIRMATION`

2. **Seller Confirmation**:
   - Seller reviews transaction details and conditions
   - Seller accepts or rejects conditions
   - Upon acceptance, status changes to `IN_ESCROW`

3. **Condition Fulfillment** through **Transaction Completion**:
   - Same as steps 5-7 in the Seller-Initiated flow

## Transaction Statuses

The system tracks transactions through various statuses that reflect their current state:

| Status | Description |
|--------|-------------|
| `PENDING_BUYER_REVIEW` | Transaction created by seller, awaiting buyer review |
| `AWAITING_FUNDS` | Buyer has reviewed and accepted, needs to deposit funds |
| `AWAITING_SELLER_CONFIRMATION` | Funds deposited, waiting for seller to confirm conditions |
| `IN_ESCROW` | Both parties have agreed, funds are in escrow |
| `PENDING_CONDITIONS` | Waiting for conditions to be fulfilled |
| `READY_FOR_FINAL_APPROVAL` | All conditions met, ready for final approval period |
| `IN_FINAL_APPROVAL` | Final approval period active (typically 48 hours) |
| `IN_DISPUTE` | Buyer has raised a dispute |
| `COMPLETED` | Transaction successfully completed, funds released |
| `CANCELLED` | Transaction cancelled, funds returned to buyer |

## Condition Types

The platform supports various condition types that can be added to transactions:

1. **Title Deed Verification**: Confirmation that the property title is clear and verified
2. **Property Inspection**: Verification that the property has passed inspection
3. **Property Appraisal**: Confirmation that the property has been appraised at the agreed value
4. **Document Submission**: Various legal documents required for the transaction
5. **Custom Conditions**: User-defined conditions specific to the transaction

## Document Management

Documents related to transaction conditions can be uploaded, stored, and verified:

1. **Upload**: Users can upload documents to fulfill conditions
2. **Storage**: Documents are securely stored in Google Cloud Storage
3. **Verification**: The counterparty can review and verify uploaded documents
4. **Access Control**: Only transaction participants can access the documents

## Technical Implementation

### Data Model

The transaction system uses the following data model:

\`\`\`typescript
interface Transaction {
  id: string;
  propertyAddress: string;
  amount: number;
  currency: string;
  status: TransactionStatus;
  initiatedBy: "BUYER" | "SELLER";
  buyerId: string;
  sellerId: string;
  buyerWalletAddress: string;
  sellerWalletAddress: string;
  conditions: Condition[];
  timeline: TimelineEvent[];
  smartContractAddress?: string;
  createdAt: string;
  updatedAt: string;
}

interface Condition {
  id: string;
  type: ConditionType;
  description: string;
  status: "PENDING_BUYER_ACTION" | "FULFILLED_BY_BUYER" | "ACTION_WITHDRAWN_BY_BUYER";
  createdAt: string;
  updatedAt: string;
}

interface TimelineEvent {
  id: string;
  event: string;
  timestamp: string;
  userId?: string;
  status: "completed" | "in_progress" | "pending";
}
\`\`\`

### Component Architecture

The transaction feature is implemented using the following components:

1. **Transaction Context**: Provides global state management and API integration
2. **Transaction Card**: Displays transaction summary in the transactions list
3. **Transaction Stage Indicator**: Visual indicator of transaction status
4. **Transaction Review**: Interface for buyers to review seller-initiated transactions
5. **Seller Confirmation**: Interface for sellers to confirm buyer conditions
6. **Transaction Timeline**: Visual representation of transaction history
7. **Transaction Parties**: Displays information about transaction participants

### State Management

The transaction state is managed through:

1. **Context API**: Global state management for transactions
2. **API Integration**: Communication with backend services
3. **Real-time Updates**: Firestore listeners for live updates
4. **Local State**: Component-level state for UI interactions

## User Experience Considerations

### Role-Based Views

The UI adapts based on the user's role in the transaction:

1. **Buyer View**: 
   - For seller-initiated transactions: Review interface, condition management
   - For buyer-initiated transactions: Transaction monitoring, dispute options

2. **Seller View**:
   - For seller-initiated transactions: Transaction monitoring, document upload
   - For buyer-initiated transactions: Confirmation interface, condition fulfillment

### Notifications

Users receive notifications for important transaction events:

1. **Email Notifications**: For transaction creation, status changes, and deadlines
2. **In-App Notifications**: Real-time updates on transaction progress
3. **Timeline Updates**: Visual record of all transaction events

## Customization and Extension

### Adding New Condition Types

To add a new condition type:

1. Update the `ConditionType` enum in the data model
2. Add UI components for the new condition type
3. Implement backend validation for the new condition type

### Custom Transaction Workflows

The transaction system can be extended with custom workflows:

1. **Multi-Party Transactions**: Adding more participants beyond buyer and seller
2. **Staged Payments**: Implementing milestone-based fund releases
3. **Automated Verification**: Integrating with external verification services

## Troubleshooting

### Common Issues

1. **Transaction Stuck in Status**: Check for pending actions required by either party
2. **Condition Verification Failure**: Ensure documents meet requirements
3. **Smart Contract Deployment Issues**: Verify wallet connections and gas fees

### Error Handling

The system implements comprehensive error handling:

1. **User-Friendly Messages**: Clear explanations of errors
2. **Detailed Logging**: Backend logging for debugging
3. **Recovery Options**: Mechanisms to recover from failed states

## Integration with Other Features

The transaction system integrates with:

1. **Authentication**: User identity verification
2. **Wallet Management**: Blockchain interactions
3. **Contact Management**: Selection of transaction counterparties
4. **Document Storage**: Secure storage and retrieval of transaction documents

## Future Enhancements

Planned enhancements to the transaction system include:

1. **Multi-Currency Support**: Handling transactions in various cryptocurrencies
2. **Advanced Dispute Resolution**: Implementing arbitration mechanisms
3. **Transaction Templates**: Pre-defined transaction types for common scenarios
4. **Blockchain Analytics**: Advanced reporting on transaction metrics

## API Reference

The transaction system interacts with the following API endpoints:

- `POST /transaction/create`: Create a new transaction
- `GET /transaction/list`: List user's transactions
- `GET /transaction/:id`: Get transaction details
- `PUT /transaction/:id/conditions/:conditionId/buyer-review`: Update condition status
- `PUT /transaction/:id/sync-status`: Sync transaction status with blockchain
- `POST /transaction/:id/sc/start-final-approval`: Start final approval period
- `POST /transaction/:id/sc/raise-dispute`: Raise a dispute

For detailed API documentation, refer to the backend API documentation.
