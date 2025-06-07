# Wallet Management Routes (`src/api/routes/wallet`)

## Overview

This directory contains API routes for comprehensive wallet management across multiple blockchain networks. The wallet system supports user wallet registration, validation, cross-chain transaction preparation, and multi-network fee estimation, providing the foundation for cross-chain escrow transactions.

**Frontend Relevance**: Essential for building multi-network wallet connection interfaces, cross-chain transaction flows, and network switching capabilities. These endpoints enable users to manage wallets across different blockchains and prepare complex cross-chain transactions.

## File: `walletRoutes.js`

**Base Path**: `/wallet` (mounted at `/wallet` in server.js)
**Authentication**: All endpoints require Firebase ID Token (`Authorization: Bearer <TOKEN>`)
**Key Integrations**: Cross-chain services, network validation, fee estimation, wallet management

## Core Endpoints

### **Wallet Registration & Management**

#### `POST /wallet/register`
**Purpose**: Registers a new wallet for the authenticated user on a specific blockchain network.

**Request Body**:
```json
{
  "walletAddress": "0x1234567890123456789012345678901234567890",
  "network": "ethereum", // "ethereum", "solana", "bitcoin", "polygon", "bsc"
  "isPrimary": true, // Optional: set as primary wallet for this network
  "label": "My Primary Ethereum Wallet" // Optional: user-friendly label
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "walletId": "wallet-doc-id",
    "walletAddress": "0x1234567890123456789012345678901234567890",
    "network": "ethereum",
    "isPrimary": true,
    "isValid": true,
    "registeredAt": "2023-10-26T10:00:00.000Z"
  }
}
```

**Frontend Actions**:
- Build wallet connection UI for multiple networks
- Implement wallet switching between networks
- Show validation status and network compatibility
- Enable primary wallet designation per network

#### `GET /wallet/user-wallets`
**Purpose**: Retrieves all registered wallets for the authenticated user across all networks.

**Response**:
```json
{
  "success": true,
  "data": {
    "wallets": [
      {
        "id": "wallet-1",
        "address": "0x1234567890123456789012345678901234567890",
        "network": "ethereum",
        "isPrimary": true,
        "balance": "1.5 ETH",
        "lastUpdated": "2023-10-26T10:00:00.000Z",
        "isValid": true
      },
      {
        "id": "wallet-2",
        "address": "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
        "network": "solana", 
        "isPrimary": true,
        "balance": "10.5 SOL",
        "lastUpdated": "2023-10-26T10:00:00.000Z",
        "isValid": true
      }
    ],
    "totalWallets": 2,
    "supportedNetworks": ["ethereum", "solana", "bitcoin", "polygon", "bsc"]
  }
}
```

**Frontend Actions**:
- Display user's wallets organized by network
- Show wallet balances and network status
- Enable wallet management (add/remove/update)
- Implement network-specific wallet interfaces

#### `POST /wallet/validate`
**Purpose**: Validates wallet address format and network compatibility for specific transaction types.

**Request Body**:
```json
{
  "walletAddress": "0x1234567890123456789012345678901234567890",
  "network": "ethereum",
  "transactionType": "escrow", // Optional: "escrow", "cross-chain", "simple"
  "targetNetwork": "solana" // Optional: for cross-chain validation
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "isValid": true,
    "network": "ethereum",
    "addressFormat": "valid",
    "networkCompatible": true,
    "escrowSupported": true,
    "crossChainCapable": true,
    "validationDetails": {
      "checksumValid": true,
      "networkDetected": "ethereum",
      "smartContractCapable": true,
      "supportedFeatures": ["escrow", "cross-chain", "erc20"]
    }
  }
}
```

**Frontend Actions**:
- Real-time wallet address validation during input
- Show network detection and compatibility warnings
- Display supported features for each wallet
- Guide users to compatible wallet options

### **Cross-Chain Transaction Support**

#### `POST /wallet/cross-chain/estimate-fees`
**Purpose**: Estimates fees for cross-chain transactions between different networks.

