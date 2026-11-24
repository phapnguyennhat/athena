// The suites run against the dev database: drop their `<suite>-<uuid>@example.com` accounts afterwards so fixture
// courses don't surface as community courses in the app. Every user FK cascades. Typesense keeps stale docs until
// `pnpm search:reindex`; the API ignores ids it can't find in Postgres.
import { existsSync } from 'node:fs';
import { DataSource } from 'typeorm';
import { databaseOptions } from '../src/database/database.options.js';

export async function teardown() {
  if (existsSync('.env')) process.loadEnvFile('.env');
  const ds = await new DataSource({ ...databaseOptions(process.env), migrations: [] }).initialize();
  try {
    await ds.query(`DELETE FROM users WHERE email LIKE '%@example.com'`);
  } finally {
    await ds.destroy();
  }
}
