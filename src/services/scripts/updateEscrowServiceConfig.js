#!/usr/bin/env node
/**
 * Update EscrowServiceV3 configuration with your OFT adapters
 * This ensures the service uses YOUR OFT adapters where you're the owner
 */

import chalk from 'chalk';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function updateServiceConfig() {
  console.log(chalk.blue('🔧 Updating EscrowServiceV3 Configuration'));
  console.log(chalk.blue('========================================'));
  
  try {
    // Read the deployment info
    const deploymentPath = path.join(__dirname, 'deployments', 'oft-adapters-deployment.json');
    let deploymentInfo;
    
    try {
      deploymentInfo = JSON.parse(await fs.readFile(deploymentPath, 'utf8'));
      console.log(chalk.green('✅ Found OFT deployment info'));
    } catch (error) {
      console.log(chalk.yellow('⚠️  No deployment info found. Run deployOFTAdaptersWithServiceWallet.js first'));
      return;
    }
    
    // Generate the configuration update
    console.log(chalk.cyan('\n📝 Configuration Update Required:'));
    console.log('\nUpdate your escrowServiceV3.js chainConfigs with:');
    
    console.log(chalk.gray('\n// Sepolia configuration'));
    console.log(`11155111: {`);
    console.log(`  ...existing config,`);
    console.log(chalk.green(`  oftAdapter: '${deploymentInfo.oftAdapters.sepolia.address}', // Your OFT adapter`));
    console.log(`}`);
    
    console.log(chalk.gray('\n// Arbitrum Sepolia configuration'));
    console.log(`421614: {`);
    console.log(`  ...existing config,`);
    console.log(chalk.green(`  oftAdapter: '${deploymentInfo.oftAdapters.arbitrumSepolia.address}', // Your OFT adapter`));
    console.log(`}`);
    
    // Generate .env update
    console.log(chalk.cyan('\n📝 Environment Variables Update:'));
    console.log('\nAdd these to your .env file:');
    console.log(chalk.green(`SEPOLIA_OFT_ADAPTER=${deploymentInfo.oftAdapters.sepolia.address}`));
    console.log(chalk.green(`ARBITRUM_SEPOLIA_OFT_ADAPTER=${deploymentInfo.oftAdapters.arbitrumSepolia.address}`));
    
    // Create a production config file
    const productionConfig = {
      production: {
        serviceWallet: deploymentInfo.serviceWallet,
        escrowContract: deploymentInfo.escrowContract,
        oftAdapters: {
          11155111: deploymentInfo.oftAdapters.sepolia.address,
          421614: deploymentInfo.oftAdapters.arbitrumSepolia.address
        },
        note: "These OFT adapters are owned by your service wallet"
      }
    };
    
    const configPath = path.join(__dirname, '../../config', 'production-oft-config.json');
    await fs.mkdir(path.dirname(configPath), { recursive: true });
    await fs.writeFile(configPath, JSON.stringify(productionConfig, null, 2));
    
    console.log(chalk.green('\n✅ Created production config at: src/config/production-oft-config.json'));
    
    // Summary
    console.log(chalk.cyan('\n📊 Summary:'));
    console.log(`Service Wallet (OFT Owner): ${deploymentInfo.serviceWallet}`);
    console.log(`Escrow Contract: ${deploymentInfo.escrowContract}`);
    console.log(`\nYour service wallet now owns and controls both OFT adapters!`);
    
    console.log(chalk.yellow('\n⚠️  Manual Steps Required:'));
    console.log('1. Update escrowServiceV3.js with the new OFT adapter addresses');
    console.log('2. Update your .env file with the environment variables above');
    console.log('3. Restart your service to use the new configuration');
    
    console.log(chalk.green('\n✅ Benefits of this setup:'));
    console.log('- Your service wallet controls all OFT authorizations');
    console.log('- You can authorize/revoke escrow contracts at any time');
    console.log('- No dependency on external OFT adapter owners');
    console.log('- Full control for production deployments');
    
  } catch (error) {
    console.log(chalk.red('❌ Error:'), error.message);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  updateServiceConfig().catch(console.error);
}