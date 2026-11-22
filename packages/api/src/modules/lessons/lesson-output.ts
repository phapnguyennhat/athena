import 'reflect-metadata';
import { plainToInstance, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  validateSync,
  ValidateNested,
} from 'class-validator';
import { AiError } from '../learning-paths/ai-output.js';
import type { Level } from '../learning-paths/dto/learning-path.dto.js';

export type LessonInput = {
  language: string;
  level?: Level;
  goal?: string;
  pathTitle: string;
  moduleTitle: string;
  lessonTitle: string;
  previousLesson?: string;
  nextLesson?: string;
};
export type LessonContent = {
  intro: string;
  sections: { heading: string; body: string; example?: string }[];
  takeaways: string[];
  practice?: string;
};
export type LessonOutput = LessonContent & { keywords: string[] };

export type QuizInput = {
  language: string;
  level?: Level;
  lessonTitle: string;
  content: LessonContent;
};
/** `answer` is the index of the single correct option; it never leaves the server before grading. */
export type QuizQuestion = {
  prompt: string;
  options: string[];
  answer: number;
  explanation: string;
};
export type QuizOutput = { questions: QuizQuestion[] };

const invalid = () => new AiError('AI_INVALID_OUTPUT', false);

class SectionOut {
  @IsString() @IsNotEmpty() @MaxLength(120) heading: string;
  @IsString() @IsNotEmpty() @MaxLength(2000) body: string;
  @IsOptional() @IsString() @MaxLength(1200) example?: string;
}
class LessonOutDto {
  @IsString() @IsNotEmpty() @MaxLength(800) intro: string;
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(6)
  @ValidateNested({ each: true })
  @Type(() => SectionOut)
  sections: SectionOut[];
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(6)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(240, { each: true })
  takeaways: string[];
  @IsOptional() @IsString() @MaxLength(600) practice?: string;
  @IsArray()
  @ArrayMaxSize(3)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(80, { each: true })
  keywords: string[];
}

class QuestionOut {
  @IsString() @IsNotEmpty() @MaxLength(400) prompt: string;
  @IsArray()
  @ArrayMinSize(3)
  @ArrayMaxSize(4)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(200, { each: true })
  options: string[];
  @IsInt() @Min(0) answer: number;
  @IsString() @IsNotEmpty() @MaxLength(600) explanation: string;
}
class QuizOutDto {
  @IsArray()
  @ArrayMinSize(3)
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => QuestionOut)
  questions: QuestionOut[];
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
// Links in generated text would be unverified resources (PROJECT_SPEC §5.4).
const hasUrl = (s: string) => /https?:\/\/|www\./i.test(s);

export function validateLessonOutput(raw: unknown): LessonOutput {
  if (!isObject(raw)) throw invalid();
  const dto = plainToInstance(LessonOutDto, raw);
  if (validateSync(dto, { whitelist: true }).length) throw invalid();
  const sections = dto.sections.map((s) => ({
    heading: s.heading,
    body: s.body,
    ...(s.example?.trim() ? { example: s.example } : {}),
  }));
  const texts = [
    dto.intro,
    dto.practice ?? '',
    ...dto.takeaways,
    ...sections.flatMap((s) => [s.heading, s.body, s.example ?? '']),
  ];
  if (texts.some(hasUrl)) throw invalid();
  return {
    intro: dto.intro,
    sections,
    takeaways: dto.takeaways,
    ...(dto.practice?.trim() ? { practice: dto.practice } : {}),
    keywords: dto.keywords,
  };
}

/** Rejects a quiz with an out-of-range answer or options that are not distinct (PROJECT_SPEC §5.5). */
export function validateQuizOutput(raw: unknown): QuizOutput {
  if (!isObject(raw)) throw invalid();
  const dto = plainToInstance(QuizOutDto, raw);
  if (validateSync(dto, { whitelist: true }).length) throw invalid();
  for (const q of dto.questions) {
    if (q.answer >= q.options.length) throw invalid();
    if (
      new Set(q.options.map((o) => o.trim().toLowerCase())).size !==
      q.options.length
    )
      throw invalid();
  }
  return {
    questions: dto.questions.map(
      ({ prompt, options, answer, explanation }) => ({
        prompt,
        options,
        answer,
        explanation,
      }),
    ),
  };
}
