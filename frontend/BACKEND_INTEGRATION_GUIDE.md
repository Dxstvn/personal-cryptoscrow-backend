# Frontend Backend Integration Guide

## Overview

This guide outlines what the frontend needs to implement to fully utilize the CryptoEscrow backend API. The backend provides extensive functionality including cross-chain transactions, wallet management, contact management, and real-time updates that the frontend should leverage.

## Critical Issues to Fix First

### 1. API Endpoint Mismatch
**Current Issue**: Frontend is calling `/deals/` endpoints but backend uses `/transaction/`

**Required Changes**:
```typescript
// frontend/services/transaction-api.ts
// Change from:
const API_URL = "http://44.202.141.56:3000"
fetch(`${API_URL}/deals/create`, ...)

// To:
const API_URL = "http://44.202.141.56:3000"
fetch(`${API_URL}/transaction/create`, ...)
```

**Update all transaction endpoints**:
- `/deals/create` → `/transaction/create`
- `/deals` → `/transaction`
- `/deals/${id}` → `/transaction/${id}`
- All other transaction routes need the correct prefix

### 2. Missing Authentication Header
**Issue**: Some API calls may not include proper authentication

**Required Implementation**:
```typescript
// Add to all API calls
headers: {
  'Authorization': `Bearer ${idToken}`,
  'Content-Type': 'application/json'
}
```

## Missing Backend Integrations

### 1. Cross-Chain Transaction Support

**Backend Capabilities**:
- Automatic cross-chain detection
- Bridge fee estimation
- Multi-step transaction execution
- Network compatibility checking

**Frontend Implementation Needed**:

```typescript
// frontend/services/cross-chain-api.ts
export class CrossChainTransactionService {
  
  // Estimate fees before transaction
  async estimateCrossChainFees(sourceNetwork: string, targetNetwork: string, amount: string) {
    return fetch(`${API_URL}/transaction/cross-chain/estimate-fees?sourceNetwork=${sourceNetwork}&targetNetwork=${targetNetwork}&amount=${amount}`, {
      headers: { 'Authorization': `Bearer ${await getIdToken()}` }
    });
  }

  // Execute cross-chain transaction step
  async executeCrossChainStep(dealId: string, stepNumber: number, txHash?: string) {
    return fetch(`${API_URL}/transaction/cross-chain/${dealId}/execute-step`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${await getIdToken()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ stepNumber, txHash })
    });
  }

  // Get cross-chain transaction status
  async getCrossChainStatus(dealId: string) {
    return fetch(`${API_URL}/transaction/cross-chain/${dealId}/status`, {
      headers: { 'Authorization': `Bearer ${await getIdToken()}` }
    });
  }

  // Handle cross-chain fund transfer
  async executeCrossChainTransfer(dealId: string, fromTxHash: string, bridgeTxHash?: string) {
    return fetch(`${API_URL}/transaction/cross-chain/${dealId}/transfer`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${await getIdToken()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ fromTxHash, bridgeTxHash })
    });
  }
}
```

**UI Components Needed**:
```typescript
// frontend/components/cross-chain-transaction-stepper.tsx
export function CrossChainTransactionStepper({ dealId, crossChainInfo }) {
  // Show step-by-step progress
  // Allow users to execute each step
  // Display bridge information and fees
  // Handle different network requirements
}

// frontend/components/network-fee-estimator.tsx
export function NetworkFeeEstimator({ sourceNetwork, targetNetwork, amount }) {
  // Show estimated fees for cross-chain transactions
  // Display bridge information
  // Warn about time requirements
}
```

### 2. Complete Wallet Management

**Backend Capabilities**:
- Multi-network wallet registration
- Cross-chain wallet detection
- Wallet preferences management
- Balance tracking

**Frontend Implementation Needed**:

