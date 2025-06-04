import { getAdminApp } from '../api/routes/auth/admin.js';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

// Helper function to get database
async function getDb() {
  const adminApp = await getAdminApp();
  return getFirestore(adminApp);
}

// Network configurations
const NETWORK_CONFIG = {
  ethereum: {
    chainId: 1,
    isEVM: true,
    rpcUrl: process.env.ETHEREUM_RPC_URL || 'https://mainnet.infura.io/v3/YOUR_KEY',
    nativeCurrency: 'ETH'
  },
  polygon: {
    chainId: 137,
    isEVM: true,
    rpcUrl: process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com',
    nativeCurrency: 'MATIC'
  },
  bsc: {
    chainId: 56,
    isEVM: true,
    rpcUrl: process.env.BSC_RPC_URL || 'https://bsc-dataseed.binance.org',
    nativeCurrency: 'BNB'
  },
  solana: {
    isEVM: false,
    rpcUrl: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
    nativeCurrency: 'SOL'
  },
  bitcoin: {
    isEVM: false,
    rpcUrl: process.env.BITCOIN_RPC_URL || 'https://blockstream.info/api',
    nativeCurrency: 'BTC'
  }
};

// Bridge configurations for cross-chain transactions
const BRIDGE_CONFIG = {
  'ethereum-polygon': {
    bridge: 'polygon-bridge',
    estimatedTime: '7-30 minutes',
    fees: '0.001-0.01 ETH'
  },
  'ethereum-bsc': {
    bridge: 'multichain',
    estimatedTime: '10-30 minutes', 
    fees: '0.002-0.02 ETH'
  },
  'ethereum-solana': {
    bridge: 'wormhole',
    estimatedTime: '15-45 minutes',
    fees: '0.005-0.05 ETH'
  },
  'polygon-solana': {
    bridge: 'allbridge',
    estimatedTime: '20-60 minutes',
    fees: '0.1-1 MATIC'
  }
};

/**
 * Check if two networks are EVM compatible
 */
export function areNetworksEVMCompatible(sourceNetwork, targetNetwork) {
  const sourceConfig = NETWORK_CONFIG[sourceNetwork];
  const targetConfig = NETWORK_CONFIG[targetNetwork];
  
  if (!sourceConfig || !targetConfig) {
    return false;
  }
  
  return sourceConfig.isEVM && targetConfig.isEVM;
}

/**
 * Get bridge information for cross-chain transaction
 */
export function getBridgeInfo(sourceNetwork, targetNetwork) {
  if (areNetworksEVMCompatible(sourceNetwork, targetNetwork)) {
    return null; // No bridge needed for EVM-to-EVM
  }
  
  const bridgeKey = `${sourceNetwork}-${targetNetwork}`;
  const reverseBridgeKey = `${targetNetwork}-${sourceNetwork}`;
  
  return BRIDGE_CONFIG[bridgeKey] || BRIDGE_CONFIG[reverseBridgeKey] || null;
}

/**
 * Estimate transaction fees for cross-chain transaction
 */
export async function estimateTransactionFees(sourceNetwork, targetNetwork, amount) {
  try {
    const sourceConfig = NETWORK_CONFIG[sourceNetwork];
    const targetConfig = NETWORK_CONFIG[targetNetwork];
    
    if (!sourceConfig || !targetConfig) {
      throw new Error('Unsupported network');
    }

    let estimatedFees = {
      sourceNetworkFee: '0.001', // Default gas fee
      targetNetworkFee: '0.001',
      bridgeFee: '0',
      totalEstimatedFee: '0.002'
    };

    if (areNetworksEVMCompatible(sourceNetwork, targetNetwork)) {
      // EVM-to-EVM transaction
      estimatedFees.sourceNetworkFee = '0.002';
      estimatedFees.targetNetworkFee = '0.001';
      estimatedFees.totalEstimatedFee = '0.003';
    } else {
      // Cross-chain bridge required
      const bridgeInfo = getBridgeInfo(sourceNetwork, targetNetwork);
      if (bridgeInfo) {
        estimatedFees.bridgeFee = '0.01'; // Estimated bridge fee
        estimatedFees.totalEstimatedFee = '0.021';
      }
    }

    return estimatedFees;
  } catch (error) {
    console.error('[CROSS-CHAIN] Error estimating fees:', error);
    throw error;
  }
}

/**
 * Prepare cross-chain transaction data with deal integration
 */
