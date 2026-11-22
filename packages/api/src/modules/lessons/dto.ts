import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  Max,
  Min,
} from 'class-validator';

export class SubmitAttemptDto {
  /** Selected option index per question, in question order. */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(8)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(3, { each: true })
  answers: number[];
}
