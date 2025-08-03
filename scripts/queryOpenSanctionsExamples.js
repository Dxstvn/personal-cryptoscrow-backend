#!/usr/bin/env node

// scripts/queryOpenSanctionsExamples.js

import { OpenSanctionsSQLiteService } from '../src/services/kyc/opensanctions/OpenSanctionsSQLiteService.js';

async function queryExamples() {
  console.log('🔍 Querying OpenSanctions Database for Example Individuals');
  console.log('========================================================\n');

  const service = new OpenSanctionsSQLiteService();
  
  try {
    await service.initialize();
    
    // Query for well-known sanctioned individuals
    const searchTerms = [
      'Vladimir Putin',
      'Kim Jong Un', 
      'Nicolas Maduro',
      'Bashar al-Assad',
      'Alexander Lukashenko',
      'Xi Jinping',
      'Sergey Lavrov',
      'Hassan Nasrallah',
      'Qasem Soleimani',
      'Viktor Yanukovych'
    ];
    
    console.log('📋 Searching for 10 well-known individuals:\n');
    
    let foundCount = 0;
    for (const name of searchTerms) {
      const results = await service.search(name, { limit: 1, threshold: 0.7 });
      
      if (results.length > 0) {
        foundCount++;
        const entity = results[0].entity;
        console.log(`${foundCount}. ${entity.name}`);
        console.log(`   - Type: ${entity.type}`);
        console.log(`   - Nationality: ${entity.nationality || 'N/A'}`);
        console.log(`   - Date of Birth: ${entity.dateOfBirth || 'N/A'}`);
        console.log(`   - Datasets: ${entity.datasets.join(', ')}`);
        console.log(`   - Entity ID: ${entity.id}`);
        console.log('');
      }
    }
    
    // Also query random sanctioned individuals
    console.log('\n📋 Additional random sanctioned individuals from various programs:\n');
    
    // Direct SQL query for random sanctioned individuals
    const randomQuery = service.db.prepare(`
      SELECT DISTINCT e.*, s.program, s.authority
      FROM opensanctions_entities e
      JOIN opensanctions_sanctions s ON e.id = s.entity_id
      WHERE e.type = 'individual' 
      AND s.program IS NOT NULL
      LIMIT 10
    `);
    
    const randomResults = randomQuery.all();
    
    randomResults.forEach((row, index) => {
      console.log(`${foundCount + index + 1}. ${row.name}`);
      console.log(`   - Sanctions Program: ${row.program || 'N/A'}`);
      console.log(`   - Authority: ${row.authority || 'N/A'}`);
      console.log(`   - Nationality: ${row.nationality || 'N/A'}`);
      console.log(`   - Date of Birth: ${row.date_of_birth || 'N/A'}`);
      console.log(`   - Entity ID: ${row.id}`);
      console.log('');
    });
    
    await service.close();
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

queryExamples();