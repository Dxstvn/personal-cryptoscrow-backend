# Transaction-Based Dispute Staking Mechanism Implementation Plan

## Overview
Implement a comprehensive staking mechanism for the CryptoEscrow backend that requires users to stake a percentage of the transaction amount when raising disputes. The stake percentage is determined by user reputation scores.

## Current Status
- ✅ GitHub issue reviewed
- 🔄 Phase 1: Smart Contract Updates (In Progress)
- ⏳ Phase 2: Backend Service Implementation (Pending)
- ⏳ Phase 3: Integration & Testing (Pending)
- ⏳ Phase 4: Security & Monitoring (Pending)

## Phase 1: Smart Contract Updates

### 1.1 Add Staking Data Structures
- **Location**: `src/contract/contracts/UniversalEscrowServiceV3.sol`
- **Tasks**:
  - Add `mapping(uint256 => DisputeStake) public disputeStakes` to track stakes
  - Update `DisputeInfo` struct with new fields:
    ```solidity
    struct DisputeInfo {
        // existing fields...
        uint256 stakeAmount;
        uint256 stakePercentage;
        StakeStatus stakeStatus;
        uint256 reputationScoreAtStake;
    }
    ```
  - Define `StakeStatus` enum:
    ```solidity
    enum StakeStatus {
        None,
        Locked,
        Returned,
        Slashed,
        PartialReturn
    }
    ```

### 1.2 Modify raiseDispute Function
- **Function**: `raiseDispute(uint256 escrowId, string memory reason, uint256 stakeAmount)`
- **Changes**:
  - Add `stakeAmount` parameter
  - Validate stake amount matches required percentage
  - Transfer stake from disputeInitiator to contract
  - Store stake information in disputeStakes mapping
  - Emit `StakeDeposited` event

### 1.3 Add Stake Resolution Logic
- **Function**: `resolveDispute(uint256 escrowId, DisputeResolution resolution, uint256 slashPercentage)`
- **Changes**:
  - Add logic to handle stake based on resolution:
    - `BuyerWins`: Return stake to buyer
    - `SellerWins`: Slash stake (default 50%)
    - `MutualAgreement`: Return stake to initiator
  - Implement configurable slash percentage (0-100%)
  - Transfer slashed funds to protocol treasury
  - Emit `StakeResolved` event

### 1.4 Emergency Functions
- **New Function**: `emergencyReturnStake(uint256 escrowId)`
- **Purpose**: Allow admin to return stake in case of contract issues
- **Access**: Only contract owner with timelock

## Phase 2: Backend Service Implementation

### 2.1 Create Reputation Service
- **Location**: `src/services/reputationService.js`
- **Features**:
  ```javascript
  class ReputationService {
    // Calculate user reputation score (0-100)
    async calculateUserScore(userId)
    
    // Get stake percentage based on reputation
    async getStakePercentage(userId, transactionAmount)
    
    // Update reputation after dispute resolution
    async updateReputationAfterDispute(userId, wasSuccessful)
    
    // Get reputation history
    async getReputationHistory(userId)
  }
  ```

### 2.2 Update Database Schema
- **Firestore Collections**:
  1. **users** collection updates:
     ```javascript
     {
       // existing fields...
       reputationScore: number, // 0-100
       totalDisputes: number,
       successfulDisputes: number,
       lastReputationUpdate: timestamp
     }
     ```
  
  2. **disputeStakes** collection:
     ```javascript
     {
       escrowId: string,
       userId: string,
       stakeAmount: number,
       stakePercentage: number,
       status: 'locked' | 'returned' | 'slashed' | 'partial_return',
       stakedAt: timestamp,
       resolvedAt: timestamp,
       slashAmount: number,
       transactionHash: string
     }
     ```
  
  3. **reputationHistory** collection:
     ```javascript
     {
       userId: string,
       action: string,
       scoreChange: number,
       newScore: number,
       reason: string,
       timestamp: timestamp
     }
     ```

### 2.3 Implement API Endpoints

#### 2.3.1 Stake Requirements Endpoint
```javascript
GET /api/reputation/stake-requirements
Query params: userId, transactionAmount
Response: {
  requiredStakePercentage: number,
  requiredStakeAmount: number,
  userReputationScore: number,
  userTier: 'new' | 'standard' | 'trusted'
}
```

#### 2.3.2 Enhanced Dispute Raising
```javascript
POST /api/disputes/raise
Body: {
  escrowId: string,
  reason: string,
  stakeAmount: number // validated against requirements
}
```

#### 2.3.3 Reputation Endpoints
```javascript
GET /api/reputation/score/:userId
GET /api/reputation/dispute-history/:userId
```

## Phase 3: Integration & Testing

### 3.1 Update EscrowServiceV3
- **Location**: `src/services/escrowServiceV3.js`
- **Tasks**:
  - Add stake validation methods
  - Implement stake transfer logic
  - Add stake return/slash methods
  - Update dispute raising flow
  - Update dispute resolution flow

### 3.2 Update Transaction Routes
- **Location**: `src/api/routes/transaction/`
- **Tasks**:
  - Integrate staking into dispute endpoints
  - Add stake requirement checks
  - Update dispute resolution endpoint
  - Add stake status to transaction details

### 3.3 Comprehensive Testing
1. **Unit Tests**:
   - Stake calculation logic
   - Reputation score updates
   - Validation functions
   
2. **Integration Tests**:
   - Complete dispute flow with staking
   - Multiple dispute scenarios
   - Edge cases (insufficient balance, etc.)
   
3. **Security Tests**:
   - Reentrancy attack prevention
   - Integer overflow protection
   - Access control verification
   
4. **Load Tests**:
   - Concurrent dispute handling
   - High-volume stake processing

## Phase 4: Security & Monitoring

### 4.1 Security Measures
- Implement reentrancy guards on all stake functions
- Add rate limiting for dispute creation
- Validate all stake amounts against user balance
- Add emergency pause mechanism
- Multi-sig requirement for emergency functions

### 4.2 Monitoring & Logging
- Log all stake operations with transaction hashes
- Monitor slashing events for anomalies
- Track reputation score distributions
- Alert on unusual staking patterns
- Dashboard for stake metrics

## Implementation Timeline
- **Week 1**: Smart Contract Updates (Phase 1)
- **Week 2**: Backend Services (Phase 2)
- **Week 3**: Integration & Testing (Phase 3)
- **Week 4**: Security Audit & Monitoring (Phase 4)

## Deliverables
1. Updated smart contract with staking mechanism
2. Reputation service with stake calculation
3. API endpoints for stake management
4. Comprehensive test suite
5. Security audit documentation
6. Monitoring dashboard
7. User documentation

## Success Criteria
- ✅ All dispute initiators must stake required amount
- ✅ Stakes are properly locked during dispute period
- ✅ Resolution correctly handles stake return/slashing
- ✅ Reputation scores update based on outcomes
- ✅ Emergency functions work as fail-safe
- ✅ No security vulnerabilities found in audit
- ✅ Performance meets benchmarks (<200ms API responses)

## Risk Mitigation
1. **Smart Contract Risk**: Extensive testing on testnet before mainnet
2. **Liquidity Risk**: Emergency return mechanism for locked stakes
3. **Reputation Gaming**: Rate limiting and fraud detection
4. **Integration Risk**: Backward compatibility for existing disputes

## Next Steps
1. Complete Phase 1 smart contract implementation
2. Deploy to testnet for initial testing
3. Begin Phase 2 backend service development
4. Schedule security audit for smart contract changes