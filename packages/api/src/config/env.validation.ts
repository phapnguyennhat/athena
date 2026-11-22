import { plainToInstance, Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

export class EnvironmentVariables {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT?: number;

  @IsString()
  @IsNotEmpty()
  POSTGRES_HOST: string;

  @IsInt()
  POSTGRES_PORT: number;

  @IsString()
  @IsNotEmpty()
  POSTGRES_USER: string;

  @IsString()
  POSTGRES_PASSWORD: string;

  @IsString()
  @IsNotEmpty()
  POSTGRES_DB: string;

  @IsString()
  @IsNotEmpty()
  REDIS_HOST: string;

  @IsInt()
  REDIS_PORT: number;

  @IsOptional()
  @IsString()
  REDIS_PASSWORD?: string;

  // HS256 needs a key at least as long as its 32-byte hash.
  @IsString()
  @MinLength(32)
  JWT_SECRET: string;

  @IsOptional()
  @IsIn(['development', 'production', 'test'])
  NODE_ENV?: 'development' | 'production' | 'test';

  // SMTP: Mailpit locally (localhost:1025, no auth); the provider's server in production.
  @IsString()
  @IsNotEmpty()
  SMTP_HOST: string;

  @IsInt()
  SMTP_PORT: number;

  /** `true` for implicit TLS (port 465). With `false`, production still requires STARTTLS. */
  @Transform(({ obj }: { obj: Record<string, unknown> }) => obj.SMTP_SECURE === 'true' || obj.SMTP_SECURE === true)
  @IsBoolean()
  SMTP_SECURE: boolean = false;

  @IsOptional()
  @IsString()
  SMTP_USER?: string;

  @IsOptional()
  @IsString()
  SMTP_PASSWORD?: string;

  /** Sender, e.g. `Athena <no-reply@example.com>`. */
  @IsString()
  @IsNotEmpty()
  MAIL_FROM: string;

  /** Server-side only; never sent to the client. */
  @IsString()
  @IsNotEmpty()
  GEMINI_API_KEY: string;

  @IsString()
  @IsNotEmpty()
  GEMINI_MODEL: string = 'gemini-3.8-flash';

  @IsString()
  @IsNotEmpty()
  RABBITMQ_URL: string;

  /** YouTube Data API v3 key, server-side only. Unset: lessons offer a YouTube search link instead of videos. */
  @IsOptional()
  @IsString()
  YOUTUBE_API_KEY?: string;

  /** S3 bucket for user uploads (avatars). Credentials: AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY. */
  @IsString()
  @IsNotEmpty()
  AWS_REGION: string;

  @IsString()
  @IsNotEmpty()
  S3_BUCKET: string;

  /** LocalStack locally (`http://localhost:4566`); unset for AWS S3. */
  @IsOptional()
  @IsString()
  S3_ENDPOINT?: string;
}

export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  const env = plainToInstance(EnvironmentVariables, config, { enableImplicitConversion: true });
  const messages = validateSync(env, { skipMissingProperties: false }).map((e) =>
    Object.values(e.constraints ?? {}).join(', '),
  );
  if (messages.length > 0) throw new Error(messages.join('\n'));
  return env;
}
