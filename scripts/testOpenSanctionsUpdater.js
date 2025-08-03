#!/usr/bin/env node

// scripts/testOpenSanctionsUpdater.js

import { OpenSanctionsUpdater } from '../src/services/kyc/opensanctions/OpenSanctionsUpdater.js';

async function testUpdater() {
  console.log('🔄 Testing OpenSanctions Incremental Updater');
  console.log('==========================================\n');

  const updater = new OpenSanctionsUpdater({
    autoUpdate: false, // Manual control for testing
    useSQLite: true,
    checkInterval: '0 3 * * *' // Daily at 3 AM
  });

  try {
    // Initialize updater
    console.log('1️⃣ Initializing updater...');
    await updater.initialize();
    console.log('   ✅ Updater initialized\n');

    // Check last update
    console.log('2️⃣ Checking last update...');
    const lastUpdate = updater.getLastUpdate();
    
    if (lastUpdate) {
      console.log('   📅 Last update:', new Date(lastUpdate.timestamp).toLocaleString());
      console.log('   📊 Statistics:');
      console.log(`      - Duration: ${(lastUpdate.duration / 1000).toFixed(1)}s`);
      console.log(`      - Added: ${lastUpdate.entitiesAdded}`);
      console.log(`      - Updated: ${lastUpdate.entitiesUpdated}`);
      console.log(`      - Removed: ${lastUpdate.entitiesRemoved}`);
    } else {
      console.log('   ℹ️  No previous updates recorded');
    }
    console.log('');

    // Check if update is needed
    console.log('3️⃣ Checking for available updates...');
    const needsUpdate = await updater.downloader.needsUpdate('default');
    
    if (needsUpdate) {
      console.log('   🔄 Update available!\n');
      
      // Prompt user
      console.log('   ⚠️  This will download and apply the latest OpenSanctions data.');
      console.log('   This process may take several minutes.\n');
      
      const answer = await new Promise(resolve => {
        process.stdout.write('   Continue with update? (y/N): ');
        process.stdin.once('data', data => {
          resolve(data.toString().trim().toLowerCase());
        });
      });
      
      if (answer === 'y') {
        console.log('\n4️⃣ Starting incremental update...');
        
        // Listen to update events
        updater.on('update:start', () => {
          console.log('   📥 Update started...');
        });
        
        updater.on('update:complete', (stats) => {
          console.log('\n   ✅ Update completed!');
          console.log('   📊 Update statistics:');
          console.log(`      - Duration: ${(stats.duration / 1000).toFixed(1)}s`);
          console.log(`      - Entities before: ${stats.entitiesBefore.toLocaleString()}`);
          console.log(`      - Entities after: ${stats.entitiesAfter.toLocaleString()}`);
          console.log(`      - Added: ${stats.entitiesAdded.toLocaleString()}`);
          console.log(`      - Updated: ${stats.entitiesUpdated.toLocaleString()}`);
          console.log(`      - Removed: ${stats.entitiesRemoved.toLocaleString()}`);
          console.log(`      - Errors: ${stats.errors}`);
        });
        
        updater.on('update:error', (error) => {
          console.error('\n   ❌ Update failed:', error.message);
        });
        
        // Run the update
        const result = await updater.checkAndUpdate();
        
        if (result.updated) {
          console.log('\n   🎉 Database successfully updated!');
        } else {
          console.log(`\n   ℹ️  Update not applied: ${result.reason}`);
        }
      } else {
        console.log('   Update cancelled');
      }
    } else {
      console.log('   ✅ Data is already up to date\n');
      
      // Show update history
      console.log('4️⃣ Recent update history:');
      const history = updater.getUpdateHistory(5);
      
      if (history.length > 0) {
        history.forEach((update, index) => {
          console.log(`\n   Update ${index + 1}:`);
          console.log(`   - Date: ${new Date(update.timestamp).toLocaleString()}`);
          console.log(`   - Added: ${update.entitiesAdded}, Updated: ${update.entitiesUpdated}, Removed: ${update.entitiesRemoved}`);
        });
      } else {
        console.log('   No update history available');
      }
    }

    // Show scheduled update info
    console.log('\n5️⃣ Scheduled updates:');
    console.log(`   - Schedule: ${updater.config.checkInterval} (Daily at 3 AM)`);
    console.log('   - Auto-update: Disabled for testing');
    console.log('   - To enable: Set autoUpdate: true in configuration');

    await updater.close();
    
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    await updater.close();
    process.exit(1);
  }

  process.exit(0);
}

testUpdater();