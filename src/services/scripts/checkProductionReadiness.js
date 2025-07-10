#!/usr/bin/env node
/**
 * Production Readiness Checker for EscrowServiceV3
 * This script verifies that all components are properly configured for production
 */

import { EscrowServiceV3 } from '../escrowServiceV3.js';
import { Contract } from 'ethers';
import dotenv from 'dotenv';
import chalk from 'chalk';

dotenv.config();

const CHECKS = {
  ENVIRONMENT: '🔧 Environment Configuration',
  CONNECTIVITY: '🌐 Network Connectivity',
  CONTRACTS: '📄 Smart Contracts',
  OFT_PEERS: '🔗 OFT Adapter Peers',
  CROSS_CHAIN: '🌉 Cross-Chain Functionality',
  TOKEN_SUPPORT: '🪙 Token Support',
  GAS_ESTIMATION: '⛽ Gas Estimation'
};

class ProductionChecker {
  constructor() {
    this.service = new EscrowServiceV3();
    this.results = {};
    this.networks = [
      { chainId: 11155111, name: 'sepolia' },
      { chainId: 421614, name: 'arbitrum-sepolia' },
      { chainId: 80002, name: 'polygon-amoy' }
    ];
  }

  async initialize() {
    await this.service.initialize();
  }

  log(category, message, status = 'info') {
    const prefix = {
      pass: chalk.green('✅'),
      fail: chalk.red('❌'),
      warn: chalk.yellow('⚠️'),
      info: chalk.blue('ℹ️')
    };
    
    console.log(`  ${prefix[status]} ${message}`);
    
    if (!this.results[category]) {
      this.results[category] = { passed: 0, failed: 0, warnings: 0 };
    }
    
    if (status === 'pass') this.results[category].passed++;
    else if (status === 'fail') this.results[category].failed++;
    else if (status === 'warn') this.results[category].warnings++;
  }

  async checkEnvironment() {
    console.log(`\n${CHECKS.ENVIRONMENT}`);
    
    // Check required environment variables
    const required = [
      'SEPOLIA_RPC_URL',
      'ARBITRUM_SEPOLIA_RPC_URL',
      'POLYGON_AMOY_RPC_URL',
      'BACKEND_WALLET_PRIVATE_KEY'
    ];
    
    for (const key of required) {
      if (process.env[key]) {
        this.log('ENVIRONMENT', `${key} is configured`, 'pass');
      } else {
        this.log('ENVIRONMENT', `${key} is missing`, 'fail');
      }
    }
  }

  async checkConnectivity() {
    console.log(`\n${CHECKS.CONNECTIVITY}`);
    
    for (const network of this.networks) {
      try {
        const provider = await this.service.getProvider(network.chainId);
        const blockNumber = await provider.getBlockNumber();
        this.log('CONNECTIVITY', `Connected to ${network.name} (block ${blockNumber})`, 'pass');
      } catch (error) {
        this.log('CONNECTIVITY', `Failed to connect to ${network.name}: ${error.message}`, 'fail');
      }
    }
  }

  async checkContracts() {
    console.log(`\n${CHECKS.CONTRACTS}`);
    
    for (const network of this.networks) {
      try {
        const contract = await this.service.getContract(network.chainId);
        const code = await contract.runner.provider.getCode(contract.target);
        
        if (code && code !== '0x') {
          this.log('CONTRACTS', `V3 contract deployed on ${network.name}`, 'pass');
          
          // Check contract functions
          try {
            const serviceFee = await contract.SERVICE_FEE_BPS();
            this.log('CONTRACTS', `${network.name} service fee: ${serviceFee.toString()} BPS`, 'info');
          } catch (error) {
            this.log('CONTRACTS', `${network.name} contract may not be initialized`, 'warn');
          }
        } else {
          this.log('CONTRACTS', `No contract found on ${network.name}`, 'fail');
        }
      } catch (error) {
        this.log('CONTRACTS', `Error checking ${network.name}: ${error.message}`, 'fail');
      }
    }
  }

  async checkOFTPeers() {
    console.log(`\n${CHECKS.OFT_PEERS}`);
    
    for (const sourceNetwork of this.networks) {
      const config = this.service.getChainConfig(sourceNetwork.chainId);
      if (!config.oftAdapter) {
        this.log('OFT_PEERS', `No OFT adapter configured for ${sourceNetwork.name}`, 'fail');
        continue;
      }
      
      for (const targetNetwork of this.networks) {
        if (sourceNetwork.chainId === targetNetwork.chainId) continue;
        
        try {
          const hasPeer = await this.service.checkOFTPeer(sourceNetwork.chainId, targetNetwork.chainId);
          if (hasPeer) {
            this.log('OFT_PEERS', `${sourceNetwork.name} → ${targetNetwork.name} peer configured`, 'pass');
          } else {
            this.log('OFT_PEERS', `${sourceNetwork.name} → ${targetNetwork.name} peer missing`, 'fail');
          }
        } catch (error) {
          this.log('OFT_PEERS', `Error checking ${sourceNetwork.name} → ${targetNetwork.name}: ${error.message}`, 'fail');
        }
      }
    }
  }

