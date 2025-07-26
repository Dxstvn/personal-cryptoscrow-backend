# Security Implementation Guide - Staking Mechanism

## Overview

This guide documents the security measures implemented for the ClearHold staking mechanism, including technical details, configuration options, and operational procedures.

## Table of Contents

1. [Smart Contract Security](#smart-contract-security)
2. [API Security](#api-security)
3. [Monitoring & Logging](#monitoring--logging)
4. [Multi-Signature Operations](#multi-signature-operations)
5. [Incident Response](#incident-response)
6. [Security Testing](#security-testing)
7. [Operational Security](#operational-security)

## Smart Contract Security

### Reentrancy Protection

All functions that handle stake transfers are protected with the `nonReentrant` modifier:

```solidity
function _returnStake(bytes32 escrowId, address to, uint256 amount) internal nonReentrant {
    // Implementation
}

function _slashStake(bytes32 escrowId, uint256 amount) internal nonReentrant {
    // Implementation
}
```

### Balance Validation

Pre-validation of user balances before stake operations:

```solidity
// Validate user has sufficient balance
if (stakeToken == address(0)) {
    if (msg.value < requiredStake) revert InsufficientStake();
} else {
    uint256 userBalance = IERC20(stakeToken).balanceOf(msg.sender);
    if (userBalance < requiredStake) revert InsufficientBalance();
}
```

### Emergency Pause Mechanism

Contract implements OpenZeppelin's Pausable pattern:

```solidity
function pause() external onlyServiceWallet {
    _pause();
}

function unpause() external onlyServiceWallet {
    _unpause();
}
```

**Usage**: In case of active exploit or critical vulnerability discovery
**Authority**: Service wallet only (should be multi-sig in production)

### Gas Optimization

Tier lookups are gas-optimized with explicit limits:

```solidity
uint256 tierCount = reputationTiers.length;
if (tierCount > 10) revert MaxTiersExceeded();
```

## API Security

### Rate Limiting

Implemented progressive rate limiting for dispute operations:

```javascript
// Dispute rate limiting: 3 per hour per user
export const createDisputeRateLimiter = () => {
  return rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 3,
    keyGenerator: (req) => req.user?.uid || req.ip
  });
};
```

**Rate Limits**:
- Dispute creation: 3 per hour per user
- General API: 100 requests per 15 minutes per IP
- Authentication: 5 attempts per 15 minutes with progressive delay
- High-value operations: 10 per day per user

### Balance Pre-Validation

API validates user balances before blockchain transactions:

```javascript
const userBalance = await validateUserStakeBalance(
    userId,
    stakeRequirements.requiredStake,
    stakeToken || 'ETH',
    dealData.buyerChainId
);

if (!userBalance.sufficient) {
    // Log security event and reject request
}
```

### Security Headers

Implemented via Helmet.js (already in dependencies):
- Content Security Policy (CSP)
- X-Frame-Options
- X-Content-Type-Options
- Strict-Transport-Security

## Monitoring & Logging

### Security Event Logging

All security-relevant events are logged with context:

```javascript
await securityLogger.logSecurityEvent(
    SecurityEventType.STAKE_LOCKED,
    {
        userId,
        dealId,
        amount,
        txHash,
        chainId,
        token,
        reputationScore
    }
);
```

**Event Types**:
- `STAKE_LOCKED` - Stake deposited
- `STAKE_RETURNED` - Stake returned to user
- `STAKE_SLASHED` - Stake slashed for invalid dispute
- `DISPUTE_RAISED` - New dispute created
- `DISPUTE_RESOLVED` - Dispute resolved
- `RATE_LIMIT_EXCEEDED` - Rate limit violation
- `SUSPICIOUS_ACTIVITY` - Anomalous behavior detected
- `REPUTATION_MANIPULATION` - Large reputation changes
- `HIGH_VALUE_OPERATION` - Operations over $10k
- `EMERGENCY_ACTION` - Emergency functions called
- `BALANCE_CHECK_FAILED` - Insufficient balance detected

### Suspicious Pattern Detection

Automated detection of suspicious behaviors:

```javascript
const patterns = await securityLogger.detectSuspiciousPatterns(userId);
// Detects:
// - Rapid dispute creation (>3 per hour)
// - High slash rate (>70%)
// - Reputation gaming attempts
```

### Metrics Dashboard

Real-time metrics available at `/api/monitoring/metrics/staking`:

```json
{
  "totalStakesLocked": 50000,
  "totalStakesReturned": 45000,
  "totalStakesSlashed": 5000,
  "activeDisputes": 15,
  "slashingRate": 0.1,
  "averageStakeAmount": 250,
  "highValueStakes": 3
}
```

### Prometheus Integration

Metrics exported in Prometheus format at `/api/monitoring/prometheus`:

```
# HELP staking_total_locked Total amount currently locked in stakes
# TYPE staking_total_locked gauge
staking_total_locked 50000

# HELP staking_slashing_rate Rate of stakes being slashed
# TYPE staking_slashing_rate gauge
staking_slashing_rate 0.1
```

## Multi-Signature Operations

Critical operations require multiple signatures:

### Initiating Multi-Sig Operation

```javascript
const operationId = await multiSigService.initiateOperation(
    'emergencyStakeReturn',
    {
        escrowId: 'abc123',
        reason: 'Contract bug - funds stuck'
    },
    initiatorId
);
```

### Required Signatures

| Operation | Required | Total Signers |
|-----------|----------|---------------|
| emergencyStakeReturn | 2 | 3 |
| setReputationScore | 2 | 3 |
| pauseContract | 2 | 3 |
| unpauseContract | 3 | 3 |
| updateReputationTier | 2 | 3 |

### Adding Signatures

```javascript
const result = await multiSigService.addSignature(operationId, signerId);
// Operation executes automatically when threshold reached
```

## Incident Response

### Detection

1. **Automated Alerts**:
   - Rate limit violations
   - Suspicious patterns
   - High slashing rates
   - Contract pauses

2. **Manual Review**:
   - Security event logs
   - Metrics dashboard
   - User reports

### Response Procedures

#### Level 1: Low Risk
- Monitor situation
- Review logs
- Document incident

#### Level 2: Medium Risk
- Investigate user accounts
- Apply temporary restrictions
- Escalate if needed

#### Level 3: High Risk
- Pause contract operations
- Initiate multi-sig procedures
- Contact security team
- Prepare public communication

#### Level 4: Critical
- Emergency pause all operations
- Execute emergency stake returns
- Full security audit
- Legal team involvement

### Emergency Contacts

```
Security Lead: security@clearhold.com
On-Call Engineer: +1-XXX-XXX-XXXX (PagerDuty)
Legal Team: legal@clearhold.com
```

## Security Testing

### Automated Tests

Run full security test suite:

```bash
# Smart contract security tests
npm run test:staking:contract

# API security tests
npm run test:staking:integration

# Full test suite
npm run test:staking:all
```

### Manual Security Checks

1. **Rate Limiting Verification**:
   ```bash
   # Test dispute rate limits
   for i in {1..5}; do
     curl -X POST http://localhost:3000/api/transaction/raiseDisputeWithStake \
       -H "Authorization: Bearer $TOKEN" \
       -d '{"dealId": "test", "reason": "test", "userId": "test"}'
   done
   ```

2. **Balance Validation**:
   - Attempt dispute with insufficient balance
   - Verify rejection and logging

3. **Multi-Sig Testing**:
   - Initiate emergency operation
   - Add signatures from different accounts
   - Verify execution at threshold

### Security Audit Checklist

- [ ] All stake functions have reentrancy guards
- [ ] Rate limiting active on all dispute endpoints
- [ ] Balance validation before blockchain calls
- [ ] Emergency pause mechanism tested
- [ ] Multi-sig thresholds appropriate
- [ ] Security events logged properly
- [ ] Monitoring dashboard functional
- [ ] Suspicious pattern detection working
- [ ] Error messages don't leak sensitive data
- [ ] All inputs validated and sanitized

## Operational Security

### Key Management

1. **Service Wallet**:
   - Store private key in AWS Secrets Manager
   - Rotate quarterly
   - Multi-sig for production

2. **Admin Keys**:
   - Hardware wallet storage
   - Multi-person control
   - Documented access log

### Access Control

1. **Database Access**:
   - Read replicas for analytics
   - Write access restricted
   - Audit logs enabled

2. **API Access**:
   - API keys for external services
   - JWT tokens for users
   - Rate limiting per key

### Monitoring Setup

1. **Configure Alerts**:
   ```javascript
   // monitoring.config.js
   alerts: {
     highValueStakeThreshold: 10000,
     rapidDisputeThreshold: 3,
     highSlashingRateThreshold: 0.3
   }
   ```

2. **Set Up Dashboards**:
   - Grafana for metrics visualization
   - Custom dashboard for security events
   - Real-time alert notifications

3. **Log Retention**:
   - Security events: 1 year
   - Stake operations: 6 months
   - General logs: 30 days

### Regular Maintenance

**Daily**:
- Review security alerts
- Check metrics dashboard
- Monitor slashing rates

**Weekly**:
- Analyze suspicious patterns
- Review multi-sig pending operations
- Update security documentation

**Monthly**:
- Security metric analysis
- Incident response drill
- Dependency updates

**Quarterly**:
- Full security audit
- Key rotation
- Penetration testing

## Compliance

### Data Protection

- PII encrypted at rest (AES-256)
- TLS 1.3 for data in transit
- GDPR-compliant data handling
- Right to erasure implemented

### Audit Trail

- All stake operations logged
- User actions traceable
- Immutable blockchain records
- Regulatory reporting ready

### KYC/AML

- Identity verification for high-value operations
- Transaction monitoring for suspicious patterns
- Reporting procedures documented
- Compliance officer contact established

## Conclusion

The staking mechanism implements defense-in-depth security with multiple layers of protection. Regular monitoring, testing, and updates are essential to maintain security posture. All team members should be familiar with incident response procedures and escalation paths.