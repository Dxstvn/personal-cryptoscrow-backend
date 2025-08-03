#!/usr/bin/env node

// scripts/findSanctionedIndividuals.js

import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function findSanctionedIndividuals() {
  console.log('🔍 Finding Sanctioned Individuals in OpenSanctions Database');
  console.log('=========================================================\n');
  
  const dbPath = join(__dirname, '../data/opensanctions.db');
  const db = new Database(dbPath, { readonly: true });
  
  try {
    // First, let's check what sanctions data we have
    const sanctionsCount = db.prepare('SELECT COUNT(*) as count FROM opensanctions_sanctions').get();
    console.log(`Total sanctions records: ${sanctionsCount.count}\n`);
    
    // Look for individuals from known sanctions programs
    const sanctionPrograms = [
      'us_ofac_sdn',      // US OFAC Specially Designated Nationals
      'eu_fsf',           // EU Financial Sanctions
      'gb_hmt_sanctions', // UK HM Treasury Sanctions
      'un_sc_sanctions',  // UN Security Council Sanctions
      'ca_dfatd_sema_sanctions', // Canada Sanctions
      'au_dfat_sanctions', // Australia Sanctions
      'jp_mof_sanctions',  // Japan Sanctions
      'ch_seco_sanctions', // Switzerland Sanctions
      'ua_nsdc_sanctions', // Ukraine Sanctions
      'ru_rupep'          // Russia PEPs
    ];
    
    // Query for individuals in sanctions datasets
    const query = db.prepare(`
      SELECT 
        e.id,
        e.name,
        e.nationality,
        e.date_of_birth,
        e.datasets,
        e.notes
      FROM opensanctions_entities e
      WHERE e.type = 'individual'
      AND (
        e.datasets LIKE '%ofac%' OR
        e.datasets LIKE '%sanction%' OR
        e.datasets LIKE '%eu_fsf%' OR
        e.datasets LIKE '%gb_hmt%' OR
        e.datasets LIKE '%un_sc%' OR
        e.datasets LIKE '%dfat%' OR
        e.datasets LIKE '%seco%' OR
        e.datasets LIKE '%tresor%'
      )
      AND e.name NOT LIKE '%Unknown%'
      AND LENGTH(e.name) > 5
      ORDER BY 
        CASE 
          WHEN e.datasets LIKE '%ofac%' THEN 1
          WHEN e.datasets LIKE '%eu_fsf%' THEN 2
          WHEN e.datasets LIKE '%gb_hmt%' THEN 3
          ELSE 4
        END,
        e.name
      LIMIT 10
    `);
    
    const results = query.all();
    
    console.log('Here are 10 sanctioned individuals from major sanctions programs:\n');
    
    results.forEach((person, index) => {
      console.log(`${index + 1}. ${person.name}`);
      console.log(`   Entity ID: ${person.id}`);
      console.log(`   Nationality: ${person.nationality || 'Not specified'}`);
      console.log(`   Date of Birth: ${person.date_of_birth || 'Not specified'}`);
      
      const datasets = person.datasets ? JSON.parse(person.datasets) : [];
      const sanctionDatasets = datasets.filter(ds => 
        ds.includes('sanction') || 
        ds.includes('ofac') || 
        ds.includes('fsf') ||
        ds.includes('hmt') ||
        ds.includes('seco') ||
        ds.includes('dfat')
      );
      
      console.log(`   Sanctions Programs: ${sanctionDatasets.join(', ')}`);
      
      if (person.notes) {
        const shortNotes = person.notes.substring(0, 100);
        console.log(`   Notes: ${shortNotes}${person.notes.length > 100 ? '...' : ''}`);
      }
      
      console.log('');
    });
    
    // Show statistics by sanctions program
    console.log('\n📊 Individuals by Sanctions Program:');
    
    const programStats = db.prepare(`
      SELECT 
        COUNT(CASE WHEN datasets LIKE '%us_ofac_sdn%' THEN 1 END) as us_ofac,
        COUNT(CASE WHEN datasets LIKE '%eu_fsf%' THEN 1 END) as eu_sanctions,
        COUNT(CASE WHEN datasets LIKE '%gb_hmt_sanctions%' THEN 1 END) as uk_sanctions,
        COUNT(CASE WHEN datasets LIKE '%un_sc%' THEN 1 END) as un_sanctions,
        COUNT(CASE WHEN datasets LIKE '%ca_dfatd%' THEN 1 END) as canada_sanctions
      FROM opensanctions_entities
      WHERE type = 'individual'
    `).get();
    
    console.log(`   - US OFAC SDN List: ${programStats.us_ofac.toLocaleString()} individuals`);
    console.log(`   - EU Financial Sanctions: ${programStats.eu_sanctions.toLocaleString()} individuals`);
    console.log(`   - UK HMT Sanctions: ${programStats.uk_sanctions.toLocaleString()} individuals`);
    console.log(`   - UN Security Council: ${programStats.un_sanctions.toLocaleString()} individuals`);
    console.log(`   - Canada Sanctions: ${programStats.canada_sanctions.toLocaleString()} individuals`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    db.close();
  }
}

findSanctionedIndividuals();