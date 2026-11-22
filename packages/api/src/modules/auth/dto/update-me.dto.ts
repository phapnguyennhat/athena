import { IsTimeZone, MaxLength } from 'class-validator';

export class UpdateMeDto {
  /** IANA name, e.g. `Asia/Ho_Chi_Minh`. Only future learning days use it; past days keep their date. */
  @IsTimeZone()
  @MaxLength(64)
  timezone: string;
}
