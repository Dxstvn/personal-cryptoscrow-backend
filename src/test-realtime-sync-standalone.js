#!/usr/bin/env node

/**
 * Standalone test runner for real-time synchronization
 * Can be run without Vitest for quick testing
 */

import { databaseEvents } from './services/databaseService.js';
import { EscrowServiceV3 } from './services/escrowServiceV3.js';
import ContractConditionSync from './services/contractConditionSync.js';
import DisputeEventHandler from './services/disputeEventHandler.js';

// Colors for console output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m'
};

// Create a mock database service that extends databaseEvents
const mockDatabaseService = Object.assign(Object.create(databaseEvents), {
    getActiveDisputes: async () => [],
    getEscrowById: async (id) => null,
    updateDispute: async (id, data) => ({ success: true }),
    on: databaseEvents.on.bind(databaseEvents),
    off: databaseEvents.off.bind(databaseEvents),
    emit: databaseEvents.emit.bind(databaseEvents)
});

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

async function main() {
    log('\n🚀 Real-time Synchronization Standalone Test', 'bright');
    log('Testing event-driven architecture without Hardhat\n', 'cyan');
    
    try {
        // Test 1: Event Emission
        log('1️⃣ Testing Event Emission', 'yellow');
        let eventReceived = false;
        
        databaseEvents.once('test-event', (data) => {
            eventReceived = true;
            log(`✅ Event received: ${JSON.stringify(data)}`, 'green');
        });
        
        databaseEvents.emit('test-event', { test: true });
        await new Promise(resolve => setTimeout(resolve, 100));
        
        if (!eventReceived) {
            throw new Error('Event emission failed');
        }
        
        // Test 2: Dispute Timer
        log('\n2️⃣ Testing Dispute Timer Management', 'yellow');
        const escrowService = new EscrowServiceV3();
        await escrowService.initialize();
        
        const disputeHandler = new DisputeEventHandler(escrowService, mockDatabaseService);
        disputeHandler.start();
        
        let timerSet = false;
        disputeHandler.on('disputeTimerSet', ({ dealId, hoursRemaining }) => {
            timerSet = true;
            log(`✅ Timer set for ${dealId}: ${hoursRemaining} hours`, 'green');
        });
        
        // Raise a dispute
        mockDatabaseService.emit('disputeRaised', 'test-dispute-1', {
            dealId: 'test-dispute-1',
            escrowId: '0x123',
            chainId: 11155111,
            contractAddress: '0xabc',
            disputeTimestamp: Date.now(),
            reason: 'Test dispute'
        });
        
        await new Promise(resolve => setTimeout(resolve, 500));
        
        if (!timerSet) {
            throw new Error('Timer was not set');
        }
        
        // Test 3: Timer Cancellation
        log('\n3️⃣ Testing Timer Cancellation', 'yellow');
        let timerCancelled = false;
        
        disputeHandler.on('disputeTimerCancelled', ({ dealId }) => {
            timerCancelled = true;
            log(`✅ Timer cancelled for ${dealId}`, 'green');
        });
        
        // Resolve the dispute
        mockDatabaseService.emit('disputeResolved', 'test-dispute-1', {
            resolution: 'manual',
            txHash: '0x456'
        });
        
        await new Promise(resolve => setTimeout(resolve, 500));
        
        if (!timerCancelled) {
            throw new Error('Timer was not cancelled');
        }
        
        // Test 4: Active Timers
        log('\n4️⃣ Testing Active Timer Tracking', 'yellow');
        
        // Add a new dispute
        mockDatabaseService.emit('disputeRaised', 'test-dispute-2', {
            dealId: 'test-dispute-2',
            escrowId: '0x789',
            chainId: 11155111,
            contractAddress: '0xdef',
            disputeTimestamp: Date.now() - (2 * 24 * 60 * 60 * 1000), // 2 days ago
            reason: 'Another test'
        });
        
        await new Promise(resolve => setTimeout(resolve, 500));
        
        const activeTimers = disputeHandler.getActiveTimers();
        log(`Active timers: ${activeTimers.length}`, 'blue');
        
        activeTimers.forEach(timer => {
            log(`  - ${timer.dealId}: ${timer.hoursRemaining} hours remaining`, 'blue');
        });
        
        if (activeTimers.length !== 1) {
            throw new Error('Expected 1 active timer');
        }
        
        // Cleanup
        disputeHandler.stop();
        
        log('\n✅ All tests passed!', 'bright');
        log('\nNote: This is a standalone test without blockchain interaction.', 'yellow');
        log('For full integration testing with Hardhat, run: npm run test:realtime-sync\n', 'cyan');
        
    } catch (error) {
        log(`\n❌ Test failed: ${error.message}`, 'red');
        console.error(error);
        process.exit(1);
    }
    
    process.exit(0);
}

// Run the tests
main().catch(console.error);