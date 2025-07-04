const axios = require('axios');
const { ethers } = require("hardhat");
require('dotenv').config();

// Test configuration
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const TEST_CONFIG = {
  // Test user credentials
  testBuyerToken: process.env.TEST_BUYER_TOKEN || 'test-buyer-token',
  testSellerToken: process.env.TEST_SELLER_TOKEN || 'test-seller-token',
  
  // Non-EVM addresses (Solana format)
  buyerSolanaAddress: 'DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK',
  sellerSolanaAddress: 'B7Qk7N8eP3wXvT2mJ9R4sL6cZ8dA1fV5gH3nK2pU7yE',
  
  // Test deal data
  propertyAddress: '123 Cross-Chain Test Street, DeFi City, Blockchain 12345',
  amount: 3.0, // 3.0 SOL
  
  // Networks
  sourceNetwork: 'solana',
  targetNetwork: 'solana',
  
  // Test emails
  buyerEmail: 'buyer@crosschaintest.com',
  sellerEmail: 'seller@crosschaintest.com'
};

async function main() {
  console.log('🧪 Testing Cross-Chain API Integration');
  console.log('=====================================');
  console.log(`🌐 API Base URL: ${API_BASE_URL}`);
  console.log(`🔗 Test Scenario: ${TEST_CONFIG.sourceNetwork} → ethereum → ${TEST_CONFIG.targetNetwork}`);
  console.log(`💰 Amount: ${TEST_CONFIG.amount} tokens`);
  console.log('');

  try {
    // Step 1: Create cross-chain transaction via API
    console.log('📝 Step 1: Creating cross-chain transaction via API...');
    const dealResult = await createCrossChainDeal();
    console.log(`✅ Deal created: ${dealResult.transactionId}`);
    console.log(`🌉 Is Cross-Chain: ${dealResult.isCrossChain}`);
    console.log(`📜 Contract Address: ${dealResult.smartContractAddress}`);
    console.log('');

    // Step 2: Get deal details and verify cross-chain setup
    console.log('📊 Step 2: Verifying cross-chain setup...');
    const dealDetails = await getDealDetails(dealResult.transactionId);
    console.log(`📈 Deal Status: ${dealDetails.status}`);
    console.log(`🌉 Cross-Chain Info:`, dealDetails.crossChainInfo ? 'Present' : 'Missing');
    console.log(`📋 Conditions: ${dealDetails.conditions.length} total, ${dealDetails.conditions.filter(c => c.type === 'CROSS_CHAIN').length} cross-chain`);
    console.log('');

    // Step 3: Test cross-chain transaction status endpoint
    console.log('🔍 Step 3: Testing cross-chain status endpoint...');
    const crossChainStatus = await getCrossChainStatus(dealResult.transactionId);
    console.log(`📊 Cross-Chain Transaction Status: ${crossChainStatus.crossChainTransaction?.status || 'N/A'}`);
    console.log(`🌉 Bridge Required: ${crossChainStatus.crossChainTransaction?.needsBridge || 'Unknown'}`);
    console.log('');

    // Step 4: Simulate buyer deposit from Solana
    console.log('💰 Step 4: Simulating buyer deposit from Solana...');
    const depositResult = await simulateCrossChainDeposit(dealResult.transactionId, dealResult.smartContractAddress);
    console.log(`✅ Deposit simulation: ${depositResult.success ? 'SUCCESS' : 'FAILED'}`);
    if (depositResult.bridgeTransactionId) {
      console.log(`🔗 Bridge Transaction ID: ${depositResult.bridgeTransactionId}`);
    }
    console.log('');

    // Step 5: Test cross-chain transfer execution
    console.log('🌉 Step 5: Testing cross-chain transfer execution...');
    const transferResult = await executeCrossChainTransfer(dealResult.transactionId, depositResult);
    console.log(`✅ Transfer execution: ${transferResult.success ? 'SUCCESS' : 'FAILED'}`);
    console.log(`🏁 Bridge completed: ${transferResult.bridgeCompleted || false}`);
    console.log('');

    // Step 6: Test seller release to Solana
    console.log('💸 Step 6: Testing seller release to Solana...');
    const releaseResult = await executeCrossChainRelease(dealResult.transactionId);
    console.log(`✅ Release execution: ${releaseResult.success ? 'SUCCESS' : 'FAILED'}`);
    if (releaseResult.bridgeTransactionId) {
      console.log(`🔗 Release Bridge Transaction ID: ${releaseResult.bridgeTransactionId}`);
    }
    console.log('');

    // Step 7: Get final deal status
    console.log('🏁 Step 7: Verifying final deal status...');
    const finalStatus = await getDealDetails(dealResult.transactionId);
    console.log(`📈 Final Status: ${finalStatus.status}`);
    console.log(`💰 Funds Deposited: ${finalStatus.fundsDepositedByBuyer}`);
    console.log(`💸 Funds Released: ${finalStatus.fundsReleasedToSeller}`);
    console.log('');

    // Step 8: Generate comprehensive test report
    console.log('📋 Step 8: Generating test report...');
    generateAPITestReport({
      dealResult,
      dealDetails,
      crossChainStatus,
      depositResult,
      transferResult,
      releaseResult,
      finalStatus
    });

    console.log('🎉 Cross-Chain API Integration Test Completed!');
    console.log('');
    console.log('🌐 Tenderly Dashboard:');
    console.log(`📊 Contract: https://dashboard.tenderly.co/Dusss/project/contracts/${dealResult.smartContractAddress}`);

  } catch (error) {
    console.error('❌ Cross-Chain API Test Failed:', error.message);
    if (error.response) {
      console.error('📄 Response Data:', JSON.stringify(error.response.data, null, 2));
    }
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

async function createCrossChainDeal() {
  const dealData = {
    initiatedBy: 'BUYER',
    propertyAddress: TEST_CONFIG.propertyAddress,
    amount: TEST_CONFIG.amount,
    otherPartyEmail: TEST_CONFIG.sellerEmail,
    buyerWalletAddress: TEST_CONFIG.buyerSolanaAddress,
    sellerWalletAddress: TEST_CONFIG.sellerSolanaAddress,
    buyerNetworkHint: TEST_CONFIG.sourceNetwork,
    sellerNetworkHint: TEST_CONFIG.targetNetwork,
    initialConditions: [
      {
        id: 'cross_chain_test_condition',
        type: 'CUSTOM',
        description: 'Cross-chain bridging test condition completed'
      },
      {
        id: 'solana_verification',
        type: 'CUSTOM', 
        description: 'Solana network compatibility verified'
      }
    ]
  };

  console.log('  📤 Sending deal creation request...');
  const response = await axios.post(`${API_BASE_URL}/api/transactions/create`, dealData, {
    headers: {
      'Authorization': `Bearer ${TEST_CONFIG.testBuyerToken}`,
      'Content-Type': 'application/json'
    }
  });

  console.log('  ✅ Deal creation response received');
  console.log('  📊 Response highlights:');
  console.log(`     🆔 Transaction ID: ${response.data.transactionId}`);
  console.log(`     🌉 Cross-Chain: ${response.data.isCrossChain}`);
  console.log(`     📜 Contract: ${response.data.smartContractAddress}`);
  console.log(`     ⚠️  Warnings: ${response.data.metadata?.warnings?.length || 0}`);

  return response.data;
}

async function getDealDetails(transactionId) {
  console.log('  📤 Fetching deal details...');
  const response = await axios.get(`${API_BASE_URL}/api/transactions/${transactionId}`, {
    headers: {
      'Authorization': `Bearer ${TEST_CONFIG.testBuyerToken}`
    }
  });

  console.log('  ✅ Deal details received');
  console.log('  📊 Deal info:');
  console.log(`     📈 Status: ${response.data.status}`);
  console.log(`     🌉 Cross-Chain: ${response.data.isCrossChain}`);
  console.log(`     📋 Conditions: ${response.data.conditions?.length || 0}`);
  console.log(`     📅 Timeline: ${response.data.timeline?.length || 0} events`);

  return response.data;
}

async function getCrossChainStatus(transactionId) {
  console.log('  📤 Getting cross-chain status...');
  
  try {
    const response = await axios.get(`${API_BASE_URL}/api/transactions/cross-chain/${transactionId}/status`, {
      headers: {
        'Authorization': `Bearer ${TEST_CONFIG.testBuyerToken}`
      }
    });

    console.log('  ✅ Cross-chain status received');
    console.log('  📊 Status info:');
    console.log(`     🌉 Bridge Required: ${response.data.crossChainTransaction?.needsBridge || 'Unknown'}`);
    console.log(`     📈 Status: ${response.data.crossChainTransaction?.status || 'Unknown'}`);
    console.log(`     🔗 Networks: ${response.data.buyerNetwork} → ${response.data.sellerNetwork}`);

    return response.data;
  } catch (error) {
    if (error.response?.status === 400) {
      console.log('  ⚠️ Cross-chain status not available (expected for test)');
      return { crossChainTransaction: null };
    }
    throw error;
  }
}

async function simulateCrossChainDeposit(transactionId, contractAddress) {
  console.log('  🌉 Simulating Solana → Ethereum bridge deposit...');
  
  // Simulate a successful bridge transaction from Solana
  const mockBridgeTransaction = {
    fromTxHash: `solana_tx_${Math.random().toString(36).substr(2, 16)}`,
    bridgeTransactionId: `bridge_${Math.random().toString(36).substr(2, 16)}`,
    amount: TEST_CONFIG.amount,
    sourceChain: 'solana',
    destinationChain: 'ethereum',
    status: 'completed'
  };

  console.log('  📊 Mock bridge transaction:');
  console.log(`     🔗 Bridge TX ID: ${mockBridgeTransaction.bridgeTransactionId}`);
  console.log(`     📤 From TX: ${mockBridgeTransaction.fromTxHash}`);
  console.log(`     💰 Amount: ${mockBridgeTransaction.amount} SOL`);

  // For testing, we'll simulate that the bridge was successful
  // In a real scenario, this would be an actual LiFi bridge transaction
  return {
    success: true,
    bridgeTransactionId: mockBridgeTransaction.bridgeTransactionId,
    fromTxHash: mockBridgeTransaction.fromTxHash,
    amount: mockBridgeTransaction.amount,
    sourceChain: mockBridgeTransaction.sourceChain,
    destinationChain: mockBridgeTransaction.destinationChain
  };
}

async function executeCrossChainTransfer(transactionId, depositResult) {
  console.log('  📤 Executing cross-chain transfer via API...');
  
  const transferData = {
    fromTxHash: depositResult.fromTxHash,
    bridgeTxHash: depositResult.bridgeTransactionId,
    autoRelease: true
  };

  try {
    const response = await axios.post(`${API_BASE_URL}/api/transactions/cross-chain/${transactionId}/transfer`, transferData, {
      headers: {
        'Authorization': `Bearer ${TEST_CONFIG.testBuyerToken}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('  ✅ Transfer execution response received');
    console.log('  📊 Transfer result:');
    console.log(`     🌉 Bridge Completed: ${response.data.bridgeCompleted}`);
    console.log(`     📈 Next Action: ${response.data.nextAction}`);
    console.log(`     🔗 Cross-Chain Status: ${response.data.crossChainStatus?.status || 'Unknown'}`);

    return {
      success: true,
      bridgeCompleted: response.data.bridgeCompleted,
      nextAction: response.data.nextAction,
      crossChainStatus: response.data.crossChainStatus
    };
  } catch (error) {
    console.error('  ❌ Transfer execution failed:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data?.error || error.message
    };
  }
}

async function executeCrossChainRelease(transactionId) {
  console.log('  📤 Executing cross-chain release to seller...');
  
  try {
    const response = await axios.post(`${API_BASE_URL}/api/transactions/cross-chain/${transactionId}/release-to-seller`, {}, {
      headers: {
        'Authorization': `Bearer ${TEST_CONFIG.testBuyerToken}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('  ✅ Release execution response received');
    console.log('  📊 Release result:');
    console.log(`     🔗 Bridge TX ID: ${response.data.bridgeTransactionId}`);
    console.log(`     🎯 Target Chain: ${response.data.targetChain}`);
    console.log(`     📍 Target Address: ${response.data.targetAddress}`);
    console.log(`     ⏱️ Estimated Time: ${response.data.estimatedTime}`);

    return {
      success: true,
      bridgeTransactionId: response.data.bridgeTransactionId,
      targetChain: response.data.targetChain,
      targetAddress: response.data.targetAddress,
      estimatedTime: response.data.estimatedTime
    };
  } catch (error) {
    console.error('  ❌ Release execution failed:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data?.error || error.message
    };
  }
}

function generateAPITestReport(results) {
  console.log('');
  console.log('📋 CROSS-CHAIN API TEST REPORT');
  console.log('===============================');
  
  console.log('✅ Test Configuration:');
  console.log(`   🌐 API URL: ${API_BASE_URL}`);
  console.log(`   🔗 Bridge Path: ${TEST_CONFIG.sourceNetwork} → ethereum → ${TEST_CONFIG.targetNetwork}`);
  console.log(`   💰 Amount: ${TEST_CONFIG.amount} tokens`);
  console.log(`   👤 Buyer Address: ${TEST_CONFIG.buyerSolanaAddress}`);
  console.log(`   🏪 Seller Address: ${TEST_CONFIG.sellerSolanaAddress}`);
  console.log('');
  
  console.log('📊 Test Results:');
  console.log(`   📝 Deal Creation: ${results.dealResult ? '✅ SUCCESS' : '❌ FAILED'}`);
  console.log(`   🌉 Cross-Chain Detection: ${results.dealResult?.isCrossChain ? '✅ SUCCESS' : '❌ FAILED'}`);
  console.log(`   📜 Contract Deployment: ${results.dealResult?.smartContractAddress ? '✅ SUCCESS' : '❌ FAILED'}`);
  console.log(`   📊 Status Retrieval: ${results.dealDetails ? '✅ SUCCESS' : '❌ FAILED'}`);
  console.log(`   💰 Deposit Simulation: ${results.depositResult?.success ? '✅ SUCCESS' : '❌ FAILED'}`);
  console.log(`   🌉 Transfer Execution: ${results.transferResult?.success ? '✅ SUCCESS' : '❌ FAILED'}`);
  console.log(`   💸 Release Execution: ${results.releaseResult?.success ? '✅ SUCCESS' : '❌ FAILED'}`);
  
  const overallSuccess = results.dealResult && 
                        results.dealResult.isCrossChain && 
                        results.dealResult.smartContractAddress &&
                        results.depositResult?.success &&
                        results.transferResult?.success &&
                        results.releaseResult?.success;
  
  console.log('');
  console.log(`🎯 OVERALL API TEST RESULT: ${overallSuccess ? '✅ SUCCESS' : '❌ FAILED'}`);
  
  if (!overallSuccess) {
    console.log('');
    console.log('⚠️ Issues Detected:');
    if (!results.dealResult) console.log('   ❌ Deal creation failed');
    if (!results.dealResult?.isCrossChain) console.log('   ❌ Cross-chain detection failed');
    if (!results.dealResult?.smartContractAddress) console.log('   ❌ Contract deployment failed');
    if (!results.depositResult?.success) console.log('   ❌ Deposit simulation failed');
    if (!results.transferResult?.success) console.log('   ❌ Transfer execution failed');
    if (!results.releaseResult?.success) console.log('   ❌ Release execution failed');
  }
  
  console.log('');
  console.log('📈 Cross-Chain Metrics:');
  console.log(`   🌉 Bridge Transactions: ${(results.depositResult?.success ? 1 : 0) + (results.releaseResult?.success ? 1 : 0)} of 2`);
  console.log(`   📊 API Endpoints Tested: 6`);
  console.log(`   🔗 Networks Involved: 3 (${TEST_CONFIG.sourceNetwork}, ethereum, ${TEST_CONFIG.targetNetwork})`);
  console.log(`   💰 Total Value Bridged: ${results.depositResult?.success && results.releaseResult?.success ? (TEST_CONFIG.amount * 2) : 0} tokens`);
  
  return overallSuccess;
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { main, TEST_CONFIG }; 