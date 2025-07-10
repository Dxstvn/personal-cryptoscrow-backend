#!/usr/bin/env node

import { ethers } from 'ethers';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../../.env') });

// Configuration
const ESCROW_ID = '44'; // Your escrow ID
const SEPOLIA_CHAIN_ID = 11155111;
const ARBITRUM_SEPOLIA_CHAIN_ID = 421614;

// Contract addresses
const SEPOLIA_SERVICE_ADDRESS = '0xe41d5a43f2e27dff307cf97c2abe68e90d5f0e08';
const ARBITRUM_SERVICE_ADDRESS = '0x2b4bbaa6e87e1e56f7c5f0c2d73c74e09d9b37db';

// OFT Adapter addresses
const SEPOLIA_OFT_ADDRESS = '0xddeA7e168551Fe4D2cE2AD7c09E8D7a87A8A4FfD';
const ARBITRUM_OFT_ADDRESS = '0xE9Db6ce91D12e8f72d28b87cc96F087B86e59C09';

// LayerZero endpoint IDs
const LZ_SEPOLIA_ID = 40161;
const LZ_ARBITRUM_ID = 40231;

// ABIs
const escrowServiceABI = [
    "function escrows(uint256) view returns (address, uint256, address, uint256, uint256, address, bool, bool, string)",
    "function releaseEscrow(uint256, bytes) external payable",
    "function quoteReleaseEscrow(uint256) view returns (uint256)",
    "function isOFTAdapter(address) view returns (bool)",
    "function oftAdapters(address) view returns (address)"
];

const oftAdapterABI = [
    "function escrowService() view returns (address)",
    "function endpoint() view returns (address)",
    "function isPeer(uint32, bytes32) view returns (bool)",
    "function peers(uint32) view returns (bytes32)",
    "function setPeer(uint32, bytes32) external",
    "function token() view returns (address)"
];

const endpointABI = [
    "function defaultSendLibrary(uint32) view returns (address)"
];

