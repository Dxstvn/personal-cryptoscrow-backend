#!/usr/bin/env node

/**
 * Simple integration test for Tenderly Virtual TestNet without Jest
 */

import { prepareCrossChainTransaction, executeCrossChainStep } from '../src/services/crossChainService.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
function loadEnvFile(filePath) {
  try {
    const envContent = readFileSync(filePath, 'utf8');
    const lines = envContent.split('\n');
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine && !trimmedLine.startsWith('#')) {
        const [key, ...valueParts] = trimmedLine.split('=');
        if (key && valueParts.length > 0) {
          const value = valueParts.join('=').trim();
          if (!process.env[key]) {
            process.env[key] = value;
          }
        }
      }
    }
    return true;
  } catch (error) {
    return false;
  }
}

// Load .env.test
const envTestPath = join(__dirname, '..', '.env.test');
loadEnvFile(envTestPath);

async function testCrossChainIntegration() {
  console.log('🧪 Simple Cross-Chain Integration Test\n');

  console.log('🔍 Configuration:');
  console.log(`   RPC URL: ${process.env.RPC_URL?.substring(0, 50)}...`);
  console.log(`   Tenderly Account: ${process.env.TENDERLY_ACCOUNT_SLUG}`);
  console.log('');

  try {
    // Test 1: Prepare cross-chain transaction
    console.log('📋 Test 1: Preparing cross-chain transaction...');
    
    const crossChainTx = await prepareCrossChainTransaction({
      fromAddress: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
      toAddress: '0x742d35Cc6634C0532925a3b8D51d9bB98A42b4B2',
      amount: '1000000000000000000', // 1 ETH
      sourceNetwork: 'ethereum',
      targetNetwork: 'polygon',
      dealId: 'simple-test-001',
      userId: 'test-user',
      tokenAddress: '0x0000000000000000000000000000000000000000'
    });

    console.log('✅ Cross-chain transaction prepared successfully');
    console.log(`   Transaction ID: ${crossChainTx.id}`);
    console.log(`   Status: ${crossChainTx.status}`);
    console.log(`   Steps: ${crossChainTx.steps.length}`);

    // Test 2: Execute first step
    console.log('\n📋 Test 2: Executing first step...');
    
    const stepResult = await executeCrossChainStep(crossChainTx.id, 1);
    
    console.log('✅ Step execution completed');
    console.log(`   Step: ${stepResult.step}`);
    console.log(`   Status: ${stepResult.status}`);

    console.log('\n🎉 Simple integration test completed successfully!');
    console.log('💡 Cross-chain service is working with Tenderly Virtual TestNet');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.log('\n🔧 Error details:', error.stack);
  }
}

// Run test
testCrossChainIntegration(); 