**Request Body**:
```json
{
  "sourceNetwork": "ethereum",
  "targetNetwork": "solana",
  "amount": "1.5",
  "transactionType": "escrow" // Optional: affects fee calculation
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "feeEstimate": {
      "sourceNetworkFee": "0.002 ETH",
      "bridgeFee": "0.01 ETH", 
      "targetNetworkFee": "0.000005 SOL",
      "totalFeeUSD": "45.30",
      "estimatedTime": "10-15 minutes"
    },
    "isEVMCompatible": false,
    "bridgeInfo": {
      "provider": "LayerZero",
      "route": "ethereum -> solana",
      "confidence": "high",
      "alternatives": ["wormhole", "multichain"]
    },
    "requiresBridge": true
  }
}
```

**Frontend Actions**:
- Display cross-chain fee breakdown to users
- Show estimated transaction times
- Present bridge options and recommendations
- Enable fee comparison between networks

#### `POST /wallet/cross-chain/prepare`
**Purpose**: Prepares a cross-chain transaction by validating addresses, routes, and requirements.

**Request Body**:
```json
{
  "fromAddress": "0x1234567890123456789012345678901234567890",
  "toAddress": "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
  "amount": "1.5",
  "sourceNetwork": "ethereum",
  "targetNetwork": "solana",
  "dealId": "deal-123", // Optional: for escrow transactions
  "bridgePreference": "fastest" // "fastest", "cheapest", "most_secure"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "preparationId": "prep-cross-chain-123",
    "status": "prepared",
    "bridgeRoute": {
      "provider": "LayerZero",
      "route": "ethereum -> solana",
      "steps": [
        {
          "step": 1,
          "network": "ethereum",
          "action": "Lock tokens in bridge contract",
          "estimatedTime": "2-3 minutes"
        },
        {
          "step": 2, 
          "network": "bridge",
          "action": "Cross-chain verification",
          "estimatedTime": "5-8 minutes"
        },
        {
          "step": 3,
          "network": "solana",
          "action": "Mint wrapped tokens",
          "estimatedTime": "1-2 minutes"
        }
      ]
    },
    "requirements": {
      "sourceWalletBalance": "2.5 ETH",
      "minimumRequired": "1.502 ETH",
      "hasBalance": true,
      "approvalRequired": false
    }
  }
}
```

**Frontend Actions**:
- Show multi-step transaction preparation flow
- Display wallet balance requirements
- Guide users through cross-chain setup process
- Show estimated completion times for each step

#### `POST /wallet/cross-chain/:transactionId/execute-step`
**Purpose**: Executes a specific step in a prepared cross-chain transaction.

**URL Parameter**: `:transactionId` - The preparation ID from cross-chain preparation

**Request Body**:
```json
{
  "stepNumber": 1,
  "txHash": "0x...", // Optional: transaction hash from previous step
  "confirmation": true // User confirmation to proceed
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "stepNumber": 1,
    "status": "completed",
    "txHash": "0x123...",
    "nextStep": {
      "stepNumber": 2,
      "network": "bridge",
      "action": "Cross-chain verification",
      "instructions": "Wait for cross-chain confirmation..."
    },
    "overallProgress": {
      "completed": 1,
      "total": 3,
      "percentage": 33
    }
  }
}
```

**Frontend Actions**:
- Show step-by-step transaction progress
- Display transaction hashes and confirmations
- Update progress indicators in real-time
- Handle errors and retry mechanisms

#### `GET /wallet/cross-chain/:transactionId/status`
**Purpose**: Retrieves the current status of a cross-chain transaction.

**Response**:
```json
{
  "success": true,
  "data": {
    "transactionId": "prep-cross-chain-123",
    "overallStatus": "in_progress",
    "currentStep": 2,
    "steps": [
      {
        "stepNumber": 1,
        "status": "completed",
        "txHash": "0x123...",
        "completedAt": "2023-10-26T10:05:00.000Z"
      },
      {
        "stepNumber": 2,
        "status": "in_progress", 
        "estimatedCompletion": "2023-10-26T10:12:00.000Z"
      },
      {
        "stepNumber": 3,
        "status": "pending",
        "estimatedStart": "2023-10-26T10:12:00.000Z"
      }
    ],
    "estimatedTotalTime": "10-15 minutes",
    "timeRemaining": "5-8 minutes"
  }
}
```

### **Network Information & Capabilities**

#### `GET /wallet/cross-chain/networks`
**Purpose**: Retrieves information about supported networks and their capabilities.

