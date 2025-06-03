# Multi-Network Wallet Detection & Backend Integration Guide

This guide documents the comprehensive multi-network wallet detection system and its integration with the backend API.

## Overview

The system automatically detects wallet providers across multiple blockchain networks using window injection and standard protocols, then seamlessly integrates with the backend for persistent storage and management.

## Supported Networks & Wallets

### EVM Networks
- **Ethereum** (mainnet, testnets)
- **Polygon** (MATIC)
- **Binance Smart Chain** (BSC)
- **Arbitrum**
- **Optimism**

**Supported EVM Wallets:**
- MetaMask (EIP-6963 + legacy detection)
- Coinbase Wallet
- Brave Wallet
- Trust Wallet
- Opera Wallet
- Frame
- 1inch Wallet
- Exodus
- Any EIP-6963 compatible wallet

### Solana Network
**Supported Solana Wallets:**
- Phantom
- Solflare
- Slope
- Torus
- Coin98
- Clover

### Bitcoin Network
**Supported Bitcoin Wallets:**
- Unisat
- Xverse
- Hiro Wallet
- Leather
- OKX Wallet

## Architecture

### Frontend Components

#### 1. WalletDetectionService (`frontend/services/wallet-detection.ts`)
```typescript
import { walletDetectionService } from '@/services/wallet-detection'

// Detect all available wallets
const detected = await walletDetectionService.detectAllWallets()
console.log(detected) // { evmWallets: [], solanaWallets: [], bitcoinWallets: [] }

// Check if specific wallet is available
const hasMetaMask = walletDetectionService.isWalletAvailable('MetaMask', 'ethereum')
```

#### 2. WalletContext (`frontend/context/wallet-context.tsx`)
React context providing wallet state management and multi-network connection capabilities.

```typescript
import { useWallet } from '@/context/wallet-context'

function MyComponent() {
  const {
    detectedWallets,
    connectedWallets,
    connectWallet,
    connectSolanaWallet,
    connectBitcoinWallet,
    refreshWalletDetection
  } = useWallet()
  
  // Connect to EVM wallet
  const handleConnect = async () => {
    const provider = detectedWallets.evmWallets[0].provider
    await connectWallet(provider, 'ethereum', 'MetaMask')
  }
  
  // Connect to Solana wallet
  const handleSolanaConnect = async () => {
    const wallet = detectedWallets.solanaWallets[0]
    await connectSolanaWallet(wallet)
  }
  
  // Connect to Bitcoin wallet
  const handleBitcoinConnect = async () => {
    const wallet = detectedWallets.bitcoinWallets[0]
    await connectBitcoinWallet(wallet)
  }
}
```

#### 3. WalletApiService (`frontend/services/wallet-api.ts`)
Service layer for backend communication.

```typescript
import { walletApi } from '@/services/wallet-api'

// Send detection data to backend
await walletApi.sendWalletDetection(detectedWallets)

// Register wallet with backend
await walletApi.registerWallet(connectedWallet)

// Get user's wallets from backend
const wallets = await walletApi.getConnectedWallets()
```

### Backend Components

#### 1. Wallet Routes (`src/api/routes/wallet/walletRoutes.js`)
RESTful API endpoints for wallet management:

- `POST /api/wallets/register` - Register/update wallet
- `GET /api/wallets` - Get user's wallets
- `DELETE /api/wallets/:address` - Remove wallet
- `PUT /api/wallets/primary` - Set primary wallet
- `PUT /api/wallets/balance` - Update wallet balance
- `GET /api/wallets/preferences` - Get wallet preferences
- `POST /api/wallets/detection` - Receive detection data

#### 2. Multi-Network Address Validation
The backend validates addresses for different networks:

