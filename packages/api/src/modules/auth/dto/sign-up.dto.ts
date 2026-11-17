import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsISO8601,
  IsString,
  IsTimeZone,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export const normalizeEmail = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class SignUpDto {
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(254)
  email: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;

  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  fullName: string;

  /** Calendar date, `YYYY-MM-DD`. */
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'dateOfBirth must be a date in YYYY-MM-DD format' })
  @IsISO8601({ strict: true })
  dateOfBirth: string;

  /** IANA time zone, e.g. `Asia/Ho_Chi_Minh`. */
  @IsString()
  @IsTimeZone()
  @MaxLength(64)
  timezone: string;
}