**Response**:
```json
{
  "success": true,
  "data": {
    "networks": {
      "ethereum": {
        "name": "Ethereum",
        "symbol": "ETH",
        "isEVM": true,
        "escrowSupported": true,
        "crossChainSupported": true,
        "bridges": ["layerzero", "wormhole", "multichain"],
        "avgTransactionTime": "2-3 minutes",
        "avgFee": "0.002-0.01 ETH"
      },
      "solana": {
        "name": "Solana", 
        "symbol": "SOL",
        "isEVM": false,
        "escrowSupported": false,
        "crossChainSupported": true,
        "bridges": ["wormhole", "allbridge"],
        "avgTransactionTime": "30 seconds",
        "avgFee": "0.000005 SOL"
      },
      "bitcoin": {
        "name": "Bitcoin",
        "symbol": "BTC", 
        "isEVM": false,
        "escrowSupported": false,
        "crossChainSupported": true,
        "bridges": ["multichain", "thorchain"],
        "avgTransactionTime": "10-60 minutes",
        "avgFee": "0.0001-0.001 BTC"
      }
    },
    "bridgeProviders": {
      "layerzero": {
        "name": "LayerZero",
        "supportedNetworks": ["ethereum", "polygon", "bsc"],
        "avgTime": "5-10 minutes",
        "reliability": "high"
      },
      "wormhole": {
        "name": "Wormhole",
        "supportedNetworks": ["ethereum", "solana", "polygon"],
        "avgTime": "10-15 minutes", 
        "reliability": "high"
      }
    }
  }
}
```

**Frontend Actions**:
- Display network selection interfaces
- Show network capabilities and limitations
- Build network comparison tools
- Guide users to compatible networks

## Network Support Matrix

### **Fully Supported (Escrow + Cross-Chain)**
- **Ethereum** (Mainnet, Sepolia, Goerli)
- **Polygon** (Mainnet, Mumbai)
- **BSC** (Mainnet, Testnet)

### **Cross-Chain Only (Address Validation + Bridging)**
- **Solana** (Mainnet, Devnet)
- **Bitcoin** (Mainnet, Testnet)

### **Planned Support**
- **Arbitrum** (Layer 2 scaling)
- **Optimism** (Layer 2 scaling)
- **Avalanche** (C-Chain)

## Frontend Integration Patterns

### **🔗 Multi-Wallet Connection**

```javascript
// Example: Connect wallets across networks
const connectMultiNetworkWallets = async () => {
  const networks = ['ethereum', 'solana', 'bitcoin'];
  const connectedWallets = [];
  
  for (const network of networks) {
    try {
      const wallet = await connectWallet(network);
      
      // Register with backend
      const response = await api.post('/wallet/register', {
        walletAddress: wallet.address,
        network: network,
        isPrimary: connectedWallets.length === 0
      });
      
      connectedWallets.push(response.data);
    } catch (error) {
      console.warn(`Failed to connect ${network} wallet:`, error);
    }
  }
  
  return connectedWallets;
};
```

### **⚡ Real-Time Fee Estimation**

```javascript
// Example: Live cross-chain fee updates
const useCrossChainFees = (sourceNetwork, targetNetwork, amount) => {
  const [fees, setFees] = useState(null);
  const [loading, setLoading] = useState(false);
  
  useEffect(() => {
    const estimateFees = async () => {
      if (!sourceNetwork || !targetNetwork || !amount) return;
      
      setLoading(true);
      try {
        const response = await api.post('/wallet/cross-chain/estimate-fees', {
          sourceNetwork,
          targetNetwork, 
          amount
        });
        setFees(response.data);
      } catch (error) {
        console.error('Fee estimation failed:', error);
      } finally {
        setLoading(false);
      }
    };
    
    estimateFees();
  }, [sourceNetwork, targetNetwork, amount]);
  
  return { fees, loading };
};
```

### **🌊 Cross-Chain Transaction Flow**

