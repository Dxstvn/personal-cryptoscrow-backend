# Smart Contracts (`src/contract`)

## Overview

This directory contains the Solidity smart contracts that power the on-chain escrow logic for the CryptoEscrow platform. The primary contract, `PropertyEscrow.sol`, is developed and deployed using the Hardhat framework to Ethereum-compatible networks.

**Frontend Relevance**: While frontend developers don't interact directly with these contracts, understanding their behavior and state transitions is crucial for building accurate UI flows, status indicators, and user guidance. The backend synchronizes contract states to Firestore, which the frontend consumes via real-time listeners.

## Directory Structure

### **`contracts/`**
- **`PropertyEscrow.sol`**: Core escrow smart contract handling funds, state transitions, and dispute resolution

### **`scripts/`**
- **`deploy.js`**: Contract deployment scripts for different networks
- **`verify.js`**: Contract verification on block explorers

### **`test/`**
- **Unit Tests**: Comprehensive testing for all contract functions
- **Integration Tests**: Multi-contract interaction testing
- **Edge Case Tests**: Boundary condition and error testing

### **`hardhat.config.js`**
- Network configurations (Ethereum Mainnet, Sepolia, Polygon, etc.)
- Solidity compiler settings
- Plugin configurations for verification and gas reporting

### **`artifacts/`** ⚠️ **Critical for Backend**
- **Contract ABIs**: JSON interfaces the backend uses to interact with contracts
- **Bytecode**: Compiled contract code for deployment
- **Contract metadata**: Additional deployment information

## PropertyEscrow.sol Contract

### **Core Purpose**
The `PropertyEscrow.sol` contract provides trustless escrow functionality with the following features:

### **Key Functions**

#### **Deposit & State Management**
- `depositFunds()` - Buyer deposits escrow amount
- `confirmConditionsMet()` - Buyer confirms off-chain conditions fulfilled
- `startFinalApprovalPeriod()` - Initiates time-locked approval period

#### **Dispute Resolution**
- `raiseDispute()` - Buyer can dispute during final approval
- `resolveDisputeAndRefulfillConditions()` - Buyer re-confirms conditions
- `cancelEscrowAndRefund()` - Returns funds to buyer after dispute timeout

#### **Fund Release**
- `releaseFunds()` - Releases funds to seller
- `releaseFundsAfterApprovalPeriod()` - Automated release after 48 hours
- `emergencyRefund()` - Emergency fund recovery (admin only)

### **Contract States & Frontend Integration**

#### **State Flow Diagram**
```
AWAITING_DEPOSIT
       ↓ (buyer deposits)
AWAITING_FULFILLMENT
       ↓ (buyer confirms conditions)
READY_FOR_FINAL_APPROVAL
       ↓ (final approval started)
IN_FINAL_APPROVAL (48 hours)
       ↓ (no dispute)          ↓ (dispute raised)
   COMPLETED               IN_DISPUTE (7 days)
                                ↓ (timeout)
                            CANCELLED
```

#### **Frontend State Handling**

**`AWAITING_DEPOSIT`**
- **UI**: Show deposit instructions, contract address, amount required
- **Actions**: Guide user to send ETH to contract
- **Monitoring**: Watch for deposit transaction confirmation

**`AWAITING_FULFILLMENT`**
- **UI**: Display condition checklist for buyer
- **Actions**: Enable condition marking interface
- **Backend Sync**: Use `/transaction/:id/conditions/:conditionId/buyer-review`

**`READY_FOR_FINAL_APPROVAL`**
- **UI**: Show "Ready for Final Approval" status
- **Actions**: Enable final approval start button
- **User Guidance**: Explain what final approval means

**`IN_FINAL_APPROVAL`**
- **UI**: Show 48-hour countdown timer
- **Actions**: Enable dispute button for buyer only
- **Critical**: Explain consequences of no action (auto-release)

**`IN_DISPUTE`**
- **UI**: Show 7-day dispute resolution countdown
- **Actions**: Guide buyer through condition re-fulfillment
- **Warning**: Explain auto-cancellation if unresolved

**`COMPLETED`**
- **UI**: Show success message, transaction hash
- **Actions**: Enable new deal creation
- **Display**: Final transaction details and timeline

**`CANCELLED`**
- **UI**: Show cancellation reason, refund transaction
- **Actions**: Enable new deal creation
- **Support**: Provide customer support contact

### **Event Monitoring**

The contract emits events that the backend monitors:

```solidity
event FundsDeposited(address indexed buyer, uint256 amount);
event ConditionsMet(address indexed buyer);
event FinalApprovalStarted(uint256 deadline);
event DisputeRaised(address indexed buyer, string reason);
event FundsReleased(address indexed seller, uint256 amount);
event EscrowCancelled(address indexed buyer, uint256 refundAmount);
```

**Frontend Integration**: These events trigger backend updates, which sync to Firestore and update the frontend via real-time listeners.

## Deployment & Network Support

### **Supported Networks**
- **Ethereum Mainnet**: Production escrow transactions
- **Sepolia Testnet**: Development and testing
- **Polygon Mainnet**: Lower gas fee alternative
- **Polygon Mumbai**: Polygon testing
- **BSC Mainnet**: Binance Smart Chain support
- **BSC Testnet**: BSC development environment

### **Deployment Process**
1. **Backend Triggers**: New deal creation calls `contractDeployer.js`
2. **Contract Deployment**: Unique contract instance per deal
3. **Address Storage**: Contract address saved to Firestore deal document
4. **Frontend Display**: Show contract address to users for transparency

### **Gas Optimization**
- **Efficient State Management**: Minimal storage operations
- **Batch Operations**: Combined function calls where possible
- **Event-Driven**: Use events for state change notifications
- **Proxy Patterns**: Upgradeable contracts for future improvements

