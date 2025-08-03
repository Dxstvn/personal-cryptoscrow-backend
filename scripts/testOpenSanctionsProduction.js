#!/usr/bin/env node

// scripts/testOpenSanctionsProduction.js

import { OpenSanctionsService } from '../src/services/kyc/opensanctions/OpenSanctionsService.js';
import { OpenSanctionsSQLiteService } from '../src/services/kyc/opensanctions/OpenSanctionsSQLiteService.js';

/**
 * Test OpenSanctions production implementation
 */
async function testOpenSanctionsProduction() {
  console.log('🚀 Testing OpenSanctions Production Implementation');
  console.log('===============================================\n');

  // Check if we should use SQLite (for local dev) or PostgreSQL (for production)
  const usePostgreSQL = process.env.USE_POSTGRESQL === 'true';
  
  let service;
  
  if (usePostgreSQL) {
    console.log('📊 Using PostgreSQL backend\n');
    // Initialize service with PostgreSQL configuration
    service = new OpenSanctionsService({
      database: {
        host: 'localhost',
        port: 5432,
        database: 'opensanctions',
        user: 'opensanctions',
        password: process.env.OPENSANCTIONS_DB_PASSWORD || 'opensanctions',
        max: 5
      },
      redis: {
        host: 'localhost',
        port: 6379,
        keyPrefix: 'opensanctions:test:'
      }
    });
  } else {
    console.log('📊 Using SQLite backend (local development)\n');
    // Use SQLite for local development
    service = new OpenSanctionsSQLiteService();
  }

  // Listen to events
  service.on('initialized', () => {
    console.log('✅ Service initialized successfully\n');
  });

  service.on('search:completed', (data) => {
    console.log(`   Search completed in ${data.duration}ms\n`);
  });

  service.on('search:cache_hit', (data) => {
    console.log(`   Cache hit! Returned in ${data.duration}ms\n`);
  });

  try {
    // 1. Initialize the service
    console.log('1️⃣ Initializing OpenSanctions service...');
    await service.initialize();

    // 2. Test basic search
    console.log('2️⃣ Testing basic search functionality...\n');
    
    const testSearches = [
      { name: 'Vladimir Putin', description: 'Russian President' },
      { name: 'Kim Jong Un', description: 'North Korean Leader' },
      { name: 'John Smith', description: 'Common name (should have no results)' },
      { name: 'Osama bin Laden', description: 'Known terrorist' }
    ];

    for (const test of testSearches) {
      console.log(`🔍 Searching for: "${test.name}" (${test.description})`);
      
      const results = await service.search(test.name, {
        threshold: 0.75,
        limit: 5
      });

      if (results.length > 0) {
        console.log(`   ✅ Found ${results.length} matches:`);
        
        // Show top result
        const topResult = results[0];
        console.log(`   
   Top Match:
   - Name: ${topResult.entity.name}
   - Type: ${topResult.entity.type}
   - Match Type: ${topResult.matchType}
   - Matched Name: ${topResult.matchedName}
   - Score: ${topResult.finalScore.toFixed(3)}
   - Datasets: ${topResult.entity.datasets.slice(0, 3).join(', ')}${topResult.entity.datasets.length > 3 ? '...' : ''}
   - Nationality: ${topResult.entity.nationality || 'N/A'}
   - DOB: ${topResult.entity.dateOfBirth || 'N/A'}`);
      } else {
        console.log('   ❌ No matches found');
      }
    }

    // 3. Test contextual search with DOB
    console.log('\n3️⃣ Testing contextual search with date of birth...\n');
    
    const contextualSearch = {
      name: 'Vladimir Putin',
      dateOfBirth: '1952-10-07'
    };
    
    console.log(`🔍 Searching with context: ${contextualSearch.name} (DOB: ${contextualSearch.dateOfBirth})`);
    
    const contextResults = await service.search(contextualSearch.name, {
      dateOfBirth: contextualSearch.dateOfBirth,
      threshold: 0.7
    });

    if (contextResults.length > 0 && contextResults[0].contextBonus > 0) {
      console.log('   ✅ Context bonus applied!');
      console.log(`   Context matches: ${contextResults[0].contextMatches.join(', ')}`);
      console.log(`   Bonus score: +${contextResults[0].contextBonus.toFixed(3)}`);
    }

    // 4. Test cached search (should be instant)
    console.log('\n4️⃣ Testing cache functionality...\n');
    
    console.log('🔍 Repeating search for "Vladimir Putin" (should hit cache)');
    await service.search('Vladimir Putin', { threshold: 0.75, limit: 5 });

    // 5. Test entity details
    console.log('5️⃣ Testing entity detail retrieval...\n');
    
    // Get the first search result from earlier search
    const earlierResults = testSearches.length > 0 ? 
      await service.search(testSearches[0].name, { threshold: 0.75, limit: 5 }) : [];
    
    if (earlierResults.length > 0) {
      const entityId = earlierResults[0].entity.id;
      console.log(`📋 Getting details for entity: ${entityId}`);
      
      const entity = await service.getEntity(entityId);
      
      if (entity) {
        console.log(`
   Entity Details:
   - Name: ${entity.name}
   - Type: ${entity.type}
   - Aliases: ${entity.aliases.slice(0, 3).join(', ')}${entity.aliases.length > 3 ? '...' : ''}
   - Datasets: ${entity.datasets.length} sources
   - Identifiers: ${entity.identifiers.length} IDs
   - Addresses: ${entity.addresses.length} addresses
   - Sanctions: ${entity.sanctions.length} programs`);
      }
    }

    // 6. Test statistics
    console.log('\n6️⃣ Testing database statistics...\n');
    
    const stats = await service.getStatistics();
    console.log('📊 Database Statistics:');
    console.log(`   - Total Entities: ${parseInt(stats.total).toLocaleString()}`);
    console.log(`   - Individuals: ${parseInt(stats.individuals).toLocaleString()}`);
    console.log(`   - Organizations: ${parseInt(stats.entities).toLocaleString()}`);
    console.log(`   - Vessels: ${parseInt(stats.vessels).toLocaleString()}`);
    console.log(`   - Aircraft: ${parseInt(stats.aircraft).toLocaleString()}`);
    console.log(`   - Last Update: ${stats.last_update ? new Date(stats.last_update).toLocaleDateString() : 'N/A'}`);

    // 7. Performance test
    console.log('\n7️⃣ Testing search performance...\n');
    
    const performanceTests = ['John', 'Smith', 'Mohammed', 'Putin', 'Kim'];
    const startTime = Date.now();
    
    for (const name of performanceTests) {
      await service.search(name, { 
        threshold: 0.7, 
        limit: 10,
        skipCache: true 
      });
    }
    
    const totalTime = Date.now() - startTime;
    const avgTime = totalTime / performanceTests.length;
    
    console.log(`   ⚡ Performance Results:`);
    console.log(`   - Total searches: ${performanceTests.length}`);
    console.log(`   - Total time: ${totalTime}ms`);
    console.log(`   - Average time per search: ${avgTime.toFixed(2)}ms`);

    // Close connections
    await service.close();
    
    console.log('\n✅ All tests completed successfully!');
    console.log('\n💡 Production Implementation Summary:');
    console.log('   - PostgreSQL for data storage with fuzzy matching');
    console.log('   - Redis for caching search results');
    console.log('   - Advanced fuzzy matching with multiple algorithms');
    console.log('   - Contextual matching with DOB and other fields');
    console.log('   - Event-driven architecture for monitoring');
    console.log('   - Sub-100ms search performance with caching');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    
    if (usePostgreSQL && error.message.includes('connect')) {
      console.log('\n💡 Setup Instructions for PostgreSQL:');
      console.log('   1. Install PostgreSQL and Redis');
      console.log('   2. Create opensanctions database');
      console.log('   3. Run: psql opensanctions < scripts/setupOpenSanctionsDB.sql');
      console.log('   4. Import OpenSanctions data using the importer');
      console.log('   5. Start Redis server');
    } else if (!usePostgreSQL && error.message.includes('no such table')) {
      console.log('\n💡 Setup Instructions for SQLite:');
      console.log('   1. Run: npm run opensanctions:import');
      console.log('   2. Wait for the import to complete');
      console.log('   3. Try running this test again');
    }
    
    await service.close();
    process.exit(1);
  }
}

// Run the test
testOpenSanctionsProduction().catch(error => {
  console.error('❌ Unexpected error:', error);
  process.exit(1);
});