```typescript
// Update frontend/services/wallet-api.ts to include:

export class WalletApiService {
  // Register detected wallet with backend
  async registerWallet(wallet: ConnectedWallet) {
    return fetch(`${API_URL}/wallet/register`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${await getIdToken()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        address: wallet.address,
        name: wallet.name,
        network: wallet.network,
        publicKey: wallet.publicKey,
        isPrimary: wallet.isPrimary
      })
    });
  }

  // Get all registered wallets from backend
  async getRegisteredWallets() {
    return fetch(`${API_URL}/wallet`, {
      headers: { 'Authorization': `Bearer ${await getIdToken()}` }
    });
  }

  // Remove wallet from backend
  async removeWallet(address: string, network: string) {
    return fetch(`${API_URL}/wallet/${address}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${await getIdToken()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ network })
    });
  }

  // Set primary wallet
  async setPrimaryWallet(address: string, network: string) {
    return fetch(`${API_URL}/wallet/primary`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${await getIdToken()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ address, network })
    });
  }

  // Update wallet balance
  async updateWalletBalance(address: string, network: string, balance: string) {
    return fetch(`${API_URL}/wallet/balance`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${await getIdToken()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ address, network, balance })
    });
  }

  // Get wallet preferences
  async getWalletPreferences() {
    return fetch(`${API_URL}/wallet/preferences`, {
      headers: { 'Authorization': `Bearer ${await getIdToken()}` }
    });
  }

  // Send wallet detection data
  async sendWalletDetection(detectedWallets: any) {
    return fetch(`${API_URL}/wallet/detection`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${await getIdToken()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ detectedWallets })
    });
  }
}
```

### 3. Real-Time Updates with Firestore

**Backend Capability**: Firestore real-time listeners for live updates

**Frontend Implementation Needed**:

```typescript
// frontend/hooks/use-real-time-deal.ts
import { useEffect, useState } from 'react';
import { onSnapshot, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase-client';

export function useRealTimeDeal(dealId: string) {
  const [deal, setDeal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!dealId) return;

    const unsubscribe = onSnapshot(
      doc(db, 'deals', dealId),
      (snapshot) => {
        if (snapshot.exists()) {
          setDeal({ id: snapshot.id, ...snapshot.data() });
        } else {
          setError('Deal not found');
        }
        setLoading(false);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [dealId]);

  return { deal, loading, error };
}

// frontend/hooks/use-real-time-deals.ts
export function useRealTimeDeals(userId: string) {
  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      query(
        collection(db, 'deals'),
        where('participants', 'array-contains', userId),
        orderBy('updatedAt', 'desc')
      ),
      (snapshot) => {
        const dealsData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setDeals(dealsData);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [userId]);

  return { deals, loading };
}
```

### 4. Complete Contact Management

**Backend Capabilities**:
- Send invitations
- Accept/decline invitations
- List contacts and pending invitations
- Remove contacts

**Frontend Integration Status**: ✅ **Already Implemented** in `frontend/services/contacts-api.ts`

**Additional UI Needed**:
```typescript
// frontend/components/contact-invitation-notification.tsx
export function ContactInvitationNotification() {
  // Real-time notification for new invitations
  // Quick accept/decline actions
}
```

### 5. File Management with Encryption

**Backend Capabilities**:
- Encrypted file upload/download
- File association with deals
- Secure file sharing between participants

**Frontend Implementation Needed**:

```typescript
// frontend/services/file-api.ts
export class FileApiService {
  
  async uploadFile(file: File, dealId: string, documentType?: string) {
    // Encrypt file before upload
    const { encryptedBlob, encryptionKey } = await encryptFile(file);
    
    const formData = new FormData();
    formData.append('file', encryptedBlob);
    formData.append('dealId', dealId);
    formData.append('encryptionKey', encryptionKey);
    if (documentType) formData.append('documentType', documentType);

    return fetch(`${API_URL}/files/upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${await getIdToken()}`
      },
      body: formData
    });
  }

  async downloadFile(dealId: string, fileId: string, encryptionKey: string) {
    const response = await fetch(`${API_URL}/files/download/${dealId}/${fileId}`, {
      headers: { 'Authorization': `Bearer ${await getIdToken()}` }
    });
    
    const encryptedBlob = await response.blob();
    return await decryptFile(encryptedBlob, encryptionKey);
  }

  async getFileList() {
    return fetch(`${API_URL}/files/my-deals`, {
      headers: { 'Authorization': `Bearer ${await getIdToken()}` }
    });
  }
}
```

### 6. Enhanced Transaction Lifecycle Management

**Backend Capabilities**:
- Sophisticated transaction states
- Automated deadline management
- Smart contract synchronization
- Dispute handling

**Frontend Implementation Needed**:

```typescript
// frontend/components/transaction-lifecycle-manager.tsx
export function TransactionLifecycleManager({ transaction }) {
  // Handle all transaction states properly
  // Show deadline countdowns
  // Guide users through each step
  // Handle automated processes
  
  const handleStateTransition = async (newState: string) => {
    switch (newState) {
      case 'IN_FINAL_APPROVAL':
        // Start final approval period
        await startFinalApproval(transaction.id, calculateDeadline());
        break;
      case 'IN_DISPUTE':
        // Raise dispute
        await raiseDispute(transaction.id, calculateDisputeDeadline());
        break;
      // Handle other states...
    }
  };
}

// frontend/components/deadline-countdown.tsx
export function DeadlineCountdown({ deadline, onExpiry }) {
  // Show countdown timer
  // Warn users of upcoming deadlines
  // Handle automatic actions
}

