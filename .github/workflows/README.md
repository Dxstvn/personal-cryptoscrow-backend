# GitHub Actions CI/CD Pipeline

This directory contains the automated CI/CD pipeline for the ClearHold backend. The pipeline is designed to be practical, cost-effective, and maintainable.

## Workflow Overview

### 1. Main CI/CD Pipeline (`main-ci-cd.yml`)
**Purpose**: Consolidated CI/CD pipeline for testing, building, and deployment

**Triggers**:
- Pull requests to `main` or `develop`
- Pushes to `main` branch
- Manual trigger with test scope selection

**Jobs**:
1. **Lint and Format Check** (5 min)
   - ESLint validation
   - Security vulnerability scan
   - Non-blocking (warnings only)

2. **Unit Tests** (10 min)
   - Runs in parallel by test group
   - No external dependencies required
   - Fast feedback on code changes

3. **Integration Tests** (20 min)
   - Only runs on main branch pushes or with `run-integration-tests` label
   - Requires Firebase emulators
   - Known auth issues are handled gracefully

4. **Smart Contract Tests** (15 min)
   - Runs when contract files change
   - Uses Hardhat for testing
   - Compiles and tests Solidity contracts

**Key Features**:
- Parallel test execution for speed
- Smart test selection based on changes
- Graceful handling of known issues
- Clear PR comments with results

### 2. Staking Pipeline (`staking-pipeline.yml`)
**Purpose**: Specialized pipeline for smart contract staking mechanism

**Triggers**:
- Manual workflow dispatch only
- Requires environment selection
- Optional test skip (with warnings)

**Jobs**:
1. **Pre-deployment Checks**
   - Branch validation (production requires main)
   - Configuration validation
   - Warning generation

2. **Test Suite**
   - Runs full test suite before deployment
   - Can be skipped with explicit override

3. **Build**
   - Creates optimized production build
   - Generates deployment artifacts
   - Validates production configuration

4. **Approval** (Production only)
   - Manual approval required
   - Uses GitHub environment protection

5. **Deploy**
   - AWS EC2 deployment
   - Environment-specific configuration
   - Automated rollback preparation

6. **Post-deployment**
   - Smoke tests
   - Monitoring setup
   - Deployment record creation

**Key Features**:
- Manual approval gates
- Rollback instructions
- Deployment artifacts
- Environment protection rules

### Deprecated Workflows
The following workflows have been deprecated and their functionality integrated into the main pipeline:
- `ci-test-pipeline.yml` - Merged into `main-ci-cd.yml`
- `deploy-pipeline.yml` - Merged into `main-ci-cd.yml`
- `monitoring-alerts.yml` - Monitoring should be handled by cloud services
- `notifications.yml` - Notifications integrated into main pipeline

**Triggers**:
- Scheduled every 30 minutes
- Manual trigger for specific checks

**Jobs**:
1. **API Health Check**
   - Checks both staging and production
   - Response time monitoring
   - Critical endpoint validation

2. **Database Health Check**
   - Firestore connectivity
   - Performance metrics
   - Manual trigger only

3. **Blockchain Health Check**
   - RPC endpoint status
   - Network connectivity
   - Manual trigger only

4. **Alert on Failure**
   - Creates GitHub issues for persistent failures
   - Only alerts on actual problems
   - Avoids duplicate notifications

**Key Features**:
- Threshold-based alerting
- Issue creation for tracking
- No noise from expected failures
- Clear remediation steps

### 4. Smart Notifications (`notifications.yml`)
**Purpose**: Intelligent notification system that reduces noise

**Triggers**:
- Workflow completion events
- Manual configuration updates

**Features**:
- Only notifies on important events
- Suppresses known issues
- Weekly summary reports
- Configurable notification rules

### 5. Staking Pipeline (`staking-pipeline.yml`)
**Purpose**: Comprehensive CI/CD for the staking mechanism

**Triggers**:
- Changes to staking-related files
- Manual deployment to testnet
- Security audit requests

**Jobs**:
1. **Contract Validation**
   - Compilation and size checks
   - Basic security analysis with Slither
   - Artifact generation

2. **Staking Tests**
   - Unit tests for contract logic
   - Integration tests with Firebase
   - Edge case and stress testing
   - Gas usage reports

3. **Gas Optimization**
   - Detailed gas cost analysis
   - Optimization suggestions
   - Function-level gas reports

4. **Security Audit**
   - Comprehensive vulnerability scanning
   - Access control verification
   - Complexity analysis
   - Automated security recommendations

5. **Testnet Deployment**
   - Multi-network support (Sepolia, Arbitrum, Polygon)
   - Automated contract verification
   - Deployment tracking and reporting

**Key Features**:
- Automated security auditing
- Gas optimization reports
- Multi-network testnet deployment
- Comprehensive test coverage
- Deployment issue creation

## Best Practices

### For Developers

1. **Pull Requests**
   - Unit tests run automatically on every PR
   - Add `run-integration-tests` label for full testing
   - Check PR comments for test results

2. **Deployments**
   - Always deploy to staging first
   - Review pre-deployment warnings
   - Monitor post-deployment for 30 minutes

3. **Monitoring**
   - Check GitHub Issues for health alerts
   - Review weekly summaries
   - Investigate threshold breaches

4. **Staking Mechanism**
   - Run security audit before any mainnet deployment
   - Test on multiple testnets before production
   - Monitor gas costs and optimize as needed
   - Keep deployment artifacts for audit trail

### Cost Optimization

1. **Test Strategy**
   - Unit tests run frequently (cheap and fast)
   - Integration tests run selectively
   - Smart contract tests only when needed

2. **Caching**
   - Node modules cached between runs
   - Build artifacts retained appropriately
   - Parallel jobs share cache

3. **Resource Usage**
   - Timeout limits on all jobs
   - Conditional job execution
   - Efficient artifact retention

### Maintenance

1. **Known Issues**
   - Auth failures in integration tests are expected in CI
   - These are handled gracefully without failing builds

2. **Customization**
   - Adjust thresholds in workflow files
   - Modify notification rules as needed
   - Add new test groups to matrices

3. **Debugging**
   - Check job summaries for detailed information
   - Review uploaded artifacts for failures
   - Use manual triggers for specific tests

## Environment Variables

Required secrets in GitHub:
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- Firebase service account credentials

Environment-specific:
- Staging and Production environment secrets
- Deployment URLs and endpoints
- Monitoring thresholds

## Workflow Structure

The pipeline uses modern GitHub Actions features:
- Matrix strategies for parallel testing
- Conditional job execution to save resources
- Environment protection rules for production
- Artifact retention for debugging
- Reusable workflows where appropriate

## Future Improvements

1. **Performance**
   - Add performance benchmarking
   - Implement trend analysis
   - Create performance regression alerts

2. **Security**
   - Integrate security scanning tools
   - Add dependency vulnerability checks
   - Implement secret scanning

3. **Deployment**
   - Add blue-green deployment support
   - Implement canary releases
   - Enhance rollback automation