# Wallet Management Routes (`/wallet`)

## Overview

This directory contains API routes for comprehensive wallet management across multiple blockchain networks. The wallet system supports user wallet registration, validation, balance tracking, and network preference management for the CryptoEscrow platform.

**Base Path**: `/wallet`  
**Authentication**: All endpoints require Firebase ID Token (`Authorization: Bearer <TOKEN>`)  
**Purpose**: Enable multi-network wallet management and blockchain interaction

## Core Endpoints

### 1. Register/Update Wallet
**POST** `/wallet/register`

Registers or updates a wallet for the authenticated user.

**Request Body**:
```json
{
  "address": "0x1234567890123456789012345678901234567890",
  "name": "My Primary Ethereum Wallet",
  "network": "ethereum",
  "publicKey": "0x...", // Optional
  "isPrimary": true // Optional
}
```

**Success Response** (201 Created):
```json
{
  "message": "Wallet registered successfully",
  "wallet": {
    "address": "0x1234567890123456789012345678901234567890",
    "name": "My Primary Ethereum Wallet",
    "network": "ethereum",
    "isPrimary": true,
    "addedAt": "2024-01-15T10:00:00.000Z"
  }
}
```

**Supported Networks**:
- **EVM**: `ethereum`, `sepolia`, `polygon`, `polygon-amoy`, `bsc`, `arbitrum`, `arbitrum-sepolia`, `optimism`, `base`
- **Non-EVM**: `solana`, `bitcoin`

**Backend Actions**:
1. Validates wallet address format for the specified network
2. Updates existing wallet or adds new one
3. Sets primary wallet (only one primary allowed)
4. Creates quick lookup field for network

### 2. Get User Wallets
**GET** `/wallet/`

Retrieves all registered wallets for the authenticated user.

**Success Response** (200 OK):
```json
{
  "wallets": [
    {
      "address": "0x1234567890123456789012345678901234567890",
      "name": "My Primary Ethereum Wallet",
      "network": "ethereum",
      "isPrimary": true,
      "addedAt": "2024-01-15T10:00:00.000Z",
      "balance": "1.5",
      "lastBalanceUpdate": "2024-01-15T12:00:00.000Z"
    },
    {
      "address": "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
      "name": "Solana Wallet",
      "network": "solana",
      "isPrimary": false,
      "addedAt": "2024-01-15T11:00:00.000Z"
    }
  ]
}
```

**Notes**:
- Returns all wallets across all networks
- Includes balance information if available
- Shows primary wallet designation

### 3. Get Supported Chains
**GET** `/wallet/chains`

Retrieves information about supported blockchain networks.

**Success Response** (200 OK):
```json
{
  "success": true,
  "chains": [
    {
      "chainId": 1,
      "name": "ethereum",
      "displayName": "Ethereum",
      "explorerUrl": "https://etherscan.io",
      "contractAddress": "0x...",
      "hasStargate": true,
      "hasLayerZero": true,
      "supportedTokens": ["ETH", "USDC", "USDT"]
    },
    {
      "chainId": 42161,
      "name": "arbitrum",
      "displayName": "Arbitrum",
      "explorerUrl": "https://arbiscan.io",
      "contractAddress": "0x...",
      "hasStargate": true,
      "hasLayerZero": true,
      "supportedTokens": ["ETH", "USDC", "USDT"]
    }
  ]
}
```

**Notes**:
- Shows chain capabilities (Stargate, LayerZero support)
- Includes explorer URLs for transaction links
- Lists supported tokens per chain

### 4. Get Supported Tokens
**GET** `/wallet/tokens/:chainId`

Gets supported tokens for a specific blockchain.

**URL Parameter**: `:chainId` - The blockchain chain ID

**Success Response** (200 OK):
```json
{
  "success": true,
  "tokens": [
    {
      "address": "0x0000000000000000000000000000000000000000",
      "symbol": "ETH",
      "name": "Ether",
      "decimals": 18,
      "isNative": true
    },
    {
      "address": "0x2F6F07CDcf3588944Bf4C42aC74ff24bF56e7590",
      "symbol": "USDC",
      "name": "USD Coin",
      "decimals": 6,
      "isNative": false
    }
  ]
}
```