```javascript
// Example: Complete cross-chain transaction flow
const CrossChainTransactionFlow = ({ fromNetwork, toNetwork, amount }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [transactionId, setTransactionId] = useState(null);
  const [status, setStatus] = useState('preparing');
  
  const prepareCrossChainTx = async () => {
    const response = await api.post('/wallet/cross-chain/prepare', {
      fromAddress: userWallets[fromNetwork].address,
      toAddress: userWallets[toNetwork].address,
      amount,
      sourceNetwork: fromNetwork,
      targetNetwork: toNetwork
    });
    
    setTransactionId(response.data.preparationId);
    return response.data;
  };
  
  const executeStep = async (stepNumber) => {
    const response = await api.post(
      `/wallet/cross-chain/${transactionId}/execute-step`,
      { stepNumber, confirmation: true }
    );
    
    setCurrentStep(stepNumber);
    return response.data;
  };
  
  const monitorStatus = () => {
    const interval = setInterval(async () => {
      const response = await api.get(
        `/wallet/cross-chain/${transactionId}/status`
      );
      
      setStatus(response.data.overallStatus);
      
      if (['completed', 'failed'].includes(response.data.overallStatus)) {
        clearInterval(interval);
      }
    }, 5000);
    
    return () => clearInterval(interval);
  };
  
  return (
    <CrossChainInterface
      step={currentStep}
      status={status}
      onPrepare={prepareCrossChainTx}
      onExecuteStep={executeStep}
      onMonitor={monitorStatus}
    />
  );
};
```

## Error Handling & Validation

### **Common Error Responses**

```json
// Invalid wallet address (400)
{
  "success": false,
  "error": "Invalid wallet address format for network: ethereum"
}

// Unsupported network (400) 
{
  "success": false,
  "error": "Network 'unsupported_network' is not supported"
}

// Insufficient balance (400)
{
  "success": false,
  "error": "Insufficient balance. Required: 1.5 ETH, Available: 0.8 ETH"
}

// Cross-chain preparation failed (500)
{
  "success": false,
  "error": "Cross-chain route preparation failed",
  "details": "No available bridge for ethereum -> bitcoin"
}
```

### **Frontend Error Handling**

```javascript
const handleWalletError = (error, network) => {
  switch(error.status) {
    case 400:
      if (error.message.includes('Invalid wallet address')) {
        showAddressValidationError(network);
      } else if (error.message.includes('Insufficient balance')) {
        showInsufficientBalanceWarning();
      }
      break;
    case 404:
      showNetworkNotSupportedError(network);
      break;
    case 500:
      showCrossChainUnavailableError();
      break;
  }
};
```

## Performance & Optimization

### **Frontend Optimization Tips**

1. **Wallet Connection Caching**: Cache wallet connections per session
2. **Fee Estimation Debouncing**: Debounce fee estimation API calls
3. **Network Status Monitoring**: Monitor network connectivity
4. **Balance Updates**: Use WebSocket for real-time balance updates
5. **Cross-Chain Status Polling**: Efficient polling for transaction status

### **Network Detection**

```javascript
// Example: Automatic network detection
const detectNetworkFromAddress = (address) => {
  if (address.startsWith('0x') && address.length === 42) {
    return 'ethereum'; // or polygon, bsc
  }
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) {
    return 'solana';
  }
  if (/^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,59}$/.test(address)) {
    return 'bitcoin';
  }
  return 'unknown';
};
```

## Testing Integration

### **Wallet Testing Patterns**

```javascript
// Mock wallet connections for testing
const mockWalletConnection = (network) => {
  const mockAddresses = {
    ethereum: '0x1234567890123456789012345678901234567890',
    solana: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
    bitcoin: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh'
  };
  
  return {
    address: mockAddresses[network],
    network,
    connect: jest.fn().mockResolvedValue(true),
    disconnect: jest.fn(),
    sign: jest.fn()
  };
};
```

---

**Critical Frontend Integration Notes**:

1. **Multi-Network Support**: Build UI that gracefully handles multiple wallet types
2. **Real-Time Validation**: Implement immediate wallet address validation
3. **Cross-Chain Guidance**: Provide clear step-by-step cross-chain instructions
4. **Fee Transparency**: Always show complete fee breakdowns before transactions
5. **Error Recovery**: Implement robust error handling and retry mechanisms
6. **Status Monitoring**: Use real-time updates for cross-chain transaction status
7. **Network Switching**: Handle network switching in wallet providers
8. **Balance Management**: Show accurate balances across all connected networks 