## Security Features

### **Access Control**
- **Buyer-Only Functions**: Deposit, condition confirmation, disputes
- **Seller-Only Functions**: Fund release (after approval period)
- **Time-Based Locks**: Automated deadline enforcement
- **Admin Functions**: Emergency controls with multi-sig requirements

### **Reentrancy Protection**
- **ReentrancyGuard**: Prevents reentrant attacks
- **State Checks**: Proper state validation before external calls
- **Pull Pattern**: Safe fund withdrawal mechanisms

### **Input Validation**
- **Amount Checks**: Validate deposit amounts and addresses
- **State Validation**: Ensure valid state transitions
- **Time Validation**: Prevent manipulation of deadlines

## Testing & Quality Assurance

### **Test Coverage Areas**
- **Happy Path**: Normal escrow completion flow
- **Dispute Scenarios**: Various dispute and resolution paths
- **Edge Cases**: Boundary conditions and invalid inputs
- **Gas Analysis**: Optimization and cost measurement
- **Security Tests**: Attack vector prevention

### **Frontend Testing Integration**
```javascript
// Example: Testing contract state changes
const testContractStateSync = async () => {
  // 1. Deploy test contract
  const contract = await deployTestContract();
  
  // 2. Monitor Firestore for updates
  const dealRef = doc(db, 'deals', testDealId);
  const unsubscribe = onSnapshot(dealRef, (doc) => {
    expect(doc.data().status).toBe('AWAITING_DEPOSIT');
  });
  
  // 3. Perform contract interaction
  await contract.depositFunds({ value: depositAmount });
  
  // 4. Verify frontend receives update
  await waitFor(() => {
    expect(screen.getByText('Funds Deposited')).toBeInTheDocument();
  });
};
```

## Development Workflow

### **Contract Development**
1. **Edit Contracts**: Modify `.sol` files in `contracts/`
2. **Compile**: Run `npx hardhat compile` to generate artifacts
3. **Test**: Execute `npx hardhat test` for validation
4. **Deploy**: Use network-specific deployment scripts

### **Frontend Integration Workflow**
1. **Contract Change**: Developer modifies contract
2. **Recompile**: Generate new ABI artifacts
3. **Backend Update**: Update contract interaction code
4. **Test Integration**: Verify frontend state synchronization
5. **Deploy**: Release updated contract and backend

### **Environment Management**
```bash
# Local development with Hardhat Network
npm run node:local

# Testnet deployment
npm run deploy:sepolia

# Mainnet deployment (production)
npm run deploy:mainnet

# Contract verification
npm run verify:etherscan
```

## Contract Interaction Examples

### **Backend Integration**
```javascript
// Example: Backend monitoring contract events
const contractInstance = new ethers.Contract(
  contractAddress, 
  PropertyEscrowABI, 
  provider
);

contractInstance.on('FundsDeposited', async (buyer, amount, event) => {
  // Update Firestore deal status
  await updateDealStatus(dealId, 'AWAITING_FULFILLMENT');
  
  // Add timeline event
  await addTimelineEvent(dealId, {
    event: 'Funds deposited',
    amount: ethers.formatEther(amount),
    txHash: event.transactionHash,
    timestamp: new Date()
  });
});
```

### **Frontend State Synchronization**
```javascript
// Example: Frontend listening to backend updates
const DealStatusComponent = ({ dealId }) => {
  const [dealData, setDealData] = useState(null);
  
  useEffect(() => {
    const unsubscribe = onSnapshot(
      doc(db, 'deals', dealId),
      (doc) => {
        const data = doc.data();
        setDealData(data);
        
        // Update UI based on contract state
        switch(data.status) {
          case 'AWAITING_DEPOSIT':
            showDepositInterface(data.smartContractAddress);
            break;
          case 'IN_FINAL_APPROVAL':
            startCountdownTimer(data.finalApprovalDeadline);
            break;
          // Handle all states...
        }
      }
    );
    
    return unsubscribe;
  }, [dealId]);
  
  return <DealInterface dealData={dealData} />;
};
```

## Troubleshooting & Debugging

### **Common Issues**

**Contract Deployment Failures**
- Check gas limits and network congestion
- Verify deployer wallet has sufficient ETH
- Ensure constructor parameters are correct

**State Synchronization Issues**
- Verify backend event listeners are active
- Check Firestore security rules
- Monitor network connectivity

**Transaction Failures**
- Validate wallet connections and network
- Check gas estimation and limits
- Verify contract state allows the operation

### **Debugging Tools**
- **Hardhat Console**: Interactive contract testing
- **Etherscan**: Transaction and contract verification
- **Tenderly**: Advanced debugging and simulation
- **OpenZeppelin Defender**: Contract monitoring

## Future Enhancements

### **Planned Contract Improvements**
- **Multi-Token Support**: ERC20 token escrows
- **Partial Releases**: Milestone-based fund releases
- **Oracle Integration**: External condition verification
- **Governance**: Decentralized dispute resolution

### **Frontend Integration Roadmap**
- **Web3 Modal**: Simplified wallet connection
- **Transaction Simulation**: Preview outcomes before execution
- **Gas Estimation**: Real-time gas price optimization
- **Mobile Wallet**: Enhanced mobile app integration

---

**Critical Frontend Integration Points**:

1. **Real-time State Sync**: Always use Firestore listeners for contract state updates
2. **User Guidance**: Provide clear instructions for each contract interaction
3. **Transaction Monitoring**: Show transaction status and confirmations
4. **Error Handling**: Graceful handling of failed transactions
5. **Gas Management**: Display gas costs and optimization tips
6. **Security Warnings**: Alert users about irreversible actions
7. **Deadline Awareness**: Clear countdown timers for time-sensitive operations
