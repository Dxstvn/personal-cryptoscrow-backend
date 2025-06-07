# Backend Services (`src/services`)

## Overview

This directory contains the core business logic services of the CryptoEscrow backend. These services act as a bridge between the API route handlers and external systems (Firestore, Ethereum blockchain, cross-chain bridges), implementing the complex business rules and workflows that power the escrow platform.

**Frontend Relevance**: While frontend developers don't call these services directly, understanding their roles helps comprehend the end-to-end flow of operations, data transformations, and automated processes that affect the user experience.

## Service Modules

### **`blockchainService.js`** - Ethereum Integration
**Purpose**: Primary interface for all Ethereum blockchain interactions and smart contract operations.

**Key Functions**:
- Smart contract interaction (read/write operations)
- Transaction signing and broadcasting
- Gas estimation and optimization
- Contract state monitoring
- Deadline enforcement (automated fund release/cancellation)

**Used By**: API routes (`/transaction`), `scheduledJobs.js`, `contractDeployer.js`

**Frontend Impact**: 
- Determines smart contract deployment success/failure during deal creation
- Handles automated fund releases and cancellations that users see via real-time updates
- Provides transaction hashes for blockchain explorers

### **`contractDeployer.js`** - Smart Contract Deployment
**Purpose**: Handles deployment of new `PropertyEscrow.sol` contract instances for each escrow deal.

**Key Functions**:
- Contract compilation and deployment
- Constructor parameter management
- Deployment verification and error handling
- Gas optimization for deployments

**Used By**: API routes (`/transaction/create`)

**Frontend Impact**:
- Success/failure affects deal creation flow
- Provides smart contract addresses for user reference
- Deployment errors require user notification and potential retry mechanisms

### **`crossChainService.js`** - Cross-Chain Operations
**Purpose**: Manages cross-chain transaction preparation, monitoring, and execution across multiple blockchain networks.

**Key Functions**:
- Multi-network wallet address validation
- Bridge route discovery and optimization
- Cross-chain fee estimation
- Transaction status tracking across networks
- Network compatibility checking

**Supported Networks**:
- **Ethereum** (full integration)
- **Solana** (address validation, preparation)
- **Bitcoin** (address validation, preparation)
- **Polygon** (EVM-compatible)
- **BSC** (EVM-compatible)

**Used By**: API routes (`/wallet`, `/transaction`), `scheduledJobs.js`

**Frontend Impact**:
- Enables multi-network wallet support in UI
- Provides cross-chain fee estimates for user decision-making
- Powers network selection and compatibility warnings
- Drives multi-step transaction progress indicators

### **`databaseService.js`** - Firestore Operations
**Purpose**: Specialized database operations for complex queries and batch updates, primarily supporting automated processes.

**Key Functions**:
- Deal deadline monitoring queries
- Batch status updates
- Transaction history management
- Data validation and sanitization

**Used By**: `scheduledJobs.js`, API routes for complex queries

**Frontend Impact**:
- Ensures data consistency for real-time listeners
- Supports complex filtering and pagination in deal lists
- Maintains audit trails visible to users

### **`scheduledJobs.js`** - Automated Processes
**Purpose**: Manages time-based automated tasks using `node-cron` for deadline enforcement and system maintenance.

**Automated Tasks**:
- **Final Approval Deadline**: Automatically releases funds after 48-hour approval period
- **Dispute Resolution**: Cancels deals after 7-day dispute period without resolution
- **Cross-Chain Monitoring**: Tracks pending cross-chain transactions
- **System Health Checks**: Monitors blockchain connectivity and system status

**Schedule**: Runs every 10 minutes (configurable via `CRON_SCHEDULE_DEADLINE_CHECKS`)

**Frontend Impact**:
- **Critical**: Users see automatic status changes via Firestore real-time listeners
- Timeline events show automated actions
- Deadline countdowns in UI reflect these automated processes
- Users need clear explanations of what happens when deadlines pass

## Service Integration Patterns

### **Service Call Chain**
```
Frontend → API Route → Service → External System
                   ↓
            Firestore Update → Real-time Listener → UI Update
```

### **Automated Process Flow**
```
scheduledJobs.js → databaseService.js (query) → blockchainService.js (action) → Firestore update → Frontend update
```

### **Cross-Chain Transaction Flow**
```
Frontend → /transaction/create → crossChainService.js → Multiple Network APIs → Status tracking → Real-time updates
```

## Error Handling & Resilience

### **Service-Level Error Handling**
- **Blockchain**: Automatic retry for network issues, gas estimation failures
- **Cross-Chain**: Fallback bridge providers, timeout handling
- **Database**: Transaction rollback, data consistency checks
- **Contracts**: Deployment verification, error categorization

### **Frontend Error Communication**
- Services return structured errors with user-friendly messages
- API routes translate service errors to appropriate HTTP status codes
- Real-time updates include error states for user notification

## Performance Considerations

### **Optimization Strategies**
- **Caching**: Blockchain data caching to reduce RPC calls
- **Batching**: Database operations batched for efficiency
- **Rate Limiting**: Built-in protection against external API limits
- **Connection Pooling**: Efficient resource management

### **Frontend Performance Impact**
- Fast response times for real-time user actions
- Efficient pagination for large deal lists
- Optimized cross-chain fee calculations
- Background processing for heavy operations

## Testing Coverage

Each service includes comprehensive test suites:

### **Unit Tests** (`__tests__/unit/`)
- Individual function testing
- Mock external dependencies
- Edge case coverage
- Error condition testing

### **Integration Tests** (`__tests__/integration/`)
- End-to-end service workflows
- Real blockchain/database interactions
- Cross-service communication testing
- Performance benchmarking

## Development Guidelines

### **Service Design Principles**
- **Single Responsibility**: Each service handles one domain
- **Dependency Injection**: Services are loosely coupled
- **Error Propagation**: Structured error handling throughout
- **Logging**: Comprehensive logging for debugging and monitoring

### **Frontend Integration Best Practices**
- **Real-time First**: Services update Firestore for real-time sync
- **Idempotency**: Safe to retry operations
- **Status Transparency**: Clear status communication for user feedback
- **Error Recovery**: Graceful error handling with user guidance

## Monitoring & Observability

### **Service Metrics**
- Transaction success/failure rates
- Cross-chain operation timing
- Blockchain connectivity status
- Database query performance

### **Frontend Monitoring Integration**
- Health check endpoints for service status
- Error reporting for user-facing issues
- Performance metrics for user experience optimization
- Real-time status indicators

## Future Enhancements

### **Planned Service Improvements**
- Additional blockchain network integrations
- Enhanced cross-chain bridge support
- Advanced analytics and reporting services
- Machine learning for transaction optimization

### **Frontend Integration Roadmap**
- WebSocket integration for instant updates
- Advanced error recovery mechanisms
- Predictive user experience features
- Enhanced cross-chain user guidance

---

**Note**: Services are designed to abstract complex backend operations while providing clear, predictable interfaces for frontend integration. The modular architecture ensures that frontend developers can focus on user experience while services handle the complexity of blockchain, database, and cross-chain operations. 