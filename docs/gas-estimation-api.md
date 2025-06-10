# Smart Contract Gas Estimation API

## Overview

The gas estimation API provides comprehensive fee estimates for smart contract operations, taking into account the number of conditions, cross-chain complexity, and real-time network gas prices.

## Endpoint

**POST** `/api/transactions/estimate-gas`

**Authentication:** Required (Bearer token)

## Request Body

```json
{
  "operation": "deploy|setConditions|deposit|fulfillCondition|startFinalApproval|release|dispute|cancel",
  "network": "ethereum|polygon|bsc|arbitrum|optimism|solana|bitcoin",
  "amount": "1.5", // Optional: Transaction amount in ETH (required for deploy/release operations)
  "conditions": ["condition1", "condition2"], // Optional: Array of condition IDs
  "isCrossChain": false, // Optional: Whether this is a cross-chain operation
  "sourceNetwork": "ethereum", // Required if isCrossChain is true
  "targetNetwork": "polygon", // Required if isCrossChain is true
  "gasSpeed": "standard" // Optional: "slow", "standard", or "fast"
}
```

## Response

```json
{
  "success": true,
  "data": {
    "operation": "deploy",
    "network": "ethereum",
    "gasLimit": 2650000,
    "gasPrices": {
      "slow": {
        "gasPrice": "10000000000",
        "gasCost": "26500000000000000",
        "gasCostEth": "0.0265"
      },
      "standard": {
        "gasPrice": "20000000000",
        "gasCost": "53000000000000000",
        "gasCostEth": "0.053"
      },
      "fast": {
        "gasPrice": "30000000000",
        "gasCost": "79500000000000000",
        "gasCostEth": "0.0795"
      }
    },
    "selectedSpeed": "standard",
    "selectedEstimate": {
      "gasPrice": "20000000000",
      "gasCost": "53000000000000000",
      "gasCostEth": "0.053"
    },
    "breakdown": {
      "operation": "deploy",
      "network": "ethereum",
      "baseGas": 2500000,
      "conditionGas": 150000,
      "crossChainMultiplier": 1.0,
      "networkMultiplier": 1.0,
      "totalConditions": 3,
      "isCrossChain": false
    },
    "crossChain": null, // Present if isCrossChain is true
    "serviceFee": {
      "percentage": 2,
      "feeWei": "20000000000000000",
      "feeEth": "0.02",
      "description": "2% service fee (built into smart contract)"
    },
    "warnings": [
      "High gas usage detected. Consider optimizing conditions or splitting operations."
    ],
    "recommendations": [
      "High Ethereum gas fees detected. Consider using L2 solutions like Arbitrum or Optimism."
    ],
    "timestamp": "2024-01-15T10:30:00.000Z"
  }
}
```

## Supported Operations

### Contract Deployment (`deploy`)
- **Base Gas:** 2,500,000
- **Per Condition:** +50,000 gas
- **Cross-chain Multiplier:** 1.2x
- **Service Fee:** 2% of escrow amount

### Set Conditions (`setConditions`)
- **Base Gas:** 80,000
- **Per Condition:** +25,000 gas
- **Cross-chain Multiplier:** 1.1x

### Deposit Funds (`deposit`)
- **Base Gas:** 100,000
- **Per Condition:** +5,000 gas
- **Cross-chain Multiplier:** 1.3x

### Fulfill Condition (`fulfillCondition`)
- **Base Gas:** 60,000
- **Per Condition:** Fixed cost per call
- **Cross-chain Multiplier:** 1.5x

### Start Final Approval (`startFinalApproval`)
- **Base Gas:** 80,000
- **Per Condition:** +2,000 gas
- **Cross-chain Multiplier:** 1.2x

### Release Funds (`release`)
- **Base Gas:** 150,000
- **Per Condition:** +3,000 gas
- **Cross-chain Multiplier:** 2.0x
- **Service Fee:** 2% of escrow amount

### Dispute (`dispute`)
- **Base Gas:** 120,000
- **Per Condition:** +10,000 gas
- **Cross-chain Multiplier:** 1.8x

### Cancel (`cancel`)
- **Base Gas:** 100,000
- **Per Condition:** +1,000 gas
- **Cross-chain Multiplier:** 1.1x

## Network Multipliers

Different networks have varying gas costs:

- **Ethereum:** 1.0x (base)
- **Polygon:** 0.8x (20% cheaper)
- **BSC:** 0.7x (30% cheaper)
- **Arbitrum:** 0.9x (10% cheaper)
- **Optimism:** 0.9x (10% cheaper)
- **Solana:** 0.1x (very different fee structure)
- **Bitcoin:** 0.05x (different fee structure)

## Cross-Chain Operations

When `isCrossChain` is true, the API provides additional cross-chain fee estimates:

```json
{
  "crossChain": {
    "sourceNetworkFee": "0.002",
    "targetNetworkFee": "0.001",
    "bridgeFee": "0.01",
    "totalEstimatedFee": "0.013",
    "bridgeRequired": true,
    "bridgeInfo": {
      "bridge": "Polygon Bridge",
      "estimatedTime": "10-30 minutes",
      "trustLevel": "high"
    }
  }
}
```

## Gas Speed Options

- **Slow:** 90% of current gas price (longer confirmation time)
- **Standard:** Current network gas price (normal confirmation time)
- **Fast:** 120% of current gas price (faster confirmation time)

## Warnings and Recommendations

The API provides intelligent warnings and recommendations:

### Warnings
- High gas usage (>5M gas)
- Cross-chain operation complexities
- Large number of conditions (>10)

### Recommendations
- Network optimization suggestions
- L2 alternatives for high Ethereum fees
- Condition grouping strategies

## Error Responses

```json
{
  "success": false,
  "message": "Operation and network are required",
  "error": "Validation error"
}
```

## Example Usage

### Contract Deployment Estimation

```bash
curl -X POST https://api.example.com/api/transactions/estimate-gas \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "operation": "deploy",
    "network": "ethereum",
    "amount": "1.0",
    "conditions": ["inspection_passed", "title_clear", "funding_approved"],
    "gasSpeed": "fast"
  }'
```

### Cross-Chain Operation Estimation

```bash
curl -X POST https://api.example.com/api/transactions/estimate-gas \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "operation": "deposit",
    "network": "ethereum",
    "amount": "0.5",
    "conditions": ["verification_complete"],
    "isCrossChain": true,
    "sourceNetwork": "ethereum",
    "targetNetwork": "polygon",
    "gasSpeed": "standard"
  }'
```

### Condition Fulfillment Estimation

```bash
curl -X POST https://api.example.com/api/transactions/estimate-gas \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "operation": "fulfillCondition",
    "network": "polygon",
    "conditions": ["single_condition"],
    "gasSpeed": "standard"
  }'
```

## Integration Notes

- Always check for warnings and recommendations in the response
- Consider network congestion when choosing gas speed
- For cross-chain operations, factor in additional confirmation times
- Service fees are automatically calculated and included in contract operations
- Gas estimates are approximations and actual costs may vary based on network conditions

## Rate Limiting

- 100 requests per minute per authenticated user
- Burst limit: 10 requests per second

## Real-time Gas Price Sources

The API fetches real-time gas prices from:
- Network RPC endpoints (when configured)
- Fallback to reasonable default values
- Cached for 30 seconds to improve performance 