# Smart Contracts (`/contract`)

## Overview

This directory contains the Solidity smart contracts for the CryptoEscrow platform, built with Hardhat for multi-network deployment. The current implementation provides basic escrow functionality with plans for advanced features like cross-chain integration and DeFi capabilities.

**Status**: Basic escrow implementation with multi-network deployment capability  
**Framework**: Hardhat with Solidity 0.8.28  
**Networks**: Ethereum Sepolia, Arbitrum Sepolia, Polygon Amoy

## Directory Structure

### **`contracts/`**
- **`UniversalEscrowServiceV3Test.sol`**: Main escrow contract (test version)
- **`UniversalEscrowServiceV3DisputesStargateOnly.sol.bak`**: Backup contract with dispute features
- **`interfaces/`**: Contract interfaces
  - `IDEXAggregator.sol`: DEX aggregator interface (1inch, 0x)
  - `IUniswapV2Router.sol`: Uniswap V2 router interface
- **`mocks/`**: Test contracts
  - `TestToken.sol`: Simple ERC20 test token

### **`scripts/`**
- **`deploy.js`**: Contract deployment scripts
- **`deployments.json`**: Deployment addresses and metadata

### **`test/`**
- Unit tests for escrow functionality
- Integration tests with mock tokens
- Network-specific test configurations

### **`hardhat.config.js`**
- Multi-network configurations
- Compiler optimizations
- Gas reporting and verification settings

## Current Smart Contract Implementation

### **UniversalEscrowServiceV3Test.sol**

The main escrow contract providing basic trustless escrow functionality.

**Key Features**:
- ✅ Basic escrow creation and management
- ✅ Condition-based fund release
- ✅ 2% service fee implementation
- ✅ Multi-participant support
- ✅ Emergency functions for contract management

**Core Functions**:

#### Escrow Management
```solidity
function createEscrow(
    address _buyer,
    address _seller,
    uint256 _amount,
    string[] memory _conditions
) external returns (uint256 escrowId)
```

#### Condition Updates
```solidity
function updateCondition(
    uint256 _escrowId,
    uint256 _conditionIndex,
    bool _fulfilled
) external onlySeller
```

#### Fund Operations
```solidity
function releaseEscrow(uint256 _escrowId) external
function cancelEscrow(uint256 _escrowId) external
```

### **Contract States**

Current implementation supports these states:
- `AWAITING_DEPOSIT`: Waiting for buyer to deposit funds
- `AWAITING_FULFILLMENT`: Funds deposited, conditions pending
- `COMPLETED`: All conditions met, funds released to seller
- `CANCELLED`: Escrow cancelled, funds refunded to buyer

### **Events System**

```solidity
event EscrowCreated(uint256 indexed escrowId, address buyer, address seller, uint256 amount);
event ConditionUpdated(uint256 indexed escrowId, uint256 conditionIndex, bool fulfilled);
event EscrowReleased(uint256 indexed escrowId, address indexed recipient, uint256 amount);
event EscrowCancelled(uint256 indexed escrowId, address indexed refundRecipient, uint256 amount);
```

## Network Support

### **Deployed Networks**
- **Ethereum Sepolia**: Contract address `0x...` (see deployments.json)
- **Arbitrum Sepolia**: Contract address `0x...` (see deployments.json)
- **Polygon Amoy**: Contract address `0x...` (see deployments.json)

### **Configuration**
```javascript
// hardhat.config.js networks
networks: {
  sepolia: {
    url: process.env.SEPOLIA_URL,
    accounts: [process.env.PRIVATE_KEY],
    chainId: 11155111
  },
  arbitrumSepolia: {
    url: process.env.ARBITRUM_SEPOLIA_URL,
    accounts: [process.env.PRIVATE_KEY],
    chainId: 421614
  },
  polygonAmoy: {
    url: process.env.POLYGON_AMOY_URL,
    accounts: [process.env.PRIVATE_KEY],
    chainId: 80002
  }
}
```

## Backend Integration

### **EscrowServiceV3 Integration**

The contracts integrate with the backend through the EscrowServiceV3 service:

```javascript
// Contract interaction example
const contract = new ethers.Contract(
  contractAddress,
  UniversalEscrowServiceV3TestABI,
  provider
);

// Create escrow
const tx = await contract.createEscrow(
  buyerAddress,
  sellerAddress,
  amount,
  conditions
);

// Monitor events
contract.on('EscrowCreated', (escrowId, buyer, seller, amount) => {
  console.log('New escrow created:', escrowId);
});
```

### **Real-time Synchronization**

The backend monitors contract events for real-time updates:
- Event listeners for state changes
- Automatic Firestore updates
- Frontend notification through WebSocket/real-time listeners

## Development Workflow

### **Setup**
```bash
# Install dependencies
npm install

# Compile contracts
npx hardhat compile

# Run tests
npx hardhat test

# Start local blockchain
npx hardhat node
```

### **Deployment**
```bash
# Deploy to Sepolia
npx hardhat run scripts/deploy.js --network sepolia

# Verify contract
npx hardhat verify --network sepolia <CONTRACT_ADDRESS>

# Update deployments.json with new addresses
```

