#!/usr/bin/env node

// scripts/importOpenSanctionsToSQLite.js

import { OpenSanctionsSQLiteService } from '../src/services/kyc/opensanctions/OpenSanctionsSQLiteService.js';
import { OpenSanctionsDownloader } from '../src/services/kyc/utils/openSanctionsDownloader.js';
import { createReadStream } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Import OpenSanctions data into SQLite database
 */
async function importOpenSanctionsData() {
  console.log('🚀 OpenSanctions SQLite Importer');
  console.log('=================================\n');

  const downloader = new OpenSanctionsDownloader();
  const sqliteService = new OpenSanctionsSQLiteService({
    dbPath: join(__dirname, '../data/opensanctions.db')
  });

  try {
    // Initialize services
    console.log('1️⃣ Initializing services...');
    await downloader.initialize();
    await sqliteService.initialize();
    console.log('   ✅ Services initialized\n');

    // Check if data exists
    const stats = await sqliteService.getStatistics();
    if (stats.total > 0) {
      console.log(`   ℹ️  Database already contains ${stats.total} entities`);
      console.log('   ⚠️  To reimport, delete data/opensanctions.db first\n');
      
      const answer = await new Promise(resolve => {
        process.stdout.write('   Continue with import? This will update existing data. (y/N): ');
        process.stdin.once('data', data => {
          resolve(data.toString().trim().toLowerCase());
        });
      });
      
      if (answer !== 'y') {
        console.log('   Import cancelled');
        process.exit(0);
      }
    }

    // Check if dataset needs downloading
    console.log('2️⃣ Checking OpenSanctions dataset...');
    const needsUpdate = await downloader.needsUpdate('default');
    
    if (needsUpdate) {
      console.log('   📥 Downloading latest dataset (this may take a while)...');
      await downloader.downloadDataset('default');
      console.log('   ✅ Dataset downloaded\n');
    } else {
      console.log('   ✅ Dataset is up to date\n');
    }

    // Get dataset path
    const datasetPath = join(downloader.dataDir, downloader.datasets.default.file);
    console.log(`3️⃣ Importing data from: ${datasetPath}`);
    console.log('   This will take several minutes...\n');

    // Import data using streaming
    const startTime = Date.now();
    let processed = 0;
    let imported = 0;
    let errors = 0;

    // Start transaction for better performance
    sqliteService.db.exec('BEGIN TRANSACTION');

    // Clear existing aliases and identifiers (entities will be updated)
    sqliteService.db.exec('DELETE FROM opensanctions_aliases');
    sqliteService.db.exec('DELETE FROM opensanctions_identifiers');
    sqliteService.db.exec('DELETE FROM opensanctions_addresses');
    sqliteService.db.exec('DELETE FROM opensanctions_sanctions');

    // Stream and process the file
    const stream = createReadStream(datasetPath);
    const rl = readline.createInterface({
      input: stream,
      crlfDelay: Infinity
    });

    const transformEntity = (entity) => {
      const properties = entity.properties || {};
      
      return {
        id: entity.id,
        schema: entity.schema,
        name: properties.name?.[0] || 'Unknown',
        type: entity.schema?.includes('Person') ? 'individual' : 
              entity.schema?.includes('Vessel') ? 'vessel' :
              entity.schema?.includes('Aircraft') ? 'aircraft' : 'entity',
        nationality: properties.nationality?.[0],
        dateOfBirth: properties.birthDate?.[0],
        placeOfBirth: properties.birthPlace?.[0],
        gender: properties.gender?.[0],
        identifiers: {
          passport: properties.passport,
          nationalId: properties.idNumber,
          taxId: properties.taxNumber,
          registrationNumber: properties.registrationNumber
        },
        aliases: [
          ...(properties.alias || []),
          ...(properties.weakAlias || []),
          ...(properties.previousName || [])
        ].filter(Boolean),
        notes: properties.notes?.[0],
        lastSeen: entity.last_seen,
        datasets: entity.datasets || [],
        score: entity.score || 0
      };
    };

    console.log('   Processing entities...');
    
    for await (const line of rl) {
      if (line.trim()) {
        try {
          const entity = JSON.parse(line);
          const transformed = transformEntity(entity);
          
          // Import entity
          sqliteService.importEntity(transformed);
          
          imported++;
          processed++;
          
          // Progress update every 1000 entities
          if (processed % 1000 === 0) {
            process.stdout.write(`\r   📊 Processed: ${processed.toLocaleString()} entities (${imported.toLocaleString()} imported)`);
          }
        } catch (error) {
          errors++;
          if (errors < 10) {
            console.error(`\n   ❌ Error processing entity: ${error.message}`);
          }
        }
      }
    }

    // Commit transaction
    sqliteService.db.exec('COMMIT');

    const duration = Date.now() - startTime;
    console.log(`\n\n   ✅ Import completed in ${(duration / 1000).toFixed(1)} seconds`);
    console.log(`   📊 Statistics:`);
    console.log(`      - Total processed: ${processed.toLocaleString()}`);
    console.log(`      - Successfully imported: ${imported.toLocaleString()}`);
    console.log(`      - Errors: ${errors.toLocaleString()}`);

    // Get final statistics
    console.log('\n4️⃣ Verifying import...');
    const finalStats = await sqliteService.getStatistics();
    console.log('   📋 Database contents:');
    console.log(`      - Total entities: ${finalStats.total.toLocaleString()}`);
    console.log(`      - Individuals: ${finalStats.individuals.toLocaleString()}`);
    console.log(`      - Organizations: ${finalStats.entities.toLocaleString()}`);
    console.log(`      - Vessels: ${finalStats.vessels.toLocaleString()}`);
    console.log(`      - Aircraft: ${finalStats.aircraft.toLocaleString()}`);

    // Test search
    console.log('\n5️⃣ Testing search functionality...');
    const testSearch = await sqliteService.search('Vladimir Putin', { limit: 3 });
    console.log(`   🔍 Test search for "Vladimir Putin": ${testSearch.length} results`);
    
    if (testSearch.length > 0) {
      console.log(`   ✅ Top result: ${testSearch[0].entity.name} (Score: ${testSearch[0].finalScore.toFixed(3)})`);
    }

    // Close connections
    await sqliteService.close();
    
    console.log('\n✅ OpenSanctions SQLite import completed successfully!');
    console.log('\n📝 Next steps:');
    console.log('   1. Test the service: npm run opensanctions:test');
    console.log('   2. Use in development with OpenSanctionsSQLiteService');
    console.log('   3. The database is at: data/opensanctions.db');

  } catch (error) {
    console.error('\n❌ Import failed:', error);
    
    // Rollback on error
    try {
      sqliteService.db.exec('ROLLBACK');
    } catch (e) {
      // Ignore rollback errors
    }
    
    await sqliteService.close();
    process.exit(1);
  }

  process.exit(0);
}

// Run the import
importOpenSanctionsData().catch(error => {
  console.error('❌ Unexpected error:', error);
  process.exit(1);
});