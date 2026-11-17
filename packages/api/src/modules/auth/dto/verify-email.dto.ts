import { Transform } from 'class-transformer';
import { IsEmail, Matches, MaxLength } from 'class-validator';
import { normalizeEmail } from './sign-up.dto.js';

export class VerifyEmailDto {
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(254)
  email: string;

  /** The 6-digit code from the verification email. */
  @Matches(/^\d{6}$/, { message: 'code must be 6 digits' })
  code: string;
}

export class ResendVerificationDto {
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(254)
  email: string;
}
