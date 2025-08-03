#!/usr/bin/env node

// scripts/showOpenSanctionsExamples.js

import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function showExamples() {
  console.log('📋 10 Example Individuals from OpenSanctions Database');
  console.log('===================================================\n');
  
  const dbPath = join(__dirname, '../data/opensanctions.db');
  const db = new Database(dbPath, { readonly: true });
  
  try {
    // Query for sanctioned individuals with sanctions information
    const query = db.prepare(`
      SELECT DISTINCT 
        e.id,
        e.name,
        e.type,
        e.nationality,
        e.date_of_birth,
        e.datasets,
        s.program,
        s.authority,
        s.reason
      FROM opensanctions_entities e
      LEFT JOIN opensanctions_sanctions s ON e.id = s.entity_id
      WHERE e.type = 'individual'
      AND e.name NOT LIKE '%Unknown%'
      AND e.name IS NOT NULL
      AND LENGTH(e.name) > 5
      ORDER BY 
        CASE 
          WHEN s.program IS NOT NULL THEN 0 
          ELSE 1 
        END,
        e.name
      LIMIT 10
    `);
    
    const results = query.all();
    
    console.log('Here are 10 example individuals from the OpenSanctions database:\n');
    
    results.forEach((person, index) => {
      console.log(`${index + 1}. ${person.name}`);
      console.log(`   Entity ID: ${person.id}`);
      console.log(`   Nationality: ${person.nationality || 'Not specified'}`);
      console.log(`   Date of Birth: ${person.date_of_birth || 'Not specified'}`);
      
      const datasets = person.datasets ? JSON.parse(person.datasets) : [];
      console.log(`   Data Sources: ${datasets.length > 0 ? datasets.join(', ') : 'Not specified'}`);
      
      if (person.program) {
        console.log(`   Sanctions Program: ${person.program}`);
        console.log(`   Sanctions Authority: ${person.authority || 'Not specified'}`);
        if (person.reason) {
          console.log(`   Reason: ${person.reason.substring(0, 100)}${person.reason.length > 100 ? '...' : ''}`);
        }
      }
      
      console.log('');
    });
    
    // Show some statistics
    const stats = db.prepare(`
      SELECT 
        COUNT(DISTINCT e.id) as sanctioned_individuals
      FROM opensanctions_entities e
      JOIN opensanctions_sanctions s ON e.id = s.entity_id
      WHERE e.type = 'individual'
    `).get();
    
    console.log(`\n📊 Total sanctioned individuals in database: ${stats.sanctioned_individuals.toLocaleString()}`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    db.close();
  }
}

showExamples();