  async checkCrossChainFunctionality() {
    console.log(`\n${CHECKS.CROSS_CHAIN}`);
    
    for (const sourceNetwork of this.networks) {
      for (const targetNetwork of this.networks) {
        if (sourceNetwork.chainId === targetNetwork.chainId) continue;
        
        try {
          const quote = await this.service.quoteCrossChainFee(
            sourceNetwork.chainId,
            targetNetwork.chainId,
            '1'
          );
          
          if (quote.warning || quote.error) {
            this.log('CROSS_CHAIN', 
              `${sourceNetwork.name} → ${targetNetwork.name}: ${quote.warning || quote.error}`, 
              'warn'
            );
          } else {
            this.log('CROSS_CHAIN', 
              `${sourceNetwork.name} → ${targetNetwork.name}: ${quote.nativeFee} ETH (recommended: ${quote.recommended})`, 
              'pass'
            );
          }
        } catch (error) {
          this.log('CROSS_CHAIN', 
            `${sourceNetwork.name} → ${targetNetwork.name} quote failed: ${error.message}`, 
            'fail'
          );
        }
      }
    }
  }

  async checkTokenSupport() {
    console.log(`\n${CHECKS.TOKEN_SUPPORT}`);
    
    // Check WETH on each network
    const wethAddresses = {
      11155111: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14',
      421614: '0x980B62Da83eFf3D4576C647993b0c1D7faf17c73',
      80002: '0x360ad4f9a9A8EFe9A8DCB5f461c4Cc1047E1Dcf9'
    };
    
    for (const network of this.networks) {
      const wethAddress = wethAddresses[network.chainId];
      if (!wethAddress) continue;
      
      try {
        const tokenInfo = await this.service.getTokenInfo(wethAddress, network.chainId);
        this.log('TOKEN_SUPPORT', 
          `${network.name} WETH: ${tokenInfo.symbol} (${tokenInfo.decimals} decimals)`, 
          'pass'
        );
      } catch (error) {
        this.log('TOKEN_SUPPORT', 
          `Failed to get WETH info on ${network.name}: ${error.message}`, 
          'fail'
        );
      }
    }
  }

  async checkGasEstimation() {
    console.log(`\n${CHECKS.GAS_ESTIMATION}`);
    
    // Test gas estimation for different scenarios
    const scenarios = [
      { 
        name: 'Same-chain transfer',
        sourceChainId: 11155111,
        targetChainId: 11155111,
        requiresSwap: false
      },
      {
        name: 'Cross-chain transfer',
        sourceChainId: 11155111,
        targetChainId: 80002,
        requiresSwap: false
      },
      {
        name: 'Cross-chain with swap',
        sourceChainId: 11155111,
        targetChainId: 80002,
        requiresSwap: true
      }
    ];
    
    for (const scenario of scenarios) {
      try {
        const fees = await this.service.estimateTotalFees({
          amount: '1',
          sourceChainId: scenario.sourceChainId,
          targetChainId: scenario.targetChainId,
          requiresSwap: scenario.requiresSwap
        });
        
        this.log('GAS_ESTIMATION', 
          `${scenario.name}: ${fees.total} ETH total (service: ${fees.serviceFee}, cross-chain: ${fees.crossChainFee}, gas: ${fees.gasEstimate})`,
          'pass'
        );
      } catch (error) {
        this.log('GAS_ESTIMATION', 
          `${scenario.name} failed: ${error.message}`,
          'fail'
        );
      }
    }
  }

  printSummary() {
    console.log('\n' + chalk.bold('📊 Production Readiness Summary'));
    console.log('=' .repeat(50));
    
    let totalPassed = 0;
    let totalFailed = 0;
    let totalWarnings = 0;
    
    for (const [category, results] of Object.entries(this.results)) {
      const status = results.failed > 0 ? chalk.red('FAIL') :
                    results.warnings > 0 ? chalk.yellow('WARN') :
                    chalk.green('PASS');
      
      console.log(`${CHECKS[category]} - ${status}`);
      console.log(`  Passed: ${results.passed}, Failed: ${results.failed}, Warnings: ${results.warnings}`);
      
      totalPassed += results.passed;
      totalFailed += results.failed;
      totalWarnings += results.warnings;
    }
    
    console.log('\n' + chalk.bold('Overall Results:'));
    console.log(`  Total Passed: ${chalk.green(totalPassed)}`);
    console.log(`  Total Failed: ${chalk.red(totalFailed)}`);
    console.log(`  Total Warnings: ${chalk.yellow(totalWarnings)}`);
    
    if (totalFailed === 0) {
      console.log('\n' + chalk.green.bold('✅ System is ready for production!'));
    } else {
      console.log('\n' + chalk.red.bold('❌ System is NOT ready for production'));
      console.log(chalk.yellow('   Run configureOFTForProduction.js to fix configuration issues'));
    }
  }

  async run() {
    console.log(chalk.bold('\n🚀 EscrowServiceV3 Production Readiness Check'));
    console.log('=' .repeat(50));
    
    await this.checkEnvironment();
    await this.checkConnectivity();
    await this.checkContracts();
    await this.checkOFTPeers();
    await this.checkCrossChainFunctionality();
    await this.checkTokenSupport();
    await this.checkGasEstimation();
    
    this.printSummary();
  }
}

// Run the checker
const checker = new ProductionChecker();
checker.initialize()
  .then(() => checker.run())
  .catch(error => {
    console.error(chalk.red('\n❌ Fatal error:'), error);
    process.exit(1);
  });