**Notes**:
- Native tokens have `isNative: true`
- Includes token contract addresses
- Shows decimals for proper formatting

### 5. Set Primary Wallet
**PUT** `/wallet/primary`

Sets a wallet as the primary wallet for the user.

**Request Body**:
```json
{
  "address": "0x1234567890123456789012345678901234567890",
  "network": "ethereum"
}
```

**Success Response** (200 OK):
```json
{
  "success": true,
  "message": "Primary wallet updated successfully"
}
```

**Notes**:
- Only one primary wallet allowed across all networks
- Primary wallet is used as default for transactions

### 6. Update Wallet Balance
**PUT** `/wallet/balance`

Updates the balance for a specific wallet.

**Request Body**:
```json
{
  "address": "0x1234567890123456789012345678901234567890",
  "network": "ethereum",
  "balance": "1.5"
}
```

**Success Response** (200 OK):
```json
{
  "success": true,
  "message": "Wallet balance updated successfully"
}
```

**Notes**:
- Updates balance and timestamp
- Used by frontend for balance caching

### 7. Get Wallet Preferences
**GET** `/wallet/preferences`

Retrieves user's wallet preferences and settings.

**Success Response** (200 OK):
```json
{
  "success": true,
  "preferences": {
    "primaryWallet": {
      "address": "0x1234567890123456789012345678901234567890",
      "network": "ethereum"
    },
    "preferredNetworks": ["ethereum", "arbitrum", "polygon"]
  }
}
```

**Notes**:
- Shows primary wallet selection
- Lists all networks user has wallets on

### 8. Wallet Detection Processing
**POST** `/wallet/detection`

Processes wallet detection data from frontend.

**Request Body**:
```json
{
  "detectedWallets": {
    "evmWallets": ["0x123...", "0x456..."],
    "solanaWallets": ["9Wz..."],
    "bitcoinWallets": ["bc1..."]
  }
}
```

**Success Response** (200 OK):
```json
{
  "success": true,
  "message": "Wallet detection data received successfully"
}
```

**Notes**:
- Stores detection statistics
- Used for analytics and user experience

### 9. Delete Wallet
**DELETE** `/wallet/:address`

Removes a wallet from the user's profile.

**URL Parameter**: `:address` - The wallet address to remove  
**Request Body**:
```json
{
  "network": "ethereum"
}
```

**Success Response** (200 OK):
```json
{
  "success": true,
  "message": "Wallet removed successfully"
}
```

**Notes**:
- If deleted wallet was primary, sets another as primary
- Removes from quick lookup fields

## Address Validation

The system validates wallet addresses based on network:

### EVM Networks
- Uses ethers.js `isAddress()` validation
- Supports checksummed addresses
- Networks: Ethereum, Polygon, BSC, Arbitrum, Optimism, Base

### Solana
- Base58 validation with 32-44 character length
- Regex: `/^[1-9A-HJ-NP-Za-km-z]{32,44}$/`

### Bitcoin
- Supports P2PKH, P2SH, and Bech32 formats
- Regex: `/^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,59}$/`

## Frontend Integration Guide

### 1. Wallet Registration Flow
```javascript
async function registerWallet(walletData) {
  try {
    const response = await fetch('/wallet/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify(walletData)
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error);
    }
    
    const result = await response.json();
    return result.wallet;
  } catch (error) {
    if (error.message.includes('Invalid')) {
      showAddressValidationError();
    }
    throw error;
  }
}
```

### 2. Multi-Network Wallet Display
```javascript
function WalletList({ wallets }) {
  const groupedWallets = wallets.reduce((acc, wallet) => {
    if (!acc[wallet.network]) acc[wallet.network] = [];
    acc[wallet.network].push(wallet);
    return acc;
  }, {});
  
  return (
    <div>
      {Object.entries(groupedWallets).map(([network, networkWallets]) => (
        <NetworkSection key={network} network={network}>
          {networkWallets.map(wallet => (
            <WalletCard 
              key={`${wallet.address}-${wallet.network}`}
              wallet={wallet}
              onSetPrimary={() => setPrimaryWallet(wallet)}
              onUpdateBalance={(balance) => updateBalance(wallet, balance)}
              onDelete={() => deleteWallet(wallet)}
            />
          ))}
        </NetworkSection>
      ))}
    </div>
  );
}
```

