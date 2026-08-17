/**
 * The database connection.
 *
 * We use a "connection pool": rather than opening a new connection to
 * Postgres for every request (slow, and Supabase caps how many you may have),
 * the pool keeps a small set open and hands them out as needed.
 *
 * Note we talk to Postgres directly rather than through the Supabase
 * JavaScript client. Supabase's client is built for browsers and is awkward
 * for the kind of query the scheduling engine needs in phase 5 — "find posts
 * that are due, claim them so no other process grabs the same ones". That's
 * plain SQL. We'll still use the Supabase client for file storage later,
 * where it genuinely is the better tool.
 */
import pg from 'pg';

import { config } from '../config.js';

const { Pool } = pg;

// Postgres returns some types as strings by default to avoid losing precision.
// `bigint` (used by file_size_bytes) is one of them. Our sizes are far below
// the point where precision is at risk, so parse them into real numbers —
// otherwise you get "1024" instead of 1024 and comparisons behave oddly.
pg.types.setTypeParser(pg.types.builtins.INT8, (value) => parseInt(value, 10));

export const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: config.databaseSsl,
  // Supabase's pooler allows a limited number of connections. Keeping our
  // ceiling modest leaves room for migrations and the Supabase dashboard.
  max: 10,
  // Drop connections idle for 30s so we don't hold Supabase slots overnight.
  idleTimeoutMillis: 30_000,
  // Fail fast if the database is unreachable rather than hanging a request.
  connectionTimeoutMillis: 10_000,
});

// A connection can die in the background (network blip, Supabase restart).
// Without this listener Node treats that as an unhandled error and takes the
// whole process down. The pool discards the bad connection by itself; we just
// need to notice and log it.
pool.on('error', (err) => {
  console.error('Unexpected database pool error:', err.message);
});

/**
 * Run a SQL query.
 *
 * Always pass values as the second argument rather than building the SQL
 * string yourself:
 *
 *   GOOD:  query('select * from posts where id = $1', [postId])
 *   BAD:   query(`select * from posts where id = '${postId}'`)
 *
 * The good version sends the value separately from the SQL, so Postgres
 * treats it strictly as data. The bad version lets a crafted value change
 * the meaning of the query — that's SQL injection, and it's the single most
 * common way databases get breached.
 */
export function query(text, params) {
  return pool.query(text, params);
}

/**
 * Run several statements as one all-or-nothing unit.
 *
 * Example: publishing a post updates post_targets AND posts. If the second
 * update fails, we do not want the first one to stick — that would leave the
 * data describing something that never happened. Wrapping both in a
 * transaction means either both apply or neither does.
 */
export async function transaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const result = await callback(client);
    await client.query('commit');
    return result;
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    // Returns the connection to the pool. Must happen even if things failed,
    // or the pool slowly runs out of connections and the app freezes.
    client.release();
  }
}

/**
 * Cheap "is the database actually reachable?" check, used by /health.
 */
export async function ping() {
  const started = Date.now();
  await pool.query('select 1');
  return Date.now() - started;
}

export async function closePool() {
  await pool.end();
}
