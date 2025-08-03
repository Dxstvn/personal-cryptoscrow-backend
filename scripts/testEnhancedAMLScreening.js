#!/usr/bin/env node

// scripts/testEnhancedAMLScreening.js

import { amlScreeningService } from '../src/services/kyc/amlScreeningService.js';
import { watchlistDownloader } from '../src/services/kyc/utils/watchlistDownloader.js';

/**
 * Test the enhanced AML screening service
 */
async function testEnhancedAMLScreening() {
  console.log('🧪 Testing Enhanced AML Screening Service');
  console.log('========================================\n');

  try {
    // 1. Initialize the service
    console.log('1️⃣ Initializing AML screening service...');
    await amlScreeningService.initialize();
    console.log('✅ Service initialized\n');

    // 2. Test watchlist download
    console.log('2️⃣ Testing watchlist download functionality...');
    const downloadResults = await watchlistDownloader.downloadAllWatchlists();
    console.log('Watchlist download results:', {
      successful: downloadResults.success.map(s => ({
        source: s.source,
        entries: s.entries
      })),
      failed: downloadResults.failed
    });
    console.log();

    // 3. Test various user scenarios
    const testCases = [
      {
        name: 'Clean User',
        userData: {
          userId: 'test-001',
          firstName: 'John',
          lastName: 'Smith',
          dateOfBirth: '1985-06-15',
          nationality: 'US',
          countryOfResidence: 'US'
        }
      },
      {
        name: 'PEP Match',
        userData: {
          userId: 'test-002',
          firstName: 'Joe',
          lastName: 'Biden',
          dateOfBirth: '1942-11-20',
          nationality: 'US',
          countryOfResidence: 'US'
        }
      },
      {
        name: 'Similar Name to PEP',
        userData: {
          userId: 'test-003',
          firstName: 'Joseph',
          lastName: 'Biden',
          dateOfBirth: '1990-01-01',
          nationality: 'US',
          countryOfResidence: 'US'
        }
      },
      {
        name: 'Adverse Media Keywords',
        userData: {
          userId: 'test-004',
          firstName: 'Fraud',
          lastName: 'Criminal',
          dateOfBirth: '1980-01-01',
          nationality: 'US',
          countryOfResidence: 'US'
        }
      },
      {
        name: 'International User',
        userData: {
          userId: 'test-005',
          firstName: 'Mohammed',
          lastName: 'Al-Hassan',
          dateOfBirth: '1975-03-20',
          nationality: 'SA',
          countryOfResidence: 'UK'
        }
      }
    ];

    console.log('3️⃣ Running screening tests...\n');
    
    for (const testCase of testCases) {
      console.log(`📋 Testing: ${testCase.name}`);
      console.log(`   User: ${testCase.userData.firstName} ${testCase.userData.lastName}`);
      
      try {
        const result = await amlScreeningService.screenUser(testCase.userData);
        
        console.log('   Results:');
        console.log(`   - Sanctions Hit: ${result.sanctionsHit ? '⚠️ YES' : '✅ NO'}`);
        if (result.sanctionsMatches && result.sanctionsMatches.length > 0) {
          console.log(`     Matches: ${result.sanctionsMatches.length}`);
          result.sanctionsMatches.forEach(m => {
            console.log(`     - ${m.matchedName} (Score: ${m.matchScore}, Source: ${m.listSource})`);
          });
        }
        
        console.log(`   - PEP Status: ${result.pepStatus ? '⚠️ YES' : '✅ NO'}`);
        if (result.pepDetails && result.pepDetails.length > 0) {
          result.pepDetails.forEach(p => {
            console.log(`     - ${p.name} - ${p.position}, ${p.country} (${p.category})`);
          });
        }
        
        console.log(`   - Adverse Media: ${result.adverseMedia ? '⚠️ YES' : '✅ NO'}`);
        if (result.adverseMediaSources && result.adverseMediaSources.length > 0) {
          result.adverseMediaSources.forEach(a => {
            console.log(`     - ${a.source}: ${a.title}`);
          });
        }
        
        console.log(`   - Overall Risk: ${result.overallRisk}`);
        console.log();
      } catch (error) {
        console.log(`   ❌ Error: ${error.message}\n`);
      }
    }

    // 4. Test fuzzy matching capabilities
    console.log('4️⃣ Testing fuzzy matching capabilities...');
    const nameVariations = [
      { search: 'Mohamed', target: 'Muhammad' },
      { search: 'John Smith', target: 'Jon Smyth' },
      { search: 'William Johnson', target: 'Bill Johnson' },
      { search: 'Jose Garcia', target: 'Joseph Garcia' }
    ];

    const { fuzzyMatcher } = amlScreeningService;
    for (const pair of nameVariations) {
      const result = fuzzyMatcher.match(pair.search, pair.target);
      console.log(`   "${pair.search}" vs "${pair.target}"`);
      console.log(`   - Match: ${result.isMatch ? 'YES' : 'NO'}`);
      console.log(`   - Score: ${result.score.toFixed(3)}`);
      console.log(`   - Type: ${result.matchType}`);
      console.log(`   - Confidence: ${result.confidence}\n`);
    }

    // 5. Test contextual matching
    console.log('5️⃣ Testing contextual matching...');
    const contextResult = fuzzyMatcher.contextualMatch(
      {
        name: 'John Smith',
        dateOfBirth: '1985-06-15',
        nationality: 'US',
        address: { country: 'US', city: 'New York' }
      },
      {
        name: 'Jon Smyth',
        dateOfBirth: '1985-06-15',
        nationality: 'US',
        address: { country: 'US', city: 'New York' }
      }
    );
    
    console.log('   Contextual match result:');
    console.log(`   - Name match score: ${contextResult.score.toFixed(3)}`);
    console.log(`   - Context bonus: ${contextResult.contextBonus.toFixed(3)}`);
    console.log(`   - Context matches: ${contextResult.contextMatches.join(', ')}`);
    console.log(`   - Final match: ${contextResult.isMatch ? 'YES' : 'NO'}\n`);

    // 6. Check consolidated watchlist
    console.log('6️⃣ Checking consolidated watchlist...');
    const consolidatedList = await watchlistDownloader.getConsolidatedList();
    console.log(`   Total entries: ${consolidatedList.length}`);
    
    const sourceCount = {};
    consolidatedList.forEach(entry => {
      sourceCount[entry.source] = (sourceCount[entry.source] || 0) + 1;
    });
    
    console.log('   Entries by source:');
    Object.entries(sourceCount).forEach(([source, count]) => {
      console.log(`   - ${source}: ${count}`);
    });

    console.log('\n✅ Enhanced AML screening test completed!');
    console.log('\n📌 Key features demonstrated:');
    console.log('   - Real watchlist data downloading');
    console.log('   - Advanced fuzzy name matching');
    console.log('   - PEP database integration');
    console.log('   - Contextual matching with additional data');
    console.log('   - Adverse media screening');
    console.log('   - Risk scoring and categorization');

  } catch (error) {
    console.error('❌ Test failed:', error);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

// Run the test
testEnhancedAMLScreening().catch(error => {
  console.error('❌ Unexpected error:', error);
  process.exit(1);
});