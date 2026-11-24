import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { validateEnv } from './env.validation.js';

const base = {
  POSTGRES_HOST: 'localhost',
  POSTGRES_PORT: '5432',
  POSTGRES_USER: 'u',
  POSTGRES_PASSWORD: 'p',
  POSTGRES_DB: 'db',
  REDIS_HOST: 'localhost',
  REDIS_PORT: '6379',
  JWT_SECRET: 'x'.repeat(32),
  SMTP_HOST: 'localhost',
  SMTP_PORT: '1025',
  MAIL_FROM: 'Athena <no-reply@example.com>',
  RABBITMQ_URL: 'amqp://u:p@localhost:5672',
  GEMINI_API_KEY: 'test-key',
  AWS_REGION: 'us-east-1',
  S3_BUCKET: 'athena',
  TYPESENSE_URL: 'http://localhost:8108',
  TYPESENSE_API_KEY: 'test-key',
};

describe('validateEnv', () => {
  it('requires GEMINI_API_KEY', () => {
    const { GEMINI_API_KEY: _omit, ...rest } = base;
    expect(() => validateEnv(rest)).toThrow(/GEMINI_API_KEY/);
  });

  it('requires TYPESENSE_URL and TYPESENSE_API_KEY', () => {
    const { TYPESENSE_URL: _u, TYPESENSE_API_KEY: _k, ...rest } = base;
    expect(() => validateEnv(rest)).toThrow(/TYPESENSE_URL[\s\S]*TYPESENSE_API_KEY/);
  });

  it('defaults GEMINI_MODEL to gemini-3.8-flash', () => {
    expect(validateEnv(base).GEMINI_MODEL).toBe('gemini-3.8-flash');
  });

  it('requires RABBITMQ_URL', () => {
    const { RABBITMQ_URL: _omit, ...rest } = base;
    expect(() => validateEnv(rest)).toThrow(/RABBITMQ_URL/);
  });
});
