# End-to-End (E2E) Tests

This directory contains comprehensive end-to-end tests for the CryptoEscrow backend API.

## Overview

The E2E tests simulate real user interactions with the API, testing complete workflows from authentication through transaction completion. These tests ensure that all components work together correctly in a production-like environment.

## Test Structure

```
src/__tests__/e2e/
├── helpers/
│   └── testHelpers.js          # Utility functions for E2E tests
├── userFlow.e2e.test.js        # Main user flow tests
├── multipartyTransactions.e2e.test.js  # Multi-party transaction tests
├── security.e2e.test.js        # Security and edge case tests
├── setupE2E.js                 # Test environment setup
└── README.md                   # This file
```

## Prerequisites

Before running E2E tests, ensure you have:

1. **Firebase Emulators** installed and configured
2. **Hardhat** local blockchain node
3. **Environment file** `.env.test.e2e` in the project root
4. All **dependencies** installed (`npm install`)

## Environment Setup

### 1. Start Firebase Emulators

```bash
npm run emulators
```

This starts:
- Auth Emulator on port 9099
- Firestore Emulator on port 5004
- Storage Emulator on port 9199

### 2. Start Hardhat Node

In a separate terminal:

```bash
cd src/contract
npx hardhat node
```

This starts a local Ethereum blockchain on port 8545.

### 3. Configure Environment Variables

Ensure `.env.test.e2e` exists in the project root with the following variables:

```env
NODE_ENV=e2e_test
PORT=5173
API_BASE_URL=http://localhost:5173
FIRESTORE_EMULATOR_HOST=localhost:5004
FIREBASE_AUTH_EMULATOR_HOST=localhost:9099
FIREBASE_STORAGE_EMULATOR_HOST=localhost:9199
RPC_URL=http://localhost:8545
# ... (see .env.test.e2e for full list)
```

## Running the Tests

### Run All E2E Tests

```bash
npm run test:e2e
```

### Run Specific Test Suite

```bash
# User flow tests only
NODE_ENV=e2e_test NODE_OPTIONS=--experimental-vm-modules jest src/__tests__/e2e/userFlow.e2e.test.js

# Security tests only
NODE_ENV=e2e_test NODE_OPTIONS=--experimental-vm-modules jest src/__tests__/e2e/security.e2e.test.js

# Multi-party transaction tests only
NODE_ENV=e2e_test NODE_OPTIONS=--experimental-vm-modules jest src/__tests__/e2e/multipartyTransactions.e2e.test.js
```

## Test Coverage

### User Flow Tests (`userFlow.e2e.test.js`)

Tests the complete user journey:
- User registration and login
- Contact management
- Transaction creation and funding
- Transaction progression through stages
- Dispute resolution
- Fund distribution

### Multi-party Transaction Tests (`multipartyTransactions.e2e.test.js`)

Tests complex transaction scenarios:
- Milestone-based payments
- Three-party arbitrated transactions
- Subscription-based transactions
- Batch transaction processing

### Security Tests (`security.e2e.test.js`)

Tests security measures and edge cases:
- Authentication and authorization
- Input validation and sanitization
- Transaction security
- File upload security
- Concurrency and race conditions
- Error recovery and resilience

## Helper Functions

The `testHelpers.js` file provides utilities for:

### Server Management
- `startTestServer()` - Starts the API server
- `stopTestServer()` - Stops the API server

### User Management
- `createTestUser()` - Creates a test user with Firebase Auth
- `loginTestUser()` - Logs in a test user
- `deleteTestUser()` - Cleans up test user data

### API Client
- `ApiClient` class - Simplified API request handling with auth

### Blockchain Helpers
- `getProvider()` - Gets Ethereum provider
- `getWallet()` - Creates wallet from private key
- `fundTestAccount()` - Funds test accounts with ETH

### Data Generators
- `generateContactData()` - Creates test contact data
- `generateTransactionData()` - Creates test transaction data

## Best Practices

1. **Isolation**: Each test suite manages its own test data and cleanup
2. **Idempotency**: Tests can be run multiple times without side effects
3. **Logging**: Tests provide clear console output for debugging
4. **Error Handling**: Tests handle and report errors gracefully
5. **Performance**: Tests include timeouts and performance checks

## Troubleshooting

### Common Issues

1. **Port Already in Use**
   - Ensure no other services are running on ports 5173, 8545, 9099, 5004, 9199
   - Kill any orphaned processes: `kill-port 5173`

2. **Emulator Connection Failed**
   - Verify emulators are running: `firebase emulators:start`
   - Check emulator logs for errors

3. **Blockchain Connection Failed**
   - Ensure Hardhat node is running: `npx hardhat node`
   - Check RPC_URL in environment variables

4. **Test Timeouts**
   - Increase Jest timeout in `setupE2E.js`
   - Check for slow network or blockchain responses

5. **Authentication Errors**
   - Verify Firebase Auth emulator is running
   - Check test user credentials in `.env.test.e2e`

### Debug Mode

To run tests with verbose logging:

```bash
NODE_ENV=e2e_test NODE_OPTIONS=--experimental-vm-modules jest src/__tests__/e2e/ --verbose --detectOpenHandles
```

## Continuous Integration

For CI/CD pipelines:

1. Use Docker containers for emulators and Hardhat
2. Set up environment variables in CI secrets
3. Run tests in sequence to avoid port conflicts
4. Archive test results and logs

## Contributing

When adding new E2E tests:

1. Follow the existing test structure
2. Use helper functions from `testHelpers.js`
3. Clean up test data in `afterAll` hooks
4. Add descriptive console logs for test progress
5. Document any new test scenarios in this README 