export async function prepareCrossChainTransaction(params) {
  try {
    const {
      fromAddress,
      toAddress,
      amount,
      sourceNetwork,
      targetNetwork,
      dealId,
      userId
    } = params;

    // Validate networks
    if (!NETWORK_CONFIG[sourceNetwork] || !NETWORK_CONFIG[targetNetwork]) {
      throw new Error('Unsupported network');
    }

    // Check if bridge is needed
    const needsBridge = !areNetworksEVMCompatible(sourceNetwork, targetNetwork);
    const bridgeInfo = needsBridge ? getBridgeInfo(sourceNetwork, targetNetwork) : null;

    // Estimate fees
    const feeEstimate = await estimateTransactionFees(sourceNetwork, targetNetwork, amount);

    // Prepare transaction object with deal integration
    const transaction = {
      id: `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      dealId,
      userId,
      fromAddress,
      toAddress,
      amount,
      sourceNetwork,
      targetNetwork,
      needsBridge,
      bridgeInfo,
      feeEstimate,
      status: 'prepared',
      createdAt: new Date(),
      // Enhanced steps for deal integration
      steps: needsBridge 
        ? [
            { 
              step: 1, 
              action: 'lock_funds_source', 
              status: 'pending',
              description: `Lock ${amount} ${NETWORK_CONFIG[sourceNetwork].nativeCurrency} on ${sourceNetwork}`,
              conditionMapping: 'cross_chain_funds_locked'
            },
            { 
              step: 2, 
              action: 'bridge_transfer', 
              status: 'pending',
              description: `Bridge transfer via ${bridgeInfo.bridge}`,
              conditionMapping: 'cross_chain_bridge_transfer'
            },
            { 
              step: 3, 
              action: 'release_funds_target', 
              status: 'pending',
              description: `Release funds on ${targetNetwork}`,
              conditionMapping: 'cross_chain_bridge_setup'
            }
          ]
        : [
            { 
              step: 1, 
              action: 'direct_transfer', 
              status: 'pending',
              description: `Direct transfer: ${sourceNetwork} → ${targetNetwork}`,
              conditionMapping: 'cross_chain_funds_locked'
            }
          ],
      // Deal integration fields
      dealConditions: [],
      autoFulfillConditions: true,
      metadata: {
        dealType: 'property_escrow',
        integratedWithBackend: true,
        createdVia: 'deal_creation'
      }
    };

    // Store transaction in database with enhanced deal linking
    const db = await getDb();
    await db.collection('crossChainTransactions').doc(transaction.id).set({
      ...transaction,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });

    console.log(`[CROSS-CHAIN] Prepared integrated transaction:`, {
      id: transaction.id,
      dealId,
      sourceNetwork,
      targetNetwork,
      needsBridge,
      amount
    });

    return transaction;
  } catch (error) {
    console.error('[CROSS-CHAIN] Error preparing transaction:', error);
    throw error;
  }
}

/**
 * Execute cross-chain transaction step with deal condition integration
 */
export async function executeCrossChainStep(transactionId, stepNumber, txHash = null) {
  try {
    const db = await getDb();
    const transactionRef = db.collection('crossChainTransactions').doc(transactionId);
    const transactionDoc = await transactionRef.get();

    if (!transactionDoc.exists) {
      throw new Error('Transaction not found');
    }

    const transaction = transactionDoc.data();
    const steps = [...transaction.steps];

    // Update the specific step
    const stepIndex = steps.findIndex(s => s.step === stepNumber);
    if (stepIndex === -1) {
      throw new Error('Step not found');
    }

    const previousStatus = steps[stepIndex].status;
    steps[stepIndex] = {
      ...steps[stepIndex],
      status: 'completed',
      txHash,
      completedAt: FieldValue.serverTimestamp(),
      executedBy: transaction.userId
    };

    // Check if all steps are completed
    const allStepsCompleted = steps.every(s => s.status === 'completed');
    const newStatus = allStepsCompleted ? 'completed' : 'in_progress';

    // Update transaction
    await transactionRef.update({
      steps,
      status: newStatus,
      updatedAt: FieldValue.serverTimestamp(),
      ...(allStepsCompleted && { completedAt: FieldValue.serverTimestamp() }),
      ...(previousStatus === 'pending' && { firstStepCompletedAt: FieldValue.serverTimestamp() })
    });

    // If deal is linked, update corresponding conditions
    if (transaction.dealId && transaction.autoFulfillConditions) {
      await updateDealConditionsFromStep(transaction.dealId, steps[stepIndex], allStepsCompleted);
    }

    console.log(`[CROSS-CHAIN] Updated transaction ${transactionId} step ${stepNumber} (${steps[stepIndex].action})`);

    return { 
      success: true, 
      status: newStatus, 
      stepCompleted: steps[stepIndex],
      allStepsCompleted 
    };
  } catch (error) {
    console.error('[CROSS-CHAIN] Error executing step:', error);
    throw error;
  }
}

/**
 * Update deal conditions based on cross-chain step completion
 */
async function updateDealConditionsFromStep(dealId, completedStep, allStepsCompleted) {
  try {
    const db = await getDb();
    const dealRef = db.collection('deals').doc(dealId);
    const dealDoc = await dealRef.get();

    if (!dealDoc.exists) {
      console.warn(`[CROSS-CHAIN] Deal ${dealId} not found for condition update`);
      return;
    }

    const dealData = dealDoc.data();
    const conditions = [...dealData.conditions];
    let updated = false;

    // Update specific condition based on step mapping
    if (completedStep.conditionMapping) {
      const conditionIndex = conditions.findIndex(c => c.id === completedStep.conditionMapping);
      if (conditionIndex !== -1 && conditions[conditionIndex].status === 'PENDING_BUYER_ACTION') {
        conditions[conditionIndex] = {
          ...conditions[conditionIndex],
          status: 'FULFILLED_BY_BUYER',
          updatedAt: FieldValue.serverTimestamp(),
          autoFulfilledBy: 'cross_chain_system',
          crossChainTxHash: completedStep.txHash,
          fulfillmentNote: `Auto-fulfilled by cross-chain step: ${completedStep.description}`
        };
        updated = true;
      }
    }

    // If all steps completed, update network validation condition
    if (allStepsCompleted) {
      const networkValidationIndex = conditions.findIndex(c => c.id === 'cross_chain_network_validation');
      if (networkValidationIndex !== -1 && conditions[networkValidationIndex].status === 'PENDING_BUYER_ACTION') {
        conditions[networkValidationIndex] = {
          ...conditions[networkValidationIndex],
          status: 'FULFILLED_BY_BUYER',
          updatedAt: FieldValue.serverTimestamp(),
          autoFulfilledBy: 'cross_chain_system',
          fulfillmentNote: 'Auto-fulfilled: Cross-chain transaction completed successfully'
        };
        updated = true;
      }
    }

    if (updated) {
      await dealRef.update({
        conditions,
        timeline: FieldValue.arrayUnion({
          event: `Cross-chain condition auto-updated: ${completedStep.description}`,
          timestamp: FieldValue.serverTimestamp(),
          system: true,
          crossChainStep: completedStep.step
        }),
        updatedAt: FieldValue.serverTimestamp()
      });

      console.log(`[CROSS-CHAIN] Updated deal ${dealId} conditions from step completion`);
    }
  } catch (error) {
    console.error('[CROSS-CHAIN] Error updating deal conditions:', error);
  }
}

/**
 * Get cross-chain transaction status with deal integration info
 */
export async function getCrossChainTransactionStatus(transactionId) {
  try {
    const db = await getDb();
    const transactionDoc = await db.collection('crossChainTransactions').doc(transactionId).get();

    if (!transactionDoc.exists) {
      throw new Error('Transaction not found');
    }

    const transaction = transactionDoc.data();

    // If deal is linked, get deal status
    let dealStatus = null;
    if (transaction.dealId) {
      const dealDoc = await db.collection('deals').doc(transaction.dealId).get();
      if (dealDoc.exists) {
        const dealData = dealDoc.data();
        dealStatus = {
          dealId: transaction.dealId,
          dealStatus: dealData.status,
          crossChainConditions: dealData.conditions.filter(c => c.type === 'CROSS_CHAIN'),
          allConditionsFulfilled: dealData.conditions.every(c => c.status === 'FULFILLED_BY_BUYER')
        };
      }
    }

    return {
      ...transaction,
      dealStatus,
      progressPercentage: calculateProgressPercentage(transaction.steps),
      nextAction: getNextAction(transaction.steps, transaction.status)
    };
  } catch (error) {
    console.error('[CROSS-CHAIN] Error getting transaction status:', error);
    throw error;
  }
}

/**
 * Calculate progress percentage based on completed steps
 */
function calculateProgressPercentage(steps) {
  if (!steps || steps.length === 0) return 0;
  const completedSteps = steps.filter(s => s.status === 'completed').length;
  return Math.round((completedSteps / steps.length) * 100);
}

/**
 * Get next action for the user
 */
function getNextAction(steps, status) {
  if (status === 'completed') return 'Transaction completed';
  if (status === 'failed') return 'Transaction failed - manual intervention required';
  
  const nextStep = steps.find(s => s.status === 'pending');
  return nextStep ? `Next: ${nextStep.description}` : 'All steps in progress';
}

/**
 * Link existing cross-chain transaction to a deal
 */
export async function linkTransactionToDeal(transactionId, dealId, userId) {
  try {
    const db = await getDb();
    
    await db.collection('crossChainTransactions').doc(transactionId).update({
      dealId,
      linkedAt: FieldValue.serverTimestamp(),
      linkedBy: userId,
      metadata: {
        ...this.metadata,
        linkedToDeal: true,
        linkMethod: 'manual'
      }
    });

    console.log(`[CROSS-CHAIN] Linked transaction ${transactionId} to deal ${dealId}`);
    return { success: true };
  } catch (error) {
    console.error('[CROSS-CHAIN] Error linking transaction to deal:', error);
    throw error;
  }
}

/**
 * Get all cross-chain transactions for a specific deal
 */
export async function getCrossChainTransactionsForDeal(dealId) {
  try {
    const db = await getDb();
    const querySnapshot = await db.collection('crossChainTransactions')
      .where('dealId', '==', dealId)
      .orderBy('createdAt', 'desc')
      .get();

    const transactions = [];
    querySnapshot.forEach(doc => {
      transactions.push({
        id: doc.id,
        ...doc.data()
      });
    });

    return transactions;
  } catch (error) {
    console.error('[CROSS-CHAIN] Error getting transactions for deal:', error);
    throw error;
  }
}

export default {
  areNetworksEVMCompatible,
  getBridgeInfo,
  estimateTransactionFees,
  prepareCrossChainTransaction,
  executeCrossChainStep,
  getCrossChainTransactionStatus,
  linkTransactionToDeal,
  getCrossChainTransactionsForDeal
}; 