### **Testing**
```bash
# Run all tests
npx hardhat test

# Run specific test file
npx hardhat test test/UniversalEscrowServiceV3Test.js

# Run with gas reporting
REPORT_GAS=true npx hardhat test
```

## Security Features

### **Access Control**
- Buyer-only functions: deposit funds
- Seller-only functions: update conditions
- Admin functions: emergency controls with proper access control

### **Safety Mechanisms**
- Reentrancy protection on fund transfers
- Input validation for all functions
- State checks before operations
- Safe math operations (Solidity 0.8+)

### **Current Limitations**
⚠️ **Important**: The current implementation lacks some security features mentioned in other documentation:
- No time-based dispute windows
- No automated dispute resolution
- Basic access control (can be enhanced)

## Testing

### **Current Test Coverage**
- ✅ Basic escrow creation and management
- ✅ Condition updates and validation
- ✅ Fund release mechanisms
- ✅ Access control testing
- ✅ Event emission verification

### **Test Examples**
```javascript
describe("UniversalEscrowServiceV3Test", function () {
  it("Should create escrow successfully", async function () {
    const [buyer, seller] = await ethers.getSigners();
    const conditions = ["Title transfer", "Inspection complete"];
    
    await expect(
      escrow.createEscrow(buyer.address, seller.address, amount, conditions)
    ).to.emit(escrow, "EscrowCreated");
  });
});
```

## Planned Enhancements

### **Advanced Features (Roadmap)**
The following features are referenced in other parts of the codebase but not yet implemented in contracts:

🔮 **Future Implementations**:
- ⏱️ 48-hour dispute window enforcement
- 🔗 LayerZero cross-chain integration
- 🔄 Uniswap DeFi integration
- ⚖️ Automated dispute resolution
- 🎯 Advanced condition types
- 📊 Enhanced event system

### **Cross-Chain Integration (Planned)**
```solidity
// Future interface for LayerZero integration
interface ILayerZeroEscrow {
    function sendCrossChainMessage(
        uint16 _dstChainId,
        bytes calldata _payload
    ) external payable;
}
```

### **DeFi Integration (Planned)**
```solidity
// Future interface for Uniswap integration
interface IUniswapEscrow {
    function depositWithSwap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOutMin
    ) external;
}
```

## Contract Interfaces

### **DEX Aggregator Interface**
```solidity
interface IDEXAggregator {
    function getQuote(
        address tokenIn,
        address tokenOut,
        uint256 amountIn
    ) external view returns (uint256 amountOut);
    
    function swap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOutMin,
        address to
    ) external returns (uint256 amountOut);
}
```

## Error Handling

### **Common Contract Errors**
- `"Caller is not the buyer"`: Access control violation
- `"Caller is not the seller"`: Access control violation
- `"Invalid escrow state"`: Operation not allowed in current state
- `"Insufficient funds"`: Deposit amount too low
- `"All conditions must be met"`: Conditions not fulfilled before release

### **Frontend Error Handling**
```javascript
try {
  const tx = await contract.createEscrow(buyer, seller, amount, conditions);
  await tx.wait();
} catch (error) {
  if (error.message.includes("Caller is not")) {
    showError("You don't have permission for this action");
  } else if (error.message.includes("Invalid escrow state")) {
    showError("This action is not available in the current state");
  }
}
```

## Gas Optimization

### **Current Optimizations**
- Compiler optimization enabled (200 runs)
- Efficient storage layout
- Minimal external calls
- Event-based state tracking

### **Gas Estimates**
- Contract deployment: ~800k gas
- Create escrow: ~150k gas
- Update condition: ~50k gas
- Release escrow: ~80k gas

## Troubleshooting

### **Common Issues**

**Deployment Failures**:
- Check private key and network URL in `.env`
- Ensure sufficient ETH for gas fees
- Verify Hardhat network configuration

**Transaction Failures**:
- Validate caller permissions
- Check escrow state before operations
- Ensure sufficient gas limit

**Event Monitoring Issues**:
- Verify WebSocket connection to provider
- Check event filter configurations
- Monitor for provider rate limits

### **Development Tips**
- Use `hardhat console` for interactive testing
- Enable gas reporting for optimization
- Use `hardhat-deploy` for consistent deployments
- Test on testnets before mainnet deployment

## Integration with Backend

### **EscrowServiceV3 Connection**
The contracts work with the EscrowServiceV3 backend service for:
- Automatic escrow creation via API
- Real-time event monitoring
- State synchronization with Firestore
- Frontend real-time updates

### **API Integration Points**
- `POST /transaction/create` → `createEscrow()`
- `POST /transaction/updateCondition` → `updateCondition()`
- `POST /transaction/releaseEscrow` → `releaseEscrow()`

---

**Current Status Summary**:

✅ **Working**: Basic escrow functionality, multi-network deployment, backend integration  
🚧 **In Development**: Advanced dispute resolution, cross-chain features, DeFi integration  
📋 **Planned**: Comprehensive timing mechanisms, automated arbitration, enhanced security

The contracts provide a solid foundation for the CryptoEscrow platform with room for significant enhancement as described in the roadmap.