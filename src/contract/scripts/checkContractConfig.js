require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });
const hre = require('hardhat');

async function main() {
  const contractAddress = '0x3345F4adA7C290A94918aA44c2a3D28110f3bCdb'; // New contract with hardcoded fees
  const contract = await hre.ethers.getContractAt('UniversalEscrowServiceV3StargateEnhanced', contractAddress);
  
  console.log('Contract:', contractAddress);
  console.log('Owner:', await contract.owner());
  console.log('Service Wallet:', await contract.serviceWallet());
  console.log('Service Fee %:', ((await contract.serviceFeePercentage()) / 100n).toString() + '%');
}

main().catch(console.error);