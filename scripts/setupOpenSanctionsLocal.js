#!/usr/bin/env node

// scripts/setupOpenSanctionsLocal.js

import pg from 'pg';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Setup OpenSanctions database locally
 * This script creates the database and runs the SQL setup
 */
async function setupOpenSanctionsDB() {
  console.log('🚀 Setting up OpenSanctions Database');
  console.log('=====================================\n');

  // First connect to postgres database to create opensanctions database
  const adminClient = new pg.Client({
    host: 'localhost',
    port: 5432,
    database: 'postgres',
    user: process.env.PGUSER || process.env.USER,
    password: process.env.PGPASSWORD || ''
  });

  try {
    // Connect as admin
    console.log('1️⃣ Connecting to PostgreSQL...');
    await adminClient.connect();
    console.log('   ✅ Connected to PostgreSQL\n');

    // Check if database exists
    const dbCheckResult = await adminClient.query(
      "SELECT 1 FROM pg_database WHERE datname = 'opensanctions'"
    );

    if (dbCheckResult.rows.length === 0) {
      // Create database
      console.log('2️⃣ Creating opensanctions database...');
      await adminClient.query('CREATE DATABASE opensanctions');
      console.log('   ✅ Database created\n');
    } else {
      console.log('2️⃣ Database already exists, continuing...\n');
    }

    await adminClient.end();

    // Now connect to opensanctions database and run setup
    const client = new pg.Client({
      host: 'localhost',
      port: 5432,
      database: 'opensanctions',
      user: process.env.PGUSER || process.env.USER,
      password: process.env.PGPASSWORD || ''
    });

    await client.connect();
    console.log('3️⃣ Connected to opensanctions database\n');

    // Read and execute SQL setup script
    console.log('4️⃣ Running database setup script...');
    const sqlPath = join(__dirname, 'setupOpenSanctionsDB.sql');
    const sqlContent = readFileSync(sqlPath, 'utf8');

    // Split by semicolons but not within strings
    const statements = sqlContent
      .split(/;(?=(?:[^']*'[^']*')*[^']*$)/)
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    let successCount = 0;
    let errorCount = 0;

    for (const statement of statements) {
      try {
        await client.query(statement);
        successCount++;
      } catch (error) {
        if (error.code === '42P07') { // duplicate_table
          // Table already exists, that's fine
          successCount++;
        } else if (error.code === '42710') { // duplicate_object
          // Index already exists, that's fine
          successCount++;
        } else {
          console.error(`   ❌ Error executing statement: ${error.message}`);
          console.error(`      Statement: ${statement.substring(0, 50)}...`);
          errorCount++;
        }
      }
    }

    console.log(`   ✅ Executed ${successCount} SQL statements successfully`);
    if (errorCount > 0) {
      console.log(`   ⚠️  ${errorCount} statements had errors (may be expected)`);
    }
    console.log('');

    // Verify tables were created
    console.log('5️⃣ Verifying database setup...');
    const tableCheck = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name LIKE 'opensanctions_%'
      ORDER BY table_name
    `);

    console.log('   📋 Created tables:');
    for (const row of tableCheck.rows) {
      console.log(`      - ${row.table_name}`);
    }

    // Check extensions
    const extCheck = await client.query(`
      SELECT extname, extversion 
      FROM pg_extension 
      WHERE extname IN ('pg_trgm', 'btree_gin')
    `);

    console.log('\n   🔧 Enabled extensions:');
    for (const row of extCheck.rows) {
      console.log(`      - ${row.extname} v${row.extversion}`);
    }

    await client.end();

    console.log('\n✅ OpenSanctions database setup completed successfully!');
    console.log('\n📝 Next Steps:');
    console.log('   1. Start Redis server: redis-server');
    console.log('   2. Import OpenSanctions data: npm run opensanctions:import');
    console.log('   3. Test the setup: npm run opensanctions:test');

  } catch (error) {
    console.error('\n❌ Setup failed:', error.message);
    
    if (error.code === 'ECONNREFUSED') {
      console.log('\n💡 Make sure PostgreSQL is running:');
      console.log('   - macOS: brew services start postgresql@15');
      console.log('   - Linux: sudo systemctl start postgresql');
    } else if (error.code === '28P01') { // invalid_password
      console.log('\n💡 Authentication failed. Try:');
      console.log('   - Set PGPASSWORD environment variable');
      console.log('   - Update pg_hba.conf to trust local connections');
    }

    process.exit(1);
  }
}

// Run the setup
setupOpenSanctionsDB().catch(error => {
  console.error('❌ Unexpected error:', error);
  process.exit(1);
});