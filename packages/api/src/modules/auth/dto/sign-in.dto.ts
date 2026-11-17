import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { normalizeEmail } from './sign-up.dto.js';

export class SignInDto {
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(254)
  email: string;

  // No length rule beyond a cap: rules can change after accounts exist.
  @IsString()
  @IsNotEmpty()
  @MaxLength(1024)
  password: string;
}
