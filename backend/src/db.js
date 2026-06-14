import pg from 'pg';

const { Pool } = pg;

function poolConfig() {
  const connectionString = process.env.DATABASE_URL;
  const config = { connectionString };

  const sslRequested = process.env.DATABASE_SSL === 'true'
    || /neon\.tech|sslmode=require/i.test(connectionString || '');

  if (sslRequested && process.env.DATABASE_SSL !== 'false') {
    config.ssl = { rejectUnauthorized: false };
  }

  return config;
}

export const pool = new Pool(poolConfig());

export async function query(text, params) {
  return pool.query(text, params);
}

export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
