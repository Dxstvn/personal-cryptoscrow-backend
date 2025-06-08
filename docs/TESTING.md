# Testing Guide

This guide explains how to run tests in this crypto escrow backend project and what dependencies are required for different types of tests.

## Test Categories

### 🟢 Tests that DON'T require Hardhat (Blockchain-Independent)

These tests can run on any server without blockchain infrastructure:

#### Unit Tests (Standalone)
```bash
npm run test:unit                              # All unit tests
npm run test:auth:unit:standalone              # Auth unit tests
npm run test:blockchainService:unit:standalone # Blockchain service unit tests (mocked)
npm run test:contractDeployer:unit:standalone  # Contract deployer unit tests (mocked)
```

#### Firebase Emulator Tests
These require Firebase emulators but no blockchain:
```bash
npm run test:emulator                          # Basic emulator tests
npm run test:auth:integration:emulator         # Auth integration tests
npm run test:contactRoutes:integration:emulator # Contact routes
npm run test:fileUploadDownload:integration:emulator # File operations
npm run test:databaseService:integration:emulator # Database operations
npm run test:scheduledJobs:integration         # Scheduled jobs
```

### 🔴 Tests that REQUIRE Hardhat (Blockchain-Dependent)

These tests need a running Hardhat blockchain node:

#### Blockchain Integration Tests
```bash
npm run test:blockchainService:integration     # Real blockchain interactions
npm run test:contractDeployer:integration      # Real contract deployment
npm run test:transactionRoutes:integration:emulator # Transaction routes with blockchain
```

#### End-to-End Tests
```bash
npm run test:e2e                               # Full E2E tests
npm run test:e2e:basic                         # Basic flow E2E
npm run test:e2e:user                          # User flow E2E
npm run test:e2e:security                      # Security E2E
```

#### Full Test Suite
```bash
npm run test:all                               # All tests with all services
```

## Setup Instructions

### For EC2 (Amazon Linux)

1. **Install Hardhat dependencies:**
   ```bash
   chmod +x scripts/setup-hardhat-ec2.sh
   ./scripts/setup-hardhat-ec2.sh
   ```

2. **Verify installation:**
   ```bash
   cd src/contract
   npx hardhat --version
   npx hardhat compile
   ```

### Manual Hardhat Setup

If the script doesn't work or you're on a different system:

1. **Install system dependencies:**
   ```bash
   # Amazon Linux / RHEL / CentOS
   sudo yum groupinstall -y "Development Tools"
   sudo yum install -y gcc-c++ make python3 git

   # Ubuntu / Debian
   sudo apt-get update
   sudo apt-get install -y build-essential python3 git
   ```

2. **Install contract dependencies:**
   ```bash
   cd src/contract
   npm install
   ```

3. **Test compilation:**
   ```bash
   npx hardhat compile
   ```

## Running Tests

### Without Blockchain (Recommended for CI/CD)

For most development and CI/CD pipelines, you can run the majority of tests without Hardhat:

```bash
# Run all non-blockchain tests
npm run test:unit

# Run Firebase emulator tests (requires Firebase CLI)
firebase emulators:exec --only firestore,auth,storage "npm run test:emulator"

# Run specific service tests
npm run test:auth:unit:standalone
npm run test:databaseService:unit
npm run test:contactRoutes:unit
```

### With Blockchain (Full Integration)

For complete testing including blockchain functionality:

1. **Start Firebase emulators:**
   ```bash
   firebase emulators:start --only firestore,auth,storage
   ```

2. **Start Hardhat node (in another terminal):**
   ```bash
   cd src/contract
   npx hardhat node
   ```

3. **Run blockchain tests:**
   ```bash
   npm run test:blockchainService:integration
   npm run test:contractDeployer:integration
   ```

4. **Or run everything at once:**
   ```bash
   npm run test:all  # Automatically starts and stops services
   ```

## Port Usage

When running full tests, these ports are used:

- **8545** - Hardhat blockchain node
- **9099** - Firebase Auth emulator
- **5004** - Firestore emulator
- **9199** - Firebase Storage emulator
- **5173** - Application server (during tests)

## Environment Variables

### Required for all tests:
```bash
NODE_ENV=test
```

### Required for blockchain tests:
```bash
RPC_URL=http://localhost:8545
BACKEND_WALLET_PRIVATE_KEY=0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d
```

### Required for Firebase tests:
```bash
FIREBASE_AUTH_EMULATOR_HOST=localhost:9099
FIRESTORE_EMULATOR_HOST=localhost:5004
FIREBASE_STORAGE_EMULATOR_HOST=localhost:9199
```

## Troubleshooting

### Hardhat Issues

1. **"Hardhat not found" error:**
   ```bash
   cd src/contract
   npm install
   ```

2. **Compilation errors:**
   - Check Node.js version (requires 16+)
   - Ensure all dependencies are installed
   - Try deleting `node_modules` and running `npm install` again

3. **Port conflicts:**
   ```bash
   npm run kill-ports  # Kills all test-related processes
   ```

### Firebase Emulator Issues

1. **Emulators not starting:**
   ```bash
   firebase --version  # Should be 9.0+
   firebase login
   ```

2. **Permission errors:**
   - Ensure Firebase CLI is properly authenticated
   - Check that project permissions are correct

### Test Timeouts

Some tests (especially E2E) can take longer:
- Individual tests timeout at 30 seconds
- Full test suites can take several minutes
- Use `--detectOpenHandles` to debug hanging tests

## Best Practices

1. **Development:** Use standalone unit tests for rapid feedback
2. **CI/CD:** Run non-blockchain tests for speed, blockchain tests in nightly builds
3. **Integration Testing:** Use emulator tests for most integration scenarios
4. **E2E Testing:** Reserve for critical path testing due to complexity

## Test Coverage

To generate coverage reports:

```bash
npm run test:coverage        # Non-blockchain tests
npm run test:all             # Full coverage including blockchain
```

Coverage reports are generated in the `coverage/` directory. 