```javascript
// EVM networks (Ethereum, Polygon, BSC, etc.)
if (!isAddress(address)) {
  return { valid: false, error: 'Invalid EVM wallet address' }
}

// Solana addresses (base58, 32-44 characters)
if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) {
  return { valid: false, error: 'Invalid Solana wallet address' }
}

// Bitcoin addresses (P2PKH, P2SH, Bech32)
const bitcoinRegex = /^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,59}$/
if (!bitcoinRegex.test(address)) {
  return { valid: false, error: 'Invalid Bitcoin wallet address' }
}
```

## Data Flow

### 1. Wallet Detection Flow
```
Browser Page Load
    ↓
WalletDetectionService.detectAllWallets()
    ↓
Detect EVM wallets (EIP-6963 + window.ethereum)
Detect Solana wallets (window.phantom.solana, etc.)
Detect Bitcoin wallets (window.unisat, etc.)
    ↓
Store in React Context
    ↓
Send detection data to backend (/api/wallets/detection)
    ↓
Backend stores detection metrics in user profile
```

### 2. Wallet Connection Flow
```
User clicks "Connect Wallet"
    ↓
Frontend calls wallet.connect()
    ↓
Wallet provider returns address/public key
    ↓
Frontend stores in local state + localStorage
    ↓
Frontend calls API (/api/wallets/register)
    ↓
Backend validates address and stores in Firestore
    ↓
Success response returned to frontend
```

### 3. Data Synchronization Flow
```
Frontend loads from localStorage
    ↓
Frontend calls API (/api/wallets)
    ↓
Backend returns user's wallets from Firestore
    ↓
Frontend merges and updates localStorage
    ↓
React context updated with latest data
```

## Database Schema

### User Document (Firestore)
```javascript
{
  uid: "user-123",
  email: "user@example.com",
  wallets: [
    {
      address: "0x742d35Cc6aB8C5532105c4b8aB4f8e7cd4c3cAcE",
      name: "MetaMask",
      network: "ethereum",
      isPrimary: true,
      addedAt: "2024-01-01T00:00:00Z",
      balance: "1.2345"
    },
    {
      address: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
      name: "Phantom",
      network: "solana",
      isPrimary: false,
      publicKey: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
      addedAt: "2024-01-01T00:00:00Z",
      balance: "10.5000"
    }
  ],
  lastWalletDetection: {
    timestamp: "2024-01-01T00:00:00Z",
    evmWallets: 3,
    solanaWallets: 1,
    bitcoinWallets: 2,
    totalDetected: 6
  }
}
```

## API Reference

### POST /api/wallets/register
Register or update a wallet for the authenticated user.

**Request:**
```json
{
  "address": "0x742d35Cc6aB8C5532105c4b8aB4f8e7cd4c3cAcE",
  "name": "MetaMask",
  "network": "ethereum",
  "isPrimary": true,
  "publicKey": "optional-for-solana"
}
```

**Response:**
```json
{
  "message": "Wallet registered successfully",
  "wallet": {
    "address": "0x742d35cc6ab8c5532105c4b8ab4f8e7cd4c3cace",
    "name": "MetaMask",
    "network": "ethereum",
    "isPrimary": true,
    "addedAt": "2024-01-01T00:00:00Z"
  }
}
```

### GET /api/wallets
Get all wallets for the authenticated user.

**Response:**
```json
{
  "wallets": [
    {
      "address": "0x742d35cc6ab8c5532105c4b8ab4f8e7cd4c3cace",
      "name": "MetaMask",
      "network": "ethereum",
      "isPrimary": true,
      "addedAt": "2024-01-01T00:00:00Z",
      "balance": "1.2345"
    }
  ]
}
```

### POST /api/wallets/detection
Send wallet detection data to the backend.

**Request:**
```json
{
  "detectedWallets": {
    "evmWallets": [
      { "name": "MetaMask", "rdns": "io.metamask" }
    ],
    "solanaWallets": [
      { "adapter": { "name": "Phantom" } }
    ],
    "bitcoinWallets": [
      { "name": "Unisat" }
    ]
  }
}
```

## Error Handling

### Frontend Resilience
The frontend is designed to work gracefully even when the backend is unavailable:

