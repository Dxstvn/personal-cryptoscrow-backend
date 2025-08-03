#!/usr/bin/env node

// scripts/testOpenSanctions.js

import { openSanctionsDownloader } from '../src/services/kyc/utils/openSanctionsDownloader.js';
import { fuzzyMatcher } from '../src/services/kyc/utils/fuzzyMatcher.js';

/**
 * Test OpenSanctions data download and search
 */
async function testOpenSanctions() {
  console.log('🌐 Testing OpenSanctions Data Access');
  console.log('====================================\n');

  try {
    // 1. Initialize
    console.log('1️⃣ Initializing OpenSanctions downloader...');
    await openSanctionsDownloader.initialize();
    console.log('✅ Initialized\n');

    // 2. Check dataset info
    console.log('2️⃣ Checking available datasets...');
    const datasetInfo = await openSanctionsDownloader.getDatasetInfo();
    
    console.log('Available datasets:');
    for (const [key, info] of Object.entries(datasetInfo)) {
      console.log(`\n${key}:`);
      console.log(`  - Name: ${info.name}`);
      console.log(`  - Description: ${info.description}`);
      console.log(`  - Exists locally: ${info.exists ? 'Yes' : 'No'}`);
      
      if (info.exists) {
        console.log(`  - Last updated: ${new Date(info.lastUpdated).toLocaleDateString()}`);
        console.log(`  - Size: ${(info.size / 1024 / 1024).toFixed(2)} MB`);
        if (info.summary) {
          console.log(`  - Total entities: ${info.summary.total}`);
          console.log(`  - Persons: ${info.summary.persons}`);
          console.log(`  - Organizations: ${info.summary.entities}`);
          console.log(`  - PEPs: ${info.summary.peps}`);
          console.log(`  - Sanctions: ${info.summary.sanctions}`);
        }
      }
    }

    // 3. Download if needed
    console.log('\n3️⃣ Checking if download is needed...');
    const needsUpdate = await openSanctionsDownloader.needsUpdate('default');
    
    if (needsUpdate) {
      console.log('📥 Downloading latest OpenSanctions data...');
      console.log('⚠️  Note: This may take a few minutes (file is ~100+ MB)\n');
      
      try {
        const summary = await openSanctionsDownloader.downloadDataset('default');
        console.log('\n✅ Download complete!');
        if (summary) {
          console.log('Dataset summary:', summary);
        }
      } catch (error) {
        console.log('❌ Download failed:', error.message);
        console.log('   This might be due to network restrictions or changed URLs.');
        console.log('   You can manually download from: https://www.opensanctions.org/datasets/');
      }
    } else {
      console.log('✅ Local data is up to date\n');
    }

    // 4. Test search functionality (if data exists)
    const defaultDataset = datasetInfo.default;
    if (defaultDataset && defaultDataset.exists) {
      console.log('4️⃣ Testing search functionality...\n');
      
      const testSearches = [
        'Vladimir Putin',
        'Joe Biden',
        'Xi Jinping',
        'Kim Jong Un',
        'Osama bin Laden',
        'Pablo Escobar',
        'John Smith'
      ];

      // Use streaming search functionality
      console.log('Using streaming search to handle large dataset...\n');

      for (const searchName of testSearches) {
        console.log(`🔍 Searching for: "${searchName}"`);
        
        try {
          const results = await openSanctionsDownloader.searchEntities(searchName, {
            threshold: 0.75,
            maxResults: 10
          });
          
          if (results.length > 0) {
            console.log(`  ✅ Found ${results.length} matches:\n`);
            
            // Show top 3 results
            const topResults = results.slice(0, 3);
            for (const result of topResults) {
              console.log(`  Match: ${result.entity.name}`);
              console.log(`    Type: ${result.entity.type}`);
              console.log(`    Match Type: ${result.matchType}`);
              console.log(`    Score: ${result.matchScore.toFixed(3)}`);
              console.log(`    Datasets: ${result.entity.datasets.join(', ')}`);
              if (result.entity.nationality) console.log(`    Nationality: ${result.entity.nationality}`);
              if (result.entity.dateOfBirth) console.log(`    DOB: ${result.entity.dateOfBirth}`);
              if (result.matchType === 'alias' && result.matchedAlias) {
                console.log(`    Matched Alias: ${result.matchedAlias}`);
              }
              if (result.entity.sanctions?.programs?.length > 0) {
                console.log(`    Sanctions Programs: ${result.entity.sanctions.programs.join(', ')}`);
              }
              console.log();
            }
          } else {
            console.log(`  ❌ No matches found`);
          }
        } catch (error) {
          console.log(`  ❌ Search error: ${error.message}`);
        }
        console.log();
      }
    } else {
      console.log('⚠️  No data available for search testing');
      console.log('   Run the script again to download data');
    }

    // 5. Show free data sources info
    console.log('\n5️⃣ Other Free Data Sources Available:\n');
    
    console.log('📊 Sanctions Lists:');
    console.log('  • US OFAC: https://sanctionssearch.ofac.treas.gov/');
    console.log('  • UN: https://www.un.org/securitycouncil/content/un-sc-consolidated-list');
    console.log('  • EU: https://www.sanctionsmap.eu/');
    console.log('  • UK: https://www.gov.uk/government/publications/financial-sanctions-consolidated-list-of-targets');
    console.log('  • Canada: https://www.international.gc.ca/world-monde/sanctions/consolidated-consolide.aspx');
    console.log('  • Australia: https://www.dfat.gov.au/international-relations/security/sanctions/consolidated-list');
    
    console.log('\n👤 PEP Sources:');
    console.log('  • CIA World Leaders: https://www.cia.gov/resources/world-leaders/');
    console.log('  • Every Politician: https://everypolitician.org/');
    console.log('  • Wikidata: https://www.wikidata.org/');
    
    console.log('\n🔄 Aggregators:');
    console.log('  • OpenSanctions: https://www.opensanctions.org/ (Best free option)');
    console.log('  • ICIJ Offshore Leaks: https://offshoreleaks.icij.org/');

    console.log('\n✅ OpenSanctions test completed!');
    console.log('\n💡 Tips:');
    console.log('  - OpenSanctions aggregates data from 200+ sources');
    console.log('  - It includes sanctions, PEPs, and criminal watchlists');
    console.log('  - Data is updated daily');
    console.log('  - Free for non-commercial use');
    console.log('  - API available for real-time queries');

  } catch (error) {
    console.error('❌ Test failed:', error);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

// Run the test
testOpenSanctions().catch(error => {
  console.error('❌ Unexpected error:', error);
  process.exit(1);
});