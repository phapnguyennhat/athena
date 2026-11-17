// Entry point for the TypeORM CLI (migration:run / revert / generate), run from dist/.
import { existsSync } from 'node:fs';
import { DataSource } from 'typeorm';
import { databaseOptions } from './database.options.js';

if (existsSync('.env')) process.loadEnvFile('.env');

export default new DataSource({
  ...databaseOptions(process.env),
  entities: [`${import.meta.dirname}/../modules/**/*.entity.js`],
});