- **Wallet Detection**: Always works locally using browser APIs
- **Wallet Connection**: Stores connections in localStorage as fallback
- **Backend Communication**: Uses try/catch with warnings, not failures

### Backend Validation
The backend validates all wallet addresses before storage:

- **EVM addresses**: Uses ethers.js `isAddress()` function
- **Solana addresses**: Validates base58 format and length
- **Bitcoin addresses**: Validates common address formats

## Testing

### Unit Tests
Backend wallet routes are thoroughly tested in `src/api/routes/wallet/__tests__/walletRoutes.test.js`:

- Multi-network wallet registration
- Address validation for all supported networks
- CRUD operations (create, read, update, delete)
- Authentication and authorization
- Error handling

### Integration Tests
Frontend integration tests in `frontend/__tests__/wallet-detection-integration.test.tsx`:

- End-to-end wallet detection flow
- Multi-network wallet connections
- Backend communication
- Error resilience
- State management

### Running Tests
```bash
# Backend tests
npm test src/api/routes/wallet/__tests__/

# Frontend tests
cd frontend
npm test __tests__/wallet-detection-integration.test.tsx
```

## Security Considerations

### Address Validation
- All wallet addresses are validated before storage
- Network-specific validation prevents invalid addresses
- Lowercase normalization ensures consistency

### Authentication
- All API endpoints require Firebase ID token authentication
- User isolation prevents accessing other users' wallets
- Token validation ensures request authenticity

### Data Protection
- Sensitive data (private keys) never stored
- Only public addresses and metadata stored
- Firestore security rules enforce user-level access

## Development Guidelines

### Adding New Network Support

1. **Update Types** (`frontend/types/wallet.ts`):
```typescript
export type BlockchainNetwork = 'ethereum' | 'solana' | 'bitcoin' | 'newnetwork'
```

2. **Add Detection Logic** (`frontend/services/wallet-detection.ts`):
```typescript
private async detectNewNetworkWallets(): Promise<NewNetworkWallet[]> {
  // Detection implementation
}
```

3. **Update Backend Validation** (`src/api/routes/wallet/walletRoutes.js`):
```javascript
case 'newnetwork':
  // Add validation logic
  break;
```

4. **Add Tests**:
- Unit tests for validation
- Integration tests for connection flow

### Adding New Wallet Support

1. **Update Window Types** (`frontend/types/wallet.ts`):
```typescript
declare global {
  interface Window {
    newWallet?: any
  }
}
```

2. **Add Detection Logic**:
```typescript
{
  name: 'New Wallet',
  key: 'newWallet',
  url: 'https://newwallet.com/',
  icon: 'https://newwallet.com/icon.png'
}
```

## Troubleshooting

### Common Issues

1. **Wallet Not Detected**
   - Check if wallet extension is installed and enabled
   - Verify window injection timing (try refreshing page)
   - Check browser console for errors

2. **Connection Failed**
   - Ensure wallet is unlocked
   - Check network connectivity
   - Verify user didn't reject connection

3. **Backend Registration Failed**
   - Check authentication token validity
   - Verify address format is valid for network
   - Check backend logs for detailed error

### Debugging

Enable debug logging:
```javascript
// Frontend
localStorage.setItem('debug', 'wallet:*')

// Backend
DEBUG=wallet:* npm start
```

## Future Enhancements

### Planned Features
- Real-time balance updates
- Transaction history integration
- Hardware wallet support (Ledger, Trezor)
- Additional network support (Avalanche, Fantom)
- Wallet Connect v2 integration
- Multi-sig wallet support

### Performance Optimizations
- Lazy loading of wallet libraries
- Cached detection results
- Batch API requests
- WebSocket for real-time updates

---

## Contributing

When contributing to wallet detection features:

1. **Test thoroughly** across all supported networks
2. **Update documentation** for any new capabilities
3. **Add comprehensive tests** for new functionality
4. **Follow security best practices** for wallet integrations
5. **Ensure backward compatibility** with existing wallets 