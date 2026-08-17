/**
 * Migration runner — run with `npm run migrate`.
 *
 * A "migration" is one numbered SQL file describing a change to the database.
 * This script looks at which ones have already been applied, and runs only
 * the new ones, in order.
 *
 * Why not just paste SQL into the Supabase dashboard? Because then the only
 * record of your database's shape is the database itself. With migrations,
 * the repository is the record: any database can be rebuilt from scratch by
 * replaying these files, and you can see in git history exactly when and why
 * each change happened.
 *
 * Two rules:
 *   1. Never edit a migration that has already been applied. Write a new one.
 *   2. Migration files run in filename order, so keep the numbering.
 */
import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { pool, closePool } from './index.js';

const migrationsDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'migrations'
);

/**
 * Bookkeeping table: which migrations have run, when, and what they contained.
 */
async function ensureMigrationsTable(client) {
  await client.query(`
    create table if not exists schema_migrations (
      filename    text primary key,
      checksum    text not null,
      applied_at  timestamptz not null default now()
    )
  `);

  // Same lockdown as every other table (see the note at the bottom of
  // 001_initial_schema.sql). Nothing sensitive lives here, but leaving one
  // table readable through Supabase's public API is untidy and Supabase's
  // dashboard will flag it as a security warning.
  await client.query('alter table schema_migrations enable row level security');
}

/**
 * A fingerprint of the file's contents. If an already-applied migration is
 * later edited, the fingerprint won't match what we recorded and we stop with
 * a loud error — because the database no longer matches the file, and any
 * other database built from these files would end up different.
 */
function checksum(contents) {
  return createHash('sha256').update(contents).digest('hex');
}

async function migrate() {
  const client = await pool.connect();

  try {
    await ensureMigrationsTable(client);

    const { rows: applied } = await client.query(
      'select filename, checksum from schema_migrations'
    );
    const appliedByName = new Map(applied.map((row) => [row.filename, row.checksum]));

    const files = (await readdir(migrationsDir))
      .filter((name) => name.endsWith('.sql'))
      .sort();

    if (files.length === 0) {
      console.log('No migration files found in', migrationsDir);
      return;
    }

    let ranAny = false;

    for (const filename of files) {
      const contents = await readFile(path.join(migrationsDir, filename), 'utf8');
      const hash = checksum(contents);
      const previousHash = appliedByName.get(filename);

      if (previousHash) {
        if (previousHash !== hash) {
          throw new Error(
            `Migration ${filename} has been modified since it was applied.\n` +
              `The database and this file no longer agree. Restore the original ` +
              `file and put your change in a new migration instead.`
          );
        }
        continue; // already applied, unchanged — skip
      }

      process.stdout.write(`Applying ${filename} ... `);

      // Each migration runs inside a transaction: if any statement in the
      // file fails, the whole file is undone. That prevents a half-applied
      // migration, which is a genuinely painful state to recover from.
      try {
        await client.query('begin');
        await client.query(contents);
        await client.query(
          'insert into schema_migrations (filename, checksum) values ($1, $2)',
          [filename, hash]
        );
        await client.query('commit');
        console.log('done');
        ranAny = true;
      } catch (err) {
        await client.query('rollback');
        console.log('FAILED');
        throw new Error(`Migration ${filename} failed: ${err.message}`);
      }
    }

    console.log(
      ranAny ? 'Migrations complete.' : 'Database already up to date — nothing to do.'
    );
  } finally {
    client.release();
  }
}

migrate()
  .then(async () => {
    await closePool();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('\nMigration error:', err.message);
    await closePool();
    process.exit(1);
  });
