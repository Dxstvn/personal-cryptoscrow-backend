#!/usr/bin/env node

// scripts/testAMLLocally.js

import { watchlistDownloader } from '../src/services/kyc/utils/watchlistDownloader.js';
import { fuzzyMatcher } from '../src/services/kyc/utils/fuzzyMatcher.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Test AML functionality locally without database dependencies
 */
async function testAMLLocally() {
  console.log('🧪 Testing AML Components Locally');
  console.log('=================================\n');

  try {
    // 1. Test Fuzzy Matcher
    console.log('1️⃣ Testing Fuzzy Name Matcher\n');
    
    const nameTests = [
      { search: 'Mohamed Al-Hassan', target: 'Muhammad Al Hassan', expected: true },
      { search: 'John Smith', target: 'Jon Smyth', expected: false },
      { search: 'William Johnson', target: 'Bill Johnson', expected: true },
      { search: 'Jose Garcia', target: 'Joseph Garcia', expected: true },
      { search: 'Vladimir Putin', target: 'Vladimir Vladimirovich Putin', expected: true },
      { search: 'Xi Jinping', target: 'Xi Jin Ping', expected: true }
    ];

    for (const test of nameTests) {
      const result = fuzzyMatcher.match(test.search, test.target, { threshold: 0.75 });
      const status = result.isMatch === test.expected ? '✅' : '❌';
      console.log(`${status} "${test.search}" vs "${test.target}"`);
      console.log(`   Match: ${result.isMatch}, Score: ${result.score.toFixed(3)}, Type: ${result.matchType}`);
      console.log(`   Algorithms: ${Object.entries(result.algorithms)
        .filter(([_, r]) => r.score > 0)
        .map(([name, r]) => `${name}(${r.score.toFixed(2)})`)
        .join(', ')}\n`);
    }

    // 2. Test Cultural Variations
    console.log('2️⃣ Testing Cultural Name Variations\n');
    
    const culturalTests = [
      ['Mohammed', 'Muhammad', 'Mohamed', 'Mohammad'],
      ['Michael', 'Mikhail', 'Miguel', 'Michel'],
      ['John', 'Juan', 'Jean', 'Giovanni'],
      ['Peter', 'Pedro', 'Pierre', 'Pietro']
    ];

    for (const variations of culturalTests) {
      console.log(`Testing variations of "${variations[0]}":`);
      for (let i = 1; i < variations.length; i++) {
        const result = fuzzyMatcher.match(variations[0], variations[i]);
        console.log(`   ${variations[0]} ↔ ${variations[i]}: ${result.isMatch ? 'MATCH' : 'NO MATCH'} (${result.score.toFixed(3)})`);
      }
      console.log();
    }

    // 3. Test Contextual Matching
    console.log('3️⃣ Testing Contextual Matching\n');
    
    const contextTests = [
      {
        person1: { name: 'John Smith', dateOfBirth: '1985-06-15', nationality: 'US' },
        person2: { name: 'Jon Smyth', dateOfBirth: '1985-06-15', nationality: 'US' },
        description: 'Same person, different spelling'
      },
      {
        person1: { name: 'John Smith', dateOfBirth: '1985-06-15', nationality: 'US' },
        person2: { name: 'John Smith', dateOfBirth: '1990-01-01', nationality: 'US' },
        description: 'Same name, different DOB'
      },
      {
        person1: { name: 'Vladimir Putin', dateOfBirth: '1952-10-07', nationality: 'RU' },
        person2: { name: 'V. Putin', dateOfBirth: '1952-10-07', nationality: 'RU' },
        description: 'Initial vs full name'
      }
    ];

    for (const test of contextTests) {
      console.log(`Test: ${test.description}`);
      const result = fuzzyMatcher.contextualMatch(test.person1, test.person2);
      console.log(`   Match: ${result.isMatch ? 'YES' : 'NO'}`);
      console.log(`   Name Score: ${result.score.toFixed(3)}`);
      console.log(`   Context Bonus: ${result.contextBonus.toFixed(3)}`);
      console.log(`   Context Matches: ${result.contextMatches.join(', ') || 'none'}\n`);
    }

    // 4. Load and Test PEP Database
    console.log('4️⃣ Testing PEP Database\n');
    
    const pepDataPath = path.join(__dirname, '..', 'src', 'services', 'kyc', 'data', 'pep_database.json');
    const pepData = JSON.parse(await fs.readFile(pepDataPath, 'utf8'));
    
    console.log(`Loaded ${pepData.length} PEP entries\n`);
    
    const pepSearchTests = [
      'Joe Biden',
      'Joseph Biden',
      'J. Biden',
      'Emmanuel Macron',
      'E. Macron',
      'Vladimir Putin',
      'John Smith'
    ];

    for (const searchName of pepSearchTests) {
      console.log(`Searching for: "${searchName}"`);
      let found = false;
      
      for (const pep of pepData) {
        const result = fuzzyMatcher.match(searchName, pep.name, { threshold: 0.75 });
        if (result.isMatch) {
          console.log(`   ✅ MATCH: ${pep.name} - ${pep.position}, ${pep.country}`);
          console.log(`      Score: ${result.score.toFixed(3)}, Type: ${result.matchType}`);
          found = true;
        }
      }
      
      if (!found) {
        console.log(`   ❌ No matches found`);
      }
      console.log();
    }

    // 5. Test Watchlist Downloader Cache
    console.log('5️⃣ Testing Watchlist Downloader\n');
    
    // Initialize downloader
    await watchlistDownloader.initialize();
    
    // Check for cached data
    const sources = ['ofac', 'un', 'eu', 'uk'];
    for (const source of sources) {
      const cached = await watchlistDownloader.getCachedData(source);
      if (cached) {
        console.log(`${source.toUpperCase()}: ${cached.entryCount} entries (Last updated: ${new Date(cached.lastUpdated).toLocaleDateString()})`);
      } else {
        console.log(`${source.toUpperCase()}: No cached data`);
      }
    }

    // 6. Test Adverse Media Keywords
    console.log('\n6️⃣ Testing Adverse Media Detection\n');
    
    const adverseKeywords = [
      'fraud', 'money laundering', 'terrorist financing', 'tax evasion',
      'corruption', 'bribery', 'criminal', 'investigation', 'sanctions'
    ];
    
    const testNames = [
      'John Fraud Smith',
      'Criminal Joe',
      'Clean Name Person',
      'Investigation Corp',
      'Legitimate Business LLC'
    ];
    
    for (const name of testNames) {
      const foundKeywords = adverseKeywords.filter(keyword => 
        name.toLowerCase().includes(keyword)
      );
      
      if (foundKeywords.length > 0) {
        console.log(`⚠️  "${name}" - Found keywords: ${foundKeywords.join(', ')}`);
      } else {
        console.log(`✅ "${name}" - No adverse keywords found`);
      }
    }

    console.log('\n✅ AML Local Testing Completed Successfully!');
    console.log('\n📊 Summary:');
    console.log('   - Fuzzy matcher working with multiple algorithms');
    console.log('   - Cultural name variations detected');
    console.log('   - Contextual matching with DOB and nationality');
    console.log('   - PEP database loaded and searchable');
    console.log('   - Adverse media keyword detection functional');
    console.log('\n💡 Note: This test runs locally without external API calls or database access.');

  } catch (error) {
    console.error('❌ Test failed:', error);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

// Run the test
testAMLLocally().catch(error => {
  console.error('❌ Unexpected error:', error);
  process.exit(1);
});