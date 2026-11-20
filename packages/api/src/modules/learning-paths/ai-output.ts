import 'reflect-metadata';
import { plainToInstance, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsString,
  MaxLength,
  validateSync,
  ValidateNested,
} from 'class-validator';
import { PreferencesDto, type Preferences } from './dto/learning-path.dto.js';

export type ChatTurnInput = {
  history: { role: 'user' | 'assistant'; content: string }[];
  preferences: Preferences;
};
export type ChatOutput = {
  reply: string;
  quickReplies: string[];
  preferences: Preferences;
  ready: boolean;
  offTopic: boolean;
};
export type PathOutput = {
  title: string;
  summary: string;
  modules: { title: string; lessons: { title: string }[] }[];
};

export class AiError extends Error {
  constructor(
    readonly code: 'AI_UNAVAILABLE' | 'AI_INVALID_OUTPUT' | 'TOPIC_REJECTED',
    readonly transient: boolean,
  ) {
    super(code);
  }
}

const invalid = () => new AiError('AI_INVALID_OUTPUT', false);

class ChatOutputDto {
  @IsString() @IsNotEmpty() @MaxLength(600) reply: string;
  @IsArray()
  @ArrayMaxSize(4)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(40, { each: true })
  quickReplies: string[];
  @IsBoolean() ready: boolean;
  @IsBoolean() offTopic: boolean;
}

class LessonOut {
  @IsString() @IsNotEmpty() @MaxLength(120) title: string;
}
class ModuleOut {
  @IsString() @IsNotEmpty() @MaxLength(120) title: string;
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(6)
  @ValidateNested({ each: true })
  @Type(() => LessonOut)
  lessons: LessonOut[];
}
class PathOutDto {
  @IsString() @IsNotEmpty() @MaxLength(120) title: string;
  @IsString() @IsNotEmpty() @MaxLength(400) summary: string;
  @IsArray()
  @ArrayMinSize(3)
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => ModuleOut)
  modules: ModuleOut[];
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

export function validateChatOutput(raw: unknown): ChatOutput {
  if (!isObject(raw)) throw invalid();
  const { preferences: rawPrefs, ...rest } = raw;
  const dto = plainToInstance(ChatOutputDto, rest);
  if (validateSync(dto, { whitelist: true }).length) throw invalid();

  // A bad preference field is dropped alone; the turn still counts.
  const prefs = plainToInstance(PreferencesDto, isObject(rawPrefs) ? rawPrefs : {});
  for (const e of validateSync(prefs, { whitelist: true }))
    delete (prefs as Record<string, unknown>)[e.property];
  return {
    reply: dto.reply,
    quickReplies: dto.quickReplies,
    ready: dto.ready,
    offTopic: dto.offTopic,
    preferences: { ...prefs },
  };
}

export function validatePathOutput(raw: unknown): PathOutput {
  if (isObject(raw) && raw.rejected === true)
    throw new AiError('TOPIC_REJECTED', false);
  const dto = plainToInstance(PathOutDto, raw);
  if (!isObject(raw) || validateSync(dto, { whitelist: true }).length)
    throw invalid();
  return {
    title: dto.title,
    summary: dto.summary,
    modules: dto.modules.map((m) => ({
      title: m.title,
      lessons: m.lessons.map((l) => ({ title: l.title })),
    })),
  };
}

/** The model's `ready` is advisory: the server also requires every mandatory field. */
export const serverReady = (out: ChatOutput): boolean =>
  out.ready &&
  !!out.preferences.topic &&
  !!out.preferences.level &&
  !!out.preferences.dailyMinutes;
