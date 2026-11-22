// One-off: LLM-categorize active paths that have no category. Run from dist/: `pnpm backfill:categories`.
import { existsSync } from 'node:fs';
import { GoogleGenAI } from '@google/genai';
import { DataSource } from 'typeorm';
import { databaseOptions } from '../database/database.options.js';
import { backfillCategories } from '../modules/learning-paths/backfill-categories.js';
import { GeminiPathAi } from '../modules/learning-paths/gemini-path-ai.js';

if (existsSync('.env')) process.loadEnvFile('.env');
if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not set');

const ds = await new DataSource({ ...databaseOptions(process.env), migrations: [] }).initialize();
try {
  const ai = new GeminiPathAi(
    new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }),
    process.env.GEMINI_MODEL ?? 'gemini-3.8-flash',
  );
  const result = await backfillCategories(ds, ai);
  console.log(result);
  process.exitCode = result.failed ? 1 : 0;
} finally {
  await ds.destroy();
}
