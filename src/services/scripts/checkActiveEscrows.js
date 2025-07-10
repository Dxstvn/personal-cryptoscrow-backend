#!/usr/bin/env node

import { ethers } from 'ethers';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../../.env') });

// Contract addresses
const SEPOLIA_SERVICE_ADDRESS = '0xe41d5a43f2e27dff307cf97c2abe68e90d5f0e08';
const ARBITRUM_SERVICE_ADDRESS = '0x2b4bbaa6e87e1e56f7c5f0c2d73c74e09d9b37db';

// ABIs
const escrowServiceABI = [
    "function escrows(uint256) view returns (address, uint256, address, uint256, uint256, address, bool, bool, string)",
    "function escrowCounter() view returns (uint256)",
    "event EscrowCreated(uint256 indexed escrowId, address indexed depositor, address indexed beneficiary, uint256 amount, uint256 targetChainId)"
];

async function main() {
    console.log('=== Active Escrows Check ===\n');

    // Setup provider
    const sepoliaProvider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL || 'https://eth-sepolia.g.alchemy.com/v2/demo');
    
    // Get contract
    const sepoliaService = new ethers.Contract(SEPOLIA_SERVICE_ADDRESS, escrowServiceABI, sepoliaProvider);

    try {
        // Get the current escrow counter
        let escrowCounter;
        try {
            escrowCounter = await sepoliaService.escrowCounter();
            console.log('Total escrows created:', escrowCounter.toString());
        } catch (error) {
            console.log('Could not get escrow counter, trying different approach...');
            
            // Try to find escrows by events
            const filter = sepoliaService.filters.EscrowCreated();
            const events = await sepoliaService.queryFilter(filter, -10000); // Last 10000 blocks
            
            console.log(`Found ${events.length} EscrowCreated events in recent blocks`);
            
            if (events.length > 0) {
                console.log('\nRecent escrows:');
                for (const event of events.slice(-5)) { // Show last 5
                    console.log(`- Escrow ID: ${event.args.escrowId}`);
                    console.log(`  Depositor: ${event.args.depositor}`);
                    console.log(`  Amount: ${ethers.formatEther(event.args.amount)} ETH`);
                    console.log(`  Target Chain: ${event.args.targetChainId}`);
                    console.log(`  Block: ${event.blockNumber}`);
                    console.log('');
                }
            }
        }

        // Try to read specific escrow IDs
        console.log('\nChecking specific escrow IDs...');
        const idsToCheck = ['0', '1', '2', '3', '4', '44', '45', '46'];
        
        for (const id of idsToCheck) {
            try {
                const escrow = await sepoliaService.escrows(id);
                const [depositor, amount, beneficiary, targetChainId, expiryTime, arbiter, released, conditionMet] = escrow;
                
                if (depositor !== ethers.ZeroAddress) {
                    console.log(`\nEscrow ID ${id}:`);
                    console.log('- Depositor:', depositor);
                    console.log('- Amount:', ethers.formatEther(amount), 'ETH');
                    console.log('- Beneficiary:', beneficiary);
                    console.log('- Target Chain:', targetChainId.toString());
                    console.log('- Released:', released ? '✅' : '❌');
                    console.log('- Condition Met:', conditionMet ? '✅' : '❌');
                }
            } catch (error) {
                // Silently skip if escrow doesn't exist
            }
        }

    } catch (error) {
        console.error('Error:', error.message);
    }
}

// Run the script
main().catch(console.error);