// frontend/components/condition-manager.tsx
export function ConditionManager({ dealId, conditions, userRole }) {
  // Allow users to mark conditions as fulfilled
  // Show progress to all participants
  // Handle cross-chain conditions specially
  
  const updateCondition = async (conditionId: string, status: string, notes?: string) => {
    if (condition.type === 'CROSS_CHAIN') {
      // Handle cross-chain condition updates
      await fetch(`${API_URL}/transaction/cross-chain/${dealId}/conditions/${conditionId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${await getIdToken()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status, notes })
      });
    } else {
      // Handle regular condition updates
      await updateConditionStatus(dealId, conditionId, status, notes || '');
    }
  };
}
```

## Required UI/UX Improvements

### 1. Cross-Chain Transaction Flow
```typescript
// frontend/components/cross-chain-transaction-wizard.tsx
export function CrossChainTransactionWizard() {
  // Step 1: Network Detection & Fee Estimation
  // Step 2: Transaction Preparation
  // Step 3: Step-by-Step Execution
  // Step 4: Confirmation & Tracking
}
```

### 2. Real-Time Notifications
```typescript
// frontend/components/real-time-notifications.tsx
export function RealTimeNotificationSystem() {
  // Deal status changes
  // New contact invitations
  // Deadline warnings
  // Cross-chain step completions
}
```

### 3. Smart Contract State Display
```typescript
// frontend/components/smart-contract-status.tsx
export function SmartContractStatus({ transaction }) {
  // Show on-chain vs off-chain status
  // Display contract address and details
  // Handle automated processes
}
```

## Security & Error Handling

### 1. Token Management
```typescript
// frontend/lib/api-client.ts
export class ApiClient {
  private async getAuthHeaders() {
    const token = await getIdToken();
    if (!token) throw new Error('Not authenticated');
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
  }

  async request(endpoint: string, options: RequestInit = {}) {
    try {
      const response = await fetch(`${API_URL}${endpoint}`, {
        ...options,
        headers: {
          ...await this.getAuthHeaders(),
          ...options.headers
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'API request failed');
      }

      return await response.json();
    } catch (error) {
      // Handle different types of errors appropriately
      if (error.message.includes('expired')) {
        // Handle token refresh
      }
      throw error;
    }
  }
}
```

### 2. Input Validation
```typescript
// frontend/lib/validation.ts
export class TransactionValidator {
  static validateCrossChainTransaction(data: any) {
    // Validate wallet addresses for different networks
    // Validate amounts and currencies
    // Check network compatibility
  }

  static validateWalletAddress(address: string, network: string) {
    // Network-specific address validation
    switch (network) {
      case 'ethereum':
        return /^0x[a-fA-F0-9]{40}$/.test(address);
      case 'solana':
        return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
      case 'bitcoin':
        return /^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,59}$/.test(address);
      default:
        return false;
    }
  }
}
```

## Performance Optimizations

### 1. Caching Strategy
```typescript
// frontend/hooks/use-cached-data.ts
export function useCachedDeals() {
  // Cache deal data with TTL
  // Invalidate on real-time updates
  // Optimize network requests
}
```

### 2. Lazy Loading
```typescript
// frontend/components/transaction-details-lazy.tsx
export const TransactionDetailsLazy = lazy(() => import('./transaction-details'));
```

## Testing Requirements

### 1. API Integration Tests
```typescript
// frontend/__tests__/api-integration.test.ts
describe('Backend API Integration', () => {
  test('should create cross-chain transaction', async () => {
    // Test cross-chain transaction creation
  });
  
  test('should handle real-time updates', async () => {
    // Test Firestore listeners
  });
  
  test('should manage wallet registration', async () => {
    // Test wallet API integration
  });
});
```

### 2. Cross-Chain Flow Tests
```typescript
// frontend/__tests__/cross-chain-flow.test.ts
describe('Cross-Chain Transaction Flow', () => {
  test('should estimate fees correctly', async () => {
    // Test fee estimation
  });
  
  test('should execute multi-step transaction', async () => {
    // Test step execution
  });
});
```

## Deployment Configuration

### 1. Environment Variables
```env
# frontend/.env.production
NEXT_PUBLIC_API_URL=https://api.cryptoescrow.com
NEXT_PUBLIC_FIREBASE_CONFIG=...
NEXT_PUBLIC_ENABLE_CROSS_CHAIN=true
```

### 2. Build Configuration
```typescript
// frontend/next.config.js
module.exports = {
  // Optimize for backend integration
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.BACKEND_URL}/:path*`
      }
    ];
  }
};
```

## Summary of Critical Actions

1. **Fix API endpoints** - Update all `/deals/` to `/transaction/`
2. **Implement cross-chain support** - Add cross-chain transaction UI and API calls
3. **Add real-time listeners** - Implement Firestore real-time updates for all data
4. **Complete wallet management** - Integrate full wallet API functionality
5. **Enhance file management** - Add encryption/decryption support
6. **Improve error handling** - Add comprehensive error handling and validation
7. **Add notifications** - Implement real-time notifications for all events
8. **Test thoroughly** - Add comprehensive testing for all new integrations

The backend provides extensive functionality that the frontend should leverage to create a complete, production-ready application. 