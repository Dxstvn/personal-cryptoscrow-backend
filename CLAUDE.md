# Claude Context - CryptoEscrow Backend

## Project Overview

This is a comprehensive **CryptoEscrow Backend** built with Node.js/Express that provides secure escrow services for cryptocurrency transactions. The system integrates Firebase (Firestore, Auth, Storage), Ethereum smart contracts, and cross-chain transaction capabilities.

## Key Architecture Components

### 🔧 **Core Services**
- **EscrowServiceV3** (`src/services/escrowServiceV3.js`) - Main blockchain integration service
- **DatabaseService** (`src/services/databaseService.js`) - Core database operations with event emission
- **ContractConditionSync** (`src/services/contractConditionSync.js`) - Real-time blockchain synchronization
- **DisputeEventHandler** (`src/services/disputeEventHandler.js`) - Automated dispute resolution

### 🌐 **API Routes**
- **Transaction Routes** (`src/api/routes/transaction/`) - Core escrow transaction management
- **Wallet Routes** (`src/api/routes/wallet/`) - Multi-network wallet operations
- **Auth Routes** (`src/api/routes/auth/`) - Firebase authentication integration
- **Contact Routes** (`src/api/routes/contact/`) - User contact management

### 📋 **Smart Contracts**
- **Contract Directory** (`src/contract/`) - Hardhat project with escrow contracts
- **Universal Escrow V3** - Main escrow contract with dispute resolution
- **Cross-Chain Support** - LayerZero integration for multi-network transactions

## Current Implementation Status

### ✅ **Completed Features**
1. **V3 Escrow Service Integration** - Full blockchain integration with automated timing
2. **Event-Driven Architecture** - Real-time synchronization between database and contracts
3. **Comprehensive Testing** - 21 integration tests covering all major workflows
4. **48-Hour Dispute Window** - Enforced timing mechanism after conditions are met
5. **7-Day Dispute Resolution** - Automated resolution with fail-safes
6. **Cross-Chain Transactions** - Multi-network support (Ethereum, Arbitrum, Polygon)
7. **Real-Time Monitoring** - Event-driven condition and dispute tracking

### 🔄 **Key Workflows**
1. **Deal Creation** → **Condition Updates** → **48h Dispute Window** → **Escrow Release**
2. **Dispute Flow** → **7-Day Resolution Period** → **Auto-Resolution or Manual Intervention**
3. **Cross-Chain Flow** → **Fee Estimation** → **Bridge Preparation** → **Multi-Network Execution**

## Important Context for Claude

### 🚨 **Critical Timing Mechanisms**
- **48-Hour Window**: After ALL conditions are met, there's a 48-hour period where disputes can be raised
- **Customizable Resolution**: Once a dispute is raised, there's a customizable period (1-30 days, default 7) for resolution
- **Auto-Resolution**: If disputes aren't manually resolved within the custom period, funds automatically return to buyer
- **Event-Driven**: The system uses `setTimeout` and event emission for precise timing, NOT polling

### 🧪 **Testing Architecture**
- **Unit Tests**: Mock all dependencies, test route logic only
- **Integration Tests**: Use REAL services (Firebase emulators + EscrowServiceV3)
- **Real Integration Test**: `transactionRoutes.realIntegration.test.js` with 22 comprehensive tests
- **Test Coverage**: Authentication, authorization, escrow lifecycle, disputes, cross-chain, performance

### 📊 **Database Schema (Firestore)**
- **deals** collection - Main transaction records with participants array
- **users** collection - User profiles with wallet addresses
- **contactInvitations** collection - Contact management system
- **Event-driven updates** - All database changes emit events for real-time sync

### 🔐 **Security & Authorization**
- **Firebase Authentication** - JWT token-based API security
- **Deal-Level Authorization** - Only participants can access specific deals
- **Wallet Validation** - Multi-network address validation
- **Input Sanitization** - Comprehensive validation including dispute period validation (1-30 days)

### 🌐 **Multi-Network Support**
- **EVM Chains**: Ethereum, Arbitrum, Polygon (full support)
- **Non-EVM**: Solana, Bitcoin (address validation ready)
- **Cross-Chain**: LayerZero integration for inter-network transactions
- **Fee Estimation**: Real-time cross-chain fee calculations

## Development Guidelines

### 🎯 **When Working on This Codebase**
1. **Always run integration tests** after major changes
2. **Use real services for integration testing** - no mocking in integration tests
3. **Follow event-driven patterns** - emit events for database changes
4. **Maintain timing accuracy** - use blockchain timestamps, not server time
5. **Test across networks** - ensure multi-chain compatibility

### 📝 **Code Patterns**
- **Route Structure**: Authentication → Validation → Service Call → Database Update → Response
- **Error Handling**: Graceful failures with descriptive error messages
- **Event Emission**: Database changes should emit events for real-time sync
- **Authorization**: Check user participation in deals before allowing access

### 🔍 **Key Files to Reference**
- **EscrowServiceV3**: Main service for all blockchain operations
- **TransactionRoutes**: Primary API endpoints for escrow management
- **Real Integration Tests**: Comprehensive test coverage examples
- **DatabaseService**: Event-driven database operations

### ⚠️ **Important Notes**
- **No Scheduled Jobs**: The system is event-driven, not cron-based
- **Firebase Emulators**: Used for testing, not mocking
- **Smart Contract Authority**: Blockchain timestamps are authoritative for timing
- **Cross-Chain Ready**: Architecture supports multiple blockchain networks

## Current State

The codebase is in a **production-ready state** with:
- ✅ Complete V3 escrow integration
- ✅ Event-driven real-time synchronization  
- ✅ Comprehensive test coverage (21 integration tests)
- ✅ Multi-network blockchain support
- ✅ Automated dispute resolution with proper timing
- ✅ Cross-chain transaction capabilities

The system successfully implements the complete escrow workflow with proper timing enforcement, real-time synchronization, and comprehensive error handling.

## Frontend Development Notes

### 🖥️ **Local Development vs Vercel Deployment**
When working with the frontend locally, there are specific initialization patterns to be aware of:

#### **Common Frontend Errors and Solutions**

1. **Module-Level API Configuration Errors**
   - **Error**: `TypeError: Cannot read properties of undefined (reading 'configure')`
   - **Cause**: Circular dependencies or initialization order issues when services try to configure each other at module load time
   - **Solution**: Defer configuration to runtime using browser-only checks and setTimeout
   ```javascript
   // ❌ BAD - Executes immediately at module load
   apiClient.configure({ onTokenExpired: handler });
   
   // ✅ GOOD - Defers execution and checks environment
   if (typeof window !== 'undefined') {
     setTimeout(() => {
       if (apiClient && typeof apiClient.configure === 'function') {
         apiClient.configure({ onTokenExpired: handler });
       }
     }, 0);
   }
   ```

2. **Server-Side Rendering (SSR) Issues**
   - Always check for `typeof window !== 'undefined'` before accessing browser APIs
   - Use dynamic imports for browser-only modules
   - Defer initialization of services that depend on localStorage or other browser APIs

3. **API URL Configuration**
   - Local development uses `http://localhost:3000`
   - Production uses environment variables or domain-based URLs
   - The API service should dynamically determine the correct URL based on the environment

## Git Commit Guidelines

### 📝 **Commit Message Rules**
- **NEVER credit yourself in git commit messages**
- Do not include phrases like "Generated with Claude", "Co-Authored-By: Claude", or any self-attribution
- Write clear, concise commit messages that describe the changes made
- Focus on what was changed and why, not who made the changes