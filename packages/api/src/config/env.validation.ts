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
  ValidateIf,
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

  /** `stub` needs no key (local/dev/tests); `gemini` calls the real API. Defaults to `stub` only outside production. */
  @IsIn(['gemini', 'stub'])
  AI_PROVIDER: 'gemini' | 'stub' = 'stub';

  @ValidateIf((o: EnvironmentVariables) => o.AI_PROVIDER === 'gemini')
  @IsString()
  @IsNotEmpty()
  GEMINI_API_KEY?: string;

  @IsString()
  @IsNotEmpty()
  GEMINI_MODEL: string = 'gemini-2.5-flash';

  @IsString()
  @IsNotEmpty()
  RABBITMQ_URL: string;
}

export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  const env = plainToInstance(EnvironmentVariables, config, { enableImplicitConversion: true });
  const messages = validateSync(env, { skipMissingProperties: false }).map((e) =>
    Object.values(e.constraints ?? {}).join(', '),
  );
  // The class default can't tell "unset" from "stub", so check the raw input.
  if (config.NODE_ENV === 'production' && !config.AI_PROVIDER)
    messages.push('AI_PROVIDER must be set explicitly in production');
  if (messages.length > 0) throw new Error(messages.join('\n'));
  return env;
}
