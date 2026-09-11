/**
 * Apply PostgreSQL schema to Neon database using pg driver.
 * This script reads schema.sql and executes it against the DATABASE_URL.
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

require('dotenv').config();

async function applySchema() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL not set in .env');
    process.exit(1);
  }

  console.log('🔌 Connecting to Neon database...');

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
  });

  try {
    // Read schema file
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');

    // Execute the entire schema as one block (handles CREATE TABLE IF NOT EXISTS properly)
    console.log('📋 Applying schema...');
    await pool.query(schema);

    console.log('✅ Schema applied successfully to Neon database!');
  } catch (err) {
    console.error('❌ Failed to apply schema:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

applySchema();