# Staking Integration Tests Guide

## Overview

The CryptoEscrow backend has two different staking integration test files that serve complementary purposes. This guide explains when and how to use each one.

## Test Files

### 1. disputeStaking.integration.test.js
**Purpose**: Tests the dispute staking mechanism at the API/service layer without requiring blockchain interaction.

**Use this when**:
- Testing dispute stake calculations and reputation impacts
- Validating API endpoints for stake requirements
- Testing dispute resolution logic and stake handling
- Running quick integration tests during development

**Requirements**:
- Firebase emulators (Auth + Firestore)
- No Hardhat/blockchain required

**Run command**:
```bash
# With just Firebase emulators
npm run test:staking:dispute

# With Hardhat (if you want to test with blockchain but it's optional)
npm run test:staking:dispute:hardhat
```

### 2. transactionRoutes.staking.integration.test.js
**Purpose**: Tests the complete transaction flow with real blockchain interactions and staking.

**Use this when**:
- Testing end-to-end escrow flows with staking
- Validating blockchain interactions (funding, staking tokens)
- Testing cross-chain or network-specific features
- Performance testing with concurrent operations

**Requirements**:
- Firebase emulators (Auth + Firestore)
- Hardhat node running
- Deployed smart contracts
- Funded test wallets

**Run command**:
```bash
# Requires both Firebase and Hardhat
npm run test:staking:transaction:hardhat
```

## Test Architecture Layers

```
┌─────────────────────────────────────┐
│   transactionRoutes.staking.test    │ ← Full E2E with blockchain
├─────────────────────────────────────┤
│     disputeStaking.test             │ ← API/Service layer only
├─────────────────────────────────────┤
│   Unit Tests (reputationService)    │ ← Pure logic tests
└─────────────────────────────────────┘
```

## Quick Reference

| Test Type | disputeStaking | transactionRoutes.staking |
|-----------|----------------|---------------------------|
| **Blockchain Required** | No | Yes |
| **Test Speed** | Fast (~30s) | Slow (~3min) |
| **Coverage** | API + Services | Full Stack |
| **Best For** | Quick feedback | Complete validation |

## Running All Staking Tests

```bash
# Run all staking-related tests (unit + integration + contract)
npm run test:staking:all

# Run both integration tests together
npm run test:staking:full

# Run with full infrastructure (recommended for CI/CD)
npm run test:staking:full:hardhat
```

## Common Scenarios

### Developing a new staking feature
1. Start with unit tests
2. Use `disputeStaking` for API integration
3. Validate with `transactionRoutes.staking` for full flow

### Debugging stake calculations
- Use `test:staking:dispute` for quick iterations
- No need to wait for blockchain setup

### Testing blockchain integration
- Must use `test:staking:transaction:hardhat`
- Ensures smart contract interactions work correctly

### CI/CD Pipeline
- Run `test:staking:full:hardhat` for complete coverage
- Includes all layers of testing

## Troubleshooting

### disputeStaking tests failing
- Check Firebase emulators are running: `npm run emulator:start`
- Verify ports 5004 (Firestore) and 9099 (Auth) are free

### transactionRoutes.staking tests failing
- Ensure Hardhat is running: `cd src/contract && npx hardhat node`
- Check if contracts are deployed (see deployment logs)
- Verify test wallets have ETH for gas

### Port conflicts
- Run `npm run kill-ports` to free up all test ports
- Ports used: 8545 (Hardhat), 5004 (Firestore), 9099 (Auth)