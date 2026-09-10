/**
 * PostgreSQL Connection Pool Manager
 * Manages database connections using 'pg' for production environments.
 */

const { Pool } = require('pg');

try { require('dotenv').config(); } catch (_) {}

let pool = null;

function getPool() {
  if (pool) return pool;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is required for PostgreSQL connection.');
  }

  pool = new Pool({
    connectionString,
    ssl: process.env.PGSSLMODE === 'require' || process.env.NODE_ENV === 'production'
      ? { rejectUnauthorized: true } // Security: Validate SSL certificate in production
      : false,
    max: Number(process.env.PG_POOL_SIZE) || 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  pool.on('error', (err) => {
    console.error('[postgres] Unexpected error on idle client', err);
  });

  return pool;
}

/**
 * Execute a parameterized query against the PostgreSQL database.
 * @param {string} text - SQL query with $1, $2, etc. placeholders
 * @param {Array} params - Array of parameter values
 */
async function query(text, params) {
  const clientPool = getPool();
  const start = Date.now();
  try {
    const res = await clientPool.query(text, params);
    const duration = Date.now() - start;
    if (process.env.NODE_ENV !== 'production') {
      // Log slow queries (> 500ms)
      if (duration > 500) {
        console.warn('[postgres] Slow query:', { text, duration, rows: res.rowCount });
      }
    }
    return res;
  } catch (err) {
    console.error('[postgres] Query error:', { text, error: err.message });
    throw err;
  }
}

/**
 * Get a dedicated client from the pool for transactions.
 */
async function getClient() {
  const clientPool = getPool();
  return await clientPool.connect();
}

module.exports = { getPool, query, getClient };
