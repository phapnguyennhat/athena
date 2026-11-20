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
};

describe('validateEnv', () => {
  it('requires GEMINI_API_KEY when AI_PROVIDER is gemini', () => {
    expect(() => validateEnv({ ...base, AI_PROVIDER: 'gemini' })).toThrow(/GEMINI_API_KEY/);
  });

  it('defaults AI_PROVIDER to stub and GEMINI_MODEL to gemini-2.5-flash', () => {
    const env = validateEnv(base);
    expect(env.AI_PROVIDER).toBe('stub');
    expect(env.GEMINI_MODEL).toBe('gemini-2.5-flash');
  });

  it('requires AI_PROVIDER to be set explicitly in production', () => {
    expect(() => validateEnv({ ...base, NODE_ENV: 'production' })).toThrow(/AI_PROVIDER/);
    expect(validateEnv({ ...base, NODE_ENV: 'production', AI_PROVIDER: 'stub' }).AI_PROVIDER).toBe('stub');
  });

  it('requires RABBITMQ_URL', () => {
    const { RABBITMQ_URL: _omit, ...rest } = base;
    expect(() => validateEnv(rest)).toThrow(/RABBITMQ_URL/);
  });
});
