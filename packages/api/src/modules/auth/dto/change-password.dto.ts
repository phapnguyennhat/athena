import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1024)
  currentPassword: string;

  /** Same rules as sign-up. */
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  newPassword: string;
}

export class DeleteAccountDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1024)
  password: string;
}
