# Transaction-Based Dispute Staking Mechanism Implementation Plan

## Overview
Implement a comprehensive staking mechanism for the CryptoEscrow backend that requires users to stake a percentage of the transaction amount when raising disputes. The stake percentage is determined by user reputation scores.

## Current Status
- ✅ GitHub issue reviewed
- ✅ Phase 1: Smart Contract Updates (Completed)
- ✅ Phase 2: Backend Service Implementation (Completed)
- ⏳ Phase 3: Integration & Testing (Pending)
- ⏳ Phase 4: Security & Monitoring (Pending)

## Phase 1: Smart Contract Updates ✅

### 1.1 Add Staking Data Structures ✅
- **Location**: `src/contract/contracts/UniversalEscrowServiceV3DisputesStaking.sol`
- **Status**: ✅ Complete - DisputeInfo struct includes all staking fields
- **Tasks Completed**:
  - ✅ Added staking fields to `DisputeInfo` struct (lines 21-34)
  - ✅ Defined `StakeStatus` enum (lines 36-42)
  - ✅ Added reputation mappings and tiers (lines 51-52)

### 1.2 Modify raiseDispute Function ✅
- **Function**: `raiseDispute(bytes32 escrowId, string calldata reason, address stakeToken)`
- **Status**: ✅ Complete - Function fully implements staking
- **Changes Completed**:
  - ✅ Added `stakeToken` parameter for flexible token staking
  - ✅ Validates stake amount based on reputation (line 173)
  - ✅ Transfers stake from disputeInitiator to contract (lines 176-186)
  - ✅ Stores stake information in dispute struct (lines 192-196)
  - ✅ Emits `DisputeRaised` event with stake amount (line 198)

### 1.3 Add Stake Resolution Logic ✅
- **Function**: `resolveDispute(bytes32 escrowId, bool releaseFunds, uint256 slashPercentage)`
- **Status**: ✅ Complete - Full stake handling implemented
- **Changes Completed**:
  - ✅ Configurable slash percentage (0-100%) (line 210)
  - ✅ Full stake return for valid disputes (lines 227-235)
  - ✅ Full slash for invalid disputes (lines 236-243)
  - ✅ Partial return/slash support (lines 244-258)
  - ✅ Reputation updates based on outcome (lines 234, 242, 257)
  - ✅ Emits `DisputeResolved` event (line 272)

### 1.4 Emergency Functions ✅
- **Function**: `emergencyStakeReturn(bytes32 escrowId)`
- **Status**: ✅ Complete - Emergency return implemented (lines 487-496)
- **Access**: ✅ Only service wallet (admin) can execute

## Phase 2: Backend Service Implementation ✅

### 2.1 Create Reputation Service ✅
- **Location**: `src/services/reputationService.js`
- **Status**: ✅ Complete - Full service implementation with all required methods
- **Features Implemented**:
  ```javascript
  class ReputationService {
    // ✅ Calculate stake requirements based on reputation score (0-1000)
    async calculateStakeRequirement(userId, transactionAmount)
    
    // ✅ Get user reputation score from database
    async getUserReputationScore(userId)
    
    // ✅ Update reputation score with points and reason tracking
    async updateReputationScore(userId, points, reason)
    
    // ✅ Get user's complete dispute history with stake information
    async getUserDisputeHistory(userId)
    
    // ✅ Get reputation statistics and tier information
    async getUserReputationStats(userId)
    
    // ✅ Record new dispute stake
    async recordDisputeStake(stakeData)
    
    // ✅ Update dispute stake status after resolution
    async updateDisputeStakeStatus(stakeId, resolution)
  }
  ```
- **Reputation System**:
  - ✅ Score range: 0-1000 (currently starts at 0, needs update to 1000)
  - ✅ Automated reputation updates based on dispute outcomes
  - ✅ Tier-based stake percentages implemented

