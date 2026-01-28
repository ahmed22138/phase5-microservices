import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';

const { Pool } = pg;

interface MigrationConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

async function runMigrations(): Promise<void> {
  const config: MigrationConfig = {
    host: process.env.DB_HOST ?? 'localhost',
    port: parseInt(process.env.DB_PORT ?? '5434', 10),
    database: process.env.DB_NAME ?? 'recurrence_db',
    user: process.env.DB_USER ?? 'recurrence_user',
    password: process.env.DB_PASSWORD ?? 'recurrence_password',
  };

  const pool = new Pool(config);

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const { rows: appliedMigrations } = await pool.query<{ filename: string }>(
      'SELECT filename FROM schema_migrations ORDER BY id'
    );
    const appliedSet = new Set(appliedMigrations.map((m) => m.filename));

    const migrationFiles = readdirSync(__dirname)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    for (const filename of migrationFiles) {
      if (appliedSet.has(filename)) {
        console.log(`Skipping already applied migration: ${filename}`);
        continue;
      }

      console.log(`Applying migration: ${filename}`);
      const sql = readFileSync(join(__dirname, filename), 'utf-8');

      await pool.query('BEGIN');
      try {
        await pool.query(sql);
        await pool.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [filename]);
        await pool.query('COMMIT');
        console.log(`Successfully applied: ${filename}`);
      } catch (error) {
        await pool.query('ROLLBACK');
        console.error(`Failed to apply migration ${filename}:`, error);
        throw error;
      }
    }

    console.log('All migrations completed successfully');
  } finally {
    await pool.end();
  }
}

runMigrations().catch((error: unknown) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
