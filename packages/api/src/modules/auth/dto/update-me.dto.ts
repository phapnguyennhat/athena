import { PartialType, PickType } from '@nestjs/swagger';
import { SignUpDto } from './sign-up.dto.js';

/**
 * Any of the profile fields, with sign-up's rules. `timezone` (IANA name) is synced from the device; only future
 * learning days use it, past days keep their date.
 */
export class UpdateMeDto extends PartialType(PickType(SignUpDto, ['fullName', 'dateOfBirth', 'timezone'] as const)) {}