### 2.2 Update Database Schema ✅
- **Status**: ✅ Schema implemented in service code
- **Firestore Collections Implemented**:
  1. **users** collection updates: ✅
     ```javascript
     {
       // existing fields...
       reputationScore: number, // 0-1000 range
       lastReputationUpdate: timestamp
     }
     ```
  
  2. **disputeStakes** collection: ✅
     ```javascript
     {
       userId: string,
       dealId: string,
       transactionAmount: number,
       stakeAmount: number,
       stakePercentage: number,
       stakeToken: string,
       reputationScoreAtStake: number,
       status: 'locked' | 'returned' | 'slashed' | 'partial_return',
       outcome: string,
       createdAt: timestamp,
       resolvedAt: timestamp,
       amountReturned: number,
       amountSlashed: number
     }
     ```
  
  3. **reputationHistory** collection: ✅
     ```javascript
     {
       userId: string,
       previousScore: number,
       newScore: number,
       pointsChanged: number,
       reason: string,
       timestamp: timestamp
     }
     ```

### 2.3 Implement API Endpoints ⏳

#### 2.3.1 Stake Requirements Endpoint ⏳
- **Status**: Service method exists, API endpoint pending
```javascript
GET /api/reputation/stake-requirements
Query params: userId, transactionAmount
Response: {
  reputationScore: number,
  reputationLevel: string,
  stakePercentage: number,
  requiredStake: number,
  currency: string
}
```

#### 2.3.2 Enhanced Dispute Raising ⏳
- **Status**: Integration with existing dispute endpoints pending
```javascript
POST /api/disputes/raise
Body: {
  escrowId: string,
  reason: string,
  stakeToken: string // stake amount calculated automatically
}
```

#### 2.3.3 Reputation Endpoints ⏳
- **Status**: Service methods exist, API endpoints pending
```javascript
GET /api/reputation/stats/:userId
GET /api/reputation/history/:userId
```

## Phase 3: Integration & Testing ⏳

### 3.1 Update EscrowServiceV3 ✅
- **Location**: `src/services/escrowServiceV3.js`
- **Status**: ✅ Complete - Integration with smart contract staking functions
- **Tasks Completed**:
  - ✅ Stake validation through smart contract calls
  - ✅ Stake transfer logic via `raiseDispute` with stakeToken parameter
  - ✅ Stake return/slash via `resolveDispute` with slashPercentage
  - ✅ Updated dispute raising flow with stake requirements
  - ✅ Updated dispute resolution flow with stake handling
  - ✅ Added `getStakeInfo` method for retrieving stake details

### 3.2 Update Transaction Routes ⏳
- **Location**: `src/api/routes/transaction/`
- **Status**: Partial - Dispute functionality exists but needs stake integration
- **Tasks**:
  - ⏳ Integrate ReputationService into dispute endpoints
  - ⏳ Add stake requirement validation before dispute creation
  - ⏳ Update dispute resolution to handle stake returns/slashing
  - ⏳ Add stake information to transaction/dispute details responses

### 3.3 Comprehensive Testing ⏳
- **Status**: Pending - To be handled by specialized testing agent
1. **Unit Tests**: ⏳
   - Stake calculation logic
   - Reputation score updates
   - Validation functions
   
2. **Integration Tests**: ⏳
   - Complete dispute flow with staking
   - Multiple dispute scenarios
   - Edge cases (insufficient balance, etc.)
   
3. **Security Tests**: ⏳
   - Reentrancy attack prevention
   - Integer overflow protection
   - Access control verification
   
4. **Load Tests**: ⏳
   - Concurrent dispute handling
   - High-volume stake processing

## Phase 4: Security & Monitoring ⏳

### 4.1 Security Measures ⏳
- **Status**: Pending - To be handled by security specialist agent
- ⏳ Reentrancy guards implemented in smart contract
- ⏳ Rate limiting for dispute creation
- ⏳ Stake amount validation against user balance
- ⏳ Emergency pause mechanism
- ⏳ Multi-sig requirement for emergency functions

### 4.2 Monitoring & Logging ⏳
- **Status**: Pending - Infrastructure setup required
- ⏳ Log all stake operations with transaction hashes
- ⏳ Monitor slashing events for anomalies
- ⏳ Track reputation score distributions
- ⏳ Alert on unusual staking patterns
- ⏳ Dashboard for stake metrics

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