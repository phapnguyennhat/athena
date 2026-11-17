import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { databaseOptions } from './database.options.js';
import type { EnvironmentVariables } from '../config/env.validation.js';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>) => ({
        ...databaseOptions({
          POSTGRES_HOST: config.get('POSTGRES_HOST', { infer: true }),
          POSTGRES_PORT: config.get('POSTGRES_PORT', { infer: true }),
          POSTGRES_USER: config.get('POSTGRES_USER', { infer: true }),
          POSTGRES_PASSWORD: config.get('POSTGRES_PASSWORD', { infer: true }),
          POSTGRES_DB: config.get('POSTGRES_DB', { infer: true }),
        }),
        autoLoadEntities: true,
      }),
    }),
  ],
})
export class DatabaseModule {}