async function main() {
    console.log('=== Escrow Release Script ===\n');

    // Setup providers with proper RPC URLs
    const sepoliaProvider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL || 'https://eth-sepolia.g.alchemy.com/v2/demo');
    const arbitrumProvider = new ethers.JsonRpcProvider(process.env.ARBITRUM_SEPOLIA_RPC_URL || 'https://arb-sepolia.g.alchemy.com/v2/demo');

    // Setup wallets
    const privateKey = process.env.DEPLOYER_PRIVATE_KEY.replace(/['"]/g, ''); // Remove quotes if present
    const sepoliaWallet = new ethers.Wallet(privateKey, sepoliaProvider);
    const arbitrumWallet = new ethers.Wallet(privateKey, arbitrumProvider);

    console.log('Wallet address:', sepoliaWallet.address);
    console.log('');

    // Get contracts
    const sepoliaService = new ethers.Contract(SEPOLIA_SERVICE_ADDRESS, escrowServiceABI, sepoliaWallet);
    const arbitrumService = new ethers.Contract(ARBITRUM_SERVICE_ADDRESS, escrowServiceABI, arbitrumWallet);
    const sepoliaOFT = new ethers.Contract(SEPOLIA_OFT_ADDRESS, oftAdapterABI, sepoliaWallet);
    const arbitrumOFT = new ethers.Contract(ARBITRUM_OFT_ADDRESS, oftAdapterABI, arbitrumWallet);

    try {
        // Step 1: Check escrow details
        console.log('Step 1: Checking escrow details...');
        const escrow = await sepoliaService.escrows(ESCROW_ID);
        const [depositor, amount, beneficiary, targetChainId, expiryTime, arbiter, released, conditionMet] = escrow;
        
        console.log('Escrow Details:');
        console.log('- ID:', ESCROW_ID);
        console.log('- Depositor:', depositor);
        console.log('- Amount:', ethers.formatEther(amount), 'ETH');
        console.log('- Beneficiary:', beneficiary);
        console.log('- Target Chain ID:', targetChainId.toString());
        console.log('- Condition Met:', conditionMet ? '✅' : '❌');
        console.log('- Released:', released ? '✅' : '❌');
        console.log('');

        if (released) {
            console.log('❌ Escrow has already been released!');
            return;
        }

        if (!conditionMet) {
            console.log('❌ Escrow condition not met!');
            return;
        }

        if (targetChainId.toString() !== ARBITRUM_SEPOLIA_CHAIN_ID.toString()) {
            console.log('❌ Target chain ID mismatch! Expected:', ARBITRUM_SEPOLIA_CHAIN_ID, 'Got:', targetChainId.toString());
            return;
        }

        // Step 2: Verify OFT configuration on both chains
        console.log('Step 2: Verifying OFT configuration...');
        
        // Check Sepolia OFT
        console.log('\nChecking Sepolia OFT adapter...');
        const sepoliaEscrowService = await sepoliaOFT.escrowService();
        console.log('- Escrow Service:', sepoliaEscrowService);
        console.log('- Expected:', SEPOLIA_SERVICE_ADDRESS);
        console.log('- Match:', sepoliaEscrowService.toLowerCase() === SEPOLIA_SERVICE_ADDRESS.toLowerCase() ? '✅' : '❌');

        const sepoliaPeerBytes = await sepoliaOFT.peers(LZ_ARBITRUM_ID);
        const sepoliaPeerAddress = '0x' + sepoliaPeerBytes.slice(26);
        console.log('- Peer for Arbitrum:', sepoliaPeerAddress);
        console.log('- Expected:', ARBITRUM_OFT_ADDRESS);
        console.log('- Match:', sepoliaPeerAddress.toLowerCase() === ARBITRUM_OFT_ADDRESS.toLowerCase() ? '✅' : '❌');

        // Check Arbitrum OFT
        console.log('\nChecking Arbitrum OFT adapter...');
        const arbitrumEscrowService = await arbitrumOFT.escrowService();
        console.log('- Escrow Service:', arbitrumEscrowService);
        console.log('- Expected:', ARBITRUM_SERVICE_ADDRESS);
        console.log('- Match:', arbitrumEscrowService.toLowerCase() === ARBITRUM_SERVICE_ADDRESS.toLowerCase() ? '✅' : '❌');

        const arbitrumPeerBytes = await arbitrumOFT.peers(LZ_SEPOLIA_ID);
        const arbitrumPeerAddress = '0x' + arbitrumPeerBytes.slice(26);
        console.log('- Peer for Sepolia:', arbitrumPeerAddress);
        console.log('- Expected:', SEPOLIA_OFT_ADDRESS);
        console.log('- Match:', arbitrumPeerAddress.toLowerCase() === SEPOLIA_OFT_ADDRESS.toLowerCase() ? '✅' : '❌');

        // If Arbitrum peer not set, set it
        if (arbitrumPeerAddress === '0x' + '0'.repeat(40)) {
            console.log('\n⚠️  Arbitrum OFT peer not set. Setting it now...');
            const peerBytes32 = ethers.zeroPadValue(SEPOLIA_OFT_ADDRESS, 32);
            const tx = await arbitrumOFT.setPeer(LZ_SEPOLIA_ID, peerBytes32);
            console.log('Setting peer transaction:', tx.hash);
            await tx.wait();
            console.log('✅ Peer set successfully!');
        }

        // Step 3: Check OFT adapter registration
        console.log('\nStep 3: Checking OFT adapter registration...');
        const isSepoliaOFTRegistered = await sepoliaService.isOFTAdapter(SEPOLIA_OFT_ADDRESS);
        const isArbitrumOFTRegistered = await arbitrumService.isOFTAdapter(ARBITRUM_OFT_ADDRESS);
        
        console.log('- Sepolia OFT registered:', isSepoliaOFTRegistered ? '✅' : '❌');
        console.log('- Arbitrum OFT registered:', isArbitrumOFTRegistered ? '✅' : '❌');

        if (!isSepoliaOFTRegistered || !isArbitrumOFTRegistered) {
            console.log('\n❌ OFT adapters not properly registered in escrow services!');
            return;
        }

        // Step 4: Quote the release fee
        console.log('\nStep 4: Getting release fee quote...');
        const quotedFee = await sepoliaService.quoteReleaseEscrow(ESCROW_ID);
        console.log('Quoted fee:', ethers.formatEther(quotedFee), 'ETH');

        // Add 20% buffer to the fee
        const feeWithBuffer = quotedFee * 120n / 100n;
        console.log('Fee with 20% buffer:', ethers.formatEther(feeWithBuffer), 'ETH');

        // Step 5: Check wallet balance
        console.log('\nStep 5: Checking wallet balance...');
        const balance = await sepoliaProvider.getBalance(sepoliaWallet.address);
        console.log('Wallet balance:', ethers.formatEther(balance), 'ETH');
        
        if (balance < feeWithBuffer) {
            console.log('❌ Insufficient balance! Need at least:', ethers.formatEther(feeWithBuffer), 'ETH');
            return;
        }

        // Step 6: Release the escrow
        console.log('\nStep 6: Releasing escrow...');
        console.log('Press Ctrl+C to cancel, or wait 5 seconds to continue...');
        await new Promise(resolve => setTimeout(resolve, 5000));

        try {
            // Empty options for now (can be used for advanced LayerZero options)
            const options = '0x';
            
            console.log('\nSending release transaction...');
            const tx = await sepoliaService.releaseEscrow(ESCROW_ID, options, {
                value: feeWithBuffer,
                gasLimit: 500000
            });
            
            console.log('Transaction hash:', tx.hash);
            console.log('Waiting for confirmation...');
            
            const receipt = await tx.wait();
            console.log('✅ Transaction confirmed!');
            console.log('Gas used:', receipt.gasUsed.toString());
            console.log('Block number:', receipt.blockNumber);
            
            // Step 7: Monitor the cross-chain message
            console.log('\nStep 7: Monitoring cross-chain transfer...');
            console.log('The funds should arrive on Arbitrum Sepolia in 1-3 minutes.');
            console.log('You can check the status at:');
            console.log(`https://layerzeroscan.com/tx/${tx.hash}`);
            
            // Wait a bit and check target chain
            console.log('\nWaiting 30 seconds before checking Arbitrum...');
            await new Promise(resolve => setTimeout(resolve, 30000));
            
            const arbitrumBalance = await arbitrumProvider.getBalance(beneficiary);
            console.log('\nBeneficiary balance on Arbitrum:', ethers.formatEther(arbitrumBalance), 'ETH');
            
        } catch (error) {
            console.error('\n❌ Error releasing escrow:', error.message);
            if (error.data) {
                console.error('Error data:', error.data);
            }
            if (error.transaction) {
                console.error('Failed transaction:', error.transaction);
            }
        }

    } catch (error) {
        console.error('Error:', error.message);
        if (error.data) {
            console.error('Error data:', error.data);
        }
    }
}

// Run the script
main().catch(console.error);