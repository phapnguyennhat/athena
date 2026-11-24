// Rebuilds the Typesense collection of community courses from Postgres (first deploy, or after lost messages).
// Run from dist/: `pnpm search:reindex`.
import { existsSync } from 'node:fs';
import { DataSource } from 'typeorm';
import { databaseOptions } from '../database/database.options.js';
import { SearchIndexService } from '../modules/search/search-index.service.js';
import { typesenseClient } from '../modules/search/search.constants.js';

if (existsSync('.env')) process.loadEnvFile('.env');
const { TYPESENSE_URL, TYPESENSE_API_KEY } = process.env;
if (!TYPESENSE_URL || !TYPESENSE_API_KEY) throw new Error('TYPESENSE_URL and TYPESENSE_API_KEY must be set');

const ds = await new DataSource({ ...databaseOptions(process.env), migrations: [] }).initialize();
try {
  // No publisher: reindexAll never queues messages.
  const search = new SearchIndexService(ds, typesenseClient(TYPESENSE_URL, TYPESENSE_API_KEY), null as never);
  console.log(`indexed ${await search.reindexAll()} public path(s)`);
} finally {
  await ds.destroy();
}