### 3. Network and Token Information
```javascript
async function loadNetworkInfo() {
  // Get supported chains
  const chainsResponse = await fetch('/wallet/chains');
  const { chains } = await chainsResponse.json();
  
  // Get tokens for each chain
  const chainsWithTokens = await Promise.all(
    chains.map(async (chain) => {
      const tokensResponse = await fetch(`/wallet/tokens/${chain.chainId}`);
      const { tokens } = await tokensResponse.json();
      return { ...chain, tokens };
    })
  );
  
  return chainsWithTokens;
}
```

### 4. Address Validation Hook
```javascript
function useAddressValidation(address, network) {
  const [isValid, setIsValid] = useState(null);
  const [error, setError] = useState(null);
  
  useEffect(() => {
    if (!address || !network) {
      setIsValid(null);
      setError(null);
      return;
    }
    
    const validateAddress = () => {
      // Client-side validation patterns
      const validators = {
        ethereum: (addr) => /^0x[a-fA-F0-9]{40}$/.test(addr),
        solana: (addr) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr),
        bitcoin: (addr) => /^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,59}$/.test(addr)
      };
      
      const validator = validators[network] || validators.ethereum;
      const valid = validator(address);
      
      setIsValid(valid);
      setError(valid ? null : `Invalid ${network} address format`);
    };
    
    const timeoutId = setTimeout(validateAddress, 300);
    return () => clearTimeout(timeoutId);
  }, [address, network]);
  
  return { isValid, error };
}
```

### 5. Wallet Management Operations
```javascript
class WalletManager {
  async setPrimary(address, network) {
    const response = await fetch('/wallet/primary', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({ address, network })
    });
    
    if (!response.ok) {
      throw new Error('Failed to set primary wallet');
    }
    
    // Refresh wallet list
    this.refreshWallets();
  }
  
  async updateBalance(address, network, balance) {
    const response = await fetch('/wallet/balance', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({ address, network, balance })
    });
    
    return response.ok;
  }
  
  async removeWallet(address, network) {
    const response = await fetch(`/wallet/${encodeURIComponent(address)}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({ network })
    });
    
    if (!response.ok) {
      throw new Error('Failed to remove wallet');
    }
    
    this.refreshWallets();
  }
}
```

## Security Considerations

### Address Validation
- Server-side validation for all wallet addresses
- Network-specific validation patterns
- Protection against address format attacks

### Authorization
- All endpoints require valid Firebase authentication
- Users can only manage their own wallets
- Primary wallet changes are logged

### Data Storage
- Wallet addresses stored in lowercase for consistency
- Quick lookup fields for performance
- Balance updates with timestamps

## Error Handling

### Common Errors
- `400 Bad Request`: Invalid address format or missing fields
- `404 Not Found`: User profile or wallet not found
- `500 Internal Server Error`: Database or validation errors

### Error Response Format
```json
{
  "error": "Invalid EVM wallet address"
}
```

### Frontend Error Handling
```javascript
const handleWalletError = (error) => {
  if (error.message.includes('Invalid')) {
    showToast('Please check your wallet address format', 'error');
  } else if (error.message.includes('not found')) {
    showToast('Wallet not found in your profile', 'warning');
  } else {
    showToast('Failed to update wallet. Please try again.', 'error');
  }
};
```

## Testing Support

The wallet routes include test-friendly features:
- Flexible authentication in test mode
- Comprehensive address validation
- Error simulation capabilities

## Performance Considerations

### Frontend Optimization
1. **Address Validation**: Debounce validation calls
2. **Balance Updates**: Cache balances locally
3. **Network Detection**: Auto-detect network from address
4. **Wallet Groups**: Group wallets by network for better UX

### Backend Optimization
1. **Quick Lookup**: Dedicated fields for fast wallet queries
2. **Batch Operations**: Support for multiple wallet updates
3. **Caching**: Cache network configurations

## Next Steps for Frontend

1. **Multi-Wallet UI**: Design for managing multiple networks
2. **Real-time Balances**: WebSocket or polling for balance updates
3. **Network Switching**: Smooth transitions between networks
4. **Wallet Import**: Bulk import from wallet files
5. **Portfolio View**: Aggregate balance across all wallets
6. **Security Features**: Wallet verification and backup options