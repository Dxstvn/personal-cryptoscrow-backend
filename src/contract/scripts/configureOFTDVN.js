#!/usr/bin/env node
/**
 * Configure OFT adapter with DVN and executor settings
 */
const hre = require('hardhat');
const chalk = require('chalk');

// OFT addresses
const SEPOLIA_OFT = '0x51aF053a6BB282284E4407FaDfd13b09D93B82eE';
const ARBITRUM_OFT = '0xb6072a8ddF1183cE210aeFa5fa98B3Ab664Cc37B';

// LayerZero testnet DVNs (from LayerZero docs)
const LAYERZERO_LABS_DVN = {
  sepolia: '0x8D5b35F6c3546DC2a67ccD6a13723108D4Ad2b6a',
  arbitrum: '0x0c46D60D087D51F41c30366aE86b9A5b6E4C983b'
};

async function configureOFT(network, oftAddress, remoteDvn) {
  console.log(chalk.blue(`\n📍 Configuring ${network} OFT...`));
  
  const backendPrivateKey = process.env.BACKEND_WALLET_PRIVATE_KEY;
  if (!backendPrivateKey) {
    console.log(chalk.red('❌ BACKEND_WALLET_PRIVATE_KEY not found'));
    return;
  }
  
  const provider = network === 'sepolia' 
    ? new hre.ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL)
    : new hre.ethers.JsonRpcProvider(process.env.ARBITRUM_SEPOLIA_RPC_URL);
    
  const signer = new hre.ethers.Wallet(backendPrivateKey, provider);
  
  // OApp configuration ABI
  const oappAbi = [
    'function setConfig(uint32 _eid, address _lib, uint32 _configType, bytes calldata _config)',
    'function setEnforcedOptions((uint32,uint16,bytes)[] calldata _enforcedOptions)',
    'function owner() view returns (address)'
  ];
  
  const oft = new hre.ethers.Contract(oftAddress, oappAbi, signer);
  
  // Check ownership
  const owner = await oft.owner();
  if (owner.toLowerCase() !== signer.address.toLowerCase()) {
    console.log(chalk.red('❌ Not the owner'));
    return;
  }
  
  try {
    // Set enforced options for SEND (msgType = 1)
    console.log('Setting enforced options...');
    const enforcedOptions = [{
      eid: network === 'sepolia' ? 40231 : 40161, // Remote endpoint
      msgType: 1, // SEND
      options: '0x00030100110100000000000000000000000000030d40' // 200k gas
    }];
    
    const tx1 = await oft.setEnforcedOptions(enforcedOptions);
    await tx1.wait();
    console.log('✅ Enforced options set');
    
    // Note: DVN configuration requires more complex setup
    // and access to the LayerZero endpoint configuration
    console.log(chalk.yellow('\n⚠️  DVN configuration requires:'));
    console.log('1. Access to LayerZero endpoint admin functions');
    console.log('2. Proper message library configuration');
    console.log('3. This is typically done through LayerZero\'s configuration portal');
    
  } catch (error) {
    console.log(chalk.red('❌ Configuration failed:'), error.message);
  }
}

async function main() {
  console.log(chalk.blue('🔧 Configuring OFT DVN Settings'));
  console.log(chalk.blue('=============================='));
  
  console.log(chalk.yellow('\n⚠️  Important:'));
  console.log('Full DVN configuration typically requires using LayerZero\'s');
  console.log('configuration interface or having admin access to the endpoint.');
  console.log('This script sets what we can from the OApp side.\n');
  
  // Configure Sepolia
  await configureOFT('sepolia', SEPOLIA_OFT, LAYERZERO_LABS_DVN.arbitrum);
  
  // Configure Arbitrum
  await configureOFT('arbitrum', ARBITRUM_OFT, LAYERZERO_LABS_DVN.sepolia);
  
  console.log(chalk.green('\n✅ Configuration attempt complete'));
  console.log(chalk.yellow('\n📋 Next Steps:'));
  console.log('1. Use LayerZero\'s testnet configuration portal');
  console.log('2. Or deploy new OFT adapters with proper initial config');
  console.log('3. Or use a simpler bridging solution for testing');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(chalk.red('❌ Error:'), error);
    process.exit(1);
  });