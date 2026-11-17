import type { DataSourceOptions } from 'typeorm';

// Shared by the app (TypeOrmModule) and the migration CLI (data-source.ts).
export function databaseOptions(env: Record<string, string | number | undefined>): DataSourceOptions {
  return {
    type: 'postgres',
    host: String(env.POSTGRES_HOST),
    port: Number(env.POSTGRES_PORT),
    username: String(env.POSTGRES_USER),
    password: String(env.POSTGRES_PASSWORD),
    database: String(env.POSTGRES_DB),
    migrations: [`${import.meta.dirname}/migrations/*.js`],
    // Schema changes go through migrations only.
    synchronize